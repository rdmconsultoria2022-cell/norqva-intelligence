import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { TrashAction } from '../products/CatalogTrash';

// NORQVA-0058: lixeira de criativos (regras da D-0057). Restaurar traz de volta todas as versões.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

export const CreativeTrash: React.FC<{
  apiFetch: ApiFetch;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onChanged?: () => void;
  reloadKey?: number;
}> = ({ apiFetch, showError, showSuccess, onChanged, reloadKey = 0 }) => {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/creative-factory/trash');
      setItems(Array.isArray(r?.creatives) ? r.creatives : []);
    } catch {
      setItems([]);
    }
  }, [apiFetch]);
  useEffect(() => {
    load();
  }, [load, reloadKey]);
  if (items.length === 0) return null;
  const when = (d: string) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  return (
    <section className="rounded-nq bg-nq-surface p-3 text-xs" data-testid="creative-trash">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 font-semibold text-nq-text min-h-[44px]" data-testid="toggle-creative-trash">
        <Trash2 className="h-4 w-4 text-nq-muted" /> Lixeira de criativos ({items.length})
      </button>
      {open && (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.map(c => (
            <div key={c.id} className="rounded border border-nq-line p-2 space-y-1.5" data-testid="trash-creative">
              <div className="text-nq-positive-text font-bold">{c.human_id}</div>
              <div className="text-nq-text line-clamp-2">“{c.hook}”</div>
              <div className="text-[12px] text-nq-subtle">
                {c.product_name ? `${c.product_name} · ` : ''}excluído em {when(c.deleted_at)}{c.deleted_by_name ? ` por ${c.deleted_by_name}` : ''}
              </div>
              <TrashAction
                kind="creative"
                action="restore"
                item={c}
                apiFetch={apiFetch}
                showError={showError}
                showSuccess={showSuccess}
                onDone={() => {
                  load();
                  onChanged?.();
                }}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
