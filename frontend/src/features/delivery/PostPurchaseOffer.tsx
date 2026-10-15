import React, { useState } from 'react';
import { BookOpen, Loader2, ArrowRight } from 'lucide-react';
import { API_BASE } from '../../lib/api';
import { CheckoutView } from '../checkout/CheckoutView';
import { PaymentStatus } from '../payment/PaymentStatus';
import { savePurchaseSession, updatePurchaseSessionStatus } from '../../services/purchaseSession';

// NORQVA-0075 (D-0075): oferta depois da compra, na tela de entrega.
// O preço cobrado é sempre o da oferta no servidor; aqui só mostramos o que o servidor mandou.

export interface PostPurchaseOfferData {
  human_id: string;
  name: string;
  price: number;
  books: string[];
}

const brl = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

export function bookCard(title: string): { title: string; cover: string } {
  if (/dolci/i.test(title)) return { title: 'Dolci della Nonna', cover: '/images/kit/capa_dolci.jpg' };
  if (/p[ãa]es/i.test(title)) return { title: 'Pães & Fermentação Natural', cover: '/images/livros/paes/capa.jpg' };
  if (/antipasti/i.test(title)) return { title: 'Antipasti & Aperitivo', cover: '/images/livros/antipasti/capa.jpg' };
  if (/risoto|polenta/i.test(title)) return { title: 'Risotos & Polentas', cover: '/images/livros/risotos/capa.jpg' };
  return { title, cover: '/images/kit/capa_trat.jpg' };
}

export const PostPurchaseOffer: React.FC<{
  offer: PostPurchaseOfferData;
  isDemo?: boolean;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}> = ({ offer, isDemo, showError, showSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [fullOffer, setFullOffer] = useState<any | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<any>(null);
  const [paymentOrder, setPaymentOrder] = useState<any | null>(null);

  const books = offer.books.map(bookCard);
  const perBook = books.length ? offer.price / books.length : offer.price;

  const open = async () => {
    if (fullOffer) {
      setShowCheckout(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/public/offers/${encodeURIComponent(offer.human_id)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) throw new Error(data?.error || 'Não foi possível abrir a oferta agora.');
      setFullOffer(data);
      setShowCheckout(true);
    } catch (err: any) {
      showError(err?.message || 'Não foi possível abrir a oferta agora.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="post-purchase-offer" className="p-5 rounded-2xl bg-white border-2 border-[#B83B1E]/40 shadow-md space-y-4">
      <div className="space-y-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#B83B1E]">Para quem comprou o Trattoria</div>
        <h4 className="text-lg font-serif font-bold text-stone-900 leading-snug">
          Complete a coleção: mais {books.length} livros por {brl(offer.price)}
        </h4>
        <p className="text-xs text-stone-600">
          Menos de {brl(Math.ceil(perBook * 100) / 100)} por livro. Entrega na hora, no mesmo formato.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {books.map(b => (
          <div key={b.title} className="space-y-1 text-center">
            <div className="aspect-[3/4] rounded-md overflow-hidden bg-stone-200 border border-stone-300 shadow-sm">
              <img src={b.cover} alt={`Capa do livro ${b.title}`} className="w-full h-full object-cover" onError={e => { (e.target as HTMLElement).style.display = 'none'; }} />
            </div>
            <div className="text-[10px] leading-tight text-stone-600">{b.title}</div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={open}
        disabled={loading}
        className="w-full py-3.5 px-4 rounded-xl bg-[#B83B1E] hover:bg-[#8F2810] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-md disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
        <span>Quero os {books.length} livros por {brl(offer.price)}</span>
        {!loading && <ArrowRight className="h-4 w-4" />}
      </button>

      {showCheckout && fullOffer && (
        <CheckoutView
          offer={fullOffer}
          isDemo={Boolean(isDemo || fullOffer.is_demo)}
          initialCustomer={customerDraft}
          onCustomerChange={setCustomerDraft}
          onOrderCreated={(order: any) => {
            setShowCheckout(false);
            if (order?.id && order?.checkout_token) {
              savePurchaseSession({
                orderId: order.id,
                checkoutToken: order.checkout_token,
                offerHumanId: offer.human_id,
                status: 'PENDING',
                offerName: offer.name
              });
            }
            setPaymentOrder(order);
          }}
          onCancel={() => setShowCheckout(false)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}

      {paymentOrder && (
        <PaymentStatus
          orderId={paymentOrder.id}
          checkoutToken={paymentOrder.checkout_token}
          amount={paymentOrder.total_amount || offer.price}
          paymentMethod={paymentOrder.payment_method === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX'}
          installments={paymentOrder.installments}
          look="light"
          isDemo={Boolean(isDemo || fullOffer?.is_demo)}
          onPaymentConfirmed={() => {
            updatePurchaseSessionStatus(paymentOrder.id, 'PAID');
            window.location.assign(`/pedido/${paymentOrder.id}/entrega#token=${paymentOrder.checkout_token}`);
          }}
          onBackToCheckout={() => {
            setPaymentOrder(null);
            setShowCheckout(true);
          }}
          onClose={() => setPaymentOrder(null)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}
    </div>
  );
};
