import React from 'react';
import { DEMO_MODE_ENABLED } from '../../lib/demoMode';
import { GlobalPeriodSelector } from '../../lib/globalPeriod';
import { UserObj } from '../../types';
import { UserMenu } from './UserMenu';
import { ScreenTabs } from './AppNavigation';
import { NavigationGroup } from './navigation';

// NORQVA-0081: menu fixo no topo.
// - Linha 1: perfil (só o nome) à esquerda, logo NORQVA e, à direita, o período (nas telas em que ele filtra).
// - Linha 2 (só no computador): as telas, numa faixa discreta.
// Saíram o "AUTH_MODE", o botão "Sincronizar" e o nome da tela no topo.

export interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: UserObj;
  handleSignOut: () => void;
  groups: NavigationGroup[];
  badges?: Record<string, number>;
  isDemoView: boolean;
  setIsDemoView: (isDemo: boolean) => void;
  /** NORQVA-0071: o período fica no topo, só nas telas em que ele filtra números. */
  showPeriodFilter?: boolean;
}

export function NorqvaLogo() {
  return (
    <span className="flex items-center gap-2 select-none" aria-label="NORQVA">
      <svg viewBox="0 0 100 100" className="h-5 w-5" aria-hidden="true">
        <polygon points="50,15 90,85 10,85" className="fill-emerald-500" />
      </svg>
      <span className="text-base sm:text-lg font-black tracking-[0.25em] text-slate-100 font-mono">NORQVA</span>
    </span>
  );
}

export function Header({
  activeTab,
  setActiveTab,
  currentUser,
  handleSignOut,
  groups,
  badges,
  isDemoView,
  setIsDemoView,
  showPeriodFilter = false
}: HeaderProps) {
  return (
    <header data-testid="app-header" className="shrink-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
      <div className="h-14 px-3 sm:px-4 md:px-8 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0 justify-self-start">
          <UserMenu user={currentUser} onSignOut={handleSignOut} />
        </div>

        <div className="justify-self-center">
          <NorqvaLogo />
        </div>

        <div className="flex items-center gap-2 justify-self-end text-xs font-mono min-w-0">
          {/* DEMO / REAL: só em testes ou builds locais de demonstração (NORQVA-0003) */}
          {DEMO_MODE_ENABLED && (
            <div className="hidden sm:flex items-center bg-slate-950/80 border border-slate-800 p-0.5 rounded-md text-[11px]">
              <button
                onClick={() => setIsDemoView(true)}
                className={`px-2.5 py-1 rounded font-mono font-semibold transition ${
                  isDemoView ? 'bg-amber-950/40 text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                MODO DEMO
              </button>
              <button
                onClick={() => setIsDemoView(false)}
                className={`px-2.5 py-1 rounded font-mono font-semibold transition ${
                  !isDemoView ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                MODO REAL
              </button>
            </div>
          )}
          {showPeriodFilter && <GlobalPeriodSelector />}
        </div>
      </div>

      <div className="hidden md:block px-4 md:px-6 border-t border-slate-900">
        <ScreenTabs groups={groups} activeTab={activeTab} setActiveTab={setActiveTab} badges={badges} />
      </div>
    </header>
  );
}
