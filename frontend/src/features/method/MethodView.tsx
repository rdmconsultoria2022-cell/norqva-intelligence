import React, { useCallback, useEffect, useState } from 'react';
import { Compass, ChevronDown, ChevronRight, Plus, CheckCircle2, XCircle } from 'lucide-react';

// NORQVA-0022 — Método NORQVA de Campanhas. Mapa das 10 etapas, matriz de hipóteses, pipeline e checklist
// dos criativos, medição honesta (SEM DADOS / INSUFICIENTES / CONFIÁVEIS), decisões e aprendizado.
// Nada nesta tela ativa, publica ou muda orçamento.

type StageStatus = 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'BLOQUEADO' | 'PRONTO' | 'CONCLUIDO';

const STATUS: Record<StageStatus, { label: string; cls: string }> = {
  NAO_INICIADO: { label: 'Não iniciado', cls: 'border-slate-600 text-slate-400' },
  EM_ANDAMENTO: { label: 'Em andamento', cls: 'border-amber-500/60 text-amber-300' },
  BLOQUEADO: { label: 'Bloqueado', cls: 'border-rose-500/60 text-rose-300' },
  PRONTO: { label: 'Pronto', cls: 'border-sky-500/60 text-sky-300' },
  CONCLUIDO: { label: 'Concluído', cls: 'border-emerald-500/60 text-emerald-300' }
};
const LEVEL: Record<string, { label: string; cls: string }> = {
  SEM_DADOS: { label: 'SEM DADOS', cls: 'text-slate-400' },
  DADOS_INSUFICIENTES: { label: 'DADOS INSUFICIENTES', cls: 'text-amber-300' },
  DADOS_CONFIAVEIS: { label: 'DADOS CONFIÁVEIS', cls: 'text-emerald-300' }
};
const PIPELINE = ['IDEIA', 'ROTEIRO', 'ASSETS', 'PRODUCAO', 'REVISAO', 'APROVADO', 'PUBLICADO', 'MEDIDO', 'CLASSIFICADO'];
const PILOT = {
  offer_human_id: 'OFF-000001',
  central_proposition:
    'Permitir que uma pessoa reproduza em casa uma experiência inspirada em uma trattoria italiana através de receitas e técnicas acessíveis.'
};
const fmt = (v: number | null | undefined, kind: 'brl' | 'pct' | 'int' | 'x' = 'int') => {
  if (v === null || v === undefined) return '—';
  if (kind === 'brl') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (kind === 'pct') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  if (kind === 'x') return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return Math.round(v).toLocaleString('pt-BR');
};

interface Props {
  currentUser: any;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

export const MethodView: React.FC<Props> = ({ currentUser, isDemoView, apiFetch, showError, showSuccess }) => {
  const mode = isDemoView ? 'demo' : 'real';
  const role = currentUser?.role;
  const isAdmin = role === 'ADMIN';
  const canWrite = isAdmin || role === 'INTELLIGENCE';
  const [cases, setCases] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [tab, setTab] = useState<'hipoteses' | 'criativos' | 'medicao' | 'decisoes' | 'aprendizado'>('criativos');

  const post = async (url: string, body: any, method = 'POST') =>
    apiFetch(`${url}${url.includes('?') ? '&' : '?'}mode=${mode}`, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

  const loadCases = useCallback(async () => {
    try {
      const r = await apiFetch(`/method/cases?mode=${mode}`);
      const list = r?.cases || [];
      setCases(list);
      setSelected(prev => prev || list[0]?.id || null);
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar o Método NORQVA.');
    }
  }, [apiFetch, mode]);

  const loadCase = useCallback(async () => {
    if (!selected) return setData(null);
    try {
      setData(await apiFetch(`/method/cases/${selected}?mode=${mode}`));
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar o caso.');
    }
  }, [apiFetch, mode, selected]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);
  useEffect(() => {
    loadCase();
  }, [loadCase]);
  // Sem hipótese registrada, o primeiro passo é a aba Hipóteses (onde fica o formulário).
  const caseId = data?.case?.id;
  const noHypotheses = data ? data.hypotheses.length === 0 : false;
  useEffect(() => {
    if (caseId && noHypotheses) setTab('hipoteses');
  }, [caseId]); // eslint-disable-line react-hooks/exhaustive-deps
  const goHypotheses = () => {
    setTab('hipoteses');
    setTimeout(() => document.querySelector<HTMLInputElement>('[aria-label="Hipótese"]')?.focus(), 0);
  };

  const act = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      showSuccess(ok);
      await loadCase();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível concluir.');
    }
  };

  const createPilot = () =>
    act(async () => {
      const r = await post('/method/cases', PILOT);
      setSelected(r?.case?.id || null);
      await loadCases();
    }, 'Caso TRATTORIA EM CASA criado. A proposta central entrou como hipótese de oferta (não validada).');

  return (
    <div className="space-y-5" data-testid="method-view">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-100">
          <Compass className="h-5 w-5 text-emerald-400" /> Método NORQVA
        </h2>
        <div className="mt-2 space-y-1 rounded border border-emerald-700/40 bg-emerald-950/20 p-3 text-sm text-emerald-100" data-testid="method-principles">
          <p>Nenhum criativo existe apenas para produzir conteúdo. Cada criativo deve testar uma hipótese.</p>
          <p>Cada campanha deve produzir dois resultados: 1. vendas; 2. aprendizado.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {cases.map(c => (
          <button key={c.id} onClick={() => setSelected(c.id)} className={`rounded border px-3 py-1.5 text-xs ${selected === c.id ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-300'}`}>
            {c.human_id} · {c.title}
          </button>
        ))}
        {isAdmin && !cases.some(c => c.offer_human_id === PILOT.offer_human_id) && (
          <button onClick={createPilot} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500" data-testid="method-create-pilot">
            <Plus className="h-3.5 w-3.5" /> Criar caso TRATTORIA EM CASA (OFF-000001)
          </button>
        )}
      </div>

      {!data && <p className="text-sm text-slate-500">{cases.length ? 'Carregando…' : 'Nenhum caso ainda.'}</p>}

      {data && (
        <>
          <CaseHeader data={data} canWrite={canWrite} onSave={(body: any) => act(() => post(`/method/cases/${data.case.id}`, body, 'PATCH'), 'Caso atualizado.')} />

          <ol className="space-y-1" data-testid="method-map">
            {data.stages.map((s: any, i: number) => {
              const st = STATUS[s.status as StageStatus] || STATUS.NAO_INICIADO;
              return (
                <li key={s.n}>
                  <div className="rounded border border-slate-800 bg-slate-900/50" data-testid={`method-stage-${s.n}`}>
                    <div className="flex flex-wrap items-center gap-3 p-3">
                      <span className="w-6 text-center font-mono text-sm text-slate-500">{s.n}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-100">{s.title}</div>
                        <div className="text-[11px] text-slate-500">{s.question} · {s.folder}</div>
                      </div>
                      <div className="w-28">
                        <div className="h-1.5 rounded bg-slate-800">
                          <div className="h-1.5 rounded bg-emerald-500" style={{ width: `${s.progress}%` }} />
                        </div>
                        <div className="mt-0.5 text-right text-[10px] text-slate-500">{s.progress}%</div>
                      </div>
                      <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${st.cls}`} data-testid="stage-status">{st.label}</span>
                      <button onClick={() => setOpen(open === s.n ? null : s.n)} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
                        {open === s.n ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Ver detalhes
                      </button>
                    </div>
                    {s.pending.length > 0 && <div className="px-12 pb-2 text-[11px] text-amber-300">{s.pending.slice(0, 3).join(' · ')}{s.pending.length > 3 ? ` · +${s.pending.length - 3}` : ''}</div>}
                    {open === s.n && (
                      <div className="space-y-2 border-t border-slate-800 p-3 pl-12 text-xs text-slate-300" data-testid="stage-detail">
                        <div>Responsável: {s.owner_id ? 'definido' : 'PENDENTE'}</div>
                        <div>
                          <span className="text-slate-500">Pendências:</span> {s.pending.length ? s.pending.join(' · ') : 'nenhuma'}
                        </div>
                        <div>
                          <span className="text-slate-500">Evidências:</span> {s.evidence.length ? s.evidence.join(' · ') : 'SEM DADOS'}
                        </div>
                        {s.notes && <div className="text-slate-400">Notas: {s.notes}</div>}
                        {canWrite && s.n === 5 && (
                          <button onClick={goHypotheses} className="mr-2 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white" data-testid="stage-go-hypotheses">
                            Registrar hipótese
                          </button>
                        )}
                        {canWrite && (
                          <button
                            onClick={() => act(() => post(`/method/cases/${data.case.id}/stages/${s.n}`, { blocked: s.status !== 'BLOQUEADO' }, 'PATCH'), s.status === 'BLOQUEADO' ? 'Etapa desbloqueada.' : 'Etapa marcada como bloqueada.')}
                            className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300"
                          >
                            {s.status === 'BLOQUEADO' ? 'Desbloquear' : 'Marcar como bloqueada'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {i < data.stages.length - 1 ? <div className="pl-4 text-slate-600">↓</div> : <div className="pl-4 text-slate-500">↺ próximo teste</div>}
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap gap-1 border-b border-slate-800" role="tablist">
            {([['criativos', 'Criativos'], ['hipoteses', 'Hipóteses'], ['medicao', 'Medição'], ['decisoes', 'Decisões'], ['aprendizado', 'Aprendizado']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`px-3 py-2 text-sm ${tab === id ? 'border-b-2 border-emerald-400 font-semibold text-emerald-300' : 'text-slate-400'}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'hipoteses' && <HypothesesTab data={data} canWrite={canWrite} onCreate={(b: any) => act(() => post(`/method/cases/${data.case.id}/hypotheses`, b), 'Hipótese registrada.')} />}
          {tab === 'criativos' && <CreativesTab data={data} canWrite={canWrite} isAdmin={isAdmin} onImport={(adId: string, hid: string) => act(() => post(`/method/cases/${data.case.id}/external-ads/${adId}/import`, hid ? { hypothesis_id: hid } : {}), 'Anúncio trazido para Criativos só como registro. Nada foi alterado na Meta.')} onGoHypotheses={goHypotheses} onLink={(cid: string, hid: string) => act(() => post(`/method/creatives/${cid}/hypothesis`, { hypothesis_id: hid }), 'Criativo ligado à hipótese.')} />}
          {tab === 'medicao' && <MeasurementTab data={data} />}
          {tab === 'decisoes' && <DecisionsTab data={data} isAdmin={isAdmin} onDecide={(cid: string, b: any) => act(() => post(`/method/creatives/${cid}/decision`, b), 'Decisão registrada. Nada foi alterado na Meta.')} />}
          {tab === 'aprendizado' && (
            <LearningTab
              data={data}
              canWrite={canWrite}
              onCreate={(b: any) => act(() => post('/method/learnings', { ...b, case_id: data.case.id }), 'Aprendizado registrado.')}
              onNewHypothesis={(lid: string, b: any) => act(() => post(`/method/learnings/${lid}/hypothesis`, b), 'Nova hipótese criada a partir do aprendizado.')}
            />
          )}
        </>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string | null; pendingLabel?: string }> = ({ label, value, pendingLabel = 'PENDENTE' }) => (
  <div>
    <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className={value ? 'text-slate-200' : 'text-amber-300'}>{value || pendingLabel}</div>
  </div>
);

const CaseHeader: React.FC<{ data: any; canWrite: boolean; onSave: (b: any) => void }> = ({ data, canWrite, onSave }) => {
  const c = data.case;
  const [edit, setEdit] = useState(false);
  const [aud, setAud] = useState(c.audience_summary || '');
  const [prob, setProb] = useState(c.problem_desire || '');
  return (
    <div className="grid gap-3 rounded border border-slate-800 bg-slate-900/40 p-3 text-xs md:grid-cols-4" data-testid="method-case-header">
      <Field label="Produto" value={data.product ? `${data.product.name}` : null} />
      <Field label="Oferta" value={data.offer ? `${data.offer.human_id} · ${fmt(Number(data.offer.promotional_price ?? data.offer.price), 'brl')}` : null} />
      <div className="md:col-span-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Proposta central</div>
        <div className="text-slate-200">{c.central_proposition || 'PENDENTE'}</div>
        <span className="mt-1 inline-block rounded border border-amber-500/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300" data-testid="proposition-status">
          {c.proposition_status === 'VALIDADO' ? 'VALIDADA' : c.proposition_status === 'REJEITADO' ? 'REJEITADA' : 'HIPÓTESE DE OFERTA · NÃO VALIDADO'}
        </span>
      </div>
      <Field label="Público" value={c.audience_summary} />
      <Field label="Problema / desejo" value={c.problem_desire} />
      {canWrite && !edit && (
        <button onClick={() => setEdit(true)} className="self-end rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
          Editar público e problema
        </button>
      )}
      {edit && (
        <div className="space-y-2 md:col-span-4">
          <input aria-label="Público" value={aud} onChange={e => setAud(e.target.value)} placeholder="Para quem estamos vendendo?" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
          <input aria-label="Problema ou desejo" value={prob} onChange={e => setProb(e.target.value)} placeholder="Qual problema ou desejo existe?" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
          <button onClick={() => { onSave({ audience_summary: aud, problem_desire: prob }); setEdit(false); }} className="rounded bg-emerald-600 px-3 py-1 font-semibold text-white">
            Salvar
          </button>
        </div>
      )}
    </div>
  );
};

const HypothesesTab: React.FC<{ data: any; canWrite: boolean; onCreate: (b: any) => void }> = ({ data, canWrite, onCreate }) => {
  const [f, setF] = useState({ angle: '', hook: '', statement: '', variable_tested: 'GANCHO', format: 'VIDEO', audience: '' });
  return (
    <div className="space-y-3" data-testid="method-hypotheses">
      {data.hypotheses.length === 0 && <p className="text-sm text-amber-300">PENDENTE: nenhuma hipótese registrada.</p>}
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase text-slate-500">
          <tr><th className="p-1">ID</th><th>Ângulo</th><th>Gancho</th><th>Hipótese</th><th>Variável</th><th>Formato</th><th>Versão</th><th>Status</th></tr>
        </thead>
        <tbody>
          {data.hypotheses.map((h: any) => (
            <tr key={h.id} className="border-t border-slate-800 align-top">
              <td className="p-1 font-mono">{h.human_id}</td><td>{h.angle || '—'}</td><td>{h.hook || '—'}</td><td className="text-slate-200">{h.statement}</td>
              <td>{h.variable_tested}</td><td>{h.format || '—'}</td><td>{h.version}</td><td>{h.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && (
        <div className="grid gap-2 rounded border border-dashed border-slate-700 p-3 text-xs text-slate-100 md:grid-cols-3" data-testid="hypothesis-form">
          <div className="text-[11px] text-slate-400 md:col-span-3">Nova hipótese: preencha o campo Hipótese (mín. 5 caracteres) e clique em Registrar hipótese.</div>
          <input aria-label="Ângulo" placeholder="Ângulo" value={f.angle} onChange={e => setF({ ...f, angle: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
          <input aria-label="Gancho" placeholder="Gancho" value={f.hook} onChange={e => setF({ ...f, hook: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100 md:col-span-2" />
          <input aria-label="Hipótese" placeholder="Hipótese: o que exatamente queremos testar?" value={f.statement} onChange={e => setF({ ...f, statement: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100 md:col-span-3" />
          <select aria-label="Variável testada" value={f.variable_tested} onChange={e => setF({ ...f, variable_tested: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100">
            {['GANCHO', 'ANGULO', 'FORMATO', 'OFERTA', 'PUBLICO', 'COPY', 'VISUAL'].map(v => <option key={v}>{v}</option>)}
          </select>
          <input aria-label="Público da hipótese" placeholder="Público" value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
          <button disabled={f.statement.trim().length < 5} onClick={() => { onCreate(f); setF({ ...f, statement: '', hook: '' }); }} className="rounded bg-emerald-600 px-3 py-1 font-semibold text-white disabled:opacity-40">
            Registrar hipótese
          </button>
        </div>
      )}
    </div>
  );
};

const CreativesTab: React.FC<{ data: any; canWrite: boolean; isAdmin?: boolean; onLink: (cid: string, hid: string) => void; onImport?: (adId: string, hid: string) => void; onGoHypotheses?: () => void }> = ({ data, canWrite, isAdmin, onLink, onImport, onGoHypotheses }) => (
  <div className="space-y-2" data-testid="method-creatives">
    {data.creatives.length === 0 && data.external_ads.length === 0 && <p className="text-sm text-slate-500">Nenhum criativo deste produto.</p>}
    {data.creatives.map((c: any) => (
      <div key={c.id} className="rounded border border-slate-800 p-3 text-xs" data-testid="method-creative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-slate-100">{c.human_id}</span>
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${c.checklist.ready ? 'border-emerald-500/60 text-emerald-300' : 'border-rose-500/60 text-rose-300'}`} data-testid="creative-readiness">
            {c.checklist.ready ? 'PRONTO' : 'NÃO PRONTO'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Pipeline do criativo">
          {PIPELINE.map(p => (
            <span key={p} className={`rounded px-1.5 py-0.5 text-[10px] ${p === c.pipeline ? 'bg-emerald-600 font-semibold text-white' : PIPELINE.indexOf(p) < PIPELINE.indexOf(c.pipeline) ? 'bg-slate-700 text-slate-200' : 'bg-slate-900 text-slate-500'}`}>
              {p}
            </span>
          ))}
        </div>
        <div className="mt-2 text-slate-300">
          Hipótese: {c.hypothesis ? <span className="text-slate-100">{c.hypothesis.human_id} — {c.hypothesis.statement}</span> : <span className="text-amber-300">PENDENTE: sem hipótese registrada</span>}
          {canWrite && data.hypotheses.length === 0 && (
            <button onClick={onGoHypotheses} className="ml-2 rounded border border-emerald-600/60 px-1.5 py-0.5 text-[11px] text-emerald-300" data-testid="creative-go-hypotheses">
              Registrar a hipótese primeiro (aba Hipóteses)
            </button>
          )}
          {canWrite && data.hypotheses.length > 0 && (
            <select aria-label={`Hipótese de ${c.human_id}`} value={c.hypothesis_id || ''} onChange={e => e.target.value && onLink(c.id, e.target.value)} className="ml-2 rounded border border-slate-700 bg-slate-950 px-1 py-0.5">
              <option value="">ligar a uma hipótese…</option>
              {data.hypotheses.map((h: any) => <option key={h.id} value={h.id}>{h.human_id}</option>)}
            </select>
          )}
        </div>
        <ul className="mt-2 grid gap-x-4 gap-y-0.5 sm:grid-cols-2" data-testid="creative-checklist">
          {c.checklist.items.map((i: any) => (
            <li key={i.key} className={i.ok ? 'text-emerald-300' : 'text-amber-300'}>
              {i.ok ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : <XCircle className="mr-1 inline h-3 w-3" />}
              {i.label}
              {!i.ok && <span className="text-slate-500"> — {i.detail}</span>}
            </li>
          ))}
        </ul>
      </div>
    ))}
    {data.external_ads.length > 0 && (
      <div className="rounded border border-slate-800 p-3 text-xs text-slate-400">
        <div className="mb-1 font-semibold text-slate-300">Anúncios na Meta sem criativo no NORQVA (sem hipótese registrada → NÃO PRONTO)</div>
        {isAdmin && onImport && (
          <div className="mb-2 text-[11px] text-slate-500">Trazer para Criativos cria só um registro ligado ao anúncio, para poder ligar a hipótese e medir. Nada muda na Meta.</div>
        )}
        {data.external_ads.map((a: any) => (
          <ExternalAdRow key={a.meta_ad_id} ad={a} hypotheses={data.hypotheses} canImport={!!isAdmin && !!onImport} onImport={onImport} />
        ))}
      </div>
    )}
  </div>
);

const ExternalAdRow: React.FC<{ ad: any; hypotheses: any[]; canImport: boolean; onImport?: (adId: string, hid: string) => void }> = ({ ad, hypotheses, canImport, onImport }) => {
  const [hid, setHid] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/60 py-1.5" data-testid="method-external-ad">
      <span>
        {ad.name} · {ad.campaign_name} · <span className={LEVEL[ad.measurement.data_level].cls}>{LEVEL[ad.measurement.data_level].label}</span>
      </span>
      {canImport && (
        <>
          <select aria-label={`Hipótese de ${ad.name}`} value={hid} onChange={e => setHid(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-100">
            <option value="">sem hipótese por enquanto</option>
            {hypotheses.map((h: any) => <option key={h.id} value={h.id}>{h.human_id}{h.angle ? ` · ${h.angle}` : ''}</option>)}
          </select>
          <button onClick={() => onImport && onImport(ad.meta_ad_id, hid)} className="rounded border border-emerald-600/60 px-2 py-0.5 text-[11px] text-emerald-300" data-testid="external-ad-import">
            Trazer para Criativos (só registro)
          </button>
        </>
      )}
    </div>
  );
};

const MeasurementTab: React.FC<{ data: any }> = ({ data }) => {
  const rows = [...data.creatives.map((c: any) => ({ id: c.id, name: c.human_id, m: c.measurement })), ...data.external_ads.map((a: any) => ({ id: a.meta_ad_id, name: a.name, m: a.measurement }))];
  return (
    <div className="overflow-x-auto" data-testid="method-measurement">
      <p className="mb-2 text-[11px] text-slate-500">Classificação heurística: não é significância estatística. "—" = sem dado (nunca zero).</p>
      <table className="w-full text-right text-xs">
        <thead className="text-[10px] uppercase text-slate-500">
          <tr><th className="p-1 text-left">Criativo</th><th className="text-left">Dados</th><th>Invest.</th><th>Impr.</th><th>CPM</th><th>Cliques</th><th>CTR</th><th>CPC</th><th>Visitas</th><th>Checkout</th><th>Compras</th><th>Conv.</th><th>Receita</th><th>CAC</th><th>ROAS</th></tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const m = r.m.metrics || {};
            const lv = LEVEL[r.m.data_level];
            return (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="p-1 text-left font-mono">{r.name}</td>
                <td className={`text-left ${lv.cls}`}>{lv.label}</td>
                <td>{fmt(m.investimento, 'brl')}</td><td>{fmt(m.impressoes)}</td><td>{fmt(m.cpm, 'brl')}</td><td>{fmt(m.cliques)}</td><td>{fmt(m.ctr, 'pct')}</td>
                <td>{fmt(m.cpc, 'brl')}</td><td>{fmt(m.visitas)}</td><td>{fmt(m.checkout)}</td><td>{fmt(m.compras)}</td><td>{fmt(m.conversao, 'pct')}</td>
                <td>{fmt(m.receita, 'brl')}</td><td>{fmt(m.cac, 'brl')}</td><td>{fmt(m.roas, 'x')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const DecisionsTab: React.FC<{ data: any; isAdmin: boolean; onDecide: (cid: string, b: any) => void }> = ({ data, isAdmin, onDecide }) => {
  const [f, setF] = useState({ creative: '', decision: 'ITERAR', reason: '', confidence: 'BAIXA', evidence_notes: '' });
  return (
    <div className="space-y-3 text-xs" data-testid="method-decisions">
      {data.decisions.length === 0 && <p className="text-amber-300">PENDENTE: nenhuma decisão registrada.</p>}
      {data.decisions.map((d: any) => (
        <div key={d.id} className="rounded border border-slate-800 p-2">
          <span className="font-semibold text-slate-100">{d.decision}</span> · confiança {d.confidence} · {LEVEL[d.data_level]?.label} · {new Date(d.decided_at).toLocaleString('pt-BR')}
          <div className="text-slate-300">{d.reason}</div>
        </div>
      ))}
      {isAdmin && (
        <div className="grid gap-2 rounded border border-dashed border-slate-700 p-3 md:grid-cols-4">
          <select aria-label="Criativo da decisão" value={f.creative} onChange={e => setF({ ...f, creative: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100">
            <option value="">criativo…</option>
            {data.creatives.map((c: any) => <option key={c.id} value={c.id}>{c.human_id}</option>)}
          </select>
          <select aria-label="Decisão" value={f.decision} onChange={e => setF({ ...f, decision: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100">
            {['MATAR', 'MANTER', 'ITERAR', 'ESCALAR'].map(v => <option key={v}>{v}</option>)}
          </select>
          <select aria-label="Confiança" value={f.confidence} onChange={e => setF({ ...f, confidence: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100">
            {['BAIXA', 'MEDIA', 'ALTA'].map(v => <option key={v}>{v}</option>)}
          </select>
          <input aria-label="Motivo" placeholder="Motivo (obrigatório)" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 md:col-span-4" />
          <input aria-label="Evidências" placeholder="Evidências (as métricas atuais são anexadas automaticamente)" value={f.evidence_notes} onChange={e => setF({ ...f, evidence_notes: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100 md:col-span-3" />
          <button disabled={!f.creative || f.reason.trim().length < 10} onClick={() => onDecide(f.creative, f)} className="rounded bg-emerald-600 px-3 py-1 font-semibold text-white disabled:opacity-40">
            Registrar decisão
          </button>
          <p className="text-[11px] text-slate-500 md:col-span-4">A decisão é um registro. MATAR não pausa nada na Meta; pausar continua sendo uma ação separada em Meta Ads.</p>
        </div>
      )}
    </div>
  );
};

const LearningTab: React.FC<{ data: any; canWrite: boolean; onCreate: (b: any) => void; onNewHypothesis: (lid: string, b: any) => void }> = ({ data, canWrite, onCreate, onNewHypothesis }) => {
  const [f, setF] = useState({ source_decision_id: '', type: 'GANCHO', status: 'PROMISSORA', statement: '' });
  return (
    <div className="space-y-3 text-xs" data-testid="method-learnings">
      <p className="text-[11px] text-slate-500">Campanha → dados → aprendizado → nova hipótese → novo criativo → novo teste.</p>
      {data.learnings.length === 0 && <p className="text-amber-300">PENDENTE: nenhum aprendizado registrado.</p>}
      {data.learnings.map((l: any) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-2">
          <div>
            <span className="font-mono text-slate-500">{l.human_id}</span> · {l.type} · <span className="font-semibold">{l.status}</span>
            <div className="text-slate-200">{l.statement}</div>
          </div>
          {canWrite && (
            <button onClick={() => onNewHypothesis(l.id, { statement: `A partir de ${l.human_id}: ${l.statement}`, variable_tested: l.type === 'ANGULO' ? 'ANGULO' : l.type === 'FORMATO' ? 'FORMATO' : l.type === 'OFERTA' ? 'OFERTA' : l.type === 'PUBLICO' ? 'PUBLICO' : l.type === 'PADRAO_VISUAL' ? 'VISUAL' : 'GANCHO' })} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
              Gerar nova hipótese
            </button>
          )}
        </div>
      ))}
      {canWrite && data.decisions.length > 0 && (
        <div className="grid gap-2 rounded border border-dashed border-slate-700 p-3 md:grid-cols-4">
          <select aria-label="Decisão de origem" value={f.source_decision_id} onChange={e => setF({ ...f, source_decision_id: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100">
            <option value="">decisão de origem…</option>
            {data.decisions.map((d: any) => <option key={d.id} value={d.id}>{d.decision} · {new Date(d.decided_at).toLocaleDateString('pt-BR')}</option>)}
          </select>
          <select aria-label="Tipo" value={f.type} onChange={e => setF({ ...f, type: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100">
            {['GANCHO', 'ANGULO', 'OFERTA', 'FORMATO', 'OBJECAO', 'PADRAO_VISUAL', 'PUBLICO', 'FALHA', 'HIPOTESE'].map(v => <option key={v}>{v}</option>)}
          </select>
          <select aria-label="Status do aprendizado" value={f.status} onChange={e => setF({ ...f, status: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100">
            {['VENCEDOR', 'PROMISSORA', 'VALIDADA', 'REJEITADA'].map(v => <option key={v}>{v}</option>)}
          </select>
          <input aria-label="Aprendizado" placeholder="O que aprendemos?" value={f.statement} onChange={e => setF({ ...f, statement: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100 md:col-span-3" />
          <button disabled={!f.source_decision_id || f.statement.trim().length < 5} onClick={() => onCreate(f)} className="rounded bg-emerald-600 px-3 py-1 font-semibold text-white disabled:opacity-40">
            Registrar aprendizado
          </button>
        </div>
      )}
    </div>
  );
};
