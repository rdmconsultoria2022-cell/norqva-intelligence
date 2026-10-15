import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CalendarRange, ChevronDown, Check } from 'lucide-react';

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
 * The single period selector (NORQVA-0071): compact button at the right of the fixed top bar.
 * Shows only the chosen period; the options open in a small menu and close after the choice.
 * The header shows it only on screens where the period filters numbers.
 */
export function GlobalPeriodSelector({ appliesToScreen = true }: { appliesToScreen?: boolean }) {
  const { globalPeriod, setGlobalPeriod } = useGlobalPeriod();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [from, setFrom] = useState(globalPeriod.startDate || '');
  const [to, setTo] = useState(globalPeriod.endDate || '');
  const [customError, setCustomError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen(o => !o);
    setShowCustom(globalPeriod.period === 'custom');
    setCustomError(null);
  };

  const select = (id: GlobalPeriodOption) => {
    if (id === 'custom') {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    setCustomError(null);
    setGlobalPeriod({ period: id });
    setOpen(false);
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
    setOpen(false);
  };

  const isActive = (id: GlobalPeriodOption) =>
    id === 'custom' ? showCustom || globalPeriod.period === 'custom' : !showCustom && globalPeriod.period === id;

  const current = periodLabel(globalPeriod);

  return (
    <div ref={boxRef} data-testid="global-period-selector" className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Período: ${current}`}
        title="Mudar o período"
        className={`flex items-center gap-1.5 h-9 pl-2.5 pr-2 rounded-md border text-xs font-mono font-semibold transition max-w-[150px] sm:max-w-none ${
          open
            ? 'bg-slate-800 border-emerald-500/60 text-white'
            : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
        }`}
      >
        <CalendarRange className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <span className="truncate" data-testid="global-period-current">{current}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="group"
          aria-label="Escolher período"
          className="absolute right-0 top-full mt-2 w-60 max-w-[calc(100vw-1.5rem)] z-40 rounded-lg border border-slate-700 bg-slate-900 shadow-2xl p-1.5"
        >
          <div className="px-2 pt-1 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">Período</div>
          {GLOBAL_PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => select(opt.id)}
              aria-pressed={isActive(opt.id)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-mono text-left transition ${
                isActive(opt.id)
                  ? 'bg-emerald-500/15 text-emerald-300 font-bold'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>{opt.label}</span>
              {isActive(opt.id) && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          ))}

          {showCustom && (
            <form onSubmit={applyCustom} className="mt-1.5 pt-2 border-t border-slate-800 space-y-2 px-1 text-xs font-mono">
              <label className="flex items-center justify-between gap-2 text-slate-400">
                De:
                <input
                  type="date"
                  aria-label="Data inicial"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  className="w-[140px] bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded focus:outline-none focus:border-emerald-500"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-slate-400">
                Até:
                <input
                  type="date"
                  aria-label="Data final"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  className="w-[140px] bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded focus:outline-none focus:border-emerald-500"
                />
              </label>
              <button
                type="submit"
                className="w-full px-3 py-1.5 bg-emerald-500 text-slate-950 font-bold rounded hover:bg-emerald-400 transition"
              >
                Filtrar
              </button>
              {customError && <p className="text-red-400">{customError}</p>}
            </form>
          )}

          {!appliesToScreen && (
            <p className="mt-1.5 pt-2 border-t border-slate-800 px-2 text-[10px] font-mono text-slate-500">
              Esta tela não tem números por data; o período vale para as telas de resultados.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
