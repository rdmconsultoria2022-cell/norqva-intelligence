import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, User, Mail, Phone, FileText, Loader2, X, Lock, AlertCircle, CreditCard, QrCode } from 'lucide-react';
import { CheckoutViewProps, CheckoutOrderResult } from './checkoutTypes';
import { apiFetch, API_BASE } from '../../lib/api';
import { trackInitiateCheckout } from '../../services/metaPixel';
import { getAttributionContext, sendFunnelEvent } from '../../services/attribution';
import { validateCpf, maskCpf, validateFullName, validateEmail, maskPhone } from './checkoutValidation';
import { savePurchaseSession } from '../../services/purchaseSession';
import { installmentOptions, brlCents, rateLabel } from '../../lib/cardInstallments';
import { SALE_BOOK_INFO, SALE_BOOK_ORDER, FULL_KIT_RECIPES, isFullKit, toSaleBooks } from './collectionChoice';
import type { CollectionSaleBook, CheckoutOffer } from './checkoutTypes';
import { ExitOfferScreen } from './ExitOfferScreen';

type CheckoutFormProps = CheckoutViewProps & { onBack?: () => void };

const CheckoutForm: React.FC<CheckoutFormProps> = ({
  offer,
  isDemo,
  currentUser = null,
  initialCustomer = null,
  onCustomerChange,
  onOrderCreated,
  onCancel,
  onBack,
  showError,
  showSuccess,
  collectionBooks
}) => {
  const [customerName, setCustomerName] = useState(initialCustomer?.name || currentUser?.name || '');
  const [customerEmail, setCustomerEmail] = useState(initialCustomer?.email || currentUser?.email || '');
  const [customerPhone, setCustomerPhone] = useState(initialCustomer?.phone ? maskPhone(initialCustomer.phone) : '');
  const [cpfCnpj, setCpfCnpj] = useState(initialCustomer?.cpf_cnpj ? maskCpf(initialCustomer.cpf_cnpj) : '');
  const [quantity, setQuantity] = useState(1);
  // NORQVA-0032: adicional nasce desmarcado; só entra se a pessoa marcar
  const [withBump, setWithBump] = useState(false);
  // NORQVA-0064: o kit de 5 livros vendido por qualquer página (/p/, /kit/) busca os livros avulsos sozinho
  const [fetchedBooks, setFetchedBooks] = useState<CollectionSaleBook[] | null>(null);
  const offerIsFullKit = isFullKit(offer);
  useEffect(() => {
    if (collectionBooks !== undefined || !offerIsFullKit) return;
    let alive = true;
    fetch(`${API_BASE}/public/collection`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (alive && data) setFetchedBooks(toSaleBooks(data.books));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [collectionBooks, offerIsFullKit]);
  // NORQVA-0063: na página do kit, a pessoa escolhe o kit completo (padrão) ou livros avulsos
  const saleBooks = (collectionBooks ?? (offerIsFullKit ? fetchedBooks : null) ?? [])
    .filter(b => b && b.offer_id && b.human_id && Number(b.price) > 0 && SALE_BOOK_INFO[b.book])
    .sort((a, b) => SALE_BOOK_ORDER.indexOf(a.book) - SALE_BOOK_ORDER.indexOf(b.book));
  const hasChoice = saleBooks.length > 0;
  const [buyMode, setBuyMode] = useState<'kit' | 'avulso'>('kit');
  const [picked, setPicked] = useState<string[]>([]);
  const avulso = hasChoice && buyMode === 'avulso';
  const chosen = saleBooks.filter(b => picked.includes(b.book));
  const mainBook = avulso ? chosen[0] || null : null;
  const avulsoCents = chosen.reduce((acc, b) => acc + Math.round(Number(b.price) * 100), 0);
  const togglePick = (key: string) => setPicked(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  const fullKit = isFullKit(offer);
  // NORQVA-0038: Pix ou cartão (cartão só aparece se a oferta aceitar; nos avulsos, vale o cartão do primeiro livro)
  const card = avulso
    ? (mainBook?.card && Number(mainBook.card.total) > 0 ? mainBook.card : null)
    : (offer.card && Number(offer.card.total) > 0 ? offer.card : null);
  const [payMethod, setPayMethod] = useState<'PIX' | 'CREDIT_CARD'>('PIX');
  const method = card ? payMethod : 'PIX';
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field touch state for inline error display
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    cpf: false,
    phone: false
  });

  const isSubmittingRef = useRef(false);

  const basePrice = offer.promotional_price !== null && offer.promotional_price !== undefined
    ? parseFloat(String(offer.promotional_price))
    : parseFloat(String(offer.price));
  const bump = !avulso && offer.bump && Number(offer.bump.price) > 0 ? offer.bump : null;
  const bumpPrice = bump ? Number(bump.price) : 0;
  // Total mostrado ao comprador (o servidor recalcula e é o valor dele que vai para o Pix)
  const displayPrice = avulso
    ? avulsoCents / 100
    : Math.round((basePrice + (bump && withBump ? bumpPrice : 0)) * 100) / 100;
  const noBookChosen = avulso && chosen.length === 0;
  // NORQVA-0041: o comprador escolhe as parcelas (sem juros até o limite da oferta; acima, com juros)
  const fmt = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
  // Avulsos: cartão do primeiro livro + os outros pelo preço do Pix, nunca abaixo do total no Pix (igual ao servidor)
  const cardBaseCents = !card ? 0
    : avulso
      ? Math.max(Math.round(Number(card.total) * 100) + avulsoCents - Math.round(Number(mainBook?.price || 0) * 100), avulsoCents)
      : Math.round(Number(card.total) * 100) + (bump && withBump ? Math.round(bumpPrice * 100) : 0);
  const cardPlan = card ? (card.plan || { max: Math.max(1, Number(card.max_installments) || 1), free: Math.max(1, Number(card.max_installments) || 1), rate: 0 }) : null;
  const cardOpts = card && cardPlan ? installmentOptions(cardBaseCents, cardPlan) : [];
  const freeOpts = cardOpts.filter(o => !o.interest);
  const [chosenN, setChosenN] = useState<number | null>(null);
  const selectedOpt = cardOpts.find(o => o.n === chosenN) || freeOpts[freeOpts.length - 1] || cardOpts[0] || null;
  const cardTotalCents = selectedOpt ? selectedOpt.totalCents : cardBaseCents;
  const bestFree = freeOpts[freeOpts.length - 1];
  const cardLabel = !card || !bestFree ? ''
    : bestFree.n === 1 ? `R$ ${fmt(bestFree.totalCents)} no cartão`
    : bestFree.valueCents !== null ? `${bestFree.n}x de R$ ${fmt(bestFree.valueCents)} sem juros`
    : `em até ${bestFree.n}x sem juros (total R$ ${fmt(bestFree.totalCents)})`;
  const optLabel = (o: { n: number; valueCents: number | null; totalCents: number; interest: boolean }) =>
    o.interest
      ? `${o.n}x de ${brlCents(o.valueCents || 0)} com juros (total ${brlCents(o.totalCents)})`
      : o.n === 1
        ? `1x de ${brlCents(o.totalCents)} sem juros`
        : o.valueCents !== null
          ? `${o.n}x de ${brlCents(o.valueCents)} sem juros`
          : `${o.n}x sem juros (total ${brlCents(o.totalCents)})`;

  // Compute field validation errors
  const nameValid = validateFullName(customerName);
  const emailValid = validateEmail(customerEmail);
  const cpfValid = validateCpf(cpfCnpj);
  const phoneClean = customerPhone.replace(/\D/g, '');
  const phoneValid = phoneClean.length === 0 || phoneClean.length === 10 || phoneClean.length === 11;

  const isFormValid = nameValid && emailValid && cpfValid && phoneValid;

  const handleNameChange = (val: string) => {
    setCustomerName(val);
    onCustomerChange?.({ name: val, email: customerEmail, phone: customerPhone, cpf_cnpj: cpfCnpj });
  };

  const handleEmailChange = (val: string) => {
    setCustomerEmail(val);
    onCustomerChange?.({ name: customerName, email: val, phone: customerPhone, cpf_cnpj: cpfCnpj });
  };

  const handleCpfChange = (val: string) => {
    const masked = maskCpf(val);
    setCpfCnpj(masked);
    onCustomerChange?.({ name: customerName, email: customerEmail, phone: customerPhone, cpf_cnpj: masked });
  };

  const handlePhoneChange = (val: string) => {
    const masked = maskPhone(val);
    setCustomerPhone(masked);
    onCustomerChange?.({ name: customerName, email: customerEmail, phone: masked, cpf_cnpj: cpfCnpj });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setTouched({
      name: true,
      email: true,
      cpf: true,
      phone: true
    });

    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    if (avulso && !mainBook) {
      showError('Escolha pelo menos 1 livro.');
      return;
    }

    if (!nameValid) {
      showError('Informe seu nome completo (nome e sobrenome).');
      return;
    }

    const isBolso = Boolean(
      offer?.human_id?.toUpperCase().includes('BOLSO') ||
      offer?.name?.toLowerCase().includes('bolso')
    );

    if (!emailValid) {
      showError(isBolso ? 'Informe um e-mail válido para receber o acesso.' : 'Informe um e-mail válido para receber o livro digital.');
      return;
    }

    if (!cpfValid) {
      showError('Informe um CPF válido para continuar.');
      return;
    }

    if (!phoneValid) {
      showError('Informe um telefone válido com DDD (10 ou 11 dígitos).');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // 1. Create or register customer with normalized data
      const cleanCpf = cpfCnpj.replace(/\D/g, '');
      const cleanPhone = customerPhone.replace(/\D/g, '');

      const customerPayload = {
        name: customerName.trim(),
        email: customerEmail.trim().toLowerCase(),
        phone: cleanPhone || undefined,
        cpf_cnpj: cleanCpf,
        is_demo: isDemo
      };

      const customerRes = await apiFetch('/customers', {
        method: 'POST',
        body: JSON.stringify(customerPayload)
      }, isDemo ? 'demo' : 'real', currentUser);

      const customerId = customerRes?.id;
      if (!customerId) {
        throw new Error('Falha ao processar cadastro de cliente para o pedido.');
      }

      // 2. Extract Attribution Context
      const attrCtx = getAttributionContext();

      // 3. Create Order via authoritative server calculation
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `order-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const attributionMetadata = {
        ...(attrCtx.utm_term ? { utm_term: attrCtx.utm_term } : {}),
        ...(attrCtx.campaign_id ? { campaign_id: attrCtx.campaign_id } : {}),
        ...(attrCtx.adset_id ? { adset_id: attrCtx.adset_id } : {}),
        ...(attrCtx.ad_id ? { ad_id: attrCtx.ad_id } : {}),
        ...(attrCtx.placement ? { placement: attrCtx.placement } : {}),
        ...(attrCtx.site_source_name ? { site_source_name: attrCtx.site_source_name } : {})
      };

      // NORQVA-0063: avulsos = pedido do primeiro livro escolhido + os outros pelo código (o servidor confere e cobra)
      const extraCodes = avulso ? chosen.slice(1).map(b => b.human_id) : [];
      const orderPayload = {
        offer_id: avulso && mainBook ? mainBook.offer_id : offer.id,
        ...(bump && withBump ? { with_bump: true } : {}),
        ...(extraCodes.length > 0 ? { extra_offer_human_ids: extraCodes } : {}),
        customer_id: customerId,
        quantity: quantity,
        idempotency_key: idempotencyKey,
        visitor_id: attrCtx.visitor_id,
        session_id: attrCtx.session_id,
        fbclid: attrCtx.fbclid,
        fbc: attrCtx.fbc,
        fbp: attrCtx.fbp,
        event_source_url: typeof window !== 'undefined' ? window.location.href : null,
        utm_source: attrCtx.utm_source,
        utm_medium: attrCtx.utm_medium,
        utm_campaign: attrCtx.utm_campaign,
        utm_content: attrCtx.utm_content,
        attribution_metadata: Object.keys(attributionMetadata).length > 0 ? attributionMetadata : null
      };

      const orderResult: CheckoutOrderResult = await apiFetch('/checkout', {
        method: 'POST',
        body: JSON.stringify(orderPayload)
      }, isDemo ? 'demo' : 'real', currentUser);

      // Emit first-party CHECKOUT_STARTED telemetry event
      sendFunnelEvent('CHECKOUT_STARTED', (avulso && mainBook ? mainBook.human_id : offer.human_id) || offer.id, { quantity, total_amount: orderResult.total_amount }, isDemo);

      if (showSuccess) {
        showSuccess('Pedido gerado com sucesso!');
      }

      // Track InitiateCheckout on real order generation
      if (!isDemo && orderResult?.id) {
        try {
          trackInitiateCheckout({
            orderId: orderResult.id,
            value: parseFloat(String(orderResult.total_amount)) || displayPrice * quantity,
            currency: 'BRL',
            contentIds: avulso
              ? chosen.map(b => b.human_id)
              : [offer.human_id || offer.id, ...(bump && withBump ? [bump.offer_human_id] : [])],
            numItems: quantity,
            pixelId: (offer as any).meta_pixel_id || null
          });
        } catch (_) {
          // Fail-safe: pixel tracking must never interrupt checkout
        }
      }

      // Persist minimal non-PII purchase session for durable recovery
      if (orderResult.id && orderResult.checkout_token) {
        savePurchaseSession({
          orderId: orderResult.id,
          checkoutToken: orderResult.checkout_token,
          offerHumanId: (avulso && mainBook ? mainBook.human_id : offer.human_id) || 'OFF-000001',
          status: 'PENDING',
          offerName: avulso && mainBook ? chosen.map(b => SALE_BOOK_INFO[b.book].name).join(' + ') : offer.name
        });
      }

      onOrderCreated({ ...orderResult, payment_method: method, ...(method === 'CREDIT_CARD' && selectedOpt ? { installments: selectedOpt.n } : {}) });
    } catch (err: any) {
      console.error('Checkout error:', err);
      showError(err.message || 'Erro ao processar checkout.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-4 antialiased">
      <div className="bg-[#FAF7F2] border border-stone-200 rounded-2xl max-w-lg w-full p-6 sm:p-8 text-sm shadow-2xl overflow-y-auto max-h-[92vh] custom-scrollbar text-stone-800 font-sans">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-[#B83B1E] text-white shadow-md">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-serif font-bold text-stone-900">
                Checkout Seguro
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                {card ? 'Pix ou cartão • Liberação após a confirmação' : 'Liberação Imediata via Pix • Pagamento Único'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {hasChoice && (
          <div className="mb-6 space-y-3" data-testid="checkout-choice">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#B83B1E]">1. Escolha sua compra</div>
            {(() => {
              const kitCovers = fullKit ? SALE_BOOK_ORDER.map(k => SALE_BOOK_INFO[k].cover) : [SALE_BOOK_INFO.trattoria.cover, SALE_BOOK_INFO.dolci.cover];
              const fromPrice = offer.promotional_price !== null && offer.promotional_price !== undefined ? Number(offer.price) : null;
              const sumAll = saleBooks.length === 5 ? saleBooks.reduce((acc, b) => acc + Number(b.price), 0) : null;
              const strike = fullKit && sumAll !== null && sumAll > basePrice ? sumAll : fromPrice !== null && fromPrice > basePrice ? fromPrice : null;
              const saving = strike !== null ? strike - basePrice : 0;
              return (
                <button
                  type="button"
                  onClick={() => setBuyMode('kit')}
                  aria-pressed={!avulso}
                  disabled={isSubmitting}
                  data-testid="choice-kit"
                  className={`relative w-full text-left rounded-2xl bg-white p-4 pt-5 transition ${!avulso ? 'border-[2.5px] border-[#B83B1E]' : 'border border-stone-300'}`}
                >
                  <span className="absolute -top-2.5 left-4 rounded-full bg-[#2B3D2B] px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-white">MELHOR ESCOLHA</span>
                  <span className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#B83B1E]">
                      {!avulso && <span className="h-2.5 w-2.5 rounded-full bg-[#B83B1E]" />}
                    </span>
                    <span className="flex-1">
                      <span className="block font-serif text-base font-bold text-stone-900">
                        {fullKit ? 'Kit completo · 5 livros' : offer.name}
                      </span>
                      <span className="block text-sm text-stone-600">
                        {fullKit ? `${FULL_KIT_RECIPES} receitas italianas, da massa à sobremesa` : 'Trattoria em Casa + Dolci della Nonna'}
                      </span>
                    </span>
                  </span>
                  <span className="mt-3 flex items-end justify-between gap-3 pl-8">
                    <span className="flex">
                      {kitCovers.map((src, i) => (
                        <img key={src} src={src} alt="" className={`h-14 w-10 rounded-sm object-cover shadow ${i > 0 ? '-ml-3' : ''}`} onError={e => { (e.target as HTMLElement).style.display = 'none'; }} />
                      ))}
                    </span>
                    <span className="text-right">
                      {strike !== null && <span className="block text-sm text-stone-500 line-through">R$ {strike.toFixed(2).replace('.', ',')}</span>}
                      <span className="block font-serif text-2xl font-bold text-[#B83B1E]" data-testid="choice-kit-price">R$ {basePrice.toFixed(2).replace('.', ',')}</span>
                    </span>
                  </span>
                  {saving > 0.004 && (
                    <span className="mt-2 ml-8 inline-block rounded-lg bg-[#EEF3EA] px-3 py-1 text-sm font-bold text-[#2B3D2B]">
                      Você economiza R$ {saving.toFixed(2).replace('.', ',')}
                    </span>
                  )}
                </button>
              );
            })()}

            <button
              type="button"
              onClick={() => setBuyMode('avulso')}
              aria-pressed={avulso}
              disabled={isSubmitting}
              data-testid="choice-avulso"
              className={`w-full text-left rounded-2xl bg-white p-4 transition flex items-center gap-3 ${avulso ? 'border-[2.5px] border-[#B83B1E]' : 'border border-stone-300'}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#B83B1E]">
                {avulso && <span className="h-2.5 w-2.5 rounded-full bg-[#B83B1E]" />}
              </span>
              <span className="flex-1">
                <span className="block font-serif text-base font-bold text-stone-900">Escolher livros avulsos</span>
                <span className="block text-sm text-stone-600">
                  {(() => {
                    const prices = saleBooks.map(b => Number(b.price));
                    const min = Math.min(...prices);
                    const same = prices.every(p => Math.abs(p - min) < 0.005);
                    return `${same ? '' : 'a partir de '}R$ ${min.toFixed(2).replace('.', ',')} cada livro`;
                  })()}
                </span>
              </span>
            </button>

            {avulso && (
              <div className="space-y-2" data-testid="choice-books">
                {saleBooks.map(b => {
                  const info = SALE_BOOK_INFO[b.book];
                  const on = picked.includes(b.book);
                  return (
                    <label
                      key={b.book}
                      className={`flex min-h-[72px] cursor-pointer items-center gap-3 rounded-xl p-3 ${on ? 'border-2 border-[#B83B1E] bg-[#FFF6F1]' : 'border border-stone-300 bg-white'}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePick(b.book)}
                        disabled={isSubmitting}
                        data-testid={`choice-book-${b.book}`}
                        className="h-6 w-6 shrink-0 accent-[#B83B1E]"
                      />
                      <img src={info.cover} alt="" className="h-14 w-10 shrink-0 rounded-sm object-cover" onError={e => { (e.target as HTMLElement).style.display = 'none'; }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-stone-900">{info.name}</span>
                        <span className="block text-xs text-stone-600">{info.note}</span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-[#B83B1E]">R$ {Number(b.price).toFixed(2).replace('.', ',')}</span>
                    </label>
                  );
                })}
                {fullKit && chosen.length > 0 && chosen.length < 5 && (
                  <div className="space-y-2 rounded-xl border-[1.5px] border-dashed border-[#2B3D2B] bg-[#EEF3EA] p-3" data-testid="choice-nudge">
                    <p className="text-sm text-[#1F3F27]">
                      {basePrice > avulsoCents / 100
                        ? <><b>Por mais R$ {(basePrice - avulsoCents / 100).toFixed(2).replace('.', ',')},</b> você leva os 5 livros ({FULL_KIT_RECIPES} receitas) em vez de {chosen.length}.</>
                        : <><b>O kit sai mais barato.</b> Os 5 livros saem por R$ {basePrice.toFixed(2).replace('.', ',')}.</>}
                    </p>
                    <button
                      type="button"
                      onClick={() => setBuyMode('kit')}
                      disabled={isSubmitting}
                      className="min-h-[44px] rounded-lg bg-[#2B3D2B] px-4 text-sm font-bold text-white"
                    >
                      Trocar para o kit completo
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="pt-2 text-[11px] font-bold uppercase tracking-wider text-[#B83B1E]">2. Seus dados</div>
          </div>
        )}

        {/* Product Summary Card */}
        {!hasChoice && (() => {
          const isBolso = Boolean(
            offer.human_id?.toUpperCase().includes('BOLSO') ||
            offer.name?.toLowerCase().includes('bolso')
          );
          // Capa e descrição de acordo com o livro comprado
          const lname = String(offer.name || '').toLowerCase();
          const isKit = lname.includes('kit');
          const isDolci = !isKit && lname.includes('dolci');
          const covers = isKit
            ? (fullKit ? SALE_BOOK_ORDER.map(k => SALE_BOOK_INFO[k].cover) : ['/images/kit/capa_trat.jpg', '/images/kit/capa_dolci.jpg'])
            : [isDolci ? '/images/kit/capa_dolci.jpg' : '/images/kit/capa_trat.jpg'];
          const subtitle = isKit && fullKit ? `5 livros em PDF • ${FULL_KIT_RECIPES} receitas italianas`
            : isKit ? 'Trattoria em Casa + Dolci della Nonna • 2 livros em PDF'
            : isDolci ? 'Doces italianos da nonna • Livro em PDF'
            : '28 receitas italianas • Livro em PDF';
          return (
            <div className="p-4 rounded-xl bg-white border border-stone-200/90 mb-6 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {!isBolso && (
                    <div className="flex shrink-0" data-testid="checkout-covers">
                      {covers.map((src, i) => (
                        <div key={src} className={`h-14 w-10 rounded-sm overflow-hidden bg-stone-200 border border-stone-300 shadow-sm ${i > 0 ? '-ml-3' : ''}`}>
                          <img
                            src={src}
                            alt="Capa do livro"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#B83B1E] block">
                      {isBolso ? 'Método & Aplicativo Web' : isKit ? 'Kit de livros digitais' : 'Livro digital'}
                    </span>
                    <h4 className="text-sm font-serif font-bold text-stone-900 leading-tight">
                      {offer.name}
                    </h4>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {isBolso ? 'Acesso ao Web App + Planilha + Guia Prático' : subtitle}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-serif font-bold text-[#B83B1E]">
                    R${basePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Customer & Order Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Field 1: Nome Completo */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Nome Completo *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                <User className="h-4 w-4" />
              </div>
              <input
                type="text"
                required
                disabled={isSubmitting}
                value={customerName}
                onChange={(e) => handleNameChange(e.target.value)}
                onBlur={() => setTouched(prev => ({ ...prev, name: true }))}
                placeholder="Ex: João da Silva"
                className={`w-full pl-9 pr-3 py-2.5 bg-white border rounded-lg text-stone-800 text-sm focus:outline-none transition ${
                  touched.name && !nameValid
                    ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-400'
                    : 'border-stone-300 focus:border-[#B83B1E] focus:ring-1 focus:ring-[#B83B1E]'
                } disabled:opacity-50`}
              />
            </div>
            {touched.name && !nameValid && (
              <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 inline shrink-0" />
                Informe seu nome completo (nome e sobrenome).
              </p>
            )}
          </div>

          {/* Field 2: E-mail */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              E-mail de Contato *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="email"
                required
                disabled={isSubmitting}
                value={customerEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={() => setTouched(prev => ({ ...prev, email: true }))}
                placeholder="seuemail@empresa.com"
                className={`w-full pl-9 pr-3 py-2.5 bg-white border rounded-lg text-stone-800 text-sm focus:outline-none transition ${
                  touched.email && !emailValid
                    ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-400'
                    : 'border-stone-300 focus:border-[#B83B1E] focus:ring-1 focus:ring-[#B83B1E]'
                } disabled:opacity-50`}
              />
            </div>
            {touched.email && !emailValid ? (
              <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 inline shrink-0" />
                Informe um e-mail válido.
              </p>
            ) : (
              <span className="text-[11px] text-stone-500 mt-1 block">
                {offer.human_id?.toUpperCase().includes('BOLSO') || offer.name?.toLowerCase().includes('bolso')
                  ? 'Você receberá os links e dados de acesso neste e-mail.'
                  : hasChoice || Number(offer.delivery_files) > 1 || String(offer.name || '').toLowerCase().includes('kit')
                    ? 'Os livros em PDF chegam neste e-mail logo após o pagamento.'
                    : 'O livro em PDF chega neste e-mail logo após o pagamento.'}
              </span>
            )}
          </div>

          {/* Field 3: CPF (Permanently Visible & Required) */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              CPF *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                <FileText className="h-4 w-4" />
              </div>
              <input
                type="text"
                required
                disabled={isSubmitting}
                value={cpfCnpj}
                onChange={(e) => handleCpfChange(e.target.value)}
                onBlur={() => setTouched(prev => ({ ...prev, cpf: true }))}
                placeholder="000.000.000-00"
                maxLength={14}
                className={`w-full pl-9 pr-3 py-2.5 bg-white border rounded-lg text-stone-800 text-sm focus:outline-none transition ${
                  touched.cpf && !cpfValid
                    ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-400'
                    : 'border-stone-300 focus:border-[#B83B1E] focus:ring-1 focus:ring-[#B83B1E]'
                } disabled:opacity-50`}
              />
            </div>
            {touched.cpf && !cpfValid ? (
              <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 inline shrink-0" />
                Informe um CPF válido (11 dígitos).
              </p>
            ) : (
              <span className="text-[11px] text-stone-500 mt-1 block">
                {card ? 'Necessário para emitir a cobrança.' : 'O banco exige o CPF para gerar o Pix. Ele fica protegido e é apagado depois do pagamento.'}
              </span>
            )}
          </div>

          {/* Field 4: WhatsApp / Celular (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              WhatsApp / Celular <span className="text-stone-400 font-normal">(Opcional)</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                <Phone className="h-4 w-4" />
              </div>
              <input
                type="text"
                disabled={isSubmitting}
                value={customerPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                onBlur={() => setTouched(prev => ({ ...prev, phone: true }))}
                placeholder="(11) 99999-9999"
                maxLength={15}
                className={`w-full pl-9 pr-3 py-2.5 bg-white border rounded-lg text-stone-800 text-sm focus:outline-none transition ${
                  touched.phone && !phoneValid
                    ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-400'
                    : 'border-stone-300 focus:border-[#B83B1E] focus:ring-1 focus:ring-[#B83B1E]'
                } disabled:opacity-50`}
              />
            </div>
            {touched.phone && !phoneValid && (
              <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 inline shrink-0" />
                Informe um telefone válido com DDD (10 ou 11 dígitos).
              </p>
            )}
          </div>

          {bump && (
            <label
              className={`flex items-start gap-3 rounded-xl border-2 border-dashed p-4 cursor-pointer transition ${
                withBump ? 'border-[#2B3D2B] bg-[#EEF3EA]' : 'border-[#B83B1E]/60 bg-white'
              }`}
              data-testid="checkout-bump"
            >
              <input
                type="checkbox"
                checked={withBump}
                onChange={e => setWithBump(e.target.checked)}
                disabled={isSubmitting}
                aria-label={`Adicionar ${bump.name} por mais R$ ${bumpPrice.toFixed(2).replace('.', ',')}`}
                className="mt-1 h-6 w-6 shrink-0 accent-[#2B3D2B]"
              />
              <span className="space-y-1">
                <span className="block text-base font-bold text-stone-900">
                  Sim, quero levar também: {bump.name}
                </span>
                {bump.headline && <span className="block text-sm text-stone-700">{bump.headline}</span>}
                <span className="block text-base font-bold text-[#B83B1E]">+ R$ {bumpPrice.toFixed(2).replace('.', ',')} {card ? 'no mesmo pagamento' : 'no mesmo Pix'}</span>
                <span className="block text-xs text-stone-500">Opcional. Os dois arquivos chegam juntos depois do pagamento.</span>
              </span>
            </label>
          )}

          {card && (
            <fieldset className="space-y-2" data-testid="checkout-method">
              <legend className="block text-xs font-semibold text-stone-700 mb-1">Forma de pagamento</legend>
              <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${method === 'PIX' ? 'border-[#B83B1E] bg-white' : 'border-stone-300 bg-white/60'}`}>
                <input type="radio" name="pay-method" value="PIX" checked={method === 'PIX'} onChange={() => setPayMethod('PIX')} disabled={isSubmitting} className="h-4 w-4 accent-[#B83B1E]" />
                <QrCode className="h-4 w-4 text-stone-500" />
                <span className="flex-1 text-sm text-stone-800">Pix</span>
                <span className="text-sm font-bold text-stone-900">R$ {displayPrice.toFixed(2).replace('.', ',')}</span>
              </label>
              <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${method === 'CREDIT_CARD' ? 'border-[#B83B1E] bg-white' : 'border-stone-300 bg-white/60'}`}>
                <input type="radio" name="pay-method" value="CREDIT_CARD" checked={method === 'CREDIT_CARD'} onChange={() => setPayMethod('CREDIT_CARD')} disabled={isSubmitting} className="h-4 w-4 accent-[#B83B1E]" />
                <CreditCard className="h-4 w-4 text-stone-500" />
                <span className="flex-1 text-sm text-stone-800">Cartão de crédito</span>
                <span className="text-sm font-bold text-stone-900" data-testid="checkout-card-label">{cardLabel}</span>
              </label>
              {method === 'CREDIT_CARD' && cardOpts.length > 0 && (
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-stone-700" htmlFor="checkout-installments">Parcelas</label>
                  <select
                    id="checkout-installments"
                    data-testid="checkout-installments"
                    value={selectedOpt ? selectedOpt.n : ''}
                    onChange={e => setChosenN(Number(e.target.value))}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:border-[#B83B1E]"
                  >
                    {cardOpts.map(o => (
                      <option key={o.n} value={o.n}>{optLabel(o)}</option>
                    ))}
                  </select>
                  {selectedOpt?.interest && cardPlan && (
                    <span className="text-[11px] text-stone-600 block" data-testid="checkout-interest">
                      Juros de {rateLabel(cardPlan.rate)} (Tabela Price). À vista no cartão: {brlCents(cardBaseCents)}.
                    </span>
                  )}
                  <span className="text-[11px] text-stone-500 block">
                    Você digita o cartão na página segura do Asaas, nosso processador de pagamentos. Total no cartão: R$ {fmt(cardTotalCents)}.
                  </span>
                </div>
              )}
            </fieldset>
          )}

          <div className="pt-3 flex items-center justify-between border-t border-stone-200 text-xs text-stone-500">
            <span className="flex items-center gap-1.5 text-[#2B3D2B] font-medium">
              <ShieldCheck className="h-4 w-4 text-[#2B3D2B]" />
              Pagamento seguro
            </span>
            <span data-testid="checkout-total">Total: R$ {method === 'CREDIT_CARD' ? fmt(cardTotalCents) : displayPrice.toFixed(2).replace('.', ',')}</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onBack || onCancel}
              className="px-4 py-2.5 rounded-xl bg-stone-200 text-stone-700 hover:bg-stone-300 text-xs font-semibold disabled:opacity-50 transition"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || noBookChosen || (touched.cpf && !cpfValid) || (touched.name && !nameValid) || (touched.email && !emailValid)}
              aria-label={method === 'CREDIT_CARD' ? `Continuar para o cartão: ${cardLabel}` : `Pagar R$ ${displayPrice.toFixed(2).replace('.', ',')} com Pix — Gerar Pedido & Pagamento`}
              className={`px-6 py-3 rounded-xl text-white text-sm font-bold flex items-center gap-2 transition active:scale-95 ${
                isSubmitting || noBookChosen || (touched.cpf && !cpfValid) || (touched.name && !nameValid) || (touched.email && !emailValid)
                  ? 'bg-stone-400 cursor-not-allowed shadow-none'
                  : 'bg-[#B83B1E] hover:bg-[#8F2810] shadow-lg shadow-[#B83B1E]/20'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <span>{noBookChosen ? 'Escolha pelo menos 1 livro' : method === 'CREDIT_CARD' ? 'Continuar para o cartão' : `Pagar R$ ${displayPrice.toFixed(2).replace('.', ',')} com Pix`}</span>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

// NORQVA-0069: ofertas de saída. No botão Voltar do pagamento do kit, a pessoa vê uma proposta de preço menor (e, ao voltar
// de novo, outra ainda menor). O preço de cada proposta é de uma oferta real do sistema (o servidor cobra o valor dela),
// e a sequência aparece uma vez por navegador.
const SEEN_KEY = 'norqva.exitoffer.seen.v1';
const readSeen = () => {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
};

export const CheckoutView: React.FC<CheckoutViewProps> = props => {
  const [current, setCurrent] = useState<CheckoutOffer>(props.offer);
  const [exit, setExit] = useState<{ offer: CheckoutOffer; step: number } | null>(null);
  const [loadingExit, setLoadingExit] = useState(false);
  // vale para esta visita: decidido ao abrir (quem já viu as propostas em outra visita não vê de novo)
  const [enabled] = useState(() => !readSeen());
  const switched = current.id !== props.offer.id;

  const fetchExit = async (humanId: string): Promise<CheckoutOffer | null> => {
    try {
      const r = await fetch(`${API_BASE}/public/offers/${encodeURIComponent(humanId)}`);
      if (!r.ok) return null;
      return (await r.json()) as CheckoutOffer;
    } catch {
      return null;
    }
  };
  const priceOf = (o: CheckoutOffer) => Number(o.promotional_price ?? o.price);

  const showNext = async (from: CheckoutOffer, step: number) => {
    const next = enabled && !props.isDemo && from.exit_offer?.human_id ? from.exit_offer.human_id : null;
    if (!next) return props.onCancel();
    setLoadingExit(true);
    const offer = await fetchExit(next);
    setLoadingExit(false);
    if (!offer || !(priceOf(offer) > 0) || priceOf(offer) >= priceOf(from)) return props.onCancel();
    markSeen();
    setExit({ offer, step });
  };

  if (exit) {
    return (
      <ExitOfferScreen
        offer={exit.offer}
        step={exit.step}
        loading={loadingExit}
        onAccept={() => {
          setCurrent(exit.offer);
          setExit(null);
        }}
        onBack={() => showNext(exit.offer, exit.step + 1)}
      />
    );
  }
  return (
    <CheckoutForm
      key={current.id}
      {...props}
      offer={current}
      collectionBooks={switched ? [] : props.collectionBooks}
      onBack={() => {
        if (!enabled || props.isDemo || !current.exit_offer?.human_id) return props.onCancel();
        return showNext(current, switched ? 2 : 1);
      }}
    />
  );
};
