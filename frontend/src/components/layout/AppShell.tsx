import React from 'react';
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
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans w-full">
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

      {/* Sidebar Navigation */}
      <Sidebar {...sidebarProps} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {isDemoView && (
          <div className="bg-amber-500 text-slate-950 px-4 py-1 text-center text-xs font-mono font-bold tracking-wider z-20 flex items-center justify-center gap-2 border-b border-amber-600">
            <AlertTriangle className="h-4 w-4 shrink-0 text-slate-950" />
            ⚠️ AMBIENTE DEMO ATIVO: OPERANDO SOBRE DADOS DE DEMONSTRAÇÃO E ACESSO SIMULADO.
          </div>
        )}

        {/* Header controls */}
        <Header {...headerProps} />

        {/* Child Screen Contents */}
        <section className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {children}
        </section>
      </main>
    </div>
  );
}
