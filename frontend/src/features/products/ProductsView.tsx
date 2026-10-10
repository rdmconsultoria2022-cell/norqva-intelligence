import React, { useEffect, useState } from 'react';
import { Plus, AlertTriangle, Package, ShoppingCart, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { DigitalAssetAdminModal } from '../delivery/DigitalAssetAdminModal';
import { OfferBumpConfig, ProductClaims } from './ProductExtras';
import { DeliveryFiles } from './DeliveryFiles';
import { HiddenProducts } from './HiddenProducts';
import { OfferEditor } from './OfferEditor';

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


/** NORQVA-0031: custos por venda da oferta (ADMIN) e o CPA de equilíbrio que sai deles. */
export const OfferCosts: React.FC<{
  off: any;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}> = ({ off, apiFetch, showError, showSuccess }) => {
  const mode = off.is_demo ? 'demo' : 'real';
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [bumpStats, setBumpStats] = useState<{ orders: number; avg_bump: number; min_orders: number } | null>(null);
  const [configured, setConfigured] = useState(false);
  const [form, setForm] = useState({ tax: '0', fixed: '1,99', pct: '0', other: '0', margin: '0' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/offers/${off.id}/unit-economics?mode=${mode}`)
      .then((r: any) => {
        if (cancelled) return;
        const u = r?.unit_economics;
        if (r?.bump_stats) setBumpStats(r.bump_stats);
        if (u) {
          const pctStr = (v: number) => String(Math.round(v * 10000) / 100).replace('.', ',');
          setForm({ tax: pctStr(u.tax_rate), fixed: String(u.gateway_fixed_fee).replace('.', ','), pct: pctStr(u.gateway_pct_fee), other: String(u.other_variable_cost).replace('.', ','), margin: pctStr(u.target_net_margin) });
          setConfigured(true);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadFailed(true);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [off.id, mode, apiFetch]);

  const n = (v: string) => Number(String(v).replace(',', '.'));
  const price = off.promotional_price !== null && off.promotional_price !== undefined && String(off.promotional_price).trim() !== '' && parseFloat(off.promotional_price) > 0 ? parseFloat(off.promotional_price) : parseFloat(off.price);
  const valid = Number.isFinite(price) && [form.tax, form.fixed, form.pct, form.other, form.margin].every(v => String(v).trim() !== '' && Number.isFinite(n(v)) && n(v) >= 0);
  const costPerSale = valid ? price * (n(form.tax) / 100) + n(form.fixed) + price * (n(form.pct) / 100) + n(form.other) : null;
  const breakeven = costPerSale === null ? null : Math.round((price - costPerSale) * 100) / 100;

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/offers/${off.id}/unit-economics?mode=${mode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tax_rate: n(form.tax) / 100, gateway_fixed_fee: n(form.fixed), gateway_pct_fee: n(form.pct) / 100, other_variable_cost: n(form.other), target_net_margin: n(form.margin) / 100 })
      });
      setConfigured(true);
      showSuccess(`Custos de ${off.human_id} salvos. Equilíbrio: R$ ${breakeven?.toFixed(2).replace('.', ',')} por venda.`);
    } catch (e: any) {
      showError(e?.message || 'Não foi possível salvar os custos.');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p className="text-[11px] text-slate-500">Carregando custos…</p>;
  if (loadFailed) return <p className="text-[11px] text-red-300" data-testid="offer-costs-error">Não foi possível ler os custos desta oferta agora. Nada foi alterado; tente de novo.</p>;
  const field = (label: string, key: keyof typeof form, hint: string) => (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-slate-400">{label}</span>
      <input aria-label={label} inputMode="decimal" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-100" />
      <span className="text-[10px] text-slate-500">{hint}</span>
    </label>
  );
  return (
    <div className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2 text-xs" data-testid="offer-costs">
      {!configured && <p className="text-amber-300 text-[11px]">Custos ainda não cadastrados: o sistema não sabe o equilíbrio desta oferta.</p>}
      <div className="grid grid-cols-2 gap-2">
        {field('Imposto (%)', 'tax', 'sobre o preço')}
        {field('Tarifa fixa do gateway (R$)', 'fixed', 'Asaas Pix: 1,99')}
        {field('Tarifa do gateway (%)', 'pct', 'sobre o preço')}
        {field('Outros custos por venda (R$)', 'other', 'ex.: entrega')}
        {field('Margem desejada (%)', 'margin', 'só referência')}
      </div>
      {bumpStats && (
        <p className="text-[11px] text-slate-400" data-testid="offer-bump-stats">
          Adicional: R$ {bumpStats.avg_bump.toFixed(2).replace('.', ',')} por pedido em {bumpStats.orders} pedido(s) pagos.{' '}
          {bumpStats.orders >= bumpStats.min_orders
            ? 'Já entra no equilíbrio do produto.'
            : `Entra no equilíbrio a partir de ${bumpStats.min_orders} pedidos.`}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-300" data-testid="offer-breakeven">
          {breakeven === null
            ? 'Preencha os campos com números.'
            : breakeven <= 0
              ? `Os custos (R$ ${costPerSale!.toFixed(2).replace('.', ',')}) já passam do preço: cada venda dá prejuízo antes do anúncio.`
              : `Equilíbrio: R$ ${breakeven.toFixed(2).replace('.', ',')} por venda (custos R$ ${costPerSale!.toFixed(2).replace('.', ',')})`}
        </span>
        <button onClick={save} disabled={busy || !valid || breakeven === null} className="rounded bg-emerald-600 px-2.5 py-1 font-semibold text-white disabled:opacity-40" data-testid="save-offer-costs">
          Salvar custos
        </button>
      </div>
    </div>
  );
};

export const OfferCard: React.FC<{
  off: any;
  canEdit: boolean;
  isAdmin: boolean;
  onCheckout: (o: any) => void;
  onUpdateOfferStatus: (id: string, status: string) => void;
  onManageAssets: (o: any) => void;
  costs?: React.ReactNode;
  bumpConfig?: React.ReactNode;
  deliveryFiles?: React.ReactNode;
  /** NORQVA-0035: editor da oferta; recebe a função de fechar */
  editor?: (close: () => void) => React.ReactNode;
}> = ({ off, canEdit, isAdmin, onCheckout, onUpdateOfferStatus, onManageAssets, costs, bumpConfig, deliveryFiles, editor }) => {
  const [editing, setEditing] = useState(false);
  const [showCosts, setShowCosts] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showBump, setShowBump] = useState(false);
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

      {canEdit && editor && !editing && (
        <button
          onClick={() => setEditing(true)}
          data-testid="edit-offer"
          className="w-full py-1 px-2 rounded bg-slate-800/80 border border-slate-700/80 hover:bg-slate-800 text-slate-300 text-[11px] font-mono transition"
        >
          Editar oferta
        </button>
      )}
      {canEdit && editor && editing && editor(() => setEditing(false))}

      {isAdmin && costs && (
        <button
          onClick={() => setShowCosts(!showCosts)}
          data-testid="toggle-offer-costs"
          className="w-full py-1 px-2 rounded bg-slate-800/80 border border-slate-700/80 hover:bg-slate-800 text-slate-300 text-[11px] font-mono transition"
        >
          Custos e equilíbrio
        </button>
      )}
      {isAdmin && showCosts && costs}

      {isAdmin && bumpConfig && (
        <button
          onClick={() => setShowBump(!showBump)}
          data-testid="toggle-offer-bump"
          className="w-full py-1 px-2 rounded bg-slate-800/80 border border-slate-700/80 hover:bg-slate-800 text-slate-300 text-[11px] font-mono transition"
        >
          Adicional no Pix
        </button>
      )}
      {isAdmin && showBump && bumpConfig}

      {isAdmin && deliveryFiles && (
        <button
          onClick={() => setShowFiles(!showFiles)}
          data-testid="toggle-delivery-files"
          className="w-full py-1 px-2 rounded bg-slate-800/80 border border-slate-700/80 hover:bg-slate-800 text-slate-300 text-[11px] font-mono transition"
        >
          PDF entregue ao comprador
        </button>
      )}
      {isAdmin && showFiles && deliveryFiles}

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
  isDemoView = false,
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
  const [openClaims, setOpenClaims] = useState<Set<string>>(new Set());
  const toggleClaims = (id: string) =>
    setOpenClaims(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

      {isAdmin && !isDemoView && <HiddenProducts apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onChanged={onProductsChanged} />}

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
                      Editar produto (nome, situação e procedência)
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
                <button onClick={() => toggleClaims(String(prd.id))} className="flex items-center gap-1 px-4 py-2 text-xs font-semibold text-slate-300" data-testid="toggle-claims">
                  {openClaims.has(String(prd.id)) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Promessas
                </button>
                {openClaims.has(String(prd.id)) && (
                  <ProductClaims product={prd} offers={offers} currentUser={currentUser} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />
                )}
              </div>

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
                      <OfferCard key={off.id} off={off} canEdit={canEdit} isAdmin={isAdmin} onCheckout={onCheckout} onUpdateOfferStatus={onUpdateOfferStatus} onManageAssets={setAssetOffer} costs={isAdmin ? <OfferCosts off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} bumpConfig={isAdmin ? <OfferBumpConfig off={off} offers={offers} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} deliveryFiles={isAdmin ? <DeliveryFiles off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} editor={close => <OfferEditor off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onSaved={onProductsChanged} onClose={close} />} />
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
              <OfferCard key={off.id} off={off} canEdit={canEdit} isAdmin={isAdmin} onCheckout={onCheckout} onUpdateOfferStatus={onUpdateOfferStatus} onManageAssets={setAssetOffer} costs={isAdmin ? <OfferCosts off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} bumpConfig={isAdmin ? <OfferBumpConfig off={off} offers={offers} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} deliveryFiles={isAdmin ? <DeliveryFiles off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} editor={close => <OfferEditor off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onSaved={onProductsChanged} onClose={close} />} />
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
