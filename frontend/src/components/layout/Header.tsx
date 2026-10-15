import React from 'react';
import { DEMO_MODE_ENABLED } from '../../lib/demoMode';
import { RefreshCw, Shield, Menu, X } from 'lucide-react';
import { navigationItems } from './Sidebar';
import { GlobalPeriodSelector } from '../../lib/globalPeriod';

export interface HeaderProps {
  activeTab: string;
  isDemoView: boolean;
  setIsDemoView: (isDemo: boolean) => void;
  authMode: string;
  loadData: () => Promise<void>;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
  /** NORQVA-0071: the period filter sits in the top bar, only on screens where it filters numbers. */
  showPeriodFilter?: boolean;
}

export function Header({
  activeTab,
  isDemoView,
  setIsDemoView,
  authMode,
  loadData,
  isMobileMenuOpen,
  onToggleMobileMenu,
  showPeriodFilter = false
}: HeaderProps) {
  return (
    <header
      data-testid="app-header"
      className="h-16 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md px-3 sm:px-4 md:px-8 flex items-center justify-between gap-2 shrink-0 z-30"
    >
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        {/* Mobile Hamburger Toggle Button */}
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden h-9 w-9 shrink-0 flex items-center justify-center rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        )}

        <h1 className="text-xs md:text-sm font-bold uppercase tracking-widest text-slate-400 font-mono truncate min-w-0">
          {navigationItems.find(i => i.id === activeTab)?.label || activeTab}
        </h1>
        
        {/* DEMO / REAL mode toggle: only in tests or local demo builds (NORQVA-0003) */}
        {DEMO_MODE_ENABLED && (
        <div className="flex items-center bg-slate-950/80 border border-slate-800 p-0.5 rounded-md text-[11px] md:text-xs">
          <button
            onClick={() => setIsDemoView(true)}
            className={`px-2.5 md:px-3 py-1 rounded font-mono font-semibold transition ${
              isDemoView
                ? 'bg-amber-950/40 text-amber-400 border border-amber-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            MODO DEMO
          </button>
          <button
            onClick={() => setIsDemoView(false)}
            className={`px-2.5 md:px-3 py-1 rounded font-mono font-semibold transition ${
              !isDemoView
                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            MODO REAL
          </button>
        </div>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-3 text-xs font-mono shrink-0">
        {showPeriodFilter && <GlobalPeriodSelector />}

        {/* Quick stats sync */}
        <button
          onClick={loadData}
          aria-label="Recarregar dados"
          className="h-9 px-2.5 md:px-3 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 flex items-center gap-1.5"
          title="Recarregar dados"
        >
          <RefreshCw className="h-3 w-3" />
          <span className="hidden sm:inline">Sincronizar</span>
        </button>

        <span className="hidden sm:flex px-2.5 py-1 rounded border border-slate-800 bg-slate-950 text-slate-400 text-[10px] uppercase font-bold items-center gap-1">
          <Shield className="h-3 w-3 text-emerald-500" />
          AUTH_MODE={authMode}
        </span>
      </div>
    </header>
  );
}
