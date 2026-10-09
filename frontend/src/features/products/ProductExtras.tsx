import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Plus, CheckCircle2, XCircle, Gift } from 'lucide-react';

// NORQVA-0032: adicional na hora do Pix (por oferta, ADMIN) e promessas verificadas (por produto).

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;
const modeOf = (isDemo: any) => (isDemo ? 'demo' : 'real');
const money = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

// ---------------------------------------------------------------------------------------------
// Adicional na hora do Pix
// ---------------------------------------------------------------------------------------------

export const OfferBumpConfig: React.FC<{
  off: any;
  offers: any[];
  apiFetch: ApiFetch;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
}> = ({ off, offers, apiFetch, showError, showSuccess }) => {
  const mode = modeOf(off.is_demo);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<any>(null);
  const [form, setForm] = useState({ bump_offer_id: '', bump_price: '14,90', headline: '', is_active: false });
  const [busy, setBusy] = useState(false);

  const apply = (r: any) => {
    setState(r);
    if (r?.bump) {
      setForm({
        bump_offer_id: r.bump.bump_offer_id,
        bump_price: String(r.bump.bump_price).replace('.', ','),
        headline: r.bump.headline || '',
        is_active: !!r.bump.is_active
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/offers/${off.id}/bump?mode=${mode}`)
      .then((r: any) => {
        if (cancelled) return;
        apply(r);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [off.id, mode, apiFetch]);

  const candidates = offers.filter(o => String(o.id) !== String(off.id) && Boolean(o.is_demo) === Boolean(off.is_demo));

  const save = async (activate: boolean) => {
    setBusy(true);
    try {
      const r = await apiFetch(`/offers/${off.id}/bump?mode=${mode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bump_offer_id: form.bump_offer_id,
          bump_price: Number(String(form.bump_price).replace(',', '.')),
          headline: form.headline.trim() || null,
          is_active: activate
        })
      });
      apply(r);
      showSuccess(activate ? 'Adicional ligado: já aparece no checkout desta oferta.' : 'Adicional salvo desligado.');
    } catch (e: any) {
      showError(e?.message || 'Não foi possível salvar o adicional.');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p className="text-[11px] text-slate-500">Carregando adicional…</p>;
  if (failed) return <p className="text-[11px] text-red-300" data-testid="bump-error">Não foi possível ler o adicional agora. Nada foi alterado; tente de novo.</p>;

  const priceNum = Number(String(form.bump_price).replace(',', '.'));
  const valid = !!form.bump_offer_id && Number.isFinite(priceNum) && priceNum >= 1;

  return (
    <div className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2 text-xs" data-testid="offer-bump-config">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
          <Gift className="h-3.5 w-3.5 text-emerald-400" /> Adicional no Pix
        </span>
        <span className={state?.sellable ? 'text-emerald-300' : 'text-slate-500'} data-testid="bump-status">
          {state?.sellable ? 'ligado no checkout' : state?.bump?.is_active ? 'ligado, mas indisponível' : 'desligado'}
        </span>
      </div>
      {state?.blocker && <p className="text-amber-300 text-[11px]">{state.blocker}</p>}
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] text-slate-400">Oferta do adicional (precisa ter arquivo próprio)</span>
        <select
          aria-label="Oferta do adicional"
          value={form.bump_offer_id}
          onChange={e => setForm({ ...form, bump_offer_id: e.target.value })}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          <option value="">Escolha…</option>
          {candidates.map(o => (
            <option key={o.id} value={o.id}>
              {o.human_id} · {o.name} ({o.status})
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400">Preço no checkout (R$)</span>
          <input aria-label="Preço do adicional" inputMode="decimal" value={form.bump_price} onChange={e => setForm({ ...form, bump_price: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-100" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400">Frase para o comprador</span>
          <input aria-label="Frase do adicional" maxLength={200} value={form.headline} onChange={e => setForm({ ...form, headline: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
        </label>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => save(false)} disabled={busy || !valid} className="rounded border border-slate-700 px-2.5 py-1 text-slate-200 disabled:opacity-40" data-testid="bump-save-off">
          {state?.bump?.is_active ? 'Desligar' : 'Salvar desligado'}
        </button>
        <button onClick={() => save(true)} disabled={busy || !valid} className="rounded bg-emerald-600 px-2.5 py-1 font-semibold text-white disabled:opacity-40" data-testid="bump-save-on">
          Salvar e ligar
        </button>
      </div>
      {valid && <p className="text-[10px] text-slate-500">No checkout: “Sim, quero levar também … + {money(priceNum)} no mesmo Pix”, caixinha desmarcada.</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Promessas verificadas por produto
// ---------------------------------------------------------------------------------------------

const STATUS: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: 'verificada', cls: 'text-emerald-300 border-emerald-600/40' },
  UNVERIFIED: { label: 'a verificar', cls: 'text-amber-300 border-amber-600/40' },
  EXPIRED: { label: 'vencida', cls: 'text-slate-400 border-slate-600' },
  REJECTED: { label: 'recusada', cls: 'text-rose-300 border-rose-600/40' }
};

/** Sugestões a partir da oferta ativa do produto (o ADMIN só confirma as que forem verdade). */
export function suggestedClaims(product: any, offers: any[]): { claim_text: string; claim_type: string }[] {
  const offer = offers.find(o => String(o.product_id) === String(product.id) && ['ATIVA', 'TESTE'].includes(o.status)) || null;
  const out: { claim_text: string; claim_type: string }[] = [];
  if (offer) {
    const promo = offer.promotional_price !== null && offer.promotional_price !== undefined && String(offer.promotional_price).trim() !== '' && parseFloat(offer.promotional_price) > 0;
    const price = promo ? parseFloat(offer.promotional_price) : parseFloat(offer.price);
    if (Number.isFinite(price)) out.push({ claim_text: `${product.name} por ${money(price)}`, claim_type: 'PRICE' });
  }
  out.push({ claim_text: 'Pagamento por Pix', claim_type: 'OFFER_TERM' });
  out.push({ claim_text: 'Acesso ao conteúdo logo após a confirmação do pagamento', claim_type: 'OFFER_TERM' });
  if (/trattoria/i.test(String(product.name || ''))) out.push({ claim_text: 'Receitas de trattoria italiana para fazer em casa', claim_type: 'FEATURE' });
  return out;
}

export const ProductClaims: React.FC<{
  product: any;
  offers: any[];
  currentUser: any;
  apiFetch: ApiFetch;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
}> = ({ product, offers, currentUser, apiFetch, showError, showSuccess }) => {
  const role = String(currentUser?.role || '');
  const isAdmin = role === 'ADMIN';
  const canAdd = isAdmin || role === 'PRODUCT';
  const mode = modeOf(product.is_demo);
  const [claims, setClaims] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/products/${product.id}/claims?mode=${mode}`);
      setClaims(Array.isArray(r?.claims) ? r.claims : []);
    } catch (e: any) {
      setClaims([]);
      showError(e?.message || 'Falha ao carregar as promessas.');
    }
  }, [apiFetch, product.id, mode]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (items: { claim_text: string; claim_type: string }[]) => {
    setBusy(true);
    let ok = 0;
    for (const it of items) {
      try {
        await apiFetch(`/products/${product.id}/claims?mode=${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it) });
        ok++;
      } catch (e: any) {
        showError(e?.message || 'Não foi possível cadastrar a promessa.');
      }
    }
    if (ok) showSuccess(`${ok} promessa(s) cadastrada(s) como “a verificar”.`);
    setText('');
    setBusy(false);
    await load();
  };

  const setStatus = async (c: any, status: 'VERIFIED' | 'REJECTED') => {
    setBusy(true);
    try {
      await apiFetch(`/creative-factory/claims/${c.id}?mode=${mode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: status === 'REJECTED' ? 'Recusada na tela Produtos' : 'Verificada na tela Produtos' })
      });
      showSuccess(status === 'VERIFIED' ? 'Promessa verificada: os criativos já podem usá-la.' : 'Promessa recusada.');
      await load();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível atualizar a promessa.');
    } finally {
      setBusy(false);
    }
  };

  if (claims === null) return <p className="text-[11px] text-slate-500 px-4 pb-3">Carregando promessas…</p>;
  const existing = new Set(claims.filter(c => ['VERIFIED', 'UNVERIFIED'].includes(c.status)).map(c => String(c.claim_text).toLowerCase()));
  const missing = suggestedClaims(product, offers).filter(s => !existing.has(s.claim_text.toLowerCase()));

  return (
    <div className="space-y-2 px-4 pb-4 text-xs" data-testid="product-claims">
      <p className="text-[11px] text-slate-500">
        O que pode ser dito sobre este produto nos anúncios. Só as verificadas valem para os criativos e para o Time de IAs.
      </p>
      {claims.length === 0 && <p className="text-slate-500">Nenhuma promessa cadastrada.</p>}
      {claims.map(c => {
        const st = c.is_expired ? STATUS.EXPIRED : STATUS[c.status] || STATUS.UNVERIFIED;
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 p-2" data-testid="product-claim">
            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
            <span className="flex-1 text-slate-200">{c.claim_text}</span>
            {c.valid_until && <span className="text-[10px] text-slate-500">até {new Date(c.valid_until).toLocaleDateString('pt-BR')}</span>}
            {isAdmin && c.status === 'UNVERIFIED' && (
              <>
                <button onClick={() => setStatus(c, 'VERIFIED')} disabled={busy} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 font-semibold text-white disabled:opacity-40" data-testid="verify-claim">
                  <CheckCircle2 className="h-3 w-3" /> É verdade
                </button>
                <button onClick={() => setStatus(c, 'REJECTED')} disabled={busy} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-slate-300 disabled:opacity-40">
                  <XCircle className="h-3 w-3" /> Não é
                </button>
              </>
            )}
          </div>
        );
      })}
      {canAdd && missing.length > 0 && (
        <div className="rounded border border-dashed border-sky-700/50 p-2 space-y-1" data-testid="claim-suggestions">
          <div className="text-[11px] text-sky-200">Sugestões a partir da oferta (entram como “a verificar”):</div>
          <ul className="list-disc pl-5 text-slate-300">
            {missing.map(m => (
              <li key={m.claim_text}>{m.claim_text}</li>
            ))}
          </ul>
          <button onClick={() => add(missing)} disabled={busy} className="inline-flex items-center gap-1 rounded bg-sky-700 px-2.5 py-1 font-semibold text-white disabled:opacity-40" data-testid="add-suggestions">
            <ShieldCheck className="h-3.5 w-3.5" /> Adicionar as {missing.length} sugestões
          </button>
        </div>
      )}
      {canAdd && (
        <div className="flex gap-2">
          <input
            aria-label="Nova promessa"
            value={text}
            maxLength={500}
            onChange={e => setText(e.target.value)}
            placeholder="Ex.: 28 receitas com fotos passo a passo"
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          />
          <button onClick={() => add([{ claim_text: text.trim(), claim_type: 'FEATURE' }])} disabled={busy || text.trim().length < 3} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2.5 py-1 text-slate-200 disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" /> Cadastrar
          </button>
        </div>
      )}
    </div>
  );
};
