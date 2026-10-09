import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Sparkles, ClipboardList, CheckCircle2, XCircle, ExternalLink, RefreshCw, ChevronDown, ChevronRight, Send, ShieldCheck, ShieldAlert } from 'lucide-react';

// NORQVA-0017 (fase 3): Time de IAs — oportunidade → avaliação (Claude + segunda opinião GPT)
// → plano de campanha → lote de criativos em rascunho na Fábrica → aprovação do dono.

export type OppStatus = 'CAPTADA' | 'EM_AVALIACAO' | 'AVALIADA' | 'EM_PLANEJAMENTO' | 'PLANO_PRONTO' | 'APROVADA' | 'DESCARTADA';

export interface Opportunity {
  id: string;
  human_id: string;
  title: string;
  source: 'ACCOUNT' | 'EU_MARKET' | 'MANUAL';
  source_level: string | null;
  product_name?: string | null;
  niche_name?: string | null;
  brief: string | null;
  status: OppStatus;
  ai_score: number | null;
  verdict: 'SEGUIR' | 'TESTAR' | 'DESCARTAR' | null;
  evaluation: any;
  second_opinion: any;
  plan: any;
  batch_code: string | null;
  task_kind: 'EVALUATE' | 'PLAN' | null;
  task_stage?: 'EVALUATE' | 'VALIDATE' | 'PLAN' | null;
  validation?: any;
  validation_verdict?: ValidationVerdict | null;
  validation_override?: any;
  task_status: string | null;
  task_response: string | null;
  session_url: string | null;
  updated_at: string;
  /** NORQVA-0029: versão dos critérios validada quando a avaliação chegou (null = não validado) */
  criteria_version?: number | null;
}

/** NORQVA-0029: situação dos critérios de avaliação (aba Critérios da Pesquisa) */
export interface CriteriaStatus {
  validated: boolean;
  version: number | null;
  texts_changed?: boolean;
}

export type ValidationVerdict = 'APROVA' | 'REPROVA' | 'PEDE_EVIDENCIA';
export const VALIDATION_LABEL: Record<ValidationVerdict, string> = { APROVA: 'Validador aprovou', REPROVA: 'Validador reprovou', PEDE_EVIDENCIA: 'Validador pede evidência' };
const VALIDATION_CLS: Record<ValidationVerdict, string> = {
  APROVA: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  REPROVA: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  PEDE_EVIDENCIA: 'bg-amber-500/15 text-amber-300 border-amber-500/40'
};
const CHECK_CLS: Record<string, string> = { OK: 'text-emerald-300', ALERTA: 'text-amber-300', FALHA: 'text-rose-300' };
/** Same rule as the backend: plan only after the validator approved or the owner overrode the veto. */
export const validationPassed = (o: Pick<Opportunity, 'validation_verdict' | 'validation_override'>) => o.validation_verdict === 'APROVA' || !!o.validation_override;
const STAGE_LABEL: Record<string, string> = { EVALUATE: 'avaliação', VALIDATE: 'validação', PLAN: 'plano' };

export const STAGES: { id: OppStatus; label: string }[] = [
  { id: 'CAPTADA', label: 'Captadas' },
  { id: 'EM_AVALIACAO', label: 'Em avaliação' },
  { id: 'AVALIADA', label: 'Avaliadas' },
  { id: 'EM_PLANEJAMENTO', label: 'Em planejamento' },
  { id: 'PLANO_PRONTO', label: 'Plano pronto' },
  { id: 'APROVADA', label: 'Aprovadas' },
  { id: 'DESCARTADA', label: 'Descartadas' }
];

const SOURCE: Record<string, string> = { ACCOUNT: 'Nossa conta', EU_MARKET: 'Mercado UE', MANUAL: 'Briefing' };
const VERDICT_CLS: Record<string, string> = {
  SEGUIR: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  TESTAR: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  DESCARTAR: 'bg-rose-500/15 text-rose-300 border-rose-500/40'
};
const TASK_LABEL: Record<string, string> = {
  NOT_CONFIGURED: 'Automação não configurada',
  DISPATCHED: 'Enviado ao Claude',
  IN_PROGRESS: 'Claude trabalhando',
  DONE: 'Concluído',
  NEEDS_INPUT: 'Precisa de você',
  FAILED: 'Falhou'
};

interface Props {
  currentUser: any;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  /** NORQVA-0029: sem critérios validados, Aprovar plano fica travado (conta real) */
  criteria?: CriteriaStatus | null;
}

export const AiTeamView: React.FC<Props> = ({ currentUser, isDemoView, apiFetch, showError, showSuccess, criteria = null }) => {
  const approvalLocked = !isDemoView && !!criteria && !criteria.validated;
  const mode = isDemoView ? 'demo' : 'real';
  const isAdmin = currentUser?.role === 'ADMIN';
  const canCreate = isAdmin || currentUser?.role === 'INTELLIGENCE';
  const [items, setItems] = useState<Opportunity[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [justification, setJustification] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/ai-team/opportunities?mode=${mode}`);
      setItems(r?.opportunities || []);
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar as oportunidades.');
    }
  }, [apiFetch, mode]);

  useEffect(() => {
    load();
  }, [load]);

  // While the AIs work, refresh every 20 s
  const working = useMemo(() => items.some(o => o.task_status === 'DISPATCHED' || o.task_status === 'IN_PROGRESS'), [items]);
  useEffect(() => {
    if (!working) return;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [working, load]);

  const post = async (id: string, path: string, body: any, ok: string) => {
    setBusy(id + path);
    try {
      await apiFetch(`/ai-team/opportunities/${id}/${path}?mode=${mode}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
      showSuccess(ok);
      load();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível concluir a ação.');
    } finally {
      setBusy(null);
    }
  };

  const create = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await apiFetch(`/ai-team/opportunities?mode=${mode}`, { method: 'POST', body: JSON.stringify({ source: 'MANUAL', brief }), headers: { 'Content-Type': 'application/json' } });
      setBrief('');
      showSuccess('Oportunidade criada. Peça a avaliação ao time de IAs.');
      load();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível criar a oportunidade.');
    }
  };

  return (
    <div className="space-y-5" data-testid="ai-team-view">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <Bot className="h-5 w-5 text-violet-400" /> Time de IAs
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            O Claude analista avalia cada oportunidade com os dados da Base de campanhas e do mercado europeu. Um segundo Claude, em modo crítico, valida e
            questiona a análise com um checklist fixo: só com a aprovação dele (ou a sua, com justificativa) o Claude monta o plano e deixa os criativos em
            rascunho na Fábrica. Você aprova. As IAs nunca publicam nem mexem em orçamento na Meta.
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {approvalLocked && (
        <div className="rounded border border-amber-600/50 bg-amber-950/20 p-3 text-xs text-amber-200" data-testid="criteria-not-validated">
          {criteria?.texts_changed
            ? 'Os critérios de avaliação mudaram depois da última validação. Até validar de novo na aba Critérios, nenhum plano pode ser aprovado.'
            : 'Os critérios de avaliação ainda não foram validados. As IAs seguem avaliando, mas nenhum plano pode ser aprovado até você validar na aba Critérios.'}
        </div>
      )}

      {canCreate && (
        <form onSubmit={create} className="flex flex-wrap items-end gap-2 rounded border border-dashed border-slate-700 p-3 text-xs">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-slate-400">Nova oportunidade (briefing livre). Também dá para criar a partir da Base de campanhas e do Mercado europeu.</span>
            <input value={brief} onChange={e => setBrief(e.target.value)} placeholder="Ex.: testar o Bolso Blindado para autônomos com gancho de 'pró-labore'" className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100" />
          </label>
          <button type="submit" disabled={brief.trim().length < 5} className="inline-flex items-center gap-1 rounded bg-violet-600 px-3 py-1.5 font-semibold text-white hover:bg-violet-500 disabled:opacity-40">
            <Sparkles className="h-3.5 w-3.5" /> Criar
          </button>
        </form>
      )}

      {items.length === 0 && <p className="text-sm text-slate-500">Nenhuma oportunidade ainda.</p>}

      {STAGES.map(stage => {
        const group = items.filter(o => o.status === stage.id);
        if (group.length === 0) return null;
        return (
          <section key={stage.id} data-testid={`ai-stage-${stage.id}`}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {stage.label} ({group.length})
            </h3>
            <div className="space-y-2">
              {group.map(o => (
                <div key={o.id} className="rounded border border-slate-800 bg-slate-900/40" data-testid="ai-opportunity">
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === o.id ? null : o.id)}>
                      {open === o.id ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                      <span className="font-mono text-[11px] text-slate-500">{o.human_id}</span>
                      <span className="truncate font-semibold text-slate-100">{o.title}</span>
                      <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{SOURCE[o.source]}</span>
                      {o.verdict && <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${VERDICT_CLS[o.verdict]}`}>{o.verdict} · {o.ai_score}</span>}
                      {o.verdict && !o.criteria_version && (
                        <span className="rounded border border-amber-600/50 px-1.5 py-0.5 text-[10px] text-amber-300" data-testid="criteria-badge">
                          critério não validado
                        </span>
                      )}
                      {o.verdict && !!o.criteria_version && (
                        <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400" data-testid="criteria-badge">
                          critérios v{o.criteria_version}
                        </span>
                      )}
                      {o.validation_verdict && (
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${VALIDATION_CLS[o.validation_verdict]}`} data-testid="validation-badge">
                          {VALIDATION_LABEL[o.validation_verdict]}
                          {o.validation_override ? ' · veto derrubado' : ''}
                        </span>
                      )}
                    </button>
                    {o.task_status && (
                      <span className="text-[11px] text-slate-400">
                        {TASK_LABEL[o.task_status] || o.task_status}
                        {(o.task_stage || o.task_kind) ? ` (${STAGE_LABEL[(o.task_stage || o.task_kind) as string] || ''})` : ''}
                        {o.session_url && (
                          <a href={o.session_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-sky-300 hover:underline">
                            sessão <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </span>
                    )}
                    {isAdmin && (
                      <div className="flex flex-wrap gap-1.5">
                        {['CAPTADA', 'AVALIADA', 'PLANO_PRONTO'].includes(o.status) && (
                          <ActionBtn disabled={busy !== null} onClick={() => post(o.id, 'dispatch', { kind: 'EVALUATE' }, 'Avaliação pedida ao time de IAs.')} icon={Send} label={o.status === 'CAPTADA' ? 'Pedir avaliação' : 'Reavaliar'} />
                        )}
                        {['EM_AVALIACAO', 'EM_PLANEJAMENTO'].includes(o.status) && (
                          <ActionBtn
                            disabled={busy !== null}
                            onClick={() => post(o.id, 'dispatch', { kind: o.status === 'EM_AVALIACAO' ? 'EVALUATE' : 'PLAN' }, 'Pedido reenviado ao Claude.')}
                            icon={Send}
                            label="Reenviar ao Claude"
                          />
                        )}
                        {o.status === 'AVALIADA' && !o.validation_override && (
                          <ActionBtn
                            disabled={busy !== null}
                            onClick={() => post(o.id, 'dispatch', { kind: 'VALIDATE' }, 'Validação pedida ao Claude crítico.')}
                            icon={ShieldCheck}
                            label={o.validation_verdict ? 'Validar de novo' : 'Pedir validação'}
                          />
                        )}
                        {o.status === 'AVALIADA' && (o.validation_verdict === 'REPROVA' || o.validation_verdict === 'PEDE_EVIDENCIA') && !o.validation_override && (
                          <ActionBtn disabled={busy !== null} onClick={() => { setOverrideFor(overrideFor === o.id ? null : o.id); setJustification(''); }} icon={ShieldAlert} label="Derrubar veto" />
                        )}
                        {['AVALIADA', 'PLANO_PRONTO'].includes(o.status) && validationPassed(o) && (
                          <ActionBtn disabled={busy !== null} onClick={() => post(o.id, 'dispatch', { kind: 'PLAN' }, 'Plano pedido ao Claude.')} icon={ClipboardList} label={o.status === 'PLANO_PRONTO' ? 'Refazer plano' : 'Montar plano'} />
                        )}
                        {o.status === 'PLANO_PRONTO' && (
                          <ActionBtn
                            primary
                            disabled={busy !== null || approvalLocked}
                            title={approvalLocked ? 'Valide os critérios na aba Critérios antes de aprovar' : undefined}
                            onClick={() => post(o.id, 'decision', { decision: 'APROVADA' }, 'Plano aprovado. Revise e aprove os criativos na Fábrica.')}
                            icon={CheckCircle2}
                            label="Aprovar plano"
                          />
                        )}
                        {!['APROVADA', 'DESCARTADA'].includes(o.status) && (
                          <ActionBtn disabled={busy !== null} onClick={() => post(o.id, 'decision', { decision: 'DESCARTADA' }, 'Oportunidade descartada.')} icon={XCircle} label="Descartar" />
                        )}
                      </div>
                    )}
                  </div>
                  {isAdmin && overrideFor === o.id && (
                    <div className="space-y-2 border-t border-slate-800 bg-rose-950/10 p-3 text-xs" data-testid="override-form">
                      <p className="text-slate-300">
                        Derrubar o veto do validador libera o plano. Fica registrado em seu nome, com a justificativa, na auditoria de decisões.
                      </p>
                      <textarea
                        aria-label="Justificativa"
                        value={justification}
                        onChange={e => setJustification(e.target.value)}
                        rows={3}
                        placeholder="Por que seguir mesmo com o veto? (mínimo 20 caracteres)"
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                      />
                      <div className="flex gap-2">
                        <ActionBtn
                          primary
                          disabled={busy !== null || justification.trim().length < 20}
                          onClick={async () => {
                            await post(o.id, 'validation-override', { justification: justification.trim() }, 'Veto derrubado. Agora dá para montar o plano.');
                            setOverrideFor(null);
                          }}
                          icon={ShieldAlert}
                          label="Confirmar e derrubar o veto"
                        />
                        <ActionBtn onClick={() => setOverrideFor(null)} icon={XCircle} label="Cancelar" />
                      </div>
                    </div>
                  )}
                  {open === o.id && <OpportunityDetail o={o} />}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const ActionBtn: React.FC<{ onClick: () => void; icon: React.ElementType; label: string; disabled?: boolean; primary?: boolean; title?: string }> = ({ onClick, icon: Icon, label, disabled, primary, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs disabled:opacity-40 ${primary ? 'bg-emerald-600 font-semibold text-white hover:bg-emerald-500' : 'border border-slate-700 text-slate-200 hover:bg-slate-800'}`}
  >
    <Icon className="h-3.5 w-3.5" /> {label}
  </button>
);

const Opinion: React.FC<{ title: string; v: any }> = ({ title, v }) => (
  <div className="rounded border border-slate-800 bg-slate-950/60 p-3">
    <div className="mb-1 flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</span>
      {v?.verdict && <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${VERDICT_CLS[v.verdict] || ''}`}>{v.verdict} · {v.score}</span>}
    </div>
    {!v && <p className="text-slate-500">Ainda não recebida.</p>}
    {v?.skipped && <p className="text-slate-500">{v.reason}</p>}
    {v?.summary && <p className="text-slate-200">{v.summary}</p>}
    {Array.isArray(v?.strengths) && v.strengths.length > 0 && <p className="mt-1 text-emerald-300/90">+ {v.strengths.join(' · ')}</p>}
    {Array.isArray(v?.risks) && v.risks.length > 0 && <p className="mt-1 text-rose-300/90">Riscos: {v.risks.join(' · ')}</p>}
    {Array.isArray(v?.hypotheses) && v.hypotheses.length > 0 && <p className="mt-1 text-sky-300/90">Hipóteses: {v.hypotheses.join(' · ')}</p>}
  </div>
);

export const OpportunityDetail: React.FC<{ o: Opportunity }> = ({ o }) => (
  <div className="space-y-3 border-t border-slate-800 p-3 text-xs" data-testid="ai-opportunity-detail">
    {o.brief && <p className="text-slate-300">Briefing: {o.brief}</p>}
    {(o.product_name || o.niche_name) && (
      <p className="text-slate-400">
        {o.product_name ? `Produto: ${o.product_name}` : ''} {o.niche_name ? `· Nicho UE: ${o.niche_name}` : ''}
      </p>
    )}
    {o.task_response && <p className="text-slate-400">Último retorno: {o.task_response}</p>}
    <div className="grid gap-3 md:grid-cols-2">
      <Opinion title="Avaliação — Claude" v={o.evaluation} />
      <Opinion title="Segunda opinião — GPT" v={o.second_opinion} />
    </div>
    <ValidationCard o={o} />
    {o.plan && (
      <div className="rounded border border-violet-800/50 bg-violet-950/20 p-3" data-testid="ai-opportunity-plan">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-300">Plano de campanha</div>
        {o.plan.summary && <p className="text-slate-200">{o.plan.summary}</p>}
        {o.plan.campaign && (
          <p className="mt-1 text-slate-400">
            {Object.entries(o.plan.campaign)
              .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
              .join(' · ')}
          </p>
        )}
        {o.plan.test_plan && <p className="mt-1 whitespace-pre-line text-slate-300">{o.plan.test_plan}</p>}
        <p className="mt-2 text-slate-300">
          {o.plan.creatives_count} criativo(s) em rascunho na Fábrica de Criativos, lote <span className="font-mono">{o.batch_code}</span>. Revise, aprove e produza por lá.
        </p>
      </div>
    )}
    {o.plan?.launch && <LaunchSheetCard l={o.plan.launch} />}
  </div>
);

export const ValidationCard: React.FC<{ o: Opportunity }> = ({ o }) => {
  const v = o.validation;
  if (!v && !o.validation_override) {
    return <div className="rounded border border-slate-800 bg-slate-950/60 p-3 text-slate-500">Validação — Claude crítico: ainda não pedida.</div>;
  }
  return (
    <div className="rounded border border-slate-800 bg-slate-950/60 p-3" data-testid="ai-opportunity-validation">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Validação — Claude crítico</span>
        {o.validation_verdict && <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${VALIDATION_CLS[o.validation_verdict]}`}>{VALIDATION_LABEL[o.validation_verdict]}</span>}
      </div>
      {v?.summary && <p className="text-slate-200">{v.summary}</p>}
      {Array.isArray(v?.checklist) && (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {v.checklist.map((c: any) => (
            <li key={c.key} className="text-slate-300">
              <span className={`font-semibold ${CHECK_CLS[c.status] || ''}`}>{c.status}</span> · {c.label}
              {c.note ? <span className="text-slate-500"> — {c.note}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(v?.questions) && v.questions.length > 0 && <p className="mt-2 text-sky-300/90">Perguntas: {v.questions.join(' · ')}</p>}
      {Array.isArray(v?.required_evidence) && v.required_evidence.length > 0 && <p className="mt-1 text-amber-300/90">Evidência pedida: {v.required_evidence.join(' · ')}</p>}
      {o.validation_override && (
        <p className="mt-2 rounded border border-rose-800/50 bg-rose-950/20 p-2 text-rose-200" data-testid="validation-override">
          Veto derrubado por {o.validation_override.by || 'ADMIN'} em {new Date(o.validation_override.at).toLocaleString('pt-BR')}: {o.validation_override.justification}
        </p>
      )}
    </div>
  );
};

const brlFmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** NORQVA-0021 (P3): campaign sheet from the Creative AI, saved as a DRAFT launch plan. */
export const LaunchSheetCard: React.FC<{ l: any }> = ({ l }) => (
  <div className="rounded border border-emerald-800/50 bg-emerald-950/10 p-3" data-testid="ai-launch-sheet">
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Ficha da campanha</span>
      {l.draft ? (
        <span className="rounded border border-emerald-600/50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200">
          Plano {l.draft.code} · {l.draft.status === 'DRAFT' ? 'rascunho' : l.draft.status}
        </span>
      ) : (
        <span className="text-[10px] text-slate-500">plano de lançamento não gravado</span>
      )}
    </div>
    <div className="grid gap-x-6 gap-y-1 text-slate-300 sm:grid-cols-2">
      <span>Campanha: <span className="font-mono">{l.campaign_name}</span></span>
      <span>Objetivo: Vendas · evento Compra</span>
      <span>Orçamento: {brlFmt(l.daily_budget_brl)}/dia</span>
      <span>Teto do teste: {brlFmt(l.max_spend_brl)}</span>
      <span className="sm:col-span-2 break-all">Destino: {l.destination_url}</span>
    </div>
    {Array.isArray(l.adsets) && (
      <ul className="mt-2 space-y-0.5 text-slate-400">
        {l.adsets.map((a: any) => (
          <li key={a.name}>
            Conjunto <span className="font-mono">{a.name}</span>: {brlFmt(a.daily_budget_brl)}/dia · {(a.targeting?.countries || []).join(', ')} · {a.targeting?.age_min}–{a.targeting?.age_max} anos
            {a.targeting_summary ? ` · ${a.targeting_summary}` : ''} · {(l.ads || []).filter((x: any) => x.adset_name === a.name).length} anúncio(s)
          </li>
        ))}
      </ul>
    )}
    {Array.isArray(l.excluded_creatives) && l.excluded_creatives.length > 0 && (
      <p className="mt-1 text-amber-300/90">Fora do plano (não são vídeo): {l.excluded_creatives.map((x: any) => x.key).join(', ')}</p>
    )}
    {Array.isArray(l.pause_rules) && l.pause_rules.length > 0 && <p className="mt-1 text-slate-400">Regras de pausa: {l.pause_rules.join(' · ')}</p>}
    {l.note && <p className="mt-1 text-amber-300/90">{l.note}</p>}
    <p className="mt-2 text-slate-500">
      Nada foi criado na Meta. Os vídeos ficam como TO_BE_FILLED até os criativos serem produzidos e aprovados; a criação (pausada) e a ativação seguem o fluxo
      de planos de lançamento, com a sua resposta.
    </p>
  </div>
);
