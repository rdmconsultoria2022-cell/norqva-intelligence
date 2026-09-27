import React, { useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { Sidebar, SidebarProps } from './Sidebar';
import { Header, HeaderProps } from './Header';

export interface AppShellProps {
  globalError: string | null;
  globalSuccess: string | null;
  isDemoView: boolean;
  sidebarProps: SidebarProps;
  headerProps: HeaderProps;
  children: React.ReactNode;
}

export function AppShell({
  globalError,
  globalSuccess,
  isDemoView,
  sidebarProps,
  headerProps,
  children
}: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans w-full overflow-x-hidden">
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

      {/* Desktop Sidebar Navigation (Hidden on mobile < md) */}
      <div className="hidden md:flex md:w-64 shrink-0">
        <Sidebar {...sidebarProps} />
      </div>

      {/* Mobile Drawer (Visible when isMobileMenuOpen is true on mobile) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="relative flex flex-col w-64 max-w-xs h-full bg-slate-900 z-50 shadow-2xl border-r border-slate-800 animate-in slide-in-from-left duration-200">
            <Sidebar
              {...sidebarProps}
              onNavigate={() => setIsMobileMenuOpen(false)}
              onClose={() => setIsMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {isDemoView && (
          <div className="bg-amber-500 text-slate-950 px-4 py-1 text-center text-xs font-mono font-bold tracking-wider z-20 flex items-center justify-center gap-2 border-b border-amber-600">
            <AlertTriangle className="h-4 w-4 shrink-0 text-slate-950" />
            ⚠️ AMBIENTE DEMO ATIVO: OPERANDO SOBRE DADOS DE DEMONSTRAÇÃO E ACESSO SIMULADO.
          </div>
        )}

        {/* Header controls with mobile hamburger integration */}
        <Header
          {...headerProps}
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />

        {/* Child Screen Contents */}
        <section className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 custom-scrollbar">
          {children}
        </section>
      </main>
    </div>
  );
}
