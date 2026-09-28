import React, { createContext, useContext, useState, useCallback } from 'react';
import { CalendarRange } from 'lucide-react';

// NORQVA-0004: one period for every screen. Chosen once (e.g. on the executive view) and
// applied to all screens with dated numbers; kept while navigating and on reload in the tab.

export type GlobalPeriodOption = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'all' | 'custom';

export interface GlobalPeriod {
  period: GlobalPeriodOption;
  startDate?: string; // YYYY-MM-DD, only for custom
  endDate?: string;
}

export const GLOBAL_PERIOD_OPTIONS: Array<{ id: GlobalPeriodOption; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'all', label: 'Tudo' },
  { id: 'custom', label: 'Personalizado' }
];

const STORAGE_KEY = 'norqva_global_period_v1';
const DEFAULT_PERIOD: GlobalPeriod = { period: '30d' };

function readStored(): GlobalPeriod {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PERIOD;
    const parsed = JSON.parse(raw);
    if (GLOBAL_PERIOD_OPTIONS.some(o => o.id === parsed?.period)) {
      if (parsed.period === 'custom' && !(parsed.startDate && parsed.endDate)) return DEFAULT_PERIOD;
      return parsed;
    }
  } catch {
    // storage blocked or corrupted: use the default
  }
  return DEFAULT_PERIOD;
}

function writeStored(value: GlobalPeriod) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable: in-memory only
  }
}

export function clearGlobalPeriod() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Query string fragment understood by every backend endpoint: period=...[&startDate&endDate] */
export function periodQuery(gp: GlobalPeriod): string {
  const params = new URLSearchParams();
  params.set('period', gp.period);
  if (gp.period === 'custom' && gp.startDate && gp.endDate) {
    params.set('startDate', gp.startDate);
    params.set('endDate', gp.endDate);
  }
  return params.toString();
}

export function periodLabel(gp: GlobalPeriod): string {
  if (gp.period === 'custom' && gp.startDate && gp.endDate) {
    const fmt = (d: string) => d.split('-').reverse().join('/');
    return `${fmt(gp.startDate)} a ${fmt(gp.endDate)}`;
  }
  return GLOBAL_PERIOD_OPTIONS.find(o => o.id === gp.period)?.label || '';
}

interface GlobalPeriodContextValue {
  globalPeriod: GlobalPeriod;
  setGlobalPeriod: (value: GlobalPeriod) => void;
}

const GlobalPeriodContext = createContext<GlobalPeriodContextValue | null>(null);

export function GlobalPeriodProvider({ children, initial }: { children: React.ReactNode; initial?: GlobalPeriod }) {
  const [globalPeriod, setState] = useState<GlobalPeriod>(() => initial || readStored());
  const setGlobalPeriod = useCallback((value: GlobalPeriod) => {
    setState(value);
    writeStored(value);
  }, []);
  return (
    <GlobalPeriodContext.Provider value={{ globalPeriod, setGlobalPeriod }}>
      {children}
    </GlobalPeriodContext.Provider>
  );
}

// Outside a provider (isolated component tests) views fall back to a fixed default.
const FALLBACK: GlobalPeriodContextValue = { globalPeriod: DEFAULT_PERIOD, setGlobalPeriod: () => {} };

export function useGlobalPeriod(): GlobalPeriodContextValue {
  return useContext(GlobalPeriodContext) || FALLBACK;
}

/**
 * The single period selector, shown on every screen. On screens without dated numbers
 * (catalogs) it stays visible and keeps its value but does not filter anything.
 */
export function GlobalPeriodSelector({ appliesToScreen = true }: { appliesToScreen?: boolean }) {
  const { globalPeriod, setGlobalPeriod } = useGlobalPeriod();
  const [showCustom, setShowCustom] = useState(globalPeriod.period === 'custom');
  const [from, setFrom] = useState(globalPeriod.startDate || '');
  const [to, setTo] = useState(globalPeriod.endDate || '');
  const [customError, setCustomError] = useState<string | null>(null);

  const select = (id: GlobalPeriodOption) => {
    if (id === 'custom') {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    setCustomError(null);
    setGlobalPeriod({ period: id });
  };

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) {
      setCustomError('Selecione as datas inicial e final.');
      return;
    }
    if (from > to) {
      setCustomError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setCustomError(null);
    setGlobalPeriod({ period: 'custom', startDate: from, endDate: to });
  };

  const isActive = (id: GlobalPeriodOption) =>
    id === 'custom' ? showCustom || globalPeriod.period === 'custom' : !showCustom && globalPeriod.period === id;

  return (
    <div data-testid="global-period-selector" className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 shrink-0">
          <CalendarRange className="h-3.5 w-3.5 text-emerald-400" />
          <span className="uppercase font-semibold">Período:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {GLOBAL_PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => select(opt.id)}
              aria-pressed={isActive(opt.id)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition ${
                isActive(opt.id)
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {!appliesToScreen && (
          <span className="text-[10px] font-mono text-slate-500 sm:ml-auto">
            Esta tela não tem números por data; o período vale para as telas de resultados.
          </span>
        )}
      </div>

      {showCustom && (
        <form
          onSubmit={applyCustom}
          className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-mono"
        >
          <label className="flex items-center gap-2 text-slate-400">
            De:
            <input
              type="date"
              aria-label="Data inicial"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded focus:outline-none focus:border-emerald-500"
            />
          </label>
          <label className="flex items-center gap-2 text-slate-400">
            Até:
            <input
              type="date"
              aria-label="Data final"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded focus:outline-none focus:border-emerald-500"
            />
          </label>
          <button
            type="submit"
            className="px-3 py-1 bg-emerald-500 text-slate-950 font-bold rounded hover:bg-emerald-400 transition"
          >
            Filtrar
          </button>
          {customError && <span className="text-red-400">{customError}</span>}
        </form>
      )}
    </div>
  );
}
