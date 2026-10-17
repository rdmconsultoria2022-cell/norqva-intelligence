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
      <div data-testid="meta-control-banner" className="p-4 rounded-2xl bg-nq-surface text-nq-muted text-[13px] leading-[18px] flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 shrink-0 text-nq-positive-text mt-0.5" />
        <span>
          <strong className="text-nq-text font-medium">Controle de campanhas ativo{status.mode === 'demo' ? ' (simulação DEMO)' : ''}.</strong> Ativar, pausar e mudar orçamento diário daqui
          altera a Meta de verdade. Orçamento permitido: {brl(status.limits.minDailyBudget)} a {brl(status.limits.maxDailyBudget)} por dia.
        </span>
      </div>
    );
  }
  return (
    <div data-testid="meta-control-banner" className="p-4 rounded-2xl bg-nq-attention/10 text-nq-attention text-[13px] leading-[18px] flex items-start gap-3">
      <ShieldAlert className="h-4 w-4 shrink-0 text-nq-attention mt-0.5" />
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
        <button onClick={onRecheck} className="block underline text-nq-attention hover:text-nq-text">
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
    <div className="flex flex-wrap items-center gap-2">
      {canToggle && (
        <button
          disabled={!ready}
          title={title}
          onClick={() => onRequest({ kind: 'status', target, next: current === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })}
          className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${
            current === 'ACTIVE'
              ? 'bg-nq-attention/15 text-nq-attention hover:bg-nq-attention/25'
              : 'bg-nq-positive/15 text-nq-positive-text hover:bg-nq-positive/25'
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
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full bg-nq-raised text-nq-text text-[13px] font-semibold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
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
  // NORQVA-0094: reativar campanha de plano pausado pela tela pede o código do plano (vale como novo Sim)
  const [codeNeeded, setCodeNeeded] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (action?.kind === 'budget') setAmount(action.target.dailyBudget ? String(action.target.dailyBudget) : '');
    setBusy(false);
    setCodeNeeded(null);
    setCode('');
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
          {
            method: 'POST',
            body: JSON.stringify({
              status: action.next,
              ...(scopeCampaign ? { scope_campaign: scopeCampaign } : {}),
              ...(codeNeeded ? { confirm_code: code.trim() } : {})
            })
          },
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
      const msg = String(err?.message || 'Falha ao alterar na Meta.');
      const asked = action.kind === 'status' ? msg.match(/digite o código ([A-Za-z0-9_-]+)/) : null;
      if (asked && !codeNeeded) {
        setCodeNeeded(asked[1]);
        setBusy(false);
        return;
      }
      onError(msg);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-nq-surface border border-nq-line rounded-lg max-w-md w-full p-6 text-sm space-y-4">
        <h3 className="text-md font-bold text-nq-positive-text flex items-center gap-2">
          <Power className="h-4 w-4" /> Confirmar na Meta
        </h3>

        {action.kind === 'status' ? (
          <p className="text-nq-text">
            {action.next === 'PAUSED' ? 'Pausar' : 'Ativar'} {label} <strong>{target.name}</strong>?
            <span className="block mt-2 text-xs text-nq-muted">
              {action.next === 'ACTIVE'
                ? 'Ao ativar, a Meta volta a gastar o orçamento configurado.'
                : 'Ao pausar, a veiculação para em alguns minutos.'}
            </span>
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-nq-text">
              Orçamento diário de {label} <strong>{target.name}</strong>
              {target.dailyBudget ? <span className="text-nq-muted"> (atual: {brl(Number(target.dailyBudget))})</span> : null}
            </p>
            <label htmlFor="meta-control-budget" className="block text-xs text-nq-muted">
              Novo orçamento diário (R$)
            </label>
            <input
              id="meta-control-budget"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-nq-bg border border-nq-line rounded p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text"
            />
            <p className={`text-xs ${budgetValid ? 'text-nq-subtle' : 'text-nq-critical-text'}`}>
              Permitido: {brl(min)} a {brl(max)} por dia.
            </p>
          </div>
        )}

        {codeNeeded && (
          <div className="space-y-2" data-testid="meta-control-confirm-code">
            <p className="text-xs text-nq-attention">
              Esta campanha foi pausada pela tela. Para reativar, digite o código <strong>{codeNeeded}</strong>: vale como um novo Sim.
            </p>
            <label htmlFor="meta-control-code" className="block text-xs text-nq-muted">
              Código do plano
            </label>
            <input
              id="meta-control-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              className="w-full bg-nq-bg border border-nq-line rounded p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text"
            />
          </div>
        )}

        {isDemoView && <p className="text-xs text-nq-info">Modo DEMO: nada é enviado à Meta.</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-2 rounded border border-nq-line text-nq-text text-xs">
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={busy || !budgetValid || (!!codeNeeded && code.trim().toUpperCase() !== codeNeeded.toUpperCase())}
            className="px-3 py-2 rounded bg-nq-positive text-nq-on-positive font-bold text-xs disabled:opacity-50"
          >
            {busy ? 'Enviando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export type { PendingAction as MetaControlPendingAction };
