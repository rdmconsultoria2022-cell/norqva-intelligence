import React, { useState, useEffect } from 'react';
import { DEMO_MODE_ENABLED } from './lib/demoMode';
import { supabase } from './supabase';
import {
  LayoutDashboard,
  Lightbulb,
  Package,
  Tag,
  Film,
  FlaskConical,
  Scale,
  Users,
  Settings,
  AlertTriangle,
  LogOut,
  Plus,
  Search,
  DollarSign,
  Calendar,
  CheckCircle,
  FileText,
  User,
  Shield,
  Activity,
  Trash2,
  TrendingUp,
  RefreshCw,
  ShoppingCart
} from 'lucide-react';
import { Login } from './features/auth/Login';
import { ForgotPassword } from './features/auth/ForgotPassword';
import { PasswordRecovery } from './features/auth/PasswordRecovery';
import { DashboardView } from './features/dashboard/DashboardView';
import { OpportunitiesView } from './features/opportunities/OpportunitiesView';
import { ExperimentsView } from './features/experiments/ExperimentsView';
import { CheckoutView } from './features/checkout/CheckoutView';
import { PaymentStatus } from './features/payment/PaymentStatus';
import { DigitalDelivery } from './features/delivery/DigitalDelivery';
import { DigitalAssetAdminModal } from './features/delivery/DigitalAssetAdminModal';
import { OrderDeliveryView } from './features/delivery/OrderDeliveryView';
import { AccessRecoveryView } from './features/delivery/AccessRecoveryView';
import { MetaAdsView } from './features/acquisition/MetaAdsView';
import { CreativePerformanceView } from './features/intelligence/CreativePerformanceView';
import { CampaignBaseView } from './features/intelligence/CampaignBaseView';
import { AccountCreditView } from './features/meta-credit/AccountCreditView';
import { MethodView } from './features/method/MethodView';
import { AiTeamView } from './features/intelligence/AiTeamView';
import { ResearchView, ResearchTab } from './features/research/ResearchView';
import { ResultsView, ResultsTab } from './features/results/ResultsView';
import { ProductsView } from './features/products/ProductsView';
import { parsePrice } from './features/products/OfferEditor';
import { CreditSummary } from './features/dashboard/CreditSummary';
import { BrandsView } from './features/brands/BrandsView';
import { DemographicIntelligenceView } from './features/intelligence/DemographicIntelligenceView';
import { AppShell } from './components/layout/AppShell';
import { GlobalPeriodProvider } from './lib/globalPeriod';
import { CreativeFactoryView } from './features/creative-factory/CreativeFactoryView';

// Screens whose numbers are filtered by the global period
// NORQVA-0082: na Visão Geral o período fica na própria tela (botões logo abaixo da receita)
const PERIOD_AWARE_TABS = ['campaigns', 'research', 'results', 'creative-factory', 'sales'];
import { PublicOfferPage } from './features/public/PublicOfferPage';
import { KitLandingPage } from './features/public/KitLandingPage';

import { apiFetch as apiFetchLib, API_BASE as API_BASE_LIB } from './lib/api';


import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './features/auth/useAuth';
import { SalesView } from './features/sales/SalesView';
import { WhatsAppView } from './features/whatsapp/WhatsAppView';
import { TeamView, ConfigView } from './features/settings/SettingsViews';
import { CampaignsView } from './features/campaigns/CampaignsView';
import { initMetaPixel, trackPageView, isPublicCommercialRoute } from './services/metaPixel';

import { UserObj } from './types';


export default function App() {
  const isProduction = (import.meta as any).env.PROD;
  const {
    currentUser,
    setCurrentUser,
    authMode,
    setAuthMode,
    activeTab,
    setActiveTab,
    isDemoView,
    setIsDemoView,
    introFinished,
    setIntroFinished,
    usersList,
    setUsersList,
    globalError,
    setGlobalError,
    globalSuccess,
    setGlobalSuccess,
    recoveryState,
    setRecoveryState,
    isForgotPasswordView,
    setIsForgotPasswordView,
    isAuthReady,
    showError,
    showSuccess,
    handleLogin,
    handleSignOut
  } = useAuth();

  const [researchTab, setResearchTab] = useState<ResearchTab>('base');
  const [resultsTab, setResultsTab] = useState<ResultsTab>('financial');
  const [productsOpenAll, setProductsOpenAll] = useState(false);

  // NORQVA-0025: o antigo Creative Lab virou a tela Criativos.
  // NORQVA-0028: Meta Ads, Método NORQVA e Experimentos passaram para dentro de Campanhas.
  useEffect(() => {
    if (activeTab === 'creatives') setActiveTab('creative-factory');
    if (activeTab === 'meta-ads' || activeTab === 'method' || activeTab === 'experiments') setActiveTab('campaigns');
    // NORQVA-0029: Base de campanhas, Time de IAs e Oportunidades viraram a tela Pesquisa
    const research: Record<string, ResearchTab> = { 'campaign-base': 'base', 'ai-team': 'opportunities', opportunities: 'history' };
    if (research[activeTab]) {
      setResearchTab(research[activeTab]);
      setActiveTab('research');
    } else if (activeTab !== 'research') {
      setResearchTab('base');
    }
    // NORQVA-0030: Ofertas ficam dentro de Produtos; as telas de resultado viraram a tela Resultados
    const results: Record<string, ResultsTab> = { 'creative-performance': 'creatives', demographics: 'audience', 'meta-credit': 'credit', decisions: 'decisions' };
    if (results[activeTab]) {
      setResultsTab(results[activeTab]);
      setActiveTab('results');
    } else if (activeTab !== 'results') {
      setResultsTab('financial');
    }
    if (activeTab === 'offers') {
      setProductsOpenAll(true);
      setActiveTab('products');
    } else if (activeTab !== 'products') {
      setProductsOpenAll(false);
    }
  }, [activeTab]);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const url = new URL(window.location.href);
    const hasCode = url.searchParams.get('code');
    const isRecoveryHash = window.location.hash.includes('type=recovery');
    const isRecovery = location.pathname === '/reset-password' || isRecoveryHash || !!hasCode;
    const isForgot = location.pathname === '/forgot-password';
    const isLogin = location.pathname === '/login';
    const isPublicOffer = location.pathname.startsWith('/p/');
    const isOrderDelivery = location.pathname.startsWith('/pedido/');
    const isAccessRecovery = location.pathname.startsWith('/acesso/');
    const isKitPage = location.pathname.startsWith('/kit/'); // NORQVA-0038: página pública do kit

    if (!currentUser) {
      if (!isRecovery && !isForgot && !isLogin && !isPublicOffer && !isOrderDelivery && !isAccessRecovery && !isKitPage) {
        navigate('/login', { replace: true });
      }
    } else {
      if (isLogin || isForgot || isRecovery) {
        navigate('/', { replace: true });
      }
    }
  }, [currentUser, location.pathname]);

  // Meta Pixel Initialization & PageView Tracking
  // - Public commercial routes (/p/*, /pedido/*, /acesso/*): initialized immediately regardless of admin auth/demo state
  // - Administrative routes: gated to authenticated REAL mode after auth bootstrap settles
  useEffect(() => {
    const isPublicCommercial = isPublicCommercialRoute(location.pathname);
    const isRealAdminReady = isAuthReady && !isDemoView && authMode !== 'demo';

    if (isPublicCommercial || isRealAdminReady) {
      initMetaPixel();
      trackPageView(location.pathname + location.search);
    }
  }, [location.pathname, location.search, isDemoView, authMode, isAuthReady]);


  // States for lists
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [dashboardRefreshTrigger, setDashboardRefreshTrigger] = useState(0);

  // Modals & form fields


  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '', category: '', description: '', estimated_cost: 0, observations: '', opportunity_id: ''
  });

  const [showEditProduct, setShowEditProduct] = useState<any | null>(null);
  const [editProductForm, setEditProductForm] = useState({
    name: '', category: '', description: '', estimated_cost: '', observations: '', status: '', origin_provenance: '', origin_responsible_id: '', origin_evidence: '', origin_notes: ''
  });

  const [showAddOffer, setShowAddOffer] = useState(false);
  const [offerFormState, setOfferFormState] = useState({
    product_id: '', name: '', price: 0, promotional_price: 0, bonus: '', description: '', upsell: '', cross_sell: ''
  });





  const [showAddPerformance, setShowAddPerformance] = useState<string | null>(null);
  const [perfForm, setPerfForm] = useState({
    date: new Date().toISOString().split('T')[0], source: 'MANUAL', investment: 0, impressions: 0, cliques: 0,
    conversas: 0, pedidos: 0, vendas: 0, receita: 0, reembolsos: 0, taxas: 0, outros_custos: 0
  });

  const [showRequestCapital, setShowRequestCapital] = useState<any | null>(null);
  const [capitalForm, setCapitalForm] = useState({ amount: 0, justification: '' });

  const [showExpDetails, setShowExpDetails] = useState<any | null>(null);

  // Commercial Checkout, Payment, Delivery modal states
  const [checkoutOffer, setCheckoutOffer] = useState<any | null>(null);
  const [activePaymentOrder, setActivePaymentOrder] = useState<any | null>(null);
  const [activeDeliveryOrder, setActiveDeliveryOrder] = useState<any | null>(null);

  // Fetch helper wrapper using centralized client
  const apiFetch = React.useCallback(async (url: string, options: RequestInit = {}) => {
    return apiFetchLib(url, options, authMode, currentUser, () => {
      setCurrentUser(null);
    });
  }, [authMode, currentUser]);

  // NORQVA-0009/0028: alertas abertos → badge em "Campanhas" (refreshed every 5 min and on tab change)
  const [openAlertsCount, setOpenAlertsCount] = useState(0);
  const alertsFetchRef = React.useRef(apiFetch);
  alertsFetchRef.current = apiFetch;
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const load = () =>
      alertsFetchRef.current(`/alerts?mode=${isDemoView ? 'demo' : 'real'}`)
        .then((r: any) => {
          if (!cancelled) setOpenAlertsCount(Array.isArray(r?.alerts) ? r.alerts.filter((a: any) => a.status === 'OPEN').length : 0);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [currentUser?.id, isDemoView, activeTab]);




  const refreshOpportunities = async () => {
    if (!currentUser) return;
    const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
    try {
      const opps = await apiFetch(`/opportunities${modeParam}`);
      setOpportunities(opps.opportunities);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const refreshProducts = async () => {
    if (!currentUser) return;
    const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
    try {
      const prds = await apiFetch(`/products${modeParam}`);
      setProducts(prds.products);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const refreshOffers = async () => {
    if (!currentUser) return;
    const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
    try {
      const offs = await apiFetch(`/offers${modeParam}`);
      setOffers(offs.offers);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const refreshCreatives = async () => {
    if (!currentUser) return;
    const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
    try {
      const crs = await apiFetch(`/creatives${modeParam}`);
      setCreatives(crs.creatives);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const refreshExperiments = async () => {
    if (!currentUser) return;
    const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
    try {
      const exps = await apiFetch(`/experiments${modeParam}`);
      setExperiments(exps.experiments);
      setDashboardRefreshTrigger(t => t + 1);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const refreshDecisions = async () => {
    if (!currentUser) return;
    const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
    try {
      const decs = await apiFetch(`/decisions${modeParam}`);
      setDecisions(decs.decisions);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const refreshAuditLogs = async () => {
    if (!currentUser || currentUser.role !== 'ADMIN') return;
    const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
    try {
      const logs = await apiFetch(`/audit${modeParam}`);
      setAuditLogs(logs.audit_logs);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const refreshUsers = async () => {
    if (!currentUser) return;
    const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
    try {
      const res = await apiFetch(`/users${modeParam}`);
      if (res && res.users) {
        setUsersList(res.users);
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Fetch all operational data
  const loadData = async () => {
    if (!currentUser) return;
    const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
    try {
      // 0. Users
      const usersRes = await apiFetch(`/users${modeParam}`);
      if (usersRes && usersRes.users) {
        setUsersList(usersRes.users);
      }

      // 1. Opportunities
      const opps = await apiFetch(`/opportunities${modeParam}`);
      setOpportunities(opps.opportunities);

      // 2. Products
      const prds = await apiFetch(`/products${modeParam}`);
      setProducts(prds.products);

      // 3. Offers
      const offs = await apiFetch(`/offers${modeParam}`);
      setOffers(offs.offers);

      // 4. Creatives
      const crs = await apiFetch(`/creatives${modeParam}`);
      setCreatives(crs.creatives);

      // 5. Experiments
      const exps = await apiFetch(`/experiments${modeParam}`);
      setExperiments(exps.experiments);

      // 6. Decisions
      const decs = await apiFetch(`/decisions${modeParam}`);
      setDecisions(decs.decisions);

      // 7. Audit logs (restricted to ADMIN)
      if (currentUser.role === 'ADMIN') {
        const logs = await apiFetch(`/audit${modeParam}`);
        setAuditLogs(logs.audit_logs);
      }
      
      setDashboardRefreshTrigger(t => t + 1);
    } catch (err: any) {
      showError(err.message);
    }
  };

  useEffect(() => {
    if (currentUser && introFinished) {
      loadData();
    }
  }, [currentUser, isDemoView, introFinished, activeTab]);





  // Add Product
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/products?mode=${isDemoView ? 'demo' : 'real'}`, {
        method: 'POST',
        body: JSON.stringify(productForm)
      });
      showSuccess('Produto planejado cadastrado!');
      setShowAddProduct(false);
      setProductForm({ name: '', category: '', description: '', estimated_cost: 0, observations: '', opportunity_id: '' });
      refreshProducts();
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Edit Product / Set Provenance & Change Status
  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditProduct) return;
    try {
      const payload: any = { status: editProductForm.status };
      // NORQVA-0035: nome e categoria editáveis
      if (editProductForm.name.trim()) payload.name = editProductForm.name.trim();
      if (editProductForm.category.trim()) payload.category = editProductForm.category.trim();
      // NORQVA-0057: descrição, custo estimado e observações
      if (!editProductForm.description.trim()) {
        showError('A descrição do produto não pode ficar vazia.');
        return;
      }
      payload.description = editProductForm.description.trim();
      const costText = String(editProductForm.estimated_cost).trim();
      const cost = costText === '' ? 0 : parsePrice(costText);
      if (!(cost >= 0)) {
        showError('Custo estimado inválido. Use, por exemplo, 150,00.');
        return;
      }
      payload.estimated_cost = cost;
      payload.observations = editProductForm.observations.trim() || null;
      payload.origin_notes = editProductForm.origin_notes.trim() || null;
      if (editProductForm.origin_provenance) payload.origin_provenance = editProductForm.origin_provenance;
      if (editProductForm.origin_responsible_id) payload.origin_responsible_id = editProductForm.origin_responsible_id;
      if (editProductForm.origin_evidence) payload.origin_evidence = editProductForm.origin_evidence;

      await apiFetch(`/products/${showEditProduct.id}?mode=${isDemoView ? 'demo' : 'real'}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showSuccess('Produto atualizado!');
      setShowEditProduct(null);
      refreshProducts();
      refreshAuditLogs();
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Add Offer
  const handleAddOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/offers?mode=${isDemoView ? 'demo' : 'real'}`, {
        method: 'POST',
        body: JSON.stringify(offerFormState)
      });
      showSuccess('Oferta cadastrada!');
      setShowAddOffer(false);
      setOfferFormState({ product_id: '', name: '', price: 0, promotional_price: 0, bonus: '', description: '', upsell: '', cross_sell: '' });
      refreshOffers();
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Update Offer Status
  const handleUpdateOfferStatus = async (offerId: string, newStatus: string) => {
    try {
      await apiFetch(`/offers/${offerId}?mode=${isDemoView ? 'demo' : 'real'}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      showSuccess(`Status da oferta atualizado para ${newStatus}!`);
      refreshOffers();
    } catch (err: any) {
      showError(err.message);
    }
  };





  // Register Performance (strict check limit transaction)
  const handleAddPerformance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddPerformance) return;
    try {
      await apiFetch(`/experiments/${showAddPerformance}/performance?mode=${isDemoView ? 'demo' : 'real'}`, {
        method: 'POST',
        body: JSON.stringify(perfForm)
      });
      showSuccess('Dados de performance registrados!');
      setShowAddPerformance(null);
      setPerfForm({
        date: new Date().toISOString().split('T')[0], source: 'MANUAL', investment: 0, impressions: 0, cliques: 0,
        conversas: 0, pedidos: 0, vendas: 0, receita: 0, reembolsos: 0, taxas: 0, outros_custos: 0
      });
      refreshExperiments();
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Request/Approve Capital (ADMIN ONLY)
  const handleRequestCapital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRequestCapital) return;
    try {
      await apiFetch(`/experiments/${showRequestCapital.id}/capital?mode=${isDemoView ? 'demo' : 'real'}`, {
        method: 'POST',
        body: JSON.stringify(capitalForm)
      });
      showSuccess('Capital autorizado com sucesso!');
      setShowRequestCapital(null);
      setCapitalForm({ amount: 0, justification: '' });
      refreshExperiments();
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Clear demo database handler
  const handleClearDemoData = async () => {
    if (!window.confirm('Tem certeza absoluta que deseja excluir TODOS os dados de demonstração (is_demo = true)? Esta ação não afeta os dados reais.')) return;
    try {
      await apiFetch('/config/clear-demo', { method: 'POST' });
      showSuccess('Dados demo deletados com sucesso!');
      loadData();
    } catch (err: any) {
      showError(err.message);
    }
  };



  const isPublicOffer = location.pathname.startsWith('/p/');
  const isOrderDelivery = location.pathname.startsWith('/pedido/');
  const isAccessRecovery = location.pathname.startsWith('/acesso/');

  if (isAccessRecovery) {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const rawRecoveryToken = pathParts[0] === 'acesso' ? pathParts[1] : '';
    return (
      <AccessRecoveryView
        recoveryToken={rawRecoveryToken ? decodeURIComponent(rawRecoveryToken).trim() : undefined}
        showError={showError}
        showSuccess={showSuccess}
      />
    );
  }

  if (isOrderDelivery) {
    return (
      <OrderDeliveryView
        showError={showError}
        showSuccess={showSuccess}
      />
    );
  }

  // NORQVA-0038: página de vendas do kit (preços e parcelas vêm da oferta)
  if (location.pathname.startsWith('/kit/')) {
    return (
      <KitLandingPage
        showError={showError}
        showSuccess={showSuccess}
      />
    );
  }

  if (isPublicOffer) {
    return (
      <PublicOfferPage
        showError={showError}
        showSuccess={showSuccess}
      />
    );
  }

  const isAuthRoute = location.pathname === '/login' || location.pathname === '/forgot-password' || location.pathname === '/reset-password';

  if (!currentUser || isAuthRoute) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden select-none">
        {/* Global Toast Error & Success */}
        {globalError && (
          <div className="fixed top-4 right-4 z-50 bg-red-950 border border-red-500 text-red-200 px-4 py-3 rounded-md shadow-lg flex items-center gap-2 max-w-md animate-bounce">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <span className="text-sm font-medium">{globalError}</span>
          </div>
        )}
        {globalSuccess && (
          <div className="fixed top-4 right-4 z-50 bg-emerald-950 border border-emerald-500 text-emerald-200 px-4 py-3 rounded-md shadow-lg flex items-center gap-2 max-w-md">
            <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium">{globalSuccess}</span>
          </div>
        )}

        {/* Decorative Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-60"></div>
        
        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 flex flex-col items-center">
          <div className="h-10 w-10 rounded bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center mb-4">
            <Shield className="h-5 w-5 text-emerald-400" />
          </div>
          <h2 className="mt-6 text-center text-xl font-bold tracking-tight text-slate-100">
            INTELLIGENCE & PERFORMANCE
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Centro operacional e analítico de performance digital
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
          <div className="bg-slate-900/80 border border-slate-800 backdrop-blur-md py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="space-y-6">
              {location.pathname === '/reset-password' || recoveryState !== 'NONE' ? (
                <PasswordRecovery
                  recoveryState={recoveryState}
                  setRecoveryState={setRecoveryState}
                  setAuthMode={setAuthMode}
                  showError={showError}
                  showSuccess={showSuccess}
                  onNavigateToLogin={() => navigate('/login')}
                />
              ) : location.pathname === '/forgot-password' ? (
                <ForgotPassword
                  setIsForgotPasswordView={(val) => navigate(val ? '/forgot-password' : '/login')}
                  showError={showError}
                  showSuccess={showSuccess}
                />
              ) : (
                <Login
                  authMode={authMode}
                  setAuthMode={setAuthMode}
                  usersList={usersList}
                  handleLogin={handleLogin}
                  setIsForgotPasswordView={(val) => navigate(val ? '/forgot-password' : '/login')}
                  showError={showError}
                  isProduction={isProduction}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!introFinished) {
    return <IntroSequence onFinish={() => setIntroFinished(true)} />;
  }

  // Active screens rendering helper
  return (
    <GlobalPeriodProvider>
      <AppShell
      globalError={globalError}
      globalSuccess={globalSuccess}
      isDemoView={isDemoView}
      setIsDemoView={setIsDemoView}
      nav={{
        currentUser: currentUser!,
        activeTab,
        setActiveTab,
        handleSignOut,
        badges: { 'campaigns': openAlertsCount }
      }}
      // NORQVA-0004 + NORQVA-0071: one period for every screen, in the fixed top bar,
      // shown only on the screens where it filters the numbers
      showPeriodFilter={PERIOD_AWARE_TABS.includes(activeTab)}
    >
          {activeTab === 'dashboard' && (
            <div className="space-y-4">
              {/* NORQVA-0030: Visão Geral = entrada do dia (visão executiva) + resumo do crédito Meta (ADMIN).
                  NORQVA-0071: o crédito Meta vem logo depois do tráfego Meta Ads (resultados, funil e tráfego primeiro). */}
              <DashboardView
                metaCreditSlot={
                  <CreditSummary
                    currentUser={currentUser}
                    isDemoView={isDemoView}
                    apiFetch={apiFetch}
                    onOpenDetails={() => setActiveTab('meta-credit')}
                  />
                }
                section="overview"
                currentUser={currentUser}
                isDemoView={isDemoView}
                experiments={experiments}
                apiFetch={apiFetch}
                onSelectExperiment={(exp: any) => setShowExpDetails(exp)}
                onRegisterPerformance={() => {}}
                onAuthorizeCapital={() => {}}
                refreshTrigger={dashboardRefreshTrigger}
                onViewSales={() => setActiveTab('sales')}
                onOpenTab={setActiveTab}
                showError={showError}
                showSuccess={showSuccess}
              />
            </div>
          )}

          {activeTab === 'results' && (
            <ResultsView
              currentUser={currentUser}
              isDemoView={isDemoView}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
              decisions={decisions}
              refreshTrigger={dashboardRefreshTrigger}
              initialTab={resultsTab}
            />
          )}

          {activeTab === 'research' && (
            <ResearchView
              currentUser={currentUser}
              isDemoView={isDemoView}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
              initialTab={researchTab}
              history={
                <OpportunitiesView
                  readOnly
                  opportunities={opportunities}
                  users={usersList}
                  currentUser={currentUser}
                  isDemoView={isDemoView}
                  showError={showError}
                  showSuccess={showSuccess}
                  refreshOpportunities={refreshOpportunities}
                  refreshProducts={refreshProducts}
                  refreshDecisions={refreshDecisions}
                />
              }
            />
          )}

          {activeTab === 'products' && (
            <ProductsView
              products={products}
              offers={offers}
              currentUser={currentUser}
              isDemoView={isDemoView}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
              initialOpen={productsOpenAll ? 'all' : null}
              onAddProduct={() => setShowAddProduct(true)}
              onEditProduct={(prd: any) => {
                setShowEditProduct(prd);
                setEditProductForm({
                  name: prd.name || '',
                  category: prd.category || '',
                  description: prd.description || '',
                  estimated_cost: prd.estimated_cost === null || prd.estimated_cost === undefined ? '' : String(Number(prd.estimated_cost)).replace('.', ','),
                  observations: prd.observations || '',
                  status: prd.status,
                  origin_provenance: prd.origin_provenance || '',
                  origin_responsible_id: prd.origin_responsible_id || '',
                  origin_evidence: prd.origin_evidence || '',
                  origin_notes: prd.origin_notes || ''
                });
              }}
              onAddOffer={(productId: string) => {
                setOfferFormState(f => ({ ...f, product_id: productId }));
                setShowAddOffer(true);
              }}
              onCheckout={async (off: any) => {
                // O checkout da tela usa as mesmas condições que o comprador vê (cartão e adicional vêm da página pública)
                let merged = off;
                try {
                  if (off?.human_id && !off.is_demo) {
                    const r = await fetch(`${API_BASE_LIB}/public/offers/${encodeURIComponent(off.human_id)}`);
                    if (r.ok) {
                      const pub = await r.json();
                      // NORQVA-0065: delivery_files diz se é o kit de 5 (mostra kit ou livros avulsos, igual ao comprador)
                      merged = { ...off, card: pub?.card ?? null, bump: pub?.bump ?? off.bump ?? null, delivery_files: pub?.delivery_files ?? null };
                    }
                  }
                } catch (_) { /* sem a página pública, segue só com Pix */ }
                setCheckoutOffer(merged);
              }}
              onUpdateOfferStatus={handleUpdateOfferStatus}
              onProductsChanged={() => { refreshProducts(); refreshOffers(); }}
            />
          )}

          {/* NORQVA-0028: 'experiments', 'meta-ads' e 'method' abrem Campanhas (ver o efeito acima) */}
          {/* NORQVA-0025: o antigo Creative Lab ('creatives') abre a tela única Criativos */}
          {(activeTab === 'creative-factory' || activeTab === 'creatives') && (
            <CreativeFactoryView
              currentUser={currentUser}
              isDemoView={isDemoView}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
              products={products}
              offers={offers}
              onCreativeCreated={refreshCreatives}
            />
          )}

          {activeTab === 'campaigns' && (
            <CampaignsView
              currentUser={currentUser}
              isDemoView={isDemoView}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
              offers={offers}
            />
          )}

          {activeTab === 'sales' && (
            <SalesView
              currentUser={currentUser}
              isDemoView={isDemoView}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
            />
          )}

          {activeTab === 'whatsapp' && (
            <WhatsAppView currentUser={currentUser} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />
          )}

          {activeTab === 'brands' && (
            <BrandsView currentUser={currentUser} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />
          )}

          {activeTab === 'team' && (
            <TeamView users={usersList} />
          )}

          {activeTab === 'config' && (
            <ConfigView
              isDemoView={isDemoView}
              currentUser={currentUser}
              auditLogs={auditLogs}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
              onClearDemo={handleClearDemoData}
            />
          )}
      </AppShell>

      {/* -------------------- MODALS -------------------- */}



      {/* Modal Add Product */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-nq-surface rounded-nq max-w-md w-full p-6 text-sm">
            <h3 className="text-nq-section font-semibold text-nq-text mb-4">Planejar Novo Produto</h3>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="block text-xs text-nq-muted mb-1">Origem / Oportunidade (Opcional)</label>
                <select
                  value={productForm.opportunity_id}
                  onChange={e => setProductForm({ ...productForm, opportunity_id: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-text min-h-[44px]"
                >
                  <option value="">Nenhuma - Produto Independente</option>
                  {opportunities.map(o => (
                    <option key={o.id} value={o.id}>{o.human_id} - {o.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Nome do Produto</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Categoria</label>
                <input
                  type="text"
                  required
                  value={productForm.category}
                  onChange={e => setProductForm({ ...productForm, category: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Descrição</label>
                <textarea
                  required
                  value={productForm.description}
                  onChange={e => setProductForm({ ...productForm, description: e.target.value })}
                  rows={2}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Custo Estimado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={productForm.estimated_cost}
                  onChange={e => setProductForm({ ...productForm, estimated_cost: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-positive-text min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Observações</label>
                <textarea
                  value={productForm.observations}
                  onChange={e => setProductForm({ ...productForm, observations: e.target.value })}
                  rows={2}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  className="px-4 py-2 rounded-full bg-nq-raised text-nq-text hover:bg-nq-line font-semibold min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-nq-positive text-nq-on-positive font-bold hover:brightness-110 min-h-[44px]"
                >
                  Criar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Product / Update Status & Provenance */}
      {showEditProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-nq-surface rounded-nq max-w-md w-full p-6 text-sm overflow-y-auto max-h-[90vh] custom-scrollbar">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-bold text-nq-positive-text">
                Editar Produto
              </h3>
              <span className="px-2 py-0.5 rounded text-[12px] bg-nq-raised text-nq-muted">
                {showEditProduct.human_id}
              </span>
            </div>
            <form onSubmit={handleEditProduct} className="space-y-4">
              <div>
                <label className="block text-xs text-nq-muted mb-1">Nome do Produto</label>
                <input
                  aria-label="Nome do produto"
                  required
                  value={editProductForm.name}
                  onChange={e => setEditProductForm({ ...editProductForm, name: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-text min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Categoria</label>
                <input
                  aria-label="Categoria do produto"
                  value={editProductForm.category}
                  onChange={e => setEditProductForm({ ...editProductForm, category: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-text min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Descrição</label>
                <textarea
                  aria-label="Descrição do produto"
                  rows={3}
                  value={editProductForm.description}
                  onChange={e => setEditProductForm({ ...editProductForm, description: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-text min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Custo estimado (R$)</label>
                <input
                  aria-label="Custo estimado do produto"
                  inputMode="decimal"
                  value={editProductForm.estimated_cost}
                  onChange={e => setEditProductForm({ ...editProductForm, estimated_cost: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-text min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Observações</label>
                <textarea
                  aria-label="Observações do produto"
                  rows={2}
                  value={editProductForm.observations}
                  onChange={e => setEditProductForm({ ...editProductForm, observations: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-text min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Status</label>
                <select
                  value={editProductForm.status}
                  onChange={e => setEditProductForm({ ...editProductForm, status: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-text min-h-[44px]"
                >
                  <option value="PLANEJADO">PLANEJADO</option>
                  <option value="EM_DESENVOLVIMENTO">EM DESENVOLVIMENTO</option>
                  <option value="REVISAO">REVISÃO</option>
                  <option value="PRONTO">PRONTO (Bloqueado sem procedência)</option>
                  <option value="ATIVO">ATIVO (Bloqueado sem procedência)</option>
                  <option value="PAUSADO">PAUSADO</option>
                  <option value="ARQUIVADO">ARQUIVADO (Soft Delete)</option>
                </select>
              </div>

              {/* Provenance fields panel */}
              <div className="p-3 rounded bg-nq-bg space-y-3">
                <div className="text-[12px] text-nq-muted font-bold flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 text-nq-positive-text" />
                  Informações de Procedência (Obrigatório para PRONTO/ATIVO)
                </div>
                <div>
                  <label className="block text-[12px] text-nq-subtle mb-0.5">Procedência</label>
                  <select
                    value={editProductForm.origin_provenance}
                    onChange={e => setEditProductForm({ ...editProductForm, origin_provenance: e.target.value })}
                    className="w-full bg-nq-surface rounded-nq p-1.5 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-body text-nq-text min-h-[44px]"
                  >
                    <option value="">Selecione...</option>
                    <option value="ORIGINAL">ORIGINAL (Código proprietário)</option>
                    <option value="LICENCIADO">LICENCIADO (Parceria/Licença)</option>
                    <option value="PRODUZIDO_SOB_ENCOMENDA">PRODUZIDO SOB ENCOMENDA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-nq-subtle mb-0.5">Responsável pelo Origem</label>
                  <select
                    value={editProductForm.origin_responsible_id}
                    onChange={e => setEditProductForm({ ...editProductForm, origin_responsible_id: e.target.value })}
                    className="w-full bg-nq-surface rounded-nq p-1.5 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-body text-nq-text min-h-[44px]"
                  >
                    <option value="">Selecione...</option>
                    {usersList.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-nq-subtle mb-0.5">Evidência / Documentação de Origem</label>
                  <textarea
                    placeholder="Ex: Registro de patente, Link do repo Git privado, Contrato assinado..."
                    value={editProductForm.origin_evidence}
                    onChange={e => setEditProductForm({ ...editProductForm, origin_evidence: e.target.value })}
                    rows={2}
                    className="w-full bg-nq-surface rounded-nq p-1.5 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-body text-nq-text min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-nq-subtle mb-0.5">Notas Adicionais</label>
                  <textarea
                    value={editProductForm.origin_notes}
                    onChange={e => setEditProductForm({ ...editProductForm, origin_notes: e.target.value })}
                    rows={1}
                    className="w-full bg-nq-surface rounded-nq p-1.5 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-body text-nq-text min-h-[44px]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditProduct(null)}
                  className="px-4 py-2 rounded-full bg-nq-raised text-nq-text hover:bg-nq-line font-semibold min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-nq-positive text-nq-on-positive font-bold hover:brightness-110 min-h-[44px]"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Offer */}
      {showAddOffer && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-nq-surface rounded-nq max-w-md w-full p-6 text-sm">
            <h3 className="text-nq-section font-semibold text-nq-text mb-4">Criar Oferta comercial</h3>
            <form onSubmit={handleAddOffer} className="space-y-4">
              <div>
                <label className="block text-xs text-nq-muted mb-1">Produto Vinculado</label>
                <select
                  required
                  value={offerFormState.product_id}
                  onChange={e => setOfferFormState({ ...offerFormState, product_id: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-text min-h-[44px]"
                >
                  <option value="">Selecione o produto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.human_id} - {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Nome da Oferta</label>
                <input
                  type="text"
                  required
                  value={offerFormState.name}
                  onChange={e => setOfferFormState({ ...offerFormState, name: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Preço Cheio (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={offerFormState.price}
                    onChange={e => setOfferFormState({ ...offerFormState, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-positive-text min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Preço Promocional (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={offerFormState.promotional_price}
                    onChange={e => setOfferFormState({ ...offerFormState, promotional_price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 text-nq-positive-text min-h-[44px]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Bônus</label>
                <input
                  type="text"
                  placeholder="Ex: Suporte VIP, Consultoria inclusa..."
                  value={offerFormState.bonus}
                  onChange={e => setOfferFormState({ ...offerFormState, bonus: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Descrição</label>
                <textarea
                  required
                  value={offerFormState.description}
                  onChange={e => setOfferFormState({ ...offerFormState, description: e.target.value })}
                  rows={2}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Upsell Sugerido</label>
                  <input
                    type="text"
                    value={offerFormState.upsell}
                    onChange={e => setOfferFormState({ ...offerFormState, upsell: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Cross-sell Sugerido</label>
                  <input
                    type="text"
                    value={offerFormState.cross_sell}
                    onChange={e => setOfferFormState({ ...offerFormState, cross_sell: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-nq-positive/40 min-h-[44px]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddOffer(false)}
                  className="px-4 py-2 rounded-full bg-nq-raised text-nq-text hover:bg-nq-line font-semibold min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-nq-positive text-nq-on-positive font-bold hover:brightness-110 min-h-[44px]"
                >
                  Criar Oferta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}





      {/* Modal Register Performance (Manual metrics input) */}
      {showAddPerformance && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full p-6 text-sm overflow-y-auto max-h-[90vh] custom-scrollbar">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-bold tracking-widest font-mono text-emerald-400 uppercase">Registrar Performance de Testes</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                Lançamento manual
              </span>
            </div>
            <form onSubmit={handleAddPerformance} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Data</label>
                  <input
                    type="date"
                    required
                    value={perfForm.date}
                    onChange={e => setPerfForm({ ...perfForm, date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Origem / Fonte</label>
                  <select
                    value={perfForm.source}
                    onChange={e => setPerfForm({ ...perfForm, source: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200 font-mono"
                  >
                    <option value="MANUAL">MANUAL (Lançamento)</option>
                    <option value="META">META ADS API (Preparado)</option>
                    <option value="IMPORT">IMPORT PLANILHA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Investimento (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={perfForm.investment}
                    onChange={e => setPerfForm({ ...perfForm, investment: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono text-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Impressões</label>
                  <input
                    type="number"
                    value={perfForm.impressions}
                    onChange={e => setPerfForm({ ...perfForm, impressions: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Cliques</label>
                  <input
                    type="number"
                    value={perfForm.cliques}
                    onChange={e => setPerfForm({ ...perfForm, cliques: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Conversas (Wpp)</label>
                  <input
                    type="number"
                    value={perfForm.conversas}
                    onChange={e => setPerfForm({ ...perfForm, conversas: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Vendas Fechadas</label>
                  <input
                    type="number"
                    value={perfForm.vendas}
                    onChange={e => setPerfForm({ ...perfForm, vendas: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Receita (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={perfForm.receita}
                    onChange={e => setPerfForm({ ...perfForm, receita: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Reembolsos (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={perfForm.reembolsos}
                    onChange={e => setPerfForm({ ...perfForm, reembolsos: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono text-red-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Taxas Gateway (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={perfForm.taxas}
                    onChange={e => setPerfForm({ ...perfForm, taxas: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Outros Custos Var.</label>
                  <input
                    type="number"
                    step="0.01"
                    value={perfForm.outros_custos}
                    onChange={e => setPerfForm({ ...perfForm, outros_custos: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddPerformance(null)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
                >
                  Lançar Dados
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Request/Authorize Capital (ADMIN only) */}
      {showRequestCapital && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 text-sm">
            <h3 className="text-md font-bold tracking-widest font-mono text-emerald-400 mb-4 uppercase">
              Autorização de Orçamento (Capital at Risk)
            </h3>
            <div className="mb-3 text-xs text-slate-400">
              <span className="font-bold text-slate-200">Experimento:</span> {showRequestCapital.human_id} - {showRequestCapital.name}
            </div>
            <form onSubmit={handleRequestCapital} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Novo Capital Aprovado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={capitalForm.amount}
                  onChange={e => setCapitalForm({ ...capitalForm, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono text-emerald-400 font-bold text-md"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Justificativa da Autorização</label>
                <textarea
                  required
                  placeholder="Justificativa legal e estratégica..."
                  value={capitalForm.justification}
                  onChange={e => setCapitalForm({ ...capitalForm, justification: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequestCapital(null)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
                >
                  Confirmar Autorização
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Experiment Details Modal */}
      {showExpDetails && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-xl w-full p-6 text-sm overflow-y-auto max-h-[85vh] custom-scrollbar">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold font-mono text-emerald-400 uppercase">Detalhes do Experimento</h3>
                <div className="text-[10px] text-slate-400 font-mono">{showExpDetails.human_id}</div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                {showExpDetails.status}
              </span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 font-mono uppercase">Nome</div>
                <div className="text-slate-200 font-semibold">{showExpDetails.name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 font-mono uppercase">Hipótese</div>
                <div className="text-slate-300 italic">{showExpDetails.hypothesis}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500 font-mono uppercase">Produto</div>
                  <div className="text-slate-200">{showExpDetails.product_name}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-mono uppercase">Oferta</div>
                  <div className="text-slate-200">{showExpDetails.offer_name}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 font-mono uppercase mb-2">Criativos Associados</div>
                <div className="space-y-2">
                  {showExpDetails.creatives && showExpDetails.creatives.map((c: any) => (
                    <div key={c.id} className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div className="text-xs">
                        <span className="font-mono text-emerald-400 font-bold">{c.human_id}</span>: {c.hook}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 font-mono uppercase mb-1">Capital at Risk</div>
                <div className="p-3 rounded bg-slate-950 border border-slate-800 grid grid-cols-3 gap-2 text-center font-mono">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Solicitado</div>
                    <div className="text-slate-300">R${showExpDetails.capital_requested}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Aprovado</div>
                    <div className="text-emerald-400 font-bold">R${showExpDetails.capital_approved}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Gasto</div>
                    <div className="text-amber-500">R${showExpDetails.capital_used}</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpDetails(null)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Checkout View */}
      {checkoutOffer && (
        <CheckoutView
          offer={checkoutOffer}
          isDemo={isDemoView}
          currentUser={currentUser}
          onOrderCreated={(orderResult) => {
            // NORQVA-0043: guarda o nome da oferta para a tela de pagamento usar o visual do produto
            setActivePaymentOrder({ ...orderResult, offer_name_for_look: checkoutOffer?.name || '' });
            setCheckoutOffer(null);
          }}
          onCancel={() => setCheckoutOffer(null)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}

      {/* Modal Payment Status */}
      {activePaymentOrder && (
        <PaymentStatus
          orderId={activePaymentOrder.id}
          checkoutToken={activePaymentOrder.checkout_token || ''}
          amount={activePaymentOrder.total_amount}
          paymentMethod={activePaymentOrder.payment_method === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX'}
          installments={activePaymentOrder.installments}
          look={/bolso/i.test(String(activePaymentOrder.offer_name_for_look || '')) ? 'dark' : 'light'}
          isDemo={isDemoView}
          onPaymentConfirmed={() => {
            const current = activePaymentOrder;
            setActivePaymentOrder(null);
            setActiveDeliveryOrder(current);
          }}
          onClose={() => setActivePaymentOrder(null)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}

      {/* Modal Digital Delivery */}
      {activeDeliveryOrder && (
        <DigitalDelivery
          orderId={activeDeliveryOrder.id}
          checkoutToken={activeDeliveryOrder.checkout_token || ''}
          isDemo={isDemoView}
          onClose={() => setActiveDeliveryOrder(null)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}
    </GlobalPeriodProvider>
  );
}

// -------------------- DETAILED SUBCOMPONENTS --------------------

// Premium entry animation sequence
function IntroSequence({ onFinish }: { onFinish: () => void }) {
  const words = ['INTELEGÊNCIA', 'CONTROLE', 'TERRITÓRIO', 'TECNOLOGIA', 'ESCALA'];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < words.length) {
      const timer = setTimeout(() => {
        setIndex(i => i + 1);
      }, 550);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        onFinish();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [index]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center relative overflow-hidden font-mono select-none">
      {/* Target scanning line */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_49%,rgba(16,185,129,0.05)_50%,transparent_51%)] bg-[size:100%_4rem] animate-[pulse_2s_infinite]"></div>

      <div className="text-center space-y-6 relative z-10">
        <div className="text-[10px] tracking-widest text-slate-500 uppercase">NORQVA Intelligence Core System Initializing...</div>
        
        <div className="h-16 flex items-center justify-center">
          {index < words.length ? (
            <h2 className="text-3xl font-black tracking-[0.3em] text-emerald-400 animate-pulse">
              {words[index]}
            </h2>
          ) : (
            <div className="text-emerald-500 font-bold text-sm tracking-wider animate-bounce flex items-center gap-2">
              <Activity className="h-4 w-4 animate-spin" />
              SISTEMA ONLINE - CARREGANDO DASHBOARD
            </div>
          )}
        </div>

        <div className="w-64 bg-slate-900 h-1 rounded-full overflow-hidden border border-slate-800">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${(index / words.length) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
