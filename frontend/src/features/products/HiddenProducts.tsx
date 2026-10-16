import React, { useCallback, useEffect, useState } from 'react';
import { EyeOff } from 'lucide-react';

// NORQVA-0034: produtos da conta real criados pela tela antes da correção ficaram com procedência "desconhecida"
// e não aparecem na lista. O ADMIN traz cada um, de propósito (produto + ofertas dele).

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

export const HiddenProducts: React.FC<{
  apiFetch: ApiFetch;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onChanged?: () => void;
}> = ({ apiFetch, showError, showSuccess, onChanged }) => {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/products/hidden');
      setItems(r?.products || []);
      setTotal(Number(r?.total) || (r?.products || []).length);
    } catch {
      setItems([]);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (items.length === 0) return null;

  const bring = async (p: any) => {
    setBusy(p.id);
    try {
      const r = await apiFetch(`/products/${p.id}/bring-to-list`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      showSuccess(`${p.name} agora aparece na lista${r?.offers?.length ? ` (com ${r.offers.join(', ')})` : ''}.`);
      await load();
      onChanged?.();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível trazer o produto para a lista.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 rounded border border-nq-attention/40 bg-nq-attention/10 p-3 text-xs" data-testid="hidden-products">
      <div className="inline-flex items-center gap-1.5 font-semibold text-nq-attention">
        <EyeOff className="h-3.5 w-3.5" /> Fora da lista ({total}){total > items.length ? ` · mostrando os ${items.length} mais recentes` : ''}
      </div>
      <p className="text-[12px] text-nq-muted">
        Produtos da conta real sem a marca de produção comercial: não aparecem na lista nem podem ser vendidos como adicional. Traga para a lista os que são de verdade; o que for teste pode ficar aqui.
      </p>
      {items.map(p => (
        <div key={p.id} className="flex items-center justify-between gap-2 rounded bg-nq-bg p-2" data-testid="hidden-product">
          <span className="text-nq-text">
            <span className="text-nq-positive-text">{p.human_id}</span> · {p.name}
            <span className="text-nq-subtle"> · {p.offers_count} oferta(s) · criado em {new Date(p.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </span>
          <button
            disabled={busy === p.id}
            onClick={() => bring(p)}
            data-testid="bring-to-list"
            className="shrink-0 rounded-full border border-nq-positive/40 bg-nq-positive/10 px-2 py-1 text-[12px] text-nq-positive-text disabled:opacity-40 min-h-[44px]"
          >
            {busy === p.id ? 'Trazendo…' : 'Trazer para a lista'}
          </button>
        </div>
      ))}
    </div>
  );
};
