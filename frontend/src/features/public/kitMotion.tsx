import React, { useEffect, useRef, useState } from 'react';

// NORQVA-0070: movimento e 3D da página do kit. Tudo respeita "reduzir movimento" do aparelho e, sem IntersectionObserver
// (testes, navegadores antigos), mostra o conteúdo parado e completo. Só usa transform e opacity, que rodam na placa de vídeo.

const reduced = () => {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const canObserve = () => typeof window !== 'undefined' && 'IntersectionObserver' in window;
const animated = () => canObserve() && !reduced();

export const KIT_MOTION_CSS = `
.kl{overflow-x:clip}
/* entrada ao rolar */
.kl .rv{opacity:0;transform:translateY(30px);transition:opacity .9s cubic-bezier(.2,.7,.2,1) var(--d,0ms),transform .9s cubic-bezier(.2,.7,.2,1) var(--d,0ms)}
.kl .rv.fl-l{transform:translateX(-40px)}
.kl .rv.fl-r{transform:translateX(40px)}
.kl .rv.zoom{transform:scale(.94)}
.kl .rv.in{opacity:1;transform:none}
.kl .up{animation:kl-up 1s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d,0ms)}
@keyframes kl-up{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes kl-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-11px)}}
@keyframes kl-shine{0%{transform:translateX(-120%) skewX(-18deg)}60%,100%{transform:translateX(220%) skewX(-18deg)}}
@keyframes kl-pulse{0%,100%{box-shadow:0 0 0 0 rgba(138,58,38,.35)}60%{box-shadow:0 0 0 14px rgba(138,58,38,0)}}
/* barra de progresso e cabeçalho fixo */
.kl .prog{position:fixed;left:0;top:0;height:3px;width:100%;transform-origin:left;transform:scaleX(var(--sp,0));background:linear-gradient(90deg,#b89b72,#8a3a26);z-index:49;pointer-events:none}
.kl [id]{scroll-margin-top:84px}
.kl .hdr{position:sticky;top:0;z-index:50;background:rgba(250,247,242,.0);transition:background .3s,box-shadow .3s,backdrop-filter .3s}
.kl .hdr.on{background:rgba(250,247,242,.88);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);box-shadow:0 6px 24px rgba(60,40,25,.08)}
.kl .hdr .wrap{transition:padding .3s}
.kl .hdr.on .wrap{padding-top:14px!important;padding-bottom:14px!important}
/* botões com brilho */
.kl .btn.shine{position:relative;overflow:hidden;isolation:isolate}
.kl .btn.shine:after{content:"";position:absolute;top:0;bottom:0;width:38%;left:0;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.28),rgba(255,255,255,0));animation:kl-shine 3.8s ease-in-out infinite;z-index:-1}
.kl .btn.pulse{animation:kl-pulse 2.6s ease-out infinite}
.kl .btn.pulse:hover{animation:none}
.kl .btn{transition:background .2s,transform .2s,box-shadow .2s}
.kl .btn:hover{transform:translateY(-2px);box-shadow:0 14px 28px rgba(138,58,38,.28)}
.kl .btn:active{transform:translateY(0)}
/* livro 3D */
.kl .b3{--d:22px;position:relative;width:100%;aspect-ratio:663/936;perspective:1500px}
.kl .b3 .fl{position:absolute;inset:0;transform-style:preserve-3d;animation:kl-float var(--ft,6.5s) ease-in-out var(--fd,0s) infinite}
.kl .b3 .bi{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateY(calc(var(--ry,-24deg) + var(--mx,0)*9deg)) rotateX(calc(var(--my,0)*-5deg));transition:transform .8s cubic-bezier(.2,.7,.2,1)}
.kl .b3:hover .bi{transform:rotateY(calc(var(--ry,-24deg)*.2)) rotateX(0deg) translateY(-8px) scale(1.03)}
.kl .b3 .f{position:absolute;inset:0;transform:translateZ(calc(var(--d)/2));border-radius:2px 5px 5px 2px;overflow:hidden;background:#1d1a17;backface-visibility:hidden}
.kl .b3 .f img{width:100%;height:100%;object-fit:cover;display:block}
.kl .b3 .f:after{content:"";position:absolute;inset:0;background:linear-gradient(104deg,rgba(255,255,255,.26) 0,rgba(255,255,255,.05) 9%,rgba(255,255,255,0) 22%,rgba(255,255,255,0) 62%,rgba(0,0,0,.22) 100%);pointer-events:none}
.kl .b3 .f:before{content:"";position:absolute;left:4.5%;top:0;bottom:0;width:2px;background:linear-gradient(180deg,rgba(0,0,0,.4),rgba(255,255,255,.18),rgba(0,0,0,.4));z-index:2;pointer-events:none}
.kl .b3 .sp{position:absolute;top:0;left:0;width:var(--d);height:100%;transform-origin:left center;transform:translateZ(calc(var(--d)/-2)) rotateY(-90deg);background:linear-gradient(90deg,#0c0b0a,#2a2622 45%,#141210);border-radius:2px 0 0 2px}
.kl .b3 .pg{position:absolute;top:2.5%;right:0;width:var(--d);height:95%;transform-origin:right center;transform:translateZ(calc(var(--d)/-2)) rotateY(90deg);background:repeating-linear-gradient(90deg,#f3ecdc 0 1.5px,#d8ceb6 1.5px 3px)}
.kl .b3 .bk{position:absolute;inset:0;transform:translateZ(calc(var(--d)/-2)) rotateY(180deg);background:#14110f;border-radius:2px 5px 5px 2px}
.kl .b3 .sh{position:absolute;left:6%;right:-14%;bottom:-5%;height:9%;background:radial-gradient(ellipse at 50% 50%,rgba(40,25,15,.55),rgba(40,25,15,0) 70%);filter:blur(7px);transform:translateZ(-2px)}
/* pilha de livros */
.kl .stk{position:relative;width:100%;aspect-ratio:1.32/1;perspective:1700px;transform-style:preserve-3d}
.kl .stk.lg{aspect-ratio:1.2/1}
.kl .stk .stkb{position:absolute;transform:translate3d(calc(var(--mx,0)*var(--px,0)*1px),0,var(--z,0px));transform-style:preserve-3d;transition:transform .8s cubic-bezier(.2,.7,.2,1)}
.kl .stk .b3{perspective:none}
.kl .stk .b3 .bi{--d:20px}
/* pratos flutuantes */
.kl .chip{position:absolute;border-radius:50%;overflow:hidden;box-shadow:0 18px 36px rgba(60,40,25,.28);border:5px solid #fffaf3;animation:kl-float var(--ft,7s) ease-in-out var(--fd,0s) infinite}
.kl .chip img{width:100%;height:100%;object-fit:cover;display:block}
/* galeria, spread e arco */
.kl .gal figure img{transition:transform .9s cubic-bezier(.2,.7,.2,1)}
.kl .gal figure:hover img{transform:scale(1.07)}
.kl .spread{transition:transform .8s cubic-bezier(.2,.7,.2,1),box-shadow .8s;transform-style:preserve-3d}
.kl .spread-wrap{perspective:1600px}
.kl .spread-wrap:hover .spread{transform:rotateY(-5deg) rotateX(2deg);box-shadow:30px 40px 70px rgba(60,40,25,.26)}
.kl .arch img{transition:transform 1.2s cubic-bezier(.2,.7,.2,1)}
.kl .arch:hover img{transform:scale(1.05)}
.kl .dish .plate{transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.kl .dish:hover .plate{transform:rotate(8deg) scale(1.05)}
.kl .cta-bg img{transform:translateY(calc(var(--cp,0)*-36px)) scale(1.12)}
/* faixa de números */
.kl .stat{padding:8px 0}
.kl .stat+.stat{border-left:1px solid #ddd0bd;padding-left:32px}
/* barra de compra no celular */
.kl .sbar{position:fixed;left:0;right:0;bottom:0;z-index:55;display:none;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(255,250,243,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid #e6dccd;box-shadow:0 -10px 30px rgba(60,40,25,.12);transform:translateY(115%);transition:transform .45s cubic-bezier(.2,.7,.2,1)}
.kl .sbar.on{transform:none}
.kl .sbar .btn{min-height:48px;padding:0 22px;font-size:12px;white-space:nowrap}
.kl .hdr .btn{white-space:nowrap}
@media (min-width:961px){
  .kl .stk.lg{width:112%;margin-left:-6%}
}
@media (max-width:960px){
  .kl .sbar{display:flex}
  .kl .hero-grid{grid-template-columns:minmax(0,1fr)!important;gap:36px!important}
  .kl .hero-copy{align-items:center!important;text-align:center}
  .kl .hero-copy .cta-row,.kl .hero-copy .trust{justify-content:center!important}
  .kl .stats4{grid-template-columns:repeat(2,minmax(0,1fr))!important;row-gap:22px!important}
  .kl .stat:nth-child(odd){border-left:0;padding-left:0}
  .kl .stat+.stat{padding-left:22px}
  .kl .sticky-l{position:static!important}
  .kl .strip{grid-template-columns:minmax(0,1fr)!important}
  .kl .strip-arch{max-width:340px;margin:0 auto}
}
@media (max-width:560px){
  .kl .stk{aspect-ratio:1.18/1}
  .kl .chip{display:none}
  .kl .stat+.stat{padding-left:16px}
}
@media (prefers-reduced-motion:reduce){
  .kl .rv,.kl .rv.in{opacity:1;transform:none;transition:none}
  .kl .up{animation:none}
  .kl .b3 .fl,.kl .chip,.kl .btn.shine:after,.kl .btn.pulse{animation:none}
  .kl .b3 .bi,.kl .stk .stkb,.kl .spread,.kl .gal figure img,.kl .arch img,.kl .dish .plate{transition:none}
  .kl .sbar{transition:none}
  .kl .cta-bg img{transform:scale(1.05)}
}
`;

/** Marca como visíveis, ao entrar na tela, os elementos com a classe "rv". `dep` refaz a busca quando o conteúdo muda. */
export function useRevealOnScroll(dep: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.kl .rv:not(.in)'));
    if (els.length === 0) return;
    if (!animated()) {
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
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [dep]);
}

/** Rolagem: barra de progresso, cabeçalho fixo, parallax do fecho e barra de compra do celular (some quando a oferta está na tela). */
export function useKitScroll(rootRef: React.RefObject<HTMLElement>, active: boolean) {
  const [scrolled, setScrolled] = useState(false);
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const root = rootRef.current;
      if (!root) return;
      const y = window.scrollY || 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      root.style.setProperty('--sp', String(Math.min(1, y / max)));
      setScrolled(y > 24);
      const offer = document.getElementById('oferta');
      const final = document.getElementById('fecho');
      const vh = window.innerHeight || 800;
      let offerOn = false;
      if (offer) {
        const r = offer.getBoundingClientRect();
        offerOn = r.top < vh * 0.7 && r.bottom > vh * 0.15;
      }
      setShowBar(y > 520 && !offerOn);
      if (final && !reduced()) {
        const r = final.getBoundingClientRect();
        root.style.setProperty('--cp', String(Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh))));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [active, rootRef]);
  return { scrolled, showBar };
}

/** Número que sobe até o valor quando entra na tela. Sem animação, mostra o valor final já no primeiro quadro. */
export const Counter: React.FC<{ value: number }> = ({ value }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(animated() ? 0 : value);
  useEffect(() => {
    if (!animated() || !ref.current) {
      setN(value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / 1300);
          setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 }
    );
    io.observe(ref.current);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [value]);
  return <span ref={ref}>{n}</span>;
};

type Css = React.CSSProperties & Record<string, string | number>;

/** Livro em 3D de verdade: capa, lombada, borda das páginas e fundo. Inclina ao passar o mouse e flutua devagar. */
export const Book3D: React.FC<{ src: string; alt: string; ry?: number; depth?: number; float?: number; delay?: number; eager?: boolean; style?: Css }> = ({
  src, alt, ry = -24, depth = 22, float = 6.5, delay = 0, eager = false, style
}) => (
  <div className="b3" style={{ ['--ry' as any]: `${ry}deg`, ['--d' as any]: `${depth}px`, ['--ft' as any]: `${float}s`, ['--fd' as any]: `${delay}s`, ...style } as Css}>
    <div className="fl">
      <div className="bi">
        <div className="f"><img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} /></div>
        <div className="sp" />
        <div className="pg" />
        <div className="bk" />
      </div>
    </div>
    <div className="sh" />
  </div>
);

export type StackBook = { src: string; alt: string };

// posições da pilha (esquerda → direita): largura e posição em % da pilha, inclinação, profundidade e parallax do mouse
const FIVE = [
  { left: 0, w: 20, bottom: 16, ry: 28, z: 0, px: -14 },
  { left: 15, w: 27, bottom: 10, ry: 15, z: 40, px: -8 },
  { left: 32.5, w: 35, bottom: 3, ry: 0, z: 90, px: 0 },
  { left: 58, w: 27, bottom: 10, ry: -15, z: 40, px: 8 },
  { left: 80, w: 20, bottom: 16, ry: -28, z: 0, px: 14 }
];
const FIVE_LG = [
  { left: 0, w: 23, bottom: 36, ry: 26, z: 0, px: -14 },
  { left: 12.5, w: 31, bottom: 27, ry: 14, z: 40, px: -8 },
  { left: 29, w: 42, bottom: 17, ry: 0, z: 90, px: 0 },
  { left: 56.5, w: 31, bottom: 27, ry: -14, z: 40, px: 8 },
  { left: 77, w: 23, bottom: 36, ry: -26, z: 0, px: 14 }
];
const TWO = [
  { left: 12, w: 40, bottom: 8, ry: 20, z: 0, px: -10 },
  { left: 40, w: 46, bottom: 2, ry: -14, z: 60, px: 8 }
];

/** Pilha de livros em leque: reage ao mouse e, sem mouse (celular), os livros só flutuam. Cinco livros ou dois. `eager` carrega as capas na hora (topo da página). */
export const BookStack: React.FC<{ books: StackBook[]; testId?: string; ariaLabel?: string; large?: boolean; eager?: boolean }> = ({ books, testId, ariaLabel, large, eager }) => {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const set = (mx: number, my: number) => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = ref.current;
      if (!el) return;
      el.style.setProperty('--mx', mx.toFixed(3));
      el.style.setProperty('--my', my.toFixed(3));
    });
  };
  const layout = books.length === 2 ? TWO : large ? FIVE_LG : FIVE;
  return (
    <div
      ref={ref}
      className={`stk${large ? ' lg' : ''}`}
      data-testid={testId}
      role="img"
      aria-label={ariaLabel}
      onMouseMove={e => {
        if (reduced()) return;
        const r = e.currentTarget.getBoundingClientRect();
        set(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
      }}
      onMouseLeave={() => set(0, 0)}
    >
      {books.map((b, i) => {
        const p = layout[i] || layout[layout.length - 1];
        return (
          <div key={b.src} className="stkb" style={{ left: `${p.left}%`, width: `${p.w}%`, bottom: `${p.bottom}%`, ['--z' as any]: `${p.z}px`, ['--px' as any]: p.px } as Css}>
            <Book3D src={b.src} alt={b.alt} ry={p.ry} depth={books.length === 2 ? 22 : 18} float={6 + (i % 3) * 0.9} delay={-i * 1.1} eager={eager} />
          </div>
        );
      })}
    </div>
  );
};
