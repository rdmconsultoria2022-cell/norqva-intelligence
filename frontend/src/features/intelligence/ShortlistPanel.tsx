import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ListChecks, Send, SlidersHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import { ClassBadge, ScoreBar, brl, pct, CLASS_META, IntelClass } from './CampaignBaseView';

// NORQVA-0021 (P1): automatic shortlist of campaigns and ads for the Time de IAs.
// Criteria are visible and editable; sending only creates opportunities (no Claude call, no Meta change).

type ShortLevel = 'campaign' | 'ad';

export interface ShortlistCriteria {
  limit: number;
  levels: ShortLevel[];
  classes: IntelClass[];
  min_spend: number;
  min_impressions: number;
  min_days: number;
  max_cpa_ratio: number | null;
  require_product: boolean;
}

export interface ShortlistCandidate {
  rank: number;
  level: ShortLevel;
  key: string;
  name: string;
  status: string | null;
  campaign_name: string | null;
  product_name: string | null;
  classification: IntelClass;
  score: number;
  confidence: number;
  days_active: number;
  spend: number;
  sales: number;
  revenue: number;
  cpa: number | null;
  breakeven_cpa: number | null;
  roas: number | null;
  ctr_link: number | null;
  hook_rate: number | null;
  landing_page_views: number;
  reason: string;
  why: string[];
  flags: string[];
  opportunity: { id: string; human_id: string; status: string } | null;
}

export interface ShortlistResponse {
  criteria: ShortlistCriteria;
  candidates: ShortlistCandidate[];
  pool: { campaign: number; ad: number };
  excluded: { total: number; by_reason: Record<string, number> };
  note: string | null;
}

export const DEFAULT_SHORTLIST_CRITERIA: ShortlistCriteria = {
  limit: 30,
  levels: ['campaign', 'ad'],
  classes: ['VENCEDOR', 'PROMISSOR', 'TESTANDO'],
  min_spend: 10,
  min_impressions: 500,
  min_days: 2,
  max_cpa_ratio: 1.5,
  require_product: false
};

const EXCLUSION_LABELS: Record<string, string> = {
  CLASS: 'classe fora dos critérios',
  MIN_SPEND: 'investimento abaixo do mínimo',
  MIN_IMPRESSIONS: 'poucas impressões',
  MIN_DAYS: 'poucos dias no ar',
  CPA_RATIO: 'CPA acima do teto',
  NO_PRODUCT: 'sem produto identificado',
  LIMIT: 'além do limite'
};

export function criteriaQuery(c: ShortlistCriteria): string {
  const p = new URLSearchParams({
    limit: String(c.limit),
    levels: c.levels.join(','),
    classes: c.classes.join(','),
    min_spend: String(c.min_spend),
    min_impressions: String(c.min_impressions),
    min_days: String(c.min_days),
    max_cpa_ratio: c.max_cpa_ratio === null ? 'none' : String(c.max_cpa_ratio),
    require_product: String(c.require_product)
  });
  return p.toString();
}

interface Props {
  mode: 'demo' | 'real';
  periodQs: string;
  canSend: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

export const ShortlistPanel: React.FC<Props> = ({ mode, periodQs, canSend, apiFetch, showError, showSuccess }) => {
  const [criteria, setCriteria] = useState<ShortlistCriteria>(DEFAULT_SHORTLIST_CRITERIA);
  const [draft, setDraft] = useState<ShortlistCriteria>(DEFAULT_SHORTLIST_CRITERIA);
  const [data, setData] = useState<ShortlistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await apiFetch(`/intelligence/shortlist?mode=${mode}&${criteriaQuery(criteria)}${periodQs ? `&${periodQs}` : ''}`);
      const r: ShortlistResponse = {
        criteria: raw?.criteria || criteria,
        candidates: Array.isArray(raw?.candidates) ? raw.candidates : [],
        pool: raw?.pool || { campaign: 0, ad: 0 },
        excluded: raw?.excluded || { total: 0, by_reason: {} },
        note: raw?.note || null
      };
      setData(r);
      setSelected(new Set(r.candidates.filter(c => !c.opportunity).map(c => `${c.level}:${c.key}`)));
    } catch (e: any) {
      showError(e?.message || 'Falha ao montar a lista de candidatos.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, mode, criteria, periodQs]);

  useEffect(() => {
    load();
  }, [load]);

  const candidates = data?.candidates || [];
  const sendable = useMemo(() => candidates.filter(c => !c.opportunity && selected.has(`${c.level}:${c.key}`)), [candidates, selected]);

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    if (!sendable.length) return;
    setSending(true);
    try {
      const r = await apiFetch(`/ai-team/shortlist/send?mode=${mode}`, {
        method: 'POST',
        body: JSON.stringify({ items: sendable.map(c => ({ level: c.level, key: c.key })), criteria }),
        headers: { 'Content-Type': 'application/json' }
      });
      const n = r?.created?.length || 0;
      const skipped = r?.skipped?.length || 0;
      showSuccess(`${n} oportunidade(s) criada(s) no Time de IAs${skipped ? `, ${skipped} ignorada(s)` : ''}.`);
      load();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível enviar ao Time de IAs.');
    } finally {
      setSending(false);
    }
  };

  const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const numInput = (label: string, field: 'limit' | 'min_spend' | 'min_impressions' | 'min_days', step = 1) => (
    <label className="flex flex-col gap-1 text-[11px] text-slate-400">
      {label}
      <input
        type="number"
        min={0}
        step={step}
        aria-label={label}
        value={draft[field]}
        onChange={e => setDraft({ ...draft, [field]: Number(e.target.value) })}
        className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
      />
    </label>
  );

  return (
    <section className="space-y-3 rounded border border-violet-700/40 bg-violet-950/10 p-4" data-testid="shortlist-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-100">
            <ListChecks className="h-4 w-4 text-violet-300" /> Seleção automática para o Time de IAs
          </h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            Até {criteria.limit} campanhas e anúncios, ordenados pela pontuação da Base de campanhas, filtrados pelos critérios abaixo.
            Enviar cria oportunidades no Time de IAs; nada é alterado na Meta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCriteria(!showCriteria)}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Critérios {showCriteria ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {canSend && (
            <button
              onClick={send}
              disabled={sending || sendable.length === 0}
              className="inline-flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Enviar {sendable.length} ao Time de IAs
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-slate-400" data-testid="shortlist-criteria-summary">
        <span className="rounded border border-slate-700 px-2 py-0.5">Níveis: {criteria.levels.map(l => (l === 'campaign' ? 'campanhas' : 'anúncios')).join(' + ')}</span>
        <span className="rounded border border-slate-700 px-2 py-0.5">Classes: {criteria.classes.map(c => CLASS_META[c].label).join(', ')}</span>
        <span className="rounded border border-slate-700 px-2 py-0.5">Investimento ≥ {brl(criteria.min_spend)}</span>
        <span className="rounded border border-slate-700 px-2 py-0.5">Impressões ≥ {criteria.min_impressions.toLocaleString('pt-BR')}</span>
        <span className="rounded border border-slate-700 px-2 py-0.5">Dias no ar ≥ {criteria.min_days}</span>
        <span className="rounded border border-slate-700 px-2 py-0.5">
          CPA ≤ {criteria.max_cpa_ratio === null ? 'sem teto' : `${criteria.max_cpa_ratio.toLocaleString('pt-BR')}× o equilíbrio`}
        </span>
        {criteria.require_product && <span className="rounded border border-slate-700 px-2 py-0.5">Com produto identificado</span>}
      </div>

      {showCriteria && (
        <div className="space-y-3 rounded border border-slate-800 bg-slate-950/60 p-3" data-testid="shortlist-criteria-form">
          <div className="flex flex-wrap gap-4">
            {numInput('Quantidade máxima', 'limit')}
            {numInput('Investimento mínimo (R$)', 'min_spend', 5)}
            {numInput('Impressões mínimas', 'min_impressions', 100)}
            {numInput('Dias no ar (mínimo)', 'min_days')}
            <label className="flex flex-col gap-1 text-[11px] text-slate-400">
              Teto do CPA (× equilíbrio)
              <input
                type="number"
                min={0}
                step={0.1}
                aria-label="Teto do CPA"
                value={draft.max_cpa_ratio ?? ''}
                placeholder="sem teto"
                onChange={e => setDraft({ ...draft, max_cpa_ratio: e.target.value === '' ? null : Number(e.target.value) })}
                className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
            <span className="text-[11px] text-slate-500">Níveis:</span>
            {(['campaign', 'ad'] as ShortLevel[]).map(l => (
              <label key={l} className="inline-flex items-center gap-1">
                <input type="checkbox" checked={draft.levels.includes(l)} onChange={() => setDraft({ ...draft, levels: toggleIn(draft.levels, l) })} />
                {l === 'campaign' ? 'Campanhas' : 'Anúncios'}
              </label>
            ))}
            <span className="ml-2 text-[11px] text-slate-500">Classes:</span>
            {(Object.keys(CLASS_META) as IntelClass[]).map(c => (
              <label key={c} className="inline-flex items-center gap-1">
                <input type="checkbox" checked={draft.classes.includes(c)} onChange={() => setDraft({ ...draft, classes: toggleIn(draft.classes, c) })} />
                {CLASS_META[c].label}
              </label>
            ))}
            <label className="ml-2 inline-flex items-center gap-1">
              <input type="checkbox" checked={draft.require_product} onChange={() => setDraft({ ...draft, require_product: !draft.require_product })} />
              Só com produto identificado
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCriteria({ ...draft, levels: draft.levels.length ? draft.levels : DEFAULT_SHORTLIST_CRITERIA.levels, classes: draft.classes.length ? draft.classes : DEFAULT_SHORTLIST_CRITERIA.classes })}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Aplicar critérios
            </button>
            <button
              onClick={() => {
                setDraft(DEFAULT_SHORTLIST_CRITERIA);
                setCriteria(DEFAULT_SHORTLIST_CRITERIA);
              }}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Restaurar padrão
            </button>
          </div>
        </div>
      )}

      {data?.note && (
        <p className="rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200" data-testid="shortlist-note">
          {data.note}
        </p>
      )}
      {data && data.excluded.total > 0 && (
        <p className="text-[11px] text-slate-500" data-testid="shortlist-excluded">
          Fora da lista: {Object.entries(data.excluded.by_reason).map(([k, n]) => `${n} ${EXCLUSION_LABELS[k] || k}`).join(' · ')}.
        </p>
      )}

      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Candidato</th>
              <th className="px-3 py-2">Classe</th>
              <th className="px-3 py-2">Pontuação</th>
              <th className="px-3 py-2 text-right">Dias</th>
              <th className="px-3 py-2 text-right">Investido</th>
              <th className="px-3 py-2 text-right">Vendas</th>
              <th className="px-3 py-2 text-right">CPA / equilíbrio</th>
              <th className="px-3 py-2 text-right">ROAS</th>
              <th className="px-3 py-2 text-right">CTR</th>
              <th className="px-3 py-2">Time de IAs</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-slate-500">Montando a lista…</td>
              </tr>
            )}
            {!loading && candidates.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-slate-500" data-testid="shortlist-empty">
                  Nenhum candidato passou nos critérios.
                </td>
              </tr>
            )}
            {!loading &&
              candidates.map(c => {
                const id = `${c.level}:${c.key}`;
                return (
                  <tr key={id} className="border-t border-slate-800 align-top" data-testid="shortlist-row">
                    <td className="px-3 py-2">
                      {!c.opportunity && canSend && (
                        <input type="checkbox" aria-label={`Selecionar ${c.name}`} checked={selected.has(id)} onChange={() => toggle(id)} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{c.rank}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-100">{c.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {[c.level === 'campaign' ? 'Campanha' : 'Anúncio', c.campaign_name, c.product_name].filter(Boolean).join(' · ')}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">{c.why.join(' · ')}</div>
                      {c.flags.length > 0 && <div className="mt-0.5 text-[10px] text-amber-300">⚠ {c.flags.join(' · ')}</div>}
                    </td>
                    <td className="px-3 py-2"><ClassBadge c={c.classification} /></td>
                    <td className="px-3 py-2"><ScoreBar score={c.score} confidence={c.confidence} /></td>
                    <td className="px-3 py-2 text-right">{c.days_active}</td>
                    <td className="px-3 py-2 text-right">{brl(c.spend)}</td>
                    <td className="px-3 py-2 text-right">{c.sales}</td>
                    <td className="px-3 py-2 text-right">
                      {brl(c.cpa)} <span className="text-slate-500">/ {brl(c.breakeven_cpa)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{c.roas === null ? '—' : c.roas}</td>
                    <td className="px-3 py-2 text-right">{pct(c.ctr_link)}</td>
                    <td className="px-3 py-2">
                      {c.opportunity ? (
                        <span className="rounded border border-violet-600/50 px-1.5 py-0.5 text-[10px] text-violet-200" data-testid="shortlist-sent">
                          {c.opportunity.human_id} · {c.opportunity.status}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">não enviado</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
