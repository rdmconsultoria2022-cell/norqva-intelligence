import React, { useCallback, useEffect, useState } from 'react';
import { Globe2, RefreshCw, Plus, ShieldAlert, CheckCircle2, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';

// NORQVA-0017 (fase 2): Mercado europeu — nichos monitorados na Biblioteca de Anúncios (UE),
// com pontuação de validação e "ofertas que se sustentam" como referência criativa.

type NicheClass = 'VALIDADO' | 'PROMISSOR' | 'FRACO' | 'SEM_DADOS';

export interface Niche {
  id: string;
  name: string;
  search_terms: string[];
  countries: string[];
  product_category: string | null;
  is_active: boolean;
  stats: { ads_total: number; active_ads: number; advertisers: number; long_runners: number; total_reach: number; new_ads_7d: number; reach_growth_7d: number };
  score: number;
  classification: NicheClass;
  reason: string;
}

const CLS: Record<NicheClass, string> = {
  VALIDADO: 'bg-nq-positive/15 text-nq-positive-text border-nq-positive/40',
  PROMISSOR: 'bg-nq-info/15 text-nq-info border-nq-info/40',
  FRACO: 'bg-nq-critical/15 text-nq-critical-text border-nq-critical/40',
  SEM_DADOS: 'bg-nq-raised text-nq-muted border-nq-line'
};
const LABEL: Record<NicheClass, string> = { VALIDADO: 'Validado', PROMISSOR: 'Promissor', FRACO: 'Fraco', SEM_DADOS: 'Sem dados' };
const n = (v: number) => v.toLocaleString('pt-BR');

interface Props {
  isAdmin: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

export const MarketEuPanel: React.FC<Props> = ({ isAdmin, apiFetch, showError, showSuccess }) => {
  const [probe, setProbe] = useState<any>(null);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [lastRun, setLastRun] = useState<any>(null);
  const [collecting, setCollecting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [ads, setAds] = useState<Record<string, any[]>>({});
  const [form, setForm] = useState({ name: '', terms: '' });

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/market/eu/niches');
      setNiches(r?.niches || []);
      setLastRun(r?.last_run || null);
      setCollecting(!!r?.collecting);
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar os nichos.');
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
    apiFetch('/market/eu/probe').then(setProbe).catch(() => setProbe(null));
  }, [load]);

  const collect = async () => {
    try {
      await apiFetch('/market/eu/collect', { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } });
      setCollecting(true);
      showSuccess('Coleta iniciada. Atualize em alguns minutos.');
      setTimeout(load, 30000);
    } catch (e: any) {
      showError(e?.message || 'Não foi possível iniciar a coleta.');
    }
  };

  const addNiche = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const terms = form.terms.split(',').map(t => t.trim()).filter(Boolean);
    try {
      await apiFetch('/market/eu/niches', { method: 'POST', body: JSON.stringify({ name: form.name, search_terms: terms }), headers: { 'Content-Type': 'application/json' } });
      setForm({ name: '', terms: '' });
      showSuccess('Nicho adicionado. Ele entra na próxima coleta.');
      load();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível adicionar o nicho.');
    }
  };

  const toggle = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!ads[id]) {
      try {
        const r = await apiFetch(`/market/eu/niches/${id}/ads?limit=30`);
        setAds(prev => ({ ...prev, [id]: r?.ads || [] }));
      } catch {
        setAds(prev => ({ ...prev, [id]: [] }));
      }
    }
  };

  return (
    <div className="space-y-4" data-testid="market-eu-panel">
      <p className="max-w-3xl text-nq-aux text-nq-muted">
        Anúncios comerciais veiculados na União Europeia, pela API oficial da Biblioteca de Anúncios da Meta. Um nicho é "validado" quando
        muitos anunciantes mantêm anúncios no ar por 30+ dias (sinal de que pagam a conta). Anúncios do Brasil não estão disponíveis pela API.
      </p>

      {probe && probe.status !== 'AVAILABLE' && (
        <div className="rounded-nq bg-nq-attention/10 p-4 text-nq-aux text-nq-attention" data-testid="market-eu-blocked">
          <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" /> {probe.message}</div>
          {Array.isArray(probe.guidance) && (
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {probe.guidance.map((g: string) => <li key={g}>{g}</li>)}
            </ol>
          )}
        </div>
      )}
      {probe?.status === 'AVAILABLE' && (
        <div className="flex items-center gap-2 text-xs text-nq-positive-text"><CheckCircle2 className="h-4 w-4" /> {probe.message}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-nq-subtle">
        <span>
          {lastRun
            ? `Última coleta: ${new Date(lastRun.started_at).toLocaleString('pt-BR')} · ${lastRun.status} · ${lastRun.ads_upserted} anúncios${lastRun.error ? ` · ${lastRun.error}` : ''}`
            : 'Nenhuma coleta ainda.'}
        </span>
        {isAdmin && (
          <button onClick={collect} disabled={collecting} className="inline-flex items-center gap-1.5 rounded-full bg-nq-positive px-3 py-1.5 text-nq-aux font-semibold text-nq-on-positive hover:brightness-110 disabled:opacity-50 min-h-[44px]">
            <RefreshCw className={`h-3.5 w-3.5 ${collecting ? 'animate-spin' : ''}`} /> {collecting ? 'Coletando…' : 'Coletar agora'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {niches.map(nc => (
          <div key={nc.id} className={`rounded-nq bg-nq-surface ${nc.is_active ? '' : 'opacity-60'}`} data-testid="market-eu-niche">
            <button className="flex w-full flex-wrap items-center gap-3 p-3 text-left min-h-[44px]" onClick={() => toggle(nc.id)}>
              {open === nc.id ? <ChevronDown className="h-4 w-4 text-nq-subtle" /> : <ChevronRight className="h-4 w-4 text-nq-subtle" />}
              <Globe2 className="h-4 w-4 text-nq-info" />
              <span className="font-semibold text-nq-text">{nc.name}</span>
              <span className={`rounded border px-2 py-0.5 text-[12px] font-semibold ${CLS[nc.classification]}`}>{LABEL[nc.classification]}</span>
              <span className="text-sm font-bold text-nq-text">{nc.score}</span>
              <span className="text-[12px] text-nq-subtle">
                {n(nc.stats.long_runners)} ativos 30+ dias · {n(nc.stats.advertisers)} anunciantes · alcance UE {n(nc.stats.total_reach)} · {n(nc.stats.new_ads_7d)} novos/7d
              </span>
            </button>
            {open === nc.id && (
              <div className="border-t border-nq-line p-3 text-xs">
                <p className="text-nq-text">{nc.reason}</p>
                {isAdmin && (
                  <button
                    onClick={async () => {
                      try {
                        const o = await apiFetch('/ai-team/opportunities', { method: 'POST', body: JSON.stringify({ source: 'EU_MARKET', market_niche_id: nc.id }), headers: { 'Content-Type': 'application/json' } });
                        showSuccess(`Oportunidade ${o?.human_id || ''} criada. Veja em "Time de IAs".`);
                      } catch (e: any) {
                        showError(e?.message || 'Não foi possível criar a oportunidade.');
                      }
                    }}
                    className="mt-2 rounded-full bg-nq-raised px-4 min-h-[44px] text-nq-aux font-semibold text-nq-text hover:brightness-110"
                  >
                    Criar oportunidade para o time de IAs
                  </button>
                )}
                <p className="mt-1 text-nq-subtle">Termos: {nc.search_terms.join(', ')} · Países: {nc.countries.join(', ')}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {(ads[nc.id] || []).map(a => (
                    <div key={a.id} className="rounded bg-nq-bg p-2" data-testid="market-eu-ad">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-nq-text">{a.page_name || 'Anunciante'}</span>
                        <span className={a.is_active ? 'text-nq-positive-text' : 'text-nq-subtle'}>
                          {a.is_active ? 'no ar' : 'encerrado'} · {a.days_running} dias
                        </span>
                      </div>
                      {a.title && <p className="mt-1 text-nq-text">{a.title}</p>}
                      {a.body && <p className="mt-1 line-clamp-3 whitespace-pre-line text-nq-muted">{a.body}</p>}
                      <div className="mt-1 flex items-center justify-between text-[12px] text-nq-subtle">
                        <span>
                          alcance UE {a.eu_total_reach ? n(Number(a.eu_total_reach)) : '—'}
                          {a.link_caption ? ` · ${a.link_caption}` : ''}
                        </span>
                        {a.snapshot_url && (
                          <a href={`https://www.facebook.com/ads/library/?id=${a.ad_library_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-nq-info">
                            ver anúncio <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  {ads[nc.id] && ads[nc.id].length === 0 && <p className="text-nq-subtle">Nenhum anúncio coletado ainda.</p>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <form onSubmit={addNiche} className="flex flex-wrap items-end gap-2 rounded-nq bg-nq-surface p-4 text-nq-aux">
          <label className="flex flex-col gap-1">
            <span className="text-nq-muted">Novo nicho</span>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Organização doméstica" className="w-56 rounded-xl bg-nq-bg px-2 py-2.5 text-nq-text min-h-[44px]" />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-nq-muted">Termos de busca (vírgula; em inglês, alemão, espanhol…)</span>
            <input value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} placeholder="meal planner, wochenplaner, planificador comidas" className="rounded-xl bg-nq-bg px-2 py-2.5 text-nq-text min-h-[44px]" />
          </label>
          <button type="submit" disabled={!form.name.trim() || !form.terms.trim()} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-nq-text hover:bg-nq-raised disabled:opacity-40 min-h-[44px]">
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </form>
      )}
    </div>
  );
};
