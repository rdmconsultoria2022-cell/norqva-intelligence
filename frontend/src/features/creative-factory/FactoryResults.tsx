import React, { useEffect, useState } from 'react';
import { Section, Surface, Stat, brl, int, multiple } from '../../components/ui/premium';
import { useGlobalPeriod, periodQuery } from '../../lib/globalPeriod';
import { aggregateMetrics, PerfItem } from '../acquisition/MetaResults';

// NORQVA-0119: números REAIS da nossa campanha (os da Meta e as vendas pagas no NORQVA), no passo 6 da Fábrica.
// Mesma fonte da tela Campanhas (/intelligence/creative-performance), somando os anúncios da campanha do plano.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

/** Id da campanha na Meta do plano (o primeiro), ou null se ainda não foi criada. */
export const planCampaignId = (plan: any): string | null => {
  const ids = Object.values(plan?.meta_ids?.campaign || {});
  return ids.length ? String(ids[0]) : null;
};

export function FactoryResults({ apiFetch, pageId, refreshKey = 0 }: { apiFetch: ApiFetch; pageId: string; refreshKey?: number }) {
  const { globalPeriod } = useGlobalPeriod();
  const periodQs = periodQuery(globalPeriod);
  const [state, setState] = useState<{ loading: boolean; failed: boolean; campaignId: string | null; metrics: ReturnType<typeof aggregateMetrics> | null; eco: any }>({
    loading: true,
    failed: false,
    campaignId: null,
    metrics: null,
    eco: null
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setState(cur => ({ ...cur, loading: true, failed: false }));
      const overview = await Promise.resolve(apiFetch(`/generated-pages/${pageId}/campaign`)).catch(() => null);
      const plan = overview?.plan || null;
      const campaignId = planCampaignId(plan);
      if (!campaignId) {
        if (alive) setState({ loading: false, failed: overview === null, campaignId: null, metrics: null, eco: null });
        return;
      }
      const [perf, eco] = await Promise.all([
        Promise.resolve(apiFetch(`/intelligence/creative-performance?mode=real&${periodQs}`)).catch(() => null),
        plan?.id ? Promise.resolve(apiFetch(`/campaigns/${plan.id}/economics?mode=real`)).catch(() => null) : null
      ]);
      if (perf === null || !Array.isArray(perf?.creatives)) {
        // sem os números não mostra zeros como se fossem reais
        if (alive) setState({ loading: false, failed: true, campaignId, metrics: null, eco: null });
        return;
      }
      const items: PerfItem[] = perf.creatives.filter((p: PerfItem) => String(p.campaign_id) === campaignId);
      if (alive) setState({ loading: false, failed: false, campaignId, metrics: aggregateMetrics(items), eco: eco?.economics || null });
    })();
    return () => {
      alive = false;
    };
  }, [apiFetch, pageId, periodQs, refreshKey]);

  return (
    <Section title="Resultados reais" testId="factory-results">
      {state.loading ? (
        <p className="px-1 text-nq-aux text-nq-muted">Carregando...</p>
      ) : state.failed ? (
        <p className="px-1 text-nq-aux text-nq-attention" data-testid="factory-results-error">
          Não deu para carregar os números agora. Tente de novo em instantes.
        </p>
      ) : !state.campaignId ? (
        <p className="px-1 text-nq-aux text-nq-muted" data-testid="factory-results-empty">
          Os números aparecem aqui quando a campanha estiver na Meta e começar a rodar (depois do seu Sim).
        </p>
      ) : (
        <Surface className="p-4 space-y-3" as="div">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4" data-testid="factory-results-stats">
            <Stat label="Investido" value={brl(state.metrics?.spend ?? 0)} />
            <Stat label="Vendas" value={int(state.metrics?.sales ?? 0)} />
            <Stat label="Faturamento" value={brl(state.metrics?.revenue ?? 0)} />
            <Stat
              label="Custo por venda"
              value={state.metrics?.cpa === null || state.metrics?.cpa === undefined ? '—' : brl(state.metrics.cpa)}
              tone={state.metrics?.cpa && state.eco?.breakeven_cpa ? (state.metrics.cpa <= state.eco.breakeven_cpa ? 'positive' : 'critical') : 'neutral'}
              hint={state.eco?.breakeven_cpa ? `Equilíbrio: até ${brl(state.eco.breakeven_cpa)}` : undefined}
            />
            <Stat label="Retorno (ROAS)" value={multiple(state.metrics?.roas ?? null)} />
          </div>
          <p className="text-nq-caption text-nq-subtle">No período escolhido no topo. Vendas são as pagas e confirmadas no NORQVA.</p>
        </Surface>
      )}
    </Section>
  );
}
