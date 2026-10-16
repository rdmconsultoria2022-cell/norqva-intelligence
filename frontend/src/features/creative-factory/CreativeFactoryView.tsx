import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Factory, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, PencilLine, RefreshCw, Download, Link2, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { UserObj } from '../../types';
import { useGlobalPeriod, periodQuery } from '../../lib/globalPeriod';
import { CreativePreview } from '../../components/CreativePreview';
import { ViewModeSelector, useViewMode, containerClass, isIconMode, IconTile, groupByCampaign } from '../../components/ViewModes';
import { NewCreativeForm, NewCreativeInput, CLAIM_TYPE_LABEL } from './NewCreativeForm';
import { adDelivery, DeliveryBadge, MetaImage, AdPreviewButton } from '../../components/AdLivePreview';
import { TrashAction } from '../products/CatalogTrash';
import { CreativeTrash } from './CreativeTrash';

// NORQVA-0058: lembra se as claims ficam abertas (preferência só deste navegador)
const CLAIMS_KEY = 'norqva.factory.showClaims';
const readShowClaims = () => {
  try {
    return window.localStorage.getItem(CLAIMS_KEY) === '1';
  } catch {
    return false;
  }
};

// NORQVA-0005 / G1: Creative Factory — batch matrix, claims gate, human approval and
// a deterministic scorecard per creative (Meta ad name == creative key).

export interface CreativeFactoryViewProps {
  currentUser: UserObj | null;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  /** NORQVA-0025: produtos e ofertas para o cadastro manual de criativo */
  products?: any[];
  offers?: any[];
  /** Avisa o App para recarregar a lista global de criativos depois de um cadastro */
  onCreativeCreated?: () => void;
}

// NORQVA-0025: de onde veio o criativo
const ORIGIN_LABEL: Record<string, { label: string; cls: string }> = {
  BATCH: { label: 'Lote', cls: 'border-nq-line text-nq-text' },
  AI_TEAM: { label: 'Time de IAs', cls: 'border-nq-info/40 text-nq-info' },
  MANUAL: { label: 'Manual', cls: 'border-nq-positive/40 text-nq-positive-text' },
  META: { label: 'Meta', cls: 'border-indigo-700/60 text-indigo-300' }
};

const APPROVAL_LABEL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Aguardando revisão', cls: 'bg-nq-raised text-nq-text border-nq-line' },
  APPROVED: { label: 'Aprovado', cls: 'bg-nq-positive/10 text-nq-positive-text border-nq-positive/40' },
  REJECTED: { label: 'Rejeitado', cls: 'bg-nq-critical/10 text-nq-critical-text border-nq-critical/40' },
  REVISION_REQUESTED: { label: 'Ajuste pedido', cls: 'bg-nq-attention/10 text-nq-attention border-nq-attention/40' },
  SUPERSEDED: { label: 'Substituído', cls: 'bg-nq-surface text-nq-subtle border-nq-line' }
};

const RECOMMENDATION_LABEL: Record<string, { label: string; cls: string }> = {
  NOT_PUBLISHED: { label: 'Não publicado', cls: 'text-nq-subtle' },
  INSUFFICIENT_DATA: { label: 'Dados insuficientes', cls: 'text-nq-muted' },
  OBSERVING: { label: 'Observando', cls: 'text-nq-info' },
  PAUSE_RECOMMENDED: { label: 'Pausar', cls: 'text-nq-critical-text' },
  UNDERPERFORMING: { label: 'Abaixo do equilíbrio', cls: 'text-nq-attention' },
  PROMISING: { label: 'Promissor', cls: 'text-nq-positive-text' },
  WINNER_CANDIDATE: { label: 'Candidato a vencedor', cls: 'text-nq-positive-text font-bold' }
};

const REASON_LABEL: Record<string, string> = {
  WEAK_HOOK: 'Hook fraco',
  ARTIFICIAL_LOOK: 'Aparência artificial',
  BAD_COPY: 'Texto ruim',
  EXAGGERATED_PROMISE: 'Promessa exagerada',
  UNCLEAR_PRODUCT: 'Produto pouco claro',
  BAD_VIDEO: 'Vídeo ruim',
  WRONG_IDENTITY: 'Identidade inadequada',
  BAD_CTA: 'CTA inadequado',
  OFF_STRATEGY: 'Fora da estratégia',
  POLICY_RISK: 'Risco de política da Meta',
  OTHER: 'Outro'
};

const brl = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ADJ_STATUS: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: 'Na fila', cls: 'bg-nq-raised text-nq-text' },
  NOT_CONFIGURED: { label: 'Automação não configurada', cls: 'bg-nq-raised text-nq-attention' },
  DISPATCHED: { label: 'Enviado ao Claude', cls: 'bg-nq-info/10 text-nq-info' },
  IN_PROGRESS: { label: 'Claude trabalhando', cls: 'bg-nq-info/10 text-nq-info' },
  DONE: { label: 'Nova versão pronta', cls: 'bg-nq-positive/10 text-nq-positive-text' },
  NEEDS_INPUT: { label: 'Precisa de você', cls: 'bg-nq-attention/10 text-nq-attention' },
  FAILED: { label: 'Falhou', cls: 'bg-nq-critical/10 text-nq-critical-text' }
};

export function CreativeFactoryView({
  currentUser,
  isDemoView,
  apiFetch,
  showError,
  showSuccess,
  products = [],
  offers = [],
  onCreativeCreated
}: CreativeFactoryViewProps) {
  const { globalPeriod } = useGlobalPeriod();
  const periodQs = periodQuery(globalPeriod);
  const mode = isDemoView ? 'demo' : 'real';
  const isAdmin = currentUser?.role === 'ADMIN';
  const canRevise = isAdmin || currentUser?.role === 'CREATIVE';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [hookFilter, setHookFilter] = useState<string>('ALL');
  // Organização por campanha: todas / ativas / pausadas, e mostrar ou não os criativos não publicados
  const [campaignFilter, setCampaignFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [showUnpublished, setShowUnpublished] = useState(true);
  // NORQVA-0036: só anúncios que estão de fato entregando (anúncio, conjunto e campanha ativos)
  const [onlyRunning, setOnlyRunning] = useState(false);
  const [rejecting, setRejecting] = useState<{ id: string; decision: 'REJECTED' | 'REVISION_REQUESTED' } | null>(null);
  const [reason, setReason] = useState('WEAK_HOOK');
  const [notes, setNotes] = useState('');
  // NORQVA-0058: todo o conteúdo do criativo é editável
  const [editing, setEditing] = useState<{
    id: string; hook: string; mechanism: string; headline: string; primary_text: string; cta: string; script: string; file_url: string;
  } | null>(null);
  const [showClaims, setShowClaimsState] = useState<boolean>(readShowClaims);
  const setShowClaims = (v: boolean) => {
    setShowClaimsState(v);
    try {
      window.localStorage.setItem(CLAIMS_KEY, v ? '1' : '0');
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  };
  // NORQVA-0058: procurar o criativo pelo nome da campanha
  const [campaignName, setCampaignName] = useState<string>('ALL');
  const [trashKey, setTrashKey] = useState(0);
  const [linking, setLinking] = useState<{ id: string; meta_ad_id: string } | null>(null);
  const [attaching, setAttaching] = useState<{ id: string; file_url: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [claiming, setClaiming] = useState<{ id: string; product_id: string; claim_id: string; claim_text: string; claim_type: string } | null>(null);
  // NORQVA-0011: display mode (list / grid / icons) and the card to focus when opening from a tile
  const [viewMode, setViewMode] = useViewMode('norqva.factory.viewMode');
  const [focusId, setFocusId] = useState<string | null>(null);

  // App re-creates apiFetch/showError/showSuccess on every render: keep them in refs so the
  // loader only changes with mode/period (same pattern as CreativePerformanceView).
  const apiFetchRef = React.useRef(apiFetch);
  apiFetchRef.current = apiFetch;
  const showErrorRef = React.useRef(showError);
  showErrorRef.current = showError;
  const showSuccessRef = React.useRef(showSuccess);
  showSuccessRef.current = showSuccess;

  // NORQVA-0013: adjustment tasks sent to Claude
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const loadAdjustments = useCallback(async () => {
    try {
      const r = await apiFetchRef.current(`/creative-factory/adjustments?mode=${mode}`);
      setAdjustments(Array.isArray(r?.adjustments) ? r.adjustments : []);
    } catch {
      /* keep previous */
    }
  }, [mode]);
  const working = adjustments.some(a => a.status === 'DISPATCHED' || a.status === 'IN_PROGRESS');
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => {
      loadAdjustments();
    }, 20000);
    return () => clearInterval(t);
  }, [working, loadAdjustments]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetchRef.current(`/creative-factory/creatives?mode=${mode}&${periodQs}`);
      setData(res);
      loadAdjustments();
    } catch (err: any) {
      showErrorRef.current(err.message || 'Erro ao carregar os criativos.');
    } finally {
      setLoading(false);
    }
  }, [mode, periodQs]);

  useEffect(() => {
    load();
  }, [load]);

  // Devolve true quando deu certo (NORQVA-0025: formulários só fecham em caso de sucesso)
  const run = async (key: string, fn: () => Promise<any>, ok: string): Promise<boolean> => {
    setBusy(key);
    try {
      await fn();
      showSuccessRef.current(ok);
      await load();
      return true;
    } catch (err: any) {
      showErrorRef.current(err.message || 'Operação falhou.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const post = (url: string, body: any = {}, method = 'POST') =>
    apiFetchRef.current(url, { method, body: JSON.stringify(body) });

  const importBatch = (code: string) =>
    run(`import-${code}`, () => post(`/creative-factory/batches/${code}/import?mode=${mode}`), `Lote ${code} importado.`);

  const setClaim = (id: string, status: string, note?: string) =>
    run(`claim-${id}`, () => post(`/creative-factory/claims/${id}?mode=${mode}`, { status, note }, 'PATCH'), 'Claim atualizada.');

  const approve = (id: string) =>
    run(`review-${id}`, () => post(`/creative-factory/creatives/${id}/review?mode=${mode}`, { decision: 'APPROVED' }), 'Criativo aprovado.');
  // NORQVA-0053 (D-0053): o NORQVA lê o texto, mas não o que está dentro do vídeo ou da imagem.
  // Com arquivo anexado, quem aprova confirma que ele não mostra nem fala preço.
  const [confirmNoPrice, setConfirmNoPrice] = useState<string | null>(null);
  const askApprove = (c: any) => (c.file_url ? setConfirmNoPrice(c.id) : approve(c.id));

  const submitReview = () => {
    if (!rejecting) return;
    const { id, decision } = rejecting;
    return run(
      `review-${id}`,
      () => post(`/creative-factory/creatives/${id}/review?mode=${mode}`, { decision, reason_code: reason, notes: notes || null }),
      decision === 'REJECTED' ? 'Criativo rejeitado.' : 'Ajuste pedido.'
    ).then(() => {
      setRejecting(null);
      setNotes('');
    });
  };

  // NORQVA-0066: trocar a oferta (e o produto) de um criativo ainda não publicado
  const [offerPick, setOfferPick] = useState<Record<string, string>>({});
  const submitOffer = (c: any) => {
    const offerId = offerPick[c.id] || '';
    if (!offerId || offerId === String(c.offer_id || '')) return;
    return run(
      `offer-${c.id}`,
      () => post(`/creative-factory/creatives/${c.id}/offer?mode=${mode}`, { offer_id: offerId }),
      'Oferta do criativo trocada. Confira as promessas: as levadas ao produto novo precisam ser verificadas de novo.'
    ).then(ok => {
      if (ok) setOfferPick(prev => { const n = { ...prev }; delete n[c.id]; return n; });
    });
  };

  const submitEdit = () => {
    if (!editing) return;
    const { id, hook, mechanism, headline, primary_text, cta, script, file_url } = editing;
    return run(
      `revise-${id}`,
      () =>
        post(`/creative-factory/creatives/${id}/revise?mode=${mode}`, {
          hook,
          mechanism: mechanism.trim() || null,
          headline,
          primary_text,
          cta,
          script,
          file_url: file_url || null
        }),
      'Criativo atualizado.'
    ).then(() => setEditing(null));
  };

  // NORQVA-0007: attach the produced file without creating a new version
  const submitAttach = () => {
    if (!attaching) return;
    const { id, file_url } = attaching;
    return run(
      `file-${id}`,
      () => post(`/creative-factory/creatives/${id}/file?mode=${mode}`, { file_url: file_url.trim() }),
      'Arquivo anexado ao criativo.'
    ).then(() => setAttaching(null));
  };

  // NORQVA-0025: cadastro manual (arquivo opcional) e promessas do criativo
  const submitNew = (form: NewCreativeInput) =>
    run(
      'new-creative',
      () => post(`/creatives?mode=${mode}`, { ...form, offer_id: form.offer_id || null, file_url: form.file_url || null }),
      'Criativo cadastrado. Anexe o arquivo e registre as promessas para poder aprovar.'
    ).then(ok => {
      if (!ok) return;
      setCreating(false);
      onCreativeCreated?.();
    });

  const submitClaim = () => {
    if (!claiming) return;
    const { id, claim_id, claim_text, claim_type } = claiming;
    const body = claim_id ? { claim_id } : { claim_text: claim_text.trim(), claim_type };
    return run(`claim-add-${id}`, () => post(`/creative-factory/creatives/${id}/claims?mode=${mode}`, body), 'Promessa registrada.').then(ok => {
      if (ok) setClaiming(null);
    });
  };

  const attachBatchAssets = (code: string) =>
    run(`assets-${code}`, () => post(`/creative-factory/batches/${code}/attach-assets?mode=${mode}`), `Arquivos produzidos do ${code} anexados.`);

  const submitLink = () => {
    if (!linking) return;
    const { id, meta_ad_id } = linking;
    return run(
      `link-${id}`,
      () => post(`/creative-factory/creatives/${id}/link-ad?mode=${mode}`, { meta_ad_id: meta_ad_id.trim() }),
      'Anúncio ligado ao criativo.'
    ).then(() => setLinking(null));
  };

  const creatives: any[] = data?.creatives || [];
  const hooks = useMemo(() => [...new Set(creatives.map(c => c.hook_family).filter(Boolean))], [creatives]);
  const visible = creatives.filter(
    c =>
      (statusFilter === 'ALL' || c.approval_status === statusFilter) &&
      (hookFilter === 'ALL' || c.hook_family === hookFilter) &&
      (statusFilter === 'SUPERSEDED' || c.approval_status !== 'SUPERSEDED')
  );
  const counts = creatives.reduce((acc: Record<string, number>, c) => {
    acc[c.approval_status] = (acc[c.approval_status] || 0) + 1;
    return acc;
  }, {});
  const notImported: string[] = (data?.availableBatches || []).filter((b: string) => !(data?.importedBatches || []).includes(b));
  const claims: any[] = data?.claims || [];
  const pendingClaims = claims.filter(c => c.status === 'UNVERIFIED');
  const hasFile = (c: any) => !!c.file_url && /^https?:\/\//i.test(c.file_url);
  const pendingAssets: { code: string; count: number }[] = Object.entries((data?.producedAssets || {}) as Record<string, string[]>)
    .map(([code, keys]) => ({
      code,
      count: creatives.filter(
        c => c.batch_code === code && c.approval_status !== 'SUPERSEDED' && !hasFile(c) && keys.includes(String(c.human_id).replace(/-DEMO$/, ''))
      ).length
    }))
    .filter(x => x.count > 0);

  // Todas as campanhas da conta (quando o backend envia `campaigns`); senão, o agrupamento antigo.
  const allCampaigns: any[] | null = Array.isArray(data?.campaigns) ? data.campaigns : null;
  const noCreativeFilter = statusFilter === 'ALL' && hookFilter === 'ALL';
  // NORQVA-0036: anúncios da Meta por id, para dar imagem, situação real e prévia aos criativos ligados
  const adsByMetaId = new Map<string, any>();
  for (const cp of allCampaigns || []) for (const a of cp.ads || []) adsByMetaId.set(String(a.meta_ad_id), a);
  const linkedAdsOf = (c: any): any[] => {
    const ids = new Set<string>([...(c.linked_meta_ads || []).map(String), ...(c.campaigns || []).flatMap((cp: any) => (cp.meta_ad_ids || []).map(String))]);
    return [...ids].map(id => adsByMetaId.get(id)).filter(Boolean);
  };
  const isRunning = (a: any) => adDelivery(a).key === 'RUNNING';
  const metaImageOf = (c: any): string | null => {
    const ads = linkedAdsOf(c);
    const best = ads.find(a => isRunning(a) && (a.image_url || a.thumbnail_url)) || ads.find(a => a.image_url || a.thumbnail_url);
    return best ? best.image_url || best.thumbnail_url : null;
  };
  const creativeRunning = (c: any) => linkedAdsOf(c).some(isRunning);
  const campaignStatusOf = (cp: { status?: string | null }) => (cp.status === 'ACTIVE' ? 'ACTIVE' : cp.status === 'PAUSED' ? 'PAUSED' : 'OTHER');
  const campaignCounts = (allCampaigns || []).reduce(
    (acc: Record<string, number>, cp: any) => {
      acc[campaignStatusOf(cp)] += 1;
      return acc;
    },
    { ACTIVE: 0, PAUSED: 0, OTHER: 0 }
  );
  const unpublished = visible.filter(c => !(c.campaigns || []).length);
  // NORQVA-0058: campanha escolhida que sumiu depois de recarregar volta para "todas"
  useEffect(() => {
    if (campaignName !== 'ALL' && campaignName !== '__none__' && allCampaigns && !allCampaigns.some(cp => String(cp.meta_campaign_id) === campaignName)) {
      setCampaignName('ALL');
    }
  }, [campaignName, allCampaigns]);
  type Group = { key: string; name: string; status: string | null; effective?: string | null; items: any[]; externalAds: any[] };
  const groups: Group[] = allCampaigns
    ? [
        ...allCampaigns
          .filter(cp => campaignName !== 'ALL' || campaignFilter === 'ALL' || campaignStatusOf(cp) === campaignFilter)
          .filter(cp => campaignName === 'ALL' || (campaignName !== '__none__' && String(cp.meta_campaign_id) === campaignName))
          .map(cp => ({
            key: cp.meta_campaign_id,
            name: cp.name,
            status: cp.status,
            effective: cp.effective_status,
            items: visible.filter(c => (c.campaigns || []).some((x: any) => x.meta_campaign_id === cp.meta_campaign_id) && (!onlyRunning || creativeRunning(c))),
            // anúncios da campanha que não vieram da Fábrica (sem status de aprovação: só aparecem sem filtro de criativo)
            externalAds: noCreativeFilter ? (cp.ads || []).filter((a: any) => !a.factory_creative_id && (!onlyRunning || isRunning(a))) : []
          }))
          .filter(g => (noCreativeFilter && !onlyRunning) || g.items.length > 0 || g.externalAds.length > 0)
          .sort((a, b) => {
            const rank = (g: Group) => (g.status === 'ACTIVE' ? 0 : g.status === 'PAUSED' ? 1 : 2);
            return rank(a) - rank(b) || a.name.localeCompare(b.name);
          }),
        ...(((showUnpublished && campaignName === 'ALL') || campaignName === '__none__') && !onlyRunning && unpublished.length > 0
          ? [{ key: '__none__', name: 'Criativos não publicados', status: null, items: unpublished, externalAds: [] }]
          : [])
      ]
    : groupByCampaign(visible).map(g => ({ ...g, externalAds: [] as any[] }));
  const revisionQueue = creatives.filter(c => c.approval_status === 'REVISION_REQUESTED');
  const openAdjustments = adjustments.filter(a => a.status !== 'DONE' || (a.result_creative_id && creatives.some(c => c.id === a.result_creative_id && c.approval_status === 'DRAFT')));
  const queueItems: any[] = [
    ...openAdjustments.map(a => ({ ...a, key: a.id, legacy: false })),
    // requests made before NORQVA-0013 (no task yet)
    ...revisionQueue
      .filter(c => !adjustments.some(a => a.creative_id === c.id))
      .map(c => ({
        key: `legacy-${c.id}`,
        legacy: true,
        creative_id: c.id,
        creative_human_id: c.human_id,
        status: 'QUEUED',
        request_text: c.reviews?.[0]?.notes || 'Ajuste pedido',
        created_at: c.reviews?.[0]?.created_at
      }))
  ];
  const openInList = (id: string) => {
    setViewMode('list');
    setFocusId(id);
    setTimeout(() => {
      try {
        document.getElementById(`factory-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        /* ignore */
      }
    }, 50);
  };

  const openAdInList = (adId: string) => {
    setViewMode('list');
    setFocusId(`ad-${adId}`);
    setTimeout(() => {
      try {
        document.getElementById(`factory-ad-${adId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        /* ignore */
      }
    }, 50);
  };
  // Anúncio da campanha que não é criativo da Fábrica (ex.: criado no Gerenciador ou por plano de lançamento)
  const renderMetaAd = (a: any) => {
    const d = adDelivery(a);
    const thumb = a.image_url || a.thumbnail_url;
    return (
      <article
        key={`ad-${a.meta_ad_id}`}
        id={`factory-ad-${a.meta_ad_id}`}
        data-testid="meta-ad-card"
        className={`rounded-nq bg-nq-surface p-4 flex gap-4 ${focusId === `ad-${a.meta_ad_id}` ? 'ring-2 ring-nq-positive' : ''}`}
      >
        <MetaImage url={thumb} alt={a.name} className="w-24 h-24 rounded border border-nq-line shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5 text-xs">
          <header className="flex flex-wrap items-center gap-2">
            <span className="text-nq-positive-text">{a.name}</span>
            <span data-testid="meta-ad-status"><DeliveryBadge d={d} /></span>
            <span className="px-1.5 py-0.5 rounded text-[12px] border border-nq-line text-nq-muted" title="Anúncio da campanha que não tem criativo cadastrado no NORQVA">
              sem criativo no NORQVA
            </span>
          </header>
          {a.adset_name && <div className="text-[12px] text-nq-subtle">Conjunto: {a.adset_name}</div>}
          {a.creative_title && <div className="text-nq-text font-semibold">{a.creative_title}</div>}
          {a.creative_body && <p className="text-nq-muted line-clamp-2">{a.creative_body}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-nq-muted">
            {a.creative_cta && <span>CTA: {a.creative_cta}</span>}
            <span>Investido: {brl(a.metrics?.spend ?? null)}</span>
            <span>Impressões: {a.metrics ? a.metrics.impressions.toLocaleString('pt-BR') : '—'}</span>
            <span>Cliques no link: {a.metrics ? a.metrics.link_clicks.toLocaleString('pt-BR') : '—'}</span>
            <span>Vendas: {a.metrics ? a.metrics.paid_orders : '—'}</span>
          </div>
          {!isDemoView && <AdPreviewButton metaAdId={String(a.meta_ad_id)} apiFetch={apiFetch} />}
        </div>
      </article>
    );
  };

  const staleApproval = (c: any) => {
    if (c.approval_status !== 'APPROVED') return false;
    const lastApproved = (c.reviews || []).find((r: any) => r.decision === 'APPROVED');
    // sem aprovação registrada, sem hash ou aprovação antiga sem hash: precisa aprovar de novo
    if (!lastApproved || !c.content_hash || !lastApproved.content_hash || lastApproved.content_hash === 'UNHASHED') return true;
    return lastApproved.content_hash !== c.content_hash;
  };

  const renderCard = (c: any) => {
          const st = APPROVAL_LABEL[c.approval_status] || APPROVAL_LABEL.DRAFT;
          const rec = RECOMMENDATION_LABEL[c.recommendation] || RECOMMENDATION_LABEL.OBSERVING;
          const last = c.reviews?.[0];
          return (
            <article
              key={c.id}
              id={`factory-card-${c.id}`}
              data-testid="factory-card"
              className={`rounded-nq bg-nq-surface p-4 ${viewMode === 'list' ? 'flex flex-col-reverse md:flex-row gap-4' : 'space-y-3'} ${focusId === c.id ? 'ring-2 ring-nq-positive' : ''}`}
            >
              {viewMode === 'grid' && hasFile(c) && <CreativePreview url={c.file_url} format={c.format} title={c.human_id} />}
              {viewMode === 'grid' && !hasFile(c) && metaImageOf(c) && (
                <MetaImage url={metaImageOf(c)} alt={c.human_id} className="w-full aspect-[4/5] max-h-72 rounded border border-nq-line" />
              )}
              <div className={viewMode === 'list' ? 'flex-1 min-w-0 space-y-3' : 'space-y-3'}>
              <header className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-nq-body font-semibold text-nq-text flex flex-wrap items-center gap-1.5">
                    {c.human_id}
                    {ORIGIN_LABEL[c.origin] && (
                      <span data-testid="creative-origin" className={`px-1.5 py-0.5 rounded border text-[12px] font-sans ${ORIGIN_LABEL[c.origin].cls}`}>
                        {ORIGIN_LABEL[c.origin].label}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-nq-subtle">
                    {[c.hook_family, c.format, c.duration_seconds ? `${c.duration_seconds}s` : null, `v${c.version}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[12px] font-semibold ${st.cls}`}>{st.label}</span>
              </header>

              {linkedAdsOf(c).length > 0 && (
                <div className="space-y-1.5 text-xs" data-testid="creative-meta-ads">
                  {linkedAdsOf(c).map((a: any) => (
                    <div key={a.meta_ad_id} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12px] text-nq-muted">Anúncio {a.name}</span>
                        <DeliveryBadge d={adDelivery(a)} />
                      </div>
                      {!isDemoView && <AdPreviewButton metaAdId={String(a.meta_ad_id)} apiFetch={apiFetch} />}
                    </div>
                  ))}
                </div>
              )}

              <div className="text-xs space-y-1" data-testid="creative-campaign">
                <div>
                  <span className="text-nq-subtle">Campanha:</span>{' '}
                  {(c.campaigns || []).length > 0
                    ? c.campaigns.map((cp: any) => `${cp.name}${cp.status && cp.status !== 'ACTIVE' ? ` (${cp.status === 'PAUSED' ? 'pausada' : cp.status})` : ''}`).join(' · ')
                    : <span className="text-nq-subtle">não publicado</span>}
                </div>
                {c.batch_code && c.origin !== 'META' && <div><span className="text-nq-subtle">Lote:</span> {c.batch_code}</div>}
                {c.product_name && <div><span className="text-nq-subtle">Produto:</span> {c.product_name}{c.offer_name ? ` · ${c.offer_name}` : ''}</div>}
              </div>

              <p className="text-nq-body text-nq-text font-semibold">“{c.hook}”</p>
              <div className="text-xs text-nq-text space-y-1">
                {(c.mechanism || c.concept) && <div><span className="text-nq-subtle">{c.mechanism ? 'Mecanismo' : 'Conceito'}:</span> {c.mechanism || c.concept}</div>}
                {c.headline && <div><span className="text-nq-subtle">Título:</span> {c.headline}</div>}
                <div className="text-nq-muted">{c.primary_text || c.copy}</div>
                <div><span className="text-nq-subtle">CTA:</span> {c.cta}</div>
                {!hasFile(c) && <div className="text-nq-attention/80">Arquivo ainda não produzido</div>}
              </div>

              <div className="flex flex-wrap gap-1">
                {(c.claims || []).map((cl: any) => (
                  <span
                    key={cl.id}
                    title={cl.text}
                    className={`px-1.5 py-0.5 rounded text-[12px] border ${
                      cl.status === 'VERIFIED' ? 'border-nq-positive/40 text-nq-positive-text' : 'border-nq-attention/40 text-nq-attention'
                    }`}
                  >
                    {cl.human_id}
                  </span>
                ))}
                {!c.claims_all_verified && (
                  <span className="text-[12px] text-nq-attention flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" /> {(c.claims || []).length === 0 ? 'sem promessas registradas' : 'claims pendentes'}
                  </span>
                )}
                {canRevise && c.approval_status !== 'APPROVED' && c.approval_status !== 'SUPERSEDED' && (
                  <button
                    data-testid="add-claim"
                    onClick={() => setClaiming({ id: c.id, product_id: c.product_id, claim_id: '', claim_text: '', claim_type: 'FEATURE' })}
                    className="px-3 rounded-full text-nq-aux bg-nq-raised text-nq-text min-h-[44px]"
                  >
                    + Promessa
                  </button>
                )}
              </div>

              {claiming && claiming.id === c.id && (
                <div className="space-y-2 border-t border-nq-line pt-2 text-xs" data-testid="claim-form">
                  <p className="text-[12px] text-nq-subtle">
                    O que este anúncio promete? Ex.: "28 receitas italianas". A promessa entra como não verificada; um ADMIN verifica antes de aprovar.
                  </p>
                  {claims.filter(cl => cl.product_id === c.product_id && !(c.claims || []).some((x: any) => x.id === cl.id)).length > 0 && (
                    <select
                      aria-label="Promessa já registrada"
                      value={claiming.claim_id}
                      onChange={e => { const v = e.target.value; setClaiming(prev => (prev ? { ...prev, claim_id: v } : prev)); }}
                      className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                    >
                      <option value="">Nova promessa…</option>
                      {claims
                        .filter(cl => cl.product_id === c.product_id && !(c.claims || []).some((x: any) => x.id === cl.id))
                        .map(cl => (
                          <option key={cl.id} value={cl.id}>
                            {cl.human_id} · {cl.claim_text}
                          </option>
                        ))}
                    </select>
                  )}
                  {!claiming.claim_id && (
                    <>
                      <input
                        aria-label="Texto da promessa"
                        value={claiming.claim_text}
                        maxLength={500}
                        onChange={e => { const v = e.target.value; setClaiming(prev => (prev ? { ...prev, claim_text: v } : prev)); }}
                        className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                      />
                      <select
                        aria-label="Tipo da promessa"
                        value={claiming.claim_type}
                        onChange={e => { const v = e.target.value; setClaiming(prev => (prev ? { ...prev, claim_type: v } : prev)); }}
                        className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                      >
                        {Object.entries(CLAIM_TYPE_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={submitClaim}
                      disabled={(!claiming.claim_id && !claiming.claim_text.trim()) || busy === `claim-add-${c.id}`}
                      className="px-4 rounded-full bg-nq-text text-nq-bg font-bold disabled:opacity-50 min-h-[44px]"
                    >
                      Registrar
                    </button>
                    <button onClick={() => setClaiming(null)} className="px-4 rounded-full bg-nq-raised text-nq-text min-h-[44px]">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-nq-bg p-3 text-nq-aux tabular-nums grid grid-cols-3 gap-x-2 gap-y-2.5">
                <div><div className="text-nq-subtle">Investido</div>{brl(c.metrics?.spend ?? null)}</div>
                <div><div className="text-nq-subtle">CTR link</div>{c.link_ctr !== null && c.link_ctr !== undefined ? `${c.link_ctr.toFixed(2).replace(".", ",")}%` : '—'}</div>
                <div><div className="text-nq-subtle">Visitas</div>{c.metrics?.offer_views ?? '—'}</div>
                <div><div className="text-nq-subtle">Checkout</div>{c.metrics ? `${c.metrics.checkout_modal_opened}/${c.metrics.checkout_started}` : '—'}</div>
                <div><div className="text-nq-subtle">Vendas</div>{c.metrics?.paid_orders ?? '—'}</div>
                <div><div className="text-nq-subtle">CPA</div>{brl(c.cpa)}</div>
                <div className="col-span-3 pt-1 border-t border-nq-line">
                  <span className={rec.cls}>{rec.label}</span>
                  <span className="text-nq-subtle"> · {c.recommendation_reason}</span>
                  {c.breakeven_cpa !== null && (
                    <span className="text-nq-subtle"> (equilíbrio {brl(c.breakeven_cpa)})</span>
                  )}
                </div>
              </div>

              {last && (
                <div className="text-[12px] text-nq-subtle">
                  Última revisão: {APPROVAL_LABEL[last.decision]?.label || last.decision}
                  {last.reason_code ? ` · ${REASON_LABEL[last.reason_code] || last.reason_code}` : ''}
                  {last.notes ? ` · ${last.notes}` : ''}
                  {last.reviewer_name ? ` · ${last.reviewer_name}` : ''}
                </div>
              )}

              {/* NORQVA-0027: arquivo trocado depois da aprovação não vai para anúncio sem nova aprovação */}
              {staleApproval(c) && (
                <div className="text-[12px] text-nq-attention" data-testid="stale-approval">
                  O arquivo mudou depois da aprovação: aprove de novo para ele poder ir para um anúncio.
                </div>
              )}

              {confirmNoPrice === c.id && (
                <div className="rounded-xl bg-nq-attention/10 p-3 text-nq-aux text-nq-attention space-y-1.5" data-testid="confirm-no-price">
                  <div>Anúncio sem preço: o vídeo ou a imagem deste criativo não mostra nem fala preço?</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setConfirmNoPrice(null); approve(c.id); }}
                      className="px-4 rounded-full bg-nq-positive text-nq-on-positive text-nq-aux font-bold min-h-[44px]"
                    >
                      Confirmo, sem preço
                    </button>
                    <button onClick={() => setConfirmNoPrice(null)} className="px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux min-h-[44px]">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {c.approval_status !== 'SUPERSEDED' && (
                <footer className="flex flex-wrap gap-2 pt-1">
                  {isAdmin && staleApproval(c) && (
                    <button
                      onClick={() => askApprove(c)}
                      disabled={busy === `review-${c.id}` || !c.claims_all_verified}
                      className="inline-flex items-center gap-1 px-4 rounded-full bg-nq-positive text-nq-on-positive text-nq-aux font-bold disabled:opacity-40 min-h-[44px]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar de novo
                    </button>
                  )}
                  {isAdmin && c.approval_status !== 'APPROVED' && (
                    <button
                      onClick={() => askApprove(c)}
                      disabled={busy === `review-${c.id}` || !c.claims_all_verified}
                      title={!c.claims_all_verified ? 'Verifique as claims antes de aprovar' : undefined}
                      className="inline-flex items-center gap-1 px-4 rounded-full bg-nq-positive text-nq-on-positive text-nq-aux font-bold disabled:opacity-40 min-h-[44px]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => { setRejecting({ id: c.id, decision: 'REVISION_REQUESTED' }); setReason('BAD_COPY'); }}
                        className="inline-flex items-center gap-1 px-4 rounded-full bg-nq-attention/15 text-nq-attention text-nq-aux font-bold min-h-[44px]"
                      >
                        <PencilLine className="h-3.5 w-3.5" /> Pedir ajuste
                      </button>
                      <button
                        onClick={() => { setRejecting({ id: c.id, decision: 'REJECTED' }); setReason('WEAK_HOOK'); }}
                        className="inline-flex items-center gap-1 px-4 rounded-full bg-nq-critical/15 text-nq-critical-text text-nq-aux font-bold min-h-[44px]"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Rejeitar
                      </button>
                    </>
                  )}
                  {isAdmin && !isDemoView && (!hasFile(c) || /fbcdn/i.test(String(c.file_url || ''))) && c.format === 'VIDEO' && (c.linked_meta_ads || []).length > 0 && (
                    <button
                      onClick={() => run(`metavideo-${c.id}`, () => post(`/creative-factory/creatives/${c.id}/meta-video?mode=real`), 'Vídeo trazido da Meta. Confira e aprove o criativo.')}
                      disabled={busy === `metavideo-${c.id}`}
                      data-testid="fetch-meta-video"
                      className="inline-flex items-center gap-1 px-4 rounded-full bg-nq-positive/15 text-nq-positive-text text-nq-aux disabled:opacity-50 min-h-[44px]"
                    >
                      <Download className="h-3.5 w-3.5" /> {busy === `metavideo-${c.id}` ? 'Trazendo…' : hasFile(c) ? 'Renovar vídeo da Meta' : 'Trazer vídeo da Meta'}
                    </button>
                  )}
                  {canRevise && (
                    <button
                      onClick={() => setAttaching({ id: c.id, file_url: hasFile(c) ? c.file_url : '' })}
                      className="px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux min-h-[44px]"
                    >
                      {hasFile(c) ? 'Trocar arquivo' : 'Anexar arquivo'}
                    </button>
                  )}
                  {canRevise && (
                    <button
                      onClick={() =>
                        setEditing({
                          id: c.id,
                          hook: c.hook || '',
                          mechanism: c.mechanism || '',
                          headline: c.headline || '',
                          primary_text: c.primary_text || c.copy || '',
                          cta: c.cta || '',
                          script: c.script || '',
                          file_url: c.file_url || ''
                        })
                      }
                      className="px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux min-h-[44px]"
                    >
                      Editar
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => setLinking({ id: c.id, meta_ad_id: '' })}
                      className="inline-flex items-center gap-1 px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux min-h-[44px]"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Ligar anúncio
                    </button>
                  )}
                  {isAdmin && !isDemoView && (
                    <div className="w-full sm:w-auto sm:min-w-[11rem]">
                      <TrashAction
                        kind="creative"
                        action="delete"
                        item={c}
                        apiFetch={apiFetch}
                        showError={showError}
                        showSuccess={showSuccess}
                        onDone={() => {
                          setTrashKey(k => k + 1);
                          load();
                        }}
                      />
                    </div>
                  )}
                </footer>
              )}

              {rejecting?.id === c.id && (
                <div className="space-y-2 border-t border-nq-line pt-2">
                  <select
                    aria-label="Motivo"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl text-nq-body min-h-[44px]"
                  >
                    {(data?.rejectionReasons || Object.keys(REASON_LABEL)).map((r: string) => (
                      <option key={r} value={r}>
                        {REASON_LABEL[r] || r}
                      </option>
                    ))}
                  </select>
                  <textarea
                    aria-label="Observações"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="O que precisa mudar?"
                    className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl text-nq-body min-h-[44px]"
                  />
                  <div className="flex gap-2">
                    <button onClick={submitReview} className="px-4 rounded-full bg-nq-text text-nq-bg text-nq-aux font-bold min-h-[44px]">
                      Confirmar {rejecting?.decision === 'REJECTED' ? 'rejeição' : 'pedido de ajuste'}
                    </button>
                    <button onClick={() => setRejecting(null)} className="px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux min-h-[44px]">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {editing?.id === c.id && (
                <div className="space-y-2 border-t border-nq-line pt-2 text-xs">
                  <p className="text-[12px] text-nq-subtle">
                    Se este criativo já foi revisado, mudar o conteúdo cria uma nova versão (para aprovar de novo) e a atual vira "Substituído". Para só anexar o arquivo, use "Anexar arquivo". Sem preço no texto.
                  </p>
                  <label className="block space-y-0.5">
                    <span className="text-nq-subtle">Gancho (primeira frase)</span>
                    <input
                      aria-label="Gancho"
                      value={editing?.hook || ''}
                      onChange={e => { const v = e.target.value; setEditing(prev => (prev ? { ...prev, hook: v } : prev)); }}
                      className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className="text-nq-subtle">Mecanismo</span>
                    <input
                      aria-label="Mecanismo"
                      value={editing?.mechanism || ''}
                      onChange={e => { const v = e.target.value; setEditing(prev => (prev ? { ...prev, mechanism: v } : prev)); }}
                      className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                    />
                  </label>
                  <span className="block text-nq-subtle">Título</span>
                  <input
                    aria-label="Título"
                    value={editing?.headline || ''}
                    onChange={e => { const v = e.target.value; setEditing(prev => (prev ? { ...prev, headline: v } : prev)); }}
                    className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                  />
                  <span className="block text-nq-subtle">Texto principal</span>
                  <textarea
                    aria-label="Texto principal"
                    value={editing?.primary_text || ''}
                    onChange={e => { const v = e.target.value; setEditing(prev => (prev ? { ...prev, primary_text: v } : prev)); }}
                    className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl h-20 min-h-[44px]"
                  />
                  <label className="block space-y-0.5">
                    <span className="text-nq-subtle">CTA (chamada)</span>
                    <input
                      aria-label="CTA"
                      value={editing?.cta || ''}
                      onChange={e => { const v = e.target.value; setEditing(prev => (prev ? { ...prev, cta: v } : prev)); }}
                      className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className="text-nq-subtle">Roteiro</span>
                    <textarea
                      aria-label="Roteiro"
                      value={editing?.script || ''}
                      onChange={e => { const v = e.target.value; setEditing(prev => (prev ? { ...prev, script: v } : prev)); }}
                      className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl h-24 min-h-[44px]"
                    />
                  </label>
                  <span className="block text-nq-subtle">Link do arquivo</span>
                  <input
                    aria-label="Link do arquivo"
                    placeholder="Link do vídeo/imagem produzido"
                    value={editing?.file_url || ''}
                    onChange={e => { const v = e.target.value; setEditing(prev => (prev ? { ...prev, file_url: v } : prev)); }}
                    className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                  />
                  <div className="space-y-1 border-t border-nq-line pt-2" data-testid="creative-offer-change">
                    <span className="block text-nq-subtle">Oferta deste criativo (muda também o produto; as promessas acompanham)</span>
                    <div className="flex gap-2">
                      <select
                        aria-label="Oferta do criativo"
                        value={offerPick[c.id] ?? String(c.offer_id || '')}
                        onChange={e => { const v = e.target.value; setOfferPick(prev => ({ ...prev, [c.id]: v })); }}
                        className="flex-1 min-w-0 bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                      >
                        {!c.offer_id && <option value="">Sem oferta</option>}
                        {offers.map((o: any) => (
                          <option key={o.id} value={o.id}>
                            {(products.find((p: any) => String(p.id) === String(o.product_id))?.name || 'Produto')} · {o.human_id} · {o.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => submitOffer(c)}
                        disabled={!offerPick[c.id] || offerPick[c.id] === String(c.offer_id || '') || busy === `offer-${c.id}`}
                        className="px-4 rounded-full bg-nq-positive/15 text-nq-positive-text disabled:opacity-40 min-h-[44px]"
                      >
                        Trocar oferta
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={submitEdit} className="px-4 rounded-full bg-nq-text text-nq-bg font-bold min-h-[44px]">
                      Salvar
                    </button>
                    <button onClick={() => setEditing(null)} className="px-4 rounded-full bg-nq-raised text-nq-text min-h-[44px]">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {attaching?.id === c.id && (
                <div className="space-y-2 border-t border-nq-line pt-2 text-xs">
                  <p className="text-[12px] text-nq-subtle">
                    Link público do vídeo ou imagem (http/https). Mantém esta versão, a aprovação e o vínculo com o anúncio.
                  </p>
                  <input
                    aria-label="Link do arquivo produzido"
                    placeholder="https://..."
                    value={attaching?.file_url || ''}
                    onChange={e => { const v = e.target.value; setAttaching(prev => (prev ? { ...prev, file_url: v } : prev)); }}
                    className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={submitAttach}
                      disabled={!/^https?:\/\/\S+$/i.test((attaching?.file_url || '').trim()) || busy === `file-${c.id}`}
                      className="px-4 rounded-full bg-nq-text text-nq-bg font-bold disabled:opacity-50 min-h-[44px]"
                    >
                      Anexar
                    </button>
                    <button onClick={() => setAttaching(null)} className="px-4 rounded-full bg-nq-raised text-nq-text min-h-[44px]">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {linking?.id === c.id && (
                <div className="space-y-2 border-t border-nq-line pt-2 text-xs">
                  <p className="text-[12px] text-nq-subtle">
                    Só é preciso se o nome do anúncio na Meta for diferente de {c.utm_content_key}.
                  </p>
                  <input
                    aria-label="ID do anúncio na Meta"
                    placeholder="ID do anúncio na Meta"
                    value={linking?.meta_ad_id || ''}
                    onChange={e => { const v = e.target.value; setLinking(prev => (prev ? { ...prev, meta_ad_id: v } : prev)); }}
                    className="w-full bg-nq-bg text-nq-text px-2 py-2 rounded-xl min-h-[44px]"
                  />
                  <div className="flex gap-2">
                    <button onClick={submitLink} className="px-4 rounded-full bg-nq-text text-nq-bg font-bold min-h-[44px]">
                      Ligar
                    </button>
                    <button onClick={() => setLinking(null)} className="px-4 rounded-full bg-nq-raised text-nq-text min-h-[44px]">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              </div>
              {viewMode === 'list' && (
                <div className="md:w-[38%] lg:w-[34%] shrink-0 md:self-stretch flex flex-col">
                  {hasFile(c) ? (
                    <CreativePreview url={c.file_url} format={c.format} title={c.human_id} fill className="flex-1" />
                  ) : metaImageOf(c) ? (
                    <div className="flex-1 flex flex-col gap-1">
                      <MetaImage url={metaImageOf(c)} alt={c.human_id} className="flex-1 min-h-[16rem] w-full rounded border border-nq-line" />
                      <span className="text-[12px] text-nq-subtle">Imagem do anúncio na Meta</span>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-[16rem] rounded border border-dashed border-nq-line flex items-center justify-center text-[12px] text-nq-subtle">
                      sem arquivo
                    </div>
                  )}
                </div>
              )}
            </article>
          );
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight text-nq-text">Criativos</h1>
          <p className="text-nq-aux text-nq-muted mt-1">
            Todos os criativos num lugar só: criar, anexar o vídeo ou a imagem, registrar promessas, aprovar e ver o resultado. Nada é publicado na Meta por aqui.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
        {canRevise && (
          <button
            onClick={() => setCreating(true)}
            data-testid="new-creative"
            className="inline-flex items-center gap-1.5 px-4 rounded-full bg-nq-positive text-nq-on-positive text-nq-aux font-semibold hover:brightness-110 min-h-[44px]"
          >
            <Plus className="h-4 w-4" /> Novo criativo
          </button>
        )}
        <button
          onClick={load}
          disabled={loading}
          aria-label="Atualizar"
          className="h-11 w-11 flex items-center justify-center rounded-full bg-nq-surface text-nq-muted hover:text-nq-text disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        </div>
      </div>

      {creating && (
        <NewCreativeForm
          products={products}
          offers={offers}
          busy={busy === 'new-creative'}
          onSubmit={submitNew}
          onCancel={() => setCreating(false)}
        />
      )}

      {isAdmin && notImported.length > 0 && (
        <div className="p-4 rounded-nq bg-nq-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-nq-aux text-nq-text">
            Lote pronto para importar: <strong>{notImported.join(', ')}</strong>. Os criativos entram como rascunho e as claims como não verificadas.
          </div>
          {notImported.map(code => (
            <button
              key={code}
              onClick={() => importBatch(code)}
              disabled={busy === `import-${code}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-nq-positive text-nq-on-positive text-nq-aux font-bold hover:brightness-110 disabled:opacity-50 min-h-[44px]"
            >
              <Download className="h-3.5 w-3.5" /> Importar {code}
            </button>
          ))}
        </div>
      )}

      {isAdmin && pendingAssets.length > 0 && (
        <div
          data-testid="pending-assets"
          className="p-4 rounded-nq bg-nq-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="text-nq-aux text-nq-text">
            Já existem arquivos produzidos para{' '}
            <strong>{pendingAssets.map(p => `${p.count} criativo(s) do ${p.code}`).join(', ')}</strong>. Anexe para abrir pelo
            Creative Lab. Não cria versão nova nem muda a aprovação.
          </div>
          {pendingAssets.map(p => (
            <button
              key={p.code}
              onClick={() => attachBatchAssets(p.code)}
              disabled={busy === `assets-${p.code}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-nq-info text-nq-on-positive text-nq-aux font-bold hover:brightness-110 disabled:opacity-50 min-h-[44px]"
            >
              <Download className="h-3.5 w-3.5" /> Anexar arquivos produzidos
            </button>
          ))}
        </div>
      )}

      {/* NORQVA-0011/0013: adjustment requests and what Claude is doing with them */}
      {queueItems.length > 0 && (
        <section className="p-4 rounded-nq bg-nq-attention/10 space-y-2" data-testid="revision-queue">
          <h2 className="text-sm font-bold text-nq-attention">Ajustes pedidos ({queueItems.length})</h2>
          <p className="text-[12px] text-nq-muted">
            Cada pedido é enviado ao Claude, que produz uma nova versão (rascunho) para você aprovar. O anúncio que já está na Meta continua no ar até a nova versão ser aprovada e publicada.
          </p>
          <ul className="space-y-2 text-xs">
            {queueItems.map((q: any) => {
              const st = ADJ_STATUS[q.status] || ADJ_STATUS.QUEUED;
              return (
                <li key={q.key} className="border-t border-nq-attention/40 pt-2 space-y-1" data-testid="adjustment-item">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => openInList(q.creative_id)} className="text-nq-positive-text hover:underline min-h-[44px]">{q.creative_human_id}</button>
                    <span className={`px-1.5 py-0.5 rounded text-[12px] font-bold ${st.cls}`} data-testid="adjustment-status">{st.label}</span>
                    <span className="text-[12px] text-nq-subtle">{q.created_at ? new Date(q.created_at).toLocaleString('pt-BR') : ''}</span>
                  </div>
                  <div className="text-nq-text">“{q.request_text}”</div>
                  {q.response && <div className="text-nq-muted">Claude: {q.response}</div>}
                  <div className="flex flex-wrap gap-3 text-[12px]">
                    {q.session_url && /^https:\/\/claude\.ai\//.test(q.session_url) && (
                      <a href={q.session_url} target="_blank" rel="noreferrer" className="text-nq-positive-text underline">Ver o Claude trabalhando</a>
                    )}
                    {q.result_creative_id && (
                      <button onClick={() => openInList(q.result_creative_id)} className="text-nq-positive-text underline min-h-[44px]">
                        Revisar nova versão {q.result_human_id || ''}
                      </button>
                    )}
                    {isAdmin && q.legacy && (
                      <button
                        onClick={() => run(`adj-${q.key}`, () => post(`/creative-factory/creatives/${q.creative_id}/adjustments?mode=${mode}`), 'Pedido enviado ao Claude.')}
                        disabled={busy === `adj-${q.key}`}
                        className="px-2 py-0.5 rounded-full bg-nq-positive text-nq-on-positive font-bold disabled:opacity-50 min-h-[44px]"
                      >
                        Enviar ao Claude
                      </button>
                    )}
                    {isAdmin && !q.legacy && (q.status === 'FAILED' || q.status === 'NOT_CONFIGURED' || q.status === 'DISPATCHED') && (
                      <button
                        onClick={() => run(`adj-${q.key}`, () => post(`/creative-factory/adjustments/${q.id}/retry?mode=${mode}`), 'Pedido reenviado ao Claude.')}
                        disabled={busy === `adj-${q.key}`}
                        className="px-2 py-0.5 rounded-full bg-nq-line text-nq-text font-bold disabled:opacity-50 min-h-[44px]"
                      >
                        {q.status === 'DISPATCHED' ? 'Reenviar' : 'Tentar de novo'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Claims */}
      <section className={`rounded-nq bg-nq-surface ${showClaims ? 'p-4 space-y-3' : 'px-4 py-2.5'}`} data-testid="claims-section">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowClaims(!showClaims)}
            aria-expanded={showClaims}
            data-testid="toggle-factory-claims"
            className="text-sm font-bold text-nq-text flex items-center gap-2 min-h-[44px]"
          >
            {showClaims ? <ChevronDown className="h-4 w-4 text-nq-muted" /> : <ChevronRight className="h-4 w-4 text-nq-muted" />}
            <ShieldCheck className="h-4 w-4 text-nq-positive-text" /> Claims ({claims.length})
            <span className="text-[12px] font-normal text-nq-subtle">{showClaims ? 'ocultar' : 'mostrar'}</span>
          </button>
          {pendingClaims.length > 0 && (
            <span className="text-[12px] text-nq-attention">
              {pendingClaims.length} aguardando verificação: sem elas nenhum criativo pode ser aprovado
            </span>
          )}
        </div>
        {!showClaims ? null : claims.length === 0 ? (
          <p className="text-xs text-nq-subtle">Nenhuma claim registrada.</p>
        ) : (
          <ul className="divide-y divide-nq-line/60">
            {claims.map(cl => (
              <li key={cl.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <div className="text-xs text-nq-text">
                  <span className="text-nq-subtle mr-2">{cl.human_id}</span>
                  {cl.claim_text}
                  {cl.status_note && <span className="block text-[12px] text-nq-subtle">{cl.status_note}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[12px] font-bold border ${
                      cl.status === 'VERIFIED'
                        ? 'border-nq-positive/40 text-nq-positive-text'
                        : cl.status === 'REJECTED'
                        ? 'border-nq-critical/40 text-nq-critical-text'
                        : 'border-nq-attention/40 text-nq-attention'
                    }`}
                  >
                    {cl.status === 'VERIFIED' ? 'Verificada' : cl.status === 'REJECTED' ? 'Rejeitada' : cl.status === 'EXPIRED' ? 'Expirada' : 'Não verificada'}
                  </span>
                  {isAdmin && cl.status !== 'VERIFIED' && cl.status !== 'REJECTED' && (
                    <button
                      onClick={() => setClaim(cl.id, 'VERIFIED')}
                      disabled={busy === `claim-${cl.id}`}
                      className="px-2 py-0.5 rounded-full bg-nq-positive text-nq-on-positive text-[12px] font-bold disabled:opacity-50 min-h-[44px]"
                    >
                      Verificar
                    </button>
                  )}
                  {isAdmin && cl.status === 'VERIFIED' && (
                    <button
                      onClick={() => setClaim(cl.id, 'REJECTED', 'Revogada na tela Criativos')}
                      disabled={busy === `claim-${cl.id}`}
                      className="px-2 py-0.5 rounded-full bg-nq-raised text-nq-text text-[12px] disabled:opacity-50 min-h-[44px]"
                    >
                      Revogar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && !isDemoView && <CreativeTrash apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onChanged={load} reloadKey={trashKey} />}

      {/* Organização por campanha */}
      {allCampaigns && (
        <div className="space-y-2 text-nq-aux" data-testid="campaign-filters">
          <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {([
            ['ALL', `Todas as campanhas (${allCampaigns.length})`],
            ['ACTIVE', `Ativas (${campaignCounts.ACTIVE})`],
            ['PAUSED', `Pausadas (${campaignCounts.PAUSED})`]
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setCampaignFilter(k)}
              aria-pressed={campaignFilter === k}
              className={`shrink-0 px-4 rounded-full border text-nq-aux font-medium ${campaignFilter === k ? 'bg-nq-text text-nq-bg border-nq-text' : 'bg-nq-surface border-transparent text-nq-muted'} min-h-[44px]`}
            >
              {label}
            </button>
          ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex min-h-[40px] items-center gap-2 text-nq-muted cursor-pointer">
            <input type="checkbox" checked={onlyRunning} onChange={e => setOnlyRunning(e.target.checked)} aria-label="Só o que está rodando" data-testid="only-running" />
            Só o que está rodando
          </label>
          <label className="flex min-h-[40px] items-center gap-2 text-nq-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showUnpublished}
              onChange={e => setShowUnpublished(e.target.checked)}
              aria-label="Exibir criativos não publicados"
            />
            Exibir criativos não publicados ({creatives.filter(c => c.approval_status !== 'SUPERSEDED' && !(c.campaigns || []).length).length})
          </label>
          <select
            aria-label="Campanha"
            data-testid="campaign-name-filter"
            value={campaignName}
            onChange={e => setCampaignName(e.target.value)}
            className="w-full sm:w-auto sm:max-w-[18rem] bg-nq-surface text-nq-text px-3 py-2 rounded-xl min-h-[44px]"
          >
            <option value="ALL">Procurar pelo nome da campanha</option>
            {[...allCampaigns]
              .sort((a, b) => String(a.name).localeCompare(String(b.name)))
              .map(cp => (
                <option key={cp.meta_campaign_id} value={String(cp.meta_campaign_id)}>
                  {cp.name}
                  {cp.status === 'ACTIVE' ? ' (ativa)' : cp.status === 'PAUSED' ? ' (pausada)' : ''}
                </option>
              ))}
            <option value="__none__">Criativos não publicados</option>
          </select>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2 text-nq-aux">
      <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {['ALL', 'DRAFT', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED', 'SUPERSEDED'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`shrink-0 px-4 rounded-full border text-nq-aux font-medium ${statusFilter === s ? 'bg-nq-text text-nq-bg border-nq-text' : 'bg-nq-surface border-transparent text-nq-muted'} min-h-[44px]`}
          >
            {s === 'ALL' ? `Todos (${creatives.filter(c => c.approval_status !== 'SUPERSEDED').length})` : `${APPROVAL_LABEL[s].label} (${counts[s] || 0})`}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filtrar por hook"
          value={hookFilter}
          onChange={e => setHookFilter(e.target.value)}
          className="bg-nq-surface text-nq-text px-3 py-2 rounded-xl min-h-[44px]"
        >
          <option value="ALL">Todos os hooks</option>
          {hooks.map(h => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <ViewModeSelector value={viewMode} onChange={setViewMode} />
        </div>
      </div>
      </div>

      {loading && !data && <p className="text-nq-aux text-nq-muted">Carregando…</p>}
      {!loading && creatives.length === 0 && !(allCampaigns && allCampaigns.length > 0) && (
        <p className="text-nq-aux text-nq-muted" data-testid="factory-empty">
          Nenhum criativo na fábrica ainda.
        </p>
      )}

      {groups.map(g => (
        <section key={g.key} className="space-y-3" data-testid="campaign-group">
          <h2 className="px-1 pt-2 text-nq-body font-semibold text-nq-text flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-all">{g.name}</span>
            {g.status && (
              <span className={`text-nq-caption font-medium ${g.status === 'ACTIVE' ? 'text-nq-positive-text' : 'text-nq-muted'}`}>
                {g.status === 'ACTIVE' ? 'ativa' : g.status === 'PAUSED' ? 'pausada' : String(g.status).toLowerCase()}
              </span>
            )}
            <span className="text-[12px] font-normal text-nq-subtle">
              {g.items.length} criativo(s)
              {g.externalAds.length > 0 ? ` · ${g.externalAds.length} anúncio(s) sem criativo no NORQVA` : ''}
            </span>
          </h2>
          {g.items.length === 0 && g.externalAds.length === 0 && (
            <p className="text-xs text-nq-subtle" data-testid="campaign-empty">Nenhum anúncio nesta campanha.</p>
          )}
          <div className={containerClass(viewMode)}>
            {g.items.map((c: any) =>
              isIconMode(viewMode) ? (
                <IconTile
                  key={c.id}
                  mode={viewMode}
                  title={c.human_id}
                  subtitle={(APPROVAL_LABEL[c.approval_status] || APPROVAL_LABEL.DRAFT).label}
                  url={hasFile(c) ? c.file_url : metaImageOf(c)}
                  format={c.format}
                  onOpen={() => openInList(c.id)}
                />
              ) : (
                renderCard(c)
              )
            )}
            {g.externalAds.map((a: any) =>
              isIconMode(viewMode) ? (
                <IconTile
                  key={`ad-${a.meta_ad_id}`}
                  mode={viewMode}
                  title={a.name}
                  subtitle={`${adDelivery(a).label} · sem criativo no NORQVA`}
                  url={a.image_url || a.thumbnail_url}
                  format="IMAGE"
                  onOpen={() => openAdInList(a.meta_ad_id)}
                />
              ) : (
                renderMetaAd(a)
              )
            )}
          </div>
        </section>
      ))}
      {allCampaigns && groups.length === 0 && (
        <p className="text-nq-aux text-nq-muted" data-testid="campaigns-none">Nenhuma campanha com esse filtro.</p>
      )}
    </div>
  );
}
