import React, { useState, useEffect } from 'react';
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
import { CreativeMediaView } from './features/creative-media/CreativeMediaView';
import { OpportunitiesView } from './features/opportunities/OpportunitiesView';
import { ExperimentsView } from './features/experiments/ExperimentsView';
import { CheckoutView } from './features/checkout/CheckoutView';
import { PaymentStatus } from './features/payment/PaymentStatus';
import { DigitalDelivery } from './features/delivery/DigitalDelivery';
import { DigitalAssetAdminModal } from './features/delivery/DigitalAssetAdminModal';
import { MetaAdsView } from './features/acquisition/MetaAdsView';
import { AppShell } from './components/layout/AppShell';

import { apiFetch as apiFetchLib } from './lib/api';


import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './features/auth/useAuth';





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
    showError,
    showSuccess,
    handleLogin,
    handleSignOut
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const url = new URL(window.location.href);
    const hasCode = url.searchParams.get('code');
    const isRecoveryHash = window.location.hash.includes('type=recovery');
    const isRecovery = location.pathname === '/reset-password' || isRecoveryHash || hasCode;
    const isForgot = location.pathname === '/forgot-password';
    const isLogin = location.pathname === '/login';

    if (!currentUser) {
      if (!isRecovery && !isForgot && !isLogin) {
        navigate('/login', { replace: true });
      }
    } else {
      if (isLogin || isForgot || isRecovery) {
        navigate('/', { replace: true });
      }
    }
  }, [currentUser, location.pathname]);


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
    status: '', origin_provenance: '', origin_responsible_id: '', origin_evidence: '', origin_notes: ''
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
  const apiFetch = async (url: string, options: RequestInit = {}) => {
    return apiFetchLib(url, options, authMode, currentUser, () => {
      setCurrentUser(null);
    });
  };




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
      if (editProductForm.origin_provenance) payload.origin_provenance = editProductForm.origin_provenance;
      if (editProductForm.origin_responsible_id) payload.origin_responsible_id = editProductForm.origin_responsible_id;
      if (editProductForm.origin_evidence) payload.origin_evidence = editProductForm.origin_evidence;
      if (editProductForm.origin_notes) payload.origin_notes = editProductForm.origin_notes;

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
    <>
      <AppShell
      globalError={globalError}
      globalSuccess={globalSuccess}
      isDemoView={isDemoView}
      sidebarProps={{
        currentUser: currentUser!,
        activeTab,
        setActiveTab,
        handleSignOut
      }}
      headerProps={{
        activeTab,
        isDemoView,
        setIsDemoView,
        authMode,
        loadData
      }}
    >
          {activeTab === 'dashboard' && (
            <DashboardView
              currentUser={currentUser}
              isDemoView={isDemoView}
              experiments={experiments}
              apiFetch={apiFetch}
              onSelectExperiment={(exp: any) => setShowExpDetails(exp)}
              onRegisterPerformance={(id: string) => {
                setShowAddPerformance(id);
                setPerfForm(f => ({ ...f, date: new Date().toISOString().split('T')[0] }));
              }}
              onAuthorizeCapital={(exp: any) => {
                setShowRequestCapital(exp);
                setCapitalForm({ amount: parseFloat(exp.capital_approved), justification: '' });
              }}
              refreshTrigger={dashboardRefreshTrigger}
              showError={showError}
              showSuccess={showSuccess}
            />
          )}

          {activeTab === 'opportunities' && (
            <OpportunitiesView
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
          )}

          {activeTab === 'products' && (
            <ProductsView
              products={products}
              users={usersList}
              opportunities={opportunities}
              currentUser={currentUser}
              onAddProduct={() => setShowAddProduct(true)}
              onEditProduct={(prd: any) => {
                setShowEditProduct(prd);
                setEditProductForm({
                  status: prd.status,
                  origin_provenance: prd.origin_provenance || '',
                  origin_responsible_id: prd.origin_responsible_id || '',
                  origin_evidence: prd.origin_evidence || '',
                  origin_notes: prd.origin_notes || ''
                });
              }}
            />
          )}

          {activeTab === 'offers' && (
            <OffersView
              offers={offers}
              products={products}
              onAddOffer={() => setShowAddOffer(true)}
              onCheckout={(off: any) => setCheckoutOffer(off)}
              onUpdateOfferStatus={handleUpdateOfferStatus}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
            />
          )}

          {activeTab === 'creatives' && (
            <CreativeMediaView
              creatives={creatives}
              products={products}
              offers={offers}
              isDemoView={isDemoView}
              currentUser={currentUser}
              showError={showError}
              showSuccess={showSuccess}
              refreshCreatives={refreshCreatives}
            />
          )}

          {activeTab === 'experiments' && (
            <ExperimentsView
              experiments={experiments}
              products={products}
              offers={offers}
              creatives={creatives}
              currentUser={currentUser}
              isDemoView={isDemoView}
              onSelectExperiment={setShowExpDetails}
              onRegisterPerformance={setShowAddPerformance}
              onAuthorizeCapital={setShowRequestCapital}
              showError={showError}
              showSuccess={showSuccess}
              refreshExperiments={refreshExperiments}
            />
          )}

          {activeTab === 'meta-ads' && (
            <MetaAdsView
              currentUser={currentUser}
              isDemoView={isDemoView}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
            />
          )}

          {activeTab === 'decisions' && (
            <DecisionsView decisions={decisions} />
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
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 text-sm">
            <h3 className="text-md font-bold tracking-widest font-mono text-emerald-400 mb-4 uppercase">Planejar Novo Produto</h3>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Origem / Oportunidade (Opcional)</label>
                <select
                  value={productForm.opportunity_id}
                  onChange={e => setProductForm({ ...productForm, opportunity_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200"
                >
                  <option value="">Nenhuma - Produto Independente</option>
                  {opportunities.map(o => (
                    <option key={o.id} value={o.id}>{o.human_id} - {o.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Nome do Produto</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Categoria</label>
                <input
                  type="text"
                  required
                  value={productForm.category}
                  onChange={e => setProductForm({ ...productForm, category: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Descrição</label>
                <textarea
                  required
                  value={productForm.description}
                  onChange={e => setProductForm({ ...productForm, description: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Custo Estimado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={productForm.estimated_cost}
                  onChange={e => setProductForm({ ...productForm, estimated_cost: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono text-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Observações</label>
                <textarea
                  value={productForm.observations}
                  onChange={e => setProductForm({ ...productForm, observations: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
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
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 text-sm overflow-y-auto max-h-[90vh] custom-scrollbar">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-bold tracking-widest font-mono text-emerald-400 uppercase">
                Atualizar Status do Produto
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                {showEditProduct.human_id}
              </span>
            </div>
            <form onSubmit={handleEditProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Status</label>
                <select
                  value={editProductForm.status}
                  onChange={e => setEditProductForm({ ...editProductForm, status: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200"
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
              <div className="p-3 border border-slate-800 rounded bg-slate-950/50 space-y-3">
                <div className="text-[10px] font-mono uppercase text-slate-400 font-bold flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 text-emerald-500" />
                  Informações de Procedência (Obrigatório para PRONTO/ATIVO)
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-0.5">Procedência</label>
                  <select
                    value={editProductForm.origin_provenance}
                    onChange={e => setEditProductForm({ ...editProductForm, origin_provenance: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 focus:outline-none focus:border-emerald-500 text-xs text-slate-200"
                  >
                    <option value="">Selecione...</option>
                    <option value="ORIGINAL">ORIGINAL (Código proprietário)</option>
                    <option value="LICENCIADO">LICENCIADO (Parceria/Licença)</option>
                    <option value="PRODUZIDO_SOB_ENCOMENDA">PRODUZIDO SOB ENCOMENDA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-0.5">Responsável pelo Origem</label>
                  <select
                    value={editProductForm.origin_responsible_id}
                    onChange={e => setEditProductForm({ ...editProductForm, origin_responsible_id: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 focus:outline-none focus:border-emerald-500 text-xs text-slate-200"
                  >
                    <option value="">Selecione...</option>
                    {usersList.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-0.5">Evidência / Documentação de Origem</label>
                  <textarea
                    placeholder="Ex: Registro de patente, Link do repo Git privado, Contrato assinado..."
                    value={editProductForm.origin_evidence}
                    onChange={e => setEditProductForm({ ...editProductForm, origin_evidence: e.target.value })}
                    rows={2}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 focus:outline-none focus:border-emerald-500 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-0.5">Notas Adicionais</label>
                  <textarea
                    value={editProductForm.origin_notes}
                    onChange={e => setEditProductForm({ ...editProductForm, origin_notes: e.target.value })}
                    rows={1}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 focus:outline-none focus:border-emerald-500 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditProduct(null)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
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
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 text-sm">
            <h3 className="text-md font-bold tracking-widest font-mono text-emerald-400 mb-4 uppercase">Criar Oferta comercial</h3>
            <form onSubmit={handleAddOffer} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Produto Vinculado</label>
                <select
                  required
                  value={offerFormState.product_id}
                  onChange={e => setOfferFormState({ ...offerFormState, product_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200"
                >
                  <option value="">Selecione o produto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.human_id} - {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Nome da Oferta</label>
                <input
                  type="text"
                  required
                  value={offerFormState.name}
                  onChange={e => setOfferFormState({ ...offerFormState, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Preço Cheio (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={offerFormState.price}
                    onChange={e => setOfferFormState({ ...offerFormState, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Preço Promocional (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={offerFormState.promotional_price}
                    onChange={e => setOfferFormState({ ...offerFormState, promotional_price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono text-emerald-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Bônus</label>
                <input
                  type="text"
                  placeholder="Ex: Suporte VIP, Consultoria inclusa..."
                  value={offerFormState.bonus}
                  onChange={e => setOfferFormState({ ...offerFormState, bonus: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Descrição</label>
                <textarea
                  required
                  value={offerFormState.description}
                  onChange={e => setOfferFormState({ ...offerFormState, description: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Upsell Sugerido</label>
                  <input
                    type="text"
                    value={offerFormState.upsell}
                    onChange={e => setOfferFormState({ ...offerFormState, upsell: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Cross-sell Sugerido</label>
                  <input
                    type="text"
                    value={offerFormState.cross_sell}
                    onChange={e => setOfferFormState({ ...offerFormState, cross_sell: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddOffer(false)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
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
            setCheckoutOffer(null);
            setActivePaymentOrder(orderResult);
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
    </>
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



// 3. Products (Produtos) Subcomponent
function ProductsView({ products, users, opportunities, currentUser, onAddProduct, onEditProduct }: any) {
  const isProduct = currentUser.role === 'PRODUCT' || currentUser.role === 'ADMIN';

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-200 font-mono">Módulo de Produtos</h2>
          <p className="text-xs text-slate-400">Controle e rastreabilidade da origem dos produtos de performance</p>
        </div>
        {isProduct && (
          <button
            onClick={onAddProduct}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-slate-950 font-bold rounded hover:bg-emerald-400 transition"
          >
            <Plus className="h-4 w-4" />
            Planejar Produto
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products.length === 0 ? (
          <div className="col-span-2 p-12 border border-slate-800 rounded bg-slate-900/20 text-center text-slate-500 font-mono">
            Nenhum produto cadastrado.
          </div>
        ) : (
          products.map((prd: any) => (
            <div key={prd.id} className="p-4 border border-slate-800 bg-slate-900/30 rounded flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-emerald-400 font-bold text-xs">{prd.human_id}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    prd.status === 'PRONTO' || prd.status === 'ATIVO' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {prd.status}
                  </span>
                </div>
                <h3 className="text-md font-bold text-slate-200 mt-2">{prd.name}</h3>
                <div className="text-xs text-slate-400 font-mono">{prd.category}</div>
                <p className="text-xs text-slate-300 mt-2 line-clamp-2">{prd.description}</p>
              </div>

              {/* Provenance info display */}
              <div className="p-2.5 rounded bg-slate-950/60 border border-slate-850 text-xs space-y-1">
                <div className="text-[10px] font-mono text-slate-500 uppercase font-bold">Rastreabilidade / Procedência</div>
                {prd.origin_provenance ? (
                  <div className="space-y-1">
                    <div className="text-slate-300">
                      Origem: <span className="font-mono text-emerald-400 font-semibold">{prd.origin_provenance}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Evidência: {prd.origin_evidence}
                    </div>
                  </div>
                ) : (
                  <div className="text-red-400/80 italic font-mono text-[10px] flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Procedência ausente. Status PRONTO bloqueado no banco.
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {isProduct && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => onEditProduct(prd)}
                    className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold text-xs transition"
                  >
                    Atualizar Status & Procedência
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// 4. Offers (Ofertas) Subcomponent
function OffersView({ offers, products, onAddOffer, onCheckout, onUpdateOfferStatus, apiFetch, showError, showSuccess }: any) {
  const [managingAssetOffer, setManagingAssetOffer] = React.useState<any>(null);

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-200 font-mono">Módulo de Ofertas comercial</h2>
          <p className="text-xs text-slate-400">Gestão das ofertas específicas associadas aos produtos</p>
        </div>
        <button
          onClick={onAddOffer}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-slate-950 font-bold rounded hover:bg-emerald-400 transition"
        >
          <Plus className="h-4 w-4" />
          Nova Oferta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {offers.length === 0 ? (
          <div className="col-span-3 p-12 border border-slate-800 rounded bg-slate-900/20 text-center text-slate-500 font-mono">
            Nenhuma oferta cadastrada.
          </div>
        ) : (
          offers.map((off: any) => {
            const hasPromo = off.promotional_price !== null && off.promotional_price !== undefined && String(off.promotional_price).trim() !== '';
            const isCheckoutEligible = off.status === 'TESTE' || off.status === 'ATIVA';

            return (
              <div key={off.id} className="p-4 border border-slate-800 bg-slate-900/30 rounded flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-emerald-400 font-bold text-xs">{off.human_id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                      off.status === 'ATIVA' ? 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-400' :
                      off.status === 'TESTE' ? 'bg-cyan-950/60 border border-cyan-500/30 text-cyan-400' :
                      off.status === 'PAUSADA' ? 'bg-amber-950/60 border border-amber-500/30 text-amber-400' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {off.status}
                    </span>
                  </div>
                  <h3 className="text-md font-bold text-slate-200 mt-2">{off.name}</h3>
                  <div className="text-[10px] text-slate-400 font-mono uppercase mt-0.5">Prod: {off.product_name}</div>
                  
                  <div className="mt-3 flex items-baseline gap-2">
                    {hasPromo ? (
                      <>
                        <span className="text-xl font-bold font-mono text-emerald-400">
                          R${parseFloat(off.promotional_price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs line-through text-slate-500 font-mono">
                          R${parseFloat(off.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </>
                    ) : (
                      <span className="text-xl font-bold font-mono text-emerald-400">
                        R${parseFloat(off.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  
                  <p className="text-xs text-slate-300 mt-2 line-clamp-2">{off.description}</p>
                </div>

                <div className="space-y-3">
                  <div className="text-xs bg-slate-950/40 p-2.5 rounded font-mono space-y-1 text-slate-400">
                    <div><span className="text-slate-500">Bônus:</span> {off.bonus || 'Nenhum'}</div>
                    {off.upsell && <div><span className="text-slate-500">Upsell:</span> {off.upsell}</div>}
                    {off.cross_sell && <div><span className="text-slate-500">Cross:</span> {off.cross_sell}</div>}
                  </div>

                  {/* Digital Assets Admin Link Button */}
                  <button
                    onClick={() => setManagingAssetOffer(off)}
                    className="w-full py-1 px-2 rounded bg-slate-800/80 border border-slate-700/80 hover:bg-slate-800 text-slate-300 text-[11px] font-mono transition flex items-center justify-center gap-1.5"
                  >
                    <Package className="h-3.5 w-3.5 text-emerald-400" />
                    Ativos Digitais
                  </button>

                  {/* Status transition controls */}
                  {onUpdateOfferStatus && (
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60">
                      {off.status === 'RASCUNHO' && (
                        <button
                          onClick={() => onUpdateOfferStatus(off.id, 'TESTE')}
                          className="flex-1 py-1 px-2 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/40 text-[11px] font-mono font-semibold transition text-center"
                        >
                          Ativar para Teste (TESTE)
                        </button>
                      )}
                      {off.status === 'TESTE' && (
                        <>
                          <button
                            onClick={() => onUpdateOfferStatus(off.id, 'ATIVA')}
                            className="flex-1 py-1 px-2 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40 text-[11px] font-mono font-semibold transition text-center"
                          >
                            Ativar Oferta (ATIVA)
                          </button>
                          <button
                            onClick={() => onUpdateOfferStatus(off.id, 'PAUSADA')}
                            className="py-1 px-2 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 text-[11px] font-mono transition"
                          >
                            Pausar
                          </button>
                        </>
                      )}
                      {off.status === 'ATIVA' && (
                        <button
                          onClick={() => onUpdateOfferStatus(off.id, 'PAUSADA')}
                          className="flex-1 py-1 px-2 rounded bg-amber-950/40 border border-amber-500/30 text-amber-400 hover:bg-amber-900/40 text-[11px] font-mono font-semibold transition text-center"
                        >
                          Pausar Oferta (PAUSADA)
                        </button>
                      )}
                      {off.status === 'PAUSADA' && (
                        <button
                          onClick={() => onUpdateOfferStatus(off.id, 'ATIVA')}
                          className="flex-1 py-1 px-2 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40 text-[11px] font-mono font-semibold transition text-center"
                        >
                          Reativar (ATIVA)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Checkout button or blocker notice */}
                  {isCheckoutEligible ? (
                    onCheckout && (
                      <button
                        onClick={() => onCheckout(off)}
                        className="w-full py-1.5 px-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Checkout Oferta
                      </button>
                    )
                  ) : (
                    <div
                      className="w-full py-1.5 px-3 rounded bg-slate-950/60 border border-slate-850 text-slate-500 text-[11px] font-mono text-center flex items-center justify-center gap-1.5 select-none"
                      title="Checkout bloqueado: status da oferta deve ser TESTE ou ATIVA"
                    >
                      <AlertTriangle className="h-3 w-3 text-slate-500" />
                      Checkout indisponível ({off.status})
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {managingAssetOffer && (
        <DigitalAssetAdminModal
          offer={managingAssetOffer}
          apiFetch={apiFetch}
          onClose={() => setManagingAssetOffer(null)}
          showError={showError || console.error}
          showSuccess={showSuccess || console.log}
        />
      )}
    </div>
  );
}





// 7. Decisions Log Subcomponent
function DecisionsView({ decisions }: any) {
  return (
    <div className="space-y-6 text-sm">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-200 font-mono">Log de Decisões Estratégicas</h2>
        <p className="text-xs text-slate-400">Rastreabilidade completa de todas as alterações estratégicas do CORE</p>
      </div>

      <div className="space-y-4">
        {decisions.length === 0 ? (
          <div className="p-12 border border-slate-800 rounded bg-slate-900/20 text-center text-slate-500 font-mono">
            Nenhuma decisão registrada.
          </div>
        ) : (
          decisions.map((dec: any) => (
            <div key={dec.id} className="p-4 border border-slate-800 bg-slate-900/40 rounded flex items-start gap-4">
              <div className="p-2 rounded bg-slate-950 border border-slate-800 text-emerald-400 mt-1 shrink-0 font-mono text-xs font-bold">
                {dec.human_id}
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{dec.decision_text}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400 font-bold uppercase">
                      {dec.type}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Data: {new Date(dec.created_at).toLocaleString('pt-BR')} • Autor: {dec.responsible_name}
                  </div>
                </div>
                <div className="text-xs text-slate-350 bg-slate-950/30 p-2.5 rounded border border-slate-850">
                  <span className="text-[9px] font-mono text-slate-500 uppercase block">Justificativa estratégica</span>
                  <p className="mt-0.5 italic">"{dec.justification}"</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// 8. Team (Equipe) Subcomponent
function TeamView({ users }: any) {
  return (
    <div className="space-y-6 text-sm">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-200 font-mono">Equipe e Permissões</h2>
        <p className="text-xs text-slate-400">Usuários e perfis cadastrados no Role-Based Access Control (RBAC)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {users.map((user: any) => (
          <div key={user.id} className="p-4 border border-slate-800 bg-slate-900/30 rounded flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-200">{user.name}</h3>
              <div className="text-xs text-slate-400 font-mono">{user.email}</div>
              <div className="mt-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-emerald-400 border border-emerald-500/20 uppercase">
                  {user.role}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Status: ACTIVE</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 9. Config (Configurações) Subcomponent
function ConfigView({ isDemoView, currentUser, auditLogs, apiFetch, showError, showSuccess, onClearDemo }: any) {
  const isAdmin = currentUser.role === 'ADMIN';
  const [metaStatus, setMetaStatus] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchMetaStatus = async () => {
    if (!isAdmin) return;
    try {
      const mode = isDemoView ? 'demo' : 'real';
      const res = await apiFetch(`/meta/connection/status?mode=${mode}`, {}, mode, currentUser);
      setMetaStatus(res);
    } catch (e) {
      console.error('Meta status fetch error:', e);
    }
  };

  useEffect(() => {
    fetchMetaStatus();
  }, [isDemoView]);

  const handleValidateConnection = async () => {
    setIsValidating(true);
    try {
      const mode = isDemoView ? 'demo' : 'real';
      const res = await apiFetch(`/meta/connection/validate?mode=${mode}`, { method: 'POST' }, mode, currentUser);
      if (res.success) {
        showSuccess('Conexão com a Meta validada com sucesso!');
      } else {
        showError(res.error || 'Falha ao validar conexão com a Meta.');
      }
      await fetchMetaStatus();
    } catch (err: any) {
      showError(err.message || 'Erro ao validar conexão com a Meta.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSyncMeta = async () => {
    setIsSyncing(true);
    try {
      const mode = isDemoView ? 'demo' : 'real';
      const res = await apiFetch(`/meta/sync?mode=${mode}`, { method: 'POST' }, mode, currentUser);
      showSuccess(res.message || 'Sincronização de aquisição concluída!');
      await fetchMetaStatus();
    } catch (err: any) {
      showError(err.message || 'Erro durante a sincronização Meta.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 text-sm">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-200 font-mono">Configurações do Sistema</h2>
        <p className="text-xs text-slate-400">Administração, variáveis de ambiente e auditoria do Core V1</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Environment status */}
        <div className="p-5 border border-slate-800 bg-slate-900/30 rounded space-y-4">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-350">Status do Ambiente</h3>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-850">
              <span className="text-slate-500">AUTH_MODE</span>
              <span className="text-emerald-400 font-bold">demo</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-850">
              <span className="text-slate-500">DATABASE_PROVIDER</span>
              <span className="text-slate-300">PostgreSQL</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-850">
              <span className="text-slate-500">NODE_ENV</span>
              <span className="text-slate-350">development</span>
            </div>
          </div>

          {/* Meta Integration (ADMIN only) */}
          {isAdmin && (
            <div className="pt-4 border-t border-slate-850 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-350 flex items-center gap-1.5 font-mono">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
                  Meta Ads Integration (Graph API {metaStatus?.apiVersion || 'v20.0'})
                </h4>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  metaStatus?.connected
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {metaStatus?.connected ? 'CONECTADO' : 'NÃO CONECTADO'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-850">
                  <span className="text-slate-500">Conta de Anúncios</span>
                  <span className="text-slate-200">{metaStatus?.adAccountIdMasked || 'Não configurada'}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-850">
                  <span className="text-slate-500">Moeda / Timezone</span>
                  <span className="text-slate-200">{metaStatus?.currency || 'BRL'} ({metaStatus?.timezone || 'America/Sao_Paulo'})</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-850">
                  <span className="text-slate-500">Última Validação</span>
                  <span className="text-slate-400 text-[10px]">
                    {metaStatus?.lastValidatedAt ? new Date(metaStatus.lastValidatedAt).toLocaleString('pt-BR') : 'Nunca'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleValidateConnection}
                  disabled={isValidating}
                  className="flex-1 py-2 px-3 rounded border border-blue-600/40 bg-blue-950/20 text-blue-400 hover:bg-blue-950/40 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isValidating ? 'animate-spin' : ''}`} />
                  {isValidating ? 'Validando...' : 'Validar Conexão'}
                </button>
                <button
                  onClick={handleSyncMeta}
                  disabled={isSyncing}
                  className="flex-1 py-2 px-3 rounded bg-emerald-500 text-slate-950 hover:bg-emerald-400 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="pt-4 border-t border-slate-850 space-y-3">
              <h4 className="font-bold text-xs uppercase text-red-400 font-mono">Zona de Perigo</h4>
              <button
                onClick={onClearDemo}
                className="w-full py-2.5 px-4 rounded border border-red-700 bg-red-950/20 text-red-400 hover:bg-red-950/40 hover:text-red-300 font-mono font-bold flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                LIMPAR TODA A BASE DEMO
              </button>
              <p className="text-[10px] text-slate-500 text-center font-mono">
                Exclui apenas registros com is_demo = true. Dados reais de produção são preservados.
              </p>
            </div>
          )}
        </div>

        {/* Audit Log (ADMIN only) */}
        {isAdmin && (
          <div className="p-5 border border-slate-800 bg-slate-900/30 rounded space-y-4 flex flex-col">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-350">Log de Auditoria Técnica</h3>
            <div className="flex-1 max-h-72 overflow-y-auto custom-scrollbar space-y-2.5">
              {auditLogs.length === 0 ? (
                <div className="text-slate-500 text-xs font-mono text-center py-8">Nenhum evento auditado.</div>
              ) : (
                auditLogs.map((log: any) => (
                  <div key={log.id} className="p-2.5 rounded bg-slate-950 border border-slate-850 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-400 font-bold uppercase">{log.event_type}</span>
                      <span className="text-[10px] text-slate-500">{new Date(log.created_at).toLocaleTimeString('pt-BR')}</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">{log.description}</p>
                    {log.previous_value && log.new_value && (
                      <div className="text-[9px] text-slate-500 mt-1 truncate">
                        Prev: {log.previous_value.substring(0, 45)}... | New: {log.new_value.substring(0, 45)}...
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
