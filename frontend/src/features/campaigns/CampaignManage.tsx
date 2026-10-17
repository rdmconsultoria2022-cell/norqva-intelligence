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
  currentUser,
  apiFetch,
  showError,
  showSuccess,
  onDone
}: {
  metaCampaign: { meta_campaign_id: string; name: string; status?: string | null; effective_status?: string | null } | null;
  currentUser: any;
  apiFetch: Api;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onDone: () => void;
}) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const { status } = useMetaControl({ apiFetch: apiFetch as any, currentUser, isDemoView: false, enabled: isAdmin && !!metaCampaign });
  const [action, setAction] = useState<MetaControlPendingAction | null>(null);
  if (!isAdmin || !metaCampaign) return null;
  const running = String(metaCampaign.status || '').toUpperCase() === 'ACTIVE';
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
  const roasTone = m?.roas === null || m?.roas === undefined || !eco?.breakeven_roas ? 'text-nq-text' : m.roas >= eco.breakeven_roas ? 'text-nq-positive-text' : 'text-nq-critical-text';

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
