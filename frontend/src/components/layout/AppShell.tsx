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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans w-full overflow-x-hidden antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
      {/* Global Toast Error & Success */}
      {globalError && (
        <div className="fixed top-4 right-4 z-50 bg-white border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 max-w-md animate-in slide-in-from-top-2 duration-200">
          <div className="h-8 w-8 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <span className="text-xs font-semibold">{globalError}</span>
        </div>
      )}
      {globalSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-white border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 max-w-md animate-in slide-in-from-top-2 duration-200">
          <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <span className="text-xs font-semibold">{globalSuccess}</span>
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
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="relative flex flex-col w-64 max-w-xs h-full bg-white z-50 shadow-2xl border-r border-slate-200 animate-in slide-in-from-left duration-200">
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
          <div className="bg-amber-50 text-amber-900 border-b border-amber-200/80 px-4 py-1.5 text-center text-xs font-medium z-20 flex items-center justify-center gap-2 shadow-xs">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
            <span>Ambiente Demo Ativo • Operando sobre dados de demonstração e simulação de vendas</span>
          </div>
        )}

        {/* Header controls with mobile hamburger integration */}
        <Header
          {...headerProps}
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />

        {/* Child Screen Contents */}
        <section className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar max-w-[1600px] w-full mx-auto">
          {children}
        </section>
      </main>
    </div>
  );
}
