// NORQVA-0031: critérios recomendados pelo Claude, a partir dos números reais da conta (equilíbrio de
// ~R$ 14 por venda da Trattoria, CPM ~R$ 70) e de 20.000 simulações por regra. Análise completa no
// Claude Docs: "NORQVA-0031 — Análise: Cartões de Receita e Critérios Recomendados".
// Só preenche o formulário: vale depois de salvo como rascunho e validado pelo ADMIN.

export interface Recommendation {
  value: number;
  why: string;
}

export const RECOMMENDED_CRITERIA: Record<string, Recommendation> = {
  winner_min_sales: { value: 5, why: 'Com 3 vendas, 1 em cada 9 anúncios que dão prejuízo vira “vencedor”; com 5, 1 em 15.' },
  winner_cpa_ratio: { value: 0.66, why: 'A folga de 34% cobre tarifa, imposto e erro de atribuição.' },
  promising_cpa_ratio: { value: 1, why: 'Empatar ainda vale manter no ar.' },
  loser_spend_ratio: { value: 2, why: 'Melhor equilíbrio entre pausar anúncio bom por engano (8%) e gastar demais no ruim.' },
  loser_ctr_min_pct: { value: 0.5, why: 'Com poucas impressões, 0,6% pune anúncio bom por azar.' },
  loser_ctr_min_spend: { value: 25, why: 'Com CPM de R$ 70, R$ 15 compram só ~210 impressões.' },
  loser_cpa_ratio: { value: 1.5, why: 'Com gasto já relevante, 50% acima do equilíbrio não se recupera.' },
  no_data_spend_ratio: { value: 0.5, why: 'Cedo demais para julgar.' },
  no_breakeven_min_spend: { value: 15, why: 'R$ 5 não mostram nada com esse CPM.' },
  no_breakeven_winner_roas: { value: 2, why: 'Com ~28% de custos, empatar exige ROAS 1,4; vencedor (0,66×) é ROAS 2,1.' },
  shortlist_min_spend: { value: 20, why: 'Abaixo disso não há impressões suficientes para avaliar.' },
  shortlist_min_impressions: { value: 500, why: 'Já adequado.' },
  shortlist_min_days: { value: 2, why: 'A Meta oscila no primeiro dia.' },
  shortlist_max_cpa_ratio: { value: 1.5, why: 'Igual ao limite de perdedor.' },
  eu_min_ads: { value: 5, why: 'Sem resultado europeu testado ainda para calibrar.' },
  eu_w_long_runners: { value: 0.4, why: 'Sem resultado europeu testado ainda para calibrar.' },
  eu_w_advertisers: { value: 0.25, why: 'Sem resultado europeu testado ainda para calibrar.' },
  eu_w_reach: { value: 0.2, why: 'Sem resultado europeu testado ainda para calibrar.' },
  eu_w_momentum: { value: 0.15, why: 'Sem resultado europeu testado ainda para calibrar.' },
  eu_validated_min: { value: 70, why: 'Sem resultado europeu testado ainda para calibrar.' },
  eu_promising_min: { value: 45, why: 'Sem resultado europeu testado ainda para calibrar.' }
};
