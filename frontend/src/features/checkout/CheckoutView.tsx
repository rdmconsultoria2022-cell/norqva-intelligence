import React, { useState, useRef } from 'react';
import { ShieldCheck, User, Mail, Phone, FileText, Loader2, X, Lock, CheckCircle2 } from 'lucide-react';
import { CheckoutViewProps, CheckoutOrderResult } from './checkoutTypes';
import { apiFetch } from '../../lib/api';
import { trackInitiateCheckout } from '../../services/metaPixel';
import { getAttributionContext, sendFunnelEvent } from '../../services/attribution';

export const CheckoutView: React.FC<CheckoutViewProps> = ({
  offer,
  isDemo,
  currentUser = null,
  onOrderCreated,
  onCancel,
  showError,
  showSuccess
}) => {
  const [customerName, setCustomerName] = useState(currentUser?.name || '');
  const [customerEmail, setCustomerEmail] = useState(currentUser?.email || '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSubmittingRef = useRef(false);

  const displayPrice = offer.promotional_price !== null && offer.promotional_price !== undefined
    ? parseFloat(String(offer.promotional_price))
    : parseFloat(String(offer.price));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      showError('Nome e e-mail são obrigatórios para receber o livro digital.');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // 1. Create or register customer
      const customerPayload = {
        name: customerName.trim(),
        email: customerEmail.trim().toLowerCase(),
        phone: customerPhone.trim() || undefined,
        cpf_cnpj: cpfCnpj.trim() || undefined,
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

      const orderPayload = {
        offer_id: offer.id,
        customer_id: customerId,
        quantity: quantity,
        idempotency_key: idempotencyKey,
        visitor_id: attrCtx.visitor_id,
        session_id: attrCtx.session_id,
        fbclid: attrCtx.fbclid,
        utm_source: attrCtx.utm_source,
        utm_medium: attrCtx.utm_medium,
        utm_campaign: attrCtx.utm_campaign,
        utm_content: attrCtx.utm_content
      };

      const orderResult: CheckoutOrderResult = await apiFetch('/checkout', {
        method: 'POST',
        body: JSON.stringify(orderPayload)
      }, isDemo ? 'demo' : 'real', currentUser);

      // Emit first-party CHECKOUT_STARTED telemetry event
      sendFunnelEvent('CHECKOUT_STARTED', offer.human_id || offer.id, { quantity, total_amount: orderResult.total_amount }, isDemo);

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
            contentIds: [offer.human_id || offer.id],
            numItems: quantity
          });
        } catch (_) {
          // Fail-safe: pixel tracking must never interrupt checkout
        }
      }

      onOrderCreated(orderResult);
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
                Liberação Imediata via Pix • Acesso Vitalício
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

        {/* Product Summary Card */}
        <div className="p-4 rounded-xl bg-white border border-stone-200/90 mb-6 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="h-14 w-11 rounded-md overflow-hidden bg-stone-900 shrink-0 border border-stone-300 shadow-sm">
                <img 
                  src="/images/trattoria/proto_01_capa_1788381677692.jpg" 
                  alt="Capa do Livro"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B83B1E] block">
                  Livro Digital Oficial
                </span>
                <h4 className="text-sm font-serif font-bold text-stone-900 leading-tight">
                  {offer.name}
                </h4>
                <p className="text-xs text-stone-500 mt-0.5">
                  28 Preparações • PDF de Alta Resolução
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-serif font-bold text-[#B83B1E]">
                R${displayPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* Customer & Order Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
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
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ex: João da Silva"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:border-[#B83B1E] focus:ring-1 focus:ring-[#B83B1E] disabled:opacity-50 transition"
              />
            </div>
          </div>

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
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="seuemail@empresa.com"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:border-[#B83B1E] focus:ring-1 focus:ring-[#B83B1E] disabled:opacity-50 transition"
              />
            </div>
            <span className="text-[11px] text-stone-500 mt-1 block">
              Você receberá seu e-book e os links de acesso permanente neste e-mail.
            </span>
          </div>

          {/* Subtle Disclosure Control for Optional Fields */}
          <div>
            <button
              type="button"
              onClick={() => setShowOptionalFields(!showOptionalFields)}
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1.5 transition py-1 focus:outline-none"
            >
              <span className="text-stone-400 font-mono text-sm leading-none">{showOptionalFields ? '−' : '+'}</span>
              <span>{showOptionalFields ? 'Ocultar dados opcionais' : 'Adicionar dados opcionais'}</span>
            </button>

            {showOptionalFields && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    WhatsApp / Telefone <span className="text-stone-400 font-normal">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                      <Phone className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      disabled={isSubmitting}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:border-[#B83B1E] disabled:opacity-50 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    CPF / CNPJ <span className="text-stone-400 font-normal">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      disabled={isSubmitting}
                      value={cpfCnpj}
                      onChange={(e) => setCpfCnpj(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:border-[#B83B1E] disabled:opacity-50 transition"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 flex items-center justify-between border-t border-stone-200 text-xs text-stone-500">
            <span className="flex items-center gap-1.5 text-[#2B3D2B] font-medium">
              <ShieldCheck className="h-4 w-4 text-[#2B3D2B]" />
              Pagamento seguro
            </span>
            <span>Total: R$ {displayPrice.toFixed(2).replace('.', ',')}</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl bg-stone-200 text-stone-700 hover:bg-stone-300 text-xs font-semibold disabled:opacity-50 transition"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              aria-label={`Pagar R$ ${displayPrice.toFixed(2).replace('.', ',')} com Pix — Gerar Pedido & Pagamento`}
              className="px-6 py-3 rounded-xl bg-[#B83B1E] text-white hover:bg-[#8F2810] text-sm font-bold flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-[#B83B1E]/20 transition active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <span>Pagar R$ {displayPrice.toFixed(2).replace('.', ',')} com Pix</span>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
