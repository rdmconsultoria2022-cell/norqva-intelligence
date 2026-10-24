import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, Video, MousePointerClick, Link2, Upload, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { Section, Surface, RowGroup, Row, StatusPill, Disclosure, useIsMobile, Tone } from '../../components/ui/premium';
import { GenerationView } from './GenerationView';
import { ReferenceScoreCard } from './ReferenceScoreCard';

// NORQVA-0115 (D-0115): Referências. O NORQVA guarda só a estrutura (esqueleto) de uma página de venda
// ou anúncio de referência. Textos, imagens e nomes da referência não são salvos.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

export const SCREENSHOTS_CONTENT_TYPE = 'application/vnd.norqva.screenshots+json';
const MAX_SHOTS = 5;
const MAX_SHOT_BYTES = 4 * 1024 * 1024;

export const ROLE_LABEL: Record<string, string> = {
  HERO_HOOK: 'Abertura (gancho)',
  PAIN: 'Dor',
  AGITATION: 'Agravamento da dor',
  MECHANISM: 'Por que funciona',
  PRODUCT_REVEAL: 'Apresentação do produto',
  BENEFITS: 'Benefícios',
  CONTENTS: 'O que vem dentro',
  PROOF_RESULTS: 'Provas e resultados',
  TESTIMONIALS: 'Depoimentos',
  AUTHORITY: 'Quem está por trás',
  BONUS: 'Bônus',
  OFFER_PRICE: 'Oferta e preço',
  GUARANTEE: 'Garantia',
  URGENCY: 'Urgência',
  FAQ: 'Perguntas frequentes',
  CTA: 'Chamada para comprar',
  OTHER: 'Outra seção'
};

const HEADLINE_LABEL: Record<string, string> = {
  QUESTION: 'Título em pergunta',
  BOLD_PROMISE: 'Título com promessa forte',
  CURIOSITY: 'Título de curiosidade',
  STATEMENT: 'Título afirmativo',
  NUMBERED: 'Título com número/lista',
  NONE: 'Sem título'
};

const LENGTH_LABEL: Record<string, string> = { SHORT: 'Curta', MEDIUM: 'Média', LONG: 'Longa' };

const HOOK_LABEL: Record<string, string> = {
  QUESTION: 'Pergunta',
  PAIN_POINT: 'Dor',
  BOLD_CLAIM: 'Promessa forte',
  CURIOSITY: 'Curiosidade',
  DEMONSTRATION: 'Demonstração',
  BEFORE_AFTER: 'Antes e depois',
  STORY: 'História',
  TESTIMONIAL: 'Depoimento',
  OFFER: 'Oferta',
  OTHER: 'Outro'
};

const BEAT_LABEL: Record<string, string> = {
  HOOK: 'Gancho',
  PROBLEM: 'Problema',
  DEMONSTRATION: 'Demonstração',
  BENEFIT: 'Benefício',
  PROOF: 'Prova',
  OFFER: 'Oferta',
  CTA: 'Chamada para a ação',
  OTHER: 'Outro trecho'
};

const FORMAT_LABEL: Record<string, string> = { VIDEO: 'Vídeo', IMAGE: 'Imagem', CAROUSEL: 'Carrossel' };
const TYPE_LABEL: Record<string, string> = { SALES_PAGE: 'Página de venda', AD: 'Anúncio' };

const input = 'w-full bg-nq-bg border border-nq-line rounded p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text min-h-[44px]';
const label = 'block text-nq-aux text-nq-muted mb-1';

const when = (d: string) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

const readAsDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(f);
  });

const disabledReply = (e: any) => /desligadas/i.test(String(e?.message || ''));

/**
 * Formulário de nova referência (link ou prints). Usado em Criativos → Referências e no passo 1 da Fábrica.
 * Com `fixedProductId`, o produto já foi escolhido e o campo some.
 */
export function ReferenceForm({
  apiFetch,
  products,
  showError,
  showSuccess,
  onDisabled,
  onCreated,
  fixedProductId,
  defaultNotes = '',
  submitLabel = 'Analisar estrutura'
}: {
  apiFetch: ApiFetch;
  products: any[];
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onDisabled?: () => void;
  onCreated: (ref: any) => void | Promise<void>;
  fixedProductId?: string;
  defaultNotes?: string;
  submitLabel?: string;
}) {
  const [source, setSource] = useState<'URL' | 'SHOTS'>('URL');
  const [url, setUrl] = useState('');
  const [pickedProduct, setProductId] = useState('');
  const productId = fixedProductId || pickedProduct;
  const [refType, setRefType] = useState<'SALES_PAGE' | 'AD'>('SALES_PAGE');
  const [notes, setNotes] = useState(defaultNotes);
  const [adText, setAdText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    setNotes(defaultNotes);
  }, [defaultNotes]);

  const resetFiles = () => {
    setFiles([]);
    setFileKey(k => k + 1);
  };

  const pickFiles = (list: FileList | null) => {
    const arr = Array.from(list || []);
    if (arr.length > MAX_SHOTS) {
      showError('No máximo 5 prints por referência.');
      resetFiles();
      return;
    }
    const big = arr.find(f => f.size > MAX_SHOT_BYTES);
    if (big) {
      showError(`O print ${big.name} passa de 4 MB.`);
      resetFiles();
      return;
    }
    setFiles(arr);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return showError('Escolha um produto.');
    setBusy(true);
    try {
      let r: any;
      if (source === 'URL') {
        if (!url.trim()) {
          showError('Cole o link da página ou do anúncio.');
          return;
        }
        r = await apiFetch('/creative-references', {
          method: 'POST',
          body: JSON.stringify({ url: url.trim(), product_id: productId, reference_type: refType, notes: notes.trim() || undefined })
        });
      } else {
        if (files.length === 0) {
          showError('Escolha de 1 a 5 prints.');
          return;
        }
        const mb = files.reduce((a, f) => a + f.size, 0) / (1024 * 1024);
        setSending(`Enviando prints (${mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB)…`);
        const images = await Promise.all(files.map(readAsDataUrl));
        r = await apiFetch('/creative-references/screenshots', {
          method: 'POST',
          headers: { 'Content-Type': SCREENSHOTS_CONTENT_TYPE },
          body: JSON.stringify({
            images,
            ad_text: adText.trim() || undefined,
            product_id: productId,
            reference_type: refType,
            notes: notes.trim() || undefined
          })
        });
      }
      const ref = r?.reference;
      if (ref?.status === 'READY') showSuccess(`Referência ${ref.human_id} pronta.`);
      else if (ref) showError(`Referência ${ref.human_id} falhou: ${ref.failure_reason || 'motivo não informado'}`);
      setUrl('');
      setNotes(defaultNotes);
      setAdText('');
      resetFiles();
      await onCreated(ref);
    } catch (err: any) {
      if (disabledReply(err)) {
        showError('Referências foram desligadas neste ambiente.');
        onDisabled?.();
        return;
      }
      showError(err?.message || 'Não foi possível criar a referência.');
    } finally {
      setBusy(false);
      setSending(null);
    }
  };

  return (
    <Surface className="p-4">
      <form onSubmit={submit} className="space-y-4 text-nq-body" data-testid="reference-form">
        <div className="flex gap-2" role="tablist" aria-label="Origem da referência">
          {([
            ['URL', 'Colar link', Link2],
            ['SHOTS', 'Enviar prints', Upload]
          ] as const).map(([k, text, Icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={source === k}
              onClick={() => setSource(k)}
              className={`inline-flex items-center gap-1.5 px-4 rounded-full text-nq-aux font-semibold min-h-[44px] ${
                source === k ? 'bg-nq-raised text-nq-text' : 'text-nq-muted hover:text-nq-text'
              }`}
            >
              <Icon className="h-4 w-4" /> {text}
            </button>
          ))}
        </div>
        {source === 'URL' ? (
          <div>
            <label className={label} htmlFor="ref-url">Link da página ou do anúncio</label>
            <input id="ref-url" type="url" inputMode="url" placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} className={input} />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={label} htmlFor="ref-files">Prints da página ou do anúncio (até 5, 4 MB cada)</label>
              <input
                key={fileKey}
                id="ref-files"
                data-testid="reference-files"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                onChange={e => pickFiles(e.target.files)}
                className="block w-full text-nq-aux text-nq-muted file:mr-3 file:rounded-full file:border-0 file:bg-nq-raised file:px-4 file:py-2 file:text-nq-text"
              />
              {files.length > 0 && <p className="text-nq-caption text-nq-subtle mt-1">{files.length} print(s) escolhido(s).</p>}
            </div>
            <div>
              <label className={label} htmlFor="ref-adtext">Texto do anúncio (opcional)</label>
              <textarea id="ref-adtext" rows={3} value={adText} onChange={e => setAdText(e.target.value)} className={input} />
              <p className="text-nq-caption text-nq-subtle mt-1">Serve só para entender a estrutura; não é salvo.</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!fixedProductId && (
            <div>
              <label className={label} htmlFor="ref-product">Produto nosso</label>
              <select id="ref-product" value={pickedProduct} onChange={e => setProductId(e.target.value)} className={input}>
                <option value="">Selecione...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={label} htmlFor="ref-type">Tipo</label>
            <select id="ref-type" value={refType} onChange={e => setRefType(e.target.value as 'SALES_PAGE' | 'AD')} className={input}>
              <option value="SALES_PAGE">Página de venda</option>
              <option value="AD">Anúncio</option>
            </select>
          </div>
        </div>
        <div>
          <label className={label} htmlFor="ref-notes">Suas observações (opcional)</label>
          <input id="ref-notes" type="text" maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} className={input} />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            data-testid="reference-submit"
            className="px-5 rounded-full bg-nq-positive text-nq-on-positive font-semibold hover:brightness-110 disabled:opacity-50 min-h-[44px] w-full sm:w-auto"
          >
            {busy ? sending || 'Analisando...' : submitLabel}
          </button>
        </div>
      </form>
    </Surface>
  );
}

export const CreativeReferences: React.FC<{
  apiFetch: ApiFetch;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  products: any[];
  /** NORQVA-0116: ofertas (para escolher a oferta da página gerada). */
  offers?: any[];
  isAdmin: boolean;
  canCreate: boolean;
  /** Servidor respondeu que a trava está desligada: a tela volta para Criativos e esconde a aba. */
  onDisabled?: () => void;
}> = ({ apiFetch, showError, showSuccess, products, offers = [], isAdmin, canCreate, onDisabled }) => {
  const isMobile = useIsMobile();
  // NORQVA-0116: geração aberta e se há imagens novas (KIE) no servidor
  const [genId, setGenId] = useState<string | null>(null);
  const [kie, setKie] = useState(false);
  useEffect(() => {
    Promise.resolve(apiFetch('/creative-references/status'))
      .then((r: any) => setKie(r?.kie === true))
      .catch(() => setKie(false));
  }, [apiFetch]);
  const [items, setItems] = useState<any[]>([]);
  const [trash, setTrash] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/creative-references');
      setItems(Array.isArray(r?.references) ? r.references : []);
      setTrash(Array.isArray(r?.trash) ? r.trash : []);
      setLoadError(null);
    } catch (e: any) {
      if (disabledReply(e)) {
        showError('Referências foram desligadas neste ambiente.');
        onDisabled?.();
        return;
      }
      setLoadError(e?.message || 'Não foi possível carregar as referências.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showError, onDisabled]);

  useEffect(() => {
    load();
  }, [load]);

  const trashAction = async (id: string, action: 'delete' | 'restore') => {
    setBusy(true);
    try {
      if (action === 'delete') await apiFetch(`/creative-references/${id}`, { method: 'DELETE' });
      else await apiFetch(`/creative-references/${id}/restore`, { method: 'POST', body: '{}' });
      showSuccess(action === 'delete' ? 'Referência foi para a lixeira.' : 'Referência restaurada.');
      if (action === 'delete') setOpenId(null);
      await load();
    } catch (err: any) {
      showError(err?.message || 'Operação falhou.');
    } finally {
      setBusy(false);
    }
  };

  if (genId) {
    return (
      <GenerationView
        apiFetch={apiFetch}
        pageId={genId}
        isAdmin={isAdmin}
        canEdit={canCreate}
        showError={showError}
        showSuccess={showSuccess}
        onBack={() => setGenId(null)}
      />
    );
  }

  const open = items.find(i => i.id === openId) || null;
  if (open) {
    return (
      <ReferenceDetail
        item={open}
        isAdmin={isAdmin}
        busy={busy}
        onBack={() => setOpenId(null)}
        onDelete={() => trashAction(open.id, 'delete')}
        generation={{ apiFetch, products, offers, canCreate, kie, showError, showSuccess, onOpen: setGenId }}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="creative-references">
      <p className="text-nq-aux text-nq-muted" data-testid="references-privacy-note">
        O NORQVA guarda só a estrutura. Textos, imagens e nomes da referência não são salvos.
      </p>

      {canCreate && (
        <ReferenceForm
          apiFetch={apiFetch}
          products={products}
          showError={showError}
          showSuccess={showSuccess}
          onDisabled={onDisabled}
          onCreated={async ref => {
            await load();
            if (ref?.id) setOpenId(ref.id);
          }}
        />
      )}

      <Section
        title={`Referências (${items.length})`}
        action={
          <button type="button" onClick={load} aria-label="Atualizar referências" className="h-11 w-11 flex items-center justify-center rounded-full text-nq-muted hover:text-nq-text">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      >
        {loadError ? (
          <div className="px-1 space-y-2" data-testid="references-error">
            <p className="text-nq-aux text-nq-critical-text break-words">Não foi possível carregar as referências: {loadError}</p>
            <button type="button" onClick={load} className="px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux font-semibold min-h-[44px]">
              Tentar de novo
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="px-1 text-nq-aux text-nq-muted" data-testid="references-empty">
            {loading ? 'Carregando...' : 'Nenhuma referência ainda.'}
          </p>
        ) : (
          <RowGroup>
            {items.map(r => (
              <Row
                key={r.id}
                testId="reference-row"
                onClick={() => setOpenId(r.id)}
                chevron
                left={
                  <span>
                    <strong>{r.human_id}</strong> · {r.product_name || 'Produto'}
                  </span>
                }
                sub={`${TYPE_LABEL[r.reference_type] || r.reference_type} · ${r.source_kind === 'SCREENSHOTS' ? 'prints' : r.source_host || 'link'}${
                  isMobile ? '' : ` · ${when(r.created_at)}`
                }`}
                right={
                  r.status === 'READY' ? (
                    <StatusPill tone="positive">Pronta</StatusPill>
                  ) : (
                    <StatusPill tone="critical">Falhou</StatusPill>
                  )
                }
              />
            ))}
          </RowGroup>
        )}
      </Section>

      {isAdmin && trash.length > 0 && (
        <Surface>
          <Disclosure
            testId="references-trash"
            summary={
              <span className="inline-flex items-center gap-1.5">
                <Trash2 className="h-4 w-4" /> Lixeira de referências ({trash.length})
              </span>
            }
          >
            <ul className="space-y-2">
              {trash.map(r => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-nq-aux">
                  <span className="text-nq-text">
                    {r.human_id} · {r.product_name || 'Produto'} <span className="text-nq-subtle">excluída em {when(r.deleted_at)}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => trashAction(r.id, 'restore')}
                    className="px-4 rounded-full bg-nq-raised text-nq-text font-semibold min-h-[44px] disabled:opacity-50"
                  >
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
          </Disclosure>
        </Surface>
      )}
    </div>
  );
};

function Fact({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-nq-caption text-nq-subtle">{name}</div>
      <div className="text-nq-body text-nq-text break-words">{value}</div>
    </div>
  );
}

const GEN_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  APPROVED: { label: 'Aprovada', tone: 'info' },
  PUBLISHED: { label: 'No ar', tone: 'positive' },
  UNPUBLISHED: { label: 'Fora do ar', tone: 'attention' }
};

interface GenerationProps {
  apiFetch: ApiFetch;
  products: any[];
  offers: any[];
  canCreate: boolean;
  kie: boolean;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onOpen: (id: string) => void;
}

/** NORQVA-0116: "Gerar página e anúncios" numa referência pronta + as gerações já feitas. */
function GenerationPanel({ item, g }: { item: any; g: GenerationProps }) {
  const [pages, setPages] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState<string>(item.product_id || '');
  const [offerId, setOfferId] = useState('');
  const [adCount, setAdCount] = useState(3);
  const [newImages, setNewImages] = useState(true);
  const [working, setWorking] = useState(false);
  const productOffers = g.offers.filter(o => String(o.product_id) === String(productId) && !o.is_deleted && o.status !== 'ARQUIVADA');
  const { apiFetch } = g;

  const loadPages = useCallback(async () => {
    try {
      const r = await apiFetch(`/generated-pages?reference_id=${encodeURIComponent(item.id)}`);
      setPages(Array.isArray(r?.pages) ? r.pages : []);
    } catch {
      setPages([]);
    }
  }, [apiFetch, item.id]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  useEffect(() => {
    if (!productOffers.some(o => o.id === offerId)) {
      const best = productOffers.find(o => o.status === 'ATIVA') || productOffers[0];
      setOfferId(best ? best.id : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, g.offers]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return g.showError('Escolha o produto.');
    if (!offerId) return g.showError('Escolha a oferta.');
    setWorking(true);
    try {
      const r = await apiFetch(`/creative-references/${item.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, offer_id: offerId, ad_count: adCount, new_images: g.kie && newImages })
      });
      g.showSuccess(`Página ${r?.page?.human_id || ''} e anúncios gerados (rascunho).`);
      if (r?.page?.id) g.onOpen(r.page.id);
    } catch (err: any) {
      g.showError(err?.message || 'Não foi possível gerar.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Section title="Página e anúncios gerados" testId="generation-panel">
      {g.canCreate && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="open-generate"
          className="inline-flex items-center gap-1.5 px-5 rounded-full bg-nq-positive text-nq-on-positive font-semibold min-h-[44px] w-full sm:w-auto justify-center"
        >
          <Wand2 className="h-4 w-4" /> Gerar página e anúncios
        </button>
      )}
      {g.canCreate && open && (
        <Surface className="p-4">
          <form onSubmit={submit} className="space-y-4 text-nq-body" data-testid="generate-form">
            <p className="text-nq-aux text-nq-muted">
              O NORQVA escreve uma página e anúncios novos, só com os dados do nosso produto, seguindo a ordem e a função das partes da referência.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="gen-product">Produto nosso</label>
                <select id="gen-product" value={productId} onChange={e => setProductId(e.target.value)} className={input}>
                  <option value="">Selecione...</option>
                  {g.products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="gen-offer">Oferta (preço e pagamento da página)</label>
                <select id="gen-offer" value={offerId} onChange={e => setOfferId(e.target.value)} className={input}>
                  <option value="">Selecione...</option>
                  {productOffers.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.human_id} · {o.name}
                      {o.status !== 'ATIVA' ? ` (${String(o.status).toLowerCase()})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="gen-ads">Quantos anúncios</label>
                <select id="gen-ads" value={adCount} onChange={e => setAdCount(Number(e.target.value))} className={input}>
                  {[3, 4, 5].map(n => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                {g.kie ? (
                  <label className="inline-flex items-center gap-2 text-nq-aux text-nq-text min-h-[44px]">
                    <input type="checkbox" checked={newImages} onChange={e => setNewImages(e.target.checked)} />
                    Fazer imagens novas na KIE (cerca de 4 créditos cada, até 4)
                  </label>
                ) : (
                  <p className="text-nq-aux text-nq-attention" data-testid="kie-off">
                    Imagens novas desligadas (falta KIE_API_KEY). A página usa as imagens que o produto já tem.
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={() => setOpen(false)} className="px-4 rounded-full bg-nq-raised text-nq-text font-semibold min-h-[44px]">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={working}
                data-testid="generate-submit"
                className="px-5 rounded-full bg-nq-positive text-nq-on-positive font-semibold hover:brightness-110 disabled:opacity-50 min-h-[44px]"
              >
                {working ? 'Gerando (pode levar 1 minuto)...' : 'Gerar'}
              </button>
            </div>
          </form>
        </Surface>
      )}
      {pages.length > 0 ? (
        <RowGroup>
          {pages.map(p => {
            const st = GEN_STATUS[p.status] || GEN_STATUS.DRAFT;
            return (
              <Row
                key={p.id}
                testId="generated-row"
                onClick={() => g.onOpen(p.id)}
                chevron
                left={
                  <span>
                    <strong>{p.human_id}</strong> · {p.product_name || 'Produto'}
                  </span>
                }
                sub={`Oferta ${p.offer_human_id || '—'} · ${when(p.created_at)}`}
                right={<StatusPill tone={st.tone}>{st.label}</StatusPill>}
              />
            );
          })}
        </RowGroup>
      ) : (
        <p className="px-1 text-nq-aux text-nq-muted">Nenhuma geração ainda.</p>
      )}
    </Section>
  );
}

function ReferenceDetail({
  item,
  isAdmin,
  busy,
  onBack,
  onDelete,
  generation
}: {
  item: any;
  isAdmin: boolean;
  busy: boolean;
  onBack: () => void;
  onDelete: () => void;
  generation?: GenerationProps;
}) {
  const s = item.structure;
  return (
    <div className="space-y-4" data-testid="reference-detail">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-nq-aux text-nq-muted hover:text-nq-text min-h-[44px]">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        {isAdmin && (
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux font-semibold min-h-[44px] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Mandar para a lixeira
          </button>
        )}
      </div>
      <div>
        <h2 className="text-nq-section font-semibold text-nq-text break-words">
          {item.human_id} · {TYPE_LABEL[item.reference_type] || item.reference_type}
        </h2>
        <p className="text-nq-aux text-nq-muted break-words">
          {item.product_name || 'Produto'} · {item.source_kind === 'SCREENSHOTS' ? 'prints' : item.source_host || 'link'} · {when(item.created_at)}
          {item.extraction_method === 'HEURISTIC' ? ' · estrutura por palavras-chave (sem IA)' : ''}
        </p>
        {item.notes && <p className="text-nq-aux text-nq-text mt-1 break-words">Observações: {item.notes}</p>}
        <p className="text-nq-caption text-nq-subtle mt-1">O NORQVA guarda só a estrutura. Textos, imagens e nomes da referência não são salvos.</p>
      </div>

      {item.status !== 'READY' && (
        <Surface className="p-4">
          <StatusPill tone="critical">Falhou</StatusPill>
          <p className="text-nq-body text-nq-text mt-2 break-words" data-testid="reference-failure">
            {item.failure_reason || 'Motivo não informado.'}
          </p>
        </Surface>
      )}

      {item.status === 'READY' && <ReferenceScoreCard score={item.score} />}
      <ReferenceStructureView structure={s} />

      {generation && item.status === 'READY' && s && <GenerationPanel item={item} g={generation} />}
    </div>
  );
}

/** Esqueleto lido de uma referência (página de venda ou anúncio). Usado no detalhe e no passo 2 da Fábrica. */
export function ReferenceStructureView({ structure }: { structure: any }) {
  const s = structure;
  if (!s) return null;
  return (
    <>
      {s?.kind === 'SALES_PAGE' && (
        <>
          <Surface className="p-4 grid grid-cols-2 gap-3">
            <Fact name="Tamanho" value={LENGTH_LABEL[s.length_class] || s.length_class} />
            <Fact name="Tom" value={s.tone || '—'} />
            <Fact name="Estilo dos botões" value={s.cta_text_style || '—'} />
            <Fact name="Clima das cores" value={s.color_mood || '—'} />
          </Surface>
          <ol className="space-y-2" data-testid="reference-sections">
            {(s.sections || []).map((sec: any) => (
              <li key={sec.order} data-testid="reference-section">
                <Surface className="p-4 flex gap-3">
                  <span className="shrink-0 h-7 w-7 rounded-full bg-nq-raised text-nq-text text-nq-aux font-semibold flex items-center justify-center tabular-nums">
                    {sec.order}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-nq-body font-semibold text-nq-text">{ROLE_LABEL[sec.role] || ROLE_LABEL.OTHER}</div>
                    <div className="text-nq-aux text-nq-text break-words">{sec.purpose}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-nq-caption text-nq-muted">
                      <span>{HEADLINE_LABEL[sec.headline_style] || HEADLINE_LABEL.NONE}</span>
                      <span>~{sec.approx_words} palavras</span>
                      {sec.has_image && (
                        <span className="inline-flex items-center gap-1" title="Tem imagem">
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" /> imagem
                        </span>
                      )}
                      {sec.has_video && (
                        <span className="inline-flex items-center gap-1" title="Tem vídeo">
                          <Video className="h-3.5 w-3.5" aria-hidden="true" /> vídeo
                        </span>
                      )}
                      {sec.cta_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" /> {sec.cta_count} {sec.cta_count === 1 ? 'botão' : 'botões'}
                        </span>
                      )}
                    </div>
                  </div>
                </Surface>
              </li>
            ))}
          </ol>
        </>
      )}

      {s?.kind === 'AD' && (
        <>
          <Surface className="p-4 grid grid-cols-2 gap-3">
            <Fact name="Gancho" value={HOOK_LABEL[s.hook_type] || s.hook_type} />
            <Fact name="Formato" value={`${FORMAT_LABEL[s.format] || s.format}${s.duration_s ? ` · ${s.duration_s} s` : ''}`} />
            <Fact name="Texto na tela" value={s.on_screen_text ? 'Sim' : 'Não'} />
            <Fact name="Narração" value={s.voiceover ? 'Sim' : 'Não'} />
            <Fact name="Ângulo" value={s.angle || '—'} />
            <Fact name="Chamada" value={s.cta_style || '—'} />
          </Surface>
          <ol className="space-y-2" data-testid="reference-beats">
            {(s.structure_beats || []).map((b: any, i: number) => (
              <li key={i} data-testid="reference-beat">
                <Surface className="p-4 flex gap-3">
                  <span className="shrink-0 h-7 w-7 rounded-full bg-nq-raised text-nq-text text-nq-aux font-semibold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-nq-body font-semibold text-nq-text">
                      {BEAT_LABEL[b.role] || BEAT_LABEL.OTHER}
                      {b.t_from_s !== null && b.t_from_s !== undefined ? <span className="text-nq-muted font-normal"> · a partir de {b.t_from_s} s</span> : null}
                    </div>
                    <div className="text-nq-aux text-nq-text break-words">{b.purpose}</div>
                  </div>
                </Surface>
              </li>
            ))}
          </ol>
        </>
      )}

    </>
  );
}
