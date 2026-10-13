import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';

// NORQVA-0057 (contrato aprovado em 13/10/2026 17h11): excluir vai para a lixeira; restaurar devolve pausado.
// Sempre com o código do item digitado. Quem já comprou continua baixando normalmente.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

/** Botão com confirmação pelo código do item (OFF-... ou PRD-...). */
export const TrashAction: React.FC<{
  kind: 'offer' | 'product' | 'creative';
  action: 'delete' | 'restore';
  item: { id: string; human_id: string; name?: string };
  apiFetch: ApiFetch;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onDone?: () => void;
}> = ({ kind, action, item, apiFetch, showError, showSuccess, onDone }) => {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const label = action === 'delete' ? (kind === 'offer' ? 'Excluir oferta' : kind === 'creative' ? 'Excluir criativo' : 'Excluir produto') : 'Restaurar';
  const tid = `${action}-${kind}-${item.human_id}`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={tid}
        className={`w-full py-1 px-2 rounded text-[11px] font-mono transition flex items-center justify-center gap-1.5 ${
          action === 'delete'
            ? 'border border-red-900/60 text-red-300 hover:bg-red-950/30'
            : 'border border-emerald-800/60 text-emerald-300 hover:bg-emerald-950/30'
        }`}
      >
        {action === 'delete' ? <Trash2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />} {label}
      </button>
    );
  }

  const ok = code.trim().toUpperCase() === item.human_id.toUpperCase();
  const go = async () => {
    setBusy(true);
    try {
      const base = kind === 'offer' ? 'offers' : kind === 'creative' ? 'creative-factory/creatives' : 'products';
      await apiFetch(`/${base}/${item.id}/${action}?mode=real`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_code: code.trim() })
      });
      showSuccess(
        action === 'delete'
          ? `${item.human_id} foi para a lixeira. Dá para restaurar quando quiser.`
          : `${item.human_id} restaurado(a) pausado(a). Reative quando quiser.`
      );
      setOpen(false);
      setCode('');
      onDone?.();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-label={label} className="rounded border border-amber-700/50 bg-amber-950/20 p-2 space-y-2 text-xs text-amber-100" data-testid={`${tid}-confirm`}>
      <p>
        {action === 'delete'
          ? kind === 'creative'
            ? `${item.human_id} e as versões dele vão para a lixeira. Nada muda na Meta.`
            : `${item.human_id} sai da tela e das vendas e vai para a lixeira. Quem já comprou continua baixando.`
          : `${item.human_id} volta pausado(a), sem vender sozinho.`}{' '}
        Digite <strong className="font-mono">{item.human_id}</strong> para confirmar.
      </p>
      <input
        aria-label={`Código para ${label.toLowerCase()} ${item.human_id}`}
        value={code}
        onChange={e => setCode(e.target.value)}
        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-100"
      />
      <div className="flex gap-2">
        <button type="button" onClick={go} disabled={!ok || busy} className="px-3 py-1 rounded bg-amber-600 text-white font-bold disabled:opacity-40" data-testid={`${tid}-go`}>
          {busy ? 'Aguarde…' : label}
        </button>
        <button type="button" onClick={() => { setOpen(false); setCode(''); }} className="px-3 py-1 rounded border border-slate-700 text-slate-300">
          Cancelar
        </button>
      </div>
    </div>
  );
};

/** Lixeira no topo da tela Produtos (só ADMIN). */
export const CatalogTrash: React.FC<{
  apiFetch: ApiFetch;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onChanged?: () => void;
  reloadKey?: number;
}> = ({ apiFetch, showError, showSuccess, onChanged, reloadKey = 0 }) => {
  const [data, setData] = useState<{ products: any[]; offers: any[] }>({ products: [], offers: [] });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/catalog/trash');
      setData({ products: r?.products || [], offers: r?.offers || [] });
    } catch {
      setData({ products: [], offers: [] });
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const total = data.products.length + data.offers.length;
  if (total === 0) return null;
  const done = () => {
    load();
    onChanged?.();
  };
  const when = (d: string) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

  return (
    <section className="rounded border border-slate-800 bg-slate-900/30 p-3 text-xs" data-testid="catalog-trash">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 font-semibold text-slate-300" data-testid="toggle-trash">
        <Trash2 className="h-4 w-4 text-slate-400" /> Lixeira ({total})
      </button>
      {open && (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {data.products.map(p => (
            <div key={p.id} className="rounded border border-slate-800 p-2 space-y-1.5" data-testid="trash-product">
              <div className="font-mono text-emerald-400 font-bold">{p.human_id} · produto</div>
              <div className="text-slate-200">{p.name}</div>
              <div className="text-[10px] text-slate-500">Excluído em {when(p.deleted_at)}{p.deleted_by_name ? ` por ${p.deleted_by_name}` : ''}</div>
              <TrashAction kind="product" action="restore" item={p} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onDone={done} />
            </div>
          ))}
          {data.offers.map(o => (
            <div key={o.id} className="rounded border border-slate-800 p-2 space-y-1.5" data-testid="trash-offer">
              <div className="font-mono text-emerald-400 font-bold">{o.human_id} · oferta</div>
              <div className="text-slate-200">{o.name}</div>
              <div className="text-[10px] text-slate-500">
                {o.product_name} · excluída em {when(o.deleted_at)}{o.deleted_by_name ? ` por ${o.deleted_by_name}` : ''}
              </div>
              {o.product_deleted ? (
                <div className="text-[10px] text-amber-300">Restaure antes o produto.</div>
              ) : (
                <TrashAction kind="offer" action="restore" item={o} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onDone={done} />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
