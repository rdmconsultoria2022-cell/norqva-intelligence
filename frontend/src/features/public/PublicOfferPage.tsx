import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  Sparkles, 
  Download, 
  AlertCircle, 
  Loader2, 
  ArrowRight, 
  Lock, 
  BookOpen, 
  ChefHat, 
  CheckCircle2, 
  Utensils, 
  Flame,
  Wallet,
  TrendingUp,
  BarChart3,
  PieChart,
  Smartphone,
  Check,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import { API_BASE } from '../../lib/api';
import { CheckoutView } from '../checkout/CheckoutView';
import { PaymentStatus } from '../payment/PaymentStatus';
import { DigitalDelivery } from '../delivery/DigitalDelivery';
import { RecoveryRequestModal } from '../delivery/RecoveryRequestModal';
import { captureUrlAttribution, sendFunnelEvent } from '../../services/attribution';
import { getPurchaseSessionByOffer, updatePurchaseSessionStatus, savePurchaseSession } from '../../services/purchaseSession';
import { trackViewContent } from '../../services/metaPixel';

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
  
  // Extract humanId from route params or fallback to parsing pathname /p/:humanId or /oferta/:humanId
  const rawHumanId = params.humanId || location.pathname.replace(/^\/(p|oferta)\/?/, '').split('/')[0];
  const humanId = rawHumanId ? decodeURIComponent(rawHumanId).trim() : '';

  const [offer, setOffer] = useState<PublicOfferData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [existingSession, setExistingSession] = useState<any | null>(null);

  // Commercial modal state flow
  const [showCheckout, setShowCheckout] = useState<boolean>(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState<boolean>(false);
  const [customerDraft, setCustomerDraft] = useState<any | null>(null);
  const [activePaymentOrder, setActivePaymentOrder] = useState<any | null>(null);
  const [activeDeliveryOrder, setActiveDeliveryOrder] = useState<any | null>(null);

  const navigate = useNavigate();

  const handleOpenCheckout = () => {
    if (existingSession && existingSession.status === 'PAID') {
      navigate(`/pedido/${existingSession.orderId}/entrega#token=${existingSession.checkoutToken}`);
      return;
    }
    if (offer) {
      sendFunnelEvent('CHECKOUT_MODAL_OPENED', offer.human_id || humanId, { offer_name: offer.name }, offer.is_demo);
    }
    setShowCheckout(true);
  };

  useEffect(() => {
    let isMounted = true;

    // Capture any incoming URL attribution params immediately
    captureUrlAttribution();

    // Check for existing purchase session for this offer
    if (humanId) {
      const session = getPurchaseSessionByOffer(humanId);
      if (session && session.status === 'PAID') {
        setExistingSession(session);
      }
    }

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
          // Emit first-party OFFER_VIEW telemetry event
          sendFunnelEvent('OFFER_VIEW', data.human_id || humanId, { offer_name: data.name }, data.is_demo);

          // Track Meta Pixel ViewContent event
          try {
            const rawPrice = data.promotional_price !== null && data.promotional_price !== undefined
              ? data.promotional_price
              : data.price;
            const offerPrice = Number(rawPrice);
            trackViewContent({
              contentName: data.name,
              contentIds: [data.human_id || humanId],
              contentType: 'product',
              value: !isNaN(offerPrice) && offerPrice >= 0 ? offerPrice : undefined,
              currency: 'BRL'
            });
          } catch (trackErr) {
            console.warn('[Meta Pixel]: ViewContent tracking observer error:', trackErr);
          }
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
    : 29.90;

  const isBolsoBlindado = Boolean(
    offer?.human_id?.toUpperCase().includes('BOLSO') || 
    offer?.name?.toLowerCase().includes('bolso') ||
    humanId.toUpperCase().includes('BOLSO')
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 text-slate-800 font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-slate-500 font-medium">Carregando detalhes da oferta...</p>
        </div>
      </div>
    );
  }

  if (fetchError || !offer) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 text-slate-800 font-sans">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <div className="h-12 w-12 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center mx-auto text-amber-700">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Oferta Indisponível</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {fetchError || 'Esta oferta não está ativa ou não foi encontrada em nossos registros.'}
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: BOLSO BLINDADO COMMERCIAL EXPERIENCE
  // ==========================================
  if (isBolsoBlindado) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col justify-between font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-300">
        
        {/* Existing Paid Purchase Notification Banner */}
        {existingSession && existingSession.status === 'PAID' && (
          <div className="bg-emerald-900/90 border-b border-emerald-700/50 text-white px-4 py-3 text-center text-xs font-medium flex flex-wrap items-center justify-center gap-3 shadow-md z-40 relative">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
              <Sparkles className="h-4 w-4" />
              <span>Acesso Confirmado</span>
            </div>
            <span>Você já garantiu seu acesso ao Método Bolso Blindado!</span>
            <button
              onClick={() => navigate(`/pedido/${existingSession.orderId}/entrega#token=${existingSession.checkoutToken}`)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase tracking-wider text-[11px] transition shadow flex items-center gap-1.5"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Acessar Meu Aplicativo</span>
            </button>
          </div>
        )}

        {/* Top Announcement Bar */}
        <div className="bg-slate-900/80 border-b border-slate-800 text-slate-300 text-[11px] sm:text-xs py-2 px-4 text-center font-medium tracking-wide flex items-center justify-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Método Bolso Blindado 2026 • Aplicativo Web + Planilha de Gestão + Guia Prático</span>
        </div>

        {/* Header */}
        <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 shadow-md">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-emerald-900/30 shrink-0">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div>
                <span className="font-bold text-sm sm:text-base tracking-tight text-white block leading-tight">
                  BOLSO BLINDADO
                </span>
                <span className="text-[9px] sm:text-[10px] tracking-widest text-emerald-400 uppercase font-semibold">
                  Inteligência Financeira Pessoal
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-300 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700 shadow-sm">
              <Lock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-400" />
              <span className="font-medium">Checkout Seguro Pix</span>
            </div>
          </div>
        </header>

        {/* Main Commercial Content */}
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10 sm:space-y-14">
          
          {/* HERO SECTION */}
          <section className="bg-gradient-to-b from-slate-800/90 to-slate-900/90 border border-slate-700/80 rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
              
              {/* Left Column: Copy & Core Action */}
              <div className="lg:col-span-7 space-y-5">
                
                {/* Badge */}
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded-full">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>Método & Aplicativo Web</span>
                </div>

                {/* Headline & Core Promise */}
                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    Organize seu dinheiro de forma simples e tenha clareza de onde ele está indo.
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    O Método Bolso Blindado é um aplicativo simples e direto ao ponto para registrar suas movimentações e acompanhar suas finanças pelo celular.
                  </p>
                </div>

                {/* Price & Primary CTA Card */}
                <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div>
                      <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                        Acesso Completo e Vitalício
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-black text-emerald-400">
                          R$ {activePrice.toFixed(2).replace('.', ',')}
                        </span>
                        <span className="text-xs text-slate-400">pagamento único via Pix</span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 sm:text-right">
                      <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11px] font-medium border border-emerald-500/20">
                        Sem mensalidades
                      </span>
                    </div>
                  </div>

                  {existingSession && existingSession.status === 'PAID' ? (
                    <button
                      onClick={handleOpenCheckout}
                      className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm tracking-wide uppercase transition-all duration-200 shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 active:scale-98"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Acessar Meu Aplicativo</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleOpenCheckout}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm tracking-wide uppercase transition-all duration-200 shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 group active:scale-98"
                    >
                      <span>Quero acessar o Método Bolso Blindado</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </button>
                  )}

                  {(!existingSession || existingSession.status !== 'PAID') && (
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setShowRecoveryModal(true)}
                        className="text-slate-400 hover:text-emerald-400 text-xs font-medium underline transition cursor-pointer"
                      >
                        Já comprou seu acesso? Recuperar acesso
                      </button>
                    </div>
                  )}
                </div>

                {/* Trust Badges */}
                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-slate-300 font-medium">
                  <div className="flex items-center justify-center gap-1.5 p-2 bg-slate-800/60 rounded-lg border border-slate-700/60">
                    <Flame className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span>Pix 24h</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 p-2 bg-slate-800/60 rounded-lg border border-slate-700/60">
                    <Smartphone className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>Acesso Imediato</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 p-2 bg-slate-800/60 rounded-lg border border-slate-700/60">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>Pagamento Seguro</span>
                  </div>
                </div>

              </div>

              {/* Right Column: Interactive App Interface Preview */}
              <div className="lg:col-span-5 flex flex-col items-center">
                <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4">
                  
                  {/* App Header Preview */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-xs">
                        BB
                      </div>
                      <span className="text-xs font-bold text-white">Bolso Blindado V1.1</span>
                    </div>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">Janeiro 2026</span>
                  </div>

                  {/* 3 KPIs Mockup */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-950/40 border border-emerald-800/40 p-2.5 rounded-xl">
                      <div className="text-[10px] text-emerald-400 font-semibold">Entrou</div>
                      <div className="text-xs font-bold text-white mt-0.5">R$ 5.200</div>
                    </div>
                    <div className="bg-rose-950/40 border border-rose-800/40 p-2.5 rounded-xl">
                      <div className="text-[10px] text-rose-400 font-semibold">Saiu</div>
                      <div className="text-xs font-bold text-white mt-0.5">R$ 2.450</div>
                    </div>
                    <div className="bg-blue-950/40 border border-blue-800/40 p-2.5 rounded-xl">
                      <div className="text-[10px] text-blue-400 font-semibold">Disponível</div>
                      <div className="text-xs font-bold text-emerald-300 mt-0.5">R$ 2.750</div>
                    </div>
                  </div>

                  {/* Goal Progress Bar */}
                  <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl space-y-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300 font-medium">Meta de Economia</span>
                      <span className="text-emerald-400 font-bold">● Objetivo alcançado</span>
                    </div>
                    <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full w-full"></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>118% da meta</span>
                      <span>Guardado: R$ 3.560</span>
                    </div>
                  </div>

                  {/* Categorias */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-semibold text-slate-300">Onde você mais gastou:</div>
                    <div className="space-y-1 text-[10px] text-slate-400">
                      <div className="flex justify-between bg-slate-800/40 p-1.5 rounded">
                        <span>Moradia & Contas</span>
                        <span className="font-semibold text-slate-200">R$ 1.200,00</span>
                      </div>
                      <div className="flex justify-between bg-slate-800/40 p-1.5 rounded">
                        <span>Alimentação</span>
                        <span className="font-semibold text-slate-200">R$ 680,00</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-center pt-1 text-[11px] text-emerald-400 font-medium flex items-center justify-center gap-1">
                    <Check className="h-3.5 w-3.5" />
                    <span>Disponível no seu celular pelo navegador</span>
                  </div>

                </div>
              </div>

            </div>
          </section>

          {/* 5 CORE PILLARS & BENEFITS */}
          <section className="space-y-6">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                Simplicidade e Clareza Financeira
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Como o Método Bolso Blindado Funciona na Prática
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Desenvolvido para eliminar o estresse financeiro sem exigir horas preenchendo controles complicados.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              
              {/* Pillar 1 */}
              <div className="p-5 rounded-2xl bg-slate-800/70 border border-slate-700/80 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
                    1
                  </div>
                  <h3 className="font-bold text-white text-sm sm:text-base">Entradas e Saídas Descomplicadas</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Registre suas receitas e despesas em poucos toques. Categorias limpas e interface pensada para o uso ágil no dia a dia.
                </p>
              </div>

              {/* Pillar 2 */}
              <div className="p-5 rounded-2xl bg-slate-800/70 border border-slate-700/80 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <h3 className="font-bold text-white text-sm sm:text-base">Visão do Disponível em Tempo Real</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Saiba exatamente quanto dinheiro você ainda tem livre no mês para gastar com tranquilidade, sem comprometer o básico.
                </p>
              </div>

              {/* Pillar 3 */}
              <div className="p-5 rounded-2xl bg-slate-800/70 border border-slate-700/80 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
                    3
                  </div>
                  <h3 className="font-bold text-white text-sm sm:text-base">Categorização Inteligente</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Identifique os maiores ralos do seu orçamento com gráficos visuais e barras de progresso por categoria de despesa.
                </p>
              </div>

              {/* Pillar 4 */}
              <div className="p-5 rounded-2xl bg-slate-800/70 border border-slate-700/80 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
                    4
                  </div>
                  <h3 className="font-bold text-white text-sm sm:text-base">Método dos 4 Pilares (50/30/20)</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Distribuição orçamentária balanceada para cobrir necessidades, estilo de vida, reserva de emergência e investimentos.
                </p>
              </div>

              {/* Pillar 5 */}
              <div className="p-5 rounded-2xl bg-slate-800/70 border border-slate-700/80 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
                    5
                  </div>
                  <h3 className="font-bold text-white text-sm sm:text-base">Acesso Direto por Conta Própria</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Aplicativo web moderno para celular e desktop. Crie sua conta com seu e-mail e salve seus lançamentos na nuvem segura.
                </p>
              </div>

              {/* Deliverables Summary Card */}
              <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-700/50 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500 text-slate-900 flex items-center justify-center font-bold text-sm">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold text-emerald-300 text-sm sm:text-base">Pacote Completo Incluso</h3>
                </div>
                <ul className="text-xs text-slate-200 space-y-1 pt-1">
                  <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> Aplicativo Web Bolso Blindado V1.1</li>
                  <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> Planilha de Gestão Financeira 2026</li>
                  <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> Guia Prático de Implementação (PDF)</li>
                </ul>
              </div>

            </div>
          </section>

          {/* INCLUSIONS SECTION */}
          <section className="bg-slate-800/50 border border-slate-700/80 rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                O Que Você Recebe Imediatamente
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                Tudo o que você precisa para assumir o controle financeiro sem complicações.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-xl space-y-2 text-center">
                <div className="h-10 w-10 mx-auto rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="font-bold text-white text-sm">Web App Bolso Blindado</div>
                <p className="text-xs text-slate-400">Acesso contínuo pelo celular ou navegador para registrar seus lançamentos.</p>
              </div>

              <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-xl space-y-2 text-center">
                <div className="h-10 w-10 mx-auto rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="font-bold text-white text-sm">Planilha de Controle 2026</div>
                <p className="text-xs text-slate-400">Arquivo estruturado em Excel/Sheets para projeções e acompanhamento anual.</p>
              </div>

              <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-xl space-y-2 text-center">
                <div className="h-10 w-10 mx-auto rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="font-bold text-white text-sm">Guia Prático em PDF</div>
                <p className="text-xs text-slate-400">Manual passo a passo para organizar contas, cortar desperdícios e guardar dinheiro.</p>
              </div>

            </div>
          </section>

          {/* FINAL BOTTOM CALL TO ACTION */}
          <section className="p-6 sm:p-10 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-emerald-900/80 via-slate-900 to-teal-950/80 border border-emerald-700/40 text-white text-center space-y-4 shadow-2xl">
            <div className="max-w-xl mx-auto space-y-2">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">
                Assuma o Controle do Seu Dinheiro Hoje Mesmo
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Sem mensalidades, sem complicação. Pagamento único com liberação imediata via Pix.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {existingSession && existingSession.status === 'PAID' ? (
                <button
                  onClick={handleOpenCheckout}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm tracking-wide uppercase transition shadow-lg shadow-black/30 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Acessar Meu Aplicativo</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleOpenCheckout}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs sm:text-sm tracking-wide uppercase transition shadow-lg shadow-black/40 flex items-center justify-center gap-2"
                >
                  <span>Quero acessar o Método Bolso Blindado (R$ {activePrice.toFixed(2).replace('.', ',')})</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </section>

        </main>

        {/* Public Footer */}
        <footer className="border-t border-slate-800 bg-slate-950 py-6 sm:py-8 text-slate-400 text-xs mt-8">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="space-y-0.5">
              <p className="font-bold text-white text-sm">BOLSO BLINDADO</p>
              <p className="text-slate-500 text-[11px]">NORQVA Intelligence • Unidade de Tecnologia & Finanças Pessoais</p>
            </div>
            <div className="text-[11px] text-slate-500 space-y-0.5 sm:text-right">
              <p>Atendimento & Suporte: <a href="mailto:suporte@norqva.com" className="text-emerald-400 underline">suporte@norqva.com</a></p>
              <p>© {new Date().getFullYear()} NORQVA Intelligence Ltda. Todos os direitos reservados.</p>
            </div>
          </div>
        </footer>

        {/* Step 1: Checkout Form Modal */}
        {showCheckout && (
          <CheckoutView
            offer={offer as any}
            isDemo={offer.is_demo}
            initialCustomer={customerDraft}
            onCustomerChange={setCustomerDraft}
            onOrderCreated={(order) => {
              setShowCheckout(false);
              if (order?.id && order?.checkout_token) {
                savePurchaseSession({
                  orderId: order.id,
                  checkoutToken: order.checkout_token,
                  offerHumanId: offer?.human_id || 'OFF-BOLSO-BLINDADO-2990',
                  status: 'PENDING',
                  offerName: offer?.name
                });
              }
              setActivePaymentOrder(order);
            }}
            onCancel={() => setShowCheckout(false)}
            showError={showError}
            showSuccess={showSuccess}
          />
        )}

        {/* Step 2: Payment / Pix Status Modal */}
        {activePaymentOrder && !activeDeliveryOrder && (
          <PaymentStatus
            orderId={activePaymentOrder.id}
            checkoutToken={activePaymentOrder.checkout_token}
            amount={activePaymentOrder.total_amount || activePrice}
            isDemo={offer.is_demo}
            onPaymentConfirmed={() => {
              updatePurchaseSessionStatus(activePaymentOrder.id, 'PAID');
              navigate(`/pedido/${activePaymentOrder.id}/entrega#token=${activePaymentOrder.checkout_token}`);
            }}
            onBackToCheckout={() => {
              setActivePaymentOrder(null);
              setShowCheckout(true);
            }}
            onClose={() => {
              setActivePaymentOrder(null);
            }}
            showError={showError}
            showSuccess={showSuccess}
          />
        )}

        {/* Step 3: Digital Delivery View Modal */}
        {activeDeliveryOrder && (
          <DigitalDelivery
            orderId={activeDeliveryOrder.id}
            checkoutToken={activeDeliveryOrder.checkout_token}
            isDemo={offer.is_demo}
            onClose={() => {
              setActiveDeliveryOrder(null);
              setActivePaymentOrder(null);
            }}
            showError={showError}
            showSuccess={showSuccess}
          />
        )}

        {/* Recovery Request Modal */}
        {showRecoveryModal && (
          <RecoveryRequestModal
            offerHumanId={offer?.human_id || humanId}
            onClose={() => setShowRecoveryModal(false)}
            showError={showError}
            showSuccess={showSuccess}
          />
        )}

      </div>
    );
  }

  // ==========================================
  // VIEW: TRATTORIA CULINARY OFFER EXPERIENCE (PRESERVED)
  // ==========================================
  return (
    <div className="min-h-screen bg-[#FAF7F2] text-stone-800 flex flex-col justify-between selection:bg-[#B83B1E]/20 selection:text-[#8F2810] font-sans antialiased">
      
      {/* Existing Paid Purchase Notification Banner */}
      {existingSession && existingSession.status === 'PAID' && (
        <div className="bg-[#2B3D2B] text-white px-4 py-3 text-center text-xs font-medium flex flex-wrap items-center justify-center gap-3 shadow-md z-40 relative">
          <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
            <Sparkles className="h-4 w-4" />
            <span>Compra Concluída</span>
          </div>
          <span>Você já garantiu seu exemplar deste guia digital!</span>
          <button
            onClick={() => navigate(`/pedido/${existingSession.orderId}/entrega#token=${existingSession.checkoutToken}`)}
            className="px-3.5 py-1.5 rounded-lg bg-[#B83B1E] hover:bg-[#8F2810] text-white font-bold uppercase tracking-wider text-[11px] transition shadow flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Acessar Meu Livro</span>
          </button>
        </div>
      )}

      {/* Top Culinary Announcement Bar */}
      <div className="bg-[#2B3D2B] text-stone-200 text-[11px] sm:text-xs py-1.5 px-4 text-center font-medium tracking-wide flex items-center justify-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="truncate">Edição Especial 2026 • 28 Preparações Italianas com Fichas Técnicas</span>
      </div>

      {/* Elegant Header */}
      <header className="border-b border-stone-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-[#B83B1E] text-white flex items-center justify-center shadow-md shrink-0">
              <ChefHat className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <span className="font-serif font-bold text-sm sm:text-lg tracking-tight text-stone-900 block leading-tight">
                TRATTORIA EM CASA
              </span>
              <span className="text-[9px] sm:text-[10px] tracking-widest text-stone-500 uppercase font-medium">
                Cucina Tradizionale Italiana
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-stone-700 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200 shadow-sm">
            <Lock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#2B3D2B]" />
            <span className="font-medium">Checkout Seguro</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-8 sm:space-y-12">
        
        {/* HERO SECTION — Optimized for First-Viewport Commercial Action */}
        <section className="bg-white border border-stone-200/80 rounded-2xl sm:rounded-3xl p-5 sm:p-8 lg:p-10 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
            
            {/* Desktop Left: Mockup & Cover */}
            <div className="hidden lg:flex lg:col-span-5 flex-col items-center">
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-tr from-[#B83B1E]/20 to-amber-500/20 rounded-3xl blur-xl opacity-70 group-hover:opacity-100 transition duration-500"></div>
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-stone-200/80 bg-stone-900 max-w-[300px]">
                  <img 
                    src="/images/trattoria/proto_01_capa_1788381677692.jpg" 
                    alt="Trattoria em Casa — Livro Digital Oficial"
                    className="w-full h-auto object-cover transform hover:scale-[1.02] transition duration-300"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-stone-600 font-medium">
                <BookOpen className="h-4 w-4 text-[#B83B1E]" />
                <span>E-book Digital Completo • 39 Páginas em Alta Resolução</span>
              </div>
            </div>

            {/* Main Details & Direct Commercial Action */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-5">
              
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#B83B1E] bg-[#B83B1E]/10 border border-[#B83B1E]/20 px-2.5 py-0.5 rounded-full">
                <Utensils className="h-3 w-3" />
                <span>Guia Prático de Massas & Molhos</span>
              </div>

              {/* Title & Core Promise */}
              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-stone-900 tracking-tight leading-tight">
                  {offer.name || 'Trattoria em Casa — Massas & Molhos Italianos'}
                </h1>
                <p className="text-xs sm:text-sm lg:text-base text-stone-600 leading-relaxed font-sans">
                  Aprenda os segredos das massas artesanais frescas e dos molhos clássicos italianos em um guia prático, direto e ricamente ilustrado.
                </p>
              </div>

              {/* Mobile Compact Cover + Feature Row */}
              <div className="flex lg:hidden items-center gap-3 p-2.5 bg-stone-50 rounded-xl border border-stone-200">
                <img 
                  src="/images/trattoria/proto_01_capa_1788381677692.jpg" 
                  alt="Capa"
                  className="w-14 h-18 object-cover rounded-lg shadow-sm shrink-0 border border-stone-300"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
                <div className="text-xs space-y-0.5">
                  <span className="font-bold text-stone-900 block font-serif">28 Preparações Selecionadas</span>
                  <span className="text-stone-600 text-[11px] block">Massas frescas, molhos clássicos e fichas com gramaturas para o Brasil.</span>
                </div>
              </div>

              {/* Price & Primary CTA Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF7F2] border border-stone-300 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-0.5 text-center sm:text-left">
                  <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-stone-500 block">
                    Pagamento único via Pix
                  </span>
                  <div className="flex items-baseline gap-2.5 justify-center sm:justify-start">
                    <span className="text-2xl sm:text-3xl font-serif font-black text-[#B83B1E]">
                      R$ {activePrice.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <span className="text-[10px] text-stone-500 block">
                    Acesso vitalício • Sem mensalidades
                  </span>
                </div>

                {existingSession && existingSession.status === 'PAID' ? (
                  <button
                    onClick={handleOpenCheckout}
                    className="w-full sm:w-auto px-6 sm:px-8 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm tracking-wide uppercase transition-all duration-200 shadow-lg shadow-emerald-900/25 flex items-center justify-center gap-2 shrink-0 active:scale-95"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Acessar Meu Livro</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleOpenCheckout}
                    className="w-full sm:w-auto px-6 sm:px-8 py-3.5 rounded-xl bg-[#B83B1E] hover:bg-[#8F2810] text-white font-bold text-xs sm:text-sm tracking-wide uppercase transition-all duration-200 shadow-lg shadow-[#B83B1E]/25 hover:shadow-[#B83B1E]/40 flex items-center justify-center gap-2 shrink-0 group active:scale-95"
                  >
                    <span>Comprar com Pix</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                )}
              </div>

              {(!existingSession || existingSession.status !== 'PAID') && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowRecoveryModal(true)}
                    className="text-stone-500 hover:text-[#B83B1E] text-xs font-medium underline transition cursor-pointer"
                  >
                    Já comprou seu exemplar? Recuperar acesso
                  </button>
                </div>
              )}

              {/* Trust Badges — Truthful & No Truncation */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-0.5 text-[10px] sm:text-[11px] text-stone-700 font-medium">
                <div className="flex items-center justify-center gap-1 sm:gap-1.5 p-2 bg-stone-50 rounded-lg border border-stone-200">
                  <Flame className="h-3.5 w-3.5 text-[#B83B1E] shrink-0" />
                  <span>Pix 24h</span>
                </div>
                <div className="flex items-center justify-center gap-1 sm:gap-1.5 p-2 bg-stone-50 rounded-lg border border-stone-200">
                  <Download className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" />
                  <span>Download Imediato</span>
                </div>
                <div className="flex items-center justify-center gap-1 sm:gap-1.5 p-2 bg-stone-50 rounded-lg border border-stone-200">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" />
                  <span>Pagamento Seguro</span>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* SECTION: REAL CULINARY PHOTOGRAPHY GALLERY */}
        <section className="space-y-6 pt-4 border-t border-stone-200/80">
          <div className="text-center max-w-2xl mx-auto space-y-1.5">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-serif font-bold text-stone-900">
              O Que Você Irá Preparar em Sua Cozinha
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              Fotografias reais das preparações ensinadas no livro, com ingredientes acessíveis e métodos testados para garantir o resultado perfeito.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            
            {/* Card 1: Massa Clássica */}
            <div className="bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-md hover:shadow-lg transition">
              <img 
                src="/images/trattoria/clean_massa_classica_hero.jpg" 
                alt="Massa Clássica aos Ovos"
                className="w-full h-40 object-cover"
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
              <div className="p-4 space-y-1.5">
                <span className="text-[10px] font-bold text-[#B83B1E] uppercase tracking-wider">Módulo 01 • Fundamentos</span>
                <h3 className="font-serif font-bold text-sm sm:text-base text-stone-900">Massa Clássica aos Ovos (Tagliolini & Fettuccine)</h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  A proporção de ouro (100g de farinha para 1 ovo), o tempo exato de sova e o descanso do glúten para abrir massas finas e elásticas.
                </p>
              </div>
            </div>

            {/* Card 2: Pomodoro San Marzano */}
            <div className="bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-md hover:shadow-lg transition">
              <img 
                src="/images/trattoria/clean_pomodoro_san_marzano.jpg" 
                alt="Pomodoro & Basilico Autêntico"
                className="w-full h-40 object-cover"
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
              <div className="p-4 space-y-1.5">
                <span className="text-[10px] font-bold text-[#B83B1E] uppercase tracking-wider">Módulo 02 • Molhos Clássicos Italianos</span>
                <h3 className="font-serif font-bold text-sm sm:text-base text-stone-900">Pomodoro San Marzano & Basilico Fresco</h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  O cozimento suave sem queimar o alho, a extração da doçura natural do tomate e a finalização com manjericão na temperatura certa.
                </p>
              </div>
            </div>

            {/* Card 3: Ragu Bolognese */}
            <div className="bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-md hover:shadow-lg transition">
              <img 
                src="/images/trattoria/clean_bolognese_ragu.jpg" 
                alt="Ragu alla Bolognese Tradicional"
                className="w-full h-40 object-cover"
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
              <div className="p-4 space-y-1.5">
                <span className="text-[10px] font-bold text-[#B83B1E] uppercase tracking-wider">Módulo 02 • Emulsão & Cozimento Lento</span>
                <h3 className="font-serif font-bold text-sm sm:text-base text-stone-900">Ragu alla Bolognese Tradicional</h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  O soffritto tradicional de aipo, cenoura e cebola, a caramelização das carnes com vinho e a redução aveludada em fogo brando.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* SECTION: 5 COMPLETE MODULES & CURRICULUM */}
        <section className="space-y-6 pt-4 border-t border-stone-200/80">
          <div className="text-center max-w-2xl mx-auto space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-[#B83B1E]">
              Estrutura Pedagógica Completa
            </span>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-serif font-bold text-stone-900">
              O Conteúdo Detalhado dos 5 Módulos
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              Fichas técnicas ilustradas passo a passo, rendimentos, tabelas de conversão e tempos de cozimento.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[#B83B1E] text-white flex items-center justify-center font-bold text-xs">1</div>
                <h3 className="font-serif font-bold text-stone-900 text-sm sm:text-base">Módulo 01: A Arte da Massa Artesanal Fresca</h3>
              </div>
              <ul className="space-y-1 text-xs text-stone-700">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 01. A Proporção Clássica de Ovos e Farinha</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 02. Massa de Sêmola & Água sem Ovos (Sul da Itália)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 03. Tagliatelle & Fettuccine Clássicos</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 04. Pappardelle Rústico para Molhos Encorpados</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 05. Nhoque de Batata Aveludado (Sem Ficar Pesado)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 06. O Ponto Exato do "Al Dente" & Água do Cozimento</li>
              </ul>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[#B83B1E] text-white flex items-center justify-center font-bold text-xs">2</div>
                <h3 className="font-serif font-bold text-stone-900 text-sm sm:text-base">Módulo 02: Os Molhos Clássicos & Emulsões</h3>
              </div>
              <ul className="space-y-1 text-xs text-stone-700">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 07. Pomodoro & Basilico Autêntico (San Marzano)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 08. Ragu alla Bolognese Tradicional (Cozimento Lento)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 09. Cacio e Pepe Perfeito (Cremoso sem Nata)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 10. Carbonara Clássica (Gema, Pecorino & Guanciale)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 11. All'Amatriciana Tradicional</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 12. Pesto alla Genovese Fresco</li>
              </ul>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[#B83B1E] text-white flex items-center justify-center font-bold text-xs">3</div>
                <h3 className="font-serif font-bold text-stone-900 text-sm sm:text-base">Módulo 03: Massas Recheadas & Forno</h3>
              </div>
              <ul className="space-y-1 text-xs text-stone-700">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 13. Ravioli de Ricota Fresca & Espinafre</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 14. Tortellini Clássico de Queijo & Ervas</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 15. Lasanha Tradicional alla Bolognese</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 16. Nhoque Gratinado aos 4 Queijos Italianos</li>
              </ul>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[#B83B1E] text-white flex items-center justify-center font-bold text-xs">4 e 5</div>
                <h3 className="font-serif font-bold text-stone-900 text-sm sm:text-base">Módulos 04 e 05: Molhos Rápidos, Pizzas & Antepastos</h3>
              </div>
              <ul className="space-y-1 text-xs text-stone-700">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 17. Sugo Rápido com Tomates Cereja Tostados (15 min)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 18. Molho alla Puttanesca Tradicional (15 min)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 19. Massa de Pizza de Fermentação de 24h para Casa</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#2B3D2B] shrink-0" /> 20. Focaccia Genovese Crocante com Alecrim</li>
              </ul>
            </div>

          </div>
        </section>

        {/* BOTTOM FINAL CALL TO ACTION */}
        <section className="p-6 sm:p-10 rounded-2xl sm:rounded-3xl bg-[#2B3D2B] text-white text-center space-y-4 shadow-xl">
          <div className="max-w-xl mx-auto space-y-2">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-serif font-bold tracking-tight">
              Comece Hoje Mesmo Sua Jornada na Culinária Italiana
            </h2>
            <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
              Tenha em mãos o guia definitivo com 28 preparações selecionadas, proporções exatas e técnicas que garantem elogios na sua mesa.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {existingSession && existingSession.status === 'PAID' ? (
              <button
                onClick={handleOpenCheckout}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm tracking-wide uppercase transition shadow-lg shadow-black/20 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Acessar Meu Livro Digital</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleOpenCheckout}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#B83B1E] hover:bg-[#8F2810] text-white font-bold text-xs sm:text-sm tracking-wide uppercase transition shadow-lg shadow-black/20 flex items-center justify-center gap-2"
              >
                <span>Garantir Livro Digital (R$ {activePrice.toFixed(2).replace('.', ',')})</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>

      </main>

      {/* Elegant Public Footer */}
      <footer className="border-t border-stone-200 bg-white py-6 sm:py-8 text-stone-500 text-xs mt-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="space-y-0.5">
            <p className="font-serif font-bold text-stone-800 text-sm">TRATTORIA EM CASA</p>
            <p className="text-stone-500 text-[11px]">Unidade de Gastronomia Digital • Documento Certificado</p>
          </div>
          <div className="text-[11px] text-stone-400 space-y-0.5 sm:text-right">
            <p>Atendimento & Suporte: <a href="mailto:suporte@norqva.com" className="text-stone-600 underline">suporte@norqva.com</a></p>
            <p>© {new Date().getFullYear()} NORQVA Intelligence Ltda. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>

      {/* Step 1: Checkout Form Modal */}
      {showCheckout && (
        <CheckoutView
          offer={offer as any}
          isDemo={offer.is_demo}
          initialCustomer={customerDraft}
          onCustomerChange={setCustomerDraft}
          onOrderCreated={(order) => {
            setShowCheckout(false);
            if (order?.id && order?.checkout_token) {
              savePurchaseSession({
                orderId: order.id,
                checkoutToken: order.checkout_token,
                offerHumanId: offer?.human_id || 'OFF-000001',
                status: 'PENDING',
                offerName: offer?.name
              });
            }
            setActivePaymentOrder(order);
          }}
          onCancel={() => setShowCheckout(false)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}

      {/* Step 2: Payment / Pix Status Modal */}
      {activePaymentOrder && !activeDeliveryOrder && (
        <PaymentStatus
          orderId={activePaymentOrder.id}
          checkoutToken={activePaymentOrder.checkout_token}
          amount={activePaymentOrder.total_amount || activePrice}
          isDemo={offer.is_demo}
          onPaymentConfirmed={() => {
            updatePurchaseSessionStatus(activePaymentOrder.id, 'PAID');
            navigate(`/pedido/${activePaymentOrder.id}/entrega#token=${activePaymentOrder.checkout_token}`);
          }}
          onBackToCheckout={() => {
            setActivePaymentOrder(null);
            setShowCheckout(true);
          }}
          onClose={() => {
            setActivePaymentOrder(null);
          }}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}

      {/* Step 3: Digital Delivery View Modal */}
      {activeDeliveryOrder && (
        <DigitalDelivery
          orderId={activeDeliveryOrder.id}
          checkoutToken={activeDeliveryOrder.checkout_token}
          isDemo={offer.is_demo}
          onClose={() => {
            setActiveDeliveryOrder(null);
            setActivePaymentOrder(null);
          }}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}

      {/* Recovery Request Modal */}
      {showRecoveryModal && (
        <RecoveryRequestModal
          offerHumanId={offer?.human_id || humanId}
          onClose={() => setShowRecoveryModal(false)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}

    </div>
  );
};
