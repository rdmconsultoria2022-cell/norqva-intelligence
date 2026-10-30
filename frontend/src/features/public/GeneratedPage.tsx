import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Clock,
  CreditCard,
  FileText,
  Gift,
  Heart,
  HelpCircle,
  Info,
  Lightbulb,
  Lock,
  Mail,
  Package,
  QrCode,
  Quote,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRound,
  X,
  ZoomIn,
  type LucideIcon
} from 'lucide-react';
import { API_BASE } from '../../lib/api';
import { captureUrlAttribution } from '../../services/attribution';
import { trackViewContent } from '../../services/metaPixel';
import { FRESH } from '../../lib/productLook';
import { FloatingWhatsApp, WhatsAppButton, goToWhatsApp } from './WhatsAppChoice';

// NORQVA-0116 (D-0116): página de venda gerada (texto 100% nosso) e publicada pelo dono em /v/:slug.
// Visual das páginas do comprador ('light' creme e terracota, ou 'fresh' do Seca Barriga). Preço e parcelas vêm da
// oferta, na hora (mesma conta do pagamento). Os botões levam ao pagamento do NORQVA (/p/<oferta>?checkout=1) e só
// repassam os parâmetros de origem (utm_*, fbclid, gclid, ref, src e os códigos campaign_id/adset_id/ad_id da Meta): nunca nome, e-mail ou telefone.
// PageView da Meta sai pelo App (rota pública do comprador); ViewContent vai ao pixel da marca, como em /p e /kit.
//
// NORQVA-0129: visual de página de venda (celular primeiro): abertura com imagem, título forte, botão e selos de fatos
// reais (PDF, e-mail, forma de pagamento da oferta), seções com ícone e fundo alternado, imagem ao lado do texto,
// listas em cartões, galeria "Veja por dentro" (as imagens do produto que o servidor manda em `gallery`), cartão da
// oferta com preço ao vivo, garantia como selo de segurança e dúvidas em sanfona. Sem depoimento, contador, número
// inventado ou preço dentro de imagem. Animação de entrada só sem "reduzir movimento".

export interface PublicGeneratedSection {
  order: number;
  role: string;
  headline: string;
  body: string;
  bullets: string[];
  cta_label: string;
  image_url: string | null;
  note?: string | null;
  price?: { price_text: string; installments_text: string | null } | null;
}

export interface PublicGeneratedPage {
  slug: string;
  theme: 'light' | 'fresh';
  title: string;
  offer: { human_id: string; value?: number };
  sections: PublicGeneratedSection[];
  /** NORQVA-0129: imagens do produto que já estão no site (capa e páginas), para "Veja por dentro". */
  gallery?: string[];
  /** NORQVA-0129: a oferta entrega um arquivo PDF (o selo "PDF para imprimir" só aparece com isto). */
  delivery_pdf?: boolean;
  /** NORQVA-0133: aviso junto das imagens (ex.: ilustração do bordado pronto; linha e bastidor não acompanham). */
  image_note?: string | null;
  /** NORQVA-0155: prévia em vídeo do produto (Kit de Bordado: 30 s da aula) */
  preview_video?: { src: string; poster: string } | null;
  meta_pixel_id?: string | null;
  /** NORQVA-0132: WhatsApp de atendimento disponível para esta oferta (número conectado e atendente ligado). */
  whatsapp?: { available: boolean } | null;
}

const PASS_PARAM = /^(utm_[a-z0-9_]+|fbclid|gclid|ref|src|campaign_id|adset_id|ad_id)$/i;

/** Link do pagamento: ?checkout=1 + só os parâmetros de origem permitidos (utm_*, fbclid, gclid, ref, src e os códigos campaign_id/adset_id/ad_id da Meta). */
export function checkoutHref(offerHumanId: string, search: string): string {
  const incoming = new URLSearchParams(search || '');
  const out = new URLSearchParams();
  out.set('checkout', '1');
  incoming.forEach((v, k) => {
    if (PASS_PARAM.test(k)) out.append(k, v);
  });
  return `/p/${encodeURIComponent(offerHumanId)}?${out.toString()}`;
}

const LIST_LINE = /^\s*(?:[-•*–—]|\d{1,2}[.)])\s+(.+)$/;

export type BodyBlock = { kind: 'p'; text: string } | { kind: 'list'; items: string[] };

const cleanItem = (t: string) => t.trim().replace(/[;,]\s*$/, '');

/**
 * Texto da seção em blocos, na ordem do texto: parágrafos e listas (linhas que começam com "-", "•" ou "1.").
 * Linha comum logo depois de um item continua esse item. Só reorganiza o nosso texto.
 */
export function bodyBlocks(text: string): BodyBlock[] {
  const out: BodyBlock[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flushPara = () => {
    const p = para.join('\n').trim();
    if (p) out.push({ kind: 'p', text: p });
    para = [];
  };
  const flushList = () => {
    if (list && list.length) out.push({ kind: 'list', items: list.map(cleanItem).filter(Boolean) });
    list = null;
  };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const m = raw.match(LIST_LINE);
    if (m) {
      flushPara();
      if (!list) list = [];
      list.push(m[1].trim());
    } else if (!line) {
      flushPara();
      flushList();
    } else if (list && list.length) {
      list[list.length - 1] = `${list[list.length - 1]} ${line}`;
    } else {
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.filter(b => b.kind === 'p' || b.items.length > 0);
}

/** Atalhos: só os parágrafos / só os itens (na ordem). */
export const paragraphsOf = (blocks: BodyBlock[]) => blocks.flatMap(b => (b.kind === 'p' ? [b.text] : []));
export const itemsOf = (blocks: BodyBlock[]) => blocks.flatMap(b => (b.kind === 'list' ? b.items : []));

/** "Pergunta? Resposta." -> pergunta e resposta (sem "?" seguido de texto, fica só a pergunta). */
export function splitQa(item: string): { q: string; a: string } {
  const t = String(item || '').trim();
  const i = t.indexOf('?');
  if (i > 0 && i < t.length - 1) return { q: t.slice(0, i + 1).trim(), a: t.slice(i + 1).trim() };
  return { q: t, a: '' };
}

/** Parágrafo cuja primeira linha termina em "?" vira pergunta (primeira linha) e resposta (o resto). */
export function paragraphQa(text: string): { q: string; a: string } | null {
  const lines = String(text || '').split('\n');
  const first = lines[0].trim();
  if (!first.endsWith('?')) return null;
  const rest = lines.slice(1).join('\n').trim();
  return rest ? { q: first, a: rest } : null;
}

/** Itens da seção de dúvidas, na ordem: perguntas (de itens "- pergunta? resposta" ou de parágrafos) e textos soltos. */
export type FaqEntry = { kind: 'qa'; q: string; a: string } | { kind: 'text'; text: string } | { kind: 'item'; text: string };
export function faqEntries(blocks: BodyBlock[], bullets: string[] = []): FaqEntry[] {
  const out: FaqEntry[] = [];
  const pushItem = (it: string) => {
    const qa = splitQa(it);
    out.push(qa.a ? { kind: 'qa', q: qa.q, a: qa.a } : { kind: 'item', text: qa.q });
  };
  for (const b of blocks) {
    if (b.kind === 'list') b.items.forEach(pushItem);
    else {
      const qa = paragraphQa(b.text);
      out.push(qa ? { kind: 'qa', ...qa } : { kind: 'text', text: b.text });
    }
  }
  bullets.forEach(pushItem);
  return out;
}

function safeSlug(raw: string): string | null {
  try {
    const s = decodeURIComponent(raw || '').trim();
    return s ? s : null;
  } catch {
    return null;
  }
}

/** Nome e ícone de cada papel de seção (título curto quando a seção não tem título próprio). */
const ROLE_META: Record<string, { label: string; Icon: LucideIcon }> = {
  HERO_HOOK: { label: 'Conheça', Icon: Sparkles },
  PAIN: { label: 'Para quem é', Icon: Heart },
  AGITATION: { label: 'Por que importa', Icon: Lightbulb },
  MECHANISM: { label: 'Como funciona', Icon: Lightbulb },
  PRODUCT_REVEAL: { label: 'Conheça o material', Icon: BookOpen },
  BENEFITS: { label: 'O que você ganha', Icon: Sparkles },
  CONTENTS: { label: 'O que você recebe', Icon: Package },
  PROOF_RESULTS: { label: 'Resultados', Icon: Award },
  TESTIMONIALS: { label: 'Depoimentos', Icon: Quote },
  AUTHORITY: { label: 'Quem está por trás', Icon: UserRound },
  BONUS: { label: 'Bônus', Icon: Gift },
  OFFER_PRICE: { label: 'Oferta', Icon: Tag },
  GUARANTEE: { label: 'Compra segura', Icon: ShieldCheck },
  URGENCY: { label: 'Importante', Icon: Clock },
  FAQ: { label: 'Perguntas frequentes', Icon: HelpCircle },
  CTA: { label: 'Comece agora', Icon: ArrowRight },
  OTHER: { label: 'Bom saber', Icon: Info }
};
const roleMeta = (role: string) => ROLE_META[role] || ROLE_META.OTHER;

/** Papéis que não abrem a página: com eles primeiro, a abertura usa o título da página e a capa do produto. */
export const NON_HERO_ROLES = new Set(['OFFER_PRICE', 'GUARANTEE', 'FAQ', 'CTA']);

type Tokens = Record<string, string>;
const LIGHT: Tokens = {
  '--bg': '#faf7f2', '--alt': '#f3ece2', '--card': '#fffdf9', '--ink': '#1f1b17', '--body': '#3d3731', '--muted': '#6b6157', '--line': '#e6dccd',
  '--accent': '#8a3a26', '--accent-2': '#6b2b1b', '--kicker': '#8a6b45', '--gold': '#b89b72', '--soft': '#f4e4d8', '--shadow': 'rgba(60,40,25,.16)',
  '--btn': '#8a3a26', '--band': '#2a211b', '--band-ink': '#faf3ea',
  '--display': "'Cormorant Garamond', Georgia, serif", '--sans': "'Manrope', system-ui, sans-serif", '--display-weight': '600'
};
const FRESH_TOKENS: Tokens = {
  '--bg': FRESH.bg, '--alt': '#EEF3EC', '--card': FRESH.card, '--ink': FRESH.ink, '--body': '#2C3A31', '--muted': FRESH.muted, '--line': FRESH.line,
  '--accent': FRESH.to, '--accent-2': '#047857', '--kicker': FRESH.to, '--gold': FRESH.accent, '--soft': '#E1F4EA', '--shadow': 'rgba(16,40,28,.14)',
  '--btn': `linear-gradient(135deg, ${FRESH.from}, ${FRESH.to})`, '--band': FRESH.ink, '--band-ink': '#F4FAF6',
  '--display': "'Inter', system-ui, sans-serif", '--sans': "'Inter', system-ui, sans-serif", '--display-weight': '800'
};

const CSS = `
.gp{background:var(--bg);color:var(--ink);font-family:var(--sans);overflow-x:clip;-webkit-font-smoothing:antialiased}
.gp .wrap{max-width:1120px;margin:0 auto;padding:0 20px;box-sizing:border-box}
.gp .narrow{max-width:720px;margin-left:auto;margin-right:auto}
.gp .disp{font-family:var(--display);font-weight:var(--display-weight);letter-spacing:-.01em;color:var(--ink);overflow-wrap:anywhere}
.gp .h1{font-size:clamp(34px,9vw,60px);line-height:1.04}
.gp .h2{font-size:clamp(30px,7vw,46px);line-height:1.08}
.gp .lead{font-size:18px;line-height:1.6;color:var(--body)}
.gp .txt{font-size:16.5px;line-height:1.75;color:var(--body);white-space:pre-line}
.gp .muted{color:var(--muted)}
.gp .kicker{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--kicker)}
.gp .kicker .ico{width:34px;height:34px;border-radius:11px}
.gp .ico{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:40px;height:40px;border-radius:13px;background:var(--soft);color:var(--accent)}
.gp .btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 30px;border-radius:14px;background:var(--btn);color:#fff;font-weight:800;font-size:16.5px;letter-spacing:.01em;text-decoration:none;box-shadow:0 12px 26px var(--shadow);transition:transform .2s,box-shadow .2s,filter .2s;box-sizing:border-box;text-align:center}
.gp .btn:hover{filter:brightness(.93);transform:translateY(-1px);box-shadow:0 16px 30px var(--shadow)}
.gp .btn:active{transform:scale(.98)}
.gp .btn:focus-visible,.gp button:focus-visible,.gp summary:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
.gp .btn.inv{background:var(--band-ink);color:var(--band)}
.gp .chip{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:12.5px;font-weight:700;color:var(--body);white-space:nowrap}
.gp .chip svg{color:var(--accent)}
.gp .frame{position:relative;border-radius:24px;overflow:hidden;background:var(--card);box-shadow:0 22px 50px var(--shadow),0 0 0 1px var(--line)}
.gp .frame img{display:block;width:100%;height:auto}
.gp .item{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:16px;background:var(--card);border:1px solid var(--line);font-size:16px;line-height:1.55;color:var(--body)}
.gp .item .tick{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:24px;border-radius:999px;background:var(--accent);color:#fff;margin-top:1px}
.gp .sec{padding:64px 0}
.gp .sec.alt{background:var(--alt)}
.gp .hero{position:relative;padding:28px 0 48px;background:radial-gradient(120% 70% at 85% 0%,var(--soft) 0%,rgba(255,255,255,0) 60%),var(--bg)}
.gp .hero-grid{display:grid;gap:22px;grid-template-areas:"copy" "media" "act"}
.gp .hero-copy{grid-area:copy}.gp .hero-media{grid-area:media}.gp .hero-act{grid-area:act}
.gp .hero-media .frame{max-width:min(520px,82%);margin:0 auto;transform:rotate(-1.2deg)}
.gp .brand{font-family:var(--display);font-weight:var(--display-weight);font-size:20px;color:var(--ink)}
.gp .split{display:grid;gap:30px;align-items:center}
.gp .offer{position:relative;max-width:520px;margin:0 auto;border-radius:28px;background:var(--card);border:2px solid var(--accent);box-shadow:0 30px 60px var(--shadow);padding:28px 22px;text-align:center}
.gp .offer .tagp{position:absolute;top:-15px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;padding:7px 16px;border-radius:999px;white-space:nowrap}
.gp .price{font-family:var(--display);font-weight:800;font-size:clamp(46px,13vw,64px);line-height:1;color:var(--accent);letter-spacing:-.02em}
.gp .reassure{display:flex;gap:14px;align-items:flex-start;max-width:720px;margin:0 auto;padding:18px;border-radius:20px;background:var(--card);border:1px solid var(--line)}
.gp .gal{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:6px 20px 20px;margin:0 -20px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.gp .gal::-webkit-scrollbar{display:none}
.gp .gal > button{flex:0 0 76%;scroll-snap-align:center;padding:0;border:0;background:none;cursor:zoom-in;text-align:left}
.gp .gal .frame{border-radius:20px;box-shadow:0 14px 30px var(--shadow),0 0 0 1px var(--line)}
.gp .gal .zoom{position:absolute;right:10px;bottom:10px;display:inline-flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:999px;background:rgba(255,255,255,.9);color:var(--ink);box-shadow:0 4px 12px rgba(0,0,0,.12)}
.gp details{border:1px solid var(--line);border-radius:16px;background:var(--card);transition:box-shadow .2s}
.gp details[open]{box-shadow:0 10px 24px var(--shadow)}
.gp details summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:14px;padding:18px;font-size:16.5px;font-weight:700;color:var(--ink);min-height:28px}
.gp details summary::-webkit-details-marker{display:none}
.gp details summary:after{content:"+";flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:var(--soft);color:var(--accent);font-size:20px;font-weight:600;line-height:1}
.gp details[open] summary:after{content:"–"}
.gp details .ans{padding:0 18px 18px;font-size:16px;line-height:1.7;color:var(--body)}
.gp .band{background:var(--band);color:var(--band-ink)}
.gp .band .disp{color:var(--band-ink)}
.gp .band .txt{color:var(--band-ink);opacity:.86}
.gp .sbar{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;transform:translateY(120%);transition:transform .35s cubic-bezier(.2,.7,.2,1);align-items:center;gap:12px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:var(--card);background:color-mix(in srgb,var(--card) 94%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--line);box-shadow:0 -10px 28px var(--shadow)}
.gp .sbar.on{transform:none}
.gp .sbar .btn{flex:1 1 auto;min-height:50px;padding:0 16px;font-size:16px}
.gp .lb{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,16,12,.86)}
.gp .lb img{max-width:100%;max-height:86vh;border-radius:16px;box-shadow:0 30px 60px rgba(0,0,0,.4);background:#fff}
.gp .lb button{position:absolute;top:calc(14px + env(safe-area-inset-top));right:14px;width:46px;height:46px;border-radius:999px;border:0;background:rgba(255,255,255,.95);color:#1f1b17;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.gp .rv{opacity:0;transform:translateY(22px);transition:opacity .8s cubic-bezier(.2,.7,.2,1) var(--d,0ms),transform .8s cubic-bezier(.2,.7,.2,1) var(--d,0ms)}
.gp .rv.in{opacity:1;transform:none}
@media (min-width:768px){
  .gp .wrap{padding:0 32px}
  .gp .sec{padding:96px 0}
  .gp .hero{padding:40px 0 84px}
  .gp .hero-media .frame{max-width:520px}
  .gp .chip{padding:8px 13px;font-size:13px;gap:7px}
  .gp .hero-grid{grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);grid-template-areas:"copy media" "act media";column-gap:56px;row-gap:28px;align-items:center}
  .gp .hero-copy{align-self:end}.gp .hero-act{align-self:start}
  .gp .split{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px}
  .gp .split.flip > :first-child{order:2}
  .gp .gal{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));overflow:visible;margin:0;padding:0;gap:20px}
  .gp .gal > button{flex:none}
  .gp .items2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .gp .offer{padding:40px 40px 34px}
  .gp .sbar{display:none}
}
@media (prefers-reduced-motion:reduce){
  .gp .rv,.gp .rv.in{opacity:1;transform:none;transition:none}
  .gp .btn,.gp details{transition:none}
  .gp .hero-media .frame{transform:none}
  .gp .sbar{transition:none}
}
`;

const reducedMotion = () => {
  try {
    return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Tempo máximo escondido: depois disso tudo aparece, mesmo sem o observador disparar. */
export const REVEAL_SAFETY_MS = 1500;

/**
 * Entrada suave ao rolar (classe "rv"). Só anima o que está abaixo da primeira tela; o que já aparece fica parado.
 * Sem IntersectionObserver ou com "reduzir movimento": tudo visível na hora. Rede de segurança: tudo visível em 1,5 s.
 */
function useReveal(dep: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.gp .rv:not(.in)'));
    if (!els.length) return;
    const showAll = () => els.forEach(e => e.classList.add('in'));
    if (typeof window === 'undefined' || !('IntersectionObserver' in window) || reducedMotion()) {
      showAll();
      return;
    }
    const vh = window.innerHeight || 800;
    const below = els.filter(e => {
      if (e.getBoundingClientRect().top < vh) {
        e.classList.add('in');
        return false;
      }
      return true;
    });
    const io = new IntersectionObserver(
      entries => {
        for (const en of entries) {
          if (en.isIntersecting) {
            (en.target as HTMLElement).classList.add('in');
            io.unobserve(en.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -5% 0px' }
    );
    below.forEach(e => io.observe(e));
    const safety = window.setTimeout(showAll, REVEAL_SAFETY_MS);
    return () => {
      io.disconnect();
      window.clearTimeout(safety);
    };
  }, [dep]);
}

const LIGHT_FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap';
const FRESH_FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';

/** Fontes do visual da página (light: Cormorant + Manrope; fresh: Inter), com preconnect. */
function usePageFonts(look: 'light' | 'fresh' | null) {
  useEffect(() => {
    if (!look) return;
    const add = (id: string, attrs: Record<string, string>) => {
      if (document.getElementById(id)) return;
      const l = document.createElement('link');
      l.id = id;
      for (const [k, v] of Object.entries(attrs)) l.setAttribute(k, v);
      document.head.appendChild(l);
    };
    add('gp-preconnect-api', { rel: 'preconnect', href: 'https://fonts.googleapis.com' });
    add('gp-preconnect', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' });
    add(`gp-fonts-${look}`, { rel: 'stylesheet', href: look === 'fresh' ? FRESH_FONTS : LIGHT_FONTS });
  }, [look]);
}

const Items: React.FC<{ items: string[]; two?: boolean }> = ({ items, two }) =>
  items.length ? (
    <ul className={`mt-6 first:mt-0 ${two ? 'items2 space-y-3 md:space-y-0' : 'space-y-3'}`} data-testid="generated-items">
      {items.map((b, k) => (
        <li key={k} className="item">
          <span className="tick" aria-hidden="true">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  ) : null;

/** Blocos do texto na ordem: parágrafos e listas em cartões. */
const Blocks: React.FC<{ blocks: BodyBlock[]; pClass?: string; two?: boolean }> = ({ blocks, pClass = 'txt', two }) => (
  <>
    {blocks.map((b, k) =>
      b.kind === 'p' ? (
        <p key={k} className={`${pClass} ${k ? 'mt-4' : ''}`}>
          {b.text}
        </p>
      ) : (
        <Items key={k} items={b.items} two={two && b.items.length > 3} />
      )
    )}
  </>
);

/** Ícone do papel e, quando a seção tem título próprio, o nome do papel ao lado (sem repetir o título). */
const Kicker: React.FC<{ role: string; withLabel: boolean }> = ({ role, withLabel }) => {
  const { label, Icon } = roleMeta(role);
  return (
    <div className="kicker">
      <span className="ico" aria-hidden="true">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      {withLabel && label}
    </div>
  );
};

/** Título da seção: o nosso; sem título, o nome do papel (ex.: "Como funciona"). */
const SectionHead: React.FC<{ s: PublicGeneratedSection; center?: boolean; dark?: boolean }> = ({ s, center, dark }) => {
  const meta = roleMeta(s.role);
  const hasHeadline = !!s.headline.trim();
  return (
    <div className={center ? 'text-center flex flex-col items-center' : ''}>
      {!dark && <Kicker role={s.role} withLabel={hasHeadline} />}
      <h2 className={`disp h2 ${dark ? '' : 'mt-4'}`}>{hasHeadline ? s.headline : meta.label}</h2>
    </div>
  );
};

/** Botão principal: sempre o link do pagamento (mesmo para todos os botões). */
const Cta: React.FC<{ href: string; label: string; inv?: boolean; full?: boolean }> = ({ href, label, inv, full }) => (
  <a href={href} className={`btn ${inv ? 'inv' : ''} ${full ? 'w-full' : 'w-full sm:w-auto'}`} data-testid="generated-cta">
    {label}
    <ArrowRight aria-hidden="true" className="h-5 w-5" />
  </a>
);

const PayNote: React.FC<{ label: string; center?: boolean; dark?: boolean }> = ({ label, center, dark }) => (
  <p className={`mt-3 flex items-center gap-1.5 text-[13px] ${center ? 'justify-center' : ''} ${dark ? 'opacity-80' : 'muted'}`}>
    <Lock aria-hidden="true" className="h-3.5 w-3.5" /> {label}
  </p>
);

/** Imagem ampliada: foco no X, Tab preso no diálogo, rolagem da página travada; ao fechar, o foco volta a quem abriu. */
const Lightbox: React.FC<{ src: string; alt: string; label: string; onClose: () => void }> = ({ src, alt, label, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Tab') {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      try {
        opener?.focus?.();
      } catch {
        /* nada */
      }
    };
  }, [onClose]);
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={label} onClick={onClose} data-testid="generated-lightbox">
      <img src={src} alt={alt} onClick={e => e.stopPropagation()} />
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar imagem">
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
};

export const GeneratedPage: React.FC = () => {
  const params = useParams<{ slug?: string }>();
  const location = useLocation();
  const slug = safeSlug(params.slug || location.pathname.replace(/^\/v\/?/, '').split('/')[0] || '');
  const [page, setPage] = useState<PublicGeneratedPage | null>(null);
  const [error, setError] = useState<string | null>(slug ? null : 'Página não encontrada.');
  const [zoom, setZoom] = useState<number | null>(null);
  const closeZoom = useCallback(() => setZoom(null), []);

  useEffect(() => {
    captureUrlAttribution();
    if (!slug) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/generated-pages/${encodeURIComponent(slug)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Página não encontrada.');
        if (!alive) return;
        setPage(data as PublicGeneratedPage);
        try {
          trackViewContent({
            contentName: data.title || data.offer?.human_id,
            contentIds: [data.offer?.human_id],
            contentType: 'product',
            value: typeof data.offer?.value === 'number' ? data.offer.value : undefined,
            currency: 'BRL',
            pixelId: data.meta_pixel_id || null
          });
        } catch {
          /* o pixel nunca atrapalha a página */
        }
      } catch (e: any) {
        if (alive) setError(e?.message || 'Página não encontrada.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!page?.title) return;
    const previous = document.title;
    document.title = page.title;
    return () => {
      document.title = previous;
    };
  }, [page?.title]);

  const fresh = page?.theme === 'fresh';
  usePageFonts(page ? (fresh ? 'fresh' : 'light') : null);
  useReveal(page);

  // barra fixa do celular: aparece depois que o botão da abertura sai da tela (some de novo no topo)
  const [barOn, setBarOn] = useState(false);
  useEffect(() => {
    if (!page) return;
    const onScroll = () => setBarOn((window.scrollY || 0) > 420);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [page]);

  if (error || !page) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center px-4 font-sans antialiased ${fresh ? 'bg-[#F7F8F4] text-[#18211C]' : 'bg-[#FAF7F2] text-stone-800'}`}
        data-testid="generated-page-state"
      >
        <p className="text-sm text-stone-500">{error ? 'Esta página não está disponível.' : 'Carregando...'}</p>
      </div>
    );
  }

  const tokens = (fresh ? FRESH_TOKENS : LIGHT) as unknown as React.CSSProperties;
  const href = checkoutHref(page.offer.human_id, location.search);
  const firstCta = page.sections.find(s => s.cta_label.trim())?.cta_label || 'Quero o meu';
  const wa = !!page.whatsapp?.available;
  const allImages = (page.gallery || []).filter(Boolean);
  const pdf = page.delivery_pdf === true;
  const priceSection = page.sections.find(s => s.role === 'OFFER_PRICE' && s.price);
  const price = priceSection?.price || null;
  // forma de pagamento: só o que a oferta aceita (parcelas existem = cartão ligado)
  const card = price ? !!price.installments_text : null;
  const payLabel = card === false ? 'Pagamento seguro por Pix' : card ? 'Pagamento seguro por Pix ou cartão' : 'Pagamento seguro';

  // abertura: a 1ª seção, se for de abrir; senão, título da página + capa do produto e todas as seções seguem normais
  const first = page.sections[0];
  const heroSection = first && !NON_HERO_ROLES.has(first.role) ? first : null;
  const rest = heroSection ? page.sections.slice(1) : page.sections;
  const usedInSections = new Set(rest.map(s => s.image_url).filter(Boolean) as string[]);
  const heroImage = heroSection?.image_url || allImages.find(i => !usedInSections.has(i)) || allImages[0] || null;
  const heroBlocks = bodyBlocks(heroSection?.body || '');
  const heroLead = heroBlocks[0]?.kind === 'p' ? heroBlocks[0].text : null;
  const heroMore: BodyBlock[] = [...(heroLead ? heroBlocks.slice(1) : heroBlocks), ...(heroSection?.bullets.length ? [{ kind: 'list' as const, items: heroSection.bullets }] : [])];
  const heroTitle = heroSection?.headline.trim() || page.title;
  // galeria sem repetir a imagem da abertura; miniaturas da oferta e do fecho com outra imagem quando houver
  const gallery = allImages.filter(i => i !== heroImage);
  const thumb = allImages.find(i => i !== heroImage) || allImages[0] || heroImage;
  const firstOfferOrder = page.sections.find(s => s.role === 'OFFER_PRICE')?.order;

  // "Veja por dentro": depois da primeira seção de conteúdo/apresentação; sem ela, antes da oferta
  const contentSlot = () => {
    const i = rest.findIndex(s => s.role === 'CONTENTS' || s.role === 'PRODUCT_REVEAL');
    if (i >= 0) return i;
    const o = rest.findIndex(s => s.role === 'OFFER_PRICE' || s.role === 'CTA');
    return o > 0 ? o - 1 : o === 0 ? -2 : rest.length - 1;
  };
  const galleryAfter = gallery.length < 2 ? -1 : contentSlot();
  // NORQVA-0155: a prévia em vídeo vem logo depois da galeria (sem galeria, no mesmo lugar em que ela estaria)
  const videoAfter = page.preview_video?.src ? contentSlot() : -1;
  const renderVideo = () =>
    page.preview_video?.src ? (
      <section className="sec" aria-labelledby="gp-vid" data-testid="generated-preview-video">
        <div className="wrap">
          <div className="text-center flex flex-col items-center rv">
            <h2 id="gp-vid" className="disp h2">Veja como é fácil</h2>
            <p className="txt muted mt-3">Um pedacinho da aula: do risco impresso aos primeiros pontos.</p>
          </div>
          <div className="mt-8 flex justify-center">
            <video
              src={page.preview_video.src}
              poster={page.preview_video.poster}
              controls
              playsInline
              preload="none"
              width={720}
              height={1280}
              className="rounded-2xl shadow-lg bg-black object-contain"
              style={{ width: 'min(360px, 45vh, 100%)', height: 'auto', aspectRatio: '9 / 16' }}
              aria-label={`Prévia da aula: ${page.title}`}
            />
          </div>
          <p className="mt-3 text-center text-xs muted">Apresentadora e cenas criadas com IA.</p>
        </div>
      </section>
    ) : null;

  const renderGallery = () => (
    <section className="sec" aria-labelledby="gp-gal" data-testid="generated-gallery">
      <div className="wrap">
        <div className="text-center flex flex-col items-center rv">
          <div className="kicker">
            <span className="ico" aria-hidden="true">
              <BookOpen className="h-[18px] w-[18px]" />
            </span>
            Galeria
          </div>
          <h2 id="gp-gal" className="disp h2 mt-4">
            Veja por dentro
          </h2>
          <p className="txt muted mt-3">Toque numa imagem para ver maior.</p>
          {page.image_note && (
            <p className="mt-2 max-w-xl text-sm muted" data-testid="generated-image-note">
              {page.image_note}
            </p>
          )}
        </div>
        <div className="gal mt-8 rv" style={{ ['--n' as any]: Math.min(gallery.length, 4) }}>
          {gallery.map((src, i) => (
            <button key={src + i} type="button" onClick={() => setZoom(i)} aria-label={`Ver maior: ${page.title}, imagem ${i + 1} de ${gallery.length}`}>
              <span className="frame block">
                <img src={src} alt={`${page.title}: imagem ${i + 1} de ${gallery.length}`} width={1080} height={1080} loading="lazy" decoding="async" />
                <span className="zoom" aria-hidden="true">
                  <ZoomIn className="h-4 w-4" />
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );

  let alt = 0;
  const renderSection = (s: PublicGeneratedSection) => {
    const blocks = bodyBlocks(s.body);
    const paragraphs = paragraphsOf(blocks);
    const items = [...itemsOf(blocks), ...s.bullets];
    const imgAlt = s.headline.trim() || `${page.title}: ${roleMeta(s.role).label.toLowerCase()}`;

    if (s.role === 'OFFER_PRICE') {
      const included = items.length ? items : [...(pdf ? ['Arquivo em PDF para imprimir'] : []), 'Acesso enviado por e-mail'];
      return (
        <section
          key={s.order}
          id={s.order === firstOfferOrder ? 'oferta' : undefined}
          data-testid="generated-section"
          className="sec alt"
          style={{ background: 'linear-gradient(180deg,var(--alt),var(--bg))' }}
        >
          <div className="wrap">
            <div className="offer rv" data-testid="generated-offer">
              <span className="tagp">{roleMeta('OFFER_PRICE').label}</span>
              {thumb && <img src={thumb} alt={page.title} width={112} height={112} loading="lazy" className="mx-auto mb-5 h-28 w-28 rounded-2xl object-cover shadow-md ring-1 ring-black/5" />}
              <h2 className="disp h2" style={{ fontSize: 'clamp(26px,6vw,36px)' }}>
                {s.headline.trim() || page.title}
              </h2>
              {paragraphs.length > 0 && (
                <div className="mt-3">
                  <Blocks blocks={paragraphs.map(text => ({ kind: 'p' as const, text }))} pClass="txt muted" />
                </div>
              )}
              <ul className="mx-auto mt-6 max-w-sm space-y-2.5 text-left" data-testid="generated-offer-items">
                {included.map((b, k) => (
                  <li key={k} className="flex items-start gap-2.5 text-[15.5px] leading-snug" style={{ color: 'var(--body)' }}>
                    <Check aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--accent)' }} strokeWidth={2.6} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="my-7 h-px w-full" style={{ background: 'var(--line)' }} />
              {s.price && (
                <div data-testid="generated-price">
                  <div className="text-[13px] font-bold uppercase tracking-[.18em] muted">Valor</div>
                  <div className="price mt-1">{s.price.price_text}</div>
                  {s.price.installments_text && <div className="mt-2 text-[15px] muted">{s.price.installments_text}</div>}
                </div>
              )}
              {s.note && <p className="mt-4 text-sm muted">{s.note}</p>}
              <div className="mt-7">
                <Cta href={href} label={s.cta_label.trim() || firstCta} full />
                {wa && (
                  <div className="mt-3 flex justify-center">
                    <WhatsAppButton offerHumanId={page.offer.human_id} fallbackHref={href} testId="generated-whatsapp-offer" />
                  </div>
                )}
                <PayNote label={payLabel} center />
                {page.image_note && <p className="mt-3 text-xs muted text-center" data-testid="generated-offer-image-note">{page.image_note}</p>}
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (s.role === 'GUARANTEE') {
      return (
        <section key={s.order} data-testid="generated-section" className="pb-14 pt-2 md:pb-20" style={{ background: 'var(--bg)' }}>
          <div className="wrap">
            <div className="reassure rv" data-testid="generated-guarantee">
              <span className="ico" aria-hidden="true" style={{ width: 48, height: 48 }}>
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[17px] font-extrabold" style={{ color: 'var(--ink)' }}>
                  {s.headline.trim() || roleMeta('GUARANTEE').label}
                </h2>
                {s.note && <p className="mt-1 text-[15px] font-semibold leading-snug" style={{ color: 'var(--body)' }}>{s.note}</p>}
                {blocks.length > 0 && (
                  <div className="mt-2">
                    <Blocks blocks={blocks} pClass="text-[14.5px] leading-relaxed muted whitespace-pre-line" />
                  </div>
                )}
                <Items items={s.bullets} />
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (s.role === 'FAQ') {
      const entries = faqEntries(blocks, s.bullets);
      const bg = alt++ % 2 ? 'alt' : '';
      return (
        <section key={s.order} data-testid="generated-section" className={`sec ${bg}`}>
          <div className="wrap narrow">
            <div className="rv">
              <SectionHead s={s} center />
            </div>
            {entries.length > 0 && (
              <div className="mt-8 space-y-3 rv" data-testid="generated-faq">
                {entries.map((e, k) =>
                  e.kind === 'qa' ? (
                    <details key={k}>
                      <summary>{e.q}</summary>
                      <div className="ans whitespace-pre-line">{e.a}</div>
                    </details>
                  ) : e.kind === 'item' ? (
                    <div key={k} className="item">
                      <span>{e.text}</span>
                    </div>
                  ) : (
                    <p key={k} className="txt muted text-center">
                      {e.text}
                    </p>
                  )
                )}
              </div>
            )}
            {s.note && <p className="mt-4 text-sm muted text-center">{s.note}</p>}
          </div>
        </section>
      );
    }

    if (s.role === 'CTA') {
      return (
        <section key={s.order} data-testid="generated-section" className="sec band">
          <div className="wrap narrow text-center flex flex-col items-center rv">
            {thumb && <img src={thumb} alt="" aria-hidden="true" width={96} height={96} loading="lazy" className="mb-7 h-24 w-24 rounded-2xl object-cover shadow-xl ring-4 ring-white/10" />}
            <SectionHead s={s} center dark />
            {blocks.length > 0 && (
              <div className="mt-4 w-full">
                <Blocks blocks={blocks} />
              </div>
            )}
            <Items items={s.bullets} />
            {s.note && <p className="mt-4 text-sm opacity-80">{s.note}</p>}
            <div className="mt-8 w-full sm:w-auto">
              <Cta href={href} label={s.cta_label.trim() || firstCta} inv />
              {price && <p className="mt-3 text-[15px] font-semibold opacity-90">{price.price_text}{price.installments_text ? ` · ${price.installments_text}` : ''}</p>}
              <PayNote label={payLabel} center dark />
            </div>
          </div>
        </section>
      );
    }

    // seções de texto: fundo alternado, ícone, imagem ao lado (computador) ou acima (celular)
    const bg = alt++ % 2 ? 'alt' : '';
    const flip = alt % 2 === 0;
    const contents = s.role === 'CONTENTS';
    const textBlock = (
      <div className="rv">
        <SectionHead s={s} />
        {blocks.length > 0 && (
          <div className="mt-5">
            <Blocks blocks={blocks} two={contents && !s.image_url} />
          </div>
        )}
        <Items items={s.bullets} two={contents && !s.image_url && s.bullets.length > 3} />
        {s.note && <p className="mt-4 text-sm muted">{s.note}</p>}
        {s.cta_label.trim() && (
          <div className="mt-8">
            <Cta href={href} label={s.cta_label} />
            <PayNote label={payLabel} />
          </div>
        )}
      </div>
    );
    return (
      <section key={s.order} data-testid="generated-section" className={`sec ${bg}`}>
        <div className="wrap">
          {s.image_url ? (
            <div className={`split ${flip ? 'flip' : ''}`}>
              <div className="rv" style={{ ['--d' as any]: '80ms' }}>
                <div className="frame">
                  <img src={s.image_url} alt={imgAlt} loading="lazy" decoding="async" />
                </div>
              </div>
              {textBlock}
            </div>
          ) : (
            <div className="narrow">{textBlock}</div>
          )}
        </div>
      </section>
    );
  };

  const heroExtra = heroMore.length > 0 || !!heroSection?.note;

  return (
    <div className="gp min-h-screen pb-28 md:pb-0" style={tokens} data-testid="generated-page" data-look={fresh ? 'fresh' : 'light'}>
      <style>{CSS}</style>
      <main>
        <section
          data-testid={heroSection ? 'generated-section' : 'generated-hero'}
          data-hero={heroSection ? 'section' : 'title'}
          className="hero"
        >
          <div className="wrap">
            <div className="mb-6 flex items-center justify-between gap-4 md:mb-10">
              <span className="brand">{page.title}</span>
              <a href={href} className="hidden text-sm font-bold underline-offset-4 hover:underline md:inline" style={{ color: 'var(--accent)' }}>
                {firstCta}
              </a>
            </div>
            <div className="hero-grid">
              <div className="hero-copy">
                <div className="kicker">
                  <span className="ico" aria-hidden="true">
                    <Sparkles className="h-[18px] w-[18px]" />
                  </span>
                  Material digital
                </div>
                <h1 className="disp h1 mt-5">{heroTitle}</h1>
                {heroLead && <p className="lead mt-5 md:mt-6 whitespace-pre-line">{heroLead}</p>}
              </div>
              {heroImage && (
                <div className="hero-media">
                  <div className="frame">
                    <img
                      src={heroImage}
                      alt={heroTitle}
                      width={1080}
                      height={1080}
                      loading="eager"
                      decoding="async"
                      {...({ fetchpriority: 'high' } as Record<string, string>)}
                      data-testid="generated-hero-image"
                    />
                  </div>
                </div>
              )}
              <div className="hero-act">
                <Cta href={href} label={heroSection?.cta_label.trim() || firstCta} />
                {wa && (
                  <div className="mt-3">
                    <WhatsAppButton offerHumanId={page.offer.human_id} fallbackHref={href} testId="generated-whatsapp-hero" />
                  </div>
                )}
                <PayNote label={payLabel} />
                <ul className="mt-5 flex flex-wrap gap-1.5 md:gap-2" aria-label="Como funciona a compra" data-testid="generated-trust">
                  {pdf && (
                    <li className="chip">
                      <FileText aria-hidden="true" className="h-4 w-4" /> PDF para imprimir
                    </li>
                  )}
                  <li className="chip">
                    <Mail aria-hidden="true" className="h-4 w-4" /> Acesso por e-mail
                  </li>
                  <li className="chip">
                    {card === false ? <QrCode aria-hidden="true" className="h-4 w-4" /> : <CreditCard aria-hidden="true" className="h-4 w-4" />}
                    {card === false ? 'Pix' : card ? 'Pix ou cartão' : 'Pagamento seguro'}
                  </li>
                </ul>
              </div>
            </div>
            {heroExtra && (
              <div className="narrow mt-12 md:mt-20 rv text-center">
                <div className="mx-auto mb-6 h-px w-16" style={{ background: 'var(--gold)' }} aria-hidden="true" />
                <div className="text-left md:text-center">
                  <Blocks blocks={heroMore} pClass="lead" />
                </div>
                {heroSection?.note && <p className="mt-4 text-sm muted">{heroSection.note}</p>}
              </div>
            )}
          </div>
        </section>
        {galleryAfter === -2 && renderGallery()}
        {videoAfter === -2 && renderVideo()}
        {rest.map((s, i) => (
          <React.Fragment key={s.order}>
            {renderSection(s)}
            {i === galleryAfter && renderGallery()}
            {i === videoAfter && renderVideo()}
          </React.Fragment>
        ))}
      </main>
      <footer className="py-10 text-center text-[13px] muted">
        <div className="wrap">
          {page.title} · produto digital · {payLabel}
        </div>
      </footer>
      {zoom !== null && gallery[zoom] && (
        <Lightbox src={gallery[zoom]} alt={`${page.title}: imagem ${zoom + 1} de ${gallery.length}`} label={`${page.title}: imagem ${zoom + 1}`} onClose={closeZoom} />
      )}
      {/* celular: botão fixo embaixo (com o preço), acima da barra do sistema; escondido = fora da leitura e do Tab */}
      <FloatingWhatsApp available={wa} visible={barOn && zoom === null} offerHumanId={page.offer.human_id} onCheckout={() => goToWhatsApp(href)} />
      <div className={`sbar ${barOn ? 'on' : ''}`} data-testid="generated-sticky-bar" aria-hidden={!barOn}>
        {price && (
          <div className="min-w-0 leading-tight">
            <div className="text-[11px] font-bold uppercase tracking-[.14em] muted">Valor</div>
            <div className="text-[19px] font-extrabold" style={{ color: 'var(--accent)' }}>
              {price.price_text}
            </div>
          </div>
        )}
        <a href={href} className="btn" data-testid="generated-cta-sticky" tabIndex={barOn ? undefined : -1}>
          {firstCta}
        </a>
      </div>
    </div>
  );
};

export default GeneratedPage;
