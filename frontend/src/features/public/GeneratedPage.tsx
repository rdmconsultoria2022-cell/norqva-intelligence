import React, { useEffect, useRef, useState } from 'react';
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
  meta_pixel_id?: string | null;
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

/** Texto da seção em parágrafos e itens de lista (linhas que começam com "-", "•" ou "1."). Só reorganiza o nosso texto. */
export function splitBody(text: string): { paragraphs: string[]; items: string[] } {
  const paragraphs: string[] = [];
  const items: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const p = buf.join('\n').trim();
    if (p) paragraphs.push(p);
    buf = [];
  };
  for (const line of String(text || '').split('\n')) {
    const m = line.match(LIST_LINE);
    if (m) {
      flush();
      const it = m[1].trim().replace(/[;,]\s*$/, '');
      if (it) items.push(it);
    } else if (!line.trim()) flush();
    else buf.push(line.trim());
  }
  flush();
  return { paragraphs, items };
}

/** "Pergunta? Resposta." -> pergunta e resposta (sem "?" seguido de texto, fica só a pergunta). */
export function splitQa(item: string): { q: string; a: string } {
  const t = String(item || '').trim();
  const i = t.indexOf('?');
  if (i > 0 && i < t.length - 1) return { q: t.slice(0, i + 1).trim(), a: t.slice(i + 1).trim() };
  return { q: t, a: '' };
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

/** Entrada suave ao rolar (classe "rv"). Sem IntersectionObserver ou com "reduzir movimento": tudo já visível. */
function useReveal(dep: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.gp .rv:not(.in)'));
    if (!els.length) return;
    if (typeof window === 'undefined' || !('IntersectionObserver' in window) || reducedMotion()) {
      els.forEach(e => e.classList.add('in'));
      return;
    }
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
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [dep]);
}

const FONT_LINK_ID = 'gp-fonts';
function useLightFonts(active: boolean) {
  useEffect(() => {
    if (!active || document.getElementById(FONT_LINK_ID)) return;
    const l = document.createElement('link');
    l.id = FONT_LINK_ID;
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(l);
  }, [active]);
}

const Items: React.FC<{ items: string[]; two?: boolean }> = ({ items, two }) =>
  items.length ? (
    <ul className={`mt-6 ${two ? 'items2 space-y-3 md:space-y-0' : 'space-y-3'}`} data-testid="generated-items">
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

const Paragraphs: React.FC<{ list: string[]; className?: string }> = ({ list, className = 'txt' }) => (
  <>
    {list.map((p, k) => (
      <p key={k} className={`${className} ${k ? 'mt-4' : ''}`}>
        {p}
      </p>
    ))}
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

export const GeneratedPage: React.FC = () => {
  const params = useParams<{ slug?: string }>();
  const location = useLocation();
  const slug = safeSlug(params.slug || location.pathname.replace(/^\/v\/?/, '').split('/')[0] || '');
  const [page, setPage] = useState<PublicGeneratedPage | null>(null);
  const [error, setError] = useState<string | null>(slug ? null : 'Página não encontrada.');
  const [zoom, setZoom] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
  useLightFonts(!!page && !fresh);
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

  useEffect(() => {
    if (zoom === null) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

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
  const gallery = (page.gallery || []).filter(Boolean);
  const priceSection = page.sections.find(s => s.role === 'OFFER_PRICE' && s.price);
  const price = priceSection?.price || null;
  // forma de pagamento: só o que a oferta aceita (parcelas existem = cartão ligado)
  const card = price ? !!price.installments_text : null;
  const payLabel = card === false ? 'Pagamento seguro por Pix' : card ? 'Pagamento seguro por Pix ou cartão' : 'Pagamento seguro';
  const [hero, ...rest] = page.sections;
  const heroImage = hero?.image_url || gallery[0] || null;
  const heroParts = splitBody(hero?.body || '');
  const heroItems = [...heroParts.items, ...(hero?.bullets || [])];
  const thumb = gallery[0] || heroImage;

  // "Veja por dentro": depois da primeira seção de conteúdo/apresentação; sem ela, antes da oferta
  const galleryAfter = (() => {
    if (gallery.length < 2) return -1;
    const i = rest.findIndex(s => s.role === 'CONTENTS' || s.role === 'PRODUCT_REVEAL');
    if (i >= 0) return i;
    const o = rest.findIndex(s => s.role === 'OFFER_PRICE' || s.role === 'CTA');
    return o > 0 ? o - 1 : o === 0 ? -2 : rest.length - 1;
  })();

  const Cta: React.FC<{ label?: string; inv?: boolean; full?: boolean }> = ({ label, inv, full }) => (
    <a href={href} className={`btn ${inv ? 'inv' : ''} ${full ? 'w-full' : 'w-full sm:w-auto'}`} data-testid="generated-cta">
      {label || firstCta}
      <ArrowRight aria-hidden="true" className="h-5 w-5" />
    </a>
  );

  const PayNote: React.FC<{ center?: boolean; dark?: boolean }> = ({ center, dark }) => (
    <p className={`mt-3 flex items-center gap-1.5 text-[13px] ${center ? 'justify-center' : ''} ${dark ? 'opacity-80' : 'muted'}`}>
      <Lock aria-hidden="true" className="h-3.5 w-3.5" /> {payLabel}
    </p>
  );

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
        </div>
        <div className="gal mt-8 rv" style={{ ['--n' as any]: Math.min(gallery.length, 4) }}>
          {gallery.map((src, i) => (
            <button key={src + i} type="button" onClick={() => setZoom(i)} aria-label={`Ver maior: ${page.title}, imagem ${i + 1} de ${gallery.length}`}>
              <span className="frame block">
                <img src={src} alt={`${page.title}: imagem ${i + 1} de ${gallery.length}`} loading="lazy" decoding="async" />
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
    const parts = splitBody(s.body);
    const items = [...parts.items, ...s.bullets];
    const imgAlt = s.headline.trim() || `${page.title}: ${roleMeta(s.role).label.toLowerCase()}`;

    if (s.role === 'OFFER_PRICE') {
      const included = items.length ? items : ['Arquivo em PDF para imprimir', 'Acesso enviado por e-mail'];
      return (
        <section key={s.order} id="oferta" data-testid="generated-section" className="sec alt" style={{ background: 'linear-gradient(180deg,var(--alt),var(--bg))' }}>
          <div className="wrap">
            <div className="offer rv" data-testid="generated-offer">
              <span className="tagp">{roleMeta('OFFER_PRICE').label}</span>
              {thumb && (
                <img src={thumb} alt={page.title} loading="lazy" className="mx-auto mb-5 h-28 w-28 rounded-2xl object-cover shadow-md ring-1 ring-black/5" />
              )}
              <h2 className="disp h2" style={{ fontSize: 'clamp(26px,6vw,36px)' }}>
                {s.headline.trim() || page.title}
              </h2>
              {parts.paragraphs.length > 0 && (
                <div className="mt-3">
                  <Paragraphs list={parts.paragraphs} className="txt muted" />
                </div>
              )}
              <ul className="mx-auto mt-6 max-w-sm space-y-2.5 text-left">
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
                <Cta label={s.cta_label.trim() || firstCta} full />
                <PayNote center />
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
                {parts.paragraphs.length > 0 && (
                  <div className="mt-2">
                    <Paragraphs list={parts.paragraphs} className="text-[14.5px] leading-relaxed muted whitespace-pre-line" />
                  </div>
                )}
                <Items items={items} />
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (s.role === 'FAQ') {
      const qas = items.map(splitQa);
      const bg = alt++ % 2 ? 'alt' : '';
      return (
        <section key={s.order} data-testid="generated-section" className={`sec ${bg}`}>
          <div className="wrap narrow">
            <div className="rv">
              <SectionHead s={s} center />
            </div>
            {parts.paragraphs.length > 0 && (
              <div className="mt-5 text-center rv">
                <Paragraphs list={parts.paragraphs} className="txt muted" />
              </div>
            )}
            {qas.length > 0 && (
              <div className="mt-8 space-y-3 rv" data-testid="generated-faq">
                {qas.map((qa, k) =>
                  qa.a ? (
                    <details key={k}>
                      <summary>{qa.q}</summary>
                      <div className="ans">{qa.a}</div>
                    </details>
                  ) : (
                    <div key={k} className="item">
                      <span>{qa.q}</span>
                    </div>
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
            {thumb && <img src={thumb} alt="" aria-hidden="true" loading="lazy" className="mb-7 h-24 w-24 rounded-2xl object-cover shadow-xl ring-4 ring-white/10" />}
            <SectionHead s={s} center dark />
            {parts.paragraphs.length > 0 && (
              <div className="mt-4">
                <Paragraphs list={parts.paragraphs} />
              </div>
            )}
            <Items items={items} />
            {s.note && <p className="mt-4 text-sm opacity-80">{s.note}</p>}
            <div className="mt-8 w-full sm:w-auto">
              <Cta label={s.cta_label.trim() || firstCta} inv />
              {price && <p className="mt-3 text-[15px] font-semibold opacity-90">{price.price_text}{price.installments_text ? ` · ${price.installments_text}` : ''}</p>}
              <PayNote center dark />
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
        {parts.paragraphs.length > 0 && (
          <div className="mt-5">
            <Paragraphs list={parts.paragraphs} />
          </div>
        )}
        <Items items={items} two={contents && !s.image_url && items.length > 3} />
        {s.note && <p className="mt-4 text-sm muted">{s.note}</p>}
        {s.cta_label.trim() && (
          <div className="mt-8">
            <Cta label={s.cta_label} />
            <PayNote />
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

  return (
    <div className="gp min-h-screen pb-28 md:pb-0" style={tokens} data-testid="generated-page" data-look={fresh ? 'fresh' : 'light'}>
      <style>{CSS}</style>
      <main>
        {hero && (
          <section key={hero.order} data-testid="generated-section" className="hero">
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
                  <h1 className="disp h1 mt-5">{hero.headline.trim() || page.title}</h1>
                  {heroParts.paragraphs[0] && <p className="lead mt-5 md:mt-6">{heroParts.paragraphs[0]}</p>}
                </div>
                {heroImage && (
                  <div className="hero-media">
                    <div className="frame">
                      <img src={heroImage} alt={hero.headline.trim() || page.title} loading="eager" decoding="async" data-testid="generated-hero-image" />
                    </div>
                  </div>
                )}
                <div className="hero-act">
                  <Cta label={hero.cta_label.trim() || firstCta} />
                  <PayNote />
                  <ul className="mt-5 flex flex-wrap gap-1.5 md:gap-2" aria-label="Como funciona a compra" data-testid="generated-trust">
                    <li className="chip">
                      <FileText aria-hidden="true" className="h-4 w-4" /> PDF para imprimir
                    </li>
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
              {(heroParts.paragraphs.length > 1 || heroItems.length > 0 || hero.note) && (
                <div className="narrow mt-12 md:mt-20 rv text-center">
                  <div className="mx-auto mb-6 h-px w-16" style={{ background: 'var(--gold)' }} aria-hidden="true" />
                  <Paragraphs list={heroParts.paragraphs.slice(1)} className="lead" />
                  <Items items={heroItems} />
                  {hero.note && <p className="mt-4 text-sm muted">{hero.note}</p>}
                </div>
              )}
            </div>
          </section>
        )}
        {galleryAfter === -2 && renderGallery()}
        {rest.map((s, i) => (
          <React.Fragment key={s.order}>
            {renderSection(s)}
            {i === galleryAfter && renderGallery()}
          </React.Fragment>
        ))}
      </main>
      <footer className="py-10 text-center text-[13px] muted">
        <div className="wrap">
          {page.title} · produto digital · {payLabel}
        </div>
      </footer>
      {zoom !== null && gallery[zoom] && (
        <div className="lb" role="dialog" aria-modal="true" aria-label={`${page.title}: imagem ${zoom + 1}`} onClick={() => setZoom(null)} data-testid="generated-lightbox">
          <img src={gallery[zoom]} alt={`${page.title}: imagem ${zoom + 1} de ${gallery.length}`} onClick={e => e.stopPropagation()} />
          <button ref={closeRef} type="button" onClick={() => setZoom(null)} aria-label="Fechar imagem">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
      {/* celular: botão fixo embaixo (com o preço), acima da barra do sistema */}
      <div className={`sbar ${barOn ? 'on' : ''}`} data-testid="generated-sticky-bar">
        {price && (
          <div className="min-w-0 leading-tight">
            <div className="text-[11px] font-bold uppercase tracking-[.14em] muted">Valor</div>
            <div className="text-[19px] font-extrabold" style={{ color: 'var(--accent)' }}>
              {price.price_text}
            </div>
          </div>
        )}
        <a href={href} className="btn" data-testid="generated-cta-sticky">
          {firstCta}
        </a>
      </div>
    </div>
  );
};

export default GeneratedPage;
