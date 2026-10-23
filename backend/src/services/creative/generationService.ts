// NORQVA-0116 (D-0116): Geração a partir de uma referência (etapa 2).
// De uma referência PRONTA (só o esqueleto, D-0115) + um produto NOSSO (+ a oferta), o NORQVA escreve:
//   (a) uma página de venda original seguindo o esqueleto da página;
//   (b) de 3 a 5 anúncios seguindo o esqueleto do anúncio, gravados na fábrica de criativos (aprovação pelo fluxo dela).
// Todo o conteúdo é nosso: a IA recebe só o esqueleto e os FATOS do nosso produto (banco). Cada texto passa pela
// checagem anticópia (janelas de 6 palavras com o mesmo hash da etapa 1), por números que não vêm dos nossos fatos,
// por promessas de saúde não aprovadas e, no anúncio, por preço. Falhou: gera de novo aquela parte (até 2 vezes);
// continuou falhando: bloqueia com aviso na tela. Nada aqui fala com a Meta.
import crypto from 'crypto';
import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';
import {
  shingleHashes,
  normalizeWords,
  SectionRole,
  ROLE_PURPOSE,
  BEAT_ROLES,
  BEAT_PURPOSE,
  ReferenceStructure,
  ReferenceAiClient,
  referencesEnabled
} from './referenceService';
import { findPriceInText } from './priceInCopy';
import { CreativeFactoryService, CreativeFactoryError, computeContentHash } from './creativeFactoryService';
import {
  kieConfigured,
  generateKieImage,
  imageStorage,
  imagesBucket,
  productImages,
  imageStyle,
  resolveImageUrl,
  KIE_MISSING_MESSAGE,
  MAX_NEW_IMAGES,
  STORAGE_PREFIX
} from './generatedImages';

export { referencesEnabled };

export class GenerationError extends Error {
  constructor(public status: number, message: string, public issues?: FieldIssue[]) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------
// Checagem: cópia, números, promessas de saúde e preço
// ---------------------------------------------------------------------------------------------

export type IssueCode = 'COPY' | 'DIGIT' | 'HEALTH' | 'PRICE' | 'EMPTY';
export interface FieldIssue {
  code: IssueCode;
  detail: string;
}

export const ISSUE_LABEL: Record<IssueCode, string> = {
  COPY: 'Parecido com a referência (6 palavras seguidas iguais)',
  DIGIT: 'Número que não vem dos dados do produto',
  HEALTH: 'Promessa de saúde ou resultado não aprovada',
  PRICE: 'Preço no anúncio',
  EMPTY: 'Texto vazio'
};

export interface CheckContext {
  /** Impressões de 6 palavras da referência (source_shingles da etapa 1). */
  shingles: Set<string>;
  /** Números que aparecem nos nossos fatos (preço, parcelas, títulos, promessas aprovadas...). */
  allowedDigits: Set<string>;
  /** Textos das promessas aprovadas (VERIFIED). */
  approvedClaims: string[];
  /** Anúncio: preço é proibido. */
  ad: boolean;
}

const HEALTH_PATTERNS: RegExp[] = [
  /\bperc(?:a|er|am|e)\s+(?:at[eé]\s+)?\d[\d.,]*\s*(?:kg|quilos?)\b/i,
  /\bemagre[cç](?:a|er|am|e)\s+(?:at[eé]\s+)?\d/i,
  /\bgarantid[oa]s?\b/i,
  /\bcura[mrs]?\b/i,
  /\bsem\s+esfor[cç]os?\b/i
];

const normPhrase = (s: string) => ` ${normalizeWords(s).join(' ')} `;

/** Problemas de UM texto. Vazio = pode seguir. */
export function checkText(text: string, ctx: CheckContext): FieldIssue[] {
  const s = String(text || '').trim();
  if (!s) return [];
  const issues: FieldIssue[] = [];
  if (shingleHashes(s).some(h => ctx.shingles.has(h))) issues.push({ code: 'COPY', detail: ISSUE_LABEL.COPY });
  const digits = s.match(/\d+/g) || [];
  const bad = digits.filter(d => !ctx.allowedDigits.has(d.replace(/^0+(?=\d)/, '')));
  if (bad.length) issues.push({ code: 'DIGIT', detail: `${ISSUE_LABEL.DIGIT}: ${Array.from(new Set(bad)).slice(0, 5).join(', ')}` });
  const claims = ctx.approvedClaims.map(normPhrase);
  for (const re of HEALTH_PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    const phrase = normPhrase(m[0]);
    if (phrase.trim() && claims.some(c => c.includes(phrase))) continue;
    issues.push({ code: 'HEALTH', detail: `${ISSUE_LABEL.HEALTH}: "${m[0].trim()}"` });
    break;
  }
  if (ctx.ad) {
    const p = findPriceInText(s);
    if (p) issues.push({ code: 'PRICE', detail: `${ISSUE_LABEL.PRICE}: "${p.match}" (${p.label})` });
  }
  return issues;
}

export function digitsOf(lines: string[]): Set<string> {
  const out = new Set<string>();
  for (const l of lines) for (const d of String(l || '').match(/\d+/g) || []) out.add(d.replace(/^0+(?=\d)/, ''));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Fatos do NOSSO produto (só do banco)
// ---------------------------------------------------------------------------------------------

export interface ApprovedClaim {
  id: string;
  human_id: string;
  text: string;
  type: string;
}

export interface ProductFacts {
  product: { id: string; name: string; description: string; category: string; collection_key: string | null };
  offer: {
    id: string;
    human_id: string;
    name: string;
    description: string;
    bonus: string | null;
    status: string;
    price: number;
    cardEnabled: boolean;
    cardMax: number;
    cardFree: number;
  };
  deliveryTitles: string[];
  claims: ApprovedClaim[];
}

export const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

/** Linhas de fatos dadas à IA. Página: com preço e parcelas. Anúncio: sem preço nem parcelas (D-0053). */
export function factLines(f: ProductFacts, forAd: boolean, withGuarantee = false): string[] {
  const lines = [`Produto: ${f.product.name}`, `Categoria: ${f.product.category}`, `Descrição do produto: ${f.product.description}`];
  if (f.offer.description && f.offer.description.trim() && f.offer.description.trim() !== f.product.description.trim()) {
    lines.push(`Descrição da oferta: ${f.offer.description}`);
  }
  if (f.deliveryTitles.length) lines.push(`O que a pessoa recebe (arquivos entregues): ${f.deliveryTitles.join('; ')}`);
  lines.push('Entrega: digital, com o acesso enviado por e-mail depois do pagamento confirmado.');
  if (f.offer.bonus && f.offer.bonus.trim()) lines.push(`Bônus da oferta: ${f.offer.bonus.trim()}`);
  if (!forAd) {
    lines.push(`Preço: ${brl(f.offer.price)} (Pix ou cartão)`);
    if (f.offer.cardEnabled && f.offer.cardMax > 1) {
      lines.push(`Cartão de crédito: até ${f.offer.cardMax}x`);
      if (f.offer.cardFree > 1) lines.push(`Sem juros: até ${f.offer.cardFree}x de ${brl(Math.round((f.offer.price / f.offer.cardFree) * 100) / 100)}`);
    }
    if (withGuarantee) lines.push('Direito de arrependimento: 7 dias depois da compra pela internet (Código de Defesa do Consumidor).');
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Plano (esqueleto seguido) da página e do anúncio
// ---------------------------------------------------------------------------------------------

export interface PlanItem {
  ref_order: number | null;
  role: SectionRole;
  purpose: string;
  headline_style: string;
  approx_words: number;
  has_image: boolean;
  cta: boolean;
  replaced_from: SectionRole | null;
}

const DEFAULT_PAGE: Array<[SectionRole, boolean, boolean, number]> = [
  ['HERO_HOOK', true, true, 60],
  ['PAIN', false, false, 80],
  ['PRODUCT_REVEAL', true, false, 80],
  ['BENEFITS', false, false, 80],
  ['CONTENTS', true, false, 80],
  ['OFFER_PRICE', false, true, 50],
  ['FAQ', false, false, 120],
  ['CTA', false, true, 25]
];

const PROOF_TYPES = ['TESTIMONIAL', 'SOCIAL_PROOF', 'RESULT'];
export const MAX_PAGE_SECTIONS = 16;

/** Esqueleto da página a seguir. Seções que pediriam prova, depoimento, autoridade ou urgência que não temos viram prévia do conteúdo ou saem. */
export function buildPagePlan(structure: ReferenceStructure | null, f: ProductFacts): { plan: PlanItem[]; notes: string[]; usesGuarantee: boolean } {
  const notes: string[] = [];
  const has = (types: string[]) => f.claims.some(c => types.includes(c.type));
  let base: PlanItem[];
  if (structure && structure.kind === 'SALES_PAGE') {
    base = structure.sections.map(s => ({
      ref_order: s.order,
      role: s.role,
      purpose: s.purpose || ROLE_PURPOSE[s.role],
      headline_style: s.headline_style,
      approx_words: s.approx_words,
      has_image: s.has_image,
      cta: s.cta_count > 0,
      replaced_from: null
    }));
  } else {
    notes.push('A referência é um anúncio: a página segue o modelo padrão do NORQVA.');
    base = DEFAULT_PAGE.map(([role, img, cta, words]) => ({
      ref_order: null, role, purpose: ROLE_PURPOSE[role], headline_style: 'STATEMENT', approx_words: words, has_image: img, cta, replaced_from: null
    }));
  }
  const plan: PlanItem[] = [];
  for (const item of base) {
    if (item.role === 'TESTIMONIALS' || item.role === 'PROOF_RESULTS') {
      if (has(PROOF_TYPES)) {
        plan.push(item);
      } else if (f.deliveryTitles.length) {
        plan.push({ ...item, role: 'CONTENTS', purpose: 'Prévia honesta do conteúdo (no lugar de depoimentos, que não temos aprovados)', replaced_from: item.role });
        notes.push('Seção de depoimentos/provas virou uma prévia do conteúdo: não há depoimentos ou resultados aprovados.');
      } else {
        notes.push('Seção de depoimentos/provas ficou de fora: não há depoimentos ou resultados aprovados.');
      }
      continue;
    }
    if (item.role === 'AUTHORITY' && !has(['AUTHORITY'])) {
      notes.push('Seção "quem está por trás" ficou de fora: não há informação aprovada de autoria.');
      continue;
    }
    if (item.role === 'URGENCY' && !has(['SCARCITY'])) {
      notes.push('Seção de urgência ficou de fora: nada de urgência inventada.');
      continue;
    }
    if (item.role === 'BONUS' && !(f.offer.bonus && f.offer.bonus.trim())) {
      notes.push('Seção de bônus ficou de fora: a oferta não tem bônus.');
      continue;
    }
    plan.push(item);
  }
  const trimmed = plan.slice(0, MAX_PAGE_SECTIONS);
  if (!trimmed.length) trimmed.push({ ref_order: null, role: 'HERO_HOOK', purpose: ROLE_PURPOSE.HERO_HOOK, headline_style: 'STATEMENT', approx_words: 60, has_image: true, cta: true, replaced_from: null });
  if (!trimmed.some(p => p.cta)) {
    trimmed.push({ ref_order: null, role: 'CTA', purpose: ROLE_PURPOSE.CTA, headline_style: 'STATEMENT', approx_words: 25, has_image: false, cta: true, replaced_from: null });
  }
  return { plan: trimmed, notes, usesGuarantee: trimmed.some(p => p.role === 'GUARANTEE') };
}

export interface AdPlan {
  hook_type: string;
  angle: string;
  format: 'VIDEO' | 'IMAGE' | 'CAROUSEL';
  duration_s: number | null;
  beats: Array<{ role: string; purpose: string }>;
  cta_style: string;
  fromReference: boolean;
}

export function buildAdPlan(structure: ReferenceStructure | null): AdPlan {
  if (structure && structure.kind === 'AD') {
    return {
      hook_type: structure.hook_type,
      angle: structure.angle,
      format: structure.format,
      duration_s: structure.duration_s,
      beats: structure.structure_beats.map(b => ({ role: b.role, purpose: b.purpose || BEAT_PURPOSE[b.role] })),
      cta_style: structure.cta_style,
      fromReference: true
    };
  }
  const first = structure && structure.kind === 'SALES_PAGE' ? structure.sections[0] : null;
  const hs = first?.headline_style;
  const hook = hs === 'QUESTION' ? 'QUESTION' : hs === 'CURIOSITY' ? 'CURIOSITY' : hs === 'BOLD_PROMISE' ? 'BOLD_CLAIM' : 'PAIN_POINT';
  return {
    hook_type: hook,
    angle: 'Mesmo ângulo da abertura da página',
    format: 'IMAGE',
    duration_s: null,
    beats: (['HOOK', 'PROBLEM', 'BENEFIT', 'CTA'] as const).map(r => ({ role: r, purpose: BEAT_PURPOSE[r] })),
    cta_style: 'Chamada curta para conhecer',
    fromReference: false
  };
}

// ---------------------------------------------------------------------------------------------
// IA (OpenAI, mesmo cliente e variáveis da etapa 1)
// ---------------------------------------------------------------------------------------------

let testAi: ReferenceAiClient | null = null;
/** Só para testes: IA simulada (os testes nunca falam com a OpenAI). */
export function setGenerationAiForTests(ai: ReferenceAiClient | null) {
  testAi = ai;
}

export function generationAiConfigured(): boolean {
  if (testAi) return true;
  if (process.env.NODE_ENV === 'test') return false;
  return !!(process.env.OPENAI_API_KEY || '').trim();
}

const openAiClient: ReferenceAiClient = async (messages, schema) => {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  const model = process.env.CREATIVE_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_completion_tokens: 8000,
        messages,
        response_format: { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } }
      }),
      signal: controller.signal
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : null;
  } finally {
    clearTimeout(timer);
  }
};

function ai(): ReferenceAiClient {
  if (testAi) return testAi;
  if (process.env.NODE_ENV === 'test') {
    return async () => {
      throw new Error('Teste sem IA simulada.');
    };
  }
  return openAiClient;
}

function parseJson(content: string | null): any {
  if (!content) return null;
  const clean = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

async function askAi(messages: any[], schema: { name: string; schema: any }): Promise<any> {
  try {
    return parseJson(await ai()(messages, schema));
  } catch (err: any) {
    console.error('[geração] IA falhou:', err?.message || err);
    return null;
  }
}

const obj = (properties: Record<string, any>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const str = { type: 'string' };
const strList = { type: 'array', items: { type: 'string' } };

const sectionProps = { headline: str, body: str, bullets: strList, cta_label: str, image_prompt: str };
export const pageSchema = () => ({ name: 'generated_sales_page', schema: obj({ sections: { type: 'array', items: obj(sectionProps) } }) });
export const sectionSchema = () => ({ name: 'generated_section', schema: obj(sectionProps) });

const adProps = {
  hook: str,
  beats: { type: 'array', items: obj({ role: { type: 'string', enum: [...BEAT_ROLES] }, text: str }) },
  primary_text: str,
  headline: str,
  description: str,
  cta: str,
  claim_ids: strList
};
export const adsSchema = () => ({ name: 'generated_ads', schema: obj({ variants: { type: 'array', items: obj(adProps) } }) });

export const GENERATION_SYSTEM_PROMPT = [
  'Você escreve páginas de venda e anúncios em português do Brasil para a NORQVA. Tudo precisa ser 100% ORIGINAL.',
  'Você recebe (1) um ESQUELETO, que diz só a função e o tamanho de cada parte (veio da análise de outra página), e (2) os FATOS do nosso produto.',
  'Regras obrigatórias:',
  '- escreva com as suas palavras, em linguagem simples, direta e honesta, sem exagero;',
  '- use SOMENTE os fatos fornecidos; não invente nada sobre o produto, a entrega ou a oferta;',
  '- não escreva números, preços, porcentagens, prazos ou quantidades que não estejam nos fatos;',
  '- não invente depoimentos, nomes de clientes, avaliações, resultados, estatísticas, prêmios ou autoridade;',
  '- promessa de resultado ou de saúde só se estiver nas PROMESSAS APROVADAS, com as mesmas palavras;',
  '- nunca use "garantido", "cura", "sem esforço", "perca X kg" ou "emagreça X";',
  '- não crie urgência ou escassez que não esteja nos fatos;',
  '- não cite marcas, pessoas, empresas ou produtos de terceiros.',
  'Responda somente com o JSON do esquema.'
].join('\n');

const claimsForPrompt = (f: ProductFacts) => f.claims.map((c, i) => ({ codigo: `C${i + 1}`, tipo: c.type, texto: c.text }));

function planForPrompt(p: PlanItem, i: number) {
  return {
    item: i + 1,
    papel: p.role,
    funcao: p.purpose,
    estilo_do_titulo: p.headline_style,
    palavras_aproximadas: Math.max(15, Math.min(400, p.approx_words || 60)),
    tem_imagem: p.has_image,
    tem_botao: p.cta
  };
}

const PAGE_RULES = [
  'Escreva a página seguindo o esqueleto: uma seção para cada item, na MESMA ordem e quantidade.',
  'headline: título da seção (pode ficar vazio quando o item não pede título). body: texto da seção (parágrafos separados por linha em branco).',
  'bullets: lista curta quando ajudar (ou vazia). cta_label: texto curto do botão quando tem_botao = true; senão vazio.',
  'image_prompt: quando tem_imagem = true, descreva em poucas palavras uma foto do NOSSO produto para esta seção (sem texto, marca ou pessoas na foto); senão vazio.',
  'Na seção OFFER_PRICE use o preço e as parcelas exatamente como nos fatos.'
].join('\n');

const ISSUE_FEEDBACK: Record<IssueCode, string> = {
  COPY: 'a versão anterior repetiu frases de outra página: escreva tudo de novo com palavras bem diferentes',
  DIGIT: 'a versão anterior tinha números que não estão nos fatos: não use números fora dos fatos',
  HEALTH: 'a versão anterior tinha promessa de saúde/resultado não aprovada: tire a promessa',
  PRICE: 'a versão anterior tinha preço no anúncio: anúncio nunca fala de preço, valor, parcelas ou desconto',
  EMPTY: 'a versão anterior veio vazia: escreva o texto'
};

const feedbackText = (codes: IssueCode[]) =>
  codes.length ? `\nAtenção: ${Array.from(new Set(codes)).map(c => ISSUE_FEEDBACK[c]).join('; ')}.` : '';

export function pageMessages(plan: PlanItem[], f: ProductFacts, usesGuarantee: boolean) {
  return [
    { role: 'system', content: `${GENERATION_SYSTEM_PROMPT}\n${PAGE_RULES}` },
    {
      role: 'user',
      content: JSON.stringify({
        esqueleto: plan.map(planForPrompt),
        fatos: factLines(f, false, usesGuarantee),
        promessas_aprovadas: claimsForPrompt(f)
      })
    }
  ];
}

export function sectionMessages(item: PlanItem, index: number, f: ProductFacts, usesGuarantee: boolean, codes: IssueCode[]) {
  return [
    { role: 'system', content: `${GENERATION_SYSTEM_PROMPT}\n${PAGE_RULES}\nAgora escreva só UMA seção (o item pedido).${feedbackText(codes)}` },
    {
      role: 'user',
      content: JSON.stringify({ item: planForPrompt(item, index), fatos: factLines(f, false, usesGuarantee), promessas_aprovadas: claimsForPrompt(f) })
    }
  ];
}

const AD_RULES = [
  'Escreva variações de anúncio para a Meta seguindo o esqueleto do anúncio (tipo de gancho, ângulo, formato e trechos na ordem).',
  'NUNCA ponha preço, valor, parcelas, desconto, cupom ou a palavra "preço" no anúncio: o preço aparece só na página.',
  'hook: frase de abertura. beats: um texto curto para cada trecho do esqueleto, na ordem. primary_text: texto principal (até 600 caracteres).',
  'headline: título curto (até 60 caracteres). description: descrição curta (até 90 caracteres). cta: chamada curta do botão (ex.: "Saiba mais").',
  'claim_ids: códigos das promessas aprovadas (C1, C2...) que o anúncio usa; vazio se não usar nenhuma.',
  'Cada variação deve ter um gancho e um ângulo diferentes das outras.'
].join('\n');

function adPlanForPrompt(p: AdPlan) {
  return {
    tipo_de_gancho: p.hook_type,
    angulo: p.angle,
    formato: p.format,
    duracao_segundos: p.duration_s,
    trechos: p.beats.map((b, i) => ({ ordem: i + 1, papel: b.role, funcao: b.purpose })),
    estilo_da_chamada: p.cta_style
  };
}

export function adsMessages(p: AdPlan, f: ProductFacts, count: number, codes: IssueCode[] = []) {
  return [
    { role: 'system', content: `${GENERATION_SYSTEM_PROMPT}\n${AD_RULES}\nEscreva ${count} variação(ões).${feedbackText(codes)}` },
    {
      role: 'user',
      content: JSON.stringify({ esqueleto_do_anuncio: adPlanForPrompt(p), fatos: factLines(f, true), promessas_aprovadas: claimsForPrompt(f) })
    }
  ];
}

// ---------------------------------------------------------------------------------------------
// Validação do JSON da IA
// ---------------------------------------------------------------------------------------------

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '');
const cleanList = (v: unknown, maxItems: number, max: number) =>
  Array.isArray(v) ? v.map(x => clean(x, max)).filter(Boolean).slice(0, maxItems) : [];

export interface WrittenSection {
  headline: string;
  body: string;
  bullets: string[];
  cta_label: string;
  image_prompt: string;
}

export const LIMITS = { headline: 160, body: 2500, bullet: 200, bullets: 8, cta: 60, imagePrompt: 400, hook: 200, primary: 1500, adHeadline: 100, description: 150, beat: 300 };

export function validateSection(raw: any): WrittenSection | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    headline: clean(raw.headline, LIMITS.headline),
    body: clean(raw.body, LIMITS.body),
    bullets: cleanList(raw.bullets, LIMITS.bullets, LIMITS.bullet),
    cta_label: clean(raw.cta_label, LIMITS.cta),
    image_prompt: clean(raw.image_prompt, LIMITS.imagePrompt)
  };
}

/** Confere o JSON da página: precisa ter a lista de seções; cada uma é limpa e cortada. Sem nenhuma seção = inválido. */
export function validateGeneratedPage(raw: any): WrittenSection[] | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sections)) return null;
  const out = raw.sections.slice(0, MAX_PAGE_SECTIONS).map(validateSection).filter((s: WrittenSection | null): s is WrittenSection => !!s);
  return out.length ? out : null;
}

export interface WrittenAd {
  hook: string;
  beats: Array<{ role: string; text: string }>;
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
  claim_ids: string[];
}

export function validateAd(raw: any): WrittenAd | null {
  if (!raw || typeof raw !== 'object') return null;
  const beats = Array.isArray(raw.beats)
    ? raw.beats
        .filter((b: any) => b && typeof b === 'object')
        .slice(0, 20)
        .map((b: any) => ({ role: (BEAT_ROLES as readonly string[]).includes(String(b.role)) ? String(b.role) : 'OTHER', text: clean(b.text, LIMITS.beat) }))
        .filter((b: { text: string }) => b.text)
    : [];
  return {
    hook: clean(raw.hook, LIMITS.hook),
    beats,
    primary_text: clean(raw.primary_text, LIMITS.primary),
    headline: clean(raw.headline, LIMITS.adHeadline),
    description: clean(raw.description, LIMITS.description),
    cta: clean(raw.cta, LIMITS.cta),
    claim_ids: cleanList(raw.claim_ids, 10, 10)
  };
}

export function validateAdVariants(raw: any): WrittenAd[] | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.variants)) return null;
  const out = raw.variants.slice(0, 5).map(validateAd).filter((a: WrittenAd | null): a is WrittenAd => !!a);
  return out.length ? out : null;
}

// ---------------------------------------------------------------------------------------------
// Checagem por campo
// ---------------------------------------------------------------------------------------------

export interface FieldCheck {
  ok: boolean;
  issues: FieldIssue[];
}

export interface GeneratedSection {
  order: number;
  ref_order: number | null;
  role: SectionRole;
  replaced_from: SectionRole | null;
  headline: string;
  body: string;
  bullets: string[];
  cta_label: string;
  image_url: string | null;
  /** NONE = sem imagem; PRODUCT = imagem que o produto já tem; PENDING/READY/FAILED = imagem nova na KIE. */
  image_status: 'NONE' | 'PRODUCT' | 'PENDING' | 'READY' | 'FAILED';
  image_prompt: string;
  image_started_at: string | null;
  image_error: string | null;
  /** Campos esvaziados porque continuaram parecidos com a referência depois de gerar de novo. */
  removed_fields: string[];
  retries: number;
}

export const SECTION_FIELDS = ['headline', 'body', 'bullets', 'cta_label'] as const;
type SectionField = (typeof SECTION_FIELDS)[number];

function sectionFieldTexts(s: Pick<GeneratedSection, SectionField>): Record<SectionField, string[]> {
  return { headline: [s.headline], body: [s.body], bullets: s.bullets, cta_label: [s.cta_label] };
}

/** Problemas por campo de uma seção (sem contar o que foi removido). */
export function sectionIssues(s: Pick<GeneratedSection, SectionField> & { removed_fields?: string[] }, ctx: CheckContext, needsCta = false): Record<string, FieldIssue[]> {
  const out: Record<string, FieldIssue[]> = {};
  const texts = sectionFieldTexts(s);
  for (const field of SECTION_FIELDS) {
    const list: FieldIssue[] = [];
    for (const t of texts[field]) for (const i of checkText(t, ctx)) if (!list.some(x => x.code === i.code)) list.push(i);
    if ((s.removed_fields || []).includes(field) && !texts[field].some(t => t.trim())) {
      list.push({ code: 'COPY', detail: 'Texto removido: continuou parecido com a referência. Escreva de novo ou gere de novo.' });
    }
    out[field] = list;
  }
  if (!s.headline.trim() && !s.body.trim() && !s.bullets.length && !s.cta_label.trim() && !(s.removed_fields || []).length) out.body.push({ code: 'EMPTY', detail: ISSUE_LABEL.EMPTY });
  if (needsCta && !s.cta_label.trim() && !(s.removed_fields || []).includes('cta_label')) out.cta_label.push({ code: 'EMPTY', detail: 'Botão sem texto' });
  return out;
}

export function pageCopyCheck(sections: GeneratedSection[], ctx: CheckContext, plan: Array<{ cta: boolean }> | null = null) {
  const fields: Record<string, FieldCheck> = {};
  let blocked = 0;
  sections.forEach((s, i) => {
    const issues = sectionIssues(s, ctx, plan ? !!plan[i]?.cta : !!s.cta_label || (s.removed_fields || []).includes('cta_label'));
    for (const f of SECTION_FIELDS) {
      const list = issues[f];
      fields[`${s.order}.${f}`] = { ok: list.length === 0, issues: list };
      if (list.length) blocked++;
    }
  });
  return { fields, blocked_count: blocked };
}

export const AD_FIELDS = ['hook', 'primary_text', 'headline', 'description', 'cta', 'script'] as const;
type AdField = (typeof AD_FIELDS)[number];

const BEAT_PT: Record<string, string> = {
  HOOK: 'Gancho', PROBLEM: 'Problema', DEMONSTRATION: 'Demonstração', BENEFIT: 'Benefício', PROOF: 'Prova', OFFER: 'Oferta', CTA: 'Chamada', OTHER: 'Trecho'
};

/** Roteiro do anúncio: um trecho por linha, na ordem do esqueleto. */
export const scriptOf = (beats: Array<{ role: string; text: string }>) => beats.map(b => `${BEAT_PT[b.role] || BEAT_PT.OTHER}: ${b.text}`).join('\n');

export function adIssues(a: Record<AdField, string>, ctx: CheckContext, removed: string[] = []): Record<string, FieldIssue[]> {
  const out: Record<string, FieldIssue[]> = {};
  for (const f of AD_FIELDS) {
    const list = checkText(a[f] || '', ctx);
    if (removed.includes(f) && !String(a[f] || '').trim()) list.push({ code: 'COPY', detail: 'Texto removido: continuou parecido com a referência. Escreva de novo ou gere de novo.' });
    else if ((f === 'hook' || f === 'primary_text' || f === 'cta') && !String(a[f] || '').trim()) list.push({ code: 'EMPTY', detail: ISSUE_LABEL.EMPTY });
    out[f] = list;
  }
  return out;
}

export function adCopyCheck(a: Record<AdField, string>, ctx: CheckContext, removed: string[] = [], retries = 0) {
  const issues = adIssues(a, ctx, removed);
  const fields: Record<string, FieldCheck> = {};
  let blocked = false;
  for (const f of AD_FIELDS) {
    fields[f] = { ok: issues[f].length === 0, issues: issues[f] };
    if (issues[f].length) blocked = true;
  }
  return { checked_at: new Date().toISOString(), fields, blocked, removed_fields: removed, retries };
}

const hasIssues = (m: Record<string, FieldIssue[]>) => Object.values(m).some(l => l.length > 0);
const codesOf = (m: Record<string, FieldIssue[]>) => Object.values(m).flatMap(l => l.map(i => i.code));

export const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------------------------
// Escrita com novas tentativas
// ---------------------------------------------------------------------------------------------

function emptySection(item: PlanItem, order: number): GeneratedSection {
  return {
    order,
    ref_order: item.ref_order,
    role: item.role,
    replaced_from: item.replaced_from,
    headline: '',
    body: '',
    bullets: [],
    cta_label: '',
    image_url: null,
    image_status: 'NONE',
    image_prompt: '',
    image_started_at: null,
    image_error: null,
    removed_fields: [],
    retries: 0
  };
}

function applyWritten(s: GeneratedSection, w: WrittenSection | null, item: PlanItem): GeneratedSection {
  if (!w) return s;
  return { ...s, headline: w.headline, body: w.body, bullets: w.bullets, cta_label: item.cta ? w.cta_label : '', image_prompt: w.image_prompt };
}

/** Esvazia o que continuou parecido com a referência (nada copiado é gravado). */
function removeCopied(s: GeneratedSection, issues: Record<string, FieldIssue[]>): GeneratedSection {
  const out = { ...s, removed_fields: [...s.removed_fields] };
  for (const f of SECTION_FIELDS) {
    if (!issues[f].some(i => i.code === 'COPY')) continue;
    if (f === 'bullets') out.bullets = [];
    else (out as any)[f] = '';
    if (!out.removed_fields.includes(f)) out.removed_fields.push(f);
  }
  return out;
}

/** Escreve (ou reescreve) uma seção até passar na checagem ou acabar as tentativas. */
async function writeSectionWithRetries(
  start: GeneratedSection,
  item: PlanItem,
  index: number,
  f: ProductFacts,
  ctx: CheckContext,
  usesGuarantee: boolean,
  forceFirst: boolean
): Promise<GeneratedSection> {
  let s = start;
  let issues = sectionIssues(s, ctx, item.cta);
  let attempts = 0;
  while ((forceFirst && attempts === 0) || (hasIssues(issues) && attempts < MAX_RETRIES)) {
    const codes = codesOf(issues);
    const raw = await askAi(sectionMessages(item, index, f, usesGuarantee, forceFirst && attempts === 0 ? [] : codes), sectionSchema());
    attempts++;
    const w = validateSection(raw);
    if (w) s = applyWritten({ ...s, removed_fields: [] }, w, item);
    issues = sectionIssues(s, ctx, item.cta);
    if (forceFirst && attempts === 1 && !hasIssues(issues)) break;
  }
  s = { ...s, retries: s.retries + attempts };
  return hasIssues(issues) ? removeCopied(s, issues) : s;
}

export async function writePage(plan: PlanItem[], f: ProductFacts, ctx: CheckContext, usesGuarantee: boolean): Promise<GeneratedSection[]> {
  const raw = await askAi(pageMessages(plan, f, usesGuarantee), pageSchema());
  const written = validateGeneratedPage(raw);
  if (!written) throw new GenerationError(502, 'A IA não devolveu uma página válida. Tente de novo.');
  const out: GeneratedSection[] = [];
  for (let i = 0; i < plan.length; i++) {
    const s = applyWritten(emptySection(plan[i], i + 1), written[i] || null, plan[i]);
    out.push(await writeSectionWithRetries(s, plan[i], i, f, ctx, usesGuarantee, false));
  }
  return out;
}

export interface GeneratedAd extends WrittenAd {
  removed_fields: string[];
  retries: number;
}

const adFields = (a: WrittenAd): Record<AdField, string> => ({
  hook: a.hook,
  primary_text: a.primary_text,
  headline: a.headline,
  description: a.description,
  cta: a.cta,
  script: scriptOf(a.beats)
});

function removeCopiedAd(a: GeneratedAd, issues: Record<string, FieldIssue[]>): GeneratedAd {
  const out: GeneratedAd = { ...a, removed_fields: [...a.removed_fields] };
  for (const f of AD_FIELDS) {
    if (!issues[f].some(i => i.code === 'COPY')) continue;
    if (f === 'script') out.beats = [];
    else (out as any)[f] = '';
    if (!out.removed_fields.includes(f)) out.removed_fields.push(f);
  }
  return out;
}

async function writeOneAdWithRetries(start: WrittenAd | null, p: AdPlan, f: ProductFacts, ctx: CheckContext): Promise<GeneratedAd | null> {
  let a: WrittenAd | null = start;
  let issues = a ? adIssues(adFields(a), ctx) : null;
  let attempts = 0;
  while ((!a || (issues && hasIssues(issues))) && attempts < MAX_RETRIES) {
    const raw = await askAi(adsMessages(p, f, 1, issues ? codesOf(issues) : ['EMPTY']), adsSchema());
    attempts++;
    const v = validateAdVariants(raw);
    if (v && v[0]) {
      a = v[0];
      issues = adIssues(adFields(a), ctx);
    }
  }
  if (!a || !issues) return null;
  const g: GeneratedAd = { ...a, removed_fields: [], retries: attempts };
  return hasIssues(issues) ? removeCopiedAd(g, issues) : g;
}

export async function writeAds(p: AdPlan, f: ProductFacts, ctx: CheckContext, count: number): Promise<GeneratedAd[]> {
  const raw = await askAi(adsMessages(p, f, count), adsSchema());
  const variants = validateAdVariants(raw) || [];
  const out: GeneratedAd[] = [];
  for (let i = 0; i < count; i++) {
    const g = await writeOneAdWithRetries(variants[i] || null, p, f, ctx);
    if (g) out.push(g);
  }
  if (!out.length) throw new GenerationError(502, 'A IA não devolveu anúncios válidos. Tente de novo.');
  return out;
}

// ---------------------------------------------------------------------------------------------
// Serviço (banco)
// ---------------------------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_IMAGE_MS = 15 * 60 * 1000;
export const AD_COUNT_MIN = 3;
export const AD_COUNT_MAX = 5;

const parseJsonCol = (v: any, fallback: any) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};

export function slugify(name: string): string {
  const base = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `${base || 'pagina'}-${crypto.randomBytes(3).toString('hex')}`;
}

export const themeFor = (...names: Array<string | null | undefined>) => (names.some(n => /seca\s*barriga/i.test(String(n || ''))) ? 'fresh' : 'light');

async function nextHumanId(pool: Pool): Promise<string> {
  try {
    for (;;) {
      const res = await pool.query(`SELECT nextval('seq_generated_pages_human_id') AS num`);
      const candidate = `GEN-${String(parseInt(res.rows[0].num, 10)).padStart(6, '0')}`;
      const taken = await pool.query('SELECT 1 FROM generated_pages WHERE human_id = $1 LIMIT 1', [candidate]);
      if (taken.rows.length === 0) return candidate;
    }
  } catch {
    const res = await pool.query(`SELECT human_id FROM generated_pages WHERE human_id LIKE 'GEN-%' ORDER BY human_id DESC LIMIT 1`);
    const last = res.rows[0]?.human_id;
    const n = last ? parseInt(String(last).replace('GEN-', ''), 10) : 0;
    return `GEN-${String((Number.isFinite(n) ? n : 0) + 1).padStart(6, '0')}`;
  }
}

async function actorId(pool: Pool, userId: string | null) {
  if (!userId || !UUID_RE.test(userId)) return null;
  return (await pool.query('SELECT id FROM users WHERE id = $1', [userId])).rows[0]?.id || null;
}

export async function loadFacts(pool: Pool, productId: string, offerId: string): Promise<ProductFacts> {
  if (!UUID_RE.test(productId)) throw new GenerationError(400, 'Escolha um produto.');
  if (!UUID_RE.test(offerId)) throw new GenerationError(400, 'Escolha a oferta.');
  const p = (
    await pool.query(
      'SELECT id, name, description, category, collection_key FROM products WHERE id = $1 AND deleted_at IS NULL AND COALESCE(is_deleted, FALSE) = FALSE',
      [productId]
    )
  ).rows[0];
  if (!p) throw new GenerationError(400, 'Produto não encontrado.');
  const o = (
    await pool.query(
      `SELECT id, human_id, name, description, bonus, status, price, promotional_price, product_id,
              card_enabled, card_max_installments, card_free_installments
       FROM offers WHERE id = $1 AND deleted_at IS NULL AND COALESCE(is_deleted, FALSE) = FALSE`,
      [offerId]
    )
  ).rows[0];
  if (!o) throw new GenerationError(400, 'Oferta não encontrada.');
  if (String(o.product_id) !== String(p.id)) throw new GenerationError(400, 'Esta oferta é de outro produto.');
  const promo = o.promotional_price !== null && o.promotional_price !== undefined ? parseFloat(o.promotional_price) : null;
  const price = promo && promo > 0 ? promo : parseFloat(o.price);
  const files = await pool.query(
    `SELECT a.name FROM offer_digital_assets oda JOIN digital_assets a ON a.id = oda.asset_id WHERE oda.offer_id = $1 ORDER BY a.name`,
    [offerId]
  );
  const claims = await pool.query(
    `SELECT id, human_id, claim_text, claim_type FROM claims_registry
     WHERE product_id = $1 AND is_demo = FALSE AND status = 'VERIFIED' AND claim_type <> 'PRICE'
       AND (valid_until IS NULL OR valid_until > NOW())
     ORDER BY created_at ASC LIMIT 20`,
    [productId]
  );
  return {
    product: { id: p.id, name: String(p.name || ''), description: String(p.description || ''), category: String(p.category || ''), collection_key: p.collection_key || null },
    offer: {
      id: o.id,
      human_id: String(o.human_id),
      name: String(o.name || ''),
      description: String(o.description || ''),
      bonus: o.bonus || null,
      status: String(o.status),
      price: Number.isFinite(price) ? price : 0,
      cardEnabled: !!o.card_enabled,
      cardMax: Number(o.card_max_installments) || 1,
      cardFree: Number(o.card_free_installments) || 0
    },
    deliveryTitles: files.rows.map((r: any) => String(r.name || '').trim()).filter(Boolean).slice(0, 20),
    claims: claims.rows.map((r: any) => ({ id: r.id, human_id: r.human_id, text: String(r.claim_text || ''), type: String(r.claim_type) }))
  };
}

export function checkContexts(shingles: string[], f: ProductFacts, usesGuarantee: boolean) {
  const set = new Set(shingles || []);
  const approved = f.claims.map(c => c.text);
  return {
    page: { shingles: set, allowedDigits: digitsOf([...factLines(f, false, usesGuarantee), ...approved]), approvedClaims: approved, ad: false } as CheckContext,
    ad: { shingles: set, allowedDigits: digitsOf([...factLines(f, true), ...approved]), approvedClaims: approved, ad: true } as CheckContext
  };
}

/** Escolhe as seções que levam imagem (as que o esqueleto marca, até 4; sem nenhuma, a abertura). */
export function imageSlots(plan: Array<{ has_image: boolean }>): number[] {
  const idx = plan.map((p, i) => (p.has_image ? i : -1)).filter(i => i >= 0);
  return (idx.length ? idx : [0]).slice(0, MAX_NEW_IMAGES);
}

const PUBLIC_SECTION = (s: GeneratedSection, image: string | null) => ({
  order: s.order,
  role: s.role,
  headline: s.headline,
  body: s.body,
  bullets: s.bullets,
  cta_label: s.cta_label,
  image_url: image
});

export class GenerationService {
  constructor(private pool: Pool) {}

  private async reference(id: string) {
    if (!UUID_RE.test(String(id || ''))) throw new GenerationError(404, 'Referência não encontrada.');
    const r = (
      await this.pool.query(
        `SELECT id, human_id, product_id, reference_type, status, structure, source_shingles FROM creative_references WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      )
    ).rows[0];
    if (!r) throw new GenerationError(404, 'Referência não encontrada.');
    if (r.status !== 'READY') throw new GenerationError(409, 'Só dá para gerar a partir de uma referência pronta.');
    const structure = parseJsonCol(r.structure, null) as ReferenceStructure | null;
    if (!structure) throw new GenerationError(409, 'Esta referência não tem estrutura.');
    const shingles = Array.isArray(r.source_shingles) ? r.source_shingles.map(String) : parseJsonCol(r.source_shingles, []);
    return { id: r.id as string, human_id: String(r.human_id), type: String(r.reference_type), structure, shingles: shingles as string[] };
  }

  async generate(
    input: { referenceId: unknown; productId: unknown; offerId: unknown; adCount?: unknown; newImages?: unknown },
    userId: string | null
  ) {
    const ref = await this.reference(String(input.referenceId || ''));
    const f = await loadFacts(this.pool, String(input.productId || ''), String(input.offerId || ''));
    if (!generationAiConfigured()) throw new GenerationError(503, 'IA não configurada (OPENAI_API_KEY): não dá para gerar agora.');
    const count = Math.min(AD_COUNT_MAX, Math.max(AD_COUNT_MIN, Math.round(Number(input.adCount) || AD_COUNT_MIN)));
    const { plan, notes, usesGuarantee } = buildPagePlan(ref.structure, f);
    const adPlan = buildAdPlan(ref.structure);
    const ctx = checkContexts(ref.shingles, f, usesGuarantee);

    const sections = await writePage(plan, f, ctx.page, usesGuarantee);
    const ads = await writeAds(adPlan, f, ctx.ad, count);

    // imagens: as que o produto já tem; com a KIE, imagens novas depois (em segundo plano)
    const fallback = productImages({ name: f.product.name, collection_key: f.product.collection_key });
    const wantNew = input.newImages === true || input.newImages === 'true';
    const kie = kieConfigured();
    const mode: 'KIE' | 'PRODUCT' | 'NONE' = wantNew && kie ? 'KIE' : fallback.length ? 'PRODUCT' : 'NONE';
    const now = new Date().toISOString();
    imageSlots(plan).forEach((i, n) => {
      const img = fallback.length ? fallback[n % fallback.length] : null;
      sections[i] = {
        ...sections[i],
        image_url: img,
        image_status: mode === 'KIE' ? 'PENDING' : img ? 'PRODUCT' : 'NONE',
        image_started_at: mode === 'KIE' ? now : null
      };
    });
    const imageNote = !kie ? KIE_MISSING_MESSAGE : wantNew ? 'Imagens novas sendo feitas na KIE (alguns minutos).' : 'Imagens novas não pedidas: usando as imagens do produto.';
    const check = pageCopyCheck(sections, ctx.page, plan);

    const actor = await actorId(this.pool, userId);
    const hid = await nextHumanId(this.pool);
    const slug = slugify(f.product.name);
    const copyCheck = { checked_at: now, ...check, notes, images: { mode, message: imageNote }, plan: plan.map(p => ({ cta: p.cta })) };
    const ins = await this.pool.query(
      `INSERT INTO generated_pages (human_id, reference_id, product_id, offer_id, slug, status, sections, theme, copy_check, images_mode, generation_method, data_provenance, created_by)
       VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6::jsonb, $7, $8::jsonb, $9, 'AI', 'COMMERCIAL_PRODUCTION', $10) RETURNING id`,
      [hid, ref.id, f.product.id, f.offer.id, slug, JSON.stringify(sections), themeFor(f.product.name, f.offer.name), JSON.stringify(copyCheck), mode, actor]
    );
    const pageId = ins.rows[0].id as string;

    let n = 0;
    for (const a of ads) {
      n++;
      await this.insertAd(pageId, hid, n, a, adPlan, ref, f, ctx.ad, actor);
    }
    await writeAuditLog(
      this.pool, actor, 'GENERATED_PAGE_CREATED',
      `Página ${hid} e ${ads.length} anúncio(s) gerados da referência ${ref.human_id} para ${f.product.name} (rascunho).`,
      null, JSON.stringify({ sections: sections.length, ads: ads.length, blocked: check.blocked_count, images: mode }), false, false
    );
    return { id: pageId, imagesPending: mode === 'KIE' };
  }

  private async insertAd(
    pageId: string, pageHid: string, n: number, a: GeneratedAd, p: AdPlan,
    ref: { id: string; human_id: string }, f: ProductFacts, ctx: CheckContext, actor: string | null
  ) {
    const key = `${pageHid}-A${n}`;
    const fields = adFields(a);
    const check = adCopyCheck(fields, ctx, a.removed_fields, a.retries);
    const hash = computeContentHash({ hook: a.hook, mechanism: null, cta: a.cta, format: p.format, script: fields.script, primary_text: a.primary_text, headline: a.headline, file_url: null });
    const ins = await this.pool.query(
      `INSERT INTO creatives (
         human_id, product_id, offer_id, hook, concept, copy, cta, format, file_url, responsible_id, status, is_demo,
         batch_code, hook_family, angle, duration_seconds, primary_text, headline, script, generation_source, version,
         lineage_code, utm_content_key, content_hash, approval_status, reference_id, generated_page_id, ad_description, copy_check
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, 'IDEIA', FALSE,
         NULL, $10, $11, $12, $6, $13, $14, 'AI_REFERENCE', 1,
         $1, $1, $15, 'DRAFT', $16, $17, $18, $19::jsonb
       ) RETURNING id`,
      [
        key, f.product.id, f.offer.id, a.hook, `Gerado da referência ${ref.human_id} (página ${pageHid})`, a.primary_text, a.cta.slice(0, 100), p.format, actor,
        p.hook_type, p.angle.slice(0, 500) || null, p.duration_s, a.headline, fields.script, hash, ref.id, pageId, a.description, JSON.stringify(check)
      ]
    );
    await this.linkClaims(ins.rows[0].id, a.claim_ids, f);
    return ins.rows[0].id as string;
  }

  /** Liga ao criativo só as promessas aprovadas que o anúncio diz usar (C1, C2...). */
  private async linkClaims(creativeId: string, codes: string[], f: ProductFacts) {
    for (const code of codes) {
      const m = /^C(\d{1,2})$/i.exec(String(code).trim());
      const claim = m ? f.claims[Number(m[1]) - 1] : undefined;
      if (!claim) continue;
      await this.pool.query('INSERT INTO creative_claims (creative_id, claim_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [creativeId, claim.id]);
    }
  }

  private async row(id: string, includeDeleted = false) {
    if (!UUID_RE.test(String(id || ''))) throw new GenerationError(404, 'Página gerada não encontrada.');
    const r = (await this.pool.query('SELECT * FROM generated_pages WHERE id = $1', [id])).rows[0];
    if (!r || (!includeDeleted && r.deleted_at)) throw new GenerationError(404, 'Página gerada não encontrada.');
    r.sections = parseJsonCol(r.sections, []) as GeneratedSection[];
    r.copy_check = parseJsonCol(r.copy_check, {});
    return r;
  }

  /** Imagem nova que ficou presa (servidor reiniciou no meio): vira "falhou" e fica a do produto. */
  private async settleStaleImages(r: any) {
    let changed = false;
    const sections = (r.sections as GeneratedSection[]).map(s => {
      if (s.image_status === 'PENDING' && s.image_started_at && Date.now() - new Date(s.image_started_at).getTime() > STALE_IMAGE_MS) {
        changed = true;
        return { ...s, image_status: 'FAILED' as GeneratedSection['image_status'], image_error: 'A imagem nova não ficou pronta a tempo.' };
      }
      return s;
    });
    if (changed) {
      await this.pool.query('UPDATE generated_pages SET sections = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(sections), r.id]);
      r.sections = sections;
    }
  }

  private async contextFor(r: any) {
    const ref = (await this.pool.query('SELECT source_shingles FROM creative_references WHERE id = $1', [r.reference_id])).rows[0];
    const shingles = ref ? (Array.isArray(ref.source_shingles) ? ref.source_shingles.map(String) : parseJsonCol(ref.source_shingles, [])) : [];
    const f = await loadFacts(this.pool, String(r.product_id), String(r.offer_id));
    const usesGuarantee = (r.sections as GeneratedSection[]).some(s => s.role === 'GUARANTEE');
    return { f, usesGuarantee, ctx: checkContexts(shingles, f, usesGuarantee) };
  }

  async list(referenceId?: unknown) {
    const params: any[] = [];
    let where = 'g.deleted_at IS NULL';
    if (referenceId) {
      if (!UUID_RE.test(String(referenceId))) return { pages: [], trash: [] };
      params.push(String(referenceId));
      where += ` AND g.reference_id = $1`;
    }
    const cols = `g.id, g.human_id, g.slug, g.status, g.reference_id, r.human_id AS reference_human_id, g.product_id, p.name AS product_name,
      g.offer_id, o.human_id AS offer_human_id, g.created_at, g.published_at, g.deleted_at`;
    const from = `FROM generated_pages g LEFT JOIN creative_references r ON r.id = g.reference_id LEFT JOIN products p ON p.id = g.product_id LEFT JOIN offers o ON o.id = g.offer_id`;
    const pages = await this.pool.query(`SELECT ${cols} ${from} WHERE ${where} ORDER BY g.created_at DESC LIMIT 100`, params);
    const trashWhere = referenceId ? 'g.deleted_at IS NOT NULL AND g.reference_id = $1' : 'g.deleted_at IS NOT NULL';
    const trash = await this.pool.query(`SELECT ${cols} ${from} WHERE ${trashWhere} ORDER BY g.deleted_at DESC LIMIT 50`, params);
    return { pages: pages.rows, trash: trash.rows };
  }

  /** Página + esqueleto da referência + anúncios (fábrica) para a tela de geração. */
  async get(id: string) {
    const r = await this.row(id);
    await this.settleStaleImages(r);
    const ref = r.reference_id
      ? (await this.pool.query('SELECT id, human_id, reference_type, structure FROM creative_references WHERE id = $1', [r.reference_id])).rows[0]
      : null;
    const meta = (
      await this.pool.query(
        `SELECT p.name AS product_name, o.human_id AS offer_human_id, o.name AS offer_name, o.status AS offer_status
         FROM generated_pages g LEFT JOIN products p ON p.id = g.product_id LEFT JOIN offers o ON o.id = g.offer_id WHERE g.id = $1`,
        [id]
      )
    ).rows[0] || {};
    const sections = await Promise.all(
      (r.sections as GeneratedSection[]).map(async s => ({ ...s, image_preview_url: await resolveImageUrl(s.image_url, 3600) }))
    );
    return {
      page: {
        id: r.id,
        human_id: r.human_id,
        slug: r.slug,
        status: r.status,
        theme: r.theme,
        product_id: r.product_id,
        product_name: meta.product_name || null,
        offer_id: r.offer_id,
        offer_human_id: meta.offer_human_id || null,
        offer_name: meta.offer_name || null,
        offer_status: meta.offer_status || null,
        reference_id: r.reference_id,
        sections,
        copy_check: r.copy_check,
        images_mode: r.images_mode,
        approved_at: r.approved_at,
        published_at: r.published_at,
        unpublished_at: r.unpublished_at,
        created_at: r.created_at,
        updated_at: r.updated_at
      },
      reference: ref ? { id: ref.id, human_id: ref.human_id, reference_type: ref.reference_type, structure: parseJsonCol(ref.structure, null) } : null,
      ads: await this.ads(r.id),
      images: { kie: kieConfigured(), message: kieConfigured() ? null : KIE_MISSING_MESSAGE }
    };
  }

  /** Anúncios da página: os gerados e as versões novas deles (a mais nova de cada). */
  async ads(pageId: string) {
    const rows = await this.pool.query(
      `SELECT c.id, c.human_id, c.hook, c.primary_text, c.headline, c.ad_description, c.cta, c.script, c.format, c.approval_status,
              c.version, c.copy_check, c.root_creative_id, c.created_at
       FROM creatives c
       WHERE c.is_deleted = FALSE AND c.approval_status <> 'SUPERSEDED'
         AND (c.generated_page_id = $1 OR c.root_creative_id IN (SELECT x.id FROM creatives x WHERE x.generated_page_id = $1))
       ORDER BY c.human_id ASC`,
      [pageId]
    );
    const ids = rows.rows.map((r: any) => r.id);
    const claims = new Map<string, any[]>();
    const reviews = new Map<string, any>();
    if (ids.length) {
      const ph = ids.map((_: any, i: number) => `$${i + 1}`).join(', ');
      const cl = await this.pool.query(
        `SELECT cc.creative_id, cr.human_id, cr.claim_text, cr.status FROM creative_claims cc JOIN claims_registry cr ON cr.id = cc.claim_id WHERE cc.creative_id IN (${ph})`,
        ids
      );
      for (const c of cl.rows) claims.set(c.creative_id, [...(claims.get(c.creative_id) || []), { human_id: c.human_id, text: c.claim_text, status: c.status }]);
      const rv = await this.pool.query(
        `SELECT creative_id, decision, reason_code, notes, created_at FROM creative_reviews WHERE creative_id IN (${ph}) ORDER BY created_at DESC`,
        ids
      );
      for (const v of rv.rows) if (!reviews.has(v.creative_id)) reviews.set(v.creative_id, v);
    }
    return rows.rows.map((c: any) => ({ ...c, copy_check: parseJsonCol(c.copy_check, null), claims: claims.get(c.id) || [], last_review: reviews.get(c.id) || null }));
  }

  private assertEditable(r: any) {
    if (r.status === 'PUBLISHED') throw new GenerationError(409, 'A página está no ar. Tire do ar antes de mudar.');
  }

  private async saveSections(r: any, sections: GeneratedSection[], ctx: CheckContext, actor: string | null, what: string) {
    const prev = r.copy_check || {};
    const plan = Array.isArray(prev.plan) ? prev.plan : null;
    const check = pageCopyCheck(sections, ctx, plan);
    const copyCheck = { ...prev, checked_at: new Date().toISOString(), fields: check.fields, blocked_count: check.blocked_count };
    // mudou o conteúdo: volta para rascunho (precisa aprovar de novo)
    await this.pool.query(
      `UPDATE generated_pages SET sections = $1::jsonb, copy_check = $2::jsonb, status = 'DRAFT', approved_by = NULL, approved_at = NULL, updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(sections), JSON.stringify(copyCheck), r.id]
    );
    await writeAuditLog(this.pool, actor, 'GENERATED_PAGE_EDITED', `Página ${r.human_id}: ${what}.`, r.status, 'DRAFT', false, false);
  }

  async editSection(id: string, order: number, changes: { headline?: unknown; body?: unknown; bullets?: unknown; cta_label?: unknown }, userId: string | null) {
    const r = await this.row(id);
    this.assertEditable(r);
    const idx = (r.sections as GeneratedSection[]).findIndex(s => s.order === Number(order));
    if (idx === -1) throw new GenerationError(404, 'Seção não encontrada.');
    const cur = r.sections[idx] as GeneratedSection;
    const next: GeneratedSection = { ...cur, removed_fields: [...(cur.removed_fields || [])] };
    const take = (v: unknown, max: number, label: string) => {
      const s = String(v ?? '');
      if (s.length > max) throw new GenerationError(400, `${label} pode ter no máximo ${max} caracteres.`);
      return s.trim();
    };
    if (changes.headline !== undefined) next.headline = take(changes.headline, LIMITS.headline, 'O título');
    if (changes.body !== undefined) next.body = take(changes.body, LIMITS.body, 'O texto');
    if (changes.cta_label !== undefined) next.cta_label = take(changes.cta_label, LIMITS.cta, 'O botão');
    if (changes.bullets !== undefined) {
      const list = Array.isArray(changes.bullets) ? changes.bullets : String(changes.bullets ?? '').split('\n');
      next.bullets = list.map(b => String(b ?? '').trim()).filter(Boolean);
      if (next.bullets.length > LIMITS.bullets) throw new GenerationError(400, `No máximo ${LIMITS.bullets} itens na lista.`);
      if (next.bullets.some(b => b.length > LIMITS.bullet)) throw new GenerationError(400, `Cada item da lista pode ter no máximo ${LIMITS.bullet} caracteres.`);
    }
    next.removed_fields = next.removed_fields.filter(f => {
      const v = (next as any)[f];
      return Array.isArray(v) ? v.length === 0 : !String(v || '').trim();
    });
    const { ctx } = await this.contextFor(r);
    // só os campos que o dono mudou (o resto continua com o selo que já tinha)
    const issues = sectionIssues({ ...next, removed_fields: [] }, ctx.page);
    const touched = (Object.keys(changes) as Array<keyof typeof changes>).filter(k => changes[k] !== undefined).map(String);
    const list = Object.entries(issues)
      .filter(([k]) => touched.includes(k))
      .flatMap(([, l]) => l)
      .filter(i => i.code !== 'EMPTY');
    if (list.length) throw new GenerationError(422, `Não dá para salvar: ${list.map(i => i.detail).join('; ')}.`, list);
    const sections = [...r.sections];
    sections[idx] = next;
    await this.saveSections(r, sections, ctx.page, await actorId(this.pool, userId), `seção ${order} editada`);
    return this.get(id);
  }

  async regenerateSection(id: string, order: number, userId: string | null) {
    const r = await this.row(id);
    this.assertEditable(r);
    if (!generationAiConfigured()) throw new GenerationError(503, 'IA não configurada (OPENAI_API_KEY): não dá para gerar agora.');
    const idx = (r.sections as GeneratedSection[]).findIndex(s => s.order === Number(order));
    if (idx === -1) throw new GenerationError(404, 'Seção não encontrada.');
    const cur = r.sections[idx] as GeneratedSection;
    const { f, usesGuarantee, ctx } = await this.contextFor(r);
    const plan = Array.isArray(r.copy_check?.plan) ? r.copy_check.plan : [];
    const ref = r.reference_id ? (await this.pool.query('SELECT structure FROM creative_references WHERE id = $1', [r.reference_id])).rows[0] : null;
    const structure = ref ? (parseJsonCol(ref.structure, null) as ReferenceStructure | null) : null;
    const refSec = structure && structure.kind === 'SALES_PAGE' ? structure.sections.find(s => s.order === cur.ref_order) : undefined;
    const item: PlanItem = {
      ref_order: cur.ref_order,
      role: cur.role,
      purpose: refSec?.purpose || ROLE_PURPOSE[cur.role],
      headline_style: refSec?.headline_style || 'STATEMENT',
      approx_words: refSec?.approx_words || 60,
      has_image: cur.image_status !== 'NONE',
      cta: plan[idx] ? !!plan[idx].cta : !!cur.cta_label,
      replaced_from: cur.replaced_from
    };
    const next = await writeSectionWithRetries(cur, item, idx, f, ctx.page, usesGuarantee, true);
    const sections = [...r.sections];
    sections[idx] = { ...next, image_url: cur.image_url, image_status: cur.image_status, image_started_at: cur.image_started_at, image_error: cur.image_error };
    await this.saveSections(r, sections, ctx.page, await actorId(this.pool, userId), `seção ${order} gerada de novo`);
    return this.get(id);
  }

  private blockedNow(r: any, ctx: CheckContext): string[] {
    const plan = Array.isArray(r.copy_check?.plan) ? r.copy_check.plan : null;
    const check = pageCopyCheck(r.sections, ctx, plan);
    return Object.entries(check.fields)
      .filter(([, v]) => !v.ok)
      .map(([k, v]) => `seção ${k.split('.')[0]}: ${v.issues.map(i => i.detail).join(', ')}`);
  }

  async approve(id: string, userId: string | null) {
    const r = await this.row(id);
    if (r.status !== 'DRAFT') throw new GenerationError(409, r.status === 'PUBLISHED' ? 'A página já está no ar.' : 'A página já está aprovada.');
    if ((r.sections as GeneratedSection[]).some(s => s.image_status === 'PENDING')) throw new GenerationError(409, 'Espere as imagens novas ficarem prontas.');
    const { ctx } = await this.contextFor(r);
    const blocked = this.blockedNow(r, ctx.page);
    if (blocked.length) throw new GenerationError(409, `Aprovação bloqueada: ${blocked.slice(0, 5).join('; ')}.`);
    if (!(r.sections as GeneratedSection[]).some(s => s.cta_label.trim())) throw new GenerationError(409, 'A página precisa de pelo menos um botão de compra.');
    const actor = await actorId(this.pool, userId);
    await this.pool.query(`UPDATE generated_pages SET status = 'APPROVED', approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $1`, [id, actor]);
    await writeAuditLog(this.pool, actor, 'GENERATED_PAGE_APPROVED', `Página ${r.human_id} aprovada.`, 'DRAFT', 'APPROVED', false, false);
    return this.get(id);
  }

  async publish(id: string, userId: string | null) {
    const r = await this.row(id);
    if (r.status === 'PUBLISHED') throw new GenerationError(409, 'A página já está no ar.');
    if (!r.approved_at || (r.status !== 'APPROVED' && r.status !== 'UNPUBLISHED')) throw new GenerationError(409, 'Aprove a página antes de publicar.');
    if ((r.sections as GeneratedSection[]).some(s => s.image_status === 'PENDING')) throw new GenerationError(409, 'Espere as imagens novas ficarem prontas.');
    const offer = (await this.pool.query('SELECT status FROM offers WHERE id = $1 AND deleted_at IS NULL AND COALESCE(is_deleted, FALSE) = FALSE', [r.offer_id])).rows[0];
    if (!offer || (offer.status !== 'ATIVA' && offer.status !== 'TESTE')) {
      throw new GenerationError(409, 'A oferta desta página não está à venda (precisa estar ativa ou em teste).');
    }
    const { ctx } = await this.contextFor(r);
    const blocked = this.blockedNow(r, ctx.page);
    if (blocked.length) throw new GenerationError(409, `Publicação bloqueada: ${blocked.slice(0, 5).join('; ')}.`);
    const actor = await actorId(this.pool, userId);
    await this.pool.query(
      `UPDATE generated_pages SET status = 'PUBLISHED', published_by = $2, published_at = NOW(), unpublished_at = NULL, updated_at = NOW() WHERE id = $1`,
      [id, actor]
    );
    await writeAuditLog(this.pool, actor, 'GENERATED_PAGE_PUBLISHED', `Página ${r.human_id} publicada em /v/${r.slug}.`, r.status, 'PUBLISHED', false, false);
    return this.get(id);
  }

  async unpublish(id: string, userId: string | null) {
    const r = await this.row(id);
    if (r.status !== 'PUBLISHED') throw new GenerationError(409, 'A página não está no ar.');
    const actor = await actorId(this.pool, userId);
    await this.pool.query(`UPDATE generated_pages SET status = 'UNPUBLISHED', unpublished_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
    await writeAuditLog(this.pool, actor, 'GENERATED_PAGE_UNPUBLISHED', `Página ${r.human_id} tirada do ar.`, 'PUBLISHED', 'UNPUBLISHED', false, false);
    return this.get(id);
  }

  async softDelete(id: string, userId: string | null) {
    const r = await this.row(id);
    if (r.status === 'PUBLISHED') throw new GenerationError(409, 'Tire a página do ar antes de mandar para a lixeira.');
    const actor = await actorId(this.pool, userId);
    await this.pool.query('UPDATE generated_pages SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1', [id, actor]);
    await writeAuditLog(this.pool, actor, 'GENERATED_PAGE_DELETED', `Página ${r.human_id} foi para a lixeira.`, null, null, false, false);
    return { id, human_id: r.human_id };
  }

  async restore(id: string, userId: string | null) {
    const r = await this.row(id, true);
    if (!r.deleted_at) throw new GenerationError(409, 'A página não está na lixeira.');
    const actor = await actorId(this.pool, userId);
    await this.pool.query('UPDATE generated_pages SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW() WHERE id = $1', [id]);
    await writeAuditLog(this.pool, actor, 'GENERATED_PAGE_RESTORED', `Página ${r.human_id} restaurada da lixeira.`, null, null, false, false);
    return { id, human_id: r.human_id };
  }

  // ----- anúncios (fábrica de criativos) -----

  private async adOfPage(pageId: string, creativeId: string) {
    if (!UUID_RE.test(String(creativeId || ''))) throw new GenerationError(404, 'Anúncio não encontrado.');
    const list = await this.ads(pageId);
    const c = list.find((a: any) => a.id === creativeId);
    if (!c) throw new GenerationError(404, 'Anúncio não encontrado nesta página.');
    return c;
  }

  /** Grava a mudança pela fábrica (versão nova quando já foi revisado) e liga a versão à página. */
  private async reviseAd(r: any, cur: any, next: Record<AdField, string>, check: any, claimCodes: string[] | null, f: ProductFacts, userId: string | null) {
    const factory = new CreativeFactoryService();
    let out: any;
    const changes = { hook: next.hook, primary_text: next.primary_text, headline: next.headline, cta: next.cta, script: next.script };
    const sameCopy =
      (cur.hook || '') === next.hook && (cur.primary_text || '') === next.primary_text && (cur.headline || '') === next.headline &&
      (cur.cta || '') === next.cta && (cur.script || '') === next.script;
    if (sameCopy) {
      if ((cur.ad_description || '') === next.description) throw new GenerationError(400, 'Nenhuma alteração no anúncio.');
      if (cur.approval_status === 'APPROVED') {
        throw new GenerationError(409, 'Anúncio aprovado: para mudar só a descrição, mude também o texto ou gere de novo (vira uma versão nova para aprovar).');
      }
      out = { creative: { id: cur.id } };
    } else {
      try {
        out = await factory.reviseCreative(this.pool, cur.id, changes, await actorId(this.pool, userId), false);
      } catch (e: any) {
        if (e instanceof CreativeFactoryError) throw new GenerationError(e.status, e.message);
        throw e;
      }
    }
    const newId = out?.creative?.id || cur.id;
    await this.pool.query(
      'UPDATE creatives SET reference_id = $2, generated_page_id = $3, ad_description = $4, copy_check = $5::jsonb, updated_at = NOW() WHERE id = $1',
      [newId, r.reference_id, r.id, next.description, JSON.stringify(check)]
    );
    if (claimCodes) await this.linkClaims(newId, claimCodes, f);
    return newId as string;
  }

  async editAd(pageId: string, creativeId: string, changes: Record<string, unknown>, userId: string | null) {
    const r = await this.row(pageId);
    const cur = await this.adOfPage(pageId, creativeId);
    const next: Record<AdField, string> = {
      hook: changes.hook !== undefined ? String(changes.hook ?? '').trim() : cur.hook || '',
      primary_text: changes.primary_text !== undefined ? String(changes.primary_text ?? '').trim() : cur.primary_text || '',
      headline: changes.headline !== undefined ? String(changes.headline ?? '').trim() : cur.headline || '',
      description: changes.description !== undefined ? String(changes.description ?? '').trim() : cur.ad_description || '',
      cta: changes.cta !== undefined ? String(changes.cta ?? '').trim() : cur.cta || '',
      script: changes.script !== undefined ? String(changes.script ?? '').trim() : cur.script || ''
    };
    const lim: Record<AdField, number> = { hook: LIMITS.hook, primary_text: LIMITS.primary, headline: LIMITS.adHeadline, description: LIMITS.description, cta: LIMITS.cta, script: 3000 };
    for (const k of AD_FIELDS) if (next[k].length > lim[k]) throw new GenerationError(400, `Texto longo demais (${k}: até ${lim[k]} caracteres).`);
    const { f, ctx } = await this.contextFor(r);
    // só os campos que mudaram (os outros continuam com o selo que já tinham)
    const before: Record<AdField, string> = {
      hook: cur.hook || '', primary_text: cur.primary_text || '', headline: cur.headline || '', description: cur.ad_description || '', cta: cur.cta || '', script: cur.script || ''
    };
    const issues = adIssues(next, ctx.ad);
    const list = AD_FIELDS.filter(k => next[k] !== before[k]).flatMap(k => issues[k]);
    if (list.length) throw new GenerationError(422, `Não dá para salvar: ${list.map(i => i.detail).join('; ')}.`, list);
    await this.reviseAd(r, cur, next, adCopyCheck(next, ctx.ad), null, f, userId);
    return this.get(pageId);
  }

  async regenerateAd(pageId: string, creativeId: string, userId: string | null) {
    const r = await this.row(pageId);
    if (!generationAiConfigured()) throw new GenerationError(503, 'IA não configurada (OPENAI_API_KEY): não dá para gerar agora.');
    const cur = await this.adOfPage(pageId, creativeId);
    const { f, ctx } = await this.contextFor(r);
    const ref = r.reference_id ? (await this.pool.query('SELECT structure FROM creative_references WHERE id = $1', [r.reference_id])).rows[0] : null;
    const adPlan = buildAdPlan(ref ? (parseJsonCol(ref.structure, null) as ReferenceStructure | null) : null);
    const g = await writeOneAdWithRetries(null, adPlan, f, ctx.ad);
    if (!g) throw new GenerationError(502, 'A IA não devolveu um anúncio válido. Tente de novo.');
    if (g.removed_fields.some(x => x === 'hook' || x === 'primary_text' || x === 'cta')) {
      throw new GenerationError(409, 'Não deu para gerar um anúncio diferente da referência agora. Tente de novo ou escreva à mão.');
    }
    const fields = adFields(g);
    await this.reviseAd(r, cur, fields, adCopyCheck(fields, ctx.ad, g.removed_fields, g.retries), g.claim_ids, f, userId);
    return this.get(pageId);
  }

  // ----- imagens novas (KIE), em segundo plano -----

  async runImageJob(pageId: string): Promise<void> {
    const r = await this.row(pageId, true);
    const style = imageStyle(
      (await this.pool.query('SELECT name, collection_key, category FROM products WHERE id = $1', [r.product_id])).rows[0] || {}
    );
    const productName = (await this.pool.query('SELECT name FROM products WHERE id = $1', [r.product_id])).rows[0]?.name || '';
    const pending = (r.sections as GeneratedSection[]).filter(s => s.image_status === 'PENDING');
    for (const s of pending) {
      let patch: Partial<GeneratedSection>;
      try {
        const scene = s.image_prompt || `${productName}: ${ROLE_PURPOSE[s.role]}`;
        const img = await generateKieImage(`${scene}. ${style}`, '3:2');
        const ext = img.mime === 'image/jpeg' ? 'jpg' : img.mime === 'image/webp' ? 'webp' : 'png';
        const path = `generated/${r.id}/${s.order}-${Date.now()}.${ext}`;
        const bucket = imagesBucket();
        await imageStorage().upload(bucket, path, img.data, img.mime);
        patch = { image_url: `${STORAGE_PREFIX}${bucket}/${path}`, image_status: 'READY', image_error: null };
      } catch (err: any) {
        patch = { image_status: 'FAILED', image_error: String(err?.message || 'A imagem nova falhou.').slice(0, 300) };
      }
      // relê a página: o dono pode ter editado enquanto a imagem era feita
      const fresh = await this.row(pageId, true);
      const sections = (fresh.sections as GeneratedSection[]).map(x => (x.order === s.order && x.image_status === 'PENDING' ? { ...x, ...patch } : x));
      await this.pool.query('UPDATE generated_pages SET sections = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(sections), pageId]);
    }
  }

  // ----- página pública -----

  /** Só páginas PUBLICADAS, só campos seguros (sem verificação, sem referência, sem quem fez). */
  async publicPage(slug: string) {
    const s = String(slug || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{3,120}$/.test(s)) throw new GenerationError(404, 'Página não encontrada.');
    const r = (
      await this.pool.query(
        `SELECT g.id, g.slug, g.theme, g.sections, g.offer_id, o.human_id AS offer_human_id, o.status AS offer_status, p.name AS product_name
         FROM generated_pages g JOIN offers o ON o.id = g.offer_id LEFT JOIN products p ON p.id = g.product_id
         WHERE g.slug = $1 AND g.status = 'PUBLISHED' AND g.deleted_at IS NULL AND o.deleted_at IS NULL AND COALESCE(o.is_deleted, FALSE) = FALSE`,
        [s]
      )
    ).rows[0];
    if (!r || (r.offer_status !== 'ATIVA' && r.offer_status !== 'TESTE')) throw new GenerationError(404, 'Página não encontrada.');
    const sections = parseJsonCol(r.sections, []) as GeneratedSection[];
    return {
      slug: r.slug,
      theme: r.theme === 'fresh' ? 'fresh' : 'light',
      title: r.product_name || '',
      offer: { human_id: r.offer_human_id },
      offer_id: r.offer_id as string,
      sections: await Promise.all(sections.map(async x => PUBLIC_SECTION(x, await resolveImageUrl(x.image_url))))
    };
  }
}

