// NORQVA-0118: botão "Copiar a versão NORQVA". Copia só o que o NORQVA escreveu para o NOSSO produto
// (página gerada e anúncios), nunca texto da referência (D-0115: a referência guarda só a estrutura).

import { ROLE_LABEL } from './CreativeReferences';

export interface CopySection {
  order: number;
  role?: string;
  headline?: string;
  body?: string;
  bullets?: string[] | string;
  cta_label?: string;
  price?: { price_text?: string; installments_text?: string | null } | null;
  fixed_note?: string | null;
}

export interface CopyAd {
  human_id?: string;
  hook?: string;
  primary_text?: string;
  headline?: string;
  description?: string;
  ad_description?: string;
  cta?: string;
  script?: string;
}

const clean = (v: unknown) => String(v ?? '').trim();
const bulletList = (b: CopySection['bullets']) =>
  (Array.isArray(b) ? b : String(b || '').split('\n')).map(clean).filter(Boolean);

/** Texto de uma seção da página, pronto para colar. */
export function sectionText(s: CopySection): string {
  const lines: string[] = [`${s.order}. ${ROLE_LABEL[String(s.role || 'OTHER')] || ROLE_LABEL.OTHER}`];
  if (clean(s.headline)) lines.push(`Título: ${clean(s.headline)}`);
  if (clean(s.body)) lines.push(clean(s.body));
  for (const b of bulletList(s.bullets)) lines.push(`- ${b}`);
  if (s.price?.price_text) lines.push(`Preço (vem da oferta): ${clean(s.price.price_text)}${s.price.installments_text ? ` · ${clean(s.price.installments_text)}` : ''}`);
  if (clean(s.fixed_note)) lines.push(clean(s.fixed_note));
  if (clean(s.cta_label)) lines.push(`Botão: ${clean(s.cta_label)}`);
  return lines.join('\n');
}

/** Texto de um anúncio, pronto para colar. Anúncio nunca leva preço (D-0053). */
export function adText(a: CopyAd): string {
  const lines: string[] = [];
  if (clean(a.human_id)) lines.push(clean(a.human_id));
  const desc = clean(a.description ?? a.ad_description);
  const pairs: Array<[string, string]> = [
    ['Gancho', clean(a.hook)],
    ['Texto principal', clean(a.primary_text)],
    ['Título', clean(a.headline)],
    ['Descrição', desc],
    ['Botão', clean(a.cta)],
    ['Roteiro', clean(a.script)]
  ];
  for (const [k, v] of pairs) if (v) lines.push(`${k}: ${v}`);
  return lines.join('\n');
}

/** Página inteira + anúncios, na ordem da tela. */
export function buildNorqvaCopy(input: { title?: string; sections: CopySection[]; ads: CopyAd[] }): string {
  const parts: string[] = [];
  if (clean(input.title)) parts.push(`Versão NORQVA — ${clean(input.title)}`);
  if (input.sections.length) {
    parts.push('PÁGINA DE VENDA');
    for (const s of [...input.sections].sort((a, b) => a.order - b.order)) parts.push(sectionText(s));
  }
  if (input.ads.length) {
    parts.push(`ANÚNCIOS (${input.ads.length})`);
    for (const a of input.ads) parts.push(adText(a));
  }
  return parts.join('\n\n');
}

/** Copia para a área de transferência (com plano B para navegador sem permissão). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* tenta o plano B */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand ? document.execCommand('copy') : false;
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}
