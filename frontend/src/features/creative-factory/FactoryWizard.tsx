import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Plus, RefreshCw, Search, Wand2 } from 'lucide-react';
import { Section, Surface, RowGroup, Row, StatusPill, useIsMobile, Tone } from '../../components/ui/premium';
import { ReferenceForm, ReferenceStructureView } from './CreativeReferences';
import { GenerationView } from './GenerationView';
import { GeneratedCampaignPanel } from './GeneratedCampaignPanel';
import { buildNorqvaCopy, copyText } from './factoryCopy';

// NORQVA-0118 (contrato "Fábrica de Criativos"): uma aba só, Criativos → Fábrica, que leva da referência à
// campanha PAUSADA em 6 passos. Junta o que já existia (Referências 0115, Geração 0116, campanha pausada 0117).
// Nada aqui copia texto ou imagem de terceiros: da referência fica só a estrutura (D-0115).

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

export const FACTORY_STEPS = ['Entrada', 'Análise', 'Produto', 'Geração', 'Aprovação', 'Publicação'] as const;
const RUN_KEY = 'norqva.fabrica.run';

interface Run {
  refId?: string | null;
  pageId?: string | null;
  productId?: string | null;
}

const readRun = (): Run => {
  try {
    const raw = window.localStorage.getItem(RUN_KEY);
    const r = raw ? JSON.parse(raw) : {};
    return r && typeof r === 'object' ? r : {};
  } catch {
    return {};
  }
};
const saveRun = (r: Run) => {
  try {
    window.localStorage.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
};

const input = 'w-full bg-nq-bg border border-nq-line rounded p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text min-h-[44px]';
const label = 'block text-nq-aux text-nq-muted mb-1';
const pill = 'px-4 rounded-full text-nq-aux font-semibold min-h-[44px] disabled:opacity-50';
const primary = `${pill} bg-nq-positive text-nq-on-positive hover:brightness-110`;
const quiet = `${pill} bg-nq-raised text-nq-text`;

const fold = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Produtos cujo nome tem as palavras digitadas (sem acento, sem maiúscula). */
export function matchProducts(products: any[], text: string): any[] {
  const words = fold(text)
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3);
  if (!words.length) return [];
  return products.filter(p => {
    const name = fold(p.name);
    return words.some(w => name.includes(w));
  });
}

/** Busca na Biblioteca de Anúncios da Meta (abre no navegador do dono; o NORQVA não lê esse site). */
export function adLibraryUrl(text: string): string {
  const q = encodeURIComponent(String(text || '').trim());
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all&q=${q}&search_type=keyword_unordered`;
}

const OFFER_STATUS: Record<string, { label: string; tone: Tone }> = {
  RASCUNHO: { label: 'Rascunho', tone: 'neutral' },
  TESTE: { label: 'Em teste', tone: 'info' },
  ATIVA: { label: 'À venda', tone: 'positive' },
  PAUSADA: { label: 'Pausada', tone: 'attention' },
  ARQUIVADA: { label: 'Arquivada', tone: 'neutral' }
};

const PAGE_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  APPROVED: { label: 'Aprovada', tone: 'info' },
  PUBLISHED: { label: 'No ar', tone: 'positive' },
  UNPUBLISHED: { label: 'Fora do ar', tone: 'attention' }
};

const brl = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
};

/** Anúncio pronto para ir para a campanha (aprovado e com a checagem em dia). */
const adOk = (a: any) => a?.approval_status === 'APPROVED' && !a?.copy_check?.blocked && !a?.copy_check?.stale;

/** O que falta para publicar a campanha (passo 5). */
export function readiness(pageData: any) {
  const page = pageData?.page || {};
  const ads: any[] = pageData?.ads || [];
  const approved = ['APPROVED', 'PUBLISHED', 'UNPUBLISHED'].includes(String(page.status)) || !!page.approved_at;
  const offerOk = page.offer_status === 'ATIVA' || page.offer_status === 'TESTE';
  const live = page.status === 'PUBLISHED';
  const readyAds = ads.filter(adOk).length;
  return { approved, offerOk, live, readyAds, totalAds: ads.length, all: approved && offerOk && live && readyAds > 0 };
}

export const FactoryWizard: React.FC<{
  apiFetch: ApiFetch;
  isAdmin: boolean;
  canCreate: boolean;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onDisabled?: () => void;
}> = ({ apiFetch, isAdmin, canCreate, showError, showSuccess, onDisabled }) => {
  const isMobile = useIsMobile();
  const [run, setRunState] = useState<Run>(readRun);
  const [step, setStep] = useState<number>(0); // 0 = início (lista do que está em andamento)
  const [products, setProducts] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [refs, setRefs] = useState<any[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [pageData, setPageData] = useState<any>(null);
  const [kie, setKie] = useState(false);
  const [loading, setLoading] = useState(true);

  const setRun = (r: Run) => {
    setRunState(r);
    saveRun(r);
  };

  const loadCatalog = useCallback(async () => {
    const [p, o] = await Promise.all([
      Promise.resolve(apiFetch('/products?mode=real')).catch(() => null),
      Promise.resolve(apiFetch('/offers?mode=real')).catch(() => null)
    ]);
    setProducts(Array.isArray(p?.products) ? p.products.filter((x: any) => !x.is_deleted) : []);
    setOffers(Array.isArray(o?.offers) ? o.offers.filter((x: any) => !x.is_deleted) : []);
  }, [apiFetch]);

  const loadWork = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([apiFetch('/creative-references'), apiFetch('/generated-pages')]);
      setRefs(Array.isArray(r?.references) ? r.references : []);
      setPages(Array.isArray(g?.pages) ? g.pages : []);
    } catch (e: any) {
      if (/desligadas/i.test(String(e?.message || ''))) {
        showError('Referências foram desligadas neste ambiente.');
        onDisabled?.();
      }
    }
  }, [apiFetch, showError, onDisabled]);

  const loadPage = useCallback(
    async (id: string | null | undefined) => {
      if (!id) {
        setPageData(null);
        return null;
      }
      try {
        const d = await apiFetch(`/generated-pages/${id}`);
        setPageData(d);
        return d;
      } catch {
        setPageData(null);
        return null;
      }
    },
    [apiFetch]
  );

  // primeira carga: catálogo, trabalho em andamento e, se havia uma fábrica aberta, o passo onde parou
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      Promise.resolve(apiFetch('/creative-references/status'))
        .then((r: any) => alive && setKie(r?.kie === true))
        .catch(() => alive && setKie(false));
      await Promise.all([loadCatalog(), loadWork()]);
      const saved = readRun();
      if (saved.pageId) {
        const d = await loadPage(saved.pageId);
        if (!alive) return;
        if (d?.page) setStep(readiness(d).all ? 6 : 4);
        else setRun({});
      } else if (saved.refId) {
        setStep(2);
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ref = useMemo(() => refs.find(r => r.id === run.refId) || null, [refs, run.refId]);
  const refReady = ref?.status === 'READY';
  const ready = readiness(pageData);
  const maxStep = run.pageId ? (ready.all || pageData?.page?.status === 'PUBLISHED' ? 6 : 5) : refReady ? 3 : 1;

  const startNew = () => {
    setRun({});
    setPageData(null);
    setStep(1);
  };
  const openPage = async (p: any) => {
    setRun({ refId: p.reference_id || null, pageId: p.id, productId: p.product_id || null });
    const d = await loadPage(p.id);
    setStep(d && readiness(d).all ? 6 : 4);
  };
  const openRef = (r: any) => {
    setRun({ refId: r.id, pageId: null, productId: r.product_id || null });
    setPageData(null);
    setStep(r.status === 'READY' ? 2 : 1);
  };

  if (loading) return <p className="text-nq-aux text-nq-muted">Carregando a Fábrica...</p>;

  // -------------------------------------------------------------------------------------------
  // Início: o que está em andamento + começar uma nova
  // -------------------------------------------------------------------------------------------
  if (step === 0) {
    const refsWithoutPage = refs.filter(r => r.status === 'READY' && !pages.some(p => p.reference_id === r.id));
    return (
      <div className="space-y-6" data-testid="factory-home">
        <Surface className="p-4 space-y-3">
          <p className="text-nq-body text-nq-text">
            Da referência à campanha em 6 passos: {FACTORY_STEPS.join(' → ')}. A campanha sempre nasce pausada; gastar só com o seu Sim.
          </p>
          {canCreate && (
            <button type="button" onClick={startNew} data-testid="factory-start" className={`${primary} inline-flex items-center gap-1.5 w-full sm:w-auto justify-center`}>
              <Plus className="h-4 w-4" /> Começar uma nova
            </button>
          )}
        </Surface>
        <Section
          title="Em andamento"
          action={
            <button type="button" onClick={loadWork} aria-label="Atualizar a Fábrica" className="h-11 w-11 flex items-center justify-center rounded-full text-nq-muted hover:text-nq-text">
              <RefreshCw className="h-4 w-4" />
            </button>
          }
        >
          {pages.length === 0 && refsWithoutPage.length === 0 ? (
            <p className="px-1 text-nq-aux text-nq-muted" data-testid="factory-empty">
              Nada em andamento ainda.
            </p>
          ) : (
            <RowGroup>
              {pages.map(p => {
                const st = PAGE_STATUS[p.status] || PAGE_STATUS.DRAFT;
                return (
                  <Row
                    key={p.id}
                    testId="factory-page-row"
                    onClick={() => openPage(p)}
                    chevron
                    left={
                      <span>
                        <strong>{p.human_id}</strong> · {p.product_name || 'Produto'}
                      </span>
                    }
                    sub={`Página e anúncios · oferta ${p.offer_human_id || '—'}${p.reference_human_id ? ` · referência ${p.reference_human_id}` : ''}`}
                    right={<StatusPill tone={st.tone}>{st.label}</StatusPill>}
                  />
                );
              })}
              {refsWithoutPage.map(r => (
                <Row
                  key={r.id}
                  testId="factory-ref-row"
                  onClick={() => openRef(r)}
                  chevron
                  left={
                    <span>
                      <strong>{r.human_id}</strong> · {r.product_name || 'Produto'}
                    </span>
                  }
                  sub="Referência analisada, falta gerar a página"
                  right={<StatusPill tone="info">Passo 2</StatusPill>}
                />
              ))}
            </RowGroup>
          )}
        </Section>
      </div>
    );
  }

  // -------------------------------------------------------------------------------------------
  // Passo a passo
  // -------------------------------------------------------------------------------------------
  const stepper = (
    <nav aria-label="Passos da Fábrica" data-testid="factory-stepper" className="space-y-2">
      <ol className="grid grid-cols-6 gap-1.5">
        {FACTORY_STEPS.map((name, i) => {
          const n = i + 1;
          const current = n === step;
          const done = n < step || n <= maxStep - 1;
          const reachable = n <= maxStep;
          return (
            <li key={name} className="min-w-0">
              <button
                type="button"
                disabled={!reachable}
                aria-current={current ? 'step' : undefined}
                data-testid={`factory-step-${n}`}
                onClick={() => setStep(n)}
                className={`w-full flex flex-col items-center gap-1 rounded-nq py-2 min-h-[44px] disabled:opacity-40 ${current ? 'bg-nq-raised' : ''}`}
              >
                <span
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-nq-aux font-semibold tabular-nums ${
                    current ? 'bg-nq-positive text-nq-on-positive' : done ? 'bg-nq-positive/15 text-nq-positive-text' : 'bg-nq-surface text-nq-muted'
                  }`}
                >
                  {done && !current ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : n}
                </span>
                {!isMobile && <span className={`text-nq-caption truncate max-w-full ${current ? 'text-nq-text font-semibold' : 'text-nq-muted'}`}>{name}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {isMobile && (
        <p className="text-nq-aux text-nq-text text-center" data-testid="factory-step-name">
          Passo {step} de 6 · {FACTORY_STEPS[step - 1]}
        </p>
      )}
    </nav>
  );

  const nav = (opts: { next?: { label: string; onClick: () => void; disabled?: boolean; why?: string | null } } = {}) => (
    <div className="space-y-1">
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
        <button type="button" onClick={() => setStep(step <= 1 ? 0 : step - 1)} className={`${quiet} inline-flex items-center gap-1.5 justify-center`}>
          <ArrowLeft className="h-4 w-4" /> {step <= 1 ? 'Início da Fábrica' : 'Voltar'}
        </button>
        {opts.next && (
          <button
            type="button"
            disabled={opts.next.disabled}
            onClick={opts.next.onClick}
            data-testid="factory-next"
            className={`${primary} inline-flex items-center gap-1.5 justify-center`}
          >
            {opts.next.label} <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {opts.next?.disabled && opts.next.why && (
        <p className="text-nq-caption text-nq-subtle sm:text-right" data-testid="factory-next-why">
          {opts.next.why}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6" data-testid="factory-wizard">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setStep(0)} className="inline-flex items-center gap-1.5 text-nq-aux text-nq-muted hover:text-nq-text min-h-[44px]">
          <ArrowLeft className="h-4 w-4" /> Fábrica
        </button>
        {canCreate && step > 1 && (
          <button type="button" onClick={startNew} className="inline-flex items-center gap-1.5 text-nq-aux text-nq-muted hover:text-nq-text min-h-[44px]">
            <Plus className="h-4 w-4" /> Nova
          </button>
        )}
      </div>
      {stepper}

      {step === 1 && (
        <StepInput
          apiFetch={apiFetch}
          products={products}
          refs={refs}
          isAdmin={isAdmin}
          canCreate={canCreate}
          productId={run.productId || ''}
          onProduct={id => setRun({ ...run, productId: id || null })}
          onProductCreated={async p => {
            await loadCatalog();
            setRun({ ...run, productId: p.id });
          }}
          onReference={async r => {
            await loadWork();
            if (r?.id) {
              setRun({ refId: r.id, pageId: null, productId: r.product_id || run.productId || null });
              if (r.status === 'READY') setStep(2);
            }
          }}
          onUseRef={openRef}
          showError={showError}
          showSuccess={showSuccess}
          onDisabled={onDisabled}
          nav={nav({ next: { label: 'Continuar', onClick: () => setStep(2), disabled: !refReady, why: refReady ? null : 'Analise uma referência (link ou prints) para continuar.' } })}
        />
      )}

      {step === 2 && (
        <div className="space-y-4" data-testid="factory-analysis">
          {ref ? (
            <>
              <Surface className="p-4 space-y-1">
                <div className="text-nq-body font-semibold text-nq-text">
                  {ref.human_id} · {ref.reference_type === 'AD' ? 'Anúncio' : 'Página de venda'}
                </div>
                <div className="text-nq-aux text-nq-muted break-words">
                  {ref.product_name || 'Produto'} · {ref.source_kind === 'SCREENSHOTS' ? 'prints' : ref.source_host || 'link'}
                  {ref.extraction_method === 'HEURISTIC' ? ' · estrutura por palavras-chave (sem IA)' : ''}
                </div>
                <p className="text-nq-caption text-nq-subtle">O que o NORQVA leu da referência: só a função e a forma de cada parte. Texto, imagens e nomes dela não são guardados.</p>
              </Surface>
              {ref.status === 'READY' ? (
                <ReferenceStructureView structure={ref.structure} />
              ) : (
                <Surface className="p-4">
                  <StatusPill tone="critical">Falhou</StatusPill>
                  <p className="text-nq-body text-nq-text mt-2 break-words">{ref.failure_reason || 'Motivo não informado.'}</p>
                </Surface>
              )}
            </>
          ) : (
            <p className="text-nq-aux text-nq-muted">Nenhuma referência escolhida. Volte ao passo 1.</p>
          )}
          {nav({ next: { label: 'Continuar', onClick: () => setStep(3), disabled: !refReady } })}
        </div>
      )}

      {step === 3 && ref && (
        <StepProduct
          apiFetch={apiFetch}
          reference={ref}
          products={products}
          offers={offers}
          pages={pages.filter(p => p.reference_id === ref.id)}
          isAdmin={isAdmin}
          canCreate={canCreate}
          kie={kie}
          initialProductId={run.productId || ref.product_id || ''}
          onOfferCreated={loadCatalog}
          onGenerated={async page => {
            await loadWork();
            setRun({ ...run, pageId: page.id, productId: page.product_id || run.productId || null });
            await loadPage(page.id);
            setStep(4);
          }}
          onOpenPage={openPage}
          showError={showError}
          showSuccess={showSuccess}
          nav={nav()}
        />
      )}

      {step === 4 && run.pageId && (
        <div className="space-y-6" data-testid="factory-generation">
          <p className="text-nq-aux text-nq-muted">
            Confira e ajuste a página e os anúncios. Cada campo mostra a checagem (cópia, números, promessas, preço). Aprove os anúncios que vão para a campanha.
          </p>
          <GenerationView
            apiFetch={apiFetch}
            pageId={run.pageId}
            isAdmin={isAdmin}
            canEdit={canCreate}
            showError={showError}
            showSuccess={showSuccess}
            onBack={() => setStep(3)}
            hideBack
            hideCampaign
            hideStatusActions
            onChanged={setPageData}
          />
          {nav({ next: { label: 'Continuar para a aprovação', onClick: () => setStep(5) } })}
        </div>
      )}

      {step === 5 && run.pageId && (
        <StepApproval
          apiFetch={apiFetch}
          pageData={pageData}
          isAdmin={isAdmin}
          reload={() => loadPage(run.pageId)}
          onReviewAds={() => setStep(4)}
          showError={showError}
          showSuccess={showSuccess}
          nav={nav({
            next: {
              label: 'Continuar para a publicação',
              onClick: () => setStep(6),
              disabled: !ready.all,
              why: ready.all ? null : 'Complete os itens acima para publicar.'
            }
          })}
        />
      )}

      {step === 6 && run.pageId && (
        <div className="space-y-6" data-testid="factory-publish">
          {isAdmin ? (
            <GeneratedCampaignPanel
              apiFetch={apiFetch}
              pageId={run.pageId}
              pageStatus={pageData?.page?.status || ''}
              ads={pageData?.ads || []}
              showError={showError}
              showSuccess={showSuccess}
            />
          ) : (
            <p className="text-nq-aux text-nq-muted">Criar a campanha é com o administrador.</p>
          )}
          {nav()}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Passo 1 — Entrada
// ---------------------------------------------------------------------------------------------

function StepInput({
  apiFetch,
  products,
  refs,
  isAdmin,
  canCreate,
  productId,
  onProduct,
  onProductCreated,
  onReference,
  onUseRef,
  showError,
  showSuccess,
  onDisabled,
  nav
}: {
  apiFetch: ApiFetch;
  products: any[];
  refs: any[];
  isAdmin: boolean;
  canCreate: boolean;
  productId: string;
  onProduct: (id: string) => void;
  onProductCreated: (p: any) => Promise<void>;
  onReference: (r: any) => Promise<void>;
  onUseRef: (r: any) => void;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onDisabled?: () => void;
  nav: React.ReactNode;
}) {
  const [text, setText] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ category: 'Infoproduto digital', description: '' });
  const [busy, setBusy] = useState(false);
  const matches = matchProducts(products, text).slice(0, 6);
  const product = products.find(p => p.id === productId) || null;
  const readyRefs = refs.filter(r => r.status === 'READY' && productId && String(r.product_id) === String(productId));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = text.trim();
    if (!name) return showError('Digite o nome do produto.');
    if (!form.description.trim()) return showError('Escreva uma descrição curta do produto.');
    setBusy(true);
    try {
      const r = await apiFetch('/products?mode=real', {
        method: 'POST',
        body: JSON.stringify({ name, category: form.category.trim() || 'Infoproduto digital', description: form.description.trim() })
      });
      if (!r?.product?.id) throw new Error('O produto não voltou do servidor.');
      showSuccess(`Produto ${r.product.human_id || ''} criado (planejado).`);
      setCreating(false);
      await onProductCreated(r.product);
    } catch (err: any) {
      showError(err?.message || 'Não foi possível criar o produto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="factory-input">
      <Surface className="p-4 space-y-4">
        <div>
          <label className={label} htmlFor="fab-name">Nome do produto</label>
          <input id="fab-name" value={text} onChange={e => setText(e.target.value)} placeholder="Ex.: receitas italianas, desafio 21 dias..." className={input} />
          <p className="text-nq-caption text-nq-subtle mt-1">Serve para achar o nosso produto (ou criar um) e para procurar anúncios na Meta.</p>
        </div>

        {matches.length > 0 && (
          <div className="space-y-2" data-testid="fab-matches">
            <div className="text-nq-caption text-nq-subtle">Produtos nossos com esse nome</div>
            <div className="flex flex-wrap gap-2">
              {matches.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onProduct(p.id)}
                  aria-pressed={p.id === productId}
                  className={`${pill} ${p.id === productId ? 'bg-nq-positive text-nq-on-positive' : 'bg-nq-raised text-nq-text'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={label} htmlFor="fab-product">Produto nosso</label>
          <select id="fab-product" value={productId} onChange={e => onProduct(e.target.value)} className={input}>
            <option value="">Selecione...</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {isAdmin && text.trim() && !creating && (
          <button type="button" onClick={() => setCreating(true)} data-testid="fab-create-product" className={`${quiet} inline-flex items-center gap-1.5`}>
            <Plus className="h-4 w-4" /> Criar o produto “{text.trim()}”
          </button>
        )}
        {creating && (
          <form onSubmit={create} className="space-y-3 rounded-nq bg-nq-bg p-3" data-testid="fab-product-form">
            <p className="text-nq-aux text-nq-muted">O produto nasce como planejado. O arquivo entregue e a oferta você acerta depois (a oferta dá para criar no passo 3).</p>
            <div>
              <label className={label} htmlFor="fab-cat">Categoria</label>
              <input id="fab-cat" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="fab-desc">Descrição curta (o que o comprador recebe)</label>
              <textarea id="fab-desc" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={input} />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={() => setCreating(false)} className={quiet}>
                Cancelar
              </button>
              <button type="submit" disabled={busy} data-testid="fab-product-submit" className={primary}>
                {busy ? 'Criando...' : 'Criar produto'}
              </button>
            </div>
          </form>
        )}

        {text.trim() && (
          <div className="space-y-1">
            <a
              href={adLibraryUrl(text)}
              target="_blank"
              rel="noreferrer"
              data-testid="fab-ad-library"
              className="inline-flex items-center gap-1.5 text-nq-aux text-nq-info min-h-[44px]"
            >
              <Search className="h-4 w-4 shrink-0" /> Procurar “{text.trim()}” na Biblioteca de Anúncios da Meta <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
            <p className="text-nq-caption text-nq-subtle">
              Escolha um anúncio que está no ar há bastante tempo, tire de 1 a 5 prints (com a data de início aparecendo) e envie abaixo. A Meta não deixa o NORQVA ler esse site sozinho.
            </p>
          </div>
        )}
      </Surface>

      {readyRefs.length > 0 && (
        <Section title="Referências prontas deste produto">
          <RowGroup>
            {readyRefs.map(r => (
              <Row
                key={r.id}
                testId="fab-existing-ref"
                onClick={() => onUseRef(r)}
                chevron
                left={
                  <span>
                    <strong>{r.human_id}</strong> · {r.reference_type === 'AD' ? 'Anúncio' : 'Página de venda'}
                  </span>
                }
                sub={r.source_kind === 'SCREENSHOTS' ? 'prints' : r.source_host || 'link'}
                right={<StatusPill tone="positive">Usar</StatusPill>}
              />
            ))}
          </RowGroup>
        </Section>
      )}

      {canCreate && (
        <Section title="Nova referência">
          {product ? (
            <ReferenceForm
              apiFetch={apiFetch}
              products={products}
              fixedProductId={product.id}
              showError={showError}
              showSuccess={showSuccess}
              onDisabled={onDisabled}
              onCreated={onReference}
              submitLabel="Analisar"
            />
          ) : (
            <p className="px-1 text-nq-aux text-nq-muted" data-testid="fab-pick-product-first">
              Escolha ou crie o produto acima para enviar o link ou os prints.
            </p>
          )}
        </Section>
      )}
      {nav}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Passo 3 — Produto e oferta, e gerar
// ---------------------------------------------------------------------------------------------

function StepProduct({
  apiFetch,
  reference,
  products,
  offers,
  pages,
  isAdmin,
  canCreate,
  kie,
  initialProductId,
  onOfferCreated,
  onGenerated,
  onOpenPage,
  showError,
  showSuccess,
  nav
}: {
  apiFetch: ApiFetch;
  reference: any;
  products: any[];
  offers: any[];
  pages: any[];
  isAdmin: boolean;
  canCreate: boolean;
  kie: boolean;
  initialProductId: string;
  onOfferCreated: () => Promise<void>;
  onGenerated: (page: any) => Promise<void>;
  onOpenPage: (p: any) => void;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  nav: React.ReactNode;
}) {
  const [productId, setProductId] = useState(initialProductId);
  const [offerId, setOfferId] = useState('');
  const [adCount, setAdCount] = useState(3);
  const [newImages, setNewImages] = useState(true);
  const [working, setWorking] = useState(false);
  const [creatingOffer, setCreatingOffer] = useState(false);
  const product = products.find(p => String(p.id) === String(productId)) || null;
  const productOffers = offers.filter(o => String(o.product_id) === String(productId) && o.status !== 'ARQUIVADA');
  const [offerForm, setOfferForm] = useState({ name: '', price: '', description: '' });

  useEffect(() => {
    if (!productOffers.some(o => o.id === offerId)) {
      const best = productOffers.find(o => o.status === 'ATIVA') || productOffers.find(o => o.status === 'TESTE') || productOffers[0];
      setOfferId(best ? best.id : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, offers]);

  useEffect(() => {
    setOfferForm({ name: product?.name || '', price: '', description: product ? `Acesso digital a ${product.name}.` : '' });
  }, [product?.id, product?.name]);

  const createOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(String(offerForm.price).replace(',', '.'));
    if (!offerForm.name.trim()) return showError('Dê um nome à oferta.');
    if (!Number.isFinite(price) || price <= 0) return showError('Preço inválido.');
    if (!offerForm.description.trim()) return showError('Escreva a descrição da oferta.');
    setWorking(true);
    try {
      const r = await apiFetch('/offers?mode=real', {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, name: offerForm.name.trim(), price: Math.round(price * 100) / 100, description: offerForm.description.trim() })
      });
      showSuccess(`Oferta ${r?.offer?.human_id || ''} criada em rascunho.`);
      setCreatingOffer(false);
      await onOfferCreated();
      if (r?.offer?.id) setOfferId(r.offer.id);
    } catch (err: any) {
      showError(err?.message || 'Não foi possível criar a oferta.');
    } finally {
      setWorking(false);
    }
  };

  const generate = async () => {
    if (!productId) return showError('Escolha o produto.');
    if (!offerId) return showError('Escolha ou crie a oferta.');
    setWorking(true);
    try {
      const r = await apiFetch(`/creative-references/${reference.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, offer_id: offerId, ad_count: adCount, new_images: kie && newImages })
      });
      if (!r?.page?.id) throw new Error('A página gerada não voltou do servidor.');
      showSuccess(`Página ${r.page.human_id || ''} e anúncios gerados (rascunho).`);
      await onGenerated(r.page);
    } catch (err: any) {
      showError(err?.message || 'Não foi possível gerar.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="factory-product">
      <Surface className="p-4 space-y-4">
        <div>
          <label className={label} htmlFor="fab3-product">Produto nosso</label>
          <select id="fab3-product" value={productId} onChange={e => setProductId(e.target.value)} className={input}>
            <option value="">Selecione...</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="text-nq-aux text-nq-muted">Oferta (preço e pagamento da página)</div>
          {productOffers.length === 0 ? (
            <p className="text-nq-aux text-nq-attention" data-testid="fab-no-offer">
              Este produto ainda não tem oferta.{isAdmin ? ' Crie uma abaixo.' : ' Peça ao administrador para criar.'}
            </p>
          ) : (
            <ul className="space-y-2" data-testid="fab-offers">
              {productOffers.map(o => {
                const st = OFFER_STATUS[o.status] || { label: o.status, tone: 'neutral' as Tone };
                return (
                  <li key={o.id}>
                    <label className={`flex items-center gap-3 rounded-nq p-3 min-h-[44px] cursor-pointer ${o.id === offerId ? 'bg-nq-raised' : 'bg-nq-bg'}`}>
                      <input type="radio" name="fab-offer" checked={o.id === offerId} onChange={() => setOfferId(o.id)} />
                      <span className="min-w-0 flex-1 text-nq-aux text-nq-text break-words">
                        {o.human_id} · {o.name} · {brl(o.promotional_price || o.price)}
                      </span>
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {isAdmin && productId && !creatingOffer && (
            <button type="button" onClick={() => setCreatingOffer(true)} data-testid="fab-create-offer" className={`${quiet} inline-flex items-center gap-1.5`}>
              <Plus className="h-4 w-4" /> Criar oferta
            </button>
          )}
          {creatingOffer && (
            <form onSubmit={createOffer} className="space-y-3 rounded-nq bg-nq-bg p-3" data-testid="fab-offer-form">
              <p className="text-nq-aux text-nq-muted">A oferta nasce em rascunho: ninguém compra até você colocar em teste no passo 5.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="fab-offer-name">Nome da oferta</label>
                  <input id="fab-offer-name" value={offerForm.name} onChange={e => setOfferForm({ ...offerForm, name: e.target.value })} className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="fab-offer-price">Preço (R$)</label>
                  <input id="fab-offer-price" inputMode="decimal" value={offerForm.price} onChange={e => setOfferForm({ ...offerForm, price: e.target.value })} placeholder="19,90" className={input} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="fab-offer-desc">Descrição</label>
                <input id="fab-offer-desc" value={offerForm.description} onChange={e => setOfferForm({ ...offerForm, description: e.target.value })} className={input} />
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <button type="button" onClick={() => setCreatingOffer(false)} className={quiet}>
                  Cancelar
                </button>
                <button type="submit" disabled={working} data-testid="fab-offer-submit" className={primary}>
                  {working ? 'Criando...' : 'Criar oferta'}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="fab-ads">Quantos anúncios</label>
            <select id="fab-ads" value={adCount} onChange={e => setAdCount(Number(e.target.value))} className={input}>
              {[3, 4, 5].map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            {kie ? (
              <label className="inline-flex items-center gap-2 text-nq-aux text-nq-text min-h-[44px]">
                <input type="checkbox" checked={newImages} onChange={e => setNewImages(e.target.checked)} />
                Fazer imagens novas na KIE (cerca de 4 créditos cada, até 4)
              </label>
            ) : (
              <p className="text-nq-aux text-nq-attention">Imagens novas desligadas (falta KIE_API_KEY). A página usa as imagens que o produto já tem.</p>
            )}
          </div>
        </div>

        {canCreate && (
          <button
            type="button"
            disabled={working || !productId || !offerId}
            onClick={generate}
            data-testid="fab-generate"
            className={`${primary} inline-flex items-center gap-1.5 w-full sm:w-auto justify-center`}
          >
            <Wand2 className="h-4 w-4" /> {working ? 'Gerando (pode levar 1 minuto)...' : 'Gerar página e anúncios'}
          </button>
        )}
      </Surface>

      {pages.length > 0 && (
        <Section title="Já geradas desta referência">
          <RowGroup>
            {pages.map(p => {
              const st = PAGE_STATUS[p.status] || PAGE_STATUS.DRAFT;
              return (
                <Row
                  key={p.id}
                  testId="fab-page-row"
                  onClick={() => onOpenPage(p)}
                  chevron
                  left={
                    <span>
                      <strong>{p.human_id}</strong> · {p.product_name || 'Produto'}
                    </span>
                  }
                  sub={`Oferta ${p.offer_human_id || '—'}`}
                  right={<StatusPill tone={st.tone}>{st.label}</StatusPill>}
                />
              );
            })}
          </RowGroup>
        </Section>
      )}
      {nav}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Passo 5 — Aprovação: o que falta para publicar
// ---------------------------------------------------------------------------------------------

function StepApproval({
  apiFetch,
  pageData,
  isAdmin,
  reload,
  onReviewAds,
  showError,
  showSuccess,
  nav
}: {
  apiFetch: ApiFetch;
  pageData: any;
  isAdmin: boolean;
  reload: () => Promise<any>;
  onReviewAds: () => void;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  nav: React.ReactNode;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!pageData?.page) return <p className="text-nq-aux text-nq-muted">Carregando...</p>;
  const page = pageData.page;
  const r = readiness(pageData);

  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      showSuccess(ok);
    } catch (e: any) {
      showError(e?.message || 'Não deu certo.');
    } finally {
      await reload();
      setBusy(null);
    }
  };
  const post = (url: string) => apiFetch(url, { method: 'POST', body: '{}' });

  const copyAll = async () => {
    const ok = await copyText(
      buildNorqvaCopy({ title: `${page.product_name || 'Produto'} (${page.human_id})`, sections: page.sections || [], ads: pageData.ads || [] })
    );
    if (ok) showSuccess('Versão NORQVA copiada: página e anúncios.');
    else showError('Não deu para copiar neste navegador.');
  };

  const item = (ok: boolean, title: string, detail: string, action?: React.ReactNode, testId?: string) => (
    <li data-testid={testId}>
      <Surface className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <span className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${ok ? 'bg-nq-positive/15 text-nq-positive-text' : 'bg-nq-raised text-nq-muted'}`}>
          {ok ? <Check className="h-4 w-4" aria-label="Feito" /> : <span className="h-2 w-2 rounded-full bg-nq-muted" aria-label="Falta" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-nq-body font-semibold text-nq-text">{title}</div>
          <div className="text-nq-aux text-nq-muted break-words">{detail}</div>
        </div>
        {!ok && action}
      </Surface>
    </li>
  );

  const adminOnly = <span className="text-nq-caption text-nq-subtle">Só o administrador</span>;

  return (
    <div className="space-y-4" data-testid="factory-approval">
      <p className="text-nq-aux text-nq-muted">
        {r.all ? 'Tudo pronto para montar a campanha.' : 'O que falta para publicar. Cada item tem o botão para resolver.'}
      </p>
      <ol className="space-y-2">
        {item(
          r.approved,
          'Página aprovada',
          r.approved ? 'Você aprovou o texto da página.' : 'Confira a página no passo 4 e aprove.',
          isAdmin ? (
            <button type="button" disabled={!!busy} onClick={() => act('approve', () => post(`/generated-pages/${page.id}/approve`), 'Página aprovada.')} className={primary}>
              {busy === 'approve' ? 'Aprovando...' : 'Aprovar página'}
            </button>
          ) : (
            adminOnly
          ),
          'check-approved'
        )}
        {item(
          r.offerOk,
          'Oferta à venda',
          r.offerOk
            ? `Oferta ${page.offer_human_id || ''} ${page.offer_status === 'ATIVA' ? 'à venda' : 'em teste'}.`
            : `Oferta ${page.offer_human_id || ''} em ${String(OFFER_STATUS[page.offer_status]?.label || page.offer_status || 'rascunho').toLowerCase()}. Em teste, quem tiver o link já consegue comprar.`,
          isAdmin && page.offer_id ? (
            <button
              type="button"
              disabled={!!busy}
              data-testid="offer-to-test"
              onClick={() =>
                act('offer', () => apiFetch(`/offers/${page.offer_id}?mode=real`, { method: 'PUT', body: JSON.stringify({ status: 'TESTE' }) }), 'Oferta em teste.')
              }
              className={primary}
            >
              {busy === 'offer' ? 'Salvando...' : 'Pôr a oferta em teste'}
            </button>
          ) : (
            adminOnly
          ),
          'check-offer'
        )}
        {item(
          r.live,
          'Página no ar',
          r.live ? 'O endereço da página já abre para o comprador.' : 'A campanha leva o comprador para esta página, então ela precisa estar no ar.',
          isAdmin ? (
            <button
              type="button"
              disabled={!!busy || !r.approved || !r.offerOk}
              onClick={() => act('publish', () => post(`/generated-pages/${page.id}/publish`), 'Página publicada.')}
              className={primary}
            >
              {busy === 'publish' ? 'Publicando...' : 'Publicar página'}
            </button>
          ) : (
            adminOnly
          ),
          'check-live'
        )}
        {item(
          r.readyAds > 0,
          'Anúncios aprovados',
          `${r.readyAds} de ${r.totalAds} aprovado(s) e liberado(s) pela checagem.`,
          <button type="button" onClick={onReviewAds} className={quiet}>
            Revisar anúncios
          </button>,
          'check-ads'
        )}
      </ol>
      <button type="button" onClick={copyAll} data-testid="approval-copy" className={`${quiet} inline-flex items-center gap-1.5`}>
        <Copy className="h-4 w-4" /> Copiar a versão NORQVA
      </button>
      {nav}
    </div>
  );
}
