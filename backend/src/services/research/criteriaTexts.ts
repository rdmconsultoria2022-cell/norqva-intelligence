// NORQVA-0029: textos que fazem parte dos critérios de avaliação. Ficam aqui (sem dependências) para a
// tela Pesquisa mostrá-los e para o dono validá-los. Mudar estes textos exige contrato próprio e,
// depois do merge, uma nova validação na aba Critérios (o hash muda).

/** Checklist do validador (Claude em modo crítico). APROVA é recusado se algum item vier FALHA. */
export const VALIDATION_CHECKS: { key: string; label: string }[] = [
  { key: 'AMOSTRA', label: 'Tamanho da amostra e confiança dos dados' },
  { key: 'CONTA_FECHA', label: 'CPA alcançável × CPA de equilíbrio (a conta fecha?)' },
  { key: 'CLAIMS', label: 'Afirmações cobertas por claims VERIFIED do produto' },
  { key: 'SATURACAO', label: 'Saturação do nicho, do público e do criativo' },
  { key: 'ATRIBUICAO', label: 'Confiabilidade da atribuição das vendas' },
  { key: 'CONCORRENCIA', label: 'Concorrência e diferenciação da oferta' }
];

/** Regras enviadas às IAs ao avaliar, validar e planejar. */
export const AI_RULES: string[] = [
  'Nunca publicar, pausar ou mudar orçamento na Meta; o dono aprova.',
  'Só usar afirmações das claims VERIFIED do produto escolhido (claim_codes).',
  'Nunca prometer acesso vitalício nem resultado financeiro garantido.',
  'Nome do anúncio = chave do criativo = utm_content.'
];
