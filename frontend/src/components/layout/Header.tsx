import React from 'react';
import { RefreshCw, Shield, Menu, X } from 'lucide-react';

export interface HeaderProps {
  activeTab: string;
  isDemoView: boolean;
  setIsDemoView: (isDemo: boolean) => void;
  authMode: string;
  loadData: () => Promise<void>;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
}

export function Header({
  activeTab,
  isDemoView,
  setIsDemoView,
  authMode,
  loadData,
  isMobileMenuOpen,
  onToggleMobileMenu
}: HeaderProps) {
  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard': return 'Visão Executiva & Inteligência';
      case 'opportunities': return 'Oportunidades & Intelligence';
      case 'products': return 'Gestão de Produtos';
      case 'offers': return 'Ofertas & Preços';
      case 'creatives': return 'Creative Lab & Roteiros';
      case 'experiments': return 'Experimentos & Validações';
      case 'meta-ads': return 'Meta Ads Acquisition';
      case 'creative-performance': return 'Performance de Criativos';
      case 'demographics': return 'Inteligência Demográfica';
      case 'decisions': return 'Decisões & Auditoria';
      case 'team': return 'Gestão de Equipe';
      case 'config': return 'Configurações do Sistema';
      default: return tab;
    }
  };

  return (
    <header className="h-16 border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between shrink-0 sticky top-0 z-30 select-none">
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Mobile Hamburger Toggle Button */}
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-xl bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        )}

        <div>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate max-w-[140px] sm:max-w-none">
            {getTabTitle(activeTab)}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* DEMO / REAL mode indicator toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs shadow-xs">
          <button
            onClick={() => setIsDemoView(true)}
            className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all duration-150 ${
              isDemoView
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            MODO DEMO
          </button>
          <button
            onClick={() => setIsDemoView(false)}
            className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all duration-150 ${
              !isDemoView
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            MODO REAL
          </button>
        </div>

        {/* Sync button */}
        <button
          onClick={loadData}
          className="p-2 sm:px-3 sm:py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs flex items-center gap-2 text-xs font-semibold transition"
          title="Sincronizar Dados"
        >
          <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          <span className="hidden sm:inline">Sincronizar</span>
        </button>
      </div>
    </header>
  );
}
