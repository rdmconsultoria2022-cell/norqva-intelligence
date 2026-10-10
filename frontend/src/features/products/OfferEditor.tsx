import React, { useState } from 'react';

// NORQVA-0035: editar nome, preço, preço promocional, descrição e bônus da oferta (ADMIN e PRODUCT).
// O preço vale só para os próximos pedidos; o preço do adicional no Pix é o configurado em "Adicional no Pix".

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;
const toForm = (v: any) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
/**
 * Lê o preço como o operador digita. Aceita "14,90", "14.90", "14,9", "1.234,56", "1234".
 * Recusa o ambíguo ("1.234", sem vírgula) e mais de 2 casas: devolve NaN.
 */
export function parsePrice(v: string): number {
  const s = String(v ?? '').trim();
  if (/^\d+(,\d{1,2})?$/.test(s)) return Number(s.replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+\.\d{1,2}$/.test(s)) return Number(s);
  return NaN;
}
const toNum = parsePrice;
const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export const OfferEditor: React.FC<{
  off: any;
  apiFetch: ApiFetch;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onSaved?: () => void;
  onClose: () => void;
}> = ({ off, apiFetch, showError, showSuccess, onSaved, onClose }) => {
  const [form, setForm] = useState({
    name: off.name || '',
    price: toForm(off.price),
    promotional_price: toForm(off.promotional_price),
    description: off.description || '',
    bonus: off.bonus || '',
    // NORQVA-0038: cartão de crédito
    card_enabled: !!off.card_enabled,
    card_max_installments: String(off.card_max_installments || 1),
    card_total_price: toForm(off.card_total_price)
  });
  const [busy, setBusy] = useState(false);

  const price = toNum(form.price);
  const promo = form.promotional_price.trim() === '' ? null : toNum(form.promotional_price);
  const pixPrice = promo ?? price;
  const installments = Number(form.card_max_installments);
  const cardTotal = form.card_total_price.trim() === '' ? null : toNum(form.card_total_price);
  const effectiveCard = cardTotal ?? pixPrice;
  const cardProblem = !form.card_enabled ? null
    : !Number.isInteger(installments) || installments < 1 || installments > 12 ? 'Parcelas no cartão: de 1 a 12.'
    : cardTotal !== null && !(cardTotal > 0) ? 'Total no cartão inválido (ou deixe em branco para usar o preço do Pix).'
    : effectiveCard < pixPrice ? 'O total no cartão não pode ser menor que o preço no Pix.'
    : effectiveCard > pixPrice * 1.3 ? 'O total no cartão está mais de 30% acima do Pix.'
    : installments > 1 && effectiveCard / installments < 5 ? 'Cada parcela precisa ser de pelo menos R$ 5,00 (regra do Asaas). Use menos parcelas.'
    : installments > 1 && Math.round(effectiveCard * 100) % installments !== 0
      ? `O total precisa dividir em parcelas iguais. Sugestão: ${brl((Math.ceil(Math.round(effectiveCard * 100) / installments) * installments) / 100)}.`
    : null;
  const problem =
    form.name.trim() === '' ? 'Dê um nome à oferta.'
    : !(price > 0) ? 'Preço inválido. Use, por exemplo, 14,90.'
    : price > 1000000 ? 'Preço alto demais.'
    : promo !== null && !(promo > 0) ? 'Preço promocional inválido (ou deixe em branco).'
    : promo !== null && promo >= price ? 'O preço promocional precisa ser menor que o preço.'
    : form.description.trim() === '' ? 'A descrição não pode ficar vazia.'
    : cardProblem;
  const priceChanged = Math.abs(price - Number(off.price)) > 0.001 || (promo ?? 0) !== Number(off.promotional_price || 0);
  const live = off.status === 'ATIVA' || off.status === 'TESTE';

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/offers/${off.id}?mode=${off.is_demo ? 'demo' : 'real'}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          price,
          promotional_price: promo,
          description: form.description.trim(),
          bonus: form.bonus.trim() || null,
          // NORQVA-0038: campos do cartão só quando o cartão está ou estava ligado
          ...(form.card_enabled || off.card_enabled
            ? { card_enabled: form.card_enabled, card_max_installments: installments, card_total_price: form.card_enabled ? cardTotal : (off.card_total_price ?? null) }
            : {})
        })
      });
      showSuccess('Oferta atualizada.');
      onSaved?.();
      onClose();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível salvar a oferta.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100';
  return (
    <div className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2 text-xs" data-testid="offer-editor">
      <div className="font-semibold text-slate-200">Editar oferta {off.human_id}</div>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] text-slate-400">Nome (aparece para o cliente)</span>
        <input aria-label="Nome da oferta" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400">Preço (R$)</span>
          <input aria-label="Preço da oferta" inputMode="decimal" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className={`${input} font-mono`} />
          <span className="text-[10px] text-slate-400" data-testid="offer-price-read">{price > 0 ? `= ${brl(price)}` : ''}</span>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400">Promocional (R$, opcional)</span>
          <input aria-label="Preço promocional" inputMode="decimal" value={form.promotional_price} onChange={e => setForm({ ...form, promotional_price: e.target.value })} className={`${input} font-mono`} />
        </label>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] text-slate-400">Descrição</span>
        <textarea aria-label="Descrição da oferta" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={input} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] text-slate-400">Bônus (opcional)</span>
        <input aria-label="Bônus da oferta" value={form.bonus} onChange={e => setForm({ ...form, bonus: e.target.value })} className={input} />
      </label>
      <div className="space-y-1 rounded border border-slate-800 p-2" data-testid="offer-card">
        <label className="flex items-center gap-2">
          <input type="checkbox" aria-label="Aceita cartão de crédito" checked={form.card_enabled} onChange={e => setForm({ ...form, card_enabled: e.target.checked })} />
          <span className="text-slate-200">Aceita cartão de crédito (pagamento na página segura do Asaas)</span>
        </label>
        {form.card_enabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400">Parcelas sem juros (1 a 12)</span>
                <input aria-label="Parcelas no cartão" inputMode="numeric" value={form.card_max_installments} onChange={e => setForm({ ...form, card_max_installments: e.target.value })} className={`${input} font-mono`} />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400">Total no cartão (R$, vazio = preço do Pix)</span>
                <input aria-label="Total no cartão" inputMode="decimal" value={form.card_total_price} onChange={e => setForm({ ...form, card_total_price: e.target.value })} className={`${input} font-mono`} />
              </label>
            </div>
            {!cardProblem && pixPrice > 0 && (
              <p className="text-[11px] text-slate-400" data-testid="offer-card-read">
                O comprador vê: {installments}x de {brl(effectiveCard / installments)} sem juros (total {brl(effectiveCard)}) ou {brl(pixPrice)} no Pix. A taxa do cartão no Asaas é maior que a do Pix.
              </p>
            )}
          </>
        )}
      </div>
      {priceChanged && live && !problem && (
        <p className="text-[11px] text-amber-300" data-testid="offer-price-warning">
          A oferta está {off.status}: o preço novo ({brl(promo ?? price)} cobrado) vale para os próximos pedidos. Pedidos já feitos não mudam. O preço do adicional no Pix continua o configurado em "Adicional no Pix".
        </p>
      )}
      {problem && <p className="text-[11px] text-red-300">{problem}</p>}
      <div className="flex gap-2">
        <button disabled={busy || !!problem} onClick={save} data-testid="offer-editor-save" className="flex-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] font-mono text-emerald-300 disabled:opacity-40">
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button disabled={busy} onClick={onClose} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
          Cancelar
        </button>
      </div>
    </div>
  );
};
