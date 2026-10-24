import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { StatusPill, brl, int, multiple } from '../../components/ui/premium';
import { AlertCard, type AlertNotification } from '../alerts/AlertCenter';
import { MetaControlDialog, useMetaControl, type MetaControlPendingAction } from '../acquisition/MetaControl';

// NORQVA-0096 (D-0096): "Gerenciar campanha". Peças novas da tela da campanha:
// - PauseBar: Pausar sempre à vista no topo (o mesmo controle confirmado de Resultados).
// - CampaignOverview: números, equilíbrio da oferta, margem estimada e pendências da campanha.
// - CampaignHistory: o que aconteceu (alterações, decisões, falhas), do mais novo ao mais antigo.

type Api = (url: string, options?: RequestInit) => Promise<any>;

export interface CampaignMetrics {
  spend: number;
  revenue: number;
  sales: number;
  cpa: number | null;
  roas: number | null;
}

interface Economics {
  price: number;
  net_per_sale: number;
  breakeven_cpa: number | null;
  breakeven_roas: number | null;
  estimated: boolean;
}

/** Pausar (ou reativar) a campanha na Meta, sempre visível. Só administrador; o servidor confere tudo de novo. */
export function PauseBar({
  metaCampaign,
  allowResume = false,
  currentUser,
  apiFetch,
  showError,
  showSuccess,
  onDone
}: {
  metaCampaign: { meta_campaign_id: string; name: string; status?: string | null; effective_status?: string | null } | null;
  /** reativar só aparece para plano já aprovado (Sim) e fora do teto; o servidor confere de novo */
  allowResume?: boolean;
  currentUser: any;
  apiFetch: Api;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onDone: () => void;
}) {
  // NORQVA-0097: Performance também pausa (reativar vira pedido ao administrador)
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PERFORMANCE';
  const { status } = useMetaControl({ apiFetch: apiFetch as any, currentUser, isDemoView: false, enabled: isAdmin && !!metaCampaign });
  const [action, setAction] = useState<MetaControlPendingAction | null>(null);
  if (!isAdmin || !metaCampaign) return null;
  const running = String(metaCampaign.status || '').toUpperCase() === 'ACTIVE';
  if (!running && !allowResume) return null;
  const target = { entityType: 'campaign' as const, id: String(metaCampaign.meta_campaign_id), name: metaCampaign.name, status: metaCampaign.status };
  return (
    <>
      {running ? (
        <button
          type="button"
          data-testid="pause-campaign"
          onClick={() => setAction({ kind: 'status', target, next: 'PAUSED' })}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-nq-critical/15 text-nq-critical-text text-[14px] font-semibold"
        >
          <Pause aria-hidden="true" className="h-4 w-4" /> Pausar campanha
        </button>
      ) : (
        <button
          type="button"
          data-testid="resume-campaign"
          onClick={() => setAction({ kind: 'status', target, next: 'ACTIVE' })}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-[14px] font-semibold"
        >
          <Play aria-hidden="true" className="h-4 w-4" /> Reativar
        </button>
      )}
      <MetaControlDialog
        action={action}
        status={status}
        isDemoView={false}
        currentUser={currentUser}
        apiFetch={apiFetch as any}
        scopeCampaign={String(metaCampaign.meta_campaign_id)}
        onClose={() => setAction(null)}
        onDone={(m) => {
          setAction(null);
          showSuccess(m);
          onDone();
        }}
        onError={(m) => {
          setAction(null);
          showError(m);
        }}
      />
    </>
  );
}

export function CampaignOverview({
  campaign,
  metrics,
  problems,
  metaStatusLabel,
  canAct,
  apiFetch,
  showError,
  onOpenAlert,
  onAlertChanged
}: {
  campaign: any;
  metrics: CampaignMetrics | null;
  problems: AlertNotification[];
  metaStatusLabel: string | null;
  canAct: boolean;
  apiFetch: Api;
  showError: (m: string) => void;
  onOpenAlert: (n: AlertNotification) => void;
  onAlertChanged: (n: AlertNotification) => void;
}) {
  const [eco, setEco] = useState<Economics | null>(null);
  const [ecoLoaded, setEcoLoaded] = useState(false);

  useEffect(() => {
    let off = false;
    setEcoLoaded(false);
    apiFetch(`/campaigns/${campaign.id}/economics?mode=real`)
      .then((r) => {
        if (!off) setEco(r?.economics || null);
      })
      .catch(() => {
        if (!off) setEco(null);
      })
      .finally(() => {
        if (!off) setEcoLoaded(true);
      });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  const m = metrics;
  // margem estimada: vendas × valor líquido por venda − investido (sem custos fixos)
  const margin = m && eco ? Math.round((m.sales * eco.net_per_sale - m.spend) * 100) / 100 : null;
  const roasTone = m?.roas === null || m?.roas === undefined || !eco?.breakeven_roas ? 'text-nq-text' : m.roas > eco.breakeven_roas ? 'text-nq-positive-text' : 'text-nq-critical-text';

  return (
    <div className="space-y-4" data-testid="overview-tab">
      <section className="rounded-2xl bg-nq-surface p-4 space-y-3" aria-label="Situação">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-nq-muted">
          <span>Na Meta: <span className="text-nq-text">{metaStatusLabel || 'ainda não criada'}</span></span>
          <span className="tabular-nums">Orçamento: <span className="text-nq-text">{brl(Number(campaign.daily_budget_brl))}/dia</span></span>
          <span className="tabular-nums">Teto: <span className="text-nq-text">{brl(Number(campaign.max_spend_brl))}</span></span>
          {campaign.spent_checked_at && (
            <span>Última leitura do gasto: <span className="text-nq-text">{new Date(campaign.spent_checked_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></span>
          )}
        </div>
        {m ? (
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[12px] leading-4">
            <div><dt className="text-nq-muted">Investido</dt><dd className="mt-0.5 text-[15px] text-nq-text tabular-nums">{brl(m.spend)}</dd></div>
            <div><dt className="text-nq-muted">Receita</dt><dd className="mt-0.5 text-[15px] text-nq-text tabular-nums">{brl(m.revenue)}</dd></div>
            <div><dt className="text-nq-muted">Vendas</dt><dd className="mt-0.5 text-[15px] text-nq-text tabular-nums">{int(m.sales)}</dd></div>
            <div><dt className="text-nq-muted">CPA</dt><dd className="mt-0.5 text-[15px] text-nq-text tabular-nums">{m.cpa === null ? '—' : brl(m.cpa)}</dd></div>
            <div><dt className="text-nq-muted">ROAS</dt><dd className={`mt-0.5 text-[15px] font-semibold tabular-nums ${roasTone}`}>{multiple(m.roas)}</dd></div>
          </dl>
        ) : (
          <p className="text-[13px] text-nq-muted">Os números aparecem depois que a campanha rodar na Meta.</p>
        )}
        <p className="text-[12px] text-nq-subtle">Receita bruta das vendas pagas confirmadas no NORQVA, no período escolhido no topo.</p>
      </section>

      <section className="rounded-2xl bg-nq-surface p-4 space-y-3" aria-label="Rentabilidade" data-testid="overview-economics">
        <h3 className="text-[15px] font-semibold text-nq-text">Rentabilidade</h3>
        {!ecoLoaded ? (
          <p className="text-[13px] text-nq-muted">Calculando…</p>
        ) : !eco ? (
          <p className="text-[13px] text-nq-muted">Sem oferta ligada a esta campanha: não dá para calcular o equilíbrio.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] leading-4">
              <div><dt className="text-nq-muted">Líquido por venda</dt><dd className="mt-0.5 text-[15px] text-nq-text tabular-nums">{brl(eco.net_per_sale)}</dd></div>
              <div><dt className="text-nq-muted">CPA máximo</dt><dd className="mt-0.5 text-[15px] text-nq-text tabular-nums">{eco.breakeven_cpa === null ? '—' : brl(eco.breakeven_cpa)}</dd></div>
              <div><dt className="text-nq-muted">ROAS de equilíbrio</dt><dd className="mt-0.5 text-[15px] text-nq-text tabular-nums">{eco.breakeven_roas === null ? '—' : multiple(eco.breakeven_roas)}</dd></div>
              <div>
                <dt className="text-nq-muted">Margem estimada</dt>
                <dd className={`mt-0.5 text-[15px] font-semibold tabular-nums ${margin === null ? 'text-nq-text' : margin >= 0 ? 'text-nq-positive-text' : 'text-nq-critical-text'}`}>
                  {margin === null ? '—' : brl(margin)}
                </dd>
              </div>
            </dl>
            <p className="text-[12px] leading-4 text-nq-subtle">
              Acima do ROAS de equilíbrio a campanha cobre o anúncio e as taxas de cada venda. Margem estimada = vendas × líquido por venda − investido, sem custos fixos.
              {eco.estimated ? ' Os custos desta oferta não estão cadastrados: as taxas são estimadas (6% + R$ 1,99 por venda).' : ''}
            </p>
          </>
        )}
      </section>

      <section aria-label="Pendências desta campanha">
        <h3 className="text-[13px] font-semibold text-nq-muted mb-2">
          {problems.length === 0 ? 'Nenhuma pendência nesta campanha' : problems.length === 1 ? '1 pendência nesta campanha' : `${problems.length} pendências nesta campanha`}
        </h3>
        {problems.length > 0 && (
          <ul className="rounded-2xl bg-nq-surface divide-y divide-nq-line/70 overflow-hidden">
            {problems.map((n) => (
              <AlertCard key={n.id} n={n} canAct={canAct} apiFetch={apiFetch} isDemoView={false} onOpenCampaign={onOpenAlert} onChanged={onAlertChanged} showError={showError} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  LAUNCH_PLAN_DRAFTED: 'Rascunho criado',
  LAUNCH_PLAN_UPDATED: 'Rascunho alterado',
  LAUNCH_PLAN_CREATE_STARTED: 'Criação na Meta iniciada',
  LAUNCH_PLAN_CREATED_PAUSED: 'Criada na Meta (pausada)',
  LAUNCH_PLAN_CREATE_FAILED: 'Falha ao criar na Meta',
  LAUNCH_PLAN_AWAITING_OPERATOR: 'Esperando o seu Sim',
  LAUNCH_PLAN_APPROVED: 'Sim registrado',
  LAUNCH_PLAN_REJECTED: 'Não registrado',
  LAUNCH_PLAN_ACTIVATED: 'Campanha ativada',
  LAUNCH_PLAN_ACTIVATION_FAILED: 'Falha ao ativar',
  LAUNCH_PLAN_CAP_CHANGED: 'Teto alterado',
  LAUNCH_PLAN_BUDGET_SYNCED: 'Orçamento atualizado no plano',
  LAUNCH_PLAN_PAUSED_BY_OPERATOR: 'Pausada pela tela',
  LAUNCH_PLAN_RESUMED_BY_OPERATOR: 'Reativada com o código',
  CAMPAIGN_FIELDS_EDITED: 'Campos editados',
  CAMPAIGN_FILLED_FROM_CREATIVES: 'Preenchida com os criativos',
  CAMPAIGN_CREATIVE_CHOSEN: 'Criativo escolhido',
  CAMPAIGN_RESET_TO_AUTO: 'Voltou ao automático',
  CAMPAIGN_AD_CREATIVE_SWAPPED: 'Anúncio editado na Meta',
  META_CAMPAIGN_STATUS_CHANGED: 'Situação da campanha alterada na Meta',
  META_ADSET_STATUS_CHANGED: 'Situação do conjunto alterada na Meta',
  META_AD_STATUS_CHANGED: 'Situação do anúncio alterada na Meta',
  META_BUDGET_UPDATED: 'Orçamento alterado na Meta',
  META_MUTATION_FAILED: 'Falha ao alterar na Meta',
  EXPERIMENT_GUARD_PAUSED: 'Pausada pelo vigia no teto',
  EXPERIMENT_CAP_EXTENDED_PROFIT: 'Teto ampliado por lucro',
  AD_ALERT_DISMISSED: 'Aviso descartado',
  AD_ALERT_IN_PROGRESS: 'Aviso em tratamento',
  AD_ALERT_AUTO_RESOLVED: 'Aviso resolvido',
  META_ENTITY_STATUS: 'Decisão: pausar ou ativar',
  META_ENTITY_DAILY_BUDGET: 'Decisão: mudar orçamento',
  LAUNCH_PLAN_ANSWER: 'Decisão: resposta Sim ou Não',
  LAUNCH_PLAN_CREATE_ON_META: 'Decisão: criar na Meta',
  LAUNCH_PLAN_SPEND_CAP: 'Decisão: teto de gasto',
  CAMPAIGN_AD_CREATIVE_SWAP: 'Decisão: editar anúncio na Meta',
  // NORQVA-0118: pausa noturna
  NIGHT_PAUSE_DONE: 'Pausa noturna',
  NIGHT_PAUSE_UNCONFIRMED: 'Pausa noturna (aguardando conferência)',
  NIGHT_PAUSE_FAILED: 'Pausa noturna não feita',
  NIGHT_PAUSE_RESUMED: 'Fim da pausa noturna',
  NIGHT_PAUSE_RESUME_UNCONFIRMED: 'Fim da pausa noturna (aguardando conferência)',
  NIGHT_PAUSE_RESUME_CANCELLED: 'Fim da pausa noturna cancelado',
  NIGHT_PAUSE_RESUME_FAILED: 'Fim da pausa noturna falhou',
  NIGHT_PAUSE_EXPIRED: 'Ficou pausada depois da pausa noturna',
  NIGHT_PAUSE_SETTINGS_CHANGED: 'Pausa noturna configurada',
  NIGHT_PAUSE: 'Decisão: pausa noturna',
  NIGHT_PAUSE_RESUME: 'Decisão: fim da pausa noturna'
};

const OUTCOME: Record<string, { label: string; tone: 'positive' | 'attention' | 'critical' | 'neutral' }> = {
  DONE: { label: 'feito', tone: 'positive' },
  REJECTED: { label: 'recusado', tone: 'attention' },
  FAILED: { label: 'falhou', tone: 'critical' }
};

export function CampaignHistory({ campaignId, apiFetch }: { campaignId: string; apiFetch: Api }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    setItems(null);
    setError(null);
    apiFetch(`/campaigns/${campaignId}/history?mode=real`)
      .then((r) => {
        if (!off) setItems(Array.isArray(r?.items) ? r.items : []);
      })
      .catch((e: any) => {
        if (!off) setError(e?.message || 'Não foi possível carregar o histórico.');
      });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  if (error) return <p className="rounded-2xl bg-nq-surface p-4 text-[13px] text-nq-critical-text">{error}</p>;
  if (items === null) return <p className="rounded-2xl bg-nq-surface p-4 text-[13px] text-nq-muted">Carregando histórico…</p>;
  if (items.length === 0) return <p className="rounded-2xl bg-nq-surface p-4 text-[13px] text-nq-muted" data-testid="history-empty">Nada registrado ainda nesta campanha.</p>;

  return (
    <ul className="rounded-2xl bg-nq-surface divide-y divide-nq-line/70 overflow-hidden" data-testid="history-tab">
      {items.map((i) => {
        const out = OUTCOME[i.outcome] || OUTCOME.DONE;
        return (
          <li key={i.id} className="px-4 py-3.5 space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[15px] text-nq-text">{EVENT_LABEL[i.type] || i.type}</span>
              <StatusPill tone={out.tone}>{out.label}</StatusPill>
            </div>
            <div className="text-[12px] text-nq-muted">
              {new Date(i.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {i.who}
            </div>
            {i.description && <p className="text-[13px] text-nq-muted break-words">{i.description}</p>}
            {(i.before || i.after) && (
              <p className="text-[12px] text-nq-subtle break-all">
                {i.before ? `Antes: ${i.before}` : ''}
                {i.before && i.after ? ' · ' : ''}
                {i.after ? `Depois: ${i.after}` : ''}
              </p>
            )}
            {i.error && <p className="text-[12px] text-nq-critical-text break-words">{i.error}</p>}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------- NORQVA-0097: fichas de alteração na Meta ----------------

const CHANGE_STATE: Record<string, { label: string; tone: 'positive' | 'attention' | 'critical' | 'neutral' | 'info' }> = {
  AWAITING_APPROVAL: { label: 'Aguardando aprovação', tone: 'attention' },
  SENDING: { label: 'Enviando à Meta', tone: 'info' },
  CONFIRMED: { label: 'Confirmado pela Meta', tone: 'positive' },
  UNCONFIRMED: { label: 'Aguardando conferência', tone: 'attention' },
  FAILED: { label: 'Falhou', tone: 'critical' },
  REJECTED: { label: 'Recusado', tone: 'neutral' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
  EXPIRED: { label: 'Expirou', tone: 'neutral' }
};

const brlText = (v: string | null) => (v === null || v === undefined || v === '' ? '—' : brl(Number(v)));

export function changeLabel(c: any): string {
  // NORQVA-0118: fichas da pausa noturna
  if (c.origin === 'NIGHT_PAUSE' && c.kind === 'STATUS') return c.requested_value === 'PAUSED' ? 'Pausa noturna' : 'Fim da pausa noturna';
  if (c.kind === 'STATUS') return c.requested_value === 'PAUSED' ? 'Pausar' : 'Reativar';
  return `Orçamento ${brlText(c.previous_value)} → ${brlText(c.requested_value)} por dia`;
}

function ChangeItem({
  c,
  currentUser,
  apiFetch,
  showError,
  showSuccess,
  onChanged
}: {
  c: any;
  currentUser: any;
  apiFetch: Api;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onChanged: (c: any) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const isAdmin = currentUser?.role === 'ADMIN';
  const mine = String(c.requested_by || '') === String(currentUser?.id || '');
  const st = CHANGE_STATE[c.state] || { label: c.state, tone: 'neutral' as const };
  // o servidor só pede o código para a campanha de um plano (pausada pela tela)
  const needsCode = c.state === 'AWAITING_APPROVAL' && c.kind === 'STATUS' && c.requested_value === 'ACTIVE' && !!c.plan_code && c.entity_type === 'CAMPAIGN';
  // aumento de orçamento pedido pela equipe: mostra a diferença e pede confirmação a mais
  const prev = c.previous_value === null || c.previous_value === undefined ? null : Number(c.previous_value);
  const increase = c.kind === 'DAILY_BUDGET' && prev !== null && Number(c.requested_value) > prev ? Math.round((Number(c.requested_value) - prev) * 100) / 100 : 0;
  const [increaseOk, setIncreaseOk] = useState(false);

  const act = async (path: string, body: any = {}, ok?: (x: any) => string) => {
    setBusy(true);
    try {
      const r = await apiFetch(`/meta-changes/${c.id}/${path}?mode=real`, { method: 'POST', body: JSON.stringify(body) });
      if (r?.change) {
        onChanged(r.change);
        if (r.change.state === 'FAILED') showError(String(r.change.error || 'A alteração não foi feita.'));
        else if (ok) showSuccess(ok(r.change));
      }
    } catch (e: any) {
      showError(e?.message || 'Não foi possível atualizar o pedido.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="px-4 py-3.5 space-y-1.5" data-testid={`change-${c.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[15px] text-nq-text">{changeLabel(c)}</span>
        <StatusPill tone={st.tone}>{st.label}</StatusPill>
      </div>
      <div className="text-[12px] text-nq-muted break-words">
        {c.entity_name || c.meta_id}
        {c.plan_code ? ` · ${c.plan_code}` : ''}
      </div>
      <div className="text-[12px] text-nq-subtle">
        Pedido por {c.requested_by_name || '—'} em {new Date(c.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        {c.approved_by_name && c.state !== 'REJECTED' && c.state !== 'CANCELLED' ? ` · autorizado por ${c.approved_by_name}` : ''}
        {c.state === 'REJECTED' && c.approved_by_name ? ` · recusado por ${c.approved_by_name}` : ''}
      </div>
      {c.state === 'UNCONFIRMED' && (
        <p className="text-[12px] text-nq-attention">A Meta aceitou, mas a releitura ainda mostra {c.kind === 'STATUS' ? c.meta_value || '—' : brlText(c.meta_value)}. O NORQVA confere de novo sozinho.</p>
      )}
      {c.state === 'FAILED' && c.error && <p className="text-[12px] text-nq-critical-text break-words">{c.error}</p>}

      {needsCode && isAdmin && (
        <label className="block space-y-1 max-w-xs">
          <span className="text-[12px] text-nq-muted">Código do plano {c.plan_code} (reativar vale como novo Sim)</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            aria-label={`Código do plano para autorizar ${changeLabel(c)}`}
            className="w-full min-h-[44px] rounded-xl bg-nq-raised px-3 text-[15px] text-nq-text border border-nq-line"
          />
        </label>
      )}

      {c.state === 'AWAITING_APPROVAL' && isAdmin && increase > 0 && (
        <div className="space-y-1">
          <p className="text-[12px] text-nq-attention">
            + {brl(increase)} por dia (+ {brl(increase * 30)} em 30 dias). O valor de antes é de quando o pedido foi feito; confira em Resultados se mudou.
          </p>
          <label className="flex items-start gap-2 text-[12px] text-nq-text min-h-[44px]">
            <input type="checkbox" checked={increaseOk} onChange={(e) => setIncreaseOk(e.target.checked)} className="mt-0.5 h-5 w-5" />
            <span>Aumentar o gasto em {brl(increase)} por dia</span>
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {c.state === 'AWAITING_APPROVAL' && isAdmin && (
          <>
            <button
              type="button"
              disabled={busy || (needsCode && code.trim().toUpperCase() !== String(c.plan_code).toUpperCase()) || (increase > 0 && !increaseOk)}
              onClick={() => act('approve', needsCode ? { confirm_code: code.trim() } : {}, (x) => (x.state === 'CONFIRMED' ? 'Autorizado e confirmado pela Meta.' : 'Autorizado: a Meta aceitou, o NORQVA está conferindo.'))}
              className="min-h-[44px] px-4 rounded-full bg-nq-positive text-nq-on-positive text-[13px] font-semibold disabled:opacity-50"
            >
              Autorizar
            </button>
            <button type="button" disabled={busy} onClick={() => act('reject', {}, () => 'Pedido recusado.')} className="min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-[13px] font-semibold disabled:opacity-50">
              Recusar
            </button>
          </>
        )}
        {c.state === 'AWAITING_APPROVAL' && !isAdmin && mine && (
          <button type="button" disabled={busy} onClick={() => act('cancel', {}, () => 'Pedido cancelado.')} className="min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-[13px] font-semibold disabled:opacity-50">
            Cancelar pedido
          </button>
        )}
        {c.state === 'UNCONFIRMED' && (isAdmin || currentUser?.role === 'PERFORMANCE') && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act('verify', {}, (x) => (x.state === 'CONFIRMED' ? 'Confirmado pela Meta.' : 'Ainda não aparece na Meta. O NORQVA confere de novo sozinho.'))}
            className="min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-[13px] font-semibold disabled:opacity-50"
          >
            Conferir agora
          </button>
        )}
      </div>
    </li>
  );
}

/** Lista de fichas (Histórico da campanha ou pedidos esperando o administrador). */
export function MetaChangesList({
  query,
  title,
  hideWhenEmpty = false,
  currentUser,
  apiFetch,
  showError,
  showSuccess,
  onChanged
}: {
  query: string;
  title: string;
  hideWhenEmpty?: boolean;
  currentUser: any;
  apiFetch: Api;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    let off = false;
    apiFetch(`/meta-changes?mode=real${query ? `&${query}` : ''}`)
      .then((r) => {
        if (!off) setItems(Array.isArray(r?.changes) ? r.changes : []);
      })
      .catch(() => {
        if (!off) setItems([]);
      });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (items === null || (hideWhenEmpty && items.length === 0)) return null;
  return (
    <section aria-label={title} className="space-y-2" data-testid="meta-changes">
      <h3 className="text-[13px] font-semibold text-nq-muted">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-nq-surface p-4 text-[13px] text-nq-muted">Nenhuma alteração pedida pelo NORQVA nesta campanha.</p>
      ) : (
        <ul className="rounded-2xl bg-nq-surface divide-y divide-nq-line/70 overflow-hidden">
          {items.map((c) => (
            <ChangeItem
              key={c.id}
              c={c}
              currentUser={currentUser}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
              onChanged={(n) => {
                setItems((list) => (list || []).map((x) => (x.id === n.id ? n : x)));
                onChanged?.();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------- NORQVA-0098: público, nomes e data de término ----------------

/** Público de cada conjunto (só leitura): país, idade e tipo de público, como foi criado. */
/** Texto do público a partir do que o plano registrou (sem inventar nada). */
export function audienceText(t: any): string {
  if (!t || typeof t !== 'object') return 'não informado';
  const parts: string[] = [];
  const countries = Array.isArray(t.countries) ? t.countries : [];
  if (countries.length) parts.push(countries.map((c: string) => (c === 'BR' ? 'Brasil' : c)).join(', '));
  if (t.age_min || t.age_max) parts.push(`${t.age_min || 18} a ${t.age_max || 65} anos`);
  if (t.advantage_audience) parts.push('público Advantage');
  return parts.length ? parts.join(', ') : 'não informado';
}

export function AudienceList({ adsets }: { adsets: any[] }) {
  if (!adsets.length) return null;
  return (
    <section className="rounded-2xl bg-nq-surface p-4 space-y-2" aria-label="Público" data-testid="audience">
      <h3 className="text-[15px] font-semibold text-nq-text">Público</h3>
      <ul className="space-y-1.5 text-[13px]">
        {adsets.map((s: any) => (
          <li key={s.name}>
            <span className="text-nq-muted break-all">{s.name}: </span>
            <span className="text-nq-text">{s.targeting_summary || audienceText(s.targeting)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-nq-subtle">Para mudar o público, crie uma campanha nova ou use o Gerenciador da Meta.</p>
    </section>
  );
}

function NameRow({
  label,
  entity,
  metaId,
  initial,
  scope,
  apiFetch,
  showError,
  showSuccess
}: {
  label: string;
  entity: 'campaign' | 'adset' | 'ad';
  metaId: string;
  initial: string;
  scope: string;
  apiFetch: Api;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/meta-control/${entity}/${encodeURIComponent(metaId)}/name?mode=real`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), scope_campaign: scope })
      });
      setSaved(name.trim());
      showSuccess(r?.confirmed ? `Nome trocado e confirmado pela Meta.` : 'A Meta aceitou o nome novo; a releitura ainda não mostra. Confira mais tarde.');
    } catch (e: any) {
      showError(e?.message || 'Não foi possível renomear.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block flex-1 min-w-[200px] space-y-1">
        <span className="text-[12px] text-nq-muted">{label}</span>
        <input
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          aria-label={`Nome na Meta: ${label}`}
          className="w-full min-h-[44px] rounded-xl bg-nq-raised px-3 text-[15px] text-nq-text border border-nq-line"
        />
      </label>
      <button
        type="button"
        disabled={busy || name.trim().length < 3 || name.trim() === saved}
        onClick={save}
        className="min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-[13px] font-semibold disabled:opacity-40"
      >
        Renomear
      </button>
    </div>
  );
}

function EndDateRow({ metaId, scope, apiFetch, showError, showSuccess }: { metaId: string; scope: string; apiFetch: Api; showError: (m: string) => void; showSuccess: (m: string) => void }) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  // amanhã no horário local (não em UTC: depois das 21h o UTC já é o dia seguinte)
  const t = new Date(Date.now() + 24 * 3600 * 1000);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const save = async () => {
    setBusy(true);
    try {
      // fim do dia escolhido, no horário de Brasília
      const r = await apiFetch(`/meta-control/adset/${encodeURIComponent(metaId)}/end-time?mode=real`, {
        method: 'POST',
        body: JSON.stringify({ end_time: `${date}T23:59:00-03:00`, scope_campaign: scope })
      });
      showSuccess(r?.confirmed ? `Término em ${date.split('-').reverse().join('/')} confirmado pela Meta.` : 'A Meta aceitou a data; a releitura ainda não mostra. Confira mais tarde.');
    } catch (e: any) {
      showError(e?.message || 'Não foi possível marcar a data de término.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block space-y-1">
        <span className="text-[12px] text-nq-muted">Termina em (para sozinho no fim do dia)</span>
        <input
          type="date"
          min={tomorrow}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Data de término do conjunto"
          className="min-h-[44px] rounded-xl bg-nq-raised px-3 text-[15px] text-nq-text border border-nq-line"
        />
      </label>
      <button type="button" disabled={busy || !date} onClick={save} className="min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-[13px] font-semibold disabled:opacity-40">
        Marcar término
      </button>
    </div>
  );
}

/** Nomes na Meta (campanha, conjuntos, anúncios) e data de término dos conjuntos. Só administrador. */
export function MetaObjectsEditor({
  campaign,
  currentUser,
  apiFetch,
  showError,
  showSuccess
}: {
  campaign: any;
  currentUser: any;
  apiFetch: Api;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
}) {
  if (currentUser?.role !== 'ADMIN') return null;
  const ids = campaign?.meta_ids || {};
  const cmp = Object.entries(ids.campaign || {})[0] as [string, string] | undefined;
  if (!cmp) return null;
  const scope = String(cmp[1]);
  const adsets = Object.entries(ids.adsets || {}) as Array<[string, string]>;
  const ads = Object.entries(ids.ads || {}) as Array<[string, string]>;
  const common = { apiFetch, showError, showSuccess, scope };
  return (
    <section className="rounded-2xl bg-nq-surface p-4 space-y-4" aria-label="Nomes e término na Meta" data-testid="meta-objects">
      <div>
        <h3 className="text-[15px] font-semibold text-nq-text">Nomes e término na Meta</h3>
        <p className="mt-1 text-[12px] text-nq-subtle">Muda só o nome que aparece na Meta; o código {campaign.code} continua o mesmo no NORQVA.</p>
      </div>
      <NameRow label="Campanha" entity="campaign" metaId={scope} initial={String(cmp[0])} {...common} />
      {adsets.map(([name, id]) => (
        <div key={id} className="space-y-2 border-t border-nq-line/60 pt-3">
          <NameRow label="Conjunto" entity="adset" metaId={String(id)} initial={name} {...common} />
          <EndDateRow metaId={String(id)} scope={scope} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />
        </div>
      ))}
      {ads.map(([name, id]) => (
        <div key={id} className="border-t border-nq-line/60 pt-3">
          <NameRow label="Anúncio" entity="ad" metaId={String(id)} initial={name} {...common} />
        </div>
      ))}
    </section>
  );
}

// ---------------- NORQVA-0118: pausa noturna ----------------

const NIGHT_RUN_STATE: Record<string, { label: string; tone: 'positive' | 'attention' | 'critical' | 'neutral' | 'info' }> = {
  SKIPPED: { label: 'Não estava ativa', tone: 'neutral' },
  PAUSING: { label: 'Pausando', tone: 'info' },
  PAUSE_UNCONFIRMED: { label: 'Pausada, aguardando conferência', tone: 'attention' },
  PAUSED: { label: 'Pausada à noite', tone: 'info' },
  PAUSE_FAILED: { label: 'Não conseguiu pausar', tone: 'attention' },
  REACTIVATING: { label: 'Reativando', tone: 'info' },
  RESUME_UNCONFIRMED: { label: 'Reativada, aguardando conferência', tone: 'attention' },
  REACTIVATED: { label: 'Reativada de manhã', tone: 'positive' },
  RESUME_FAILED: { label: 'Não conseguiu reativar', tone: 'critical' },
  CANCELLED: { label: 'Reativação cancelada', tone: 'attention' },
  EXPIRED: { label: 'Ficou pausada', tone: 'critical' }
};

const toMin = (v: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** "00:00" → "00h", "01:30" → "01h30" (rótulo curto da janela). */
export function hourLabel(v: string): string {
  const [h, m] = String(v || '').split(':');
  return m && m !== '00' ? `${h}h${m}` : `${h}h`;
}

/** Erro da janela em português, ou null. Mesmo dia: início antes do fim. */
export function nightWindowError(start: string, end: string): string | null {
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null) return 'Use horários no formato HH:MM.';
  if (s >= e) return 'O início precisa ser antes do fim, no mesmo dia.';
  if (e > 23 * 60) return 'O fim pode ser no máximo às 23:00, para dar tempo de reativar no mesmo dia.';
  return null;
}

/** Gerenciar campanha → Configurações: pausa noturna (padrão ligada, 00:00 às 06:00, horário de Brasília). */
export function NightPauseSettings({
  campaignId,
  canEdit,
  apiFetch,
  showError,
  showSuccess
}: {
  campaignId: string;
  canEdit: boolean;
  apiFetch: Api;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
}) {
  const [data, setData] = useState<any | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [start, setStart] = useState('00:00');
  const [end, setEnd] = useState('06:00');
  const [busy, setBusy] = useState(false);

  const apply = (d: any) => {
    setData(d);
    setEnabled(d?.enabled !== false);
    setStart(d?.start || '00:00');
    setEnd(d?.end || '06:00');
  };

  useEffect(() => {
    let off = false;
    apiFetch(`/campaigns/${campaignId}/night-pause?mode=real`)
      .then((d) => {
        if (!off) apply(d);
      })
      .catch(() => {
        if (!off) setData({ error: true });
      });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  if (!data) return <p className="rounded-2xl bg-nq-surface p-4 text-[13px] text-nq-muted">Carregando pausa noturna…</p>;
  if (data.error) return <p className="rounded-2xl bg-nq-surface p-4 text-[13px] text-nq-critical-text">Não foi possível carregar a pausa noturna.</p>;

  const error = nightWindowError(start, end);
  const changed = enabled !== (data.enabled !== false) || start !== data.start || end !== data.end;
  const save = async () => {
    if (error) return;
    setBusy(true);
    try {
      const d = await apiFetch(`/campaigns/${campaignId}/night-pause?mode=real`, { method: 'POST', body: JSON.stringify({ enabled, start, end }) });
      apply(d);
      showSuccess(enabled ? `Pausa noturna ligada: das ${start} às ${end} (horário de Brasília).` : 'Pausa noturna desligada para esta campanha.');
    } catch (e: any) {
      showError(e?.message || 'Não foi possível salvar a pausa noturna.');
    } finally {
      setBusy(false);
    }
  };
  const runs: any[] = Array.isArray(data.runs) ? data.runs.slice(0, 3) : [];
  const timeInput = 'min-h-[44px] w-[120px] rounded-xl bg-nq-raised px-3 text-[15px] text-nq-text tabular-nums [color-scheme:dark] disabled:opacity-60';

  return (
    <section className="rounded-2xl bg-nq-surface p-4 space-y-3" aria-label="Pausa noturna" data-testid="night-pause">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-nq-text">Pausa noturna ({hourLabel(data.start)}–{hourLabel(data.end)})</h3>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Pausa noturna (${hourLabel(data.start)}–${hourLabel(data.end)})`}
          disabled={!canEdit || busy}
          onClick={() => setEnabled(!enabled)}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${enabled ? 'bg-nq-positive' : 'bg-nq-raised'}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-nq-text transition-all ${enabled ? 'left-7' : 'left-1'}`} />
        </button>
      </div>
      <p className="text-[13px] leading-[18px] text-nq-muted">
        Todo dia, no horário de Brasília, o NORQVA pausa a campanha no início e reativa no fim, só se foi ele quem pausou e ninguém mexeu nela durante a noite. Orçamento e teto não mudam.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-[12px] text-nq-muted">Pausa às</span>
          <input type="time" aria-label="Início da pausa noturna" value={start} disabled={!canEdit || busy} onChange={(e) => setStart(e.target.value)} className={timeInput} />
        </label>
        <label className="space-y-1">
          <span className="block text-[12px] text-nq-muted">Volta às</span>
          <input type="time" aria-label="Fim da pausa noturna" max="23:00" value={end} disabled={!canEdit || busy} onChange={(e) => setEnd(e.target.value)} className={timeInput} />
        </label>
        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={!changed || !!error || busy}
            data-testid="night-pause-save"
            className="min-h-[44px] px-4 rounded-full bg-nq-text text-nq-bg text-[13px] font-semibold disabled:opacity-50"
          >
            Salvar
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-nq-critical-text" data-testid="night-pause-error">{error}</p>}
      {!canEdit && <p className="text-[12px] text-nq-subtle">Só o administrador muda a pausa noturna.</p>}
      {data.master_enabled === false && (
        <p className="text-[12px] text-nq-attention" data-testid="night-pause-master-off">
          A chave geral da pausa noturna está desligada no servidor: nenhuma campanha é pausada por enquanto. O que já foi pausado volta normalmente.
        </p>
      )}
      {runs.length > 0 && (
        <ul className="space-y-1 text-[12px]" aria-label="Últimas noites">
          {runs.map((r) => {
            const st = NIGHT_RUN_STATE[r.state] || { label: r.state, tone: 'neutral' as const };
            const d = String(r.night_date || '').slice(0, 10).split('-');
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-nq-muted">
                <span className="tabular-nums">{d.length === 3 ? `${d[2]}/${d[1]}` : r.night_date}</span>
                <StatusPill tone={st.tone}>{st.label}</StatusPill>
                {r.reason && r.state !== 'SKIPPED' && <span className="break-words">{r.reason}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
