import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Megaphone, RefreshCw, Wand2, RotateCcw, Eraser, Rocket, Plus, Save } from 'lucide-react';
import { UserObj } from '../../types';
import { LaunchPlansCard } from '../acquisition/LaunchPlansCard';

// NORQVA-0027: tela Campanhas. Cada campanha é um plano de lançamento: completa com o criativo
// aprovado, modo manual campo a campo (campo editado vira manual e o sistema não sobrescreve),
// e "Criar na Meta (pausada)". Ativar e gastar continua só com o Sim do operador.

export interface CampaignsViewProps {
  currentUser: UserObj | null;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  offers?: any[];
}

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  CREATING: 'Criando na Meta',
  CREATED_PAUSED: 'Criada pausada',
  AWAITING_OPERATOR: 'Aguardando seu Sim',
  APPROVED: 'Aprovada (ativando)',
  ACTIVE: 'Ativa',
  REJECTED: 'Recusada',
  FAILED: 'Falhou'
};

const CTA_LABEL: Record<string, string> = {
  SEE_DETAILS: 'Ver detalhes',
  LEARN_MORE: 'Saiba mais',
  SHOP_NOW: 'Comprar agora',
  BUY_NOW: 'Comprar',
  ORDER_NOW: 'Pedir agora',
  GET_OFFER: 'Ver oferta',
  SIGN_UP: 'Cadastre-se',
  DOWNLOAD: 'Baixar'
};

type Fields = Record<string, string>;

const input = 'w-full bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded text-xs';
const brl = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valores atuais dos campos editáveis, pelo mesmo caminho que o servidor usa. */
export function fieldsOf(c: any): Fields {
  const f: Fields = {};
  (c?.spec?.ads || []).forEach((a: any, i: number) => {
    f[`ads.${i}.primary_text`] = a.primary_text || '';
    f[`ads.${i}.headline`] = a.headline || '';
    f[`ads.${i}.cta`] = a.cta || '';
    f[`ads.${i}.destination_url`] = a.destination_url || '';
  });
  (c?.spec?.adsets || []).forEach((s: any, i: number) => {
    f[`adsets.${i}.daily_budget_brl`] = String(s.daily_budget_brl ?? '');
  });
  f.max_spend_brl = String(c?.max_spend_brl ?? '');
  f.hypothesis = c?.spec?.hypothesis || '';
  return f;
}

export function CampaignsView({ currentUser, isDemoView, apiFetch, showError, showSuccess, offers = [] }: CampaignsViewProps) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<any>(null);
  const [form, setForm] = useState<Fields>({});
  const [base, setBase] = useState<Fields>({});
  const [options, setOptions] = useState<any[]>([]);
  const [fillResults, setFillResults] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [creating, setCreating] = useState<{ offer: string; creative_ids: string[]; daily: string; max: string } | null>(null);
  const [newOptions, setNewOptions] = useState<any[]>([]);
  const [cardKey, setCardKey] = useState(0);

  const apiRef = useRef(apiFetch);
  apiRef.current = apiFetch;
  const errRef = useRef(showError);
  errRef.current = showError;
  const okRef = useRef(showSuccess);
  okRef.current = showSuccess;

  const loadList = useCallback(async () => {
    try {
      const r = await apiRef.current('/campaigns?mode=real');
      setCampaigns(r?.campaigns || []);
    } catch (err: any) {
      errRef.current(err.message || 'Erro ao carregar as campanhas.');
    }
  }, []);

  const applyCampaign = (c: any) => {
    setCampaign(c);
    const f = fieldsOf(c);
    setForm(f);
    setBase(f);
  };

  const loadCampaign = useCallback(async (id: string) => {
    try {
      const [c, o] = await Promise.all([apiRef.current(`/campaigns/${id}?mode=real`), apiRef.current(`/campaigns/${id}/creative-options?mode=real`)]);
      applyCampaign(c);
      setOptions(o?.options || []);
    } catch (err: any) {
      errRef.current(err.message || 'Erro ao abrir a campanha.');
    }
  }, []);

  useEffect(() => {
    if (isAdmin && !isDemoView) loadList();
  }, [isAdmin, isDemoView, loadList]);

  useEffect(() => {
    setFillResults(null);
    if (selectedId) loadCampaign(selectedId);
  }, [selectedId, loadCampaign]);

  const post = (url: string, body: any = {}) => apiRef.current(url, { method: 'POST', body: JSON.stringify(body) });

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      const r = await fn();
      okRef.current(ok);
      return r;
    } catch (err: any) {
      errRef.current(err.message || 'Operação falhou.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const fill = async () => {
    const r = await run('fill', () => post(`/campaigns/${selectedId}/fill?mode=real`), 'Campanha preenchida com os criativos aprovados.');
    if (r?.campaign) {
      applyCampaign(r.campaign);
      setFillResults(r.results || []);
      loadList();
    }
  };

  const changed = Object.keys(form).filter(k => form[k] !== base[k]);
  const save = async () => {
    const fields: Record<string, any> = {};
    for (const k of changed) {
      fields[k] = /daily_budget_brl$|^max_spend_brl$/.test(k) ? Number(String(form[k]).replace(',', '.')) : form[k];
    }
    const r = await run('save', () => post(`/campaigns/${selectedId}/fields?mode=real`, { fields }), 'Alterações salvas. Esses campos agora são manuais.');
    if (r) {
      applyCampaign(r);
      loadList();
    }
  };

  // "Zerar": limpa os campos editáveis para preencher do zero (nada é salvo até clicar em Salvar)
  const blank = () => {
    const f: Fields = {};
    for (const k of Object.keys(form)) f[k] = /\.cta$/.test(k) ? form[k] : '';
    setForm(f);
  };

  const resetAuto = async () => {
    const r = await run('reset', () => post(`/campaigns/${selectedId}/reset?mode=real`), 'Voltou ao preenchimento automático.');
    if (r?.campaign) {
      applyCampaign(r.campaign);
      setFillResults(r.results || []);
      loadList();
    }
  };

  const chooseCreative = async (index: number, creativeId: string) => {
    const r = await run(
      `pick-${index}`,
      () => post(`/campaigns/${selectedId}/ads/${index}/creative?mode=real`, { creative_id: creativeId || null }),
      creativeId ? 'Criativo escolhido.' : 'O anúncio volta a usar o criativo automático.'
    );
    if (r?.campaign) {
      applyCampaign(r.campaign);
      setFillResults(r.results || []);
      loadList();
    }
  };

  const createOnMeta = async () => {
    setConfirmCreate(false);
    const r = await run('meta', () => post(`/launch-plans/${selectedId}/create`), 'Campanha criada na Meta, toda pausada. Agora ela espera o seu Sim.');
    await loadList();
    if (selectedId) await loadCampaign(selectedId);
    setCardKey(k => k + 1); // recarrega o quadro do Sim/Não
    return r;
  };

  const openNew = () => setCreating({ offer: '', creative_ids: [], daily: '20', max: '140' });
  useEffect(() => {
    if (!creating?.offer) {
      setNewOptions([]);
      return;
    }
    // Reaproveita a lista de criativos aprovados da tela Criativos, filtrada pela oferta escolhida
    apiRef
      .current('/creative-factory/creatives?mode=real&period=all')
      .then((r: any) => {
        const offer = offers.find(o => o.human_id === creating.offer);
        setNewOptions(
          (r?.creatives || []).filter(
            (c: any) => c.approval_status === 'APPROVED' && c.format === 'VIDEO' && offer && String(c.product_id) === String(offer.product_id)
          )
        );
      })
      .catch(() => setNewOptions([]));
  }, [creating?.offer, offers]);

  if (!isAdmin || isDemoView) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-slate-400" data-testid="campaigns-admin-only">
        A tela Campanhas é só para ADMIN, na conta real.
      </div>
    );
  }

  const submitNew = async () => {
    if (!creating) return;
    const r = await run(
      'new',
      () =>
        post('/campaigns?mode=real', {
          offer_human_id: creating.offer,
          creative_ids: creating.creative_ids,
          daily_budget_brl: Number(creating.daily.replace(',', '.')),
          max_spend_brl: Number(creating.max.replace(',', '.'))
        }),
      'Campanha criada em rascunho.'
    );
    if (r?.id) {
      setCreating(null);
      await loadList();
      setSelectedId(r.id);
    }
  };

  const manual = campaign?.manual_fields || {};
  const ManualTag = ({ path }: { path: string }) =>
    manual[path] ? (
      <span data-testid={`manual-${path}`} className="ml-1 px-1 py-0.5 rounded border border-amber-600/50 text-amber-300 text-[9px] uppercase">
        manual
      </span>
    ) : null;
  const filled = campaign?.spec?.ads?.every((a: any) => a.video_url && a.video_url !== 'TO_BE_FILLED');
  const editable = !!campaign?.editable;

  return (
    <div className="space-y-5 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Megaphone className="h-6 w-6 text-emerald-400" /> Campanhas
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Complete com os criativos aprovados, ajuste à mão o que quiser e crie na Meta sempre pausada. Só gasta depois do seu Sim.
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <button onClick={openNew} data-testid="new-campaign" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400">
            <Plus className="h-4 w-4" /> Nova campanha
          </button>
          <button onClick={loadList} aria-label="Atualizar" className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <LaunchPlansCard key={cardKey} apiFetch={apiFetch as any} currentUser={currentUser} isDemoView={isDemoView} showError={showError} showSuccess={showSuccess} />

      {creating && (
        <section className="rounded-xl border border-emerald-700/40 bg-emerald-950/10 p-4 space-y-3 text-xs" data-testid="new-campaign-form">
          <h2 className="text-sm font-bold text-slate-200">Nova campanha</h2>
          <label className="block">
            <span className="text-slate-400">Oferta</span>
            <select aria-label="Oferta" value={creating.offer} onChange={e => setCreating({ ...creating, offer: e.target.value, creative_ids: [] })} className={input}>
              <option value="">Selecione…</option>
              {offers.map(o => (
                <option key={o.id} value={o.human_id}>{o.human_id} · {o.name}</option>
              ))}
            </select>
          </label>
          {creating.offer && (
            <div>
              <div className="text-slate-400 mb-1">Criativos aprovados (vídeo)</div>
              {newOptions.length === 0 && <p className="text-slate-500">Nenhum criativo de vídeo aprovado para esta oferta.</p>}
              {newOptions.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={creating.creative_ids.includes(c.id)}
                    onChange={e =>
                      setCreating({
                        ...creating,
                        creative_ids: e.target.checked ? [...creating.creative_ids, c.id] : creating.creative_ids.filter(x => x !== c.id)
                      })
                    }
                  />
                  {c.human_id} · {c.hook}
                </label>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <label>
              <span className="text-slate-400">Orçamento por dia (R$)</span>
              <input aria-label="Orçamento por dia" value={creating.daily} onChange={e => setCreating({ ...creating, daily: e.target.value })} className={input} />
            </label>
            <label>
              <span className="text-slate-400">Teto de gasto (R$)</span>
              <input aria-label="Teto de gasto da nova campanha" value={creating.max} onChange={e => setCreating({ ...creating, max: e.target.value })} className={input} />
            </label>
          </div>
          <p className="text-[11px] text-slate-500">Padrões: Brasil, 25–65 anos, público Advantage, pixel oficial e destino na página da oferta. Fica em rascunho.</p>
          <div className="flex gap-2">
            <button onClick={submitNew} disabled={!creating.offer || creating.creative_ids.length === 0 || busy === 'new'} className="px-3 py-1.5 rounded bg-slate-200 text-slate-900 font-bold disabled:opacity-50">
              Criar rascunho
            </button>
            <button onClick={() => setCreating(null)} className="px-3 py-1.5 rounded border border-slate-700 text-slate-300">Cancelar</button>
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-[18rem_1fr] gap-4">
        <aside className="space-y-1.5" data-testid="campaign-list">
          {campaigns.length === 0 && <p className="text-xs text-slate-500">Nenhuma campanha ainda.</p>}
          {campaigns.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left p-2.5 rounded-lg border text-xs ${selectedId === c.id ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'}`}
            >
              <div className="font-mono text-slate-200 truncate">{c.spec?.campaign?.name || c.code}</div>
              <div className="text-slate-500">{CAMPAIGN_STATUS_LABEL[c.status] || c.status} · {c.offer_human_id}</div>
            </button>
          ))}
        </aside>

        {campaign && selectedId === campaign.id && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4 text-xs" data-testid="campaign-detail">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-white">{campaign.spec?.campaign?.name}</div>
                <div className="text-slate-500">
                  {campaign.code} · {campaign.offer_human_id} · {CAMPAIGN_STATUS_LABEL[campaign.status] || campaign.status} · {brl(campaign.daily_budget_brl)}/dia
                </div>
                {campaign.last_error && <div className="text-red-300 mt-1">Último erro: {campaign.last_error}</div>}
              </div>
              {editable && (
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={fill} disabled={busy === 'fill'} className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 text-slate-200 disabled:opacity-50">
                    <Wand2 className="h-3.5 w-3.5" /> Preencher com os criativos aprovados
                  </button>
                  <button onClick={blank} data-testid="blank-fields" className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 text-slate-200">
                    <Eraser className="h-3.5 w-3.5" /> Zerar
                  </button>
                  <button onClick={resetAuto} disabled={busy === 'reset'} className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 text-slate-200 disabled:opacity-50">
                    <RotateCcw className="h-3.5 w-3.5" /> Voltar ao automático
                  </button>
                </div>
              )}
            </header>

            {!editable && (
              <p className="text-slate-400" data-testid="campaign-readonly">
                Esta campanha já existe na Meta. Pausar, orçamento e teto ficam em Meta Ads; ativar é pelo seu Sim no quadro acima.
              </p>
            )}

            {fillResults && fillResults.some(r => r.status === 'SKIPPED') && (
              <ul className="space-y-0.5 text-amber-300" data-testid="fill-results">
                {fillResults.filter(r => r.status === 'SKIPPED').map(r => (
                  <li key={r.index}>Anúncio {r.index + 1} ({r.ad}): {r.reason}</li>
                ))}
              </ul>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              {(campaign.spec?.adsets || []).map((s: any, i: number) => (
                <label key={s.name} className="block">
                  <span className="text-slate-400">Orçamento por dia (R$) · {s.name}<ManualTag path={`adsets.${i}.daily_budget_brl`} /></span>
                  <input
                    aria-label={`Orçamento do conjunto ${i + 1}`}
                    disabled={!editable}
                    value={form[`adsets.${i}.daily_budget_brl`] ?? ''}
                    onChange={e => setForm({ ...form, [`adsets.${i}.daily_budget_brl`]: e.target.value })}
                    className={input}
                  />
                </label>
              ))}
              <label className="block">
                <span className="text-slate-400">Teto de gasto da campanha (R$)<ManualTag path="max_spend_brl" /></span>
                <input aria-label="Teto de gasto" disabled={!editable} value={form.max_spend_brl ?? ''} onChange={e => setForm({ ...form, max_spend_brl: e.target.value })} className={input} />
              </label>
            </div>
            <label className="block">
              <span className="text-slate-400">Hipótese<ManualTag path="hypothesis" /></span>
              <textarea aria-label="Hipótese" disabled={!editable} value={form.hypothesis ?? ''} onChange={e => setForm({ ...form, hypothesis: e.target.value })} className={input} rows={2} />
            </label>

            <div className="space-y-3">
              {(campaign.spec?.ads || []).map((a: any, i: number) => (
                <article key={i} className="rounded-lg border border-slate-800 p-3 space-y-2" data-testid="campaign-ad">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-emerald-300">Anúncio {i + 1} · {a.name}</span>
                    <span className={a.video_url && a.video_url !== 'TO_BE_FILLED' ? 'text-emerald-300' : 'text-amber-300'}>
                      {a.video_url && a.video_url !== 'TO_BE_FILLED' ? 'vídeo pronto' : 'vídeo a preencher'}
                    </span>
                  </div>
                  <label className="block">
                    <span className="text-slate-400">Criativo<ManualTag path={`ads.${i}.creative`} /></span>
                    <select
                      aria-label={`Criativo do anúncio ${i + 1}`}
                      disabled={!editable || busy === `pick-${i}`}
                      value={campaign.ad_creatives?.[String(i)] || ''}
                      onChange={e => chooseCreative(i, e.target.value)}
                      className={input}
                    >
                      <option value="">Automático (pelo nome do anúncio)</option>
                      {options.map(o => (
                        <option key={o.id} value={o.id} disabled={!o.ok}>
                          {o.human_id}{o.ok ? '' : ` — ${o.reason}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-slate-400">Texto do anúncio<ManualTag path={`ads.${i}.primary_text`} /></span>
                    <textarea aria-label={`Texto do anúncio ${i + 1}`} disabled={!editable} rows={3} value={form[`ads.${i}.primary_text`] ?? ''} onChange={e => setForm({ ...form, [`ads.${i}.primary_text`]: e.target.value })} className={input} />
                  </label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-slate-400">Título<ManualTag path={`ads.${i}.headline`} /></span>
                      <input aria-label={`Título do anúncio ${i + 1}`} disabled={!editable} value={form[`ads.${i}.headline`] ?? ''} onChange={e => setForm({ ...form, [`ads.${i}.headline`]: e.target.value })} className={input} />
                    </label>
                    <label className="block">
                      <span className="text-slate-400">Botão<ManualTag path={`ads.${i}.cta`} /></span>
                      <select aria-label={`Botão do anúncio ${i + 1}`} disabled={!editable} value={form[`ads.${i}.cta`] ?? ''} onChange={e => setForm({ ...form, [`ads.${i}.cta`]: e.target.value })} className={input}>
                        {Object.entries(CTA_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-slate-400">Link de destino<ManualTag path={`ads.${i}.destination_url`} /></span>
                    <input aria-label={`Link do anúncio ${i + 1}`} disabled={!editable} value={form[`ads.${i}.destination_url`] ?? ''} onChange={e => setForm({ ...form, [`ads.${i}.destination_url`]: e.target.value })} className={input} />
                  </label>
                </article>
              ))}
            </div>

            {editable && (
              <footer className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={save}
                  disabled={changed.length === 0 || busy === 'save'}
                  data-testid="save-fields"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-slate-200 text-slate-900 font-bold disabled:opacity-40"
                >
                  <Save className="h-3.5 w-3.5" /> Salvar alterações{changed.length ? ` (${changed.length})` : ''}
                </button>
                <button
                  onClick={() => setConfirmCreate(true)}
                  disabled={!filled || changed.length > 0 || busy === 'meta'}
                  title={!filled ? 'Preencha o vídeo de todos os anúncios' : changed.length > 0 ? 'Salve as alterações antes' : undefined}
                  data-testid="create-on-meta"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 text-white font-bold disabled:opacity-40"
                >
                  <Rocket className="h-3.5 w-3.5" /> Criar na Meta (pausada)
                </button>
                {busy === 'meta' && <span className="text-slate-400">Enviando os vídeos para a Meta… pode levar alguns minutos.</span>}
              </footer>
            )}

            {confirmCreate && (
              <div role="dialog" aria-label="Confirmar criação na Meta" className="rounded-lg border border-emerald-700/50 bg-slate-950 p-3 space-y-2" data-testid="confirm-create">
                <p className="text-slate-200">
                  Criar {campaign.spec?.ads?.length} anúncio(s) na Meta, <strong>tudo pausado</strong>. Nada é gasto agora: a campanha só começa a rodar
                  depois que você responder Sim, com {brl(campaign.daily_budget_brl)}/dia e teto de {brl(campaign.max_spend_brl)}.
                </p>
                <div className="flex gap-2">
                  <button onClick={createOnMeta} className="px-3 py-1.5 rounded bg-emerald-600 text-white font-bold">Criar pausada</button>
                  <button onClick={() => setConfirmCreate(false)} className="px-3 py-1.5 rounded border border-slate-700 text-slate-300">Cancelar</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
