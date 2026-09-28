import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Factory, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, PencilLine, RefreshCw, Download, Link2 } from 'lucide-react';
import { UserObj } from '../../types';
import { useGlobalPeriod, periodQuery } from '../../lib/globalPeriod';

// NORQVA-0005 / G1: Creative Factory — batch matrix, claims gate, human approval and
// a deterministic scorecard per creative (Meta ad name == creative key).

export interface CreativeFactoryViewProps {
  currentUser: UserObj | null;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

const APPROVAL_LABEL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Aguardando revisão', cls: 'bg-slate-800 text-slate-300 border-slate-700' },
  APPROVED: { label: 'Aprovado', cls: 'bg-emerald-950/60 text-emerald-300 border-emerald-600/40' },
  REJECTED: { label: 'Rejeitado', cls: 'bg-red-950/50 text-red-300 border-red-600/40' },
  REVISION_REQUESTED: { label: 'Ajuste pedido', cls: 'bg-amber-950/50 text-amber-300 border-amber-600/40' },
  SUPERSEDED: { label: 'Substituído', cls: 'bg-slate-900 text-slate-500 border-slate-800' }
};

const RECOMMENDATION_LABEL: Record<string, { label: string; cls: string }> = {
  NOT_PUBLISHED: { label: 'Não publicado', cls: 'text-slate-500' },
  INSUFFICIENT_DATA: { label: 'Dados insuficientes', cls: 'text-slate-400' },
  OBSERVING: { label: 'Observando', cls: 'text-sky-300' },
  PAUSE_RECOMMENDED: { label: 'Pausar', cls: 'text-red-300' },
  UNDERPERFORMING: { label: 'Abaixo do equilíbrio', cls: 'text-amber-300' },
  PROMISING: { label: 'Promissor', cls: 'text-emerald-300' },
  WINNER_CANDIDATE: { label: 'Candidato a vencedor', cls: 'text-emerald-200 font-bold' }
};

const REASON_LABEL: Record<string, string> = {
  WEAK_HOOK: 'Hook fraco',
  ARTIFICIAL_LOOK: 'Aparência artificial',
  BAD_COPY: 'Texto ruim',
  EXAGGERATED_PROMISE: 'Promessa exagerada',
  UNCLEAR_PRODUCT: 'Produto pouco claro',
  BAD_VIDEO: 'Vídeo ruim',
  WRONG_IDENTITY: 'Identidade inadequada',
  BAD_CTA: 'CTA inadequado',
  OFF_STRATEGY: 'Fora da estratégia',
  POLICY_RISK: 'Risco de política da Meta',
  OTHER: 'Outro'
};

const brl = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function CreativeFactoryView({ currentUser, isDemoView, apiFetch, showError, showSuccess }: CreativeFactoryViewProps) {
  const { globalPeriod } = useGlobalPeriod();
  const periodQs = periodQuery(globalPeriod);
  const mode = isDemoView ? 'demo' : 'real';
  const isAdmin = currentUser?.role === 'ADMIN';
  const canRevise = isAdmin || currentUser?.role === 'CREATIVE';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [hookFilter, setHookFilter] = useState<string>('ALL');
  const [rejecting, setRejecting] = useState<{ id: string; decision: 'REJECTED' | 'REVISION_REQUESTED' } | null>(null);
  const [reason, setReason] = useState('WEAK_HOOK');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState<{ id: string; headline: string; primary_text: string; file_url: string } | null>(null);
  const [linking, setLinking] = useState<{ id: string; meta_ad_id: string } | null>(null);
  const [attaching, setAttaching] = useState<{ id: string; file_url: string } | null>(null);

  // App re-creates apiFetch/showError/showSuccess on every render: keep them in refs so the
  // loader only changes with mode/period (same pattern as CreativePerformanceView).
  const apiFetchRef = React.useRef(apiFetch);
  apiFetchRef.current = apiFetch;
  const showErrorRef = React.useRef(showError);
  showErrorRef.current = showError;
  const showSuccessRef = React.useRef(showSuccess);
  showSuccessRef.current = showSuccess;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetchRef.current(`/creative-factory/creatives?mode=${mode}&${periodQs}`);
      setData(res);
    } catch (err: any) {
      showErrorRef.current(err.message || 'Erro ao carregar a Fábrica de Criativos.');
    } finally {
      setLoading(false);
    }
  }, [mode, periodQs]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      showSuccessRef.current(ok);
      await load();
    } catch (err: any) {
      showErrorRef.current(err.message || 'Operação falhou.');
    } finally {
      setBusy(null);
    }
  };

  const post = (url: string, body: any = {}, method = 'POST') =>
    apiFetchRef.current(url, { method, body: JSON.stringify(body) });

  const importBatch = (code: string) =>
    run(`import-${code}`, () => post(`/creative-factory/batches/${code}/import?mode=${mode}`), `Lote ${code} importado.`);

  const setClaim = (id: string, status: string, note?: string) =>
    run(`claim-${id}`, () => post(`/creative-factory/claims/${id}?mode=${mode}`, { status, note }, 'PATCH'), 'Claim atualizada.');

  const approve = (id: string) =>
    run(`review-${id}`, () => post(`/creative-factory/creatives/${id}/review?mode=${mode}`, { decision: 'APPROVED' }), 'Criativo aprovado.');

  const submitReview = () => {
    if (!rejecting) return;
    const { id, decision } = rejecting;
    return run(
      `review-${id}`,
      () => post(`/creative-factory/creatives/${id}/review?mode=${mode}`, { decision, reason_code: reason, notes: notes || null }),
      decision === 'REJECTED' ? 'Criativo rejeitado.' : 'Ajuste pedido.'
    ).then(() => {
      setRejecting(null);
      setNotes('');
    });
  };

  const submitEdit = () => {
    if (!editing) return;
    const { id, headline, primary_text, file_url } = editing;
    return run(
      `revise-${id}`,
      () => post(`/creative-factory/creatives/${id}/revise?mode=${mode}`, { headline, primary_text, file_url: file_url || null }),
      'Criativo atualizado.'
    ).then(() => setEditing(null));
  };

  // NORQVA-0007: attach the produced file without creating a new version
  const submitAttach = () => {
    if (!attaching) return;
    const { id, file_url } = attaching;
    return run(
      `file-${id}`,
      () => post(`/creative-factory/creatives/${id}/file?mode=${mode}`, { file_url: file_url.trim() }),
      'Arquivo anexado ao criativo.'
    ).then(() => setAttaching(null));
  };

  const attachBatchAssets = (code: string) =>
    run(`assets-${code}`, () => post(`/creative-factory/batches/${code}/attach-assets?mode=${mode}`), `Arquivos produzidos do ${code} anexados.`);

  const submitLink = () => {
    if (!linking) return;
    const { id, meta_ad_id } = linking;
    return run(
      `link-${id}`,
      () => post(`/creative-factory/creatives/${id}/link-ad?mode=${mode}`, { meta_ad_id: meta_ad_id.trim() }),
      'Anúncio ligado ao criativo.'
    ).then(() => setLinking(null));
  };

  const creatives: any[] = data?.creatives || [];
  const hooks = useMemo(() => [...new Set(creatives.map(c => c.hook_family).filter(Boolean))], [creatives]);
  const visible = creatives.filter(
    c =>
      (statusFilter === 'ALL' || c.approval_status === statusFilter) &&
      (hookFilter === 'ALL' || c.hook_family === hookFilter) &&
      (statusFilter === 'SUPERSEDED' || c.approval_status !== 'SUPERSEDED')
  );
  const counts = creatives.reduce((acc: Record<string, number>, c) => {
    acc[c.approval_status] = (acc[c.approval_status] || 0) + 1;
    return acc;
  }, {});
  const notImported: string[] = (data?.availableBatches || []).filter((b: string) => !(data?.importedBatches || []).includes(b));
  const claims: any[] = data?.claims || [];
  const pendingClaims = claims.filter(c => c.status === 'UNVERIFIED');
  const hasFile = (c: any) => !!c.file_url && /^https?:\/\//i.test(c.file_url);
  const pendingAssets: { code: string; count: number }[] = Object.entries((data?.producedAssets || {}) as Record<string, string[]>)
    .map(([code, keys]) => ({
      code,
      count: creatives.filter(
        c => c.batch_code === code && c.approval_status !== 'SUPERSEDED' && !hasFile(c) && keys.includes(String(c.human_id).replace(/-DEMO$/, ''))
      ).length
    }))
    .filter(x => x.count > 0);

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Factory className="h-6 w-6 text-emerald-400" />
            Fábrica de Criativos
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Lotes de criativos, claims verificadas, aprovação humana e resultado por criativo. Nada é publicado na Meta por aqui.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Atualizar"
          className="self-start p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isAdmin && notImported.length > 0 && (
        <div className="p-4 rounded-xl border border-emerald-700/40 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-slate-200">
            Lote pronto para importar: <strong>{notImported.join(', ')}</strong>. Os criativos entram como rascunho e as claims como não verificadas.
          </div>
          {notImported.map(code => (
            <button
              key={code}
              onClick={() => importBatch(code)}
              disabled={busy === `import-${code}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> Importar {code}
            </button>
          ))}
        </div>
      )}

      {isAdmin && pendingAssets.length > 0 && (
        <div
          data-testid="pending-assets"
          className="p-4 rounded-xl border border-blue-700/40 bg-blue-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="text-sm text-slate-200">
            Já existem arquivos produzidos para{' '}
            <strong>{pendingAssets.map(p => `${p.count} criativo(s) do ${p.code}`).join(', ')}</strong>. Anexe para abrir pelo
            Creative Lab. Não cria versão nova nem muda a aprovação.
          </div>
          {pendingAssets.map(p => (
            <button
              key={p.code}
              onClick={() => attachBatchAssets(p.code)}
              disabled={busy === `assets-${p.code}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-blue-500 text-slate-950 text-xs font-bold hover:bg-blue-400 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> Anexar arquivos produzidos
            </button>
          ))}
        </div>
      )}

      {/* Claims */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Claims ({claims.length})
          </h2>
          {pendingClaims.length > 0 && (
            <span className="text-[11px] font-mono text-amber-300">
              {pendingClaims.length} aguardando verificação: sem elas nenhum criativo pode ser aprovado
            </span>
          )}
        </div>
        {claims.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma claim registrada.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {claims.map(cl => (
              <li key={cl.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <div className="text-xs text-slate-300">
                  <span className="font-mono text-slate-500 mr-2">{cl.human_id}</span>
                  {cl.claim_text}
                  {cl.status_note && <span className="block text-[11px] text-slate-500">{cl.status_note}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      cl.status === 'VERIFIED'
                        ? 'border-emerald-600/40 text-emerald-300'
                        : cl.status === 'REJECTED'
                        ? 'border-red-600/40 text-red-300'
                        : 'border-amber-600/40 text-amber-300'
                    }`}
                  >
                    {cl.status === 'VERIFIED' ? 'Verificada' : cl.status === 'REJECTED' ? 'Rejeitada' : cl.status === 'EXPIRED' ? 'Expirada' : 'Não verificada'}
                  </span>
                  {isAdmin && cl.status !== 'VERIFIED' && cl.status !== 'REJECTED' && (
                    <button
                      onClick={() => setClaim(cl.id, 'VERIFIED')}
                      disabled={busy === `claim-${cl.id}`}
                      className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-50"
                    >
                      Verificar
                    </button>
                  )}
                  {isAdmin && cl.status === 'VERIFIED' && (
                    <button
                      onClick={() => setClaim(cl.id, 'REJECTED', 'Revogada na Fábrica de Criativos')}
                      disabled={busy === `claim-${cl.id}`}
                      className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] disabled:opacity-50"
                    >
                      Revogar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        {['ALL', 'DRAFT', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED', 'SUPERSEDED'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded border ${statusFilter === s ? 'bg-emerald-500 text-slate-950 border-emerald-500' : 'border-slate-700 text-slate-300'}`}
          >
            {s === 'ALL' ? `Todos (${creatives.filter(c => c.approval_status !== 'SUPERSEDED').length})` : `${APPROVAL_LABEL[s].label} (${counts[s] || 0})`}
          </button>
        ))}
        <select
          aria-label="Filtrar por hook"
          value={hookFilter}
          onChange={e => setHookFilter(e.target.value)}
          className="bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded"
        >
          <option value="ALL">Todos os hooks</option>
          {hooks.map(h => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>

      {loading && !data && <p className="text-sm text-slate-400">Carregando…</p>}
      {!loading && creatives.length === 0 && (
        <p className="text-sm text-slate-400" data-testid="factory-empty">
          Nenhum criativo na fábrica ainda.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visible.map(c => {
          const st = APPROVAL_LABEL[c.approval_status] || APPROVAL_LABEL.DRAFT;
          const rec = RECOMMENDATION_LABEL[c.recommendation] || RECOMMENDATION_LABEL.OBSERVING;
          const last = c.reviews?.[0];
          return (
            <article key={c.id} data-testid="factory-card" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <header className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-emerald-300">{c.human_id}</div>
                  <div className="text-[11px] text-slate-500">
                    {c.hook_family} · {c.format} {c.duration_seconds ? `· ${c.duration_seconds}s` : ''} · v{c.version}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${st.cls}`}>{st.label}</span>
              </header>

              <p className="text-sm text-white font-semibold">“{c.hook}”</p>
              <div className="text-xs text-slate-300 space-y-1">
                <div><span className="text-slate-500">Mecanismo:</span> {c.mechanism}</div>
                <div><span className="text-slate-500">Título:</span> {c.headline}</div>
                <div className="text-slate-400">{c.primary_text}</div>
                <div><span className="text-slate-500">CTA:</span> {c.cta}</div>
                {c.file_url && /^https?:\/\//i.test(c.file_url) ? (
                  <a href={c.file_url} target="_blank" rel="noreferrer" className="text-emerald-300 underline">
                    Ver arquivo
                  </a>
                ) : (
                  <div className="text-amber-300/80">Arquivo ainda não produzido</div>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {(c.claims || []).map((cl: any) => (
                  <span
                    key={cl.id}
                    title={cl.text}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                      cl.status === 'VERIFIED' ? 'border-emerald-700/50 text-emerald-300' : 'border-amber-700/50 text-amber-300'
                    }`}
                  >
                    {cl.human_id}
                  </span>
                ))}
                {!c.claims_all_verified && (
                  <span className="text-[10px] text-amber-300 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" /> claims pendentes
                  </span>
                )}
              </div>

              <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2.5 text-[11px] font-mono grid grid-cols-3 gap-2">
                <div><div className="text-slate-500">Investido</div>{brl(c.metrics?.spend ?? null)}</div>
                <div><div className="text-slate-500">CTR link</div>{c.link_ctr !== null && c.link_ctr !== undefined ? `${c.link_ctr.toFixed(2)}%` : '—'}</div>
                <div><div className="text-slate-500">Visitas</div>{c.metrics?.offer_views ?? '—'}</div>
                <div><div className="text-slate-500">Checkout</div>{c.metrics ? `${c.metrics.checkout_modal_opened}/${c.metrics.checkout_started}` : '—'}</div>
                <div><div className="text-slate-500">Vendas</div>{c.metrics?.paid_orders ?? '—'}</div>
                <div><div className="text-slate-500">CPA</div>{brl(c.cpa)}</div>
                <div className="col-span-3 pt-1 border-t border-slate-800">
                  <span className={rec.cls}>{rec.label}</span>
                  <span className="text-slate-500"> · {c.recommendation_reason}</span>
                  {c.breakeven_cpa !== null && (
                    <span className="text-slate-600"> (equilíbrio {brl(c.breakeven_cpa)})</span>
                  )}
                </div>
              </div>

              {last && (
                <div className="text-[11px] text-slate-500">
                  Última revisão: {APPROVAL_LABEL[last.decision]?.label || last.decision}
                  {last.reason_code ? ` · ${REASON_LABEL[last.reason_code] || last.reason_code}` : ''}
                  {last.notes ? ` · ${last.notes}` : ''}
                  {last.reviewer_name ? ` · ${last.reviewer_name}` : ''}
                </div>
              )}

              {c.approval_status !== 'SUPERSEDED' && (
                <footer className="flex flex-wrap gap-2 pt-1">
                  {isAdmin && c.approval_status !== 'APPROVED' && (
                    <button
                      onClick={() => approve(c.id)}
                      disabled={busy === `review-${c.id}` || !c.claims_all_verified}
                      title={!c.claims_all_verified ? 'Verifique as claims antes de aprovar' : undefined}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-bold disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => { setRejecting({ id: c.id, decision: 'REVISION_REQUESTED' }); setReason('BAD_COPY'); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600/80 text-white text-xs font-bold"
                      >
                        <PencilLine className="h-3.5 w-3.5" /> Pedir ajuste
                      </button>
                      <button
                        onClick={() => { setRejecting({ id: c.id, decision: 'REJECTED' }); setReason('WEAK_HOOK'); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-700/80 text-white text-xs font-bold"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Rejeitar
                      </button>
                    </>
                  )}
                  {canRevise && (
                    <button
                      onClick={() => setAttaching({ id: c.id, file_url: hasFile(c) ? c.file_url : '' })}
                      className="px-2.5 py-1 rounded border border-slate-700 text-slate-300 text-xs"
                    >
                      {hasFile(c) ? 'Trocar arquivo' : 'Anexar arquivo'}
                    </button>
                  )}
                  {canRevise && (
                    <button
                      onClick={() => setEditing({ id: c.id, headline: c.headline || '', primary_text: c.primary_text || '', file_url: c.file_url || '' })}
                      className="px-2.5 py-1 rounded border border-slate-700 text-slate-300 text-xs"
                    >
                      Editar
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => setLinking({ id: c.id, meta_ad_id: '' })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 text-slate-300 text-xs"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Ligar anúncio
                    </button>
                  )}
                </footer>
              )}

              {rejecting?.id === c.id && (
                <div className="space-y-2 border-t border-slate-800 pt-2">
                  <select
                    aria-label="Motivo"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded text-xs"
                  >
                    {(data?.rejectionReasons || Object.keys(REASON_LABEL)).map((r: string) => (
                      <option key={r} value={r}>
                        {REASON_LABEL[r] || r}
                      </option>
                    ))}
                  </select>
                  <textarea
                    aria-label="Observações"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="O que precisa mudar?"
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded text-xs"
                  />
                  <div className="flex gap-2">
                    <button onClick={submitReview} className="px-2.5 py-1 rounded bg-slate-200 text-slate-900 text-xs font-bold">
                      Confirmar {rejecting?.decision === 'REJECTED' ? 'rejeição' : 'pedido de ajuste'}
                    </button>
                    <button onClick={() => setRejecting(null)} className="px-2.5 py-1 rounded border border-slate-700 text-slate-300 text-xs">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {editing?.id === c.id && (
                <div className="space-y-2 border-t border-slate-800 pt-2 text-xs">
                  <p className="text-[11px] text-slate-500">
                    Se este criativo já foi revisado, mudar título ou texto cria uma nova versão e a atual vira "Substituído". Para só anexar o arquivo, use "Anexar arquivo".
                  </p>
                  <input
                    aria-label="Título"
                    value={editing?.headline || ''}
                    onChange={e => { const v = e.target.value; setEditing(prev => (prev ? { ...prev, headline: v } : prev)); }}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded"
                  />
                  <textarea
                    aria-label="Texto principal"
                    value={editing?.primary_text || ''}
                    onChange={e => { const v = e.target.value; setEditing(prev => (prev ? { ...prev, primary_text: v } : prev)); }}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded h-20"
                  />
                  <input
                    aria-label="Link do arquivo"
                    placeholder="Link do vídeo/imagem produzido"
                    value={editing?.file_url || ''}
                    onChange={e => { const v = e.target.value; setEditing(prev => (prev ? { ...prev, file_url: v } : prev)); }}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded"
                  />
                  <div className="flex gap-2">
                    <button onClick={submitEdit} className="px-2.5 py-1 rounded bg-slate-200 text-slate-900 font-bold">
                      Salvar
                    </button>
                    <button onClick={() => setEditing(null)} className="px-2.5 py-1 rounded border border-slate-700 text-slate-300">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {attaching?.id === c.id && (
                <div className="space-y-2 border-t border-slate-800 pt-2 text-xs">
                  <p className="text-[11px] text-slate-500">
                    Link público do vídeo ou imagem (http/https). Mantém esta versão, a aprovação e o vínculo com o anúncio.
                  </p>
                  <input
                    aria-label="Link do arquivo produzido"
                    placeholder="https://..."
                    value={attaching?.file_url || ''}
                    onChange={e => { const v = e.target.value; setAttaching(prev => (prev ? { ...prev, file_url: v } : prev)); }}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={submitAttach}
                      disabled={!/^https?:\/\/\S+$/i.test((attaching?.file_url || '').trim()) || busy === `file-${c.id}`}
                      className="px-2.5 py-1 rounded bg-slate-200 text-slate-900 font-bold disabled:opacity-50"
                    >
                      Anexar
                    </button>
                    <button onClick={() => setAttaching(null)} className="px-2.5 py-1 rounded border border-slate-700 text-slate-300">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {linking?.id === c.id && (
                <div className="space-y-2 border-t border-slate-800 pt-2 text-xs">
                  <p className="text-[11px] text-slate-500">
                    Só é preciso se o nome do anúncio na Meta for diferente de {c.utm_content_key}.
                  </p>
                  <input
                    aria-label="ID do anúncio na Meta"
                    placeholder="ID do anúncio na Meta"
                    value={linking?.meta_ad_id || ''}
                    onChange={e => { const v = e.target.value; setLinking(prev => (prev ? { ...prev, meta_ad_id: v } : prev)); }}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded"
                  />
                  <div className="flex gap-2">
                    <button onClick={submitLink} className="px-2.5 py-1 rounded bg-slate-200 text-slate-900 font-bold">
                      Ligar
                    </button>
                    <button onClick={() => setLinking(null)} className="px-2.5 py-1 rounded border border-slate-700 text-slate-300">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
