import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, ArrowLeft, ShieldCheck, Mail, BookOpen } from 'lucide-react';
import { API_BASE } from '../../lib/api';
import { DigitalDelivery } from './DigitalDelivery';
import { PaymentStatus } from '../payment/PaymentStatus';
import { getPurchaseSession, updatePurchaseSessionStatus, savePurchaseSession } from '../../services/purchaseSession';

interface OrderDeliveryViewProps {
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

export const OrderDeliveryView: React.FC<OrderDeliveryViewProps> = ({
  showError,
  showSuccess
}) => {
  const params = useParams<{ orderId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract orderId from route params or URL path (/pedido/:orderId/entrega or /pedido/:orderId)
  const pathParts = location.pathname.split('/').filter(Boolean);
  const rawOrderId = params.orderId || (pathParts[0] === 'pedido' ? pathParts[1] : '');
  const orderId = rawOrderId ? decodeURIComponent(rawOrderId).trim() : '';

  // Extract checkoutToken: 1. Hash (#token=...), 2. Query (?token=...), 3. LocalStorage
  const getHashToken = (): string => {
    const hash = window.location.hash || location.hash || '';
    const match = hash.match(/token=([a-f0-9_-]+)/i);
    return match ? match[1] : '';
  };

  const getQueryToken = (): string => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('token') || '';
  };

  const [checkoutToken, setCheckoutToken] = useState<string>(() => {
    const hashTok = getHashToken();
    if (hashTok) return hashTok;
    const queryTok = getQueryToken();
    if (queryTok) return queryTok;
    if (orderId) {
      const session = getPurchaseSession(orderId);
      if (session?.checkoutToken) return session.checkoutToken;
    }
    return '';
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [order, setOrder] = useState<any | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setFetchError('Identificador de pedido não informado.');
      return;
    }

    // Attempt token discovery if not set in initial state
    let activeToken = checkoutToken;
    if (!activeToken) {
      activeToken = getHashToken() || getQueryToken();
      if (!activeToken) {
        const session = getPurchaseSession(orderId);
        if (session?.checkoutToken) {
          activeToken = session.checkoutToken;
        }
      }
      if (activeToken) {
        setCheckoutToken(activeToken);
      }
    }

    if (!activeToken) {
      setLoading(false);
      setFetchError('Chave de acesso não localizada. Verifique o link de entrega completo recebido por e-mail.');
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const fetchOrderDetails = async () => {
      try {
        setLoading(true);
        setFetchError(null);

        const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
          headers: {
            'Content-Type': 'application/json',
            'x-checkout-token': activeToken
          },
          signal: controller.signal
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Não foi possível validar o acesso a este pedido.');
        }

        if (isMounted) {
          setOrder(data);
          // Persist verified session
          savePurchaseSession({
            orderId: data.id || orderId,
            checkoutToken: activeToken,
            offerHumanId: data.offer_human_id || data.offer_id || 'OFF-000001',
            status: data.status === 'PAID' ? 'PAID' : 'PENDING',
            offerName: data.offer_name_snapshot || 'Trattoria em Casa'
          });
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Order recovery fetch error:', err);
        if (isMounted) {
          setFetchError(err.message || 'Erro ao carregar dados do pedido.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchOrderDetails();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [orderId, checkoutToken]);

  // Handle return to offer
  const handleReturnToOffer = () => {
    const offerId = order?.offer_human_id || 'OFF-000001';
    navigate(`/p/${offerId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-4 text-stone-800 font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#B83B1E]" />
          <p className="text-sm text-stone-600 font-medium">Validando seu acesso e preparando a entrega digital...</p>
        </div>
      </div>
    );
  }

  if (fetchError || !order) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-4 text-stone-800 font-sans">
        <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 shadow-xl text-center space-y-4">
          <div className="h-12 w-12 mx-auto rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-serif font-bold text-stone-900">
            Acesso Não Encontrado
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            {fetchError || 'Não foi possível recuperar a entrega deste pedido.'}
          </p>
          <p className="text-[11px] text-stone-400">
            Caso você tenha efetuado a compra, utilize o link de acesso direto enviado para o seu e-mail cadastrado ou entre em contato com nosso suporte.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleReturnToOffer}
              className="flex-1 py-2.5 px-4 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar para a Página</span>
            </button>
            <a
              href="mailto:suporte@norqva.com"
              className="flex-1 py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 no-underline"
            >
              <Mail className="h-4 w-4" />
              <span>Suporte</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // If order is PAID -> Render DigitalDelivery
  if (order.status === 'PAID') {
    return (
      <div className="min-h-screen bg-[#FAF7F2] text-stone-800 font-sans">
        {/* Underlay confirmation view */}
        <div className="max-w-3xl mx-auto px-4 py-12 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Pedido Confirmado e Pago</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">
            Seu Acesso Digital
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 max-w-lg mx-auto">
            {order.offer_name_snapshot || 'Trattoria em Casa — Edição Digital'}
          </p>
        </div>

        {/* Autoritative Digital Delivery modal dialog */}
        <DigitalDelivery
          orderId={orderId}
          checkoutToken={checkoutToken}
          isDemo={order.is_demo}
          onClose={handleReturnToOffer}
          showError={showError}
          showSuccess={showSuccess}
        />
      </div>
    );
  }

  // If order is PENDING -> Render PaymentStatus in recovery/poll mode WITHOUT creating a new payment
  return (
    <div className="min-h-screen bg-[#FAF7F2] text-stone-800 font-sans p-4">
      <PaymentStatus
        orderId={orderId}
        checkoutToken={checkoutToken}
        amount={order.total_amount || 19.90}
        isDemo={order.is_demo}
        onPaymentConfirmed={() => {
          updatePurchaseSessionStatus(orderId, 'PAID');
          setOrder((prev: any) => ({ ...prev, status: 'PAID' }));
        }}
        onClose={handleReturnToOffer}
        onBackToCheckout={handleReturnToOffer}
        showError={showError}
        showSuccess={showSuccess}
      />
    </div>
  );
};
