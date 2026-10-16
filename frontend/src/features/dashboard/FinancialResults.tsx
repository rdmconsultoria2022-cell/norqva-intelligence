import React, { useState } from 'react';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { Section, Surface, RowGroup, StatusPill, Disclosure, Stat, Tone, brl, int, pct, multiple, useIsMobile } from '../../components/ui/premium';

// NORQVA-0086: aba Resultados → Financeiro no padrão NORQVA Premium. Só apresentação.
// Recebe os MESMOS números que o DashboardView já calculava a partir de /financial/dashboard
// (nenhuma fórmula nova). No celular as tabelas largas viram listas; no computador continuam tabelas.

export interface FinancialEntity {
  entityId: string;
  entityName: string;
  parentCampaignName?: string | null;
  metaId?: string | null;
  status?: string | null;
  spend: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  attributedPaidOrders: number;
  attributedGrossRevenue: number;
  resultAfterMedia: number;
  cac: number | null;
  roas: number | null;
  performanceStatus?: string | null;
}

export interface RevenueCards {
  attributedRevenue: number;
  attributedOrders: number;
  organicRevenue: number;
  organicOrders: number;
  ambiguousOrders: number;
  otherRevenue: number;
  otherOrders: number;
}

interface Props {
  finLoading: boolean;
  hasData: boolean;
  periodText: string;
  timeWindow?: { startDate: string; endDate: string } | null;
  dataQuality: any;
  summary: any;
  costCoverage: string;
  byProduct: any[];
  reconciliation: { isReconciled?: boolean; productTotalRevenue: number; campaignPlusUnattributedRevenue: number };
  byCampaign: FinancialEntity[];
  byAdSet: FinancialEntity[];
  byAd: FinancialEntity[];
  revenueCards: RevenueCards | null;
  cardsMismatch: boolean;
  cardsTotal: number;
  paidRevenue: number | null;
  onRefresh: () => void;
}

const SAMPLE: Record<string, { label: string; tone: Tone }> = {
  OBSERVING: { label: 'Em observação', tone: 'info' },
  INSUFFICIENT_DATA: { label: 'Amostra pequena', tone: 'attention' },
  NO_DATA: { label: 'Sem dados', tone: 'neutral' }
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Ativa', tone: 'positive' },
  PAUSED: { label: 'Pausada', tone: 'neutral' },
  CAMPAIGN_PAUSED: { label: 'Pausada pela campanha', tone: 'neutral' },
  ADSET_PAUSED: { label: 'Pausada pelo conjunto', tone: 'neutral' },
  ARCHIVED: { label: 'Arquivada', tone: 'neutral' },
  DELETED: { label: 'Excluída', tone: 'neutral' },
  DISAPPROVED: { label: 'Reprovada', tone: 'critical' },
  WITH_ISSUES: { label: 'Com problema', tone: 'critical' },
  PENDING_REVIEW: { label: 'Em análise', tone: 'attention' },
  IN_PROCESS: { label: 'Em processamento', tone: 'attention' }
};

function sentence(s: string): string {
  const low = s.replace(/_/g, ' ').toLowerCase();
  return low.charAt(0).toUpperCase() + low.slice(1);
}

function sampleOf(s?: string | null) {
  if (!s) return null;
  return SAMPLE[s] || { label: sentence(s), tone: 'neutral' as Tone };
}

function statusOf(s?: string | null) {
  if (!s) return null;
  return STATUS[s.toUpperCase()] || { label: sentence(s), tone: 'neutral' as Tone };
}

const signTone = (n: number | null | undefined): Tone => (n === null || n === undefined ? 'neutral' : n < 0 ? 'critical' : 'neutral');

function SpendSplit({ p }: { p: any }) {
  const direct = typeof p?.directSpend === 'number' ? p.directSpend : null;
  const prorated = typeof p?.proratedSpend === 'number' ? p.proratedSpend : null;
  if (direct === null || prorated === null || (direct === 0 && prorated === 0)) return null;
  return (
    <span className="block text-nq-caption font-normal text-nq-subtle" data-testid="product-spend-split">
      direta {brl(direct)} · rateio {brl(prorated)}
    </span>
  );
}

function Pair({ label, value, tone = 'neutral' }: { label: string; value: React.ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <dt className="text-nq-caption text-nq-muted">{label}</dt>
      <dd className={`text-nq-body font-semibold tabular-nums ${tone === 'critical' ? 'text-nq-critical-text' : tone === 'positive' ? 'text-nq-positive-text' : 'text-nq-text'}`}>
        {value}
      </dd>
    </div>
  );
}

const th = 'px-3 py-2.5 font-medium text-nq-caption text-nq-muted whitespace-nowrap';
const td = 'px-3 py-3 tabular-nums whitespace-nowrap';

export function FinancialResults(props: Props) {
  const {
    finLoading,
    hasData,
    periodText,
    timeWindow,
    dataQuality,
    summary: s,
    costCoverage,
    byProduct,
    reconciliation,
    byCampaign,
    byAdSet,
    byAd,
    revenueCards,
    cardsMismatch,
    cardsTotal,
    paidRevenue,
    onRefresh
  } = props;
  const isMobile = useIsMobile();
  const [level, setLevel] = useState<'campaign' | 'adset' | 'ad'>('campaign');

  const coverage =
    costCoverage === 'COMPLETE'
      ? { label: 'Custos completos', tone: 'positive' as Tone }
      : costCoverage === 'PARTIAL'
        ? { label: 'Custos parciais', tone: 'attention' as Tone }
        : { label: 'Custos desconhecidos', tone: 'critical' as Tone };

  const reconciled = reconciliation?.isReconciled !== false;
  const levels = [
    { id: 'campaign' as const, label: 'Campanhas', rows: byCampaign, empty: 'Nenhuma campanha encontrada no período.' },
    { id: 'adset' as const, label: 'Conjuntos', rows: byAdSet, empty: 'Nenhum conjunto de anúncios encontrado no período.' },
    { id: 'ad' as const, label: 'Anúncios', rows: byAd, empty: 'Nenhum anúncio encontrado no período.' }
  ];
  const current = levels.find(l => l.id === level)!;
  const showParent = level !== 'campaign';

  return (
    <div className="space-y-6" data-testid="financial-results">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="text-nq-aux text-nq-muted">Período: {periodText}</div>
          {timeWindow && (
            <div className="text-nq-caption text-nq-subtle">
              {new Date(timeWindow.startDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} a{' '}
              {new Date(timeWindow.endDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={finLoading}
          className="h-11 w-11 -mr-2 flex items-center justify-center rounded-full text-nq-muted active:bg-nq-surface hover:text-nq-text disabled:opacity-50"
          title="Atualizar dados financeiros"
          aria-label="Atualizar dados financeiros"
        >
          <RefreshCw className={`h-5 w-5 ${finLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {dataQuality && (
        <div className="space-y-2">
          <Surface className="p-4 flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="h-5 w-5 text-nq-attention shrink-0" />
            <div className="min-w-0 text-nq-aux">
              <div className="font-semibold text-nq-text">
                Amostra: {sampleOf(dataQuality.sampleSizeStatus)?.label ?? '—'}
                {dataQuality.performanceStatus && <span className="ml-2 font-normal text-nq-muted">{sampleOf(dataQuality.performanceStatus)?.label}</span>}
              </div>
              {dataQuality.sampleSizeNotice && <p className="mt-1 text-nq-muted">{dataQuality.sampleSizeNotice}</p>}
            </div>
          </Surface>
          {dataQuality.attributionQualityStatus === 'LOW_QUALITY' && (
            <Surface className="p-4 flex items-start gap-3">
              <Info aria-hidden="true" className="h-5 w-5 text-nq-info shrink-0" />
              <div className="min-w-0 text-nq-aux">
                <div className="font-semibold text-nq-text">Qualidade da atribuição</div>
                {dataQuality.qualityNotice && <p className="mt-1 text-nq-muted">{dataQuality.qualityNotice}</p>}
              </div>
            </Surface>
          )}
        </div>
      )}

      {finLoading && !hasData ? (
        <Surface className="h-60 flex flex-col items-center justify-center gap-2 text-nq-aux text-nq-muted">
          <RefreshCw aria-hidden="true" className="h-6 w-6 animate-spin" />
          Carregando inteligência financeira auditada...
        </Surface>
      ) : !hasData ? (
        <Surface className="p-8 text-center text-nq-aux text-nq-muted">Nenhum dado financeiro disponível.</Surface>
      ) : (
        <>
          <Surface className="p-4 sm:p-5">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-5">
              <Stat label="Investimento" value={brl(s.totalSpend)} hint="Meta Ads" testId="fin-spend" />
              <Stat
                label="Faturamento"
                value={brl(s.grossRevenue)}
                tone="positive"
                hint={`${int(s.paidOrdersCount)} pagos · ${int(s.pendingOrdersCount)} pendentes`}
                testId="fin-revenue"
              />
              <Stat label="Após a mídia" value={brl(s.resultAfterMedia)} tone={signTone(s.resultAfterMedia)} hint={`ROAS ${multiple(s.roas)}`} testId="fin-after-media" />
              <Stat label="Custos conhecidos" value={brl(s.totalCosts)} hint={<StatusPill tone={coverage.tone}>{coverage.label}</StatusPill>} testId="fin-costs" />
              <Stat
                label="Resultado conhecido"
                value={brl(s.netProfit)}
                tone={s.netProfit < 0 ? 'critical' : 'positive'}
                hint={`Ticket médio ${brl(s.aov)}`}
                testId="fin-net"
              />
              <Stat
                label="Margem conhecida"
                value={pct(s.netMargin)}
                tone={s.netMargin === null || s.netMargin === undefined ? 'neutral' : s.netMargin < 0 ? 'critical' : 'neutral'}
                hint="Resultado ÷ faturamento"
                testId="fin-margin"
              />
            </div>
            <p className="mt-4 text-nq-caption text-nq-subtle">
              Resultado calculado com os custos registrados na NORQVA. Não representa necessariamente lucro líquido contábil.
            </p>
          </Surface>

          <Surface>
            <Disclosure
              testId="fin-reconciliation"
              summary={
                <StatusPill tone={reconciled ? 'positive' : 'attention'}>
                  {reconciled ? 'Integridade financeira ✓ Conciliado' : 'Integridade financeira: diferença a conferir'}
                </StatusPill>
              }
            >
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Pair label="Soma por produto" value={brl(reconciliation.productTotalRevenue)} />
                <Pair label="Faturamento consolidado" value={brl(s.grossRevenue)} />
                <Pair label="Campanhas + não atribuído" value={brl(reconciliation.campaignPlusUnattributedRevenue)} />
              </dl>
            </Disclosure>
          </Surface>

          <Section title={`Por produto (${byProduct.length})`}>
            <p className="px-1 -mt-2 text-nq-aux text-nq-muted">Mídia direta de cada campanha; campanha sem vínculo é rateada pela receita.</p>
            {byProduct.length === 0 ? (
              <Surface className="p-6 text-center text-nq-aux text-nq-muted">Nenhum produto cadastrado.</Surface>
            ) : isMobile ? (
              <RowGroup>
                {byProduct.map((p: any) => (
                  <div key={p.productId} className="px-4 py-4 space-y-3" data-testid="fin-product">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-nq-body font-semibold text-nq-text break-words">{p.productName}</div>
                        <div className="text-nq-caption text-nq-subtle">{p.productHumanId}</div>
                      </div>
                      <div className="text-right shrink-0 text-nq-aux text-nq-muted">{int(p.unitsSold)} vendas</div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <Pair label="Faturamento" value={brl(p.grossRevenue)} tone="positive" />
                      <div className="min-w-0">
                        <dt className="text-nq-caption text-nq-muted">Mídia</dt>
                        <dd className="text-nq-body font-semibold tabular-nums text-nq-text">
                          {brl(p.attributedSpend)}
                          <SpendSplit p={p} />
                        </dd>
                      </div>
                      <Pair label="Custos e taxas" value={brl(p.gatewayFees)} />
                      <Pair label="Resultado conhecido" value={brl(p.netProfit)} tone={p.netProfit < 0 ? 'critical' : 'positive'} />
                      <Pair label="Margem" value={pct(p.netMargin)} tone={signTone(p.netMargin)} />
                    </dl>
                  </div>
                ))}
              </RowGroup>
            ) : (
              <Surface className="overflow-x-auto">
                <table className="w-full text-left text-nq-aux">
                  <thead className="border-b border-nq-line">
                    <tr>
                      <th className={th}>Produto</th>
                      <th className={`${th} text-right`}>Vendas pagas</th>
                      <th className={`${th} text-right`}>Faturamento</th>
                      <th className={`${th} text-right`}>Mídia</th>
                      <th className={`${th} text-right`}>Custos conhecidos</th>
                      <th className={`${th} text-right`}>Resultado conhecido</th>
                      <th className={`${th} text-right`}>Margem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nq-line/60">
                    {byProduct.map((p: any) => (
                      <tr key={p.productId} data-testid="fin-product">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-nq-text">{p.productName}</div>
                          <div className="text-nq-caption text-nq-subtle">{p.productHumanId}</div>
                        </td>
                        <td className={`${td} text-right text-nq-text`}>{int(p.unitsSold)}</td>
                        <td className={`${td} text-right font-semibold text-nq-positive-text`}>{brl(p.grossRevenue)}</td>
                        <td className={`${td} text-right text-nq-text`}>
                          {brl(p.attributedSpend)}
                          <SpendSplit p={p} />
                        </td>
                        <td className={`${td} text-right text-nq-muted`}>{brl(p.gatewayFees)}</td>
                        <td className={`${td} text-right font-semibold ${p.netProfit < 0 ? 'text-nq-critical-text' : 'text-nq-positive-text'}`}>{brl(p.netProfit)}</td>
                        <td className={`${td} text-right ${p.netMargin !== null && p.netMargin < 0 ? 'text-nq-critical-text' : 'text-nq-text'}`}>{pct(p.netMargin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Surface>
            )}
          </Section>

          <Section title="Atribuição por campanha, conjunto e anúncio" testId="fin-attribution">
            <p className="px-1 -mt-2 text-nq-aux text-nq-muted">Só vendas que batem com uma única origem, sem estimativa.</p>
            <div role="tablist" aria-label="Nível" className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto no-scrollbar">
              {levels.map(l => (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={level === l.id}
                  onClick={() => setLevel(l.id)}
                  className={`shrink-0 h-10 px-4 rounded-full text-nq-aux font-medium transition-colors ${
                    level === l.id ? 'bg-nq-text text-nq-bg' : 'bg-nq-surface text-nq-muted'
                  }`}
                >
                  {l.label} ({l.rows.length})
                </button>
              ))}
            </div>

            {current.rows.length === 0 ? (
              <Surface className="p-6 text-center text-nq-aux text-nq-muted">{current.empty}</Surface>
            ) : isMobile ? (
              <RowGroup>
                {current.rows.map(e => {
                  const st = statusOf(e.status);
                  const sm = sampleOf(e.performanceStatus);
                  return (
                    <div key={e.entityId} className="px-4 py-4 space-y-3" data-testid="fin-entity">
                      <div className="min-w-0">
                        <div className="text-nq-body font-semibold text-nq-text break-words">{e.entityName}</div>
                        {showParent && e.parentCampaignName && <div className="text-nq-caption text-nq-muted break-words">{e.parentCampaignName}</div>}
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {st && <StatusPill tone={st.tone}>{st.label}</StatusPill>}
                          {sm && <StatusPill tone={sm.tone}>{sm.label}</StatusPill>}
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <Pair label="Investimento" value={brl(e.spend)} />
                        <Pair label="Receita atribuída" value={brl(e.attributedGrossRevenue)} tone="positive" />
                        <Pair label="Após a mídia" value={brl(e.resultAfterMedia)} tone={signTone(e.resultAfterMedia)} />
                        <Pair label="ROAS" value={multiple(e.roas)} />
                        <Pair label="Pedidos" value={int(e.attributedPaidOrders)} />
                        <Pair label="CAC" value={brl(e.cac)} />
                        <Pair label="Cliques (CTR)" value={`${int(e.clicks)} (${pct(e.ctr, 2)})`} />
                        <Pair label="CPC médio" value={brl(e.cpc)} />
                      </dl>
                      {e.metaId && <div className="text-nq-caption text-nq-subtle break-all">ID na Meta: {e.metaId}</div>}
                    </div>
                  );
                })}
              </RowGroup>
            ) : (
              <Surface className="overflow-x-auto">
                <table className="w-full text-left text-nq-aux">
                  <thead className="border-b border-nq-line">
                    <tr>
                      <th className={th}>{level === 'campaign' ? 'Campanha' : level === 'adset' ? 'Conjunto' : 'Anúncio'}</th>
                      <th className={th}>Situação</th>
                      <th className={`${th} text-right`}>Investimento</th>
                      <th className={`${th} text-right`}>Cliques (CTR)</th>
                      <th className={`${th} text-right`}>CPC médio</th>
                      <th className={`${th} text-right`}>Pedidos</th>
                      <th className={`${th} text-right`}>Receita atribuída</th>
                      <th className={`${th} text-right`}>Após a mídia</th>
                      <th className={`${th} text-right`}>CAC</th>
                      <th className={`${th} text-right`}>ROAS</th>
                      <th className={th}>Amostra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nq-line/60">
                    {current.rows.map(e => {
                      const st = statusOf(e.status);
                      const sm = sampleOf(e.performanceStatus);
                      return (
                        <tr key={e.entityId} data-testid="fin-entity">
                          <td className="px-3 py-3 min-w-[220px]">
                            <div className="font-semibold text-nq-text break-words">{e.entityName}</div>
                            {showParent && e.parentCampaignName && <div className="text-nq-caption text-nq-muted break-words">{e.parentCampaignName}</div>}
                            {e.metaId && <div className="text-nq-caption text-nq-subtle">ID {e.metaId}</div>}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">{st ? <StatusPill tone={st.tone}>{st.label}</StatusPill> : <span className="text-nq-subtle">—</span>}</td>
                          <td className={`${td} text-right text-nq-text`}>{brl(e.spend)}</td>
                          <td className={`${td} text-right text-nq-text`}>
                            {int(e.clicks)} ({pct(e.ctr, 2)})
                          </td>
                          <td className={`${td} text-right text-nq-muted`}>{brl(e.cpc)}</td>
                          <td className={`${td} text-right text-nq-text`}>{int(e.attributedPaidOrders)}</td>
                          <td className={`${td} text-right font-semibold text-nq-positive-text`}>{brl(e.attributedGrossRevenue)}</td>
                          <td className={`${td} text-right font-semibold ${e.resultAfterMedia < 0 ? 'text-nq-critical-text' : 'text-nq-text'}`}>{brl(e.resultAfterMedia)}</td>
                          <td className={`${td} text-right text-nq-muted`}>{brl(e.cac)}</td>
                          <td className={`${td} text-right font-semibold ${e.roas !== null && e.roas >= 1 ? 'text-nq-positive-text' : 'text-nq-muted'}`}>{multiple(e.roas)}</td>
                          <td className="px-3 py-3 whitespace-nowrap">{sm ? <StatusPill tone={sm.tone}>{sm.label}</StatusPill> : <span className="text-nq-subtle">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Surface>
            )}
          </Section>

          <Section title="Origem da receita">
            <Surface className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5" data-testid="revenue-cards">
                <div data-testid="card-attributed">
                  <Stat label="Atribuída à Meta" value={brl(revenueCards?.attributedRevenue ?? 0)} tone="positive" hint={`${int(revenueCards?.attributedOrders ?? 0)} pedidos confirmados`} />
                </div>
                <div data-testid="card-organic">
                  <Stat label="Orgânica" value={brl(revenueCards?.organicRevenue ?? 0)} tone="info" hint={`${int(revenueCards?.organicOrders ?? 0)} pedidos confirmados`} />
                </div>
                <div data-testid="card-unattributed">
                  <Stat
                    label="Não atribuída (outros)"
                    value={brl(revenueCards?.otherRevenue ?? 0)}
                    tone="attention"
                    hint={
                      <>
                        {int(revenueCards?.otherOrders ?? 0)} pedidos confirmados
                        {revenueCards && revenueCards.ambiguousOrders > 0
                          ? ` (${revenueCards.ambiguousOrders} ${revenueCards.ambiguousOrders === 1 ? 'bate' : 'batem'} com mais de uma campanha)`
                          : ''}
                      </>
                    }
                  />
                </div>
              </div>
            </Surface>
            {!revenueCards && (
              <p className="px-1 text-nq-caption text-nq-subtle" data-testid="revenue-cards-missing">
                A divisão da receita por origem não veio nesta consulta.
              </p>
            )}
            {cardsMismatch && (
              <p className="px-1 text-nq-aux text-nq-attention" data-testid="revenue-cards-mismatch">
                Atenção: as três origens somam {brl(cardsTotal)}, mas o faturamento do período é {brl(paidRevenue ?? 0)}. Confira a atribuição.
              </p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
