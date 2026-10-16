import React, { useState } from 'react';

// NORQVA-0025: cadastro manual de criativo dentro da tela Criativos (antes ficava no Creative Lab).
// O arquivo é opcional: dá para criar a ideia e anexar o vídeo ou a imagem depois.

export interface NewCreativeFormProps {
  products: any[];
  offers: any[];
  busy: boolean;
  onSubmit: (form: NewCreativeInput) => void;
  onCancel: () => void;
}

export interface NewCreativeInput {
  product_id: string;
  offer_id: string;
  hook: string;
  concept: string;
  copy: string;
  cta: string;
  format: string;
  file_url: string;
}

const EMPTY: NewCreativeInput = { product_id: '', offer_id: '', hook: '', concept: '', copy: '', cta: '', format: 'VIDEO', file_url: '' };

const input = 'w-full bg-nq-bg border border-nq-line rounded p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text';
const label = 'block text-xs text-nq-muted mb-1';

export function NewCreativeForm({ products, offers, busy, onSubmit, onCancel }: NewCreativeFormProps) {
  const [form, setForm] = useState<NewCreativeInput>(EMPTY);
  const set = (k: keyof NewCreativeInput, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const fileOk = form.file_url.trim() === '' || /^https?:\/\/\S+$/i.test(form.file_url.trim());

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" data-testid="new-creative-form">
      <div className="bg-nq-surface rounded-nq max-w-md w-full p-6 text-sm max-h-[90vh] overflow-y-auto">
        <h3 className="text-md font-bold text-nq-positive-text mb-4">Novo criativo</h3>
        <form
          onSubmit={e => {
            e.preventDefault();
            if (!fileOk) return;
            onSubmit({ ...form, file_url: form.file_url.trim() });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="nc-product">Produto</label>
              <select id="nc-product" required value={form.product_id} onChange={e => setForm(prev => ({ ...prev, product_id: e.target.value, offer_id: '' }))} className={input}>
                <option value="">Selecione...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.human_id} - {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="nc-offer">Oferta (opcional)</label>
              <select id="nc-offer" value={form.offer_id} onChange={e => set('offer_id', e.target.value)} className={input}>
                <option value="">Selecione...</option>
                {offers.filter(o => o.product_id === form.product_id).map(o => (
                  <option key={o.id} value={o.id}>{o.human_id} - {o.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="nc-format">Formato</label>
              <select id="nc-format" value={form.format} onChange={e => set('format', e.target.value)} className={input}>
                <option value="VIDEO">VÍDEO</option>
                <option value="IMAGE">IMAGEM</option>
                <option value="CAROUSEL">CARROSSEL</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="nc-cta">CTA (botão)</label>
              <input id="nc-cta" type="text" required maxLength={100} placeholder="Ex: Saiba mais, Comprar" value={form.cta} onChange={e => set('cta', e.target.value)} className={input} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="nc-hook">Gancho (primeiros segundos)</label>
            <input id="nc-hook" type="text" required value={form.hook} onChange={e => set('hook', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="nc-concept">Conceito visual</label>
            <textarea id="nc-concept" required rows={2} value={form.concept} onChange={e => set('concept', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="nc-copy">Texto do anúncio</label>
            <textarea id="nc-copy" required rows={3} value={form.copy} onChange={e => set('copy', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="nc-file">Link do vídeo ou imagem (opcional)</label>
            <input id="nc-file" type="text" placeholder="https://... (pode anexar depois)" value={form.file_url} onChange={e => set('file_url', e.target.value)} className={input} />
            {!fileOk && <p className="text-[12px] text-nq-critical-text mt-1">O link precisa começar com http:// ou https://.</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 rounded-full bg-nq-raised text-nq-text hover:bg-nq-line font-semibold min-h-[44px]">
              Cancelar
            </button>
            <button type="submit" disabled={busy || !fileOk} className="px-4 py-2 rounded-full bg-nq-positive text-nq-on-positive font-bold hover:brightness-110 disabled:opacity-50 min-h-[44px]">
              Cadastrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const CLAIM_TYPE_LABEL: Record<string, string> = {
  FEATURE: 'O que o produto tem',
  PRICE: 'Preço',
  OFFER_TERM: 'Condição da oferta',
  RESULT: 'Resultado prometido',
  SOCIAL_PROOF: 'Prova social',
  TESTIMONIAL: 'Depoimento',
  SCARCITY: 'Escassez',
  AUTHORITY: 'Autoridade'
};
