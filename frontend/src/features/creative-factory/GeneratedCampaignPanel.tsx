import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, ExternalLink } from 'lucide-react';
import { Section, Surface, StatusPill, Tone } from '../../components/ui/premium';

// NORQVA-0117 (D-0117): "Criar campanha pausada" a partir da página gerada (só ADMIN). Monta o plano de lançamento
// de sempre (um por página) e cria tudo PAUSADO na Meta. Ativar e gastar continua só pelo "Sim" do plano, em
// Campanhas, com o código.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

const PLAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Rascunho (ainda não está na Meta)', tone: 'neutral' },
  CREATING: { label: 'Criando na Meta…', tone: 'info' },
  CREATED_PAUSED: { label: 'Criada na Meta, pausada', tone: 'positive' },
  AWAITING_OPERATOR: { label: 'Criada na Meta, pausada: espera o seu Sim', tone: 'positive' },
  APPROVED: { label: 'Aprovada', tone: 'info' },
  ACTIVE: { label: 'No ar', tone: 'positive' },
  REJECTED: { label: 'Recusada', tone: 'neutral' },
  FAILED: { label: 'Falhou (dá para tentar de novo)', tone: 'critical' }
};

const input = 'w-full bg-nq-bg border border-nq-line rounded p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text min-h-[44px]';
const label = 'block text-nq-aux text-nq-muted mb-1';
const pill = 'px-4 rounded-full text-nq-aux font-semibold min-h-[44px] disabled:opacity-50';

// NORQVA-0120 (contrato NORQVA-0118, etapa C): todos os ajustes de publicação, já preenchidos com o padrão aprovado
// (R$ 30/dia, teto de 7 dias, página gerada, Brasil, público Advantage, idade do produto, posicionamentos automáticos).
export interface CampaignForm {
  campaign_name: string;
  daily_budget_brl: string;
  max_spend_brl: string;
  age_min: string;
  age_max: string;
  destination: string;
  regions: string[];
  genders: string;
  placements: string;
  advantage_audience: boolean;
  end_date: string;
  /** null = todos os anúncios prontos */
  creative_ids: string[] | null;
}

const EMPTY_FORM: CampaignForm = {
  campaign_name: '', daily_budget_brl: '30', max_spend_brl: '210', age_min: '25', age_max: '65', destination: 'PAGE', regions: [], genders: 'ALL',
  placements: 'AUTOMATIC', advantage_audience: true, end_date: '', creative_ids: null
};

/** Anúncio que pode ir para a campanha (pela tela): aprovado e com a checagem em dia. */
export const adLooksReady = (a: any) => a?.approval_status === 'APPROVED' && !a?.copy_check?.blocked && !a?.copy_check?.stale;

export const GeneratedCampaignPanel: React.FC<{
  apiFetch: ApiFetch;
  pageId: string;
  pageStatus: string;
  ads: any[];
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  /** NORQVA-0119: avisa a Fábrica depois de montar/criar a campanha (para recarregar os resultados). */
  onChanged?: () => void;
}> = ({ apiFetch, pageId, pageStatus, ads, showError, showSuccess, onChanged }) => {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(`/generated-pages/${pageId}/campaign`);
      setData(d);
      if (d?.defaults) {
        setForm({
          campaign_name: d.defaults.campaign_name,
          daily_budget_brl: String(d.defaults.daily_budget_brl),
          max_spend_brl: String(d.defaults.max_spend_brl),
          age_min: String(d.defaults.age_min),
          age_max: String(d.defaults.age_max),
          destination: d.defaults.destination || 'PAGE',
          regions: Array.isArray(d.defaults.regions) ? d.defaults.regions : [],
          genders: d.defaults.genders || 'ALL',
          placements: d.defaults.placements || 'AUTOMATIC',
          advantage_audience: d.defaults.advantage_audience !== false,
          end_date: d.defaults.end_date || '',
          creative_ids: null
        });
      }
    } catch {
      setData(null);
    }
  }, [apiFetch, pageId]);

  useEffect(() => {
    load();
  }, [load, pageStatus]);

  const published = pageStatus === 'PUBLISHED';
  // a palavra final é do servidor (checagem refeita lá); sem resposta ainda, usa o que a tela sabe
  const serverAds: any[] | null = data && Array.isArray(data.ads) && (!data.plan || data.rebuildable) ? data.ads : null;
  const readyAds = serverAds ? serverAds.filter(a => a.ready) : (ads || []).filter(adLooksReady);
  const canCreate = published && readyAds.length > 0;
  const plan = data?.plan || null;
  const rebuildable = !!data?.rebuildable;
  const why = !published ? 'Publique a página antes.' : readyAds.length === 0 ? 'Aprove pelo menos um anúncio (sem bloqueio na checagem).' : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await apiFetch(`/generated-pages/${pageId}/campaign`, {
        method: 'POST',
        body: JSON.stringify({
          campaign_name: form.campaign_name,
          daily_budget_brl: Number(form.daily_budget_brl),
          max_spend_brl: Number(form.max_spend_brl),
          age_min: Number(form.age_min),
          age_max: Number(form.age_max),
          destination: form.destination,
          regions: form.regions,
          genders: form.genders,
          placements: form.placements,
          advantage_audience: form.advantage_audience,
          end_date: form.end_date || null,
          ...(form.creative_ids ? { creative_ids: form.creative_ids } : {})
        })
      });
      const msg = r?.message || (r?.created ? `Campanha ${r?.plan?.code} criada na Meta, toda PAUSADA. Ativar só pelo Sim, em Campanhas.` : `Campanha ${r?.plan?.code}.`);
      setMessage(msg);
      showSuccess(msg);
      setOpen(false);
      await load();
      onChanged?.();
    } catch (err: any) {
      showError(err?.message || 'Não foi possível criar a campanha.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const openManage = () => {
    if (plan?.code) window.dispatchEvent(new CustomEvent('nq:open-campaign', { detail: { planCode: plan.code } }));
  };

  return (
    <Section title="Campanha na Meta" testId="generated-campaign">
      {plan && !open ? (
        <Surface className="p-4 space-y-2" as="div">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-nq-body font-semibold text-nq-text" data-testid="campaign-plan-code">
              {plan.code}
            </span>
            <StatusPill tone={(PLAN_STATUS[plan.status] || PLAN_STATUS.DRAFT).tone}>{(PLAN_STATUS[plan.status] || { label: plan.status }).label}</StatusPill>
          </div>
          <p className="text-nq-aux text-nq-muted break-words">{plan?.spec?.campaign?.name}</p>
          {plan.last_error && <p className="text-nq-aux text-nq-critical-text break-words">{plan.last_error}</p>}
          {rebuildable && <p className="text-nq-caption text-nq-subtle">Nada desta campanha está na Meta ainda: dá para montar de novo com os anúncios e valores atuais.</p>}
          {plan.status !== 'DRAFT' && !rebuildable && plan.status !== 'FAILED' && <p className="text-nq-caption text-nq-subtle">A campanha já está na Meta: continue em Campanhas.</p>}
          {(message || (plan.status === 'DRAFT' && data && !data.mutation_enabled)) && (
            <p className="text-nq-aux text-nq-attention" data-testid="campaign-message">
              {message || 'Cadastro na Meta desligado: o plano ficou só em rascunho no NORQVA.'}
            </p>
          )}
          <p className="text-nq-caption text-nq-subtle">Tudo nasce PAUSADO. Ativar e gastar só pelo seu Sim, em Campanhas, com o código do plano.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openManage} className={`${pill} bg-nq-raised text-nq-text inline-flex items-center gap-1.5`} data-testid="open-manage">
              <ExternalLink className="h-4 w-4" /> Abrir em Gerenciar campanha
            </button>
            {plan.status === 'FAILED' && !rebuildable && data?.mutation_enabled && (
              <button type="button" disabled={busy} onClick={e => submit(e as any)} className={`${pill} bg-nq-positive text-nq-on-positive`}>
                {busy ? 'Criando...' : 'Continuar na Meta (pausada)'}
              </button>
            )}
            {rebuildable && (
              <button
                type="button"
                disabled={busy || !canCreate}
                onClick={() => setOpen(true)}
                data-testid="rebuild-campaign"
                className={`${pill} bg-nq-positive text-nq-on-positive`}
              >
                Montar de novo
              </button>
            )}
          </div>
        </Surface>
      ) : !open ? (
        <div className="space-y-1">
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => setOpen(true)}
            data-testid="create-paused-campaign"
            className={`${pill} bg-nq-positive text-nq-on-positive inline-flex items-center gap-1.5 w-full sm:w-auto justify-center`}
          >
            <Megaphone className="h-4 w-4" /> Criar campanha pausada
          </button>
          {why && <p className="text-nq-caption text-nq-subtle" data-testid="campaign-why">{why}</p>}
        </div>
      ) : (
        <Surface className="p-4" as="div">
          <form onSubmit={submit} className="space-y-4 text-nq-body" data-testid="campaign-form">
            <div>
              <label className={label} htmlFor="cmp-name">Nome da campanha</label>
              <input id="cmp-name" className={input} value={form.campaign_name} maxLength={200} onChange={e => setForm({ ...form, campaign_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="cmp-daily">Orçamento por dia (R$)</label>
                <input
                  id="cmp-daily"
                  type="number"
                  inputMode="decimal"
                  min={data?.defaults?.min_daily_budget_brl}
                  max={data?.defaults?.max_daily_budget_brl}
                  className={input}
                  value={form.daily_budget_brl}
                  onChange={e => setForm({ ...form, daily_budget_brl: e.target.value })}
                />
              </div>
              <div>
                <label className={label} htmlFor="cmp-cap">Teto total (R$)</label>
                <input id="cmp-cap" type="number" inputMode="decimal" className={input} value={form.max_spend_brl} onChange={e => setForm({ ...form, max_spend_brl: e.target.value })} />
              </div>
            </div>
            <PublishOptions form={form} setForm={setForm} data={data} readyAds={readyAds} />
            <p className="text-nq-aux text-nq-attention">Tudo nasce PAUSADO. Nada é ativado aqui: ativar e gastar só pelo seu Sim, em Campanhas, com o código do plano.</p>
            {data && !data.mutation_enabled && (
              <p className="text-nq-aux text-nq-attention" data-testid="campaign-disabled">Cadastro na Meta desligado: o plano fica só em rascunho no NORQVA.</p>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={() => setOpen(false)} className={`${pill} bg-nq-raised text-nq-text`}>
                Cancelar
              </button>
              <button type="submit" disabled={busy || (form.creative_ids !== null && form.creative_ids.length === 0)} data-testid="campaign-submit" className={`${pill} bg-nq-positive text-nq-on-positive`}>
                {busy ? 'Criando...' : plan ? (data?.mutation_enabled ? 'Montar de novo e criar pausada' : 'Montar de novo') : 'Criar pausada'}
              </button>
            </div>
          </form>
        </Surface>
      )}
    </Section>
  );
};

const seg = (on: boolean) =>
  `px-3 rounded-full text-nq-aux font-semibold min-h-[44px] ${on ? 'bg-nq-positive text-nq-on-positive' : 'bg-nq-raised text-nq-text'}`;

/** NORQVA-0120: destino, público, onde aparece, término e anúncios. */
export function PublishOptions({
  form,
  setForm,
  data,
  readyAds
}: {
  form: CampaignForm;
  setForm: (f: CampaignForm) => void;
  data: any;
  readyAds: any[];
}) {
  const states: Record<string, string> = data?.states || {};
  const destinations: any[] = Array.isArray(data?.destinations)
    ? data.destinations
    : [{ value: 'PAGE', label: 'Página gerada', url: data?.page?.url || '', available: true }];
  const ageMin = Number(form.age_min);
  const ageMax = Number(form.age_max);
  const ageIsHint = form.advantage_audience && (ageMin > 25 || ageMax < 65);
  const picked = form.creative_ids;
  const toggleState = (uf: string) =>
    setForm({ ...form, regions: form.regions.includes(uf) ? form.regions.filter(x => x !== uf) : [...form.regions, uf].sort() });
  const toggleAd = (id: string) => {
    const all = readyAds.map(a => a.id);
    const cur = picked || all;
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    setForm({ ...form, creative_ids: next.length === all.length && all.every(x => next.includes(x)) ? null : next });
  };
  // mesmo critério do servidor: de amanhã até 1 ano (dia de Brasília)
  const todayMs = Date.parse(`${new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)}T00:00:00Z`);
  const minEnd = new Date(todayMs + 86400000).toISOString().slice(0, 10);
  const maxEnd = new Date(todayMs + 365 * 86400000).toISOString().slice(0, 10);
  const [pickStates, setPickStates] = React.useState(form.regions.length > 0);

  return (
    <div className="space-y-5" data-testid="publish-options">
      <fieldset className="space-y-2">
        <legend className={label}>Para onde o anúncio leva</legend>
        {destinations.map(d => (
          <label
            key={d.value}
            className={`flex items-start gap-3 rounded-nq p-3 min-h-[44px] ${d.available ? 'cursor-pointer' : 'opacity-60'} ${form.destination === d.value ? 'bg-nq-raised' : 'bg-nq-bg'}`}
          >
            <input type="radio" name="cmp-dest" disabled={!d.available} checked={form.destination === d.value} onChange={() => setForm({ ...form, destination: d.value })} />
            <span className="min-w-0 flex-1">
              <span className="block text-nq-aux text-nq-text">{d.label}{d.value === 'PAGE' ? ' (recomendado)' : ''}</span>
              <span className="block text-nq-caption text-nq-subtle break-all">{d.available ? d.url : d.reason}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className={label}>Quem vê</legend>
        <label className="flex items-start gap-3 min-h-[44px]">
          <input type="checkbox" checked={form.advantage_audience} onChange={e => setForm({ ...form, advantage_audience: e.target.checked })} data-testid="cmp-advantage" />
          <span className="text-nq-aux text-nq-text">
            Público Advantage (recomendado)
            <span className="block text-nq-caption text-nq-subtle">A Meta procura compradores além da faixa escolhida quando vale a pena.</span>
          </span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className={label} htmlFor="cmp-age-min">Idade de</label>
            <input id="cmp-age-min" type="number" min={18} max={65} className={input} value={form.age_min} onChange={e => setForm({ ...form, age_min: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="cmp-age-max">até</label>
            <input id="cmp-age-max" type="number" min={18} max={65} className={input} value={form.age_max} onChange={e => setForm({ ...form, age_max: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={label} htmlFor="cmp-genders">Sexo</label>
            <select id="cmp-genders" className={input} value={form.genders} onChange={e => setForm({ ...form, genders: e.target.value })}>
              <option value="ALL">Todos (recomendado)</option>
              <option value="FEMALE">Mulheres</option>
              <option value="MALE">Homens</option>
            </select>
          </div>
        </div>
        {(ageIsHint || (form.advantage_audience && form.genders !== 'ALL')) && (
          <p className="text-nq-caption text-nq-subtle" data-testid="cmp-age-hint">
            Com o público Advantage, {[ageIsHint ? `a idade ${ageMin}–${ageMax}` : '', form.genders !== 'ALL' ? 'o sexo' : ''].filter(Boolean).join(' e ')} vira sugestão para a Meta: ela pode mostrar
            {ageIsHint ? ` para quem tem de ${Math.min(ageMin, 25)} a 65 anos` : ' para outras pessoas'} se achar comprador. Para travar, desligue o público Advantage.
          </p>
        )}
        <div className="space-y-2">
          <div className="text-nq-aux text-nq-muted">Onde</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={seg(form.regions.length === 0 && !pickStates)}
              onClick={() => {
                setPickStates(false);
                setForm({ ...form, regions: [] });
              }}
              data-testid="cmp-all-brazil"
            >
              Brasil inteiro
            </button>
            <button type="button" className={seg(pickStates)} onClick={() => setPickStates(true)} data-testid="cmp-pick-states">
              Escolher estados{form.regions.length ? ` (${form.regions.length})` : ''}
            </button>
          </div>
          {pickStates && (
            <div className="flex flex-wrap gap-1.5" data-testid="cmp-states">
              {Object.keys(states).map(uf => (
                <button key={uf} type="button" title={states[uf]} aria-pressed={form.regions.includes(uf)} onClick={() => toggleState(uf)} className={`${seg(form.regions.includes(uf))} w-12`}>
                  {uf}
                </button>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="cmp-placements">Onde aparece</label>
          <select id="cmp-placements" className={input} value={form.placements} onChange={e => setForm({ ...form, placements: e.target.value })}>
            <option value="AUTOMATIC">Automático (recomendado)</option>
            <option value="FACEBOOK_INSTAGRAM">Só Facebook e Instagram</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="cmp-end">Término (opcional)</label>
          <input id="cmp-end" type="date" min={minEnd} max={maxEnd} className={input} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
          <p className="text-nq-caption text-nq-subtle mt-1">Sem data, roda até você pausar ou o teto parar.</p>
        </div>
      </div>

      {readyAds.length > 0 && (
        <fieldset className="space-y-2">
          <legend className={label}>Anúncios que entram</legend>
          {readyAds.map(a => (
            <label key={a.id} className="flex items-start gap-3 min-h-[44px] text-nq-aux text-nq-text">
              <input type="checkbox" checked={!picked || picked.includes(a.id)} onChange={() => toggleAd(a.id)} data-testid={`cmp-ad-${a.human_id}`} />
              <span className="min-w-0 flex-1 break-words">
                {a.human_id}
                {a.headline ? ` · ${a.headline}` : ''}
              </span>
            </label>
          ))}
          {picked && picked.length === 0 && <p className="text-nq-caption text-nq-critical-text">Escolha pelo menos um anúncio.</p>}
        </fieldset>
      )}
      <p className="text-nq-caption text-nq-subtle">Pixel oficial e otimização para Compra. Anúncios de imagem com as imagens da página ({data?.images ?? 0}).</p>
    </div>
  );
}

