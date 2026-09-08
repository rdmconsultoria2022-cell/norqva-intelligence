import React, { useState, useEffect, useRef } from 'react';
import { Download, CheckCircle2, AlertTriangle, Loader2, X, BookOpen, Sparkles, Mail, Heart } from 'lucide-react';
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
      const res = await fetch(`${API_BASE}/delivery/${item.rawToken}?format=json`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      const data: DownloadResult = await res.json();

      if (!res.ok || !data.success || !data.download_url) {
        throw new Error(data.error || 'Limite de downloads excedido ou link expirado.');
      }

      if (isMountedRef.current) {
        setDownloadStatus(prev => ({
          ...prev,
          [item.assetId]: data.downloads_remaining !== undefined
            ? `Download iniciado • Restam ${data.downloads_remaining} downloads`
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
        showSuccess('Download do e-book iniciado com sucesso!');
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
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-4 antialiased">
      <div className="bg-[#FAF7F2] border border-stone-200 rounded-2xl max-w-lg w-full p-6 sm:p-8 text-sm shadow-2xl overflow-y-auto max-h-[92vh] custom-scrollbar text-stone-800 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-emerald-600 text-white shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-serif font-bold text-stone-900">
                Seu Trattoria em Casa está pronto!
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                Parabéns pela compra • Acesso Digital Liberado
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-stone-600 text-xs">
            <Loader2 className="h-8 w-8 text-[#B83B1E] animate-spin" />
            <p className="font-medium">Preparando seu e-book para download seguro...</p>
          </div>
        ) : fetchError ? (
          <div className="py-8 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-full bg-red-100 border border-red-300 flex items-center justify-center text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-red-700">
              Não foi possível preparar o download.
            </p>
            <p className="text-xs text-stone-500">{fetchError}</p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-full bg-stone-200 border border-stone-300 flex items-center justify-center text-stone-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-sm text-stone-700">
              Nenhum ativo digital disponível para este pedido.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            
            <div className="text-sm text-stone-700 leading-relaxed">
              O seu guia prático com as <strong>28 preparações tradicionais</strong> foi gerado e já está disponível para leitura no seu celular, tablet ou computador.
            </div>

            {/* Book Download Cards */}
            <div className="space-y-3">
              {tokens.map((item) => {
                const isExhausted = item.status === 'EXHAUSTED' || (item.downloadCount !== undefined && item.maxDownloads !== undefined && item.downloadCount >= item.maxDownloads);
                const isInactive = item.status === 'INACTIVE' || item.status === 'EXPIRED';
                const isUsable = (!item.status || item.status === 'ACTIVE') && Boolean(item.rawToken) && !isExhausted && !isInactive;

                return (
                  <div
                    key={item.assetId}
                    className="p-5 rounded-2xl bg-white border border-stone-200/90 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
                      <div className="h-14 w-11 rounded-md overflow-hidden bg-stone-900 shrink-0 border border-stone-300 shadow-sm">
                        <img 
                          src="/images/trattoria/proto_01_capa_1788381677692.jpg" 
                          alt="Capa do Livro"
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-serif font-bold text-stone-900 truncate">
                          {item.assetTitle || 'Trattoria em Casa — Edição Digital (PDF)'}
                        </div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          {isExhausted
                            ? 'Limite de downloads atingido.'
                            : isInactive
                            ? 'Este arquivo não está mais disponível.'
                            : downloadStatus[item.assetId] || '28 preparações • Massas, molhos e técnicas italianas (PDF • 39 páginas)'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDownload(item)}
                      disabled={!isUsable || downloadingId === item.assetId}
                      {...(isUsable && !downloadingId ? { 'aria-label': 'Baixar Arquivo' } : {})}
                      className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shrink-0 transition active:scale-95 shadow-md ${
                        isUsable
                          ? 'bg-[#B83B1E] text-white hover:bg-[#8F2810] shadow-[#B83B1E]/20'
                          : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                      }`}
                    >
                      {downloadingId === item.assetId ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Baixando...</span>
                        </>
                      ) : isExhausted ? (
                        <span>Limite Atingido</span>
                      ) : isInactive ? (
                        <span>Indisponível</span>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          <span>BAIXAR MEU LIVRO (PDF)</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Email info & Support card */}
            <div className="p-4 rounded-xl bg-stone-100/90 border border-stone-200/80 space-y-2 text-xs text-stone-600">
              <div className="flex items-center gap-2 font-semibold text-stone-800">
                <Mail className="h-4 w-4 text-[#B83B1E]" />
                <span>Cópia de Acesso Permanente Enviada</span>
              </div>
              <p>
                Enviamos também os links diretos para o seu e-mail cadastrado, garantindo que você nunca perca o acesso ao seu exemplar.
              </p>
              <div className="pt-2 border-t border-stone-200 text-[11px] text-stone-500 flex items-center justify-between">
                <span>Dúvidas ou suporte: <strong>suporte@norqva.com</strong></span>
                <span className="flex items-center gap-1 text-[#B83B1E]"><Heart className="h-3 w-3 fill-current" /> Bom apetite!</span>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
