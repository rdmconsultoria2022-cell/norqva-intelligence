// NORQVA-0119 (contrato NORQVA-0118, etapa B): nota de força ESTIMADA de uma referência, de 0 a 100.
// Ninguém de fora vê vendas, cliques ou gasto de um anúncio de terceiro; a nota usa só o que dá para ver:
// - tempo no ar e quantos anúncios usam o mesmo criativo (prints da Biblioteca de Anúncios): até 65 pontos.
//   Anúncio que fica muito tempo no ar e ganha variações costuma estar dando dinheiro para o dono.
// - estrutura completa (o que a página ou o anúncio tem): até 35 pontos.
// Cada ponto vem com o motivo, para o dono entender de onde saiu a nota. Conta pura, sem banco e sem IA.

import type { ReferenceStructure } from './referenceService';

export interface ScoreItem {
  key: string;
  label: string;
  points: number;
  max: number;
  reason: string;
}

export interface ReferenceScore {
  score: number;
  max: 100;
  level: 'FORTE' | 'MEDIA' | 'FRACA';
  level_label: string;
  estimate: true;
  has_signals: boolean;
  items: ScoreItem[];
  summary: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const dm = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');

function timeItem(days: number | null | undefined, until: string, ended: boolean): ScoreItem {
  const max = 40;
  if (days === null || days === undefined) {
    return { key: 'time', label: 'Tempo no ar', points: 0, max, reason: 'A data de início não aparece. Mande o print com "Veiculação iniciada em".' };
  }
  const points = days >= 60 ? 40 : days >= 30 ? 32 : days >= 14 ? 22 : days >= 7 ? 12 : 4;
  const why =
    days >= 30
      ? 'Anúncio que fica tanto tempo no ar costuma estar vendendo.'
      : days >= 7
        ? 'Já passou da fase de teste, mas ainda é cedo para ter certeza.'
        : 'Muito novo: pode ser só um teste do concorrente.';
  const span = until ? (ended ? ` (saiu do ar em ${until})` : ` (até ${until})`) : '';
  return { key: 'time', label: 'Tempo no ar', points, max, reason: `${plural(days, 'dia', 'dias')} no ar${span}. ${why}` };
}

function variantsItem(n: number | null | undefined): ScoreItem {
  const max = 25;
  if (n === null || n === undefined) {
    return { key: 'variants', label: 'Variações', points: 0, max, reason: 'Não aparece quantos anúncios usam esse criativo.' };
  }
  const points = n >= 10 ? 25 : n >= 4 ? 18 : n >= 2 ? 10 : 4;
  const why = n >= 4 ? 'O dono está escalando: duplica o que dá certo.' : n >= 2 ? 'Algumas cópias: sinal de que está funcionando.' : 'Um anúncio só: ainda sem sinal de escala.';
  return { key: 'variants', label: 'Variações', points, max, reason: `${plural(n, 'anúncio usa', 'anúncios usam')} esse criativo. ${why}` };
}

function salesItems(s: Extract<ReferenceStructure, { kind: 'SALES_PAGE' }>): ScoreItem[] {
  const roles = new Set(s.sections.map(x => x.role));
  const has = (...r: string[]) => r.some(x => roles.has(x as any));
  const ctas = s.sections.reduce((a, x) => a + (x.cta_count || 0), 0);
  const parts: Array<[string, boolean, string, string]> = [
    ['hook', s.sections[0]?.role === 'HERO_HOOK', 'Abre com um gancho', 'Não abre com um gancho'],
    ['pain', has('PAIN', 'AGITATION'), 'Fala da dor do comprador', 'Não fala da dor do comprador'],
    ['product', has('PRODUCT_REVEAL', 'CONTENTS', 'BENEFITS', 'MECHANISM'), 'Mostra o produto e o que ele entrega', 'Mostra pouco do produto'],
    ['proof', has('PROOF_RESULTS', 'TESTIMONIALS', 'AUTHORITY'), 'Tem prova ou autoridade', 'Sem prova nem autoridade'],
    ['offer', has('OFFER_PRICE', 'BONUS'), 'Apresenta a oferta', 'Não apresenta a oferta com clareza'],
    ['guarantee', has('GUARANTEE'), 'Tem garantia', 'Sem garantia'],
    ['cta', ctas >= 2, `${plural(ctas, 'botão', 'botões')} de compra`, ctas === 1 ? 'Só 1 botão de compra' : 'Sem botão de compra']
  ];
  return parts.map(([key, ok, yes, no]) => ({ key: `s_${key}`, label: 'Estrutura', points: ok ? 5 : 0, max: 5, reason: ok ? yes : no }));
}

function adItems(s: Extract<ReferenceStructure, { kind: 'AD' }>): ScoreItem[] {
  const roles = new Set(s.structure_beats.map(b => b.role));
  const has = (...r: string[]) => r.some(x => roles.has(x as any));
  const formatOk = s.format !== 'VIDEO' || (s.duration_s !== null && s.duration_s >= 10);
  const parts: Array<[string, number, boolean, string, string]> = [
    ['hook_type', 8, s.hook_type !== 'OTHER', 'Gancho claro logo no começo', 'Gancho pouco claro'],
    ['hook', 5, has('HOOK'), 'Tem um trecho só para prender a atenção', 'Sem trecho de gancho'],
    ['benefit', 7, has('BENEFIT', 'DEMONSTRATION'), 'Mostra o benefício ou demonstra o produto', 'Não mostra benefício nem demonstração'],
    ['proof', 5, has('PROOF'), 'Tem prova', 'Sem prova'],
    ['cta', 5, has('CTA', 'OFFER'), 'Termina chamando para a ação', 'Não chama para a ação'],
    ['format', 5, formatOk, 'Formato completo', 'Vídeo curto demais para contar a história']
  ];
  return parts.map(([key, max, ok, yes, no]) => ({ key: `a_${key}`, label: 'Estrutura', points: ok ? max : 0, max, reason: ok ? yes : no }));
}

/** Nota estimada da referência. Sem estrutura, null. */
export function referenceScore(structure: ReferenceStructure | null | undefined): ReferenceScore | null {
  if (!structure || (structure.kind !== 'SALES_PAGE' && structure.kind !== 'AD')) return null;
  const sig = structure.signals || null;
  const ended = !!sig?.ended_on;
  const items: ScoreItem[] = [timeItem(sig?.active_days, dm(ended ? sig?.ended_on : sig?.observed_on), ended), variantsItem(sig?.ads_using_creative)];
  items.push(...(structure.kind === 'SALES_PAGE' ? salesItems(structure) : adItems(structure)));
  const score = Math.max(0, Math.min(100, items.reduce((a, i) => a + i.points, 0)));
  const level = score >= 70 ? 'FORTE' : score >= 40 ? 'MEDIA' : 'FRACA';
  const hasSignals = !!sig && (sig.active_days !== null || sig.ads_using_creative !== null);
  const level_label = level === 'FORTE' ? 'Forte' : level === 'MEDIA' ? 'Média' : 'Fraca';
  const summary = hasSignals
    ? `Estimativa ${level_label.toLowerCase()} (${score} de 100), pelo tempo no ar, pelas variações e pela estrutura.`
    : `Estimativa só pela estrutura (${score} de 100): sem os prints da Biblioteca de Anúncios não dá para saber se está vendendo.`;
  return { score, max: 100, level, level_label, estimate: true, has_signals: hasSignals, items, summary };
}
