import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Copy, Check, Clock, AlertCircle, CheckCircle2, Loader2, X, RefreshCw } from 'lucide-react';
import { PaymentStatusProps, PaymentInfo, PaymentStatusEnum } from './paymentTypes';
import { API_BASE } from '../../lib/api';
import { trackPurchase } from '../../services/metaPixel';

export const PaymentStatus: React.FC<PaymentStatusProps> = ({
  orderId,
  checkoutToken,
  amount,
  isDemo,
  initialPayment = null,
  onPaymentConfirmed,
  onClose,
  showError,
  showSuccess
}) => {
  const [payment, setPayment] = useState<PaymentInfo | null>(initialPayment);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(!initialPayment);
  const [status, setStatus] = useState<PaymentStatusEnum>(initialPayment?.status || 'PENDING');
  const [pollingActive, setPollingActive] = useState(!initialPayment || (initialPayment.status !== 'FAILED' && initialPayment.status !== 'EXPIRED' && initialPayment.status !== 'CONFIRMED' && initialPayment.status !== 'PAID'));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 1. Initial Pix payment creation if not supplied
  useEffect(() => {
    if (payment) return;

    const controller = new AbortController();

    const createPix = async () => {
      try {
        setLoading(true);
        const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `pix-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        const res = await fetch(`${API_BASE}/checkout/orders/${orderId}/pix`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-checkout-token': checkoutToken
          },
          body: JSON.stringify({ idempotency_key: idempotencyKey }),
          signal: controller.signal
        });

        const data = await res.json();

        if (!res.ok) {
          const safeMsg = data.error && typeof data.error === 'string'
            ? data.error
            : 'Não foi possível gerar o pagamento Pix.';
          throw new Error(safeMsg);
        }

        if (isMountedRef.current) {
          setPayment(data);
          setStatus(data.status || 'PENDING');
          if (data.status === 'CONFIRMED' || data.status === 'PAID') {
            if (onPaymentConfirmed) onPaymentConfirmed();
          } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
            setPollingActive(false);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Create Pix error:', err);
        if (isMountedRef.current) {
          setStatus('FAILED');
          setPollingActive(false);
          const safeErr = err.message || 'Não foi possível gerar o pagamento Pix.';
          setErrorMessage(safeErr);
          if (showError) {
            showError(safeErr);
          }
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    createPix();

    return () => {
      controller.abort();
    };
  }, [orderId, checkoutToken]);

  // 2. Status Polling strictly relying on backend authority
  useEffect(() => {
    if (!pollingActive || status === 'CONFIRMED' || status === 'PAID' || status === 'FAILED' || status === 'EXPIRED') {
      return;
    }

    const interval = setInterval(async () => {
      if (!isMountedRef.current) return;

      try {
        const res = await fetch(`${API_BASE}/orders/${orderId}`, {
          headers: {
            'Content-Type': 'application/json',
            'x-checkout-token': checkoutToken
          }
        });

        if (res.ok) {
          const orderData = await res.json();
          if (isMountedRef.current && orderData) {
            if (orderData.status === 'PAID') {
              setStatus(orderData.status);
              setPollingActive(false);

              if (!isDemo) {
                try {
                  trackPurchase({
                    orderId: orderData.id || orderId,
                    value: Number(parseFloat(String(orderData.total_amount || amount)) || Number(amount) || 0),
                    currency: 'BRL',
                    contentIds: orderData.items && orderData.items.length > 0
                      ? orderData.items.map((i: any) => i.offer_id || i.product_id || orderId)
                      : [orderId],
                    numItems: orderData.items && orderData.items.length > 0
                      ? orderData.items.reduce((acc: number, curr: any) => acc + (curr.quantity || 1), 0)
                      : 1
                  });
                } catch (_) {}
              }

              if (showSuccess) {
                showSuccess('Pagamento confirmado com sucesso!');
              }
              if (onPaymentConfirmed) {
                onPaymentConfirmed();
              }
            } else if (orderData.status === 'FAILED' || orderData.status === 'EXPIRED') {
              setStatus(orderData.status);
              setPollingActive(false);
            }
          }
        }
      } catch (pollErr) {
        console.warn('Payment polling network anomaly (retry will continue):', pollErr);
      }
    }, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [orderId, checkoutToken, status, pollingActive]);

  const handleCopyPix = () => {
    if (payment?.pix_copy_paste) {
      navigator.clipboard.writeText(payment.pix_copy_paste);
      setCopied(true);
      setTimeout(() => {
        if (isMountedRef.current) setCopied(false);
      }, 3000);
    }
  };

  const isConfirmed = status === 'CONFIRMED' || status === 'PAID';
  const isFailed = status === 'FAILED' || status === 'EXPIRED';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 text-sm shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg border ${
              isConfirmed
                ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                : isFailed
                ? 'bg-red-950/60 border-red-500/30 text-red-400'
                : 'bg-amber-950/60 border-amber-500/30 text-amber-400'
            }`}>
              {isConfirmed ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : isFailed ? (
                <AlertCircle className="h-5 w-5" />
              ) : (
                <QrCode className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold font-mono text-slate-100 uppercase tracking-wider">
                {isConfirmed ? 'Pagamento Aprovado' : isFailed ? 'Falha no Pagamento' : 'Aguardando Pagamento Pix'}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Pedido #{orderId.substring(0, 8)}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 font-mono text-xs">
            <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
            Gerando cobrança Pix autorizada...
          </div>
        ) : isConfirmed ? (
          /* Confirmed State */
          <div className="py-6 text-center space-y-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Check className="h-8 w-8 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-100">Transação Conciliada!</h4>
              <p className="text-xs text-slate-400 mt-1">
                O pagamento foi confirmado pelo gateway financeiro.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 font-mono text-xs text-slate-300">
              Valor: <span className="font-bold text-emerald-400">R${parseFloat(String(amount)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        ) : isFailed ? (
          /* Failed State */
          <div className="py-6 text-center space-y-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-100">Não foi possível gerar o pagamento Pix</h4>
              <p className="text-xs text-slate-400 mt-1">
                {errorMessage || 'O tempo limite para pagamento expirou ou a transação falhou pelo gateway financeiro.'}
              </p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 font-mono text-xs font-semibold transition"
              >
                Fechar
              </button>
            )}
          </div>
        ) : (
          /* Pending / Pix Presentation State */
          <div className="space-y-4">
            {/* Amount Banner */}
            <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-center">
              <div className="text-[10px] font-mono text-slate-500 uppercase">Valor Total a Pagar</div>
              <div className="text-2xl font-black font-mono text-emerald-400 mt-0.5">
                R${parseFloat(String(amount)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* QR Code / Pix Details */}
            <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Clock className="h-3.5 w-3.5" />
                  Status: PENDENTE
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <RefreshCw className="h-3 w-3 animate-spin text-emerald-500" />
                  Verificando em tempo real...
                </span>
              </div>

              {payment?.pix_copy_paste && (
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">
                    Código Pix Copia e Cola
                  </label>
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 break-all max-h-24 overflow-y-auto custom-scrollbar select-all">
                    {payment.pix_copy_paste}
                  </div>
                  <button
                    onClick={handleCopyPix}
                    className="mt-2 w-full py-2 px-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Código Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar Código Pix
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="text-center">
              <p className="text-[11px] text-slate-500 font-mono">
                Abra o app do seu banco, escolha Pix e escaneie ou cole o código acima.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
