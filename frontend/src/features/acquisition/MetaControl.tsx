import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Power, Pause, Play, Wallet, ShieldCheck, ShieldAlert } from 'lucide-react';

// NORQVA-0006: campaign control (pause/activate, daily budget) from NORQVA. ADMIN only.
// Every change goes through a confirmation dialog; the backend is fail-closed.

export type MetaControlEntityType = 'campaign' | 'adset' | 'ad';

export interface MetaControlStatus {
  enabled: boolean;
  ready: boolean;
  mode: 'real' | 'demo';
  failedChecks: { code: string; label: string }[];
  limits: { minDailyBudget: number; maxDailyBudget: number };
}

export interface MetaControlTarget {
  entityType: MetaControlEntityType;
  id: string; // Meta ID
  name: string;
  status?: string | null;
  dailyBudget?: number | null;
}

type PendingAction =
  | { kind: 'status'; target: MetaControlTarget; next: 'ACTIVE' | 'PAUSED' }
  | { kind: 'budget'; target: MetaControlTarget };

const ENTITY_LABEL: Record<MetaControlEntityType, string> = {
  campaign: 'campanha',
  adset: 'conjunto',
  ad: 'anúncio'
};

const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function useMetaControl(opts: {
  apiFetch: (url: string, options?: any, mode?: string, user?: any) => Promise<any>;
  currentUser: any;
  isDemoView: boolean;
  enabled: boolean;
}) {
  const { apiFetch, currentUser, isDemoView, enabled } = opts;
  const [status, setStatus] = useState<MetaControlStatus | null>(null);
  const fetchRef = useRef(apiFetch);
  fetchRef.current = apiFetch;
  const userRef = useRef(currentUser);
  userRef.current = currentUser;

  const refresh = useCallback(
    async (force = false) => {
      if (!enabled) return;
      const mode = isDemoView ? 'demo' : 'real';
      try {
        const res = await fetchRef.current(`/meta-control/status?mode=${mode}${force ? '&refresh=1' : ''}`, {}, mode, userRef.current);
        setStatus(res && typeof res.enabled === 'boolean' && res.limits ? res : null);
      } catch {
        setStatus(null);
      }
    },
    [enabled, isDemoView]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, refresh };
}

export const MetaControlBanner: React.FC<{ status: MetaControlStatus | null; onRecheck: () => void }> = ({ status, onRecheck }) => {
  if (!status) return null;
  if (status.ready) {
    return (
      <div data-testid="meta-control-banner" className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2.5">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
        <span>
          <strong>Controle de campanhas ativo{status.mode === 'demo' ? ' (simulação DEMO)' : ''}.</strong> Ativar, pausar e mudar orçamento diário daqui
          altera a Meta de verdade. Orçamento permitido: {brl(status.limits.minDailyBudget)} a {brl(status.limits.maxDailyBudget)} por dia.
        </span>
      </div>
    );
  }
  return (
    <div data-testid="meta-control-banner" className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-start gap-2.5">
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
      <div className="space-y-1">
        {!status.enabled ? (
          <span>
            <strong>Controle de campanhas desligado.</strong> Para ligar, defina <code>META_MUTATION_ENABLED=true</code> no Render.
          </span>
        ) : (
          <span>
            <strong>Controle de campanhas bloqueado:</strong> a credencial da Meta falhou em{' '}
            {status.failedChecks.map((c) => c.label).join(', ')}. O token do Render precisa da permissão <code>ads_management</code>.
          </span>
        )}
        <button onClick={onRecheck} className="block underline text-amber-200 hover:text-amber-100">
          Verificar de novo
        </button>
      </div>
    </div>
  );
};

export const MetaControlActions: React.FC<{
  target: MetaControlTarget;
  status: MetaControlStatus | null;
  onRequest: (action: PendingAction) => void;
}> = ({ target, status, onRequest }) => {
  const ready = !!status?.ready;
  const current = (target.status || '').toUpperCase();
  const canToggle = current === 'ACTIVE' || current === 'PAUSED';
  const canBudget = target.entityType !== 'ad' && target.dailyBudget !== null && target.dailyBudget !== undefined;
  const title = ready ? undefined : 'Controle de campanhas indisponível (veja o aviso acima).';

  return (
    <div className="flex items-center gap-1.5">
      {canToggle && (
        <button
          disabled={!ready}
          title={title}
          onClick={() => onRequest({ kind: 'status', target, next: current === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })}
          className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono font-bold disabled:opacity-40 disabled:cursor-not-allowed ${
            current === 'ACTIVE'
              ? 'border-amber-500/40 text-amber-300 hover:bg-amber-950/40'
              : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/40'
          }`}
        >
          {current === 'ACTIVE' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {current === 'ACTIVE' ? 'Pausar' : 'Ativar'}
        </button>
      )}
      {canBudget && (
        <button
          disabled={!ready}
          title={title}
          onClick={() => onRequest({ kind: 'budget', target })}
          className="flex items-center gap-1 px-2 py-1 rounded border border-slate-600 text-slate-300 text-[10px] font-mono font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Wallet className="h-3 w-3" /> Orçamento
        </button>
      )}
    </div>
  );
};

export const MetaControlDialog: React.FC<{
  action: PendingAction | null;
  status: MetaControlStatus | null;
  isDemoView: boolean;
  currentUser: any;
  apiFetch: (url: string, options?: any, mode?: string, user?: any) => Promise<any>;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  /** NORQVA-0028: ID da campanha na Meta; o servidor recusa objetos de outra campanha */
  scopeCampaign?: string | null;
}> = ({ action, status, isDemoView, currentUser, apiFetch, onClose, onDone, onError, scopeCampaign }) => {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (action?.kind === 'budget') setAmount(action.target.dailyBudget ? String(action.target.dailyBudget) : '');
    setBusy(false);
  }, [action]);

  if (!action) return null;

  const { target } = action;
  const label = ENTITY_LABEL[target.entityType];
  const min = status?.limits.minDailyBudget ?? 5;
  const max = status?.limits.maxDailyBudget ?? 100;
  const parsed = Number(amount.replace(',', '.'));
  const budgetValid = action.kind !== 'budget' || (Number.isFinite(parsed) && parsed >= min && parsed <= max);

  const confirm = async () => {
    if (busy || !budgetValid) return;
    setBusy(true);
    const mode = isDemoView ? 'demo' : 'real';
    try {
      if (action.kind === 'status') {
        await apiFetch(
          `/meta-control/${target.entityType}/${encodeURIComponent(target.id)}/status?mode=${mode}`,
          { method: 'POST', body: JSON.stringify({ status: action.next, ...(scopeCampaign ? { scope_campaign: scopeCampaign } : {}) }) },
          mode,
          currentUser
        );
        onDone(`${label[0].toUpperCase()}${label.slice(1)} "${target.name}" ${action.next === 'PAUSED' ? 'pausado(a)' : 'ativado(a)'} na Meta.`);
      } else {
        await apiFetch(
          `/meta-control/${target.entityType}/${encodeURIComponent(target.id)}/budget?mode=${mode}`,
          { method: 'POST', body: JSON.stringify({ daily_budget: parsed, ...(scopeCampaign ? { scope_campaign: scopeCampaign } : {}) }) },
          mode,
          currentUser
        );
        onDone(`Orçamento diário de "${target.name}" alterado para ${brl(parsed)} na Meta.`);
      }
    } catch (err: any) {
      onError(err?.message || 'Falha ao alterar na Meta.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 text-sm space-y-4">
        <h3 className="text-md font-bold tracking-widest font-mono text-emerald-400 uppercase flex items-center gap-2">
          <Power className="h-4 w-4" /> Confirmar na Meta
        </h3>

        {action.kind === 'status' ? (
          <p className="text-slate-200">
            {action.next === 'PAUSED' ? 'Pausar' : 'Ativar'} {label} <strong>{target.name}</strong>?
            <span className="block mt-2 text-xs text-slate-400">
              {action.next === 'ACTIVE'
                ? 'Ao ativar, a Meta volta a gastar o orçamento configurado.'
                : 'Ao pausar, a veiculação para em alguns minutos.'}
            </span>
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-slate-200">
              Orçamento diário de {label} <strong>{target.name}</strong>
              {target.dailyBudget ? <span className="text-slate-400"> (atual: {brl(Number(target.dailyBudget))})</span> : null}
            </p>
            <label htmlFor="meta-control-budget" className="block text-xs font-mono uppercase text-slate-400">
              Novo orçamento diário (R$)
            </label>
            <input
              id="meta-control-budget"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200 font-mono"
            />
            <p className={`text-xs ${budgetValid ? 'text-slate-500' : 'text-red-400'}`}>
              Permitido: {brl(min)} a {brl(max)} por dia.
            </p>
          </div>
        )}

        {isDemoView && <p className="text-xs text-blue-300 font-mono">Modo DEMO: nada é enviado à Meta.</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-2 rounded border border-slate-700 text-slate-300 text-xs font-mono">
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={busy || !budgetValid}
            className="px-3 py-2 rounded bg-emerald-500 text-slate-950 font-bold text-xs font-mono disabled:opacity-50"
          >
            {busy ? 'Enviando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export type { PendingAction as MetaControlPendingAction };
