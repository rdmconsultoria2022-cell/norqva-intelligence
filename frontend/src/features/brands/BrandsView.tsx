import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CircleDashed, AlertTriangle, RefreshCw, ShieldCheck, Plus, Radio, Store } from 'lucide-react';

// NORQVA-0018 (D-0009): marcas por nicho e checklist de ativos Meta.
// Fase A: cadastro e registro manual. Fase C: pixel pela API, conferência e roteamento de vendas.

export type AssetType = 'FACEBOOK_PAGE' | 'INSTAGRAM' | 'AD_ACCOUNT' | 'PIXEL' | 'WHATSAPP';
export interface BrandAsset {
  asset_type: AssetType;
  external_id: string | null;
  handle: string | null;
  status: 'PENDING_OPERATOR' | 'PENDING_API' | 'LINKED' | 'VERIFIED' | 'FAILED' | 'NOT_NEEDED';
  last_error?: string | null;
  routing_enabled?: boolean;
  verified_at?: string | null;
}
export interface Brand {
  id: string;
  code: string;
  name: string;
  status: string;
  niche_name?: string | null;
  spokesperson_type: string;
  products_count: number;
  assets: BrandAsset[];
  assets_done: number;
  assets_total: number;
}

const ASSET_LABEL: Record<AssetType, string> = {
  FACEBOOK_PAGE: 'Página do Facebook',
  INSTAGRAM: 'Instagram',
  PIXEL: 'Pixel / Dataset',
  WHATSAPP: 'WhatsApp',
  AD_ACCOUNT: 'Conta de anúncios'
};
const ASSET_ORDER: AssetType[] = ['FACEBOOK_PAGE', 'INSTAGRAM', 'PIXEL', 'WHATSAPP', 'AD_ACCOUNT'];
const HOW_TO: Partial<Record<AssetType, string>> = {
  FACEBOOK_PAGE: 'Crie a Página no portfólio (Configurações → Contas → Páginas → Adicionar) e registre o ID aqui.',
  INSTAGRAM: 'Crie a conta no app, mude para profissional e conecte à Página. Registre o ID do perfil (Configurações → Perfis do Instagram).',
  WHATSAPP: 'Escolha um número exclusivo da marca e confirme o código no WhatsApp Business. Registre o ID do número.',
  PIXEL: 'Criado pelo NORQVA na Meta com um clique (precisa de META_MUTATION_ENABLED=true).'
};
const STATUS_LABEL: Record<string, string> = {
  PENDING_OPERATOR: 'Falta você',
  PENDING_API: 'Falta criar',
  LINKED: 'Registrado',
  VERIFIED: 'Conferido na Meta',
  FAILED: 'Falhou',
  NOT_NEEDED: 'Não necessário'
};
const STATUS_CLS: Record<string, string> = {
  VERIFIED: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  LINKED: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
  FAILED: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
  NOT_NEEDED: 'text-slate-400 border-slate-700 bg-slate-800/40',
  PENDING_OPERATOR: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  PENDING_API: 'text-amber-300 border-amber-500/40 bg-amber-500/10'
};

type Pending =
  | { kind: 'pixel'; brand: Brand }
  | { kind: 'routing'; brand: Brand; pixel: BrandAsset; enable: boolean };

interface Props {
  currentUser: any;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

const StatusIcon: React.FC<{ s: string }> = ({ s }) =>
  s === 'VERIFIED' ? <BadgeCheck className="h-4 w-4 text-emerald-400" /> : s === 'FAILED' ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : <CircleDashed className="h-4 w-4 text-slate-500" />;

export const BrandsView: React.FC<Props> = ({ currentUser, apiFetch, showError, showSuccess }) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [edit, setEdit] = useState<{ brandId: string; type: AssetType; id: string; handle: string } | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/brands');
      setBrands(r?.brands || []);
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar as marcas.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(key);
    try {
      showSuccess(await fn());
      await load();
    } catch (e: any) {
      showError(e?.message || 'Falha na operação.');
    } finally {
      setBusy(null);
    }
  };

  const verify = (b: Brand) =>
    run(`verify-${b.id}`, async () => {
      const r = await apiFetch(`/brands/${b.id}/verify`, { method: 'POST' });
      const ok = (r?.results || []).filter((x: any) => x.ok).length;
      return `Conferência concluída: ${ok} de ${(r?.results || []).length} ativo(s) confirmados na Meta.`;
    });

  const saveAsset = () => {
    if (!edit) return;
    const e = edit;
    run(`asset-${e.brandId}-${e.type}`, async () => {
      await apiFetch(`/brands/${e.brandId}/assets/${e.type}`, {
        method: 'PUT',
        body: JSON.stringify({ external_id: e.id.trim() || undefined, handle: e.handle.trim() || undefined }),
        headers: { 'Content-Type': 'application/json' }
      });
      setEdit(null);
      return `${ASSET_LABEL[e.type]} registrado. Use "Conferir na Meta" para validar.`;
    });
  };

  const confirmPending = () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (p.kind === 'pixel') {
      run(`pixel-${p.brand.id}`, async () => {
        const r = await apiFetch(`/brands/${p.brand.id}/provision/pixel`, { method: 'POST' });
        return `Pixel ${r?.pixel_id} criado para ${p.brand.name}. As vendas continuam no pixel padrão até você ativar o envio.`;
      });
    } else {
      run(`routing-${p.brand.id}`, async () => {
        await apiFetch(`/brands/${p.brand.id}/pixel-routing`, {
          method: 'PUT',
          body: JSON.stringify({ enabled: p.enable }),
          headers: { 'Content-Type': 'application/json' }
        });
        return p.enable ? `Vendas de ${p.brand.name} agora vão para o pixel da marca.` : `Vendas de ${p.brand.name} voltaram ao pixel padrão.`;
      });
    }
  };

  const createBrand = () =>
    run('create', async () => {
      const b = await apiFetch('/brands', { method: 'POST', body: JSON.stringify({ name: newName.trim() }), headers: { 'Content-Type': 'application/json' } });
      setNewName('');
      return `Marca ${b?.name} criada.`;
    });

  if (loading) return <div className="text-slate-400 text-sm font-mono p-6">Carregando marcas...</div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-widest font-mono text-emerald-400 uppercase flex items-center gap-2">
            <Store className="h-5 w-5" /> Marcas
          </h2>
          <p className="text-xs text-slate-400 mt-1">Uma marca por nicho, com Página, Instagram, Pixel e WhatsApp próprios (D-0009).</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <input
              aria-label="Nome da nova marca"
              placeholder="Nova marca"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={createBrand}
              disabled={!newName.trim() || !!busy}
              className="px-3 py-1.5 rounded bg-emerald-500 text-slate-950 font-bold text-xs font-mono disabled:opacity-50 flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Criar
            </button>
          </div>
        )}
      </header>

      {brands.length === 0 && <p className="text-sm text-slate-400">Nenhuma marca cadastrada.</p>}

      {brands.map(b => {
        const assets = ASSET_ORDER.map(t => b.assets.find(a => a.asset_type === t) || ({ asset_type: t, status: 'PENDING_OPERATOR', external_id: null, handle: null } as BrandAsset));
        return (
          <section key={b.id} className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4" aria-label={`Marca ${b.name}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">{b.name}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {b.code} · {b.status} · {b.niche_name || 'sem nicho'} · {b.products_count} produto(s) · porta-voz {b.spokesperson_type === 'BRAND_ONLY' ? 'a própria marca' : b.spokesperson_type}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-300">
                  {b.assets_done}/{b.assets_total} prontos
                </span>
                {isAdmin && (
                  <button
                    onClick={() => verify(b)}
                    disabled={!!busy}
                    className="px-3 py-1.5 rounded border border-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1 disabled:opacity-50"
                  >
                    {busy === `verify-${b.id}` ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Conferir na Meta
                  </button>
                )}
              </div>
            </div>

            <ul className="divide-y divide-slate-800">
              {assets.map(a => {
                const editing = edit && edit.brandId === b.id && edit.type === a.asset_type;
                const manual = a.asset_type === 'FACEBOOK_PAGE' || a.asset_type === 'INSTAGRAM' || a.asset_type === 'WHATSAPP';
                return (
                  <li key={a.asset_type} className="py-3 flex flex-col gap-2" data-testid={`asset-${a.asset_type}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusIcon s={a.status} />
                      <span className="text-sm text-slate-200 w-40">{ASSET_LABEL[a.asset_type]}</span>
                      <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${STATUS_CLS[a.status] || STATUS_CLS.LINKED}`}>{STATUS_LABEL[a.status] || a.status}</span>
                      <span className="text-xs font-mono text-slate-400">
                        {a.handle ? `@${a.handle}` : ''} {a.external_id ? `· ${a.external_id}` : ''}
                      </span>
                      {a.asset_type === 'PIXEL' && a.external_id && (
                        <span className={`text-[11px] font-mono ${a.routing_enabled ? 'text-emerald-300' : 'text-slate-500'}`}>
                          <Radio className="inline h-3 w-3 mr-1" />
                          {a.routing_enabled ? 'recebendo as vendas da marca' : 'vendas ainda no pixel padrão'}
                        </span>
                      )}
                      <div className="ml-auto flex gap-2">
                        {isAdmin && manual && !editing && (
                          <button
                            onClick={() => setEdit({ brandId: b.id, type: a.asset_type, id: a.external_id || '', handle: a.handle || '' })}
                            className="text-xs font-mono text-emerald-400 underline"
                          >
                            {a.external_id || a.handle ? 'Editar' : 'Registrar'}
                          </button>
                        )}
                        {isAdmin && a.asset_type === 'PIXEL' && !a.external_id && (
                          <button
                            onClick={() => setPending({ kind: 'pixel', brand: b })}
                            disabled={!!busy}
                            className="px-2 py-1 rounded bg-emerald-500 text-slate-950 font-bold text-xs font-mono disabled:opacity-50"
                          >
                            Criar pixel na Meta
                          </button>
                        )}
                        {isAdmin && a.asset_type === 'PIXEL' && a.external_id && a.status === 'VERIFIED' && (
                          <button
                            onClick={() => setPending({ kind: 'routing', brand: b, pixel: a, enable: !a.routing_enabled })}
                            disabled={!!busy}
                            className="px-2 py-1 rounded border border-slate-700 text-slate-200 text-xs font-mono disabled:opacity-50"
                          >
                            {a.routing_enabled ? 'Voltar ao pixel padrão' : 'Enviar vendas para este pixel'}
                          </button>
                        )}
                      </div>
                    </div>
                    {a.last_error && <p className="text-xs text-rose-300 pl-7">{a.last_error}</p>}
                    {(a.status === 'PENDING_OPERATOR' || a.status === 'PENDING_API') && HOW_TO[a.asset_type] && (
                      <p className="text-xs text-slate-500 pl-7">{HOW_TO[a.asset_type]}</p>
                    )}
                    {editing && edit && (
                      <div className="pl-7 flex flex-wrap gap-2 items-center">
                        <input
                          aria-label="ID do ativo"
                          placeholder="ID (só números)"
                          value={edit.id}
                          onChange={e => setEdit({ ...edit, id: e.target.value })}
                          className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-200"
                        />
                        {a.asset_type !== 'FACEBOOK_PAGE' && (
                          <input
                            aria-label="Nome de usuário"
                            placeholder="@usuário ou número"
                            value={edit.handle}
                            onChange={e => setEdit({ ...edit, handle: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-200"
                          />
                        )}
                        <button onClick={saveAsset} disabled={!!busy} className="px-2 py-1 rounded bg-emerald-500 text-slate-950 font-bold text-xs font-mono disabled:opacity-50">
                          Salvar
                        </button>
                        <button onClick={() => setEdit(null)} className="text-xs font-mono text-slate-400">
                          Cancelar
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {pending && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 text-sm space-y-4">
            <h3 className="text-md font-bold tracking-widest font-mono text-emerald-400 uppercase">Confirmar na Meta</h3>
            {pending.kind === 'pixel' ? (
              <p className="text-slate-200">
                Criar o pixel <strong>{pending.brand.name} (NORQVA)</strong> no portfólio e dar acesso à conta de anúncios?
                <span className="block mt-2 text-xs text-slate-400">As vendas continuam no pixel padrão até você ativar o envio para o pixel da marca.</span>
              </p>
            ) : (
              <p className="text-slate-200">
                {pending.enable ? 'Enviar' : 'Parar de enviar'} as vendas de <strong>{pending.brand.name}</strong> {pending.enable ? 'para' : 'ao'} pixel {pending.pixel.external_id}?
                <span className="block mt-2 text-xs text-slate-400">
                  {pending.enable
                    ? 'Campanhas desta marca que otimizam pelo pixel padrão deixam de receber as compras. Ative quando as campanhas novas usarem o pixel da marca.'
                    : 'As vendas voltam ao pixel padrão imediatamente.'}
                </span>
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setPending(null)} className="px-3 py-2 rounded border border-slate-700 text-slate-300 text-xs font-mono">
                Cancelar
              </button>
              <button onClick={confirmPending} className="px-3 py-2 rounded bg-emerald-500 text-slate-950 font-bold text-xs font-mono">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
