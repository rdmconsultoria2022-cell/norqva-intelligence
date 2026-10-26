import React, { useState, useEffect, useRef } from 'react';
import { Download, AlertTriangle, Loader2, X, Sparkles, Mail, Heart, Smartphone, ShieldCheck, ArrowRight, FileSpreadsheet, FileText, CheckCircle2 } from 'lucide-react';
import { DigitalDeliveryProps, DeliveryTokenItem } from './deliveryTypes';
import { API_BASE } from '../../lib/api';
import { trackPurchase } from '../../services/metaPixel';
import { PostPurchaseOffer } from './PostPurchaseOffer';
import { isFreshName, FRESH_BUTTON_STYLE, isBordadoName, BORDADO_INFO } from '../../lib/productLook';


// NORQVA-0138: o bônus "Cardápio italiano de 4 semanas" tem capa e texto próprios na entrega
export const CARDAPIO_COVER = '/images/kit/capa_cardapio.jpg';
export function isCardapioTitle(title: string | null | undefined): boolean {
  // só o cardápio italiano (o Seca Barriga também tem "Cardápio ..." e usa outra tela)
  return /card[aá]pio italiano/i.test(String(title || ''));
}

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
  const [accessEmailSent, setAccessEmailSent] = useState(false);
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
          setAccessEmailSent(tokensData.accessEmailSent === true);
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
                // NORQVA-0032: com adicional, as duas ofertas (principal primeiro)
                contentIds: Array.isArray(fetchedOrder.offer_human_ids) && fetchedOrder.offer_human_ids.length ? fetchedOrder.offer_human_ids : [canonicalContentId],
                numItems: canonicalQuantity,
                pixelId: fetchedOrder.meta_pixel_id || null
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

  // NORQVA-0112: Seca Barriga (vários PDFs que não são livros de cozinha): visual 'fresh' e lista de materiais
  const isFresh = !isBolsoBlindado && isFreshName(orderData?.offer_name_snapshot);
  const freshTokens = isFresh
    ? [...tokens].sort((a, b) => String(a.assetTitle || '').localeCompare(String(b.assetTitle || ''), 'pt-BR', { numeric: true }))
    : tokens;

  // NORQVA-0061: livros da coleção vendidos separadamente têm título próprio no aviso de entrega
  const orderName = String(orderData?.offer_name_snapshot || '').trim();
  // NORQVA-0138: a Coleção Trattoria Completa (6 PDFs) não é o livro Trattoria em Casa
  const readyTitle = /^cole[cç][aã]o\b/i.test(orderName)
    ? `Sua ${orderName} está pronta!`
    : !orderName || /trattoria/i.test(orderName)
    ? 'Seu Trattoria em Casa está pronto!'
    : isBordadoName(orderName)
      ? (/^kit\b/i.test(orderName) ? `Seu ${orderName} está pronto!` : 'Seu Kit de Bordado está pronto!')
      : /^kit\b/i.test(orderName)
      ? `Seu ${orderName} está pronto!`
      : `Seu livro ${orderName} está pronto!`;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] antialiased">
      <div className={`border rounded-2xl max-w-lg w-full p-6 sm:p-8 text-sm shadow-2xl overflow-y-auto max-h-[92vh] custom-scrollbar font-sans ${
        isBolsoBlindado ? 'bg-slate-900 border-slate-700 text-slate-100' : isFresh ? 'bg-[#F7F8F4] border-[#E3E7DF] text-[#18211C]' : 'bg-[#FAF7F2] border-stone-200 text-stone-800'
      }`} data-look={isBolsoBlindado ? 'dark' : isFresh ? 'fresh' : 'light'}>
        
        {/* Header */}
        <div className={`flex items-center justify-between mb-6 pb-4 border-b ${
          isBolsoBlindado ? 'border-slate-800' : 'border-stone-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-md" style={isFresh ? FRESH_BUTTON_STYLE : undefined}>
              {isBolsoBlindado ? <ShieldCheck className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <div>
              <h3 className={`text-lg font-bold ${isBolsoBlindado ? 'text-white font-sans' : isFresh ? 'font-sans text-[#18211C]' : 'font-serif text-stone-900'}`}>
                {isBolsoBlindado 
                  ? 'Seu acesso ao Método Bolso Blindado está pronto!' 
                  : isFresh
                  ? 'Seus materiais estão prontos!'
                  : readyTitle}
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
            <Loader2 className={`h-8 w-8 animate-spin ${isBolsoBlindado || isFresh ? 'text-emerald-500' : 'text-[#B83B1E]'}`} />
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
                        target="_blank"
                        rel="noopener noreferrer"
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
        ) : isFresh ? (
          // ==========================================
          // NORQVA-0112: SECA BARRIGA (vários PDFs, visual 'fresh')
          // ==========================================
          <div className="space-y-5" data-testid="fresh-delivery">
            <div className="text-sm text-[#18211C] leading-relaxed">
              {freshTokens.length > 1
                ? <>Seus <strong>{freshTokens.length} materiais</strong> já estão liberados. Cada arquivo tem o seu botão: ele abre em uma nova aba e esta página continua aberta para você baixar o próximo.</>
                : <>Seu material já está liberado. Ele abre em uma nova aba.</>}
            </div>
            {freshTokens.length === 0 ? (
              <p className="text-sm text-[#5B665F]">Nenhum arquivo disponível para este pedido.</p>
            ) : (
              <div className="space-y-2.5">
                {freshTokens.map((item) => {
                  const isExhausted = item.status === 'EXHAUSTED' || (item.downloadCount !== undefined && item.maxDownloads !== undefined && item.downloadCount >= item.maxDownloads);
                  const isInactive = item.status === 'INACTIVE' || item.status === 'EXPIRED';
                  const isUsable = (!item.status || item.status === 'ACTIVE') && Boolean(item.rawToken) && !isExhausted && !isInactive;
                  return (
                    <div key={item.assetId} className="p-4 rounded-2xl bg-white border border-[#E3E7DF] shadow-sm flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-[#FDECE7] text-[#F0795B] flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#18211C] break-words">{item.assetTitle || 'Material em PDF'}</div>
                          <div className="text-xs text-[#5B665F]">
                            {isExhausted ? 'Limite de downloads atingido.' : isInactive ? 'Este arquivo não está mais disponível.' : 'PDF'}
                          </div>
                        </div>
                      </div>
                      {isUsable ? (
                        <a
                          href={`${API_BASE}/delivery/${item.rawToken}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Baixar ${item.assetTitle || 'arquivo'}`}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 no-underline shadow-md transition active:scale-95"
                          style={FRESH_BUTTON_STYLE}
                        >
                          <Download className="h-4 w-4" />
                          <span>Baixar</span>
                        </a>
                      ) : (
                        <span className="text-[11px] text-[#5B665F] shrink-0">Indisponível</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="p-4 rounded-xl bg-white border border-[#E3E7DF] space-y-2 text-xs text-[#5B665F]">
              <div className="flex items-center gap-2 font-semibold text-[#18211C]" data-testid={accessEmailSent ? 'access-email-sent' : 'access-email-pending'}>
                <Mail className="h-4 w-4 text-[#059669]" />
                <span>{accessEmailSent ? 'Link de acesso enviado para o seu e-mail' : 'Baixe agora e guarde os arquivos'}</span>
              </div>
              <p>
                {accessEmailSent
                  ? 'Também mandamos um link de acesso para o e-mail da compra. Se fechar esta página, é só abrir esse e-mail para baixar de novo.'
                  : 'Se fechar esta página, use "Recuperar acesso" na página da oferta com o e-mail da compra para receber um novo link.'}
              </p>
              <div className="pt-2 border-t border-[#E3E7DF] text-[11px]">
                Dúvidas ou suporte: <strong className="text-[#18211C]">suporte@norqva.com</strong>
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
              {tokens.length > 1 && tokens.some(t => isCardapioTitle(t.assetTitle))
                ? <>Seus <strong>{tokens.length - tokens.filter(t => isCardapioTitle(t.assetTitle)).length} livros e o bônus</strong> já estão disponíveis para leitura no celular, tablet ou computador. Cada arquivo tem o seu botão: ele abre em uma nova aba e esta página continua aberta para você baixar o próximo.</>
                : tokens.length > 1
                ? <>Seus <strong>{tokens.length} livros</strong> já estão disponíveis para leitura no celular, tablet ou computador. Cada livro tem o seu botão: o livro abre em uma nova aba e esta página continua aberta para você baixar o próximo.</>
                : <>O seu livro já está disponível para leitura no seu celular, tablet ou computador. Ele abre em uma nova aba.</>}
            </div>

            {/* Book Download Cards */}
            <div className="space-y-3">
              {tokens.map((item) => {
                const isExhausted = item.status === 'EXHAUSTED' || (item.downloadCount !== undefined && item.maxDownloads !== undefined && item.downloadCount >= item.maxDownloads);
                const isInactive = item.status === 'INACTIVE' || item.status === 'EXPIRED';
                const isUsable = (!item.status || item.status === 'ACTIVE') && Boolean(item.rawToken) && !isExhausted && !isInactive;
                // Capa e descrição de cada livro (o kit entrega mais de um)
                const isDolciBook = /dolci/i.test(item.assetTitle || '');
                // NORQVA-0061: Volumes III, IV e V
                const collection = /p[ãa]es/i.test(item.assetTitle || '') ? { key: 'paes', title: 'Pães & Fermentação Natural', info: '12 receitas • Pães italianos e fermento natural (PDF)' }
                  : /antipasti/i.test(item.assetTitle || '') ? { key: 'antipasti', title: 'Antipasti & Aperitivo', info: '12 receitas • Antepastos e aperitivo italiano (PDF)' }
                  : /risoto|polenta/i.test(item.assetTitle || '') ? { key: 'risotos', title: 'Risotos & Polentas', info: '12 receitas • Risotos e polentas (PDF)' }
                  : null;
                // NORQVA-0135: Kit de Bordado (pelo arquivo ou pelo nome do pedido)
                const isBordadoItem = isBordadoName(item.assetTitle) || (!isDolciBook && !collection && !/trattoria/i.test(item.assetTitle || '') && isBordadoName(orderName));
                // NORQVA-0138: bônus da Coleção Trattoria Completa (cardápio de 4 semanas)
                const isCardapio = isCardapioTitle(item.assetTitle);
                const bookCover = isCardapio ? CARDAPIO_COVER : isBordadoItem ? BORDADO_INFO.cover : collection ? `/images/livros/${collection.key}/capa.jpg` : isDolciBook ? '/images/kit/capa_dolci.jpg' : '/images/kit/capa_trat.jpg';
                const isTrattBook = /trattoria/i.test(item.assetTitle || '');
                const bookTitle = isCardapio ? (item.assetTitle || 'Cardápio italiano de 4 semanas') : isBordadoItem ? BORDADO_INFO.title : collection ? collection.title : isDolciBook ? 'Dolci della Nonna' : isTrattBook ? 'Trattoria em Casa' : (item.assetTitle || 'Trattoria em Casa');
                const bookInfo = isCardapio ? 'Bônus: 28 jantares com lista de compras' : isBordadoItem ? BORDADO_INFO.info : collection ? collection.info : isDolciBook ? 'Doces italianos da nonna (PDF)' : '28 receitas • Massas, molhos e pizzas italianas (PDF)';

                return (
                  <div
                    key={item.assetId}
                    className="p-5 rounded-2xl bg-white border border-stone-200/90 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
                      <div className="h-14 w-11 rounded-md overflow-hidden bg-stone-200 shrink-0 border border-stone-300 shadow-sm">
                        <img
                          src={bookCover}
                          alt={`Capa do livro ${bookTitle}`}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-serif font-bold text-stone-900 truncate">
                          {bookTitle}
                        </div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          {isExhausted
                            ? 'Limite de downloads atingido.'
                            : isInactive
                            ? 'Este arquivo não está mais disponível.'
                            : bookInfo}
                        </div>
                      </div>
                    </div>

                    {isUsable ? (
                      <a
                        href={`${API_BASE}/delivery/${item.rawToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
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

            {/* NORQVA-0075: oferta depois da compra (o servidor decide se aparece) */}
            {orderData?.post_purchase_offer && (
              <PostPurchaseOffer offer={orderData.post_purchase_offer} isDemo={isDemo} showError={showError} showSuccess={showSuccess} />
            )}

            {/* Email info & Support card */}
            <div className="p-4 rounded-xl bg-stone-100/90 border border-stone-200/80 space-y-2 text-xs text-stone-600">
              {accessEmailSent ? (
                <>
                  <div className="flex items-center gap-2 font-semibold text-stone-800" data-testid="access-email-sent">
                    <Mail className="h-4 w-4 text-[#B83B1E]" />
                    <span>Link de acesso enviado para o seu e-mail</span>
                  </div>
                  <p>
                    Também mandamos um link de acesso para o e-mail da compra. Se fechar esta página, é só abrir esse e-mail para baixar de novo.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 font-semibold text-stone-800" data-testid="access-email-pending">
                    <Mail className="h-4 w-4 text-[#B83B1E]" />
                    <span>Baixe agora e guarde o arquivo</span>
                  </div>
                  <p>
                    Se fechar esta página, use "Recuperar acesso" na página da oferta com o e-mail da compra para receber um novo link.
                  </p>
                </>
              )}
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
