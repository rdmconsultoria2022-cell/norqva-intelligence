import React, { useState, useEffect, useRef } from 'react';
import { Download, AlertTriangle, Loader2, X, Sparkles, Mail, Heart, Smartphone, ShieldCheck, ArrowRight, FileSpreadsheet, FileText, CheckCircle2 } from 'lucide-react';
import { DigitalDeliveryProps, DeliveryTokenItem } from './deliveryTypes';
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
  const [orderData, setOrderData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchDeliveryData = async () => {
      try {
        setLoading(true);
        setFetchError(null);

        // Fetch tokens and order in parallel
        const [tokensRes, orderRes] = await Promise.all([
          fetch(`${API_BASE}/checkout/orders/${orderId}/delivery-tokens`, {
            headers: {
              'Content-Type': 'application/json',
              'x-checkout-token': checkoutToken
            },
            signal: controller.signal
          }),
          fetch(`${API_BASE}/orders/${orderId}`, {
            headers: {
              'Content-Type': 'application/json',
              'x-checkout-token': checkoutToken
            },
            signal: controller.signal
          })
        ]);

        const tokensData = await tokensRes.json();
        let fetchedOrder = null;
        if (orderRes && orderRes.ok) {
          try {
            fetchedOrder = await orderRes.json();
          } catch (_) {}
        }

        if (!tokensRes.ok) {
          throw new Error(tokensData.error || 'Falha ao resgatar tokens de entrega digital.');
        }

        if (isMountedRef.current) {
          setTokens(tokensData.deliveries || []);
          if (fetchedOrder) {
            setOrderData(fetchedOrder);
          }

          // Redundant observational Purchase tracking: executed strictly upon authoritative delivery authorization
          if (!isDemo && fetchedOrder && fetchedOrder.status === 'PAID') {
            try {
              const canonicalContentId = fetchedOrder.offer_human_id
                || fetchedOrder.offer_id
                || orderId;
              const canonicalQuantity = Number(fetchedOrder.quantity) || 1;

              trackPurchase({
                orderId: fetchedOrder.id || orderId,
                value: Number(parseFloat(String(fetchedOrder.total_amount)) || 0),
                currency: 'BRL',
                contentIds: [canonicalContentId],
                numItems: canonicalQuantity
              });
            } catch (trackErr) {
              // Fail-safe: pixel errors never interrupt digital delivery UI or asset downloads
              console.warn('[Meta Pixel]: Digital delivery Purchase tracking observer error:', trackErr);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Fetch delivery data error:', err);
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

    fetchDeliveryData();

    return () => {
      controller.abort();
    };
  }, [orderId, checkoutToken]);

  const isBolsoBlindado = Boolean(
    orderData?.offer_human_id?.toUpperCase().includes('BOLSO') ||
    orderData?.offer_name_snapshot?.toLowerCase().includes('bolso') ||
    tokens.some(t => t.assetTitle?.toLowerCase().includes('bolso'))
  );

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-4 antialiased">
      <div className={`border rounded-2xl max-w-lg w-full p-6 sm:p-8 text-sm shadow-2xl overflow-y-auto max-h-[92vh] custom-scrollbar font-sans ${
        isBolsoBlindado ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-[#FAF7F2] border-stone-200 text-stone-800'
      }`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between mb-6 pb-4 border-b ${
          isBolsoBlindado ? 'border-slate-800' : 'border-stone-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-md">
              {isBolsoBlindado ? <ShieldCheck className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <div>
              <h3 className={`text-lg font-bold ${isBolsoBlindado ? 'text-white font-sans' : 'font-serif text-stone-900'}`}>
                {isBolsoBlindado 
                  ? 'Seu acesso ao Método Bolso Blindado está pronto!' 
                  : 'Seu Trattoria em Casa está pronto!'}
              </h3>
              <p className={`text-xs font-medium ${isBolsoBlindado ? 'text-slate-400' : 'text-stone-500'}`}>
                Pagamento confirmado • Acesso Digital Liberado
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className={`p-1.5 rounded-full transition ${
                isBolsoBlindado 
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800' 
                  : 'text-stone-400 hover:text-stone-700 hover:bg-stone-200'
              }`}
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className={`py-12 flex flex-col items-center justify-center gap-3 text-xs ${
            isBolsoBlindado ? 'text-slate-400' : 'text-stone-600'
          }`}>
            <Loader2 className={`h-8 w-8 animate-spin ${isBolsoBlindado ? 'text-emerald-500' : 'text-[#B83B1E]'}`} />
            <p className="font-medium">Preparando seu acesso seguro...</p>
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
        ) : isBolsoBlindado ? (
          // ==========================================
          // BOLSO BLINDADO DELIVERY VIEW
          // ==========================================
          <div className="space-y-6">
            
            {/* Primary Web App Access Card */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-slate-800/90 border border-emerald-700/60 shadow-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Aplicativo Web Bolso Blindado</h4>
                  <p className="text-xs text-slate-300">Acesse pelo celular ou computador sem instalar nada.</p>
                </div>
              </div>

              <a
                href="/app/bolso-blindado/"
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-950/50 text-center no-underline cursor-pointer active:scale-98"
              >
                <span>ACESSAR BOLSO BLINDADO</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            {/* Step-by-Step Account Guidance */}
            <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2.5 text-xs text-slate-300">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Como acessar sua conta:</span>
              </div>
              <ol className="space-y-1.5 list-decimal list-inside text-[12px] text-slate-300 leading-relaxed">
                <li>Clique no botão <strong>ACESSAR BOLSO BLINDADO</strong> acima.</li>
                <li>Utilize o mesmo <strong>e-mail informado na compra</strong> ({orderData?.customer_email || 'seu e-mail'}).</li>
                <li>No primeiro acesso, crie sua senha segura para sincronizar seus dados na nuvem.</li>
              </ol>
            </div>

            {/* Supporting Downloads (if any tokens exist) */}
            {tokens.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Materiais de Apoio Inclusos:
                </div>
                {tokens.map((item) => {
                  const isExhausted = item.status === 'EXHAUSTED' || (item.downloadCount !== undefined && item.maxDownloads !== undefined && item.downloadCount >= item.maxDownloads);
                  const isInactive = item.status === 'INACTIVE' || item.status === 'EXPIRED';
                  const isUsable = (!item.status || item.status === 'ACTIVE') && Boolean(item.rawToken) && !isExhausted && !isInactive;

                  return (
                    <div
                      key={item.assetId}
                      className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-slate-700 text-emerald-400 flex items-center justify-center shrink-0">
                          {item.assetTitle?.toLowerCase().includes('planilha') ? <FileSpreadsheet className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {item.assetTitle || 'Material de Apoio'}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Download direto
                          </div>
                        </div>
                      </div>

                      {isUsable ? (
                        <a
                          href={`${API_BASE}/delivery/${item.rawToken}`}
                          aria-label="Baixar Arquivo"
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1.5 transition no-underline shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Baixar</span>
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-500 shrink-0">Indisponível</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Email notice & Support */}
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <Mail className="h-4 w-4 text-emerald-400" />
                <span>Instruções Enviadas por E-mail</span>
              </div>
              <p>
                Enviamos também as orientações de acesso para o seu e-mail cadastrado.
              </p>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Dúvidas ou suporte: <strong className="text-slate-300">suporte@norqva.com</strong></span>
                <span className="text-emerald-400 font-medium">NORQVA Intelligence</span>
              </div>
            </div>

          </div>
        ) : tokens.length === 0 ? (
          // ==========================================
          // TRATTORIA: NO TOKENS AVAILABLE
          // ==========================================
          <div className="py-8 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-full bg-stone-200 border border-stone-300 flex items-center justify-center text-stone-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-sm text-stone-700">
              Nenhum ativo digital disponível para este pedido.
            </p>
          </div>
        ) : (
          // ==========================================
          // TRATTORIA CULINARY DELIVERY VIEW (PRESERVED)
          // ==========================================
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
                            : '28 preparações • Massas, molhos e técnicas italianas (PDF • 39 páginas)'}
                        </div>
                      </div>
                    </div>

                    {isUsable ? (
                      <a
                        href={`${API_BASE}/delivery/${item.rawToken}`}
                        aria-label="Baixar Arquivo"
                        className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shrink-0 transition active:scale-95 shadow-md bg-[#B83B1E] text-white hover:bg-[#8F2810] shadow-[#B83B1E]/20 text-center no-underline cursor-pointer"
                      >
                        <Download className="h-4 w-4" />
                        <span>BAIXAR MEU LIVRO (PDF)</span>
                      </a>
                    ) : (
                      <button
                        disabled
                        className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shrink-0 bg-stone-200 text-stone-400 cursor-not-allowed"
                      >
                        {isExhausted ? (
                          <span>Limite Atingido</span>
                        ) : (
                          <span>Indisponível</span>
                        )}
                      </button>
                    )}
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
