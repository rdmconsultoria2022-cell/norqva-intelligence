import React, { useState, useRef } from 'react';
import { ShieldCheck, User, Mail, Phone, FileText, Loader2, X, Lock, AlertCircle } from 'lucide-react';
import { CheckoutViewProps, CheckoutOrderResult } from './checkoutTypes';
import { apiFetch } from '../../lib/api';
import { trackInitiateCheckout } from '../../services/metaPixel';
import { getAttributionContext, sendFunnelEvent } from '../../services/attribution';
import { validateCpf, maskCpf, validateFullName, validateEmail, maskPhone } from './checkoutValidation';

export const CheckoutView: React.FC<CheckoutViewProps> = ({
  offer,
  isDemo,
  currentUser = null,
  initialCustomer = null,
  onCustomerChange,
  onOrderCreated,
  onCancel,
  showError,
  showSuccess
}) => {
  const [customerName, setCustomerName] = useState(initialCustomer?.name || currentUser?.name || '');
  const [customerEmail, setCustomerEmail] = useState(initialCustomer?.email || currentUser?.email || '');
  const [customerPhone, setCustomerPhone] = useState(initialCustomer?.phone ? maskPhone(initialCustomer.phone) : '');
  const [cpfCnpj, setCpfCnpj] = useState(initialCustomer?.cpf_cnpj ? maskCpf(initialCustomer.cpf_cnpj) : '');
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field touch state for inline error display
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    cpf: false,
    phone: false
  });

  const isSubmittingRef = useRef(false);

  const displayPrice = offer.promotional_price !== null && offer.promotional_price !== undefined
    ? parseFloat(String(offer.promotional_price))
    : parseFloat(String(offer.price));

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

    if (!nameValid) {
      showError('Informe seu nome completo (nome e sobrenome).');
      return;
    }

    if (!emailValid) {
      showError('Informe um e-mail válido para receber o livro digital.');
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
                Você receberá seu e-book e os links de acesso permanente neste e-mail.
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
                Necessário para emissão do Pix pelo Banco Central.
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
              disabled={isSubmitting || (touched.cpf && !cpfValid) || (touched.name && !nameValid) || (touched.email && !emailValid)}
              aria-label={`Pagar R$ ${displayPrice.toFixed(2).replace('.', ',')} com Pix — Gerar Pedido & Pagamento`}
              className={`px-6 py-3 rounded-xl text-white text-sm font-bold flex items-center gap-2 transition active:scale-95 ${
                isSubmitting || (touched.cpf && !cpfValid) || (touched.name && !nameValid) || (touched.email && !emailValid)
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
                <span>Pagar R$ {displayPrice.toFixed(2).replace('.', ',')} com Pix</span>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

