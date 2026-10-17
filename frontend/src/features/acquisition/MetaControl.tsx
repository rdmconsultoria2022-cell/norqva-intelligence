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

/** NORQVA-0097: id da ficha, gerado uma vez por pedido (toque duplo não repete a alteração). */
function newChangeId(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * NORQVA-0097 (D-0097): confirmação de pausar, reativar e orçamento. Cada pedido vira uma ficha
 * (POST /meta-changes): o administrador autoriza no mesmo passo; Performance pausa direto e o resto
 * espera o administrador. "Confirmado pela Meta" só depois de o NORQVA reler a Meta.
 */
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
  /** NORQVA-0097: teto e gasto do plano, para mostrar em quantos dias o teto chega no novo ritmo */
  capInfo?: { cap: number; spent: number | null } | null;
}> = ({ action, status, isDemoView, currentUser, apiFetch, onClose, onDone, onError, scopeCampaign, capInfo }) => {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  // NORQVA-0094: reativar campanha de plano pausado pela tela pede o código do plano (vale como novo Sim)
  const [codeNeeded, setCodeNeeded] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [increaseOk, setIncreaseOk] = useState(false);
  const changeId = useRef<string>(newChangeId());

  useEffect(() => {
    if (action?.kind === 'budget') setAmount(action.target.dailyBudget ? String(action.target.dailyBudget) : '');
    setBusy(false);
    setCodeNeeded(null);
    setCode('');
    setIncreaseOk(false);
    changeId.current = newChangeId();
  }, [action]);

  if (!action) return null;

  const { target } = action;
  const label = ENTITY_LABEL[target.entityType];
  const min = status?.limits.minDailyBudget ?? 5;
  const max = status?.limits.maxDailyBudget ?? 100;
  const parsed = Number(amount.replace(',', '.'));
  const budgetValid = action.kind !== 'budget' || (Number.isFinite(parsed) && parsed >= min && parsed <= max);
  const isAdmin = currentUser?.role === 'ADMIN';
  const waitsAdmin = !isAdmin && !(action.kind === 'status' && action.next === 'PAUSED');
  const current = action.kind === 'budget' && target.dailyBudget !== null && target.dailyBudget !== undefined ? Number(target.dailyBudget) : null;
  const diff = action.kind === 'budget' && current !== null && budgetValid ? Math.round((parsed - current) * 100) / 100 : null;
  const increase = diff !== null && diff > 0;
  const remaining = capInfo && capInfo.spent !== null ? Math.max(capInfo.cap - capInfo.spent, 0) : null;

  const confirm = async () => {
    if (busy || !budgetValid || (increase && !increaseOk)) return;
    setBusy(true);
    const mode = isDemoView ? 'demo' : 'real';
    const body = {
      id: changeId.current,
      entity_type: target.entityType,
      meta_id: target.id,
      kind: action.kind === 'status' ? 'STATUS' : 'DAILY_BUDGET',
      value: action.kind === 'status' ? action.next : parsed,
      ...(scopeCampaign ? { scope_campaign: scopeCampaign } : {}),
      ...(codeNeeded ? { confirm_code: code.trim() } : {})
    };
    try {
      const r = await apiFetch(`/meta-changes?mode=${mode}`, { method: 'POST', body: JSON.stringify(body) }, mode, currentUser);
      const c = r?.change || {};
      const what = action.kind === 'status' ? (action.next === 'PAUSED' ? 'pausado(a)' : 'ativado(a)') : `com orçamento de ${brl(parsed)}/dia`;
      const name = `${label[0].toUpperCase()}${label.slice(1)} "${target.name}"`;
      if (c.state === 'FAILED') {
        const msg = String(c.error || 'A alteração não foi feita.');
        const asked = action.kind === 'status' ? msg.match(/digite o código ([A-Za-z0-9_-]+)/) : null;
        // a ficha falhou: um novo pedido ganha outro id
        changeId.current = newChangeId();
        if (asked && !codeNeeded) {
          setCodeNeeded(asked[1]);
          setBusy(false);
          return;
        }
        onError(msg);
        setBusy(false);
        return;
      }
      if (c.state === 'AWAITING_APPROVAL') return onDone(`Pedido registrado: ${name} ${what}. Fica aguardando a autorização do administrador.`);
      if (c.state === 'UNCONFIRMED') return onDone(`A Meta aceitou: ${name} ${what}. O NORQVA ainda está conferindo; acompanhe no Histórico da campanha.`);
      return onDone(`${name} ${what} na Meta. Confirmado pela Meta.`);
    } catch (err: any) {
      onError(err?.message || 'Falha ao alterar na Meta.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-nq-surface border border-nq-line rounded-lg max-w-md w-full p-6 text-sm space-y-4">
        <h3 className="text-md font-bold text-nq-positive-text flex items-center gap-2">
          <Power className="h-4 w-4" /> {waitsAdmin ? 'Pedir ao administrador' : 'Confirmar na Meta'}
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
              {current !== null ? <span className="text-nq-muted"> (atual: {brl(current)})</span> : null}
            </p>
            <label htmlFor="meta-control-budget" className="block text-xs text-nq-muted">
              Novo orçamento diário (R$)
            </label>
            <input
              id="meta-control-budget"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setIncreaseOk(false);
              }}
              className="w-full bg-nq-bg border border-nq-line rounded p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text"
            />
            <p className={`text-xs ${budgetValid ? 'text-nq-subtle' : 'text-nq-critical-text'}`}>
              Permitido: {brl(min)} a {brl(max)} por dia.
            </p>
            {diff !== null && current !== null && diff !== 0 && (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs" data-testid="budget-review">
                <dt className="text-nq-muted">Hoje</dt>
                <dd className="text-nq-text tabular-nums">{brl(current)} por dia</dd>
                <dt className="text-nq-muted">Novo</dt>
                <dd className="text-nq-text tabular-nums">{brl(parsed)} por dia</dd>
                <dt className="text-nq-muted">Diferença</dt>
                <dd className={`tabular-nums ${increase ? 'text-nq-attention' : 'text-nq-positive-text'}`}>
                  {increase ? '+ ' : '− '}
                  {brl(Math.abs(diff))} por dia
                </dd>
                <dt className="text-nq-muted">No mês (30 dias)</dt>
                <dd className="text-nq-text tabular-nums">
                  {brl(current * 30)} → {brl(parsed * 30)} ({increase ? '+ ' : '− '}
                  {brl(Math.abs(diff) * 30)})
                </dd>
                {remaining !== null && capInfo && (
                  <>
                    <dt className="text-nq-muted">Teto</dt>
                    <dd className="text-nq-text">
                      {brl(capInfo.cap)}, faltam {brl(remaining)}: no novo ritmo, cerca de {Math.max(Math.round((remaining / Math.max(parsed, 0.01)) * 10) / 10, 0).toLocaleString('pt-BR')} dia(s)
                    </dd>
                  </>
                )}
              </dl>
            )}
            {increase && (
              <label className="flex items-start gap-2 text-xs text-nq-text min-h-[44px]">
                <input type="checkbox" checked={increaseOk} onChange={(e) => setIncreaseOk(e.target.checked)} className="mt-0.5 h-5 w-5" />
                <span>Aumentar o gasto em {brl(diff!)} por dia</span>
              </label>
            )}
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

        {waitsAdmin && <p className="text-xs text-nq-info">Este pedido fica aguardando a autorização do administrador por até 24 horas.</p>}
        {isDemoView && <p className="text-xs text-nq-info">Modo DEMO: nada é enviado à Meta.</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-2 min-h-[44px] rounded border border-nq-line text-nq-text text-xs">
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={busy || !budgetValid || (increase && !increaseOk) || (!!codeNeeded && code.trim().toUpperCase() !== codeNeeded.toUpperCase())}
            className="px-3 py-2 min-h-[44px] rounded bg-nq-positive text-nq-on-positive font-bold text-xs disabled:opacity-50"
          >
            {busy ? 'Enviando...' : waitsAdmin ? 'Pedir' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export type { PendingAction as MetaControlPendingAction };
