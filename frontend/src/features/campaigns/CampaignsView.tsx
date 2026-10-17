import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCard, focusOf, type AlertNotification, type CampaignFocus } from '../alerts/AlertCenter';
import { RefreshCw, Wand2, RotateCcw, Eraser, Rocket, Plus, Save, ChevronLeft } from 'lucide-react';
import { UserObj } from '../../types';
import { LaunchPlansCard } from '../acquisition/LaunchPlansCard';
import { ExperimentGuardCard } from '../acquisition/ExperimentGuardCard';
import { MetaAdsView } from '../acquisition/MetaAdsView';
import { aggregateMetrics, PerfItem } from '../acquisition/MetaResults';
import { MethodView } from '../method/MethodView';
import { useGlobalPeriod, periodQuery } from '../../lib/globalPeriod';
import { AdMetaSwap } from './AdMetaSwap';
import { CampaignOverview, CampaignHistory, PauseBar } from './CampaignManage';
import { CTA_LABEL } from './ctaLabels';
import { getMetaDeliveryStatus } from '../acquisition/MetaAdsView';
import { Disclosure, StatusPill, Tone, brl as brlFmt, int, multiple } from '../../components/ui/premium';

// NORQVA-0083 (D-0082): mesma lógica, nova apresentação (Design System NORQVA Premium):
// cartões com o nome do produto, investido, receita, vendas e ROAS; nome e IDs da Meta nos detalhes;
// no celular, a campanha aberta ocupa a tela (com "Campanhas" para voltar). As ações protegidas
// (Sim/Não, criar pausada, pausar, orçamento, teto, editar anúncio) seguem nos mesmos componentes.
// NORQVA-0027: tela Campanhas. Cada campanha é um plano de lançamento: completa com o criativo
// aprovado, modo manual campo a campo (campo editado vira manual e o sistema não sobrescreve),
// e "Criar na Meta (pausada)". Ativar e gastar continua só com o Sim do operador.

export interface CampaignsViewProps {
  currentUser: UserObj | null;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  offers?: any[];
  /** NORQVA-0095: abrir uma campanha vinda de um aviso (sino ou pendências) */
  focus?: CampaignFocus | null;
  /** NORQVA-0095: avisa o App para atualizar o sino depois de tratar um aviso aqui */
  onAlertsChanged?: () => void;
  /** NORQVA-0095: o atalho do aviso já foi usado (não reabre ao voltar para Campanhas) */
  onFocusHandled?: () => void;
}

type CampaignTab = 'overview' | 'config' | 'creatives' | 'results' | 'history';

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  CREATING: 'Criando na Meta',
  CREATED_PAUSED: 'Criada pausada',
  AWAITING_OPERATOR: 'Aguardando seu Sim',
  APPROVED: 'Aprovada (ativando)',
  ACTIVE: 'Ativa',
  REJECTED: 'Recusada',
  FAILED: 'Falhou'
};


type Fields = Record<string, string>;

const input =
  'w-full min-h-[44px] rounded-xl bg-nq-raised px-3 text-[15px] text-nq-text placeholder:text-nq-subtle focus:outline-none focus:ring-2 focus:ring-nq-positive/50 disabled:opacity-70 [color-scheme:dark]';
const area = `${input} py-2.5 leading-[22px]`;
const label = 'text-[13px] text-nq-muted';

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  CREATING: 'info',
  CREATED_PAUSED: 'neutral',
  AWAITING_OPERATOR: 'attention',
  APPROVED: 'info',
  ACTIVE: 'positive',
  REJECTED: 'neutral',
  FAILED: 'critical'
};

function metaTone(raw: string): Tone {
  const r = String(raw || '').toUpperCase();
  if (r === 'ACTIVE') return 'positive';
  if (['DISAPPROVED', 'WITH_ISSUES'].includes(r)) return 'critical';
  if (['PENDING_START_TIME', 'IN_PROCESS', 'PENDING_REVIEW'].includes(r)) return 'attention';
  return 'neutral';
}
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
/** Situação do experimento em português (o servidor guarda códigos). */
const EXPERIMENT_STATUS: Record<string, string> = {
  RUNNING: 'Em andamento',
  ATIVO: 'Em andamento',
  PLANEJADO: 'Planejado',
  AUTORIZADO: 'Autorizado',
  PAUSADO: 'Pausado',
  PAUSED: 'Pausado',
  CONCLUIDO: 'Concluído',
  CLOSED: 'Encerrado',
  COMPLETED: 'Concluído'
};
const expStatus = (s: any) => EXPERIMENT_STATUS[String(s || '').toUpperCase()] || sentence(String(s || '—'));
const brl = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valores atuais dos campos editáveis, pelo mesmo caminho que o servidor usa. */
export function fieldsOf(c: any): Fields {
  const f: Fields = {};
  (c?.spec?.ads || []).forEach((a: any, i: number) => {
    f[`ads.${i}.primary_text`] = a.primary_text || '';
    f[`ads.${i}.headline`] = a.headline || '';
    f[`ads.${i}.cta`] = a.cta || '';
    f[`ads.${i}.destination_url`] = a.destination_url || '';
  });
  (c?.spec?.adsets || []).forEach((s: any, i: number) => {
    f[`adsets.${i}.daily_budget_brl`] = String(s.daily_budget_brl ?? '');
  });
  f.max_spend_brl = String(c?.max_spend_brl ?? '');
  f.hypothesis = c?.spec?.hypothesis || '';
  return f;
}

export function CampaignsView({ currentUser, isDemoView, apiFetch, showError, showSuccess, offers = [], focus = null, onAlertsChanged, onFocusHandled }: CampaignsViewProps) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<any>(null);
  const [form, setForm] = useState<Fields>({});
  const [base, setBase] = useState<Fields>({});
  const [options, setOptions] = useState<any[]>([]);
  const [fillResults, setFillResults] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [creating, setCreating] = useState<{ offer: string; creative_ids: string[]; daily: string; max: string } | null>(null);
  const [newOptions, setNewOptions] = useState<any[]>([]);
  const [cardKey, setCardKey] = useState(0);
  // NORQVA-0028: lista única (planos + campanhas criadas fora do NORQVA), resultado, alertas e experimentos
  const [metaCampaigns, setMetaCampaigns] = useState<any[]>([]);
  const [perf, setPerf] = useState<PerfItem[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  // NORQVA-0095: pendências abertas (avisos com gravidade Atenção ou Crítica)
  const [problems, setProblems] = useState<AlertNotification[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const pendingTabRef = useRef<CampaignTab | null>(null);
  const [experiments, setExperiments] = useState<any[]>([]);
  // NORQVA-0096: Gerenciar campanha em cinco abas; abre na Visão geral
  const [tab, setTab] = useState<CampaignTab>('overview');
  // NORQVA-0083 (D-0082): nome do produto de cada campanha da Meta (mesmo vínculo da Visão Geral)
  const [productByMeta, setProductByMeta] = useState<Record<string, string>>({});
  const { globalPeriod } = useGlobalPeriod();
  const periodQs = periodQuery(globalPeriod);

  const apiRef = useRef(apiFetch);
  apiRef.current = apiFetch;
  const errRef = useRef(showError);
  errRef.current = showError;
  const okRef = useRef(showSuccess);
  okRef.current = showSuccess;

  const loadList = useCallback(async () => {
    let planList: any[] = [];
    try {
      const r = await apiRef.current('/campaigns?mode=real');
      planList = Array.isArray(r?.campaigns) ? r.campaigns : [];
      setCampaigns(planList);
    } catch (err: any) {
      errRef.current(err.message || 'Erro ao carregar as campanhas.');
    }
    const [mc, pr, al, ex] = await Promise.all([
      apiRef.current('/meta/campaigns?mode=real').catch(() => []),
      apiRef.current(`/intelligence/creative-performance?mode=real&${periodQs}`).catch(() => null),
      apiRef.current('/alerts/center?mode=real').catch(() => null),
      apiRef.current('/experiments?mode=real').catch(() => null)
    ]);
    // O nome do produto das campanhas do NORQVA vem da oferta. Só as campanhas criadas fora do NORQVA
    // precisam do vínculo do resumo financeiro (D-0082); sem elas, essa leitura não é feita.
    const planMetaIdSet = new Set(
      planList.flatMap((c: any) => Object.values(c?.meta_ids?.campaign || {}).map(v => String(v)))
    );
    const hasExternal = (Array.isArray(mc) ? mc : []).some((m: any) => !planMetaIdSet.has(String(m.meta_campaign_id)));
    const fin = hasExternal ? await apiRef.current(`/financial/dashboard?mode=real&${periodQs}`).catch(() => null) : null;
    const names: Record<string, string> = {};
    (Array.isArray(fin?.byCampaign) ? fin.byCampaign : []).forEach((c: any) => {
      if (c?.metaCampaignId && c?.productName) names[String(c.metaCampaignId)] = String(c.productName);
    });
    setProductByMeta(names);
    setMetaCampaigns(Array.isArray(mc) ? mc : []);
    setPerf(Array.isArray(pr?.creatives) ? pr.creatives : []);
    const open: AlertNotification[] = Array.isArray(al?.notifications) ? al.notifications.filter((n: AlertNotification) => n.is_open && n.is_problem) : [];
    setProblems(open);
    setListLoaded(true);
    setExperiments(Array.isArray(ex?.experiments) ? ex.experiments : []);
  }, [periodQs]);

  const applyCampaign = (c: any) => {
    setCampaign(c);
    const f = fieldsOf(c);
    setForm(f);
    setBase(f);
  };

  const loadCampaign = useCallback(async (id: string) => {
    try {
      const [c, o] = await Promise.all([
        apiRef.current(`/campaigns/${id}?mode=real`),
        isAdmin ? apiRef.current(`/campaigns/${id}/creative-options?mode=real`) : Promise.resolve({ options: [] })
      ]);
      applyCampaign(c);
      setOptions(o?.options || []);
    } catch (err: any) {
      errRef.current(err.message || 'Erro ao abrir a campanha.');
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isDemoView) loadList();
  }, [isDemoView, loadList]);

  useEffect(() => {
    setFillResults(null);
    if (selectedId && !selectedId.startsWith('meta:')) {
      setTab(pendingTabRef.current || 'overview');
      pendingTabRef.current = null;
      loadCampaign(selectedId);
    }
  }, [selectedId, loadCampaign]);

  // NORQVA-0095: aviso do sino ou das pendências → abre a campanha certa, na aba que resolve
  const openFromAlert = useCallback(
    (f: { metaCampaignId: string | null; planCode: string | null; tab: 'results' | 'cap' }) => {
      const plan = campaigns.find(
        (c: any) =>
          (f.planCode && c.code === f.planCode) ||
          (f.metaCampaignId && Object.values(c?.meta_ids?.campaign || {}).map(String).includes(String(f.metaCampaignId)))
      );
      if (plan) {
        const target: CampaignTab = f.tab === 'cap' ? 'config' : 'results';
        pendingTabRef.current = target;
        if (selectedId === plan.id) {
          setTab(target);
          pendingTabRef.current = null;
        } else setSelectedId(plan.id);
        return true;
      }
      if (f.metaCampaignId && metaCampaigns.some((m: any) => String(m.meta_campaign_id) === String(f.metaCampaignId))) {
        setSelectedId(`meta:${f.metaCampaignId}`);
        return true;
      }
      return false;
    },
    [campaigns, metaCampaigns, selectedId]
  );
  // NORQVA-0096: pausar ou mudar orçamento em Resultados atualiza a situação do topo ao sair da aba
  const prevTab = useRef<CampaignTab>('overview');
  useEffect(() => {
    if (prevTab.current === 'results' && tab !== 'results') loadList();
    prevTab.current = tab;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const focusNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!focus || !listLoaded || focusNonce.current === focus.nonce) return;
    focusNonce.current = focus.nonce;
    if (!openFromAlert(focus)) errRef.current('A campanha deste aviso não está mais na lista.');
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, listLoaded, openFromAlert]);

  // o contador "N pendências" de cada cartão acompanha a lista de pendências
  useEffect(() => {
    setAlerts(problems.map((n) => ({ meta_campaign_id: n.entity.meta_campaign_id, meta_ad_id: n.entity.meta_ad_id || null })));
  }, [problems]);

  const post = (url: string, body: any = {}) => apiRef.current(url, { method: 'POST', body: JSON.stringify(body) });

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      const r = await fn();
      okRef.current(ok);
      return r;
    } catch (err: any) {
      errRef.current(err.message || 'Operação falhou.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const fill = async () => {
    const r = await run('fill', () => post(`/campaigns/${selectedId}/fill?mode=real`), 'Campanha preenchida com os criativos aprovados.');
    if (r?.campaign) {
      applyCampaign(r.campaign);
      setFillResults(r.results || []);
      loadList();
    }
  };

  const changed = Object.keys(form).filter(k => form[k] !== base[k]);
  const save = async () => {
    const fields: Record<string, any> = {};
    for (const k of changed) {
      fields[k] = /daily_budget_brl$|^max_spend_brl$/.test(k) ? Number(String(form[k]).replace(',', '.')) : form[k];
    }
    const r = await run('save', () => post(`/campaigns/${selectedId}/fields?mode=real`, { fields }), 'Alterações salvas. Esses campos agora são manuais.');
    if (r) {
      applyCampaign(r);
      loadList();
    }
  };

  // "Zerar": limpa os campos editáveis para preencher do zero (nada é salvo até clicar em Salvar)
  const blank = () => {
    const f: Fields = {};
    for (const k of Object.keys(form)) f[k] = /\.cta$/.test(k) ? form[k] : '';
    setForm(f);
  };

  const resetAuto = async () => {
    const r = await run('reset', () => post(`/campaigns/${selectedId}/reset?mode=real`), 'Voltou ao preenchimento automático.');
    if (r?.campaign) {
      applyCampaign(r.campaign);
      setFillResults(r.results || []);
      loadList();
    }
  };

  const chooseCreative = async (index: number, creativeId: string) => {
    const r = await run(
      `pick-${index}`,
      () => post(`/campaigns/${selectedId}/ads/${index}/creative?mode=real`, { creative_id: creativeId || null }),
      creativeId ? 'Criativo escolhido.' : 'O anúncio volta a usar o criativo automático.'
    );
    if (r?.campaign) {
      applyCampaign(r.campaign);
      setFillResults(r.results || []);
      loadList();
    }
  };

  const createOnMeta = async () => {
    setConfirmCreate(false);
    const r = await run('meta', () => post(`/launch-plans/${selectedId}/create`), 'Campanha criada na Meta, toda pausada. Agora ela espera o seu Sim.');
    await loadList();
    if (selectedId) await loadCampaign(selectedId);
    setCardKey(k => k + 1); // recarrega o quadro do Sim/Não
    return r;
  };

  const [newDestination, setNewDestination] = useState<string | null>(null);
  const [newWhy, setNewWhy] = useState<{ products: string[]; notReady: { human_id: string; product_name: string; reason: string }[] }>({ products: [], notReady: [] });
  const openNew = () => setCreating({ offer: '', creative_ids: [], daily: '20', max: '140' });
  useEffect(() => {
    if (!creating?.offer) {
      setNewOptions([]);
      setNewDestination(null);
      setNewWhy({ products: [], notReady: [] });
      return;
    }
    // NORQVA-0048: o servidor diz quais criativos aprovados servem para a oferta (no kit, também os dos livros) e o destino
    apiRef
      .current(`/campaigns/offer-creatives?mode=real&offer=${encodeURIComponent(creating.offer)}`)
      .then((r: any) => {
        setNewOptions(r?.creatives || []);
        setNewDestination(r?.destination || null);
        setNewWhy({ products: r?.products || [], notReady: r?.not_ready || [] });
      })
      .catch(() => {
        setNewOptions([]);
        setNewDestination(null);
        setNewWhy({ products: [], notReady: [] });
      });
  }, [creating?.offer, offers]);

  if (isDemoView) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-slate-400" data-testid="campaigns-demo">
        Campanhas só existem na conta real.
      </div>
    );
  }

  // ---- NORQVA-0028: lista única ----
  const planMetaId = (c: any) => {
    const ids = Object.values(c?.meta_ids?.campaign || {});
    return ids.length ? String(ids[0]) : null;
  };
  const planMetaIds = new Set(campaigns.map(planMetaId).filter(Boolean) as string[]);
  const externals = metaCampaigns.filter(m => !planMetaIds.has(String(m.meta_campaign_id)));
  const metricsOf = (metaId: string | null) => (metaId ? aggregateMetrics(perf.filter(p => String(p.campaign_id) === metaId)) : null);
  const adToCampaign = new Map(perf.map(p => [String(p.ad_id), String(p.campaign_id)]));
  const alertsOf = (metaId: string | null) =>
    metaId
      ? alerts.filter(a => (a.meta_campaign_id ? String(a.meta_campaign_id) : adToCampaign.get(String(a.meta_ad_id))) === metaId).length
      : 0;
  const planExperimentIds = new Set(campaigns.map(c => c.experiment_id).filter(Boolean));
  const legacyExperiments = experiments.filter(e => !planExperimentIds.has(e.id));
  const selectedMeta = selectedId?.startsWith('meta:') ? metaCampaigns.find(m => `meta:${m.meta_campaign_id}` === selectedId) : null;
  const offerProduct = (humanId: string | null | undefined) => {
    const o = offers.find((x: any) => x.human_id === humanId);
    return o?.product_name || null;
  };
  /** Nome que aparece no cartão: o produto (D-0082); sem produto conhecido, o nome da campanha. */
  const productOfPlan = (c: any) => offerProduct(c.offer_human_id) || (planMetaId(c) ? productByMeta[planMetaId(c)!] : null) || null;

  const cardBody = ({ title, caption, metaId, pill }: { title: string; caption: string | null; metaId: string | null; pill: React.ReactNode }) => {
    const m = metricsOf(metaId);
    const n = alertsOf(metaId);
    const losing = !!m && m.spend > 0 && m.revenue < m.spend;
    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-[15px] leading-[22px] text-nq-text ${caption ? 'break-words' : 'break-all'}`}>{title}</div>
            {caption && <div className="text-[12px] leading-4 text-nq-subtle break-all mt-0.5">{caption}</div>}
          </div>
          {m && (
            <div className="text-right shrink-0">
              <div className={`text-[15px] font-semibold tabular-nums ${m.roas === null ? 'text-nq-muted' : m.roas >= 1 ? 'text-nq-positive-text' : 'text-nq-critical-text'}`}>{multiple(m.roas)}</div>
              <div className="text-[12px] text-nq-muted">ROAS</div>
            </div>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {pill}
          {n > 0 && <StatusPill tone="critical">{n === 1 ? '1 pendência' : `${n} pendências`}</StatusPill>}
          {losing && <StatusPill tone="attention">Receita abaixo do investimento</StatusPill>}
        </div>
        {m && (
          <div className="mt-3 grid grid-cols-3 gap-3 text-[12px] leading-4">
            <div className="min-w-0"><div className="text-nq-muted">Investido</div><div className="mt-0.5 text-nq-text tabular-nums truncate">{brlFmt(m.spend)}</div></div>
            <div className="min-w-0"><div className="text-nq-muted">Receita</div><div className="mt-0.5 text-nq-text tabular-nums truncate">{brlFmt(m.revenue)}</div></div>
            <div className="min-w-0"><div className="text-nq-muted">Vendas</div><div className="mt-0.5 text-nq-text tabular-nums">{int(m.sales)}{m.cpa !== null ? <span className="text-nq-muted"> · CPA {brlFmt(m.cpa)}</span> : ''}</div></div>
          </div>
        )}
      </>
    );
  };

  const submitNew = async () => {
    if (!creating) return;
    const r = await run(
      'new',
      () =>
        post('/campaigns?mode=real', {
          offer_human_id: creating.offer,
          creative_ids: creating.creative_ids,
          daily_budget_brl: Number(creating.daily.replace(',', '.')),
          max_spend_brl: Number(creating.max.replace(',', '.'))
        }),
      'Campanha criada em rascunho.'
    );
    if (r?.id) {
      setCreating(null);
      await loadList();
      setSelectedId(r.id);
    }
  };

  const manual = campaign?.manual_fields || {};
  const ManualTag = ({ path }: { path: string }) =>
    manual[path] ? (
      <span data-testid={`manual-${path}`} className="ml-1.5 inline-flex px-1.5 rounded-full bg-nq-attention/15 text-nq-attention text-[12px] leading-5">
        manual
      </span>
    ) : null;
  const filled = campaign?.spec?.ads?.every((a: any) => a.video_url && a.video_url !== 'TO_BE_FILLED');
  const editable = !!campaign?.editable && isAdmin;
  const hasSelection = !!selectedId && (!!selectedMeta || (!!campaign && selectedId === campaign.id));
  // no celular o quadro do Sim fica na lista: no detalhe, um aviso curto leva de volta a ele
  const awaitingCount = campaigns.filter(c => c.status === 'AWAITING_OPERATOR' || (c.status === 'APPROVED' && !!c.last_error)).length;
  const awaitingNotice = awaitingCount > 0 && isAdmin && (
    <button
      type="button"
      onClick={() => setSelectedId(null)}
      data-testid="awaiting-notice"
      className="lg:hidden w-full flex items-center justify-between gap-3 min-h-[48px] px-4 rounded-2xl bg-nq-attention/10 text-left"
    >
      <StatusPill tone="attention">{awaitingCount === 1 ? '1 campanha aguardando seu Sim' : `${awaitingCount} campanhas aguardando seu Sim`}</StatusPill>
      <span className="text-[13px] text-nq-muted shrink-0">Ver</span>
    </button>
  );
  const back = (
    <button
      type="button"
      onClick={() => setSelectedId(null)}
      className="lg:hidden -ml-2 inline-flex items-center gap-1 h-10 px-2 rounded-full text-[15px] text-nq-muted active:bg-nq-surface"
    >
      <ChevronLeft aria-hidden="true" className="h-5 w-5" /> Campanhas
    </button>
  );
  const btnGhost = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-full bg-nq-raised text-[13px] text-nq-text disabled:opacity-50';
  const btnPrimary = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-full bg-nq-positive text-nq-on-positive text-[15px] font-semibold disabled:opacity-40';
  const btnLight = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-full bg-nq-text text-nq-bg text-[15px] font-semibold disabled:opacity-40';

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto text-nq-text">
      {/* no celular, com uma campanha aberta, o topo da tela dá lugar ao botão "Campanhas" */}
      <header className={`space-y-1 ${hasSelection ? 'hidden lg:block' : ''}`}>
        <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-[28px] leading-[34px] font-semibold tracking-tight">Campanhas</h1>
        <div className="flex gap-2 shrink-0">
          <button onClick={loadList} aria-label="Atualizar" className="h-11 w-11 flex items-center justify-center rounded-full bg-nq-surface text-nq-muted active:bg-nq-raised">
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </button>
          {isAdmin && (
            <button onClick={openNew} data-testid="new-campaign" className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-nq-positive text-nq-on-positive text-[14px] font-semibold">
              <Plus aria-hidden="true" className="h-4 w-4" />
              <span className="hidden min-[360px]:inline">Nova</span>
              <span className="hidden sm:inline">campanha</span>
              <span className="sr-only min-[360px]:hidden">Nova campanha</span>
            </button>
          )}
        </div>
        </div>
        <p className="text-[13px] leading-[18px] text-nq-muted max-w-xl">Criadas sempre pausadas na Meta. Só gastam depois do seu Sim.</p>
      </header>

      {/* no celular, com uma campanha aberta, o quadro do Sim fica na lista (volta ao tocar em "Campanhas") */}
      <div className={hasSelection ? 'hidden lg:block' : ''}>
      <LaunchPlansCard
        key={cardKey}
        apiFetch={apiFetch as any}
        currentUser={currentUser}
        isDemoView={isDemoView}
        showError={showError}
        showSuccess={showSuccess}
        onAnswered={() => {
          loadList();
          if (selectedId && !selectedId.startsWith('meta:')) loadCampaign(selectedId);
        }}
      />
      </div>

      {/* NORQVA-0095: pendências abertas, cada uma com a ação recomendada e o atalho para a campanha */}
      {problems.length > 0 && (
        <section className={hasSelection ? 'hidden lg:block' : ''} aria-label="Pendências" data-testid="campaign-problems">
          <h2 className="text-[13px] leading-[18px] font-semibold text-nq-muted mb-2">
            {problems.length === 1 ? '1 pendência precisa de ação' : `${problems.length} pendências precisam de ação`}
          </h2>
          <ul className="rounded-2xl bg-nq-surface divide-y divide-nq-line/70 overflow-hidden">
            {problems.slice(0, 5).map(n => (
              <AlertCard
                key={n.id}
                n={n}
                canAct={isAdmin || currentUser?.role === 'PERFORMANCE'}
                apiFetch={apiFetch}
                isDemoView={false}
                onOpenCampaign={x => {
                  if (!openFromAlert(focusOf(x))) showError('A campanha deste aviso não está mais na lista.');
                }}
                onChanged={m => {
                  setProblems(list => (m.is_open ? list.map(x => (x.id === m.id ? m : x)) : list.filter(x => x.id !== m.id)));
                  onAlertsChanged?.();
                }}
                showError={showError}
              />
            ))}
          </ul>
          {problems.length > 5 && <p className="mt-2 text-[12px] text-nq-muted">Mais {problems.length - 5} no sino, no topo da tela.</p>}
        </section>
      )}

      {creating && (
        <section className="rounded-2xl bg-nq-surface p-4 space-y-4" data-testid="new-campaign-form">
          <h2 className="text-[20px] leading-[26px] font-semibold">Nova campanha</h2>
          <label className="block space-y-1.5">
            <span className={label}>Oferta</span>
            <select aria-label="Oferta" value={creating.offer} onChange={e => setCreating({ ...creating, offer: e.target.value, creative_ids: [] })} className={input}>
              <option value="">Selecione…</option>
              {offers.map(o => (
                <option key={o.id} value={o.human_id}>{o.human_id} · {o.name}</option>
              ))}
            </select>
          </label>
          {creating.offer && (
            <div className="space-y-2">
              <div className={label}>Criativos aprovados (vídeo)</div>
              {newOptions.length === 0 && (
                <div className="space-y-1 text-[13px] text-nq-muted" data-testid="new-campaign-why">
                  <p>Nenhum criativo de vídeo aprovado para esta oferta.</p>
                  {newWhy.products.length > 0 && <p>Produtos considerados: {newWhy.products.join('; ')}.</p>}
                  {newWhy.notReady.length > 0 ? (
                    <ul className="list-disc pl-4">
                      {newWhy.notReady.map(c => (
                        <li key={c.human_id}>{c.human_id} ({c.product_name}): {c.reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Nenhum criativo cadastrado para esses produtos na tela Criativos.</p>
                  )}
                </div>
              )}
              {newOptions.map(c => (
                <label key={c.id} className="flex items-center gap-3 min-h-[44px] text-[15px] text-nq-text">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-nq-positive"
                    checked={creating.creative_ids.includes(c.id)}
                    onChange={e =>
                      setCreating({
                        ...creating,
                        creative_ids: e.target.checked ? [...creating.creative_ids, c.id] : creating.creative_ids.filter(x => x !== c.id)
                      })
                    }
                  />
                  <span className="min-w-0">{c.human_id}{c.hook ? ` · ${c.hook}` : ''}{c.same_product === false && c.product_name ? ` (criativo do ${c.product_name})` : ''}</span>
                </label>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className={label}>Orçamento por dia (R$)</span>
              <input inputMode="decimal" aria-label="Orçamento por dia" value={creating.daily} onChange={e => setCreating({ ...creating, daily: e.target.value })} className={input} />
            </label>
            <label className="block space-y-1.5">
              <span className={label}>Teto de gasto (R$)</span>
              <input inputMode="decimal" aria-label="Teto de gasto da nova campanha" value={creating.max} onChange={e => setCreating({ ...creating, max: e.target.value })} className={input} />
            </label>
          </div>
          {newDestination && (
            <p className="text-[13px] text-nq-muted break-all" data-testid="new-campaign-destination">Destino dos anúncios: <span className="text-nq-text">{newDestination}</span></p>
          )}
          <p className="text-[12px] leading-4 text-nq-subtle">Padrões: Brasil, 25–65 anos, público Advantage, pixel oficial e destino na página da oferta (no kit, a página do kit). Fica em rascunho.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={submitNew} disabled={!creating.offer || creating.creative_ids.length === 0 || busy === 'new'} className={btnLight}>
              Criar rascunho
            </button>
            <button onClick={() => setCreating(null)} className={btnGhost}>Cancelar</button>
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-[22rem_minmax(0,1fr)] gap-6 items-start">
        {/* no celular, a lista sai de cena quando uma campanha está aberta */}
        <aside className={`space-y-3 min-w-0 ${hasSelection ? 'hidden lg:block' : ''}`} data-testid="campaign-list">
          {campaigns.length === 0 && <p className="text-[13px] text-nq-muted">Nenhuma campanha ainda.</p>}
          {campaigns.length > 0 && (
            <div className="rounded-2xl bg-nq-surface overflow-hidden divide-y divide-nq-line/70">
              {campaigns.map(c => {
                const product = productOfPlan(c);
                const name = c.spec?.campaign?.name || c.code;
                const active = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full text-left px-4 py-4 transition-colors ${active ? 'bg-nq-raised' : 'active:bg-nq-raised'}`}
                  >
                    {cardBody({
                      title: product || name,
                      caption: product ? name : null,
                      metaId: planMetaId(c),
                      pill: <StatusPill tone={STATUS_TONE[c.status] || 'neutral'}>{CAMPAIGN_STATUS_LABEL[c.status] || c.status}</StatusPill>
                    })}
                  </button>
                );
              })}
            </div>
          )}
          {externals.length > 0 && <div className="pt-3 px-1 text-[13px] text-nq-muted">Criadas fora do NORQVA</div>}
          {externals.length > 0 && (
            <div className="rounded-2xl bg-nq-surface overflow-hidden divide-y divide-nq-line/70">
              {externals.map(m => {
                const product = productByMeta[String(m.meta_campaign_id)] || null;
                const raw = m.effective_status || m.status;
                return (
                  <button
                    key={`meta:${m.meta_campaign_id}`}
                    data-testid="external-campaign"
                    onClick={() => setSelectedId(`meta:${m.meta_campaign_id}`)}
                    className={`w-full text-left px-4 py-4 transition-colors ${selectedId === `meta:${m.meta_campaign_id}` ? 'bg-nq-raised' : 'active:bg-nq-raised'}`}
                  >
                    {cardBody({
                      title: product || m.name,
                      caption: product ? m.name : null,
                      metaId: String(m.meta_campaign_id),
                      pill: (
                        <StatusPill tone={metaTone(raw)}>
                          {sentence(getMetaDeliveryStatus(m.effective_status, m.status).label)} · criada fora do NORQVA
                        </StatusPill>
                      )
                    })}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {selectedMeta && (
          <section className="space-y-4 min-w-0" data-testid="external-detail">
            {back}
            {awaitingNotice}
            <div>
              <h2 className="text-[22px] leading-7 font-semibold break-words">{productByMeta[String(selectedMeta.meta_campaign_id)] || selectedMeta.name}</h2>
              {productByMeta[String(selectedMeta.meta_campaign_id)] && <div className="text-[12px] text-nq-subtle break-all mt-0.5">{selectedMeta.name}</div>}
              <p className="mt-2 text-[13px] leading-[18px] text-nq-muted">Criada fora do NORQVA: aqui você vê o resultado e pode pausar ou mudar o orçamento.</p>
            </div>
            <MetaAdsView currentUser={currentUser} isDemoView={false} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} scopeCampaignId={String(selectedMeta.meta_campaign_id)} />
          </section>
        )}

        {campaign && selectedId === campaign.id && (
          <div className="space-y-4 min-w-0">
            {back}
            {awaitingNotice}
            <div>
              {(() => {
                const product = productOfPlan(campaign);
                const name = campaign.spec?.campaign?.name || campaign.code;
                return (
                  <>
                    <h2 className="text-[22px] leading-7 font-semibold break-words">{product || name}</h2>
                    {product && <div className="text-[12px] text-nq-subtle break-all mt-0.5">{name}</div>}
                  </>
                );
              })()}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusPill tone={STATUS_TONE[campaign.status] || 'neutral'}>{CAMPAIGN_STATUS_LABEL[campaign.status] || campaign.status}</StatusPill>
                <span className="text-[13px] text-nq-muted tabular-nums">{brl(campaign.daily_budget_brl)}/dia · teto {brl(campaign.max_spend_brl)}</span>
              </div>
              {/* NORQVA-0096: Pausar sempre à vista (só administrador; mesma confirmação de Resultados) */}
              {(() => {
                const mc = metaCampaigns.find((m: any) => String(m.meta_campaign_id) === planMetaId(campaign));
                return mc ? (
                  <div className="mt-3">
                    <PauseBar
                      metaCampaign={mc}
                      allowResume={['APPROVED', 'ACTIVE'].includes(campaign.status) && campaign.guard_state !== 'CAPPED'}
                      currentUser={currentUser}
                      apiFetch={apiFetch}
                      showError={showError}
                      showSuccess={showSuccess}
                      onDone={() => {
                        loadList();
                        loadCampaign(campaign.id);
                      }}
                    />
                  </div>
                ) : null;
              })()}
            </div>

            <nav className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto no-scrollbar" role="tablist" data-testid="campaign-tabs">
              {([
                ['overview', 'Visão geral'],
                ['config', 'Configurações'],
                ['creatives', 'Criativos'],
                ['results', 'Resultados'],
                ['history', 'Histórico']
              ] as const).map(([id, tabLabel]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`shrink-0 h-10 px-4 rounded-full text-[13px] font-medium transition-colors ${tab === id ? 'bg-nq-text text-nq-bg' : 'bg-nq-surface text-nq-muted'}`}
                >
                  {tabLabel}
                </button>
              ))}
            </nav>

            {tab === 'results' &&
              (planMetaId(campaign) ? (
                <MetaAdsView currentUser={currentUser} isDemoView={false} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} scopeCampaignId={planMetaId(campaign)} />
              ) : (
                <p className="rounded-2xl bg-nq-surface p-4 text-[13px] text-nq-muted" data-testid="results-empty">A campanha ainda não foi criada na Meta: os resultados aparecem depois.</p>
              ))}

            {tab === 'overview' && (
              <CampaignOverview
                campaign={campaign}
                metrics={metricsOf(planMetaId(campaign))}
                problems={problems.filter(n => {
                  const cid = n.entity.meta_campaign_id ? String(n.entity.meta_campaign_id) : adToCampaign.get(String(n.entity.meta_ad_id || ''));
                  return (!!cid && cid === planMetaId(campaign)) || (!!n.entity.plan_code && n.entity.plan_code === campaign.code);
                })}
                metaStatusLabel={(() => {
                  const mc = metaCampaigns.find((m: any) => String(m.meta_campaign_id) === planMetaId(campaign));
                  return mc ? sentence(getMetaDeliveryStatus(mc.effective_status, mc.status).label) : null;
                })()}
                canAct={isAdmin || currentUser?.role === 'PERFORMANCE'}
                apiFetch={apiFetch}
                showError={showError}
                onOpenAlert={n => setTab(n.link.tab === 'cap' ? 'config' : 'results')}
                onAlertChanged={m => {
                  setProblems(list => (m.is_open ? list.map(x => (x.id === m.id ? m : x)) : list.filter(x => x.id !== m.id)));
                  onAlertsChanged?.();
                }}
              />
            )}

            {tab === 'history' && <CampaignHistory campaignId={campaign.id} apiFetch={apiFetch} />}

            {tab === 'config' && (
          <section className="space-y-4" data-testid="campaign-detail">
            {campaign.last_error && <div className="rounded-2xl bg-nq-critical/10 p-4 text-[13px] text-nq-critical-text">Último erro: {campaign.last_error}</div>}
            {editable && (
              <div className="flex flex-wrap gap-2">
                <button onClick={fill} disabled={busy === 'fill'} className={btnGhost}>
                  <Wand2 aria-hidden="true" className="h-4 w-4" /> Preencher com os criativos aprovados
                </button>
                <button onClick={blank} data-testid="blank-fields" className={btnGhost}>
                  <Eraser aria-hidden="true" className="h-4 w-4" /> Zerar
                </button>
                <button onClick={resetAuto} disabled={busy === 'reset'} className={btnGhost}>
                  <RotateCcw aria-hidden="true" className="h-4 w-4" /> Voltar ao automático
                </button>
              </div>
            )}

            {!editable && (
              <p className="rounded-2xl bg-nq-surface p-4 text-[13px] leading-[18px] text-nq-muted" data-testid="campaign-readonly">
                {isAdmin
                  ? 'Esta campanha já existe na Meta. Pausar fica no topo; orçamento por conjunto em Resultados; o teto logo abaixo, em Teto e vigia; ativar é pelo seu Sim no quadro "Aguardando sua decisão", na lista de campanhas. Para trocar link, texto, título ou botão de um anúncio, use "Editar anúncio na Meta" na aba Criativos.'
                  : 'Só leitura: configurar, pausar e responder Sim ficam com o ADMIN.'}
              </p>
            )}

            {fillResults && fillResults.some(r => r.status === 'SKIPPED') && (
              <ul className="rounded-2xl bg-nq-attention/10 p-4 space-y-1 text-[13px] text-nq-attention" data-testid="fill-results">
                {fillResults.filter(r => r.status === 'SKIPPED').map(r => (
                  <li key={r.index}>Anúncio {r.index + 1} ({r.ad}): {r.reason}</li>
                ))}
              </ul>
            )}

            <div className="rounded-2xl bg-nq-surface p-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {(campaign.spec?.adsets || []).map((s: any, i: number) => (
                  <label key={s.name} className="block space-y-1.5">
                    <span className={label}>Orçamento por dia (R$)<ManualTag path={`adsets.${i}.daily_budget_brl`} /><span className="block text-[12px] text-nq-subtle break-all">{s.name}</span></span>
                    <input
                      inputMode="decimal"
                      aria-label={`Orçamento do conjunto ${i + 1}`}
                      disabled={!editable}
                      value={form[`adsets.${i}.daily_budget_brl`] ?? ''}
                      onChange={e => setForm({ ...form, [`adsets.${i}.daily_budget_brl`]: e.target.value })}
                      className={input}
                    />
                  </label>
                ))}
                <label className="block space-y-1.5">
                  <span className={label}>Teto de gasto da campanha (R$)<ManualTag path="max_spend_brl" /></span>
                  <input inputMode="decimal" aria-label="Teto de gasto" disabled={!editable} value={form.max_spend_brl ?? ''} onChange={e => setForm({ ...form, max_spend_brl: e.target.value })} className={input} />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className={label}>Hipótese<ManualTag path="hypothesis" /></span>
                <textarea aria-label="Hipótese" disabled={!editable} value={form.hypothesis ?? ''} onChange={e => setForm({ ...form, hypothesis: e.target.value })} className={area} rows={2} />
              </label>
            </div>

            {editable && (
              <footer className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={save}
                  disabled={changed.length === 0 || busy === 'save'}
                  data-testid="save-fields"
                  className={btnLight}
                >
                  <Save aria-hidden="true" className="h-4 w-4" /> Salvar alterações{changed.length ? ` (${changed.length})` : ''}
                </button>
                <button
                  onClick={() => setConfirmCreate(true)}
                  disabled={!filled || changed.length > 0 || busy === 'meta'}
                  title={!filled ? 'Preencha o vídeo de todos os anúncios' : changed.length > 0 ? 'Salve as alterações antes' : undefined}
                  data-testid="create-on-meta"
                  className={btnPrimary}
                >
                  <Rocket aria-hidden="true" className="h-4 w-4" /> Criar na Meta (pausada)
                </button>
                {!filled && <span className="w-full text-[12px] text-nq-subtle">Para criar na Meta, todos os anúncios precisam de vídeo.</span>}
                {busy === 'meta' && <span className="w-full text-[13px] text-nq-muted">Enviando os vídeos para a Meta… pode levar alguns minutos.</span>}
              </footer>
            )}

            {confirmCreate && (
              <div role="dialog" aria-label="Confirmar criação na Meta" className="rounded-2xl bg-nq-raised p-4 space-y-3" data-testid="confirm-create">
                <p className="text-[15px] leading-[22px] text-nq-text">
                  Criar {campaign.spec?.ads?.length} anúncio(s) na Meta, <strong>tudo pausado</strong>. Nada é gasto agora: a campanha só começa a rodar
                  depois que você responder Sim, com {brl(campaign.daily_budget_brl)}/dia e teto de {brl(campaign.max_spend_brl)}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={createOnMeta} className={btnPrimary}>Criar pausada</button>
                  <button onClick={() => setConfirmCreate(false)} className={btnGhost}>Cancelar</button>
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-nq-surface overflow-hidden">
              <Disclosure summary="Detalhes técnicos" testId="campaign-tech">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12px]">
                  <dt className="text-nq-muted">Código</dt>
                  <dd className="font-mono text-nq-text">{campaign.code}</dd>
                  <dt className="text-nq-muted">Oferta</dt>
                  <dd className="font-mono text-nq-text">{campaign.offer_human_id}</dd>
                  <dt className="text-nq-muted">Campanha na Meta</dt>
                  <dd className="font-mono text-nq-text break-all">{campaign.spec?.campaign?.name || '—'}</dd>
                  <dt className="text-nq-muted">ID na Meta</dt>
                  <dd className="font-mono text-nq-text break-all">{planMetaId(campaign) || 'ainda não criada'}</dd>
                </dl>
              </Disclosure>
            </div>
          </section>
            )}
            {tab === 'config' && (
              <div className="space-y-3" data-testid="cap-tab">
                <h3 className="text-[15px] font-semibold text-nq-text">Teto e vigia</h3>
                {/* NORQVA-0084: as regras ficam em "Regras do vigia", dentro do cartão */}
                <p className="text-[13px] leading-[18px] text-nq-muted">
                  O teto da campanha é <span className="text-nq-text">{brl(campaign.max_spend_brl)}</span>.
                </p>
                <ExperimentGuardCard
                  apiFetch={apiFetch as any}
                  currentUser={currentUser}
                  isDemoView={false}
                  showError={showError}
                  showSuccess={showSuccess}
                  planId={campaign.id}
                  onChanged={() => {
                    loadCampaign(campaign.id);
                    loadList();
                  }}
                />
                {!['APPROVED', 'ACTIVE'].includes(campaign.status) && <p className="text-[13px] text-nq-subtle">O vigia começa depois do seu Sim.</p>}
              </div>
            )}

            {tab === 'config' && (
              <div className="rounded-2xl bg-nq-surface overflow-hidden">
                <Disclosure summary="Método" testId="campaign-method">
                  <MethodView currentUser={currentUser} isDemoView={false} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} offerHumanId={campaign.offer_human_id} />
                </Disclosure>
              </div>
            )}
            {tab === 'config' && (() => {
              const exp = experiments.find(e => e.id === campaign.experiment_id);
              return (
                <div className="rounded-2xl bg-nq-surface overflow-hidden">
                <Disclosure summary="Experimento" testId="campaign-experiment">
                <div className="text-[13px] leading-5 space-y-1.5" data-testid="experiment-tab">
                  {!exp ? (
                    <p className="text-nq-muted">O experimento nasce quando você responde Sim; até lá não há capital reservado.</p>
                  ) : (
                    <>
                      <div className="text-[15px] font-semibold text-nq-text">{exp.name}</div>
                      <div className="text-nq-subtle">{exp.human_id}</div>
                      <div className="text-nq-muted">Situação: <span className="text-nq-text">{expStatus(exp.status)}</span></div>
                      <div className="text-nq-muted">Capital autorizado: <span className="text-nq-text tabular-nums">{brl(Number(exp.capital_approved))}</span> · usado: <span className="text-nq-text tabular-nums">{brl(Number(exp.capital_used))}</span></div>
                      {exp.hypothesis && <div className="text-nq-muted">Hipótese: <span className="text-nq-text">{exp.hypothesis}</span></div>}
                      <div className="text-nq-subtle">Resposta: {campaign.answer === 'YES' ? 'Sim' : campaign.answer === 'NO' ? 'Não' : '—'}{campaign.answered_at ? ` em ${new Date(campaign.answered_at).toLocaleString('pt-BR')}` : ''}</div>
                    </>
                  )}
                </div>
                </Disclosure>
                </div>
              );
            })()}

            {tab === 'creatives' && (
          <section className="space-y-4" data-testid="creatives-tab">
            {!editable && isAdmin && (
              <p className="rounded-2xl bg-nq-surface p-4 text-[13px] leading-[18px] text-nq-muted">
                A campanha já está na Meta. Para trocar link, texto, título ou botão, use "Editar anúncio na Meta" no anúncio: a Meta revisa a peça nova antes de veicular.
              </p>
            )}
            <div className="space-y-3">
              {(campaign.spec?.ads || []).map((a: any, i: number) => (
                <article key={i} className="rounded-2xl bg-nq-surface p-4 space-y-4" data-testid="campaign-ad">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold">Anúncio {i + 1}</div>
                      <div className="text-[12px] text-nq-subtle break-all">{a.name}</div>
                    </div>
                    <StatusPill tone={a.video_url && a.video_url !== 'TO_BE_FILLED' ? 'positive' : 'attention'}>
                      {a.video_url && a.video_url !== 'TO_BE_FILLED' ? 'vídeo pronto' : 'vídeo a preencher'}
                    </StatusPill>
                  </div>
                  <label className="block space-y-1.5">
                    <span className={label}>Criativo<ManualTag path={`ads.${i}.creative`} /></span>
                    <select
                      aria-label={`Criativo do anúncio ${i + 1}`}
                      disabled={!editable || busy === `pick-${i}`}
                      value={campaign.ad_creatives?.[String(i)] || ''}
                      onChange={e => chooseCreative(i, e.target.value)}
                      className={input}
                    >
                      <option value="">Automático (pelo nome do anúncio)</option>
                      {options.map(o => (
                        <option key={o.id} value={o.id} disabled={!o.ok}>
                          {o.human_id}{o.ok ? '' : ` — ${o.reason}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5">
                    <span className={label}>Texto do anúncio<ManualTag path={`ads.${i}.primary_text`} /></span>
                    <textarea aria-label={`Texto do anúncio ${i + 1}`} disabled={!editable} rows={3} value={form[`ads.${i}.primary_text`] ?? ''} onChange={e => setForm({ ...form, [`ads.${i}.primary_text`]: e.target.value })} className={area} />
                  </label>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="block space-y-1.5">
                      <span className={label}>Título<ManualTag path={`ads.${i}.headline`} /></span>
                      <input aria-label={`Título do anúncio ${i + 1}`} disabled={!editable} value={form[`ads.${i}.headline`] ?? ''} onChange={e => setForm({ ...form, [`ads.${i}.headline`]: e.target.value })} className={input} />
                    </label>
                    <label className="block space-y-1.5">
                      <span className={label}>Botão<ManualTag path={`ads.${i}.cta`} /></span>
                      <select aria-label={`Botão do anúncio ${i + 1}`} disabled={!editable} value={form[`ads.${i}.cta`] ?? ''} onChange={e => setForm({ ...form, [`ads.${i}.cta`]: e.target.value })} className={input}>
                        {Object.entries(CTA_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block space-y-1.5">
                    <span className={label}>Link de destino<ManualTag path={`ads.${i}.destination_url`} /></span>
                    <input inputMode="url" aria-label={`Link do anúncio ${i + 1}`} disabled={!editable} value={form[`ads.${i}.destination_url`] ?? ''} onChange={e => setForm({ ...form, [`ads.${i}.destination_url`]: e.target.value })} className={input} />
                  </label>
                  {!editable && isAdmin && campaign.status !== 'CREATING' && campaign.meta_ids?.ads?.[a.name] && (
                    <AdMetaSwap
                      key={`${campaign.id}-${i}-${campaign.updated_at || ''}`}
                      campaignId={campaign.id}
                      campaignCode={campaign.code}
                      index={i}
                      ad={a}
                      apiFetch={apiFetch}
                      showError={showError}
                      showSuccess={showSuccess}
                      onDone={c => {
                        applyCampaign(c);
                        loadList();
                      }}
                    />
                  )}
                </article>
              ))}
            </div>

            {editable && (
              <footer className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={save} disabled={changed.length === 0 || busy === 'save'} data-testid="save-fields" className={btnLight}>
                  <Save aria-hidden="true" className="h-4 w-4" /> Salvar alterações{changed.length ? ` (${changed.length})` : ''}
                </button>
                <span className="w-full text-[12px] text-nq-subtle">Para criar na Meta, use o botão em Configurações.</span>
              </footer>
            )}
          </section>
            )}
          </div>
        )}
      </div>

      {legacyExperiments.length > 0 && (
        <section className={`space-y-3 ${hasSelection ? 'hidden lg:block' : ''}`} data-testid="experiment-history">
          <h2 className="px-1 text-[13px] text-nq-muted">Histórico de experimentos (antes das campanhas)</h2>
          <div className="rounded-2xl bg-nq-surface overflow-hidden divide-y divide-nq-line/70">
            {legacyExperiments.map(e => (
              <div key={e.id} className="px-4 py-3.5 flex items-start justify-between gap-3 text-[13px]">
                <div className="min-w-0">
                  <div className="text-[15px] text-nq-text">{e.name}</div>
                  <div className="text-nq-subtle">{e.human_id} · {expStatus(e.status)}</div>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <div className="text-nq-text">{brl(Number(e.capital_used))}</div>
                  <div className="text-nq-subtle">de {brl(Number(e.capital_approved))}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
