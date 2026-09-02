import React, { useState, useRef } from 'react';
import { ShoppingCart, ShieldCheck, User, Mail, Phone, FileText, Loader2, X } from 'lucide-react';
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
      showError('Nome e e-mail são obrigatórios para checkout.');
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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 text-sm shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono text-slate-100 uppercase tracking-wider">
                Checkout Seguro
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {isDemo ? 'Ambiente DEMO (Simulação RBAC)' : 'Ambiente REAL (Produção)'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Offer Summary Card */}
        <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 mb-5 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                {offer.human_id || 'OFERTA'}
              </span>
              <h4 className="text-sm font-bold text-slate-200 mt-0.5">{offer.name}</h4>
              {offer.product_name && (
                <div className="text-[11px] text-slate-400 font-mono">Produto: {offer.product_name}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-lg font-black font-mono text-emerald-400">
                R${displayPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              {offer.promotional_price !== null && offer.promotional_price !== undefined && (
                <div className="text-[10px] line-through text-slate-500 font-mono">
                  R${parseFloat(String(offer.price)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
          </div>

          {offer.description && (
            <p className="text-xs text-slate-400 leading-relaxed pt-1 border-t border-slate-900">
              {offer.description}
            </p>
          )}

          {offer.bonus && (
            <div className="text-[11px] font-mono text-emerald-400/90 pt-1">
              🎁 <span className="font-semibold">Bônus:</span> {offer.bonus}
            </div>
          )}
        </div>

        {/* Customer & Order Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase text-slate-400 mb-1">
              Nome Completo *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <User className="h-4 w-4" />
              </div>
              <input
                type="text"
                required
                disabled={isSubmitting}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ex: João da Silva"
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-slate-400 mb-1">
              E-mail de Contato *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="email"
                required
                disabled={isSubmitting}
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="seuemail@empresa.com"
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono uppercase text-slate-400 mb-1">
                Telefone / WhatsApp
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Phone className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-slate-400 mb-1">
                CPF / CNPJ
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <FileText className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-800 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Preço e estoque autorizados pelo servidor
            </span>
            <span>Qtd: {quantity}</span>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
              className="px-4 py-2 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 font-mono text-xs font-semibold disabled:opacity-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-md bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-mono text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 shadow-lg shadow-emerald-950/40 transition"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                'Gerar Pedido & Pagamento'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
