import React from 'react';
import { DEMO_MODE_ENABLED } from '../../lib/demoMode';
import { GlobalPeriodSelector } from '../../lib/globalPeriod';
import { UserObj } from '../../types';
import { UserMenu } from './UserMenu';
import { ScreenTabs } from './AppNavigation';
import { NavigationGroup } from './navigation';
import { Bell } from 'lucide-react';

// NORQVA-0081: menu fixo no topo.
// - Linha 1: perfil (só o nome) à esquerda, logo NORQVA e, à direita, o período (nas telas em que ele filtra).
// - Linha 2 (só no computador): as telas, numa faixa discreta.
// Saíram o selo do modo de autenticação, o botão de recarregar e o nome da tela no topo.

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
  /** NORQVA-0095: o sino mostra os avisos que esta pessoa ainda não leu e abre a central. */
  unreadCount?: number;
  onOpenNotifications?: () => void;
}

export function NorqvaLogo({ compact = false }: { compact?: boolean } = {}) {
  return (
    // NORQVA-0082: marca discreta, em sans, sem fonte técnica
    <span className="flex items-center gap-1.5 select-none">
      <svg viewBox="0 0 100 100" className="h-3.5 w-3.5" aria-hidden="true">
        <polygon points="50,15 90,85 10,85" className="fill-nq-positive" />
      </svg>
      {/* compact: em telas estreitas com o período no topo, só o símbolo (o nome não cabe) */}
      <span className={`text-[15px] font-semibold tracking-[0.22em] text-nq-text ${compact ? 'hidden min-[420px]:inline' : ''}`}>NORQVA</span>
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
  showPeriodFilter = false,
  unreadCount,
  onOpenNotifications
}: HeaderProps) {
  return (
    <header data-testid="app-header" className="shrink-0 z-30 border-b border-nq-line/50 bg-nq-bg/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="h-14 px-3 sm:px-4 md:px-8 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="min-w-0 justify-self-start">
          <UserMenu user={currentUser} onSignOut={handleSignOut} />
        </div>

        <div className="justify-self-center">
          <NorqvaLogo compact={showPeriodFilter} />
        </div>

        <div className="flex items-center gap-2 justify-self-end text-xs min-w-0">
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
          {/* NORQVA-0095: sino = avisos não lidos desta pessoa; abre a central de pendências.
              Sem a central (onOpenNotifications), volta ao atalho antigo para Campanhas (NORQVA-0082). */}
          {(() => {
            const central = !!onOpenNotifications;
            const total = central ? Number(unreadCount) || 0 : Object.values(badges || {}).reduce((a, n) => a + (Number(n) || 0), 0);
            const target = Object.keys(badges || {}).find(k => (Number(badges?.[k]) || 0) > 0) || 'campaigns';
            const label = central
              ? total > 0 ? `Avisos: ${total} não lido(s)` : 'Avisos'
              : total > 0 ? `${total} alerta(s) aberto(s)` : 'Alertas: nenhum aberto';
            return (
              <button
                type="button"
                data-testid="header-alerts"
                onClick={() => (central ? onOpenNotifications!() : total > 0 && setActiveTab(target))}
                aria-label={label}
                className="relative h-11 w-11 flex items-center justify-center rounded-full text-nq-muted hover:text-nq-text active:bg-nq-surface"
              >
                <Bell aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                {total > 0 && (
                  <span aria-hidden="true" className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-nq-critical text-white text-[12px] font-semibold leading-[18px] text-center">
                    {total > 99 ? '99+' : total}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      </div>

      <div className="hidden md:block md:px-6 border-t border-nq-line/40">
        <ScreenTabs groups={groups} activeTab={activeTab} setActiveTab={setActiveTab} badges={badges} />
      </div>
    </header>
  );
}
