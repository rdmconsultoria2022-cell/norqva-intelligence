import React, { useEffect, useState } from 'react';
import { Plus, AlertTriangle, Package, ShoppingCart, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { DigitalAssetAdminModal } from '../delivery/DigitalAssetAdminModal';

// NORQVA-0030 (fase 6): Produtos com as ofertas dentro. Cada produto mostra dados e procedência, as ofertas
// dele (preço, situação, arquivos de entrega, checkout de teste) e a marca. Botões de alterar só para quem o
// servidor aceita: catálogo = ADMIN e PRODUCT; arquivos de entrega e marca = ADMIN.

interface Props {
  products: any[];
  offers: any[];
  currentUser: any;
  isDemoView?: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  onAddProduct: () => void;
  onEditProduct: (p: any) => void;
  /** Abre o cadastro de oferta já ligado a este produto */
  onAddOffer: (productId: string) => void;
  onCheckout: (offer: any) => void;
  onUpdateOfferStatus: (offerId: string, status: string) => void;
  onProductsChanged?: () => void;
  /** Produto a abrir já expandido (endereço antigo de Ofertas) */
  initialOpen?: 'all' | null;
}

const money = (v: any) => `R$${parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_CLS: Record<string, string> = {
  ATIVA: 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-400',
  TESTE: 'bg-cyan-950/60 border border-cyan-500/30 text-cyan-400',
  PAUSADA: 'bg-amber-950/60 border border-amber-500/30 text-amber-400'
};

export const OfferCard: React.FC<{
  off: any;
  canEdit: boolean;
  isAdmin: boolean;
  onCheckout: (o: any) => void;
  onUpdateOfferStatus: (id: string, status: string) => void;
  onManageAssets: (o: any) => void;
}> = ({ off, canEdit, isAdmin, onCheckout, onUpdateOfferStatus, onManageAssets }) => {
  const hasPromo = off.promotional_price !== null && off.promotional_price !== undefined && String(off.promotional_price).trim() !== '' && parseFloat(off.promotional_price) > 0;
  const isCheckoutEligible = off.status === 'TESTE' || off.status === 'ATIVA';
  const statusBtn = (label: string, next: string, cls: string) => (
    <button onClick={() => onUpdateOfferStatus(off.id, next)} className={`flex-1 py-1 px-2 rounded text-[11px] font-mono font-semibold transition text-center ${cls}`}>
      {label}
    </button>
  );
  return (
    <div className="p-3 border border-slate-800 bg-slate-950/40 rounded space-y-3" data-testid="offer-card">
      <div className="flex items-center justify-between">
        <span className="font-mono text-emerald-400 font-bold text-xs">{off.human_id}</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${STATUS_CLS[off.status] || 'bg-slate-800 text-slate-400'}`}>{off.status}</span>
      </div>
      <div>
        <div className="font-bold text-slate-200">{off.name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          {hasPromo ? (
            <>
              <span className="text-lg font-bold font-mono text-emerald-400">{money(off.promotional_price)}</span>
              <span className="text-xs line-through text-slate-500 font-mono">{money(off.price)}</span>
            </>
          ) : (
            <span className="text-lg font-bold font-mono text-emerald-400">{money(off.price)}</span>
          )}
        </div>
        {off.description && <p className="text-xs text-slate-300 mt-1 line-clamp-2">{off.description}</p>}
        <div className="text-[11px] text-slate-400 font-mono mt-1">
          Bônus: {off.bonus || 'Nenhum'}
          {off.upsell ? ` · Upsell: ${off.upsell}` : ''}
          {off.cross_sell ? ` · Cross: ${off.cross_sell}` : ''}
        </div>
      </div>

      {isAdmin && (
        <button
          onClick={() => onManageAssets(off)}
          className="w-full py-1 px-2 rounded bg-slate-800/80 border border-slate-700/80 hover:bg-slate-800 text-slate-300 text-[11px] font-mono transition flex items-center justify-center gap-1.5"
        >
          <Package className="h-3.5 w-3.5 text-emerald-400" /> Arquivos de entrega
        </button>
      )}

      {canEdit && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60" data-testid="offer-status-actions">
          {off.status === 'RASCUNHO' && statusBtn('Ativar para teste', 'TESTE', 'bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/40')}
          {off.status === 'TESTE' && (
            <>
              {statusBtn('Ativar oferta', 'ATIVA', 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40')}
              {statusBtn('Pausar', 'PAUSADA', 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700')}
            </>
          )}
          {off.status === 'ATIVA' && statusBtn('Pausar oferta', 'PAUSADA', 'bg-amber-950/40 border border-amber-500/30 text-amber-400 hover:bg-amber-900/40')}
          {off.status === 'PAUSADA' && statusBtn('Reativar', 'ATIVA', 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40')}
        </div>
      )}

      {isCheckoutEligible ? (
        <button
          onClick={() => onCheckout(off)}
          className="w-full py-1.5 px-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5"
        >
          <ShoppingCart className="h-3.5 w-3.5" /> Checkout da oferta
        </button>
      ) : (
        <div className="w-full py-1.5 px-3 rounded bg-slate-950/60 border border-slate-850 text-slate-500 text-[11px] font-mono text-center" title="Checkout só com a oferta em TESTE ou ATIVA">
          Checkout indisponível ({off.status})
        </div>
      )}
    </div>
  );
};

export const ProductsView: React.FC<Props> = ({
  products,
  offers,
  currentUser,
  apiFetch,
  showError,
  showSuccess,
  onAddProduct,
  onEditProduct,
  onAddOffer,
  onCheckout,
  onUpdateOfferStatus,
  onProductsChanged,
  initialOpen = null
}) => {
  const role = String(currentUser?.role || '');
  const isAdmin = role === 'ADMIN';
  const canEdit = role === 'ADMIN' || role === 'PRODUCT';
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [assetOffer, setAssetOffer] = useState<any>(null);
  const [brands, setBrands] = useState<any[]>([]);
  const [brandChange, setBrandChange] = useState<{ product: any; brand: any } | null>(null);

  useEffect(() => {
    if (initialOpen === 'all') setOpen(new Set(products.map(p => String(p.id))));
  }, [initialOpen, products.length]);

  // Marcas: leitura para os perfis que o servidor aceita; trocar continua só ADMIN
  const canReadBrands = ['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE'].includes(role);
  useEffect(() => {
    if (!canReadBrands) return;
    apiFetch('/brands')
      .then((r: any) => setBrands(Array.isArray(r?.brands) ? r.brands : []))
      .catch(() => setBrands([]));
  }, [canReadBrands, apiFetch]);

  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirmBrand = async () => {
    if (!brandChange) return;
    try {
      await apiFetch(`/brands/${brandChange.brand.id}/products/${brandChange.product.id}`, { method: 'PUT', body: '{}', headers: { 'Content-Type': 'application/json' } });
      showSuccess(`${brandChange.product.name} agora é da marca ${brandChange.brand.name}.`);
      setBrandChange(null);
      onProductsChanged?.();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível trocar a marca.');
    }
  };

  const brandName = (id: string | null) => (id ? brands.find(b => String(b.id) === String(id))?.name || null : null);
  const orphanOffers = offers.filter(o => !products.some(p => String(p.id) === String(o.product_id)));

  return (
    <div className="space-y-6 text-sm" data-testid="products-view">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-200">Produtos</h2>
          <p className="text-xs text-slate-400">Cada produto com as ofertas dele, os arquivos de entrega, o checkout de teste e a marca.</p>
        </div>
        {canEdit && (
          <button onClick={onAddProduct} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-slate-950 font-bold rounded hover:bg-emerald-400 transition">
            <Plus className="h-4 w-4" /> Novo produto
          </button>
        )}
      </div>

      {products.length === 0 && (
        <div className="p-12 border border-slate-800 rounded bg-slate-900/20 text-center text-slate-500 font-mono">Nenhum produto cadastrado.</div>
      )}

      <div className="space-y-3">
        {products.map(prd => {
          const prdOffers = offers.filter(o => String(o.product_id) === String(prd.id));
          const isOpen = open.has(String(prd.id));
          return (
            <section key={prd.id} className="border border-slate-800 bg-slate-900/30 rounded" data-testid="product-card">
              <div className="p-4 grid gap-4 md:grid-cols-[1fr_18rem]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-emerald-400 font-bold text-xs">{prd.human_id}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        prd.status === 'PRONTO' || prd.status === 'ATIVO' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {prd.status}
                    </span>
                  </div>
                  <h3 className="text-md font-bold text-slate-200 mt-1">{prd.name}</h3>
                  <div className="text-xs text-slate-400 font-mono">{prd.category}</div>
                  <p className="text-xs text-slate-300 mt-1 line-clamp-2">{prd.description}</p>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded bg-slate-950/60 border border-slate-850 space-y-1">
                    <div className="text-[10px] font-mono text-slate-500 uppercase font-bold">Procedência</div>
                    {prd.origin_provenance ? (
                      <>
                        <div className="text-slate-300">
                          Origem: <span className="font-mono text-emerald-400 font-semibold">{prd.origin_provenance}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">Evidência: {prd.origin_evidence}</div>
                      </>
                    ) : (
                      <div className="text-red-400/80 italic font-mono text-[10px] flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Procedência ausente: o status PRONTO fica bloqueado.
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2" data-testid="product-brand">
                    <Tag className="h-3.5 w-3.5 text-slate-500" />
                    {isAdmin ? (
                      <select
                        aria-label={`Marca de ${prd.name}`}
                        value={prd.brand_id || ''}
                        onChange={e => {
                          const b = brands.find(x => String(x.id) === e.target.value);
                          if (b) setBrandChange({ product: prd, brand: b });
                        }}
                        className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                      >
                        <option value="" disabled>
                          Sem marca
                        </option>
                        {brands.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-400">{prd.brand_id ? brandName(prd.brand_id) || 'Marca definida' : 'Sem marca'}</span>
                    )}
                  </div>
                  {canEdit && (
                    <button onClick={() => onEditProduct(prd)} className="w-full px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold transition">
                      Atualizar situação e procedência
                    </button>
                  )}
                </div>
              </div>

              {brandChange && brandChange.product.id === prd.id && (
                <div role="dialog" aria-label="Confirmar marca" className="mx-4 mb-3 rounded border border-amber-600/50 bg-amber-950/20 p-3 text-xs text-amber-100 space-y-2" data-testid="confirm-brand">
                  <p>
                    Ligar <strong>{prd.name}</strong> à marca <strong>{brandChange.brand.name}</strong>? Se a marca tiver o roteamento de pixel ligado, as vendas deste
                    produto passam a ser contadas no pixel dela.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={confirmBrand} className="px-3 py-1.5 rounded bg-emerald-600 text-white font-bold">
                      Confirmar
                    </button>
                    <button onClick={() => setBrandChange(null)} className="px-3 py-1.5 rounded border border-slate-700 text-slate-300">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-slate-800">
                <div className="flex items-center justify-between px-4 py-2">
                  <button onClick={() => toggle(String(prd.id))} className="flex items-center gap-1 text-xs font-semibold text-slate-300" data-testid="toggle-offers">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Ofertas ({prdOffers.length})
                  </button>
                  {canEdit && (
                    <button onClick={() => onAddOffer(String(prd.id))} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300" data-testid="add-offer">
                      <Plus className="h-3.5 w-3.5" /> Nova oferta
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3" data-testid="product-offers">
                    {prdOffers.length === 0 && <p className="text-xs text-slate-500">Nenhuma oferta para este produto.</p>}
                    {prdOffers.map(off => (
                      <OfferCard key={off.id} off={off} canEdit={canEdit} isAdmin={isAdmin} onCheckout={onCheckout} onUpdateOfferStatus={onUpdateOfferStatus} onManageAssets={setAssetOffer} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {orphanOffers.length > 0 && (
        <section className="space-y-2" data-testid="orphan-offers">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ofertas de produtos fora desta lista</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orphanOffers.map(off => (
              <OfferCard key={off.id} off={off} canEdit={canEdit} isAdmin={isAdmin} onCheckout={onCheckout} onUpdateOfferStatus={onUpdateOfferStatus} onManageAssets={setAssetOffer} />
            ))}
          </div>
        </section>
      )}

      {assetOffer && (
        <DigitalAssetAdminModal offer={assetOffer} apiFetch={apiFetch} onClose={() => setAssetOffer(null)} showError={showError} showSuccess={showSuccess} />
      )}
    </div>
  );
};
