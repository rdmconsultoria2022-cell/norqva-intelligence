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

/** Anúncio que pode ir para a campanha (pela tela): aprovado e com a checagem em dia. */
export const adLooksReady = (a: any) => a?.approval_status === 'APPROVED' && !a?.copy_check?.blocked && !a?.copy_check?.stale;

export const GeneratedCampaignPanel: React.FC<{
  apiFetch: ApiFetch;
  pageId: string;
  pageStatus: string;
  ads: any[];
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
}> = ({ apiFetch, pageId, pageStatus, ads, showError, showSuccess }) => {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ campaign_name: '', daily_budget_brl: '30', max_spend_brl: '210', age_min: '25', age_max: '65' });
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
          age_max: String(d.defaults.age_max)
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
  const readyAds = (ads || []).filter(adLooksReady);
  const canCreate = published && readyAds.length > 0;
  const plan = data?.plan || null;
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
          age_max: Number(form.age_max)
        })
      });
      const msg = r?.message || (r?.created ? `Campanha ${r?.plan?.code} criada na Meta, toda PAUSADA. Ativar só pelo Sim, em Campanhas.` : `Campanha ${r?.plan?.code}.`);
      setMessage(msg);
      showSuccess(msg);
      setOpen(false);
      await load();
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
      {plan ? (
        <Surface className="p-4 space-y-2" as="div">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-nq-body font-semibold text-nq-text" data-testid="campaign-plan-code">
              {plan.code}
            </span>
            <StatusPill tone={(PLAN_STATUS[plan.status] || PLAN_STATUS.DRAFT).tone}>{(PLAN_STATUS[plan.status] || { label: plan.status }).label}</StatusPill>
          </div>
          <p className="text-nq-aux text-nq-muted break-words">{plan?.spec?.campaign?.name}</p>
          {plan.last_error && <p className="text-nq-aux text-nq-critical-text break-words">{plan.last_error}</p>}
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
            {(plan.status === 'DRAFT' || plan.status === 'FAILED') && data?.mutation_enabled && (
              <button type="button" disabled={busy} onClick={e => submit(e as any)} className={`${pill} bg-nq-positive text-nq-on-positive`}>
                {busy ? 'Criando...' : 'Criar na Meta (pausada)'}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
              <div>
                <label className={label} htmlFor="cmp-age-min">Idade de</label>
                <input id="cmp-age-min" type="number" min={18} max={65} className={input} value={form.age_min} onChange={e => setForm({ ...form, age_min: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="cmp-age-max">até</label>
                <input id="cmp-age-max" type="number" min={18} max={65} className={input} value={form.age_max} onChange={e => setForm({ ...form, age_max: e.target.value })} />
              </div>
            </div>
            <ul className="text-nq-aux text-nq-muted space-y-1">
              <li>Público: Brasil, Advantage (a Meta amplia quando ajuda).</li>
              <li className="break-all">Destino: {data?.page?.url} (com utm_source=meta, utm_medium=paid, código do plano e do anúncio).</li>
              <li>Anúncios de imagem: {readyAds.length} aprovado(s), com as imagens da página ({data?.images ?? 0}).</li>
              <li>Pixel oficial, otimização para Compra.</li>
            </ul>
            <p className="text-nq-aux text-nq-attention">Tudo nasce PAUSADO. Nada é ativado aqui: ativar e gastar só pelo seu Sim, em Campanhas, com o código do plano.</p>
            {data && !data.mutation_enabled && (
              <p className="text-nq-aux text-nq-attention" data-testid="campaign-disabled">Cadastro na Meta desligado: o plano fica só em rascunho no NORQVA.</p>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={() => setOpen(false)} className={`${pill} bg-nq-raised text-nq-text`}>
                Cancelar
              </button>
              <button type="submit" disabled={busy} data-testid="campaign-submit" className={`${pill} bg-nq-positive text-nq-on-positive`}>
                {busy ? 'Criando...' : 'Criar pausada'}
              </button>
            </div>
          </form>
        </Surface>
      )}
    </Section>
  );
};
