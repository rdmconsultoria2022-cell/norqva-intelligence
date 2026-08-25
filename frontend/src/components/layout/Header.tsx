import React from 'react';
import { AlertTriangle, RefreshCw, Shield } from 'lucide-react';

export interface HeaderProps {
  activeTab: string;
  isDemoView: boolean;
  setIsDemoView: (isDemo: boolean) => void;
  authMode: string;
  loadData: () => Promise<void>;
}

export function Header({
  activeTab,
  isDemoView,
  setIsDemoView,
  authMode,
  loadData
}: HeaderProps) {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-8 flex items-center justify-between shrink-0 z-10">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-bold uppercase tracking-widest text-slate-400 font-mono">
          {activeTab === 'dashboard' ? 'Visão Executiva' : activeTab}
        </h1>
        
        {/* DEMO / REAL mode indicator toggle */}
        <div className="flex items-center bg-slate-950/80 border border-slate-800 p-0.5 rounded-md text-xs">
          <button
            onClick={() => setIsDemoView(true)}
            className={`px-3 py-1 rounded font-mono font-semibold transition ${
              isDemoView
                ? 'bg-amber-950/40 text-amber-400 border border-amber-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            MODO DEMO
          </button>
          <button
            onClick={() => setIsDemoView(false)}
            className={`px-3 py-1 rounded font-mono font-semibold transition ${
              !isDemoView
                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            MODO REAL
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono">
        {/* Quick stats sync */}
        <button
          onClick={loadData}
          className="p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 flex items-center gap-1.5"
          title="Recarregar dados"
        >
          <RefreshCw className="h-3 w-3" />
          Sincronizar
        </button>

        <span className="px-2.5 py-1 rounded border border-slate-800 bg-slate-950 text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
          <Shield className="h-3 w-3 text-emerald-500" />
          AUTH_MODE={authMode}
        </span>
      </div>
    </header>
  );
}
