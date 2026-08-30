import React, { useState, useEffect, useRef } from 'react';
import { Download, PackageCheck, FileCode, CheckCircle, AlertTriangle, Loader2, X } from 'lucide-react';
import { DigitalDeliveryProps, DeliveryTokenItem, DownloadResult } from './deliveryTypes';
import { API_BASE } from '../../lib/api';
import { trackPurchase } from '../../services/metaPixel';

export const DigitalDelivery: React.FC<DigitalDeliveryProps> = ({
  orderId,
  checkoutToken,
  isDemo,
  onClose,
  showError,
  showSuccess
}) => {
  const [tokens, setTokens] = useState<DeliveryTokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<Record<string, string>>({});

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchTokens = async () => {
      try {
        setLoading(true);
        setFetchError(null);
        const res = await fetch(`${API_BASE}/checkout/orders/${orderId}/delivery-tokens`, {
          headers: {
            'Content-Type': 'application/json',
            'x-checkout-token': checkoutToken
          },
          signal: controller.signal
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Falha ao resgatar tokens de entrega digital.');
        }

        if (isMountedRef.current) {
          setTokens(data.deliveries || []);

          // Redundant observational Purchase tracking: executed strictly upon authoritative delivery authorization
          if (!isDemo) {
            try {
              const orderRes = await fetch(`${API_BASE}/orders/${orderId}`, {
                headers: {
                  'Content-Type': 'application/json',
                  'x-checkout-token': checkoutToken
                },
                signal: controller.signal
              });
              if (orderRes.ok) {
                const orderData = await orderRes.json();
                if (orderData && orderData.status === 'PAID') {
                  const canonicalContentId = orderData.offer_human_id
                    || orderData.offer_id
                    || orderId;
                  const canonicalQuantity = Number(orderData.quantity) || 1;

                  trackPurchase({
                    orderId: orderData.id || orderId,
                    value: Number(parseFloat(String(orderData.total_amount)) || 0),
                    currency: 'BRL',
                    contentIds: [canonicalContentId],
                    numItems: canonicalQuantity
                  });
                }
              }
            } catch (trackErr) {
              // Fail-safe: pixel errors never interrupt digital delivery UI or asset downloads
              console.warn('[Meta Pixel]: Digital delivery Purchase tracking observer error:', trackErr);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Fetch delivery tokens error:', err);
        if (isMountedRef.current) {
          setFetchError(err.message || 'Não foi possível preparar o download.');
          showError(err.message || 'Erro ao carregar arquivos para entrega.');
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    fetchTokens();

    return () => {
      controller.abort();
    };
  }, [orderId, checkoutToken]);

  const handleDownload = async (item: DeliveryTokenItem) => {
    if (downloadingId || !item.rawToken) return;

    setDownloadingId(item.assetId);

    try {
      // Request on-demand signed URL via secure backend token exchange
      const res = await fetch(`${API_BASE}/delivery/${item.rawToken}`);
      const data: DownloadResult = await res.json();

      if (!res.ok || !data.success || !data.download_url) {
        throw new Error(data.error || 'Limite de downloads excedido ou link expirado.');
      }

      if (isMountedRef.current) {
        setDownloadStatus(prev => ({
          ...prev,
          [item.assetId]: data.downloads_remaining !== undefined
            ? `Restam ${data.downloads_remaining} download(s)`
            : 'Download autorizado'
        }));
      }

      // Ephemeral trigger: initiate direct download without storing signed URL
      const link = document.createElement('a');
      link.href = data.download_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('download', '');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (showSuccess) {
        showSuccess('Download iniciado com sucesso!');
      }
    } catch (err: any) {
      console.error('Download error:', err);
      if (isMountedRef.current) {
        showError(err.message || 'Erro ao baixar arquivo digital.');
      }
    } finally {
      if (isMountedRef.current) {
        setDownloadingId(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 text-sm shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono text-slate-100 uppercase tracking-wider">
                Entrega Digital de Ativos
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Pedido #{orderId.substring(0, 8)} • Acesso Seguro
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

        {/* Content */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 font-mono text-xs">
            <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
            Validando direitos de acesso e gerando tokens...
          </div>
        ) : fetchError ? (
          <div className="py-8 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-xs text-red-400 font-mono">
              Não foi possível preparar o download.
            </p>
            <p className="text-[11px] text-slate-500 font-mono">{fetchError}</p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Nenhum ativo digital disponível para este pedido.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-slate-400 leading-relaxed">
              Seus produtos digitais estão liberados. Clique no botão correspondente para iniciar o download do pacote assinado.
            </div>

            <div className="space-y-3">
              {tokens.map((item) => {
                const isExhausted = item.status === 'EXHAUSTED' || (item.downloadCount !== undefined && item.maxDownloads !== undefined && item.downloadCount >= item.maxDownloads);
                const isInactive = item.status === 'INACTIVE' || item.status === 'EXPIRED';
                const isUsable = (!item.status || item.status === 'ACTIVE') && Boolean(item.rawToken) && !isExhausted && !isInactive;

                return (
                  <div
                    key={item.assetId}
                    className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded bg-slate-900 border border-slate-800 text-emerald-400 shrink-0">
                        <FileCode className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-200 truncate">
                          {item.assetTitle || `Ativo Digital #${item.assetId.substring(0, 8)}`}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {isExhausted
                            ? 'Limite de downloads atingido.'
                            : isInactive
                            ? 'Este ativo não está mais disponível.'
                            : downloadStatus[item.assetId] || 'Assinatura criptográfica válida'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDownload(item)}
                      disabled={!isUsable || downloadingId === item.assetId}
                      className={`px-3.5 py-2 rounded-md font-mono text-xs font-bold flex items-center gap-1.5 shrink-0 transition ${
                        isUsable
                          ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                          : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                      }`}
                    >
                      {downloadingId === item.assetId ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Baixando...
                        </>
                      ) : isExhausted ? (
                        'Limite Atingido'
                      ) : isInactive ? (
                        'Indisponível'
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          Baixar Arquivo
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-850 text-[11px] text-slate-500 font-mono flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
              Os links expiram temporariamente e não são armazenados no navegador.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
