import React, { useEffect, useState } from 'react';
import { Plus, AlertTriangle, Package, ShoppingCart, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { DigitalAssetAdminModal } from '../delivery/DigitalAssetAdminModal';
import { OfferBumpConfig, ProductClaims } from './ProductExtras';
import { DeliveryFiles } from './DeliveryFiles';
import { HiddenProducts } from './HiddenProducts';
import { OfferEditor } from './OfferEditor';
import { CatalogTrash, TrashAction } from './CatalogTrash';
import { ViewModeSelector, useViewMode, containerClass, isIconMode, IconTile } from '../../components/ViewModes';
import { COLLECTION_COVERS, READY_BOOKS } from '../public/bookPages';
import { StatusPill, Tone } from '../../components/ui/premium';

// NORQVA-0062: opções de exibição da tela Produtos, como na tela Criativos
type Situation = 'ALL' | 'SELLING' | 'TESTING' | 'OFF';
const SITUATION_LABEL: Record<Situation, string> = { ALL: 'Todos', SELLING: 'À venda', TESTING: 'Em teste', OFF: 'Fora do ar' };

/** Situação de venda do produto pelas ofertas dele. */
export function productSituation(prdOffers: any[]): Exclude<Situation, 'ALL'> {
  if (prdOffers.some(o => o.status === 'ATIVA')) return 'SELLING';
  if (prdOffers.some(o => o.status === 'TESTE')) return 'TESTING';
  return 'OFF';
}

/** Capa do produto para os modos de ícone (endereço completo: o tile só mostra links http). */
export function productCover(prd: any): string | null {
  const name = String(prd?.name || '').toLowerCase();
  const key = String(prd?.collection_key || '');
  const path = key && READY_BOOKS.has(key) ? COLLECTION_COVERS[key]
    : /dolci/.test(name) ? '/images/kit/capa_dolci.jpg'
    : /trattoria/.test(name) ? '/images/kit/capa_trat.jpg'
    : /^kit\b/.test(name) ? '/images/kit/capa_kit.jpg'
    : null;
  if (!path) return null;
  try {
    return `${window.location.origin}${path}`;
  } catch {
    return null;
  }
}

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

const OFFER_STATUS: Record<string, { label: string; tone: Tone }> = {
  ATIVA: { label: 'Ativa', tone: 'positive' },
  TESTE: { label: 'Em teste', tone: 'info' },
  PAUSADA: { label: 'Pausada', tone: 'attention' },
  RASCUNHO: { label: 'Rascunho', tone: 'neutral' },
  ARQUIVADA: { label: 'Arquivada', tone: 'neutral' }
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

  if (!loaded) return <p className="text-[12px] text-nq-subtle">Carregando custos…</p>;
  if (loadFailed) return <p className="text-[12px] text-nq-critical-text" data-testid="offer-costs-error">Não foi possível ler os custos desta oferta agora. Nada foi alterado; tente de novo.</p>;
  const field = (label: string, key: keyof typeof form, hint: string) => (
    <label className="flex flex-col gap-0.5">
      <span className="text-[12px] text-nq-muted">{label}</span>
      <input aria-label={label} inputMode="decimal" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className="rounded-xl bg-nq-bg px-3 py-2 text-nq-body text-nq-text min-h-[44px]" />
      <span className="text-[12px] text-nq-subtle">{hint}</span>
    </label>
  );
  return (
    <div className="space-y-3 rounded-xl bg-nq-surface p-3 text-nq-aux" data-testid="offer-costs">
      {!configured && <p className="text-nq-attention text-[12px]">Custos ainda não cadastrados: o sistema não sabe o equilíbrio desta oferta.</p>}
      <div className="grid grid-cols-2 gap-2">
        {field('Imposto (%)', 'tax', 'sobre o preço')}
        {field('Tarifa fixa do gateway (R$)', 'fixed', 'Asaas Pix: 1,99')}
        {field('Tarifa do gateway (%)', 'pct', 'sobre o preço')}
        {field('Outros custos por venda (R$)', 'other', 'ex.: entrega')}
        {field('Margem desejada (%)', 'margin', 'só referência')}
      </div>
      {bumpStats && (
        <p className="text-[12px] text-nq-muted" data-testid="offer-bump-stats">
          Adicional: R$ {bumpStats.avg_bump.toFixed(2).replace('.', ',')} por pedido em {bumpStats.orders} pedido(s) pagos.{' '}
          {bumpStats.orders >= bumpStats.min_orders
            ? 'Já entra no equilíbrio do produto.'
            : `Entra no equilíbrio a partir de ${bumpStats.min_orders} pedidos.`}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-nq-text" data-testid="offer-breakeven">
          {breakeven === null
            ? 'Preencha os campos com números.'
            : breakeven <= 0
              ? `Os custos (R$ ${costPerSale!.toFixed(2).replace('.', ',')}) já passam do preço: cada venda dá prejuízo antes do anúncio.`
              : `Equilíbrio: R$ ${breakeven.toFixed(2).replace('.', ',')} por venda (custos R$ ${costPerSale!.toFixed(2).replace('.', ',')})`}
        </span>
        <button onClick={save} disabled={busy || !valid || breakeven === null} className="shrink-0 rounded-full bg-nq-positive px-4 font-semibold text-nq-on-positive disabled:opacity-40 min-h-[44px]" data-testid="save-offer-costs">
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
  /** NORQVA-0057: excluir (lixeira) ou restaurar do arquivo */
  trash?: React.ReactNode;
}> = ({ off, canEdit, isAdmin, onCheckout, onUpdateOfferStatus, onManageAssets, costs, bumpConfig, deliveryFiles, editor, trash }) => {
  const [editing, setEditing] = useState(false);
  const [showCosts, setShowCosts] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showBump, setShowBump] = useState(false);
  const hasPromo = off.promotional_price !== null && off.promotional_price !== undefined && String(off.promotional_price).trim() !== '' && parseFloat(off.promotional_price) > 0;
  const isCheckoutEligible = off.status === 'TESTE' || off.status === 'ATIVA';
  const statusBtn = (label: string, next: string, cls: string) => (
    <button onClick={() => onUpdateOfferStatus(off.id, next)} className={`flex-1 px-3 rounded-full text-nq-aux font-semibold transition text-center ${cls} min-h-[44px]`}>
      {label}
    </button>
  );
  return (
    <div className="p-3 bg-nq-bg rounded-xl space-y-3" data-testid="offer-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-nq-caption text-nq-subtle">{off.human_id}</span>
        <StatusPill tone={OFFER_STATUS[off.status]?.tone || 'neutral'}>{OFFER_STATUS[off.status]?.label || off.status}</StatusPill>
      </div>
      <div>
        <div className="text-nq-body font-semibold text-nq-text">{off.name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          {hasPromo ? (
            <>
              <span className="text-[20px] leading-7 font-semibold tabular-nums text-nq-text">{money(off.promotional_price)}</span>
              <span className="text-nq-aux line-through text-nq-subtle">{money(off.price)}</span>
            </>
          ) : (
            <span className="text-[20px] leading-7 font-semibold tabular-nums text-nq-text">{money(off.price)}</span>
          )}
        </div>
        {off.description && <p className="text-nq-aux text-nq-muted mt-1 line-clamp-2">{off.description}</p>}
        <div className="text-[12px] text-nq-muted mt-1">
          Bônus: {off.bonus || 'Nenhum'}
          {off.upsell ? ` · Upsell: ${off.upsell}` : ''}
          {off.cross_sell ? ` · Cross: ${off.cross_sell}` : ''}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {canEdit && editor && !editing && off.status !== 'ARQUIVADA' && (
          <button
            onClick={() => setEditing(true)}
            data-testid="edit-offer"
            className="w-full px-3 py-2 leading-tight rounded-full bg-nq-raised hover:brightness-110 text-nq-text text-nq-aux font-medium transition min-h-[44px]"
          >
            Editar oferta
          </button>
        )}

        {isAdmin && costs && (
          <button
            onClick={() => setShowCosts(!showCosts)}
            data-testid="toggle-offer-costs"
            aria-expanded={showCosts}
            className="w-full px-3 py-2 leading-tight rounded-full bg-nq-raised hover:brightness-110 text-nq-text text-nq-aux font-medium transition min-h-[44px]"
          >
            Custos e equilíbrio
          </button>
        )}

        {isAdmin && bumpConfig && (
          <button
            onClick={() => setShowBump(!showBump)}
            data-testid="toggle-offer-bump"
            aria-expanded={showBump}
            className="w-full px-3 py-2 leading-tight rounded-full bg-nq-raised hover:brightness-110 text-nq-text text-nq-aux font-medium transition min-h-[44px]"
          >
            Adicional no Pix
          </button>
        )}

        {isAdmin && deliveryFiles && (
          <button
            onClick={() => setShowFiles(!showFiles)}
            data-testid="toggle-delivery-files"
            aria-expanded={showFiles}
            className="w-full px-3 py-2 leading-tight rounded-full bg-nq-raised hover:brightness-110 text-nq-text text-nq-aux font-medium transition min-h-[44px]"
          >
            PDF entregue ao comprador
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => onManageAssets(off)}
            className="w-full px-3 py-2 leading-tight rounded-full bg-nq-raised hover:brightness-110 text-nq-text text-nq-aux font-medium transition flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            <Package aria-hidden="true" className="h-4 w-4 text-nq-muted" /> Arquivos de entrega
          </button>
        )}
      </div>
      {canEdit && editor && editing && editor(() => setEditing(false))}
      {isAdmin && showCosts && costs}
      {isAdmin && showBump && bumpConfig}
      {isAdmin && showFiles && deliveryFiles}

      {canEdit && (
        <div className="flex items-center gap-2 pt-3 border-t border-nq-line/60" data-testid="offer-status-actions">
          {off.status === 'RASCUNHO' && statusBtn('Ativar para teste', 'TESTE', 'bg-nq-info/15 text-nq-info hover:bg-nq-info/25')}
          {off.status === 'TESTE' && (
            <>
              {statusBtn('Ativar oferta', 'ATIVA', 'bg-nq-positive/15 text-nq-positive-text hover:bg-nq-positive/25')}
              {statusBtn('Pausar', 'PAUSADA', 'bg-nq-raised text-nq-muted hover:brightness-110')}
            </>
          )}
          {off.status === 'ATIVA' && statusBtn('Pausar oferta', 'PAUSADA', 'bg-nq-attention/15 text-nq-attention hover:bg-nq-attention/25')}
          {off.status === 'PAUSADA' && statusBtn('Reativar', 'ATIVA', 'bg-nq-positive/15 text-nq-positive-text hover:bg-nq-positive/25')}
        </div>
      )}

      {isAdmin && trash}

      {isCheckoutEligible ? (
        <button
          onClick={() => onCheckout(off)}
          className="w-full px-3 rounded-full bg-nq-positive text-nq-on-positive hover:brightness-110 text-nq-aux font-semibold transition flex items-center justify-center gap-1.5 min-h-[44px]"
        >
          <ShoppingCart className="h-3.5 w-3.5" /> Checkout da oferta
        </button>
      ) : (
        <div className="w-full py-2 px-3 rounded-full bg-nq-raised/60 text-nq-subtle text-nq-caption text-center" title="Checkout só com a oferta em teste ou ativa">
          Checkout indisponível ({OFFER_STATUS[off.status]?.label.toLowerCase() || off.status})
        </div>
      )}
    </div>
  );
};

const PRODUCT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PLANEJADO: { label: 'Planejado', tone: 'neutral' },
  EM_DESENVOLVIMENTO: { label: 'Em desenvolvimento', tone: 'info' },
  REVISAO: { label: 'Em revisão', tone: 'attention' },
  PRONTO: { label: 'Pronto', tone: 'positive' },
  ATIVO: { label: 'Ativo', tone: 'positive' },
  PAUSADO: { label: 'Pausado', tone: 'neutral' },
  ARQUIVADO: { label: 'Arquivado', tone: 'neutral' }
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
  // NORQVA-0062: filtros e modo de exibição
  const [situation, setSituation] = useState<Situation>('ALL');
  const [showArchived, setShowArchived] = useState(false);
  const [productFilter, setProductFilter] = useState('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [viewMode, setViewMode] = useViewMode('norqva.products.viewMode');
  const [focusId, setFocusId] = useState<string | null>(null);
  // NORQVA-0057: recarrega a lixeira depois de excluir/restaurar
  const [trashKey, setTrashKey] = useState(0);
  const afterTrash = () => {
    setTrashKey(k => k + 1);
    onProductsChanged?.();
  };
  const offerTrash = (off: any) => {
    if (!isAdmin || isDemoView) return null;
    if (off.status === 'ATIVA' || off.status === 'TESTE') {
      return <p className="text-[12px] text-nq-subtle text-center" data-testid="delete-offer-hint">Para excluir, pause a oferta antes.</p>;
    }
    return <TrashAction kind="offer" action={off.status === 'ARQUIVADA' ? 'restore' : 'delete'} item={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onDone={afterTrash} />;
  };

  useEffect(() => {
    if (initialOpen === 'all') {
      setOpen(new Set(products.map(p => String(p.id))));
      setViewMode('list');
    }
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

  // NORQVA-0062: filtros (situação de venda, arquivados, nome, marca)
  const offersOf = (prd: any) => offers.filter(o => String(o.product_id) === String(prd.id));
  // arquivado com oferta vendendo ou em teste continua visível: está no ar
  const isArchived = (prd: any) => prd.status === 'ARQUIVADO' && productSituation(offersOf(prd)) === 'OFF';
  // filtro que ficou sem opção (produto excluído, marcas não carregadas) volta para "todos"
  const effProduct = products.some(p => String(p.id) === productFilter) ? productFilter : 'ALL';
  const effBrand = brands.length > 0 ? brandFilter : 'ALL';
  const baseProducts = products.filter(
    p =>
      (showArchived || !isArchived(p) || String(p.id) === effProduct) &&
      (effProduct === 'ALL' || String(p.id) === effProduct) &&
      (effBrand === 'ALL' || (effBrand === 'NONE' ? !p.brand_id : String(p.brand_id || '') === effBrand))
  );
  const situationCounts: Record<Situation, number> = { ALL: baseProducts.length, SELLING: 0, TESTING: 0, OFF: 0 };
  for (const p of baseProducts) situationCounts[productSituation(offersOf(p))] += 1;
  const archivedCount = products.filter(isArchived).length;
  const visibleProducts = baseProducts.filter(p => situation === 'ALL' || productSituation(offersOf(p)) === situation);
  const openProductInList = (id: string) => {
    setViewMode('list');
    setFocusId(id);
    setTimeout(() => setFocusId(cur => (cur === id ? null : cur)), 4000);
    setOpen(prev => new Set(prev).add(id));
    setTimeout(() => {
      try {
        document.getElementById(`product-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        /* ignore */
      }
    }, 50);
  };

  return (
    <div className="space-y-5 text-nq-aux" data-testid="products-view">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight text-nq-text">Produtos</h1>
          <p className="mt-1 text-nq-aux text-nq-muted">Cada produto com as ofertas dele, os arquivos de entrega, o checkout de teste e a marca.</p>
        </div>
        {canEdit && (
          <button onClick={onAddProduct} className="shrink-0 whitespace-nowrap flex items-center gap-1.5 px-4 bg-nq-positive text-nq-on-positive font-semibold rounded-full hover:brightness-110 transition min-h-[44px]">
            <Plus className="h-4 w-4" /> Novo produto
          </button>
        )}
      </div>

      {isAdmin && !isDemoView && <HiddenProducts apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onChanged={onProductsChanged} />}
      {isAdmin && !isDemoView && <CatalogTrash apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onChanged={onProductsChanged} reloadKey={trashKey} />}

      {products.length === 0 && (
        <div className="p-12 rounded-nq bg-nq-surface text-center text-nq-subtle">Nenhum produto cadastrado.</div>
      )}

      {products.length > 0 && (
        <div className="space-y-2 text-nq-aux" data-testid="product-filters">
          <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {(['ALL', 'SELLING', 'TESTING', 'OFF'] as Situation[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setSituation(k)}
                aria-pressed={situation === k}
                data-testid={`situation-${k}`}
                className={`shrink-0 px-4 rounded-full border text-nq-aux font-medium ${situation === k ? 'bg-nq-text text-nq-bg border-nq-text' : 'bg-nq-surface border-transparent text-nq-muted'} min-h-[44px]`}
              >
                {SITUATION_LABEL[k]} ({situationCounts[k]})
              </button>
            ))}
            <label className="shrink-0 flex min-h-[44px] items-center gap-2 ml-1 text-nq-muted cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} aria-label="Exibir arquivados" data-testid="show-archived" />
              Exibir arquivados ({archivedCount})
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Produto"
              data-testid="product-name-filter"
              value={effProduct}
              onChange={e => setProductFilter(e.target.value)}
              className="min-w-0 flex-1 sm:flex-none sm:max-w-[18rem] bg-nq-surface text-nq-text px-3 py-2 rounded-xl min-h-[44px]"
            >
              <option value="ALL">Procurar pelo nome do produto</option>
              {[...products]
                .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                .map(p => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
            </select>
            {brands.length > 0 && (
              <select
                aria-label="Marca"
                data-testid="brand-filter"
                value={effBrand}
                onChange={e => setBrandFilter(e.target.value)}
                className="bg-nq-surface text-nq-text px-3 py-2 rounded-xl min-h-[44px]"
              >
                <option value="ALL">Todas as marcas</option>
                {brands.map(b => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
                <option value="NONE">Sem marca</option>
              </select>
            )}
            <div className="ml-auto">
              <ViewModeSelector value={viewMode} onChange={setViewMode} />
            </div>
          </div>
        </div>
      )}

      {products.length > 0 && visibleProducts.length === 0 && (
        <p className="text-sm text-nq-muted" data-testid="products-none">Nenhum produto com esse filtro.</p>
      )}

      <div className={containerClass(viewMode)} data-testid="products-container">
        {visibleProducts.map(prd => {
          const prdOffers = offers.filter(o => String(o.product_id) === String(prd.id));
          const isOpen = open.has(String(prd.id));
          if (isIconMode(viewMode)) {
            const sit = productSituation(prdOffers);
            return (
              <IconTile
                key={prd.id}
                mode={viewMode}
                title={prd.name}
                subtitle={`${prd.human_id} · ${SITUATION_LABEL[sit]}`}
                url={productCover(prd)}
                format="IMAGE"
                onOpen={() => openProductInList(String(prd.id))}
              />
            );
          }
          return (
            <section
              key={prd.id}
              id={`product-card-${prd.id}`}
              className={`bg-nq-surface rounded-nq overflow-hidden ${focusId === String(prd.id) ? 'ring-2 ring-nq-positive' : ''}`}
              data-testid="product-card"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-nq-body font-semibold text-nq-text break-words">{prd.name}</h3>
                    <div className="text-nq-caption text-nq-subtle">
                      {prd.human_id}
                      {prd.category ? ` · ${prd.category}` : ''}
                      {prd.brand_id && brandName(prd.brand_id) ? ` · ${brandName(prd.brand_id)}` : ''}
                    </div>
                  </div>
                  <span className="shrink-0">
                    <StatusPill tone={PRODUCT_STATUS[prd.status]?.tone || 'neutral'}>{PRODUCT_STATUS[prd.status]?.label || prd.status}</StatusPill>
                  </span>
                </div>
                {prd.description && <p className="text-nq-aux text-nq-muted line-clamp-2">{prd.description}</p>}
                {!prd.origin_provenance && (
                  <p className="text-nq-caption text-nq-attention flex items-center gap-1.5">
                    <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Procedência ausente: o status PRONTO fica bloqueado.
                  </p>
                )}
                <details className="group rounded-xl bg-nq-raised/60" data-testid="product-manage">
                  <summary className="flex min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center justify-between gap-2 px-3 text-nq-aux font-medium text-nq-text">
                    Gerenciar produto
                    <ChevronDown aria-hidden="true" className="h-4 w-4 text-nq-subtle transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 px-3 pb-3 text-nq-aux">
                    <div className="space-y-0.5">
                      <div className="text-nq-caption text-nq-muted">Procedência</div>
                      {prd.origin_provenance ? (
                        <>
                          <div className="text-nq-text">
                            Origem: <span className="font-semibold">{prd.origin_provenance}</span>
                          </div>
                          <div className="text-nq-caption text-nq-muted">Evidência: {prd.origin_evidence}</div>
                        </>
                      ) : (
                        <div className="text-nq-caption text-nq-muted">Não informada.</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2" data-testid="product-brand">
                      <Tag aria-hidden="true" className="h-4 w-4 text-nq-subtle" />
                      {isAdmin ? (
                        <select
                          aria-label={`Marca de ${prd.name}`}
                          value={prd.brand_id || ''}
                          onChange={e => {
                            const b = brands.find(x => String(x.id) === e.target.value);
                            if (b) setBrandChange({ product: prd, brand: b });
                          }}
                          className="flex-1 rounded-xl bg-nq-bg px-3 py-2 text-nq-body text-nq-text min-h-[44px]"
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
                        <span className="text-nq-muted">{prd.brand_id ? brandName(prd.brand_id) || 'Marca definida' : 'Sem marca'}</span>
                      )}
                    </div>
                    {canEdit && (
                      <button onClick={() => onEditProduct(prd)} className="w-full px-4 rounded-full bg-nq-bg text-nq-text hover:brightness-125 font-semibold transition min-h-[44px]">
                        Editar produto (nome, situação e procedência)
                      </button>
                    )}
                    {isAdmin && !isDemoView && (
                      <TrashAction kind="product" action={prd.status === 'ARQUIVADO' ? 'restore' : 'delete'} item={prd} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onDone={afterTrash} />
                    )}
                  </div>
                </details>
              </div>

              {brandChange && brandChange.product.id === prd.id && (
                <div role="dialog" aria-label="Confirmar marca" className="mx-4 mb-3 rounded-xl bg-nq-attention/10 p-3 text-nq-aux text-nq-attention space-y-2" data-testid="confirm-brand">
                  <p>
                    Ligar <strong>{prd.name}</strong> à marca <strong>{brandChange.brand.name}</strong>? Se a marca tiver o roteamento de pixel ligado, as vendas deste
                    produto passam a ser contadas no pixel dela.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={confirmBrand} className="px-3 py-1.5 rounded-full bg-nq-positive text-nq-on-positive font-bold min-h-[44px]">
                      Confirmar
                    </button>
                    <button onClick={() => setBrandChange(null)} className="px-4 rounded-full bg-nq-raised text-nq-text min-h-[44px]">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-nq-line/60">
                <button onClick={() => toggleClaims(String(prd.id))} className="flex items-center gap-1 px-4 py-2 text-nq-aux font-semibold text-nq-text min-h-[44px]" data-testid="toggle-claims">
                  {openClaims.has(String(prd.id)) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Promessas
                </button>
                {openClaims.has(String(prd.id)) && (
                  <ProductClaims product={prd} offers={offers} currentUser={currentUser} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />
                )}
              </div>

              <div className="border-t border-nq-line/60">
                <div className="flex items-center justify-between px-4 py-2">
                  <button onClick={() => toggle(String(prd.id))} className="flex items-center gap-1 text-nq-aux font-semibold text-nq-text min-h-[44px]" data-testid="toggle-offers">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Ofertas ({prdOffers.length})
                  </button>
                  {canEdit && (
                    <button onClick={() => onAddOffer(String(prd.id))} className="inline-flex items-center gap-1 text-nq-aux font-semibold text-nq-positive-text hover:brightness-110 min-h-[44px]" data-testid="add-offer">
                      <Plus className="h-3.5 w-3.5" /> Nova oferta
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className={viewMode === 'list' ? 'grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3' : 'grid gap-3 px-4 pb-4'} data-testid="product-offers">
                    {prdOffers.length === 0 && <p className="text-xs text-nq-subtle">Nenhuma oferta para este produto.</p>}
                    {prdOffers.map(off => (
                      <OfferCard key={off.id} off={off} canEdit={canEdit} isAdmin={isAdmin} onCheckout={onCheckout} onUpdateOfferStatus={onUpdateOfferStatus} onManageAssets={setAssetOffer} costs={isAdmin ? <OfferCosts off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} bumpConfig={isAdmin ? <OfferBumpConfig off={off} offers={offers} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} deliveryFiles={isAdmin ? <DeliveryFiles off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} editor={close => <OfferEditor off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onSaved={onProductsChanged} onClose={close} />} trash={offerTrash(off)} />
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
          <h3 className="text-xs font-semibold text-nq-muted">Ofertas de produtos fora desta lista</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orphanOffers.map(off => (
              <OfferCard key={off.id} off={off} canEdit={canEdit} isAdmin={isAdmin} onCheckout={onCheckout} onUpdateOfferStatus={onUpdateOfferStatus} onManageAssets={setAssetOffer} costs={isAdmin ? <OfferCosts off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} bumpConfig={isAdmin ? <OfferBumpConfig off={off} offers={offers} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} deliveryFiles={isAdmin ? <DeliveryFiles off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} /> : null} editor={close => <OfferEditor off={off} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onSaved={onProductsChanged} onClose={close} />} trash={offerTrash(off)} />
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
