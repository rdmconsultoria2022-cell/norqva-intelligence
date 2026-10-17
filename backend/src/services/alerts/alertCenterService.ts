import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0095 (D-0095): central de pendências. Lê a mesma tabela ad_alerts (alertas de anúncio e do vigia)
// e devolve cada alerta com título, gravidade, campanha, ação recomendada e estado.
// - Sino = alertas que ESTA pessoa ainda não leu (ad_alert_reads).
// - Pendências = problemas abertos (gravidade Atenção ou Crítica, não resolvidos nem descartados).
// - Ler não resolve nada. Resolver só com evidência (reconcile) ou descartando de propósito.

export type Severity = 'INFO' | 'ATTENTION' | 'CRITICAL';
export type AlertState = 'NOVA' | 'VISUALIZADA' | 'EM_TRATAMENTO' | 'RESOLVIDA' | 'DESCARTADA';

export class AlertCenterError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface RuleInfo {
  title: string;
  severity: Severity;
  action: string;
  // aba da campanha que resolve: resultados (pausar, ver anúncios) ou teto
  tab: 'results' | 'cap';
}

const RULES: Record<string, RuleInfo> = {
  SPEND_WITHOUT_SALE: { title: 'Anúncio gastando sem vender', severity: 'CRITICAL', action: 'Pausar o anúncio ou trocar o criativo.', tab: 'results' },
  EXPERIMENT_CAP_80: { title: 'Campanha em 80% do teto', severity: 'INFO', action: 'Acompanhar. Se estiver vendendo, considere subir o teto.', tab: 'cap' },
  EXPERIMENT_CAP_90: { title: 'Campanha em 90% do teto', severity: 'ATTENTION', action: 'Decidir agora: subir o teto ou deixar a campanha pausar no limite.', tab: 'cap' },
  EXPERIMENT_CAP_100: { title: 'Teto da campanha atingido', severity: 'ATTENTION', action: 'Decidir: subir o teto para continuar ou encerrar a campanha.', tab: 'cap' },
  EXPERIMENT_CAP_PAUSED: { title: 'Campanha pausada no teto', severity: 'ATTENTION', action: 'Decidir: subir o teto para continuar ou encerrar a campanha.', tab: 'cap' },
  EXPERIMENT_GUARD_PAUSE_FAILED: { title: 'O vigia não conseguiu pausar', severity: 'CRITICAL', action: 'Pausar a campanha manualmente agora.', tab: 'results' },
  EXPERIMENT_GUARD_READ_FAILED: { title: 'O vigia não consegue ler o gasto', severity: 'CRITICAL', action: 'Conferir o gasto na Meta e pausar se estiver perto do teto.', tab: 'cap' },
  EXPERIMENT_CAP_EXTENDED_PROFIT: { title: 'Teto ampliado por lucro', severity: 'INFO', action: 'Nenhuma ação: a campanha está dando lucro.', tab: 'cap' }
};

export function describeRule(rule: string): RuleInfo {
  return RULES[rule] || { title: 'Alerta da campanha', severity: 'ATTENTION', action: 'Abrir a campanha e conferir.', tab: 'results' };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isGuardRule = (rule: string) => rule.startsWith('EXPERIMENT_');
const CENTER_DAYS = 30;

export class AlertCenterService {
  constructor(private pool: Pool) {}

  /**
   * Resolve com evidência os alertas do vigia que não se resolvem sozinhos (os de anúncio já se
   * resolvem em AdAlertService.evaluate). Só alertas reais; nada é apagado.
   */
  async reconcile(): Promise<number> {
    const open = await this.pool.query(
      `SELECT a.id, a.rule_code, a.meta_campaign_id, a.ad_name,
              p.status AS plan_status, p.guard_state, p.guard_read_failures, p.spent_brl_last, p.max_spend_brl,
              mc.status AS campaign_status
       FROM ad_alerts a
       LEFT JOIN launch_plans p ON p.code = a.ad_name
       LEFT JOIN meta_campaigns mc ON mc.meta_campaign_id = a.meta_campaign_id AND mc.is_demo = FALSE
       WHERE a.is_demo = FALSE AND a.status IN ('OPEN', 'ACKNOWLEDGED') AND a.dismissed_at IS NULL AND a.rule_code LIKE 'EXPERIMENT_%'`
    );
    let n = 0;
    for (const a of open.rows) {
      const resolution = guardResolution(a);
      if (!resolution) continue;
      const r = await this.pool.query(
        `UPDATE ad_alerts SET status = 'RESOLVED', resolution = $2, resolved_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status IN ('OPEN', 'ACKNOWLEDGED')`,
        [a.id, resolution]
      );
      if (r.rowCount) {
        n += r.rowCount;
        await writeAuditLog(this.pool, null, 'AD_ALERT_AUTO_RESOLVED', `Alerta resolvido com evidência: ${describeRule(a.rule_code).title} (${a.ad_name || a.meta_campaign_id})`, null, resolution);
      }
    }
    return n;
  }

  async center(userId: string, isDemo: boolean) {
    if (!isDemo) {
      try {
        await this.reconcile();
      } catch (err) {
        console.error('[ALERT CENTER] reconcile falhou; segue com o que está gravado', err);
      }
    }
    const r = await this.pool.query(
      `SELECT a.*, (rd.user_id IS NOT NULL) AS read_by_me
       FROM ad_alerts a
       LEFT JOIN ad_alert_reads rd ON rd.alert_id = a.id AND rd.user_id = $2
       WHERE a.is_demo = $1
         AND (a.status IN ('OPEN', 'ACKNOWLEDGED') AND a.dismissed_at IS NULL
              OR a.created_at >= NOW() - INTERVAL '${CENTER_DAYS} days'
              OR a.resolved_at >= NOW() - INTERVAL '${CENTER_DAYS} days')
       ORDER BY (a.status IN ('OPEN', 'ACKNOWLEDGED') AND a.dismissed_at IS NULL) DESC, a.created_at DESC
       LIMIT 200`,
      [isDemo, UUID_RE.test(userId) ? userId : null]
    );

    // Duplicados: o mesmo problema aberto (regra + objeto) aparece uma vez só, o mais recente.
    const seen = new Set<string>();
    const items: any[] = [];
    for (const row of r.rows) {
      const item = shape(row);
      if (item.is_open) {
        const key = `${row.rule_code}|${row.meta_ad_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      items.push(item);
    }
    return {
      notifications: items,
      unread_count: items.filter((i) => !i.read && i.state !== 'DESCARTADA').length,
      open_problems_count: items.filter((i) => i.is_problem && i.is_open).length
    };
  }

  private async getAlert(id: string, isDemo: boolean) {
    if (!UUID_RE.test(String(id || ''))) throw new AlertCenterError(404, 'Alerta não encontrado.');
    const r = await this.pool.query(`SELECT * FROM ad_alerts WHERE id = $1 AND is_demo = $2`, [id, isDemo]);
    if (r.rows.length === 0) throw new AlertCenterError(404, 'Alerta não encontrado.');
    return r.rows[0];
  }

  async markRead(userId: string, ids: string[] | 'all', isDemo: boolean) {
    if (!UUID_RE.test(userId)) return { marked: 0 };
    const known = await this.pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (known.rows.length === 0) return { marked: 0 };
    const r =
      ids === 'all'
        ? await this.pool.query(
            `INSERT INTO ad_alert_reads (alert_id, user_id)
             SELECT id, $1 FROM ad_alerts WHERE is_demo = $2
             ON CONFLICT (alert_id, user_id) DO NOTHING`,
            [userId, isDemo]
          )
        : await this.pool.query(
            `INSERT INTO ad_alert_reads (alert_id, user_id)
             SELECT id, $1 FROM ad_alerts WHERE is_demo = $2 AND id = ANY($3::uuid[])
             ON CONFLICT (alert_id, user_id) DO NOTHING`,
            [userId, isDemo, ids.filter((x) => UUID_RE.test(x))]
          );
    return { marked: r.rowCount || 0 };
  }

  async setInProgress(userId: string, id: string, isDemo: boolean) {
    const a = await this.getAlert(id, isDemo);
    if (a.status === 'RESOLVED' || a.dismissed_at) throw new AlertCenterError(409, 'Este alerta já foi encerrado.');
    if (a.in_progress_at) return shape({ ...a, read_by_me: true });
    // vale também para os duplicados abertos do mesmo problema (mesma regra e objeto)
    await this.pool.query(
      `UPDATE ad_alerts SET in_progress_at = NOW(), in_progress_by = $2, updated_at = NOW()
       WHERE (id = $1 OR (rule_code = $3 AND meta_ad_id = $4 AND is_demo = $5 AND status IN ('OPEN', 'ACKNOWLEDGED') AND dismissed_at IS NULL)) AND in_progress_at IS NULL`,
      [a.id, UUID_RE.test(userId) ? userId : null, a.rule_code, a.meta_ad_id, isDemo]
    );
    await writeAuditLog(this.pool, userId || null, 'AD_ALERT_IN_PROGRESS', `Alerta em tratamento: ${describeRule(a.rule_code).title} (${a.campaign_name || a.ad_name || a.meta_ad_id})`, null, a.id, isDemo);
    return shape({ ...a, in_progress_at: new Date(), read_by_me: true });
  }

  async dismiss(userId: string, id: string, reason: unknown, isDemo: boolean) {
    const a = await this.getAlert(id, isDemo);
    if (a.status === 'RESOLVED' || a.dismissed_at) throw new AlertCenterError(409, 'Este alerta já foi encerrado.');
    const why = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
    const info = describeRule(a.rule_code);
    if (info.severity === 'CRITICAL' && why.length < 5) {
      throw new AlertCenterError(400, 'Alerta crítico: escreva em poucas palavras por que está descartando.');
    }
    // vale também para os duplicados abertos do mesmo problema (mesma regra e objeto)
    await this.pool.query(
      `UPDATE ad_alerts SET dismissed_at = NOW(), dismissed_by = $2, dismiss_reason = $3, updated_at = NOW()
       WHERE (id = $1 OR (rule_code = $4 AND meta_ad_id = $5 AND is_demo = $6 AND status IN ('OPEN', 'ACKNOWLEDGED'))) AND dismissed_at IS NULL`,
      [a.id, UUID_RE.test(userId) ? userId : null, why || null, a.rule_code, a.meta_ad_id, isDemo]
    );
    await writeAuditLog(this.pool, userId || null, 'AD_ALERT_DISMISSED', `Alerta descartado: ${info.title} (${a.campaign_name || a.ad_name || a.meta_ad_id})`, null, why || null, isDemo);
    return shape({ ...a, dismissed_at: new Date(), dismiss_reason: why || null, read_by_me: true });
  }
}

/** Evidência de que o problema do vigia acabou. null = continua aberto. */
export function guardResolution(a: {
  rule_code: string;
  plan_status?: string | null;
  guard_state?: string | null;
  guard_read_failures?: number | string | null;
  spent_brl_last?: number | string | null;
  max_spend_brl?: number | string | null;
  campaign_status?: string | null;
}): string | null {
  const rule = String(a.rule_code);
  if (!isGuardRule(rule)) return null;
  if (a.plan_status && ['REJECTED', 'FAILED'].includes(String(a.plan_status))) return 'PLAN_CLOSED';
  const capped = String(a.guard_state || '') === 'CAPPED';
  const spent = a.spent_brl_last === null || a.spent_brl_last === undefined ? null : Number(a.spent_brl_last);
  const cap = a.max_spend_brl === null || a.max_spend_brl === undefined ? null : Number(a.max_spend_brl);
  switch (rule) {
    case 'EXPERIMENT_CAP_80':
    case 'EXPERIMENT_CAP_90': {
      if (capped) return 'SUPERSEDED_BY_CAP';
      const pct = rule === 'EXPERIMENT_CAP_80' ? 0.8 : 0.9;
      if (spent !== null && cap && spent < cap * pct) return 'CAP_RAISED';
      return null;
    }
    case 'EXPERIMENT_CAP_100':
    case 'EXPERIMENT_CAP_PAUSED':
      // continua aberto enquanto o plano estiver parado no teto; some quando o teto sobe
      return a.guard_state !== undefined && a.guard_state !== null && !capped && spent !== null && cap !== null && spent < cap ? 'CAP_RAISED' : null;
    case 'EXPERIMENT_GUARD_READ_FAILED':
      if (a.guard_read_failures !== undefined && a.guard_read_failures !== null && Number(a.guard_read_failures) === 0) return 'READ_RECOVERED';
      // a pausa preventiva do vigia (teto) ou uma pausa manual encerra o risco
      return capped || String(a.campaign_status || '').toUpperCase() === 'PAUSED' ? 'CAMPAIGN_PAUSED' : null;
    case 'EXPERIMENT_GUARD_PAUSE_FAILED':
      return String(a.campaign_status || '').toUpperCase() === 'PAUSED' || capped ? 'CAMPAIGN_PAUSED' : null;
    default:
      return null;
  }
}

function shape(row: any) {
  const info = describeRule(String(row.rule_code));
  const resolved = row.status === 'RESOLVED';
  const dismissed = !!row.dismissed_at;
  const state: AlertState = dismissed
    ? 'DESCARTADA'
    : resolved
      ? 'RESOLVIDA'
      : row.in_progress_at
        ? 'EM_TRATAMENTO'
        : row.read_by_me
          ? 'VISUALIZADA'
          : 'NOVA';
  const guard = isGuardRule(String(row.rule_code));
  const campaignId = row.meta_campaign_id ? String(row.meta_campaign_id) : guard ? String(row.meta_ad_id) : null;
  return {
    id: row.id,
    rule_code: row.rule_code,
    title: info.title,
    description: row.message,
    severity: info.severity,
    recommended_action: info.action,
    state,
    read: !!row.read_by_me,
    is_problem: info.severity !== 'INFO',
    is_open: !resolved && !dismissed,
    entity: {
      type: guard ? 'CAMPAIGN' : 'AD',
      meta_campaign_id: campaignId,
      campaign_name: row.campaign_name || null,
      meta_ad_id: guard ? null : String(row.meta_ad_id),
      ad_name: guard ? null : row.ad_name || null,
      plan_code: guard ? row.ad_name || null : null
    },
    link: { tab: info.tab, meta_campaign_id: campaignId, plan_code: guard ? row.ad_name || null : null },
    resolution: row.resolution || null,
    dismiss_reason: row.dismiss_reason || null,
    created_at: row.created_at,
    resolved_at: row.resolved_at || null
  };
}
