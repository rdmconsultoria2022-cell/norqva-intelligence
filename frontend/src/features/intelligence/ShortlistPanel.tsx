import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, Send, SlidersHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import { ClassBadge, ScoreBar, brl, pct, CLASS_META, IntelClass } from './CampaignBaseView';
import { useIsMobile } from '../../components/ui/premium';

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

/** NORQVA-0029: sem ajuste na tela, os limites numéricos vêm dos critérios validados no servidor. */
export function baseQuery(c: ShortlistCriteria): string {
  return new URLSearchParams({
    limit: String(c.limit),
    levels: c.levels.join(','),
    classes: c.classes.join(','),
    require_product: String(c.require_product)
  }).toString();
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
  // null = usar os limites dos critérios validados (servidor); objeto = ajuste feito só nesta tela
  const isMobile = useIsMobile();
  const [applied, setCriteria] = useState<ShortlistCriteria | null>(null);
  const [draft, setDraft] = useState<ShortlistCriteria>(DEFAULT_SHORTLIST_CRITERIA);
  const [data, setData] = useState<ShortlistResponse | null>(null);
  const draftTouched = useRef(false);
  const editDraft = (c: ShortlistCriteria) => {
    draftTouched.current = true;
    setDraft(c);
  };
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = applied ? criteriaQuery(applied) : baseQuery(DEFAULT_SHORTLIST_CRITERIA);
      const raw = await apiFetch(`/intelligence/shortlist?mode=${mode}&${q}${periodQs ? `&${periodQs}` : ''}`);
      const r: ShortlistResponse = {
        criteria: raw?.criteria || applied || DEFAULT_SHORTLIST_CRITERIA,
        candidates: Array.isArray(raw?.candidates) ? raw.candidates : [],
        pool: raw?.pool || { campaign: 0, ad: 0 },
        excluded: raw?.excluded || { total: 0, by_reason: {} },
        note: raw?.note || null
      };
      setData(r);
      // Formulário segue os critérios do servidor só enquanto ninguém mexeu nele
      if (!applied && !draftTouched.current) setDraft(r.criteria);
      setSelected(new Set(r.candidates.filter(c => !c.opportunity).map(c => `${c.level}:${c.key}`)));
    } catch (e: any) {
      showError(e?.message || 'Falha ao montar a lista de candidatos.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, mode, applied, periodQs]);

  useEffect(() => {
    load();
  }, [load]);

  const criteria: ShortlistCriteria = applied || data?.criteria || DEFAULT_SHORTLIST_CRITERIA;
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
    <label className="flex flex-col gap-1 text-[12px] text-nq-muted">
      {label}
      <input
        type="number"
        min={0}
        step={step}
        aria-label={label}
        value={draft[field]}
        onChange={e => editDraft({ ...draft, [field]: Number(e.target.value) })}
        className="h-11 w-32 rounded-nq bg-nq-surface px-3 text-nq-body text-nq-text"
      />
    </label>
  );

  return (
    <section className="space-y-3 rounded-nq bg-nq-surface p-4" data-testid="shortlist-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-nq-body font-semibold text-nq-text">Seleção automática para o Time de IAs</h3>
          <p className="mt-1 max-w-3xl text-nq-aux text-nq-muted">
            Até {criteria.limit} campanhas e anúncios, ordenados pela pontuação da Base de campanhas, filtrados pelos critérios abaixo.
            Enviar cria oportunidades no Time de IAs; nada é alterado na Meta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCriteria(!showCriteria)}
            aria-expanded={showCriteria}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-nq-raised px-4 text-nq-aux font-medium text-nq-text hover:brightness-110"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Critérios {showCriteria ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {canSend && (
            <button
              onClick={send}
              disabled={sending || sendable.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full bg-nq-text px-4 h-10 text-nq-aux font-semibold text-nq-bg hover:brightness-95 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Enviar {sendable.length} ao Time de IAs
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[12px] text-nq-muted" data-testid="shortlist-criteria-summary">
        <span className="rounded-full bg-nq-raised px-2.5 py-1">Níveis: {criteria.levels.map(l => (l === 'campaign' ? 'campanhas' : 'anúncios')).join(' + ')}</span>
        <span className="rounded-full bg-nq-raised px-2.5 py-1">Classes: {criteria.classes.map(c => CLASS_META[c].label).join(', ')}</span>
        <span className="rounded-full bg-nq-raised px-2.5 py-1">Investimento ≥ {brl(criteria.min_spend)}</span>
        <span className="rounded-full bg-nq-raised px-2.5 py-1">Impressões ≥ {criteria.min_impressions.toLocaleString('pt-BR')}</span>
        <span className="rounded-full bg-nq-raised px-2.5 py-1">Dias no ar ≥ {criteria.min_days}</span>
        <span className="rounded-full bg-nq-raised px-2.5 py-1">
          CPA ≤ {criteria.max_cpa_ratio === null ? 'sem teto' : `${criteria.max_cpa_ratio.toLocaleString('pt-BR')}× o equilíbrio`}
        </span>
        {criteria.require_product && <span className="rounded-full bg-nq-raised px-2.5 py-1">Com produto identificado</span>}
      </div>

      {showCriteria && (
        <div className="space-y-4 rounded-xl bg-nq-bg p-4" data-testid="shortlist-criteria-form">
          <div className="flex flex-wrap gap-4">
            {numInput('Quantidade máxima', 'limit')}
            {numInput('Investimento mínimo (R$)', 'min_spend', 5)}
            {numInput('Impressões mínimas', 'min_impressions', 100)}
            {numInput('Dias no ar (mínimo)', 'min_days')}
            <label className="flex flex-col gap-1 text-[12px] text-nq-muted">
              Teto do CPA (× equilíbrio)
              <input
                type="number"
                min={0}
                step={0.1}
                aria-label="Teto do CPA"
                value={draft.max_cpa_ratio ?? ''}
                placeholder="sem teto"
                onChange={e => editDraft({ ...draft, max_cpa_ratio: e.target.value === '' ? null : Number(e.target.value) })}
                className="h-11 w-32 rounded-nq bg-nq-surface px-3 text-nq-body text-nq-text"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-nq-aux text-nq-text">
            <span className="text-[12px] text-nq-subtle">Níveis:</span>
            {(['campaign', 'ad'] as ShortLevel[]).map(l => (
              <label key={l} className="inline-flex min-h-[40px] items-center gap-2">
                <input type="checkbox" checked={draft.levels.includes(l)} onChange={() => editDraft({ ...draft, levels: toggleIn(draft.levels, l) })} />
                {l === 'campaign' ? 'Campanhas' : 'Anúncios'}
              </label>
            ))}
            <span className="w-full sm:w-auto text-[12px] text-nq-subtle">Classes:</span>
            {(Object.keys(CLASS_META) as IntelClass[]).map(c => (
              <label key={c} className="inline-flex min-h-[40px] items-center gap-2">
                <input type="checkbox" checked={draft.classes.includes(c)} onChange={() => editDraft({ ...draft, classes: toggleIn(draft.classes, c) })} />
                {CLASS_META[c].label}
              </label>
            ))}
            <label className="inline-flex min-h-[40px] items-center gap-2">
              <input type="checkbox" checked={draft.require_product} onChange={() => editDraft({ ...draft, require_product: !draft.require_product })} />
              Só com produto identificado
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCriteria({ ...draft, levels: draft.levels.length ? draft.levels : DEFAULT_SHORTLIST_CRITERIA.levels, classes: draft.classes.length ? draft.classes : DEFAULT_SHORTLIST_CRITERIA.classes })}
              className="h-11 rounded-full bg-nq-positive px-4 text-nq-aux font-semibold text-nq-on-positive hover:brightness-110"
            >
              Aplicar critérios
            </button>
            <button
              onClick={() => {
                draftTouched.current = false;
                if (!applied && data) setDraft(data.criteria);
                setCriteria(null);
              }}
              className="h-11 rounded-full bg-nq-raised px-4 text-nq-aux text-nq-text hover:brightness-110"
            >
              Voltar aos critérios validados
            </button>
          </div>
        </div>
      )}

      {data?.note && (
        <p className="rounded-xl bg-nq-attention/10 px-3 py-2 text-nq-aux text-nq-attention" data-testid="shortlist-note">
          {data.note}
        </p>
      )}
      {data && data.excluded.total > 0 && (
        <p className="text-[12px] text-nq-subtle" data-testid="shortlist-excluded">
          Fora da lista: {Object.entries(data.excluded.by_reason).map(([k, n]) => `${n} ${EXCLUSION_LABELS[k] || k}`).join(' · ')}.
        </p>
      )}

      {isMobile ? (
        <div className="-mx-4 divide-y divide-nq-line/70 border-t border-nq-line/70" data-testid="shortlist-list">
          {loading && <div className="px-4 py-6 text-center text-nq-aux text-nq-subtle">Montando a lista…</div>}
          {!loading && candidates.length === 0 && (
            <div className="px-4 py-6 text-center text-nq-aux text-nq-subtle" data-testid="shortlist-empty">
              Nenhum candidato passou nos critérios.
            </div>
          )}
          {!loading &&
            candidates.map(c => {
              const id = `${c.level}:${c.key}`;
              const selectable = !c.opportunity && canSend;
              return (
                <div key={id} className="px-4 py-3.5 flex gap-3" data-testid="shortlist-row">
                  {selectable && (
                    <label className="-ml-2 -mt-2 h-11 w-11 shrink-0 flex items-center justify-center">
                      <input type="checkbox" className="h-5 w-5" aria-label={`Selecionar ${c.name}`} checked={selected.has(id)} onChange={() => toggle(id)} />
                    </label>
                  )}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-nq-body font-medium text-nq-text break-words">
                          <span className="text-nq-subtle">{c.rank}. </span>
                          {c.name}
                        </div>
                        <div className="text-nq-caption text-nq-subtle break-words">
                          {[c.level === 'campaign' ? 'Campanha' : 'Anúncio', c.campaign_name, c.product_name].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-nq-body font-semibold tabular-nums text-nq-text">{brl(c.spend)}</div>
                        <div className="text-nq-caption text-nq-muted">{c.sales} vendas</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <ClassBadge c={c.classification} />
                      <ScoreBar score={c.score} confidence={c.confidence} />
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-nq-caption text-nq-muted tabular-nums">
                      <span>{c.days_active} dias</span>
                      <span>CPA {brl(c.cpa)} / {brl(c.breakeven_cpa)}</span>
                      <span>ROAS {c.roas === null ? '—' : c.roas}</span>
                      <span>CTR {pct(c.ctr_link)}</span>
                    </div>
                    <div className="text-nq-caption text-nq-muted">{c.why.join(' · ')}</div>
                    {c.flags.length > 0 && <div className="text-nq-caption text-nq-attention">⚠ {c.flags.join(' · ')}</div>}
                    {c.opportunity ? (
                      <div className="text-nq-caption text-nq-info" data-testid="shortlist-sent">
                        {c.opportunity.human_id} · {c.opportunity.status}
                      </div>
                    ) : (
                      <div className="text-nq-caption text-nq-subtle">Não enviado ao Time de IAs</div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-xl bg-nq-bg">
        <table className="w-full text-left text-nq-aux">
          <thead className="border-b border-nq-line text-nq-caption text-nq-muted">
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
                <td colSpan={12} className="px-3 py-6 text-center text-nq-subtle">Montando a lista…</td>
              </tr>
            )}
            {!loading && candidates.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-nq-subtle" data-testid="shortlist-empty">
                  Nenhum candidato passou nos critérios.
                </td>
              </tr>
            )}
            {!loading &&
              candidates.map(c => {
                const id = `${c.level}:${c.key}`;
                return (
                  <tr key={id} className="border-t border-nq-line/60 align-top" data-testid="shortlist-row">
                    <td className="px-3 py-2">
                      {!c.opportunity && canSend && (
                        <input type="checkbox" aria-label={`Selecionar ${c.name}`} checked={selected.has(id)} onChange={() => toggle(id)} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-nq-subtle">{c.rank}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-nq-text">{c.name}</div>
                      <div className="text-[12px] text-nq-subtle">
                        {[c.level === 'campaign' ? 'Campanha' : 'Anúncio', c.campaign_name, c.product_name].filter(Boolean).join(' · ')}
                      </div>
                      <div className="mt-1 text-[12px] text-nq-muted">{c.why.join(' · ')}</div>
                      {c.flags.length > 0 && <div className="mt-0.5 text-[12px] text-nq-attention">⚠ {c.flags.join(' · ')}</div>}
                    </td>
                    <td className="px-3 py-2"><ClassBadge c={c.classification} /></td>
                    <td className="px-3 py-2"><ScoreBar score={c.score} confidence={c.confidence} /></td>
                    <td className="px-3 py-2 text-right">{c.days_active}</td>
                    <td className="px-3 py-2 text-right">{brl(c.spend)}</td>
                    <td className="px-3 py-2 text-right">{c.sales}</td>
                    <td className="px-3 py-2 text-right">
                      {brl(c.cpa)} <span className="text-nq-subtle">/ {brl(c.breakeven_cpa)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{c.roas === null ? '—' : c.roas}</td>
                    <td className="px-3 py-2 text-right">{pct(c.ctr_link)}</td>
                    <td className="px-3 py-2">
                      {c.opportunity ? (
                        <span className="text-nq-caption text-nq-info" data-testid="shortlist-sent">
                          {c.opportunity.human_id} · {c.opportunity.status}
                        </span>
                      ) : (
                        <span className="text-[12px] text-nq-subtle">não enviado</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
};
