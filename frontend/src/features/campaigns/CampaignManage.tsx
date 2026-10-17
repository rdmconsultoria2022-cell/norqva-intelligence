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
  CAMPAIGN_AD_CREATIVE_SWAP: 'Decisão: editar anúncio na Meta'
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
  const needsCode = c.state === 'AWAITING_APPROVAL' && c.kind === 'STATUS' && c.requested_value === 'ACTIVE' && !!c.plan_code;

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

      <div className="flex flex-wrap gap-2 pt-1">
        {c.state === 'AWAITING_APPROVAL' && isAdmin && (
          <>
            <button
              type="button"
              disabled={busy || (needsCode && code.trim().toUpperCase() !== String(c.plan_code).toUpperCase())}
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
