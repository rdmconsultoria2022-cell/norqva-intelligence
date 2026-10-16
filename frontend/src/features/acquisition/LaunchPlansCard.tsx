import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle, Rocket } from 'lucide-react';

// NORQVA-0019 (D-0010): o Claude cria a campanha inteira na Meta, PAUSADA. Ela só passa a veicular
// quando o operador responde "Sim" aqui. Card exibido na Visão Executiva e na tela Meta Ads (ADMIN).

export interface LaunchPlanAdSet {
  name: string;
  daily_budget_brl: number;
  targeting_summary?: string | null;
}

export interface LaunchPlanAd {
  name: string;
  adset_name: string;
}

export interface LaunchPlan {
  id: string;
  code: string;
  status: string;
  question_text: string;
  daily_budget_brl: number;
  max_spend_brl: number;
  last_error?: string | null;
  spec: {
    campaign: { name: string };
    adsets: LaunchPlanAdSet[];
    ads: LaunchPlanAd[];
    pause_rules?: string[];
  };
}

type Answer = 'YES' | 'NO';

const brl = (n: number) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isPlan = (p: any): p is LaunchPlan =>
  !!p && typeof p.id === 'string' && !!p.spec?.campaign?.name && Array.isArray(p.spec?.adsets) && Array.isArray(p.spec?.ads);

// Aguardando resposta, ou aprovado com ativação incompleta (responder Sim de novo retoma).
export const needsOperator = (p: LaunchPlan) => p.status === 'AWAITING_OPERATOR' || (p.status === 'APPROVED' && !!p.last_error);

export const LaunchPlansCard: React.FC<{
  apiFetch: (url: string, options?: any, mode?: string, user?: any) => Promise<any>;
  currentUser: any;
  isDemoView: boolean;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  /** NORQVA-0028: avisa a tela Campanhas para recarregar a lista e o experimento */
  onAnswered?: () => void;
}> = ({ apiFetch, currentUser, isDemoView, showError, showSuccess, onAnswered }) => {
  const enabled = currentUser?.role === 'ADMIN' && !isDemoView;
  const [plans, setPlans] = useState<LaunchPlan[]>([]);
  const [pending, setPending] = useState<{ plan: LaunchPlan; answer: Answer } | null>(null);
  const [busy, setBusy] = useState(false);
  const fetchRef = useRef(apiFetch);
  fetchRef.current = apiFetch;
  const userRef = useRef(currentUser);
  userRef.current = currentUser;

  const load = useCallback(async () => {
    if (!enabled) {
      setPlans([]);
      return;
    }
    try {
      const res = await fetchRef.current('/launch-plans', {}, 'real', userRef.current);
      setPlans(Array.isArray(res?.plans) ? res.plans.filter(isPlan).filter(needsOperator) : []);
    } catch {
      setPlans([]);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled || plans.length === 0) return null;

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    const { plan, answer } = pending;
    try {
      await fetchRef.current(
        `/launch-plans/${encodeURIComponent(plan.id)}/answer`,
        { method: 'POST', body: JSON.stringify({ answer }) },
        'real',
        userRef.current
      );
      showSuccess(
        answer === 'YES'
          ? `"${plan.spec.campaign.name}" ativada na Meta com ${brl(plan.daily_budget_brl)}/dia (teto ${brl(plan.max_spend_brl)}).`
          : `Plano ${plan.code} recusado. Nada foi ativado; os objetos continuam pausados na Meta.`
      );
      setPending(null);
      await load();
      onAnswered?.();
    } catch (err: any) {
      showError(err?.message || 'Falha ao registrar a resposta.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="launch-plans-card" className="p-4 rounded-2xl bg-nq-attention/10 space-y-4">
      <h3 className="text-[15px] font-semibold text-nq-attention flex items-center gap-2">
        <HelpCircle className="h-4 w-4" /> Aguardando sua decisão
      </h3>

      {plans.map((plan) => (
        <div key={plan.id} data-testid={`launch-plan-${plan.code}`} className="p-4 rounded-2xl bg-nq-surface space-y-3 text-[15px]">
          <p className="text-nq-text font-semibold">{plan.question_text}</p>
          {plan.status === 'APPROVED' ? (
            <p className="text-xs text-nq-critical-text">
              Ativação incompleta: {plan.last_error}. Responder "Sim" de novo retoma a ativação dos objetos deste plano.
            </p>
          ) : null}
          <div className="text-[13px] leading-[18px] text-nq-muted space-y-1">
            <div>
              Campanha: <span className="text-nq-text">{plan.spec.campaign.name}</span> <span className="text-nq-subtle">({plan.code}, criada pausada)</span>
            </div>
            <div>
              Orçamento por dia: <span className="text-nq-text">{brl(plan.daily_budget_brl)}</span> · Teto: <span className="text-nq-text">{brl(plan.max_spend_brl)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px] leading-[18px]">
            <div>
              <div className="text-nq-subtle mb-1">Conjuntos ({plan.spec.adsets.length})</div>
              <ul className="space-y-1 text-nq-text">
                {plan.spec.adsets.map((s) => (
                  <li key={s.name}>
                    {s.name} · {brl(s.daily_budget_brl)}/dia
                    {s.targeting_summary ? <span className="text-nq-subtle"> · {s.targeting_summary}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-nq-subtle mb-1">Anúncios ({plan.spec.ads.length})</div>
              <ul className="space-y-1 text-nq-text">
                {plan.spec.ads.map((a) => (
                  <li key={a.name}>
                    {a.name} <span className="text-nq-subtle">→ {a.adset_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {plan.spec.pause_rules && plan.spec.pause_rules.length > 0 ? (
            <div className="text-[13px] leading-[18px]">
              <div className="text-nq-subtle mb-1">Regras</div>
              <ul className="list-disc pl-4 space-y-1 text-nq-muted">
                {plan.spec.pause_rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPending({ plan, answer: 'YES' })}
              className="min-h-[44px] px-4 rounded-full text-[15px] font-semibold bg-nq-positive hover:brightness-110 text-nq-on-positive flex items-center gap-2"
            >
              <Rocket className="h-3.5 w-3.5" /> Sim, ativar
            </button>
            {plan.status === 'AWAITING_OPERATOR' ? (
              <button
                onClick={() => setPending({ plan, answer: 'NO' })}
                className="min-h-[44px] px-4 rounded-full text-[15px] font-semibold bg-nq-raised hover:bg-nq-line text-nq-text"
              >
                Não
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {pending ? (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-nq-surface rounded-2xl max-w-md w-full p-6 text-[15px] space-y-4">
            <h3 className="text-md font-bold text-nq-attention">
              {pending.answer === 'YES' ? 'Confirmar ativação' : 'Confirmar recusa'}
            </h3>
            {pending.answer === 'YES' ? (
              <p className="text-nq-text">
                Ativar <strong>{pending.plan.spec.campaign.name}</strong> com {brl(pending.plan.daily_budget_brl)}/dia e teto de{' '}
                {brl(pending.plan.max_spend_brl)}?
                <span className="block mt-2 text-xs text-nq-muted">
                  A Meta passa a gastar a partir de agora. Só a campanha, os conjuntos e os anúncios deste plano são ativados; as demais campanhas não mudam.
                </span>
              </p>
            ) : (
              <p className="text-nq-text">
                Recusar o plano <strong>{pending.plan.code}</strong>?
                <span className="block mt-2 text-xs text-nq-muted">Nada é ativado. Os objetos continuam pausados na Meta, sem gasto.</span>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPending(null)}
                disabled={busy}
                className="px-3 py-2 rounded text-xs bg-nq-raised hover:bg-nq-line text-nq-text border border-nq-line"
              >
                Cancelar
              </button>
              <button
                onClick={confirm}
                disabled={busy}
                className="px-3 py-2 rounded text-xs font-bold bg-nq-positive hover:brightness-110 text-nq-on-positive disabled:opacity-50"
              >
                {busy ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
