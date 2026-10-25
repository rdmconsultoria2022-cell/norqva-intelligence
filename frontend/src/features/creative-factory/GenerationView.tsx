import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, ExternalLink, Image as ImageIcon, Wand2, Copy } from 'lucide-react';
import { Section, Surface, StatusPill, useIsMobile, Tone } from '../../components/ui/premium';
import { ROLE_LABEL } from './CreativeReferences';
import { GeneratedCampaignPanel } from './GeneratedCampaignPanel';
import { buildNorqvaCopy, adText, copyText } from './factoryCopy';

// NORQVA-0116 (D-0116): tela de geração. À esquerda, o esqueleto da referência (só função e forma); à direita,
// a NOSSA seção, editável. No celular as duas ficam uma embaixo da outra. Cada campo mostra o selo da checagem
// (cópia da referência, número inventado, promessa de saúde, preço no anúncio). Aprovar e publicar: só ADMIN.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

const PAGE_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  APPROVED: { label: 'Aprovada', tone: 'info' },
  PUBLISHED: { label: 'No ar', tone: 'positive' },
  UNPUBLISHED: { label: 'Fora do ar', tone: 'attention' }
};

const AD_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Aguardando revisão', tone: 'neutral' },
  APPROVED: { label: 'Aprovado', tone: 'positive' },
  REJECTED: { label: 'Rejeitado', tone: 'critical' },
  REVISION_REQUESTED: { label: 'Ajuste pedido', tone: 'attention' }
};

const REJECT_REASONS: Array<[string, string]> = [
  ['WEAK_HOOK', 'Gancho fraco'],
  ['BAD_COPY', 'Texto ruim'],
  ['EXAGGERATED_PROMISE', 'Promessa exagerada'],
  ['UNCLEAR_PRODUCT', 'Produto pouco claro'],
  ['OFF_STRATEGY', 'Fora da estratégia'],
  ['POLICY_RISK', 'Risco de política da Meta'],
  ['OTHER', 'Outro']
];

const IMAGE_LABEL: Record<string, string> = {
  PRODUCT: 'Imagem do produto',
  PENDING: 'Imagem nova sendo feita…',
  READY: 'Imagem nova',
  FAILED: 'Imagem nova falhou'
};

const input = 'w-full bg-nq-bg border border-nq-line rounded p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text min-h-[44px]';
const pill = 'px-4 rounded-full text-nq-aux font-semibold min-h-[44px] disabled:opacity-50';

interface FieldCheck {
  ok: boolean;
  issues: Array<{ code: string; detail: string }>;
}

/** Selo de um campo: "Original" ou o motivo do bloqueio. */
export function CheckBadge({ check, testId }: { check?: FieldCheck | null; testId?: string }) {
  if (!check) return null;
  if (check.ok) {
    return (
      <StatusPill tone="positive" testId={testId}>
        Original
      </StatusPill>
    );
  }
  return (
    <span data-testid={testId} className="inline-flex flex-col gap-0.5">
      {check.issues.map((i, k) => (
        <StatusPill key={k} tone="critical">
          {i.detail}
        </StatusPill>
      ))}
    </span>
  );
}

type SectionDraft = { headline: string; body: string; bullets: string; cta_label: string };
type AdDraft = { hook: string; primary_text: string; headline: string; description: string; cta: string; script: string };

const sectionDraft = (s: any): SectionDraft => ({ headline: s.headline || '', body: s.body || '', bullets: (s.bullets || []).join('\n'), cta_label: s.cta_label || '' });
const adDraft = (a: any): AdDraft => ({
  hook: a.hook || '', primary_text: a.primary_text || '', headline: a.headline || '', description: a.ad_description || '', cta: a.cta || '', script: a.script || ''
});

export const GenerationView: React.FC<{
  apiFetch: ApiFetch;
  pageId: string;
  isAdmin: boolean;
  canEdit: boolean;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onBack: () => void;
  /** NORQVA-0118: na Fábrica a campanha fica no passo 6 e a navegação é a do passo a passo. */
  hideCampaign?: boolean;
  hideBack?: boolean;
  /** NORQVA-0118: aprovar/publicar a página ficam no passo 5 da Fábrica. */
  hideStatusActions?: boolean;
  /** NORQVA-0118: avisa a Fábrica quando a página ou os anúncios mudam (aprovação, publicação). */
  onChanged?: (d: any) => void;
}> = ({ apiFetch, pageId, isAdmin, canEdit, showError, showSuccess, onBack, hideCampaign = false, hideBack = false, hideStatusActions = false, onChanged }) => {
  const isMobile = useIsMobile();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, SectionDraft>>({});
  const [adDrafts, setAdDrafts] = useState<Record<string, AdDraft>>({});
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const alive = useRef(true);

  const apply = (d: any) => {
    if (!alive.current || !d?.page) return;
    setData(d);
    onChanged?.(d);
    setDrafts(Object.fromEntries((d.page.sections || []).map((s: any) => [s.order, sectionDraft(s)])));
    setAdDrafts(Object.fromEntries((d.ads || []).map((a: any) => [a.id, adDraft(a)])));
  };

  const load = useCallback(async () => {
    try {
      apply(await apiFetch(`/generated-pages/${pageId}`));
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message || 'Não foi possível abrir a página gerada.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, pageId]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // imagens novas em andamento: atualiza sozinho
  const pending = (data?.page?.sections || []).some((s: any) => s.image_status === 'PENDING');
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      try {
        const d = await apiFetch(`/generated-pages/${pageId}`);
        if (!alive.current) return;
        // só troca as imagens; não apaga o que o dono está digitando
        setData((cur: any) => (cur ? { ...cur, page: { ...cur.page, sections: d.page.sections, copy_check: d.page.copy_check } } : d));
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }, 8000);
    return () => clearInterval(t);
  }, [pending, apiFetch, pageId]);

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      const d = await fn();
      if (d?.page) apply(d);
      else await load();
      showSuccess(ok);
    } catch (e: any) {
      showError(e?.message || 'Não deu certo.');
    } finally {
      if (alive.current) setBusy(null);
    }
  };
  const post = (url: string, body: any = {}) => apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
  const patch = (url: string, body: any) => apiFetch(url, { method: 'PATCH', body: JSON.stringify(body) });

  if (loadError) {
    return (
      <div className="space-y-3" data-testid="generation-error">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-nq-aux text-nq-muted hover:text-nq-text min-h-[44px]">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <p className="text-nq-aux text-nq-critical-text break-words">{loadError}</p>
      </div>
    );
  }
  if (!data) return <p className="text-nq-aux text-nq-muted">Carregando...</p>;

  const { page, reference, ads, images } = data;
  const st = PAGE_STATUS[page.status] || PAGE_STATUS.DRAFT;
  const fields = page.copy_check?.fields || {};
  const blocked = Number(page.copy_check?.blocked_count || 0);
  const refSections: any[] = reference?.structure?.kind === 'SALES_PAGE' ? reference.structure.sections || [] : [];
  const editable = canEdit && page.status !== 'PUBLISHED';
  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/v/${page.slug}` : `/v/${page.slug}`;
  const notes: string[] = page.copy_check?.notes || [];

  // NORQVA-0118: copia o que está na tela (inclusive o que ainda não foi salvo). Só texto nosso.
  const copyAll = async () => {
    const sections = (page.sections || []).map((s: any) => {
      const d = drafts[s.order];
      return s.fixed || !d ? s : { ...s, headline: d.headline, body: d.body, bullets: d.bullets, cta_label: d.cta_label };
    });
    const list = (ads || []).map((a: any) => ({ human_id: a.human_id, ...(adDrafts[a.id] || adDraft(a)) }));
    const ok = await copyText(buildNorqvaCopy({ title: `${page.product_name || 'Produto'} (${page.human_id})`, sections, ads: list }));
    if (ok) showSuccess('Versão NORQVA copiada: página e anúncios.');
    else showError('Não deu para copiar neste navegador. Selecione o texto e copie à mão.');
  };
  const copyAd = async (a: any) => {
    const ok = await copyText(adText({ human_id: a.human_id, ...(adDrafts[a.id] || adDraft(a)) }));
    if (ok) showSuccess(`Anúncio ${a.human_id} copiado.`);
    else showError('Não deu para copiar neste navegador.');
  };

  const refCard = (s: any) => {
    const r = refSections.find(x => x.order === s.ref_order);
    return (
      <Surface className="p-4 space-y-1 h-full" as="div">
        <div className="text-nq-caption text-nq-subtle">{r ? `Referência · parte ${r.order}` : 'Modelo do NORQVA'}</div>
        <div className="text-nq-body font-semibold text-nq-text">{ROLE_LABEL[(r || s).role] || ROLE_LABEL.OTHER}</div>
        <div className="text-nq-aux text-nq-text break-words">{r ? r.purpose : 'Seção sugerida pelo NORQVA.'}</div>
        {r && (
          <div className="text-nq-caption text-nq-muted">
            ~{r.approx_words} palavras{r.has_image ? ' · imagem' : ''}
            {r.cta_count > 0 ? ` · ${r.cta_count} ${r.cta_count === 1 ? 'botão' : 'botões'}` : ''}
          </div>
        )}
        {s.replaced_from && (
          <div className="text-nq-caption text-nq-attention">
            No lugar de "{ROLE_LABEL[s.replaced_from] || s.replaced_from}": não temos depoimentos ou resultados aprovados.
          </div>
        )}
      </Surface>
    );
  };

  const ourCard = (s: any) => {
    const d = drafts[s.order] || sectionDraft(s);
    const set = (k: keyof SectionDraft, v: string) => setDrafts(cur => ({ ...cur, [s.order]: { ...d, [k]: v } }));
    const changed = JSON.stringify(d) !== JSON.stringify(sectionDraft(s));
    const f = (name: string) => fields[`${s.order}.${name}`];
    const extras = (
      <>
        {s.price && (
          <div className="rounded bg-nq-raised p-3" data-testid={`section-price-${s.order}`}>
            <div className="text-nq-caption text-nq-subtle">Preço (vem da oferta, na hora; a IA não escreve preço)</div>
            <div className="text-nq-body font-semibold text-nq-text">{s.price.price_text}</div>
            {s.price.installments_text && <div className="text-nq-aux text-nq-muted">{s.price.installments_text}</div>}
          </div>
        )}
        {s.fixed_note && <p className="text-nq-aux text-nq-muted">Texto fixo: {s.fixed_note}</p>}
      </>
    );
    if (s.fixed) {
      return (
        <Surface className="p-4 space-y-2" as="div">
          <div className="text-nq-caption text-nq-subtle">Nossa seção {s.order} · texto das promessas aprovadas</div>
          <div className="text-nq-body font-semibold text-nq-text">{s.headline}</div>
          <ul className="list-disc pl-5 text-nq-aux text-nq-text space-y-1" data-testid={`fixed-section-${s.order}`}>
            {(s.bullets || []).map((b: string, k: number) => (
              <li key={k}>{b}</li>
            ))}
          </ul>
          <p className="text-nq-caption text-nq-subtle">Não é escrito pela IA. Para mudar, mude a promessa na fábrica.</p>
        </Surface>
      );
    }
    return (
      <Surface className="p-4 space-y-3" as="div">
        <div className="flex items-center justify-between gap-2">
          <div className="text-nq-caption text-nq-subtle">Nossa seção {s.order}</div>
          {s.image_status && s.image_status !== 'NONE' ? (
            <span className="inline-flex items-center gap-1 text-nq-caption text-nq-muted">
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" /> {IMAGE_LABEL[s.image_status] || ''}
            </span>
          ) : s.image_fallback ? (
            // NORQVA-0129: imagem do produto posta na hora de mostrar (não gravada na página)
            <span className="inline-flex items-center gap-1 text-nq-caption text-nq-muted" data-testid={`image-fallback-${s.order}`}>
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" /> Imagem do produto (só na tela)
            </span>
          ) : null}
        </div>
        {s.image_preview_url && <img src={s.image_preview_url} alt="" className="w-full rounded aspect-[3/2] object-cover" />}
        {s.image_error && <p className="text-nq-caption text-nq-attention break-words">{s.image_error}</p>}
        {extras}
        <label className="block space-y-1">
          <span className="flex flex-wrap items-center justify-between gap-2 text-nq-aux text-nq-muted">
            Título <CheckBadge check={f('headline')} testId={`check-${s.order}-headline`} />
          </span>
          <input className={input} value={d.headline} disabled={!editable} onChange={e => set('headline', e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="flex flex-wrap items-center justify-between gap-2 text-nq-aux text-nq-muted">
            Texto <CheckBadge check={f('body')} testId={`check-${s.order}-body`} />
          </span>
          <textarea className={input} rows={5} value={d.body} disabled={!editable} onChange={e => set('body', e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="flex flex-wrap items-center justify-between gap-2 text-nq-aux text-nq-muted">
            Lista (um item por linha) <CheckBadge check={f('bullets')} />
          </span>
          <textarea className={input} rows={3} value={d.bullets} disabled={!editable} onChange={e => set('bullets', e.target.value)} />
        </label>
        {(d.cta_label || (s.removed_fields || []).includes('cta_label') || f('cta_label')?.issues?.length) ? (
          <label className="block space-y-1">
            <span className="flex flex-wrap items-center justify-between gap-2 text-nq-aux text-nq-muted">
              Botão <CheckBadge check={f('cta_label')} />
            </span>
            <input className={input} value={d.cta_label} disabled={!editable} onChange={e => set('cta_label', e.target.value)} />
          </label>
        ) : null}
        {editable && (
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              disabled={!!busy}
              onClick={() =>
                run(`regen-${s.order}`, () => post(`/generated-pages/${page.id}/sections/${s.order}/regenerate`), `Seção ${s.order} gerada de novo.`)
              }
              className={`${pill} bg-nq-raised text-nq-text inline-flex items-center gap-1.5`}
            >
              <Wand2 className="h-4 w-4" /> {busy === `regen-${s.order}` ? 'Gerando...' : 'Gerar de novo'}
            </button>
            <button
              type="button"
              disabled={!!busy || !changed}
              data-testid={`save-section-${s.order}`}
              onClick={() =>
                run(
                  `save-${s.order}`,
                  () => patch(`/generated-pages/${page.id}/sections/${s.order}`, { ...d, bullets: d.bullets.split('\n') }),
                  `Seção ${s.order} salva.`
                )
              }
              className={`${pill} bg-nq-positive text-nq-on-positive`}
            >
              Salvar
            </button>
          </div>
        )}
      </Surface>
    );
  };

  return (
    <div className="space-y-6" data-testid="generation-view">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hideBack ? (
          <span />
        ) : (
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-nq-aux text-nq-muted hover:text-nq-text min-h-[44px]">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        )}
        <button type="button" onClick={load} aria-label="Atualizar" className="h-11 w-11 flex items-center justify-center rounded-full text-nq-muted hover:text-nq-text">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1">
        <h2 className="text-nq-section font-semibold text-nq-text break-words">
          {page.human_id} · {page.product_name || 'Produto'}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-nq-aux text-nq-muted">
          <StatusPill tone={st.tone} testId="generation-status">
            {st.label}
          </StatusPill>
          <span>Oferta {page.offer_human_id || '—'}</span>
          {reference && <span>Referência {reference.human_id}</span>}
        </div>
        <p className="text-nq-caption text-nq-subtle">Texto 100% nosso. Da referência só veio a ordem e a função de cada parte.</p>
        <button
          type="button"
          onClick={copyAll}
          data-testid="copy-norqva"
          className={`${pill} bg-nq-raised text-nq-text inline-flex items-center gap-1.5 mt-2`}
        >
          <Copy className="h-4 w-4" /> Copiar a versão NORQVA
        </button>
      </div>

      {(images?.message || notes.length > 0 || blocked > 0) && (
        <Surface className="p-4 space-y-1">
          {images?.message && (
            <p className="text-nq-aux text-nq-attention" data-testid="images-note">
              {images.message}
            </p>
          )}
          {blocked > 0 && (
            <p className="text-nq-aux text-nq-critical-text" data-testid="blocked-note">
              {blocked} {blocked === 1 ? 'campo bloqueado' : 'campos bloqueados'} pela checagem. Edite ou gere de novo antes de aprovar.
            </p>
          )}
          {notes.map((n, i) => (
            <p key={i} className="text-nq-aux text-nq-muted">
              {n}
            </p>
          ))}
        </Surface>
      )}

      {isAdmin && !hideStatusActions && (
        <div className="flex flex-wrap gap-2">
          {page.status === 'DRAFT' && (
            <button
              type="button"
              disabled={!!busy || pending}
              onClick={() => run('approve', () => post(`/generated-pages/${page.id}/approve`), 'Página aprovada.')}
              className={`${pill} bg-nq-positive text-nq-on-positive`}
            >
              Aprovar página
            </button>
          )}
          {(page.status === 'APPROVED' || page.status === 'UNPUBLISHED') && (
            <button
              type="button"
              disabled={!!busy || pending}
              onClick={() => run('publish', () => post(`/generated-pages/${page.id}/publish`), 'Página publicada.')}
              className={`${pill} bg-nq-positive text-nq-on-positive`}
            >
              Publicar
            </button>
          )}
          {page.status === 'PUBLISHED' && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run('unpublish', () => post(`/generated-pages/${page.id}/unpublish`), 'Página tirada do ar.')}
              className={`${pill} bg-nq-raised text-nq-text`}
            >
              Tirar do ar
            </button>
          )}
        </div>
      )}
      {page.status === 'PUBLISHED' && (
        <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-nq-aux text-nq-info break-all" data-testid="public-link">
          <ExternalLink className="h-4 w-4 shrink-0" /> {publicUrl}
        </a>
      )}
      {page.status === 'PUBLISHED' && canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-nq-caption text-nq-subtle">No ar a página não pode ser mudada. Tire do ar para editar.</p>
          {/* NORQVA-0131: na Fábrica os botões de situação ficam escondidos; sem este botão não havia como editar */}
          {isAdmin && hideStatusActions && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => {
                if (
                  !window.confirm(
                    'A página sai do ar agora. Se uma campanha estiver levando pessoas para ela, elas verão "página fora do ar" até você aprovar e publicar de novo no passo 5. Continuar?'
                  )
                )
                  return;
                run('unpublish', () => post(`/generated-pages/${page.id}/unpublish`), 'Página tirada do ar. Edite; depois, no passo 5, aprove e publique de novo.');
              }}
              className={`${pill} bg-nq-raised text-nq-text`}
              data-testid="factory-unpublish"
            >
              {busy === 'unpublish' ? 'Tirando do ar...' : 'Tirar do ar para editar'}
            </button>
          )}
          {!isAdmin && hideStatusActions && <p className="text-nq-caption text-nq-subtle">Peça ao administrador para tirar do ar.</p>}
        </div>
      )}

      <Section title="Página de venda">
        {!isMobile && (
          <div className="grid grid-cols-2 gap-4 px-1 text-nq-caption text-nq-subtle">
            <span>Esqueleto da referência</span>
            <span>Nossa página</span>
          </div>
        )}
        <ol className="space-y-4" data-testid="generation-sections">
          {(page.sections || []).map((s: any) => (
            <li key={s.order} data-testid="generation-section" className={isMobile ? 'space-y-2' : 'grid grid-cols-2 gap-4 items-start'}>
              {refCard(s)}
              {ourCard(s)}
            </li>
          ))}
        </ol>
      </Section>

      <Section title={`Anúncios (${(ads || []).length})`}>
        <p className="px-1 text-nq-caption text-nq-subtle">Os anúncios ficam na fábrica de criativos e seguem a mesma aprovação. Sem preço no anúncio.</p>
        <ul className="space-y-4" data-testid="generation-ads">
          {(ads || []).map((a: any) => {
            const d = adDrafts[a.id] || adDraft(a);
            const set = (k: keyof AdDraft, v: string) => setAdDrafts(cur => ({ ...cur, [a.id]: { ...d, [k]: v } }));
            const changed = JSON.stringify(d) !== JSON.stringify(adDraft(a));
            const ac = a.copy_check?.fields || {};
            const ast = AD_STATUS[a.approval_status] || AD_STATUS.DRAFT;
            const field = (k: keyof AdDraft, label: string, multiline = false, checkKey: string = k) => (
              <label className="block space-y-1">
                <span className="flex flex-wrap items-center justify-between gap-2 text-nq-aux text-nq-muted">
                  {label} <CheckBadge check={ac[checkKey]} testId={`ad-check-${a.human_id}-${checkKey}`} />
                </span>
                {multiline ? (
                  <textarea className={input} rows={4} value={d[k]} disabled={!canEdit} onChange={e => set(k, e.target.value)} />
                ) : (
                  <input className={input} value={d[k]} disabled={!canEdit} onChange={e => set(k, e.target.value)} />
                )}
              </label>
            );
            return (
              <li key={a.id} data-testid="generation-ad">
                <Surface className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-nq-body font-semibold text-nq-text">{a.human_id}</span>
                    <StatusPill tone={ast.tone}>{ast.label}</StatusPill>
                  </div>
                  {a.copy_check?.blocked && (
                    <p className="text-nq-aux text-nq-critical-text">Bloqueado pela checagem: edite ou gere de novo antes de aprovar.</p>
                  )}
                  {a.copy_check?.stale && (
                    <p className="text-nq-aux text-nq-attention" data-testid="ad-check-stale">
                      O texto mudou fora desta tela: a checagem roda de novo na hora de aprovar.
                    </p>
                  )}
                  {field('hook', 'Gancho')}
                  {field('primary_text', 'Texto principal', true)}
                  {field('headline', 'Título')}
                  {field('description', 'Descrição')}
                  {field('cta', 'Chamada do botão')}
                  {field('script', 'Roteiro (um trecho por linha)', true)}
                  <p className="text-nq-caption text-nq-muted">
                    Promessas (ligadas quando o texto aprovado aparece inteiro no anúncio):{' '}
                    {(a.claims || []).length ? a.claims.map((c: any) => c.text).join('; ') : 'nenhuma ligada (cadastre uma na fábrica para poder aprovar)'}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => copyAd(a)}
                      data-testid={`copy-ad-${a.human_id}`}
                      className={`${pill} bg-nq-raised text-nq-text inline-flex items-center gap-1.5`}
                    >
                      <Copy className="h-4 w-4" /> Copiar
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => run(`regen-ad-${a.id}`, () => post(`/generated-pages/${page.id}/ads/${a.id}/regenerate`), `Anúncio ${a.human_id} gerado de novo.`)}
                        className={`${pill} bg-nq-raised text-nq-text inline-flex items-center gap-1.5`}
                      >
                        <Wand2 className="h-4 w-4" /> Gerar de novo
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        disabled={!!busy || !changed}
                        onClick={() => run(`save-ad-${a.id}`, () => patch(`/generated-pages/${page.id}/ads/${a.id}`, d), `Anúncio ${a.human_id} salvo.`)}
                        className={`${pill} bg-nq-positive text-nq-on-positive`}
                      >
                        Salvar
                      </button>
                    )}
                    {isAdmin && a.approval_status !== 'APPROVED' && (
                      <button
                        type="button"
                        disabled={!!busy || changed}
                        data-testid={`approve-ad-${a.human_id}`}
                        onClick={() =>
                          run(`approve-ad-${a.id}`, () => post(`/creative-factory/creatives/${a.id}/review?mode=real`, { decision: 'APPROVED' }), `Anúncio ${a.human_id} aprovado.`)
                        }
                        className={`${pill} bg-nq-positive text-nq-on-positive`}
                      >
                        Aprovar
                      </button>
                    )}
                    {isAdmin && a.approval_status !== 'REJECTED' && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => setRejecting(rejecting?.id === a.id ? null : { id: a.id, reason: 'WEAK_HOOK' })}
                        className={`${pill} bg-nq-raised text-nq-text`}
                      >
                        Rejeitar
                      </button>
                    )}
                  </div>
                  {rejecting && rejecting.id === a.id && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="block flex-1 min-w-[200px] space-y-1">
                        <span className="text-nq-aux text-nq-muted">Motivo</span>
                        <select className={input} value={rejecting.reason} onChange={e => setRejecting({ id: a.id, reason: e.target.value })}>
                          {REJECT_REASONS.map(([k, l]) => (
                            <option key={k} value={k}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => {
                          const reason = rejecting.reason;
                          return run(
                            `reject-ad-${a.id}`,
                            async () => {
                              const out = await post(`/creative-factory/creatives/${a.id}/review?mode=real`, { decision: 'REJECTED', reason_code: reason });
                              setRejecting(null);
                              return out;
                            },
                            `Anúncio ${a.human_id} rejeitado.`
                          );
                        }}
                        className={`${pill} bg-nq-critical text-white`}
                      >
                        Confirmar rejeição
                      </button>
                    </div>
                  )}
                </Surface>
              </li>
            );
          })}
        </ul>
      </Section>

      {isAdmin && !hideCampaign && (
        <GeneratedCampaignPanel apiFetch={apiFetch} pageId={page.id} pageStatus={page.status} ads={ads || []} showError={showError} showSuccess={showSuccess} />
      )}
    </div>
  );
};
