import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { 
  ShieldCheck, 
  Zap, 
  Download, 
  Gift, 
  AlertCircle, 
  Loader2, 
  ArrowRight,
  Lock
} from 'lucide-react';
import { API_BASE } from '../../lib/api';
import { CheckoutView } from '../checkout/CheckoutView';
import { PaymentStatus } from '../payment/PaymentStatus';
import { DigitalDelivery } from '../delivery/DigitalDelivery';

export interface PublicOfferData {
  id: string;
  human_id: string;
  name: string;
  description: string;
  price: number;
  promotional_price: number | null;
  bonus: string | null;
  is_demo: boolean;
}

interface PublicOfferPageProps {
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

export const PublicOfferPage: React.FC<PublicOfferPageProps> = ({
  showError,
  showSuccess
}) => {
  const params = useParams<{ humanId?: string }>();
  const location = useLocation();
  
  // Extract humanId from route params or fallback to parsing pathname /p/:humanId
  const rawHumanId = params.humanId || location.pathname.replace(/^\/p\/?/, '').split('/')[0];
  const humanId = rawHumanId ? decodeURIComponent(rawHumanId).trim() : '';

  const [offer, setOffer] = useState<PublicOfferData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Commercial modal state flow
  const [showCheckout, setShowCheckout] = useState<boolean>(false);
  const [activePaymentOrder, setActivePaymentOrder] = useState<any | null>(null);
  const [activeDeliveryOrder, setActiveDeliveryOrder] = useState<any | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchOffer = async () => {
      if (!humanId) {
        setLoading(false);
        setFetchError('Identificador de oferta inválido.');
        return;
      }

      try {
        setLoading(true);
        setFetchError(null);
        const res = await fetch(`${API_BASE}/public/offers/${encodeURIComponent(humanId)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Oferta não encontrada ou indisponível.');
        }

        if (isMounted) {
          setOffer(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setFetchError(err.message || 'Não foi possível carregar os detalhes da oferta.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchOffer();

    return () => {
      isMounted = false;
    };
  }, [humanId]);

  const activePrice = offer
    ? (offer.promotional_price !== null && offer.promotional_price !== undefined
        ? offer.promotional_price
        : offer.price)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 font-mono">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          <p className="text-sm text-slate-400">Carregando detalhes da oferta...</p>
        </div>
      </div>
    );
  }

  if (fetchError || !offer) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 font-mono">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4 shadow-2xl">
          <div className="h-12 w-12 rounded-full bg-red-950/60 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-200">Oferta Indisponível</h2>
          <p className="text-sm text-slate-400">
            {fetchError || 'Esta oferta não está ativa ou não foi encontrada em nossos registros.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Top Brand Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-emerald-950 border border-emerald-500/40 flex items-center justify-center">
              <Zap className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="font-mono font-black text-sm tracking-wider uppercase text-slate-200">
              NORQVA
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-500/20">
            <Lock className="h-3 w-3" />
            <span>Checkout Seguro</span>
          </div>
        </div>
      </header>

      {/* Main Hero & Offer Presentation */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-center">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-10 shadow-2xl backdrop-blur-sm space-y-8">
          
          {/* Badge & Human ID */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-4">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded">
              Oferta Oficial
            </span>
            <span className="text-xs font-mono text-slate-500">
              Ref: {offer.human_id}
            </span>
          </div>

          {/* Offer Title & Description */}
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight leading-tight">
              {offer.name}
            </h1>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed whitespace-pre-line font-sans">
              {offer.description}
            </p>
          </div>

          {/* Bonus Highlight (if present) */}
          {offer.bonus && (
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-start gap-3.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400 mt-0.5">
                <Gift className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400 block">
                  Bônus Exclusivo Incluso
                </span>
                <p className="text-xs sm:text-sm text-slate-300">
                  {offer.bonus}
                </p>
              </div>
            </div>
          )}

          {/* Price & Value Proposition Card */}
          <div className="p-6 rounded-xl bg-slate-950 border border-slate-850 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-[11px] font-mono uppercase text-slate-500 block">
                Valor Total do Investimento
              </span>
              <div className="flex items-baseline gap-3 justify-center sm:justify-start">
                {offer.promotional_price !== null && offer.promotional_price !== undefined && offer.promotional_price < offer.price && (
                  <span className="text-base sm:text-lg font-mono text-slate-500 line-through">
                    R$ {offer.price.toFixed(2).replace('.', ',')}
                  </span>
                )}
                <span className="text-3xl sm:text-4xl font-black font-mono text-emerald-400">
                  R$ {activePrice.toFixed(2).replace('.', ',')}
                </span>
              </div>
              {offer.promotional_price !== null && offer.promotional_price !== undefined && offer.promotional_price < offer.price && (
                <span className="inline-block text-[10px] font-mono font-bold text-amber-400 uppercase bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
                  Preço Especial por Tempo Limitado
                </span>
              )}
            </div>

            <button
              onClick={() => setShowCheckout(true)}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-sm tracking-wide uppercase transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center justify-center gap-2 shrink-0 group active:scale-95"
            >
              <span>Comprar com Pix</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          {/* Trust Guarantees */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950/50 p-2.5 rounded-lg border border-slate-850">
              <Zap className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Pix Instantâneo</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950/50 p-2.5 rounded-lg border border-slate-850">
              <Download className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Entrega Imediata</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950/50 p-2.5 rounded-lg border border-slate-850">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Garantia de Entrega</span>
            </div>
          </div>

        </div>
      </main>

      {/* Public Footer */}
      <footer className="border-t border-slate-800/60 py-6 text-center text-xs font-mono text-slate-500">
        <p>© {new Date().getFullYear()} NORQVA Intelligence. Todos os direitos reservados.</p>
      </footer>

      {/* Step 1: Checkout Form Modal */}
      {showCheckout && (
        <CheckoutView
          offer={{
            id: offer.id,
            human_id: offer.human_id,
            name: offer.name,
            price: offer.price,
            promotional_price: offer.promotional_price !== null ? offer.promotional_price : undefined,
            bonus: offer.bonus !== null ? offer.bonus : undefined,
            description: offer.description
          }}
          isDemo={offer.is_demo}
          currentUser={null}
          onOrderCreated={(orderResult) => {
            setShowCheckout(false);
            setActivePaymentOrder(orderResult);
          }}
          onCancel={() => setShowCheckout(false)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}

      {/* Step 2: Payment / Pix Modal */}
      {activePaymentOrder && (
        <PaymentStatus
          orderId={activePaymentOrder.id}
          checkoutToken={activePaymentOrder.checkout_token || ''}
          amount={activePaymentOrder.total_amount}
          isDemo={offer.is_demo}
          onPaymentConfirmed={() => {
            const confirmedOrder = activePaymentOrder;
            setActivePaymentOrder(null);
            setActiveDeliveryOrder(confirmedOrder);
          }}
          onClose={() => setActivePaymentOrder(null)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}

      {/* Step 3: Digital Delivery Modal */}
      {activeDeliveryOrder && (
        <DigitalDelivery
          orderId={activeDeliveryOrder.id}
          checkoutToken={activeDeliveryOrder.checkout_token || ''}
          isDemo={offer.is_demo}
          onClose={() => setActiveDeliveryOrder(null)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}
    </div>
  );
};
