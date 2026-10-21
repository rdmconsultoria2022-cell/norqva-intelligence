import React, { useRef, useEffect } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { UserObj } from '../../types';
import { Header } from './Header';
import { AreaSubTabs, AreaTabBar } from './AppNavigation';
import { visibleGroups } from './navigation';

// NORQVA-0081: sem menu lateral. Menu fixo no topo (perfil, logo, período e, no computador, as telas);
// no celular, as áreas ficam numa barra fixa embaixo. Só o conteúdo rola.

export interface AppShellNav {
  currentUser: UserObj;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  handleSignOut: () => void;
  // NORQVA-0009/0028: contadores ao lado das telas (ex.: pendências abertas em "Campanhas")
  badges?: Record<string, number>;
  /** NORQVA-0095: sino = avisos não lidos; abre a central */
  unreadCount?: number;
  onOpenNotifications?: () => void;
}

export interface AppShellProps {
  globalError: string | null;
  globalSuccess: string | null;
  isDemoView: boolean;
  setIsDemoView: (isDemo: boolean) => void;
  nav: AppShellNav;
  /** NORQVA-0071: o período fica no topo, só nas telas em que ele filtra números. */
  showPeriodFilter?: boolean;
  children: React.ReactNode;
}

// NORQVA-0084: a fonte Inter (Design System NORQVA Premium) só no painel. As páginas de venda têm as
// fontes delas; por isso o link entra aqui e não no index.html.
const INTER_HREF = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
function useInterFont() {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('nq-inter-font')) return;
    const pre = document.createElement('link');
    pre.rel = 'preconnect';
    pre.href = 'https://fonts.gstatic.com';
    pre.crossOrigin = 'anonymous';
    const l = document.createElement('link');
    l.id = 'nq-inter-font';
    l.rel = 'stylesheet';
    l.href = INTER_HREF;
    document.head.appendChild(pre);
    document.head.appendChild(l);
  }, []);
}

// NORQVA-0105: dentro do painel, a barra do navegador/sistema e o fundo atrás do app usam a mesma cor do
// topo e da barra de áreas (nq-bg), para não aparecer faixa clara nas bordas do celular.
const SHELL_BG = '#101010';
function useShellChrome() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevBg = root.style.backgroundColor;
    const prevTheme = meta?.getAttribute('content') ?? null;
    root.style.backgroundColor = SHELL_BG;
    document.body.style.backgroundColor = SHELL_BG;
    meta?.setAttribute('content', SHELL_BG);
    return () => {
      root.style.backgroundColor = prevBg;
      document.body.style.backgroundColor = '';
      if (meta && prevTheme !== null) meta.setAttribute('content', prevTheme);
    };
  }, []);
}

export function AppShell({
  globalError,
  globalSuccess,
  isDemoView,
  setIsDemoView,
  nav,
  showPeriodFilter = false,
  children
}: AppShellProps) {
  const groups = visibleGroups(nav.currentUser?.role);
  useInterFont();
  useShellChrome();

  // uma tela nova começa do topo
  const contentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [nav.activeTab]);

  return (
    <div className="h-screen supports-[height:100dvh]:h-[100dvh] bg-nq-bg text-nq-text flex flex-col font-sans w-full overflow-hidden">
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

      {isDemoView && (
        <div className="bg-amber-500 text-slate-950 px-4 py-1 text-center text-xs font-mono font-bold tracking-wider z-20 flex items-center justify-center gap-2 border-b border-amber-600 shrink-0">
          <AlertTriangle className="h-4 w-4 shrink-0 text-slate-950" />
          AMBIENTE DEMO ATIVO: OPERANDO SOBRE DADOS DE DEMONSTRAÇÃO E ACESSO SIMULADO.
        </div>
      )}

      <Header
        activeTab={nav.activeTab}
        setActiveTab={nav.setActiveTab}
        currentUser={nav.currentUser}
        handleSignOut={nav.handleSignOut}
        groups={groups}
        badges={nav.badges}
        isDemoView={isDemoView}
        setIsDemoView={setIsDemoView}
        showPeriodFilter={showPeriodFilter}
        unreadCount={nav.unreadCount}
        onOpenNotifications={nav.onOpenNotifications}
      />

      <AreaSubTabs groups={groups} activeTab={nav.activeTab} setActiveTab={nav.setActiveTab} badges={nav.badges} />

      <main ref={contentRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-5 pb-8 sm:p-6 md:p-8 custom-scrollbar">
        <div className="max-w-[1400px] mx-auto w-full">{children}</div>
      </main>

      <AreaTabBar groups={groups} activeTab={nav.activeTab} setActiveTab={nav.setActiveTab} badges={nav.badges} />
    </div>
  );
}
