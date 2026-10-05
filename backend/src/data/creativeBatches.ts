// NORQVA-0005: creative batches as versioned data. Source of truth for the copy:
// norqva-ai/creative-batches/BB-B01.md (hooks approved by the owner on 2026-09-27).
// Importing a batch only creates DRAFT creatives and UNVERIFIED claims. A human verifies
// claims and approves each creative in the Creative Factory screen.

export interface BatchClaim {
  code: string; // unique across products, e.g. BB-CL-01
  text: string;
  type: 'FEATURE' | 'PRICE' | 'OFFER_TERM';
  source: string;
  initialStatus?: 'UNVERIFIED' | 'REJECTED';
  statusNote?: string;
}

export interface BatchCreative {
  key: string; // human_id = utm_content_key = Meta ad name
  hookCode: string;
  hookFamily: string;
  hook: string;
  mechanismCode: string;
  mechanism: string;
  ctaCode: string;
  cta: string;
  format: 'VIDEO' | 'IMAGE' | 'CAROUSEL';
  durationSeconds: number | null;
  script: string;
  primaryText: string;
  headline: string;
  claimCodes: string[];
  // NORQVA-0020: creatives that arrive with their produced file (Creative Factory releases)
  fileUrl?: string | null;
  generationSource?: 'AI_ASSISTED' | 'FACTORY';
}

export interface CreativeBatch {
  code: string;
  productId: string;
  offerId: string;
  offerHumanId: string;
  description: string;
  claims: BatchClaim[];
  creatives: BatchCreative[];
  // NORQVA-0007: files already produced for some creatives (key -> public http(s) URL)
  producedAssets?: Record<string, string>;
}

const BB_CLAIMS: BatchClaim[] = [
  { code: 'BB-CL-01', type: 'FEATURE', text: 'Aplicativo web para registrar entradas e saídas pelo celular ou computador', source: 'Landing OFF-BOLSO-BLINDADO-2990, pilares 1 e 5' },
  { code: 'BB-CL-02', type: 'FEATURE', text: 'Mostra quanto dinheiro ainda está disponível no mês', source: 'Landing, pilar 2' },
  { code: 'BB-CL-03', type: 'FEATURE', text: 'Separa os gastos por categoria e mostra onde você mais gastou', source: 'Landing, pilar 3' },
  { code: 'BB-CL-04', type: 'FEATURE', text: 'Usa a divisão 50/30/20 (necessidades, estilo de vida, reserva/investimento)', source: 'Landing, pilar 4' },
  { code: 'BB-CL-05', type: 'FEATURE', text: 'Inclui Planilha de Gestão 2026 e Guia Prático em PDF', source: 'Landing, pacote incluso' },
  { code: 'BB-CL-06', type: 'PRICE', text: 'R$ 29,90, pagamento único, sem mensalidade', source: 'Preço atual da oferta OFF-BOLSO-BLINDADO-2990' },
  { code: 'BB-CL-07', type: 'FEATURE', text: 'Liberação imediata após o Pix', source: 'Entrega automática após confirmação do pagamento' },
  {
    code: 'BB-CL-08',
    type: 'OFFER_TERM',
    text: 'Acesso vitalício',
    source: 'Landing (removido em NORQVA-0005)',
    initialStatus: 'REJECTED',
    statusNote: 'Dono do produto não garante acesso vitalício (2026-09-27). Proibido em anúncios.'
  }
];

const HOOKS = [
  { code: 'H01', family: 'PROBLEMA', format: 'VIDEO' as const, duration: 20, text: 'Quando o salário some antes do fim do mês, quase sempre falta uma coisa: saber pra onde ele foi.' },
  { code: 'H02', family: 'DEMONSTRACAO', format: 'VIDEO' as const, duration: 15, text: 'Olha como é registrar um gasto aqui: poucos toques e pronto.' },
  { code: 'H03', family: 'ERRO_COMUM', format: 'CAROUSEL' as const, duration: 18, text: 'O erro de quem tenta se organizar: uma planilha tão complicada que ninguém mantém.' },
  { code: 'H04', family: 'METODO', format: 'VIDEO' as const, duration: 25, text: 'A regra 50/30/20 em 20 segundos.' },
  { code: 'H05', family: 'PRATICIDADE', format: 'IMAGE' as const, duration: null, text: 'Organizar o dinheiro não precisa ter mensalidade: R$ 29,90, uma vez.' }
];

const MECHANISMS = [
  { code: 'M1', text: 'Disponível do mês: saber quanto ainda pode gastar', claim: 'BB-CL-02', scene: 'O app registra um gasto e o card "Disponível" atualiza.' },
  { code: 'M2', text: 'Onde o dinheiro vai: categorias que mostram os maiores gastos', claim: 'BB-CL-03', scene: 'A tela "Onde você mais gastou" mostra as barras por categoria.' }
];

const CTAS = [
  { code: 'C1', text: 'Toque em Saiba mais e comece hoje.' },
  { code: 'C2', text: 'Veja como funciona na página.' }
];

const TEXTS: Record<string, { primary: string; headline: string }> = {
  'M1-C1': {
    primary: 'Organize seu dinheiro de forma simples: registre entradas e saídas em poucos toques e veja na hora quanto ainda está disponível no mês. App + planilha + guia por R$ 29,90, pagamento único. Toque em Saiba mais e comece hoje.',
    headline: 'Veja quanto ainda está disponível no mês'
  },
  'M1-C2': {
    primary: 'Registre entradas e saídas em poucos toques e acompanhe o disponível do mês pelo celular. App + Planilha 2026 + Guia PDF, R$ 29,90 sem mensalidade. Veja como funciona na página.',
    headline: 'O mês com clareza, pelo celular'
  },
  'M2-C1': {
    primary: 'Tenha clareza de pra onde o dinheiro está indo: o app separa os gastos por categoria e mostra onde mais se gastou. R$ 29,90, uma vez. Toque em Saiba mais e comece hoje.',
    headline: 'Veja pra onde o dinheiro vai'
  },
  'M2-C2': {
    primary: 'Categorias simples e gráficos que mostram os maiores gastos do mês. App + planilha + guia prático por R$ 29,90, sem mensalidade. Veja como funciona na página.',
    headline: 'Os maiores gastos do mês, num gráfico'
  }
};

function buildBbCreatives(): BatchCreative[] {
  const out: BatchCreative[] = [];
  for (const h of HOOKS) {
    for (const m of MECHANISMS) {
      for (const c of CTAS) {
        const texts = TEXTS[`${m.code}-${c.code}`];
        const claimCodes = ['BB-CL-01', m.claim, 'BB-CL-05', 'BB-CL-06'];
        if (h.code === 'H04') claimCodes.push('BB-CL-04');
        out.push({
          key: `BB-B01-${h.code}-${m.code}-${c.code}`,
          hookCode: h.code,
          hookFamily: h.family,
          hook: h.text,
          mechanismCode: m.code,
          mechanism: m.text,
          ctaCode: c.code,
          cta: c.text,
          format: h.format,
          durationSeconds: h.duration,
          script: [
            `Abertura: "${h.text}"`,
            `Mecanismo (${m.code}): ${m.scene}`,
            'Fechamento: "Método Bolso Blindado: app + planilha + guia. R$ 29,90, uma vez."',
            `CTA (${c.code}): "${c.text}"`,
            'Rodapé: "Valores ilustrativos."'
          ].join('\n'),
          primaryText: texts.primary,
          headline: texts.headline,
          claimCodes
        });
      }
    }
  }
  return out;
}

// Round 1 files live on branch ai/assets-bb-b01 (public raw URLs, also used for the Meta upload).
// Keep that branch while these links are in use.
const BB_ASSETS_BASE =
  'https://raw.githubusercontent.com/rdmconsultoria2022-cell/norqva-intelligence/ai/assets-bb-b01/norqva-ai/creative-batches/BB-B01-assets';

const BB_PRODUCED_ASSETS: Record<string, string> = {
  'BB-B01-H01-M1-C1': `${BB_ASSETS_BASE}/BB-B01-H01-M1-C1.mp4`,
  'BB-B01-H03-M1-C1': `${BB_ASSETS_BASE}/BB-B01-H03-M1-C1.mp4`,
  'BB-B01-H04-M1-C1': `${BB_ASSETS_BASE}/BB-B01-H04-M1-C1.mp4`,
  'BB-B01-H05-M1-C1': `${BB_ASSETS_BASE}/BB-B01-H05-M1-C1_4x5.png`,
  'BB-B01-H05-M2-C1': `${BB_ASSETS_BASE}/BB-B01-H05-M2-C1_4x5.png`
};

export const CREATIVE_BATCHES: Record<string, CreativeBatch> = {
  'BB-B01': {
    code: 'BB-B01',
    productId: 'c0000000-0000-4000-8000-000000000001',
    offerId: 'd0000000-0000-4000-8000-000000000001',
    offerHumanId: 'OFF-BOLSO-BLINDADO-2990',
    description: 'Método Bolso Blindado — 5 hooks × 2 mecanismos × 2 CTAs',
    claims: BB_CLAIMS,
    creatives: buildBbCreatives(),
    producedAssets: BB_PRODUCED_ASSETS
  }
};
