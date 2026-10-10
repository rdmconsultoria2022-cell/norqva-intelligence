import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE } from '../../lib/api';
import { CheckoutView } from '../checkout/CheckoutView';
import { PaymentStatus } from '../payment/PaymentStatus';
import { rateLabel } from '../../lib/cardInstallments';
import { captureUrlAttribution, sendFunnelEvent } from '../../services/attribution';
import { savePurchaseSession, updatePurchaseSessionStatus } from '../../services/purchaseSession';
import { trackViewContent } from '../../services/metaPixel';

// NORQVA-0038: página de vendas do Kit Cozinha Italiana (Trattoria em Casa + Dolci della Nonna).
// Preços, parcelas e "de/por" vêm sempre da oferta no servidor; nada de valor fixo aqui.
// Depoimentos só entram quando houver depoimentos reais, com autorização (a lista abaixo fica vazia até lá).

type PublicKitOffer = {
  id: string;
  human_id: string;
  name: string;
  description: string;
  price: number;
  promotional_price: number | null;
  is_demo: boolean;
  meta_pixel_id?: string | null;
  bump?: any;
  card?: { max_installments: number; total: number; installment_value: number; interest_monthly?: number; options?: { n: number; installment_value: number | null; total: number; interest: boolean }[] } | null;
};

/** Depoimentos reais (nome, cidade, texto), só com autorização do cliente. Vazio = a seção não aparece. */
const TESTIMONIALS: { text: string; who: string }[] = [];

const IMG = '/images/kit';
const brl = (n: number) => `R$ ${(Math.round(n * 100) / 100).toFixed(2).replace('.', ',')}`;

const CSS = `
.kl{font-family:'Manrope',system-ui,sans-serif;color:#1f1b17;background:#faf7f2;overflow:hidden}
.kl a{color:#8a3a26}
.kl .wrap{max-width:1200px;margin:0 auto;padding:0 32px;box-sizing:border-box;position:relative}
.kl .serif{font-family:'Cormorant Garamond',Georgia,serif}
.kl .btn{display:inline-flex;align-items:center;justify-content:center;gap:12px;min-height:54px;padding:0 34px;border-radius:4px;background:#8a3a26;color:#fffaf3;border:0;cursor:pointer;text-decoration:none;font-family:'Manrope',sans-serif;font-weight:600;font-size:14px;letter-spacing:.12em;text-transform:uppercase}
.kl .btn:hover{background:#6b2b1b}
.kl .btn.line{background:transparent;color:#1f1b17;border:1px solid #1f1b17}
.kl .btn.line:hover{background:#1f1b17;color:#faf7f2}
.kl .link{font-weight:600;font-size:14px;color:#1f1b17;text-decoration:none;border-bottom:1px solid #b89b72;padding-bottom:3px}
.kl .kicker{display:flex;align-items:center;gap:14px;font-weight:600;font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:#8a6b45}
.kl .kicker:before{content:"";width:36px;height:1px;background:#b89b72}
.kl .kicker.c{justify-content:center}
.kl .kicker.c:after{content:"";width:36px;height:1px;background:#b89b72}
.kl .h2{margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:clamp(34px,4.2vw,56px);line-height:1.05;color:#1f1b17}
.kl .lead{margin:0;font-size:17px;line-height:1.75;color:#5a5249}
.kl .arch{border-radius:999px 999px 6px 6px;overflow:hidden}
.kl .arch img,.kl .plate img{width:100%;height:100%;object-fit:cover;display:block}
.kl .plate{border-radius:50%;overflow:hidden;box-shadow:0 14px 30px rgba(60,40,25,.18)}
.kl .frost{background:rgba(255,255,255,.75);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.9);box-shadow:0 10px 30px rgba(60,40,25,.10)}
.kl .book{position:relative;transform:perspective(1400px) rotateY(-20deg);box-shadow:20px 24px 34px rgba(60,40,25,.28);border-radius:1px 3px 3px 1px}
.kl .book img{display:block;width:100%;height:auto}
.kl .book.r{transform:perspective(1400px) rotateY(16deg)}
.kl .carousel{display:flex;gap:32px;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px 32px 28px;scrollbar-width:none}
.kl .carousel::-webkit-scrollbar{display:none}
.kl .carousel > *{scroll-snap-align:start;flex:0 0 auto;width:224px}
.kl .cov{width:224px;aspect-ratio:663/936;border-radius:2px 4px 4px 2px;overflow:hidden;position:relative;box-shadow:0 18px 30px rgba(60,40,25,.20)}
.kl .cov img{width:100%;height:100%;object-fit:cover;display:block}
.kl .soon{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:26px;box-sizing:border-box;background:#efe7da}
.kl .spread{display:flex;box-shadow:0 30px 60px rgba(60,40,25,.20);border-radius:3px;overflow:hidden;aspect-ratio:1.42/1}
.kl .spread > div{flex:1 1 0}
.kl .spread img{display:block;width:100%;height:100%;object-fit:cover}
.kl .strike{text-decoration:line-through;color:#8d8377}
.kl .tick{display:flex;gap:14px;align-items:flex-start;font-size:15px;line-height:1.55;color:#3d3731}
.kl details summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:17px;font-weight:600;min-height:32px}
.kl details summary::-webkit-details-marker{display:none}
.kl details summary:after{content:"+";font-family:'Cormorant Garamond',serif;font-size:30px;color:#8a6b45}
.kl details[open] summary:after{content:"–"}
.kl .gal{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:230px;gap:16px}
.kl .gal figure{margin:0;position:relative;overflow:hidden;border-radius:3px}
.kl .gal img{width:100%;height:100%;object-fit:cover;display:block}
.kl .gal figcaption{position:absolute;left:12px;bottom:12px;padding:7px 12px;border-radius:3px;font-family:'Cormorant Garamond',serif;font-size:17px}
@media (max-width:960px){.kl .hero3,.kl .two{grid-template-columns:minmax(0,1fr)!important;gap:40px!important}.kl .seals{grid-template-columns:repeat(2,minmax(0,1fr))!important}.kl .gal{grid-template-columns:repeat(2,minmax(0,1fr))}.kl .gal > :first-child{grid-column:span 2!important;grid-row:auto!important}.kl .nav{display:none!important}}
@media (max-width:560px){.kl .wrap{padding:0 18px}.kl .price{font-size:58px!important}}
`;

const Tick: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="tick">
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a3a26" strokeWidth="1.8" style={{ flex: '0 0 auto', marginTop: 3 }}>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
    <span>{children}</span>
  </div>
);

export const KitLandingPage: React.FC<{ showError: (m: string) => void; showSuccess: (m: string) => void }> = ({ showError, showSuccess }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const humanId = decodeURIComponent(location.pathname.replace(/^\/kit\/?/, '').split('/')[0] || '').trim();
  const [offer, setOffer] = useState<PublicKitOffer | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);

  useEffect(() => {
    const id = 'kl-fonts';
    if (!document.getElementById(id)) {
      const l = document.createElement('link');
      l.id = id;
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&display=swap';
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    captureUrlAttribution();
    if (!humanId) {
      setFail('Oferta não encontrada.');
      return;
    }
    fetch(`${API_BASE}/public/offers/${encodeURIComponent(humanId)}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Oferta não encontrada ou indisponível.');
        if (!alive) return;
        setOffer(data);
        document.title = data.name;
        sendFunnelEvent('OFFER_VIEW', data.human_id || humanId, { offer_name: data.name }, data.is_demo);
        try {
          const v = Number(data.promotional_price ?? data.price);
          trackViewContent({ contentName: data.name, contentIds: [data.human_id || humanId], contentType: 'product', value: v, currency: 'BRL', pixelId: data.meta_pixel_id || null });
        } catch (_) {}
      })
      .catch(e => alive && setFail(e.message || 'Oferta indisponível.'));
    return () => {
      alive = false;
    };
  }, [humanId]);

  const openCheckout = () => {
    if (!offer) return;
    sendFunnelEvent('CHECKOUT_MODAL_OPENED', offer.human_id, { offer_name: offer.name }, offer.is_demo);
    setShowCheckout(true);
  };

  if (fail) {
    return (
      <div className="kl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <style>{CSS}</style>
        <p className="lead">{fail}</p>
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="kl" style={{ minHeight: '100vh' }}>
        <style>{CSS}</style>
      </div>
    );
  }

  const pix = offer.promotional_price !== null && offer.promotional_price !== undefined ? Number(offer.promotional_price) : Number(offer.price);
  const from = offer.promotional_price !== null && offer.promotional_price !== undefined ? Number(offer.price) : null;
  const card = offer.card && offer.card.max_installments > 1 ? offer.card : null;
  const savings = from !== null ? from - pix : 0;
  // NORQVA-0041: maior número de parcelas com juros (repassados ao comprador), se houver
  const maxWithInterest = card?.options?.filter(o => o.interest).reduce((m, o) => Math.max(m, o.n), 0) || 0;
  const ctaLabel = card ? `Quero o kit · ${card.max_installments}x ${brl(card.installment_value)}` : `Quero o kit por ${brl(pix)}`;

  return (
    <div className="kl">
      <style>{CSS}</style>

      <div style={{ background: '#1f1b17', color: '#e9dfcf', textAlign: 'center', padding: '10px 16px', fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase' }}>
        Oferta de lançamento · os dois livros juntos com desconto
      </div>

      <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #e6dccd' }}>
        <div className="serif" style={{ fontSize: 22, letterSpacing: '.14em', textTransform: 'uppercase', lineHeight: 1 }}>
          Cozinha Italiana
          <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 9.5, letterSpacing: '.42em', color: '#8a6b45', marginTop: 5 }}>em casa · coleção</div>
        </div>
        <nav className="nav" style={{ display: 'flex', gap: 36, fontSize: 14 }}>
          <a href="#colecao" style={{ color: '#4a433b', textDecoration: 'none' }}>A coleção</a>
          <a href="#dentro" style={{ color: '#4a433b', textDecoration: 'none' }}>Por dentro</a>
          <a href="#receitas" style={{ color: '#4a433b', textDecoration: 'none' }}>Receitas</a>
          <a href="#perguntas" style={{ color: '#4a433b', textDecoration: 'none' }}>Dúvidas</a>
        </nav>
        <a className="btn line" href="#oferta" style={{ minHeight: 44, padding: '0 22px', fontSize: 12 }}>Ver o kit</a>
      </div>

      {/* Topo */}
      <div className="wrap" style={{ paddingTop: 72, paddingBottom: 88 }}>
        <div style={{ textAlign: 'center', maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
          <div className="kicker c">Livros digitais de receitas italianas</div>
          <h1 className="serif" style={{ margin: 0, fontWeight: 500, fontSize: 'clamp(44px,6.4vw,88px)', lineHeight: 0.98 }}>
            A cozinha da <span style={{ fontStyle: 'italic', color: '#8a3a26' }}>nonna</span>,<br />explicada receita por receita.
          </h1>
          <p className="lead" style={{ maxWidth: 600 }}>
            Massas frescas, molhos clássicos, pizzas e os doces de família da Itália, com foto de cada prato e medidas precisas para dar certo já na primeira vez.
          </p>
        </div>

        <div className="hero3" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr) minmax(0,1fr)', gap: 56, alignItems: 'center', marginTop: 64 }}>
          <div>
            <div style={{ paddingBottom: 24, borderBottom: '1px solid #e6dccd' }}>
              <div className="serif" style={{ fontSize: 58, lineHeight: 0.9, color: '#8a3a26' }}>38</div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', marginTop: 10 }}>Receitas</div>
              <div style={{ fontSize: 14, color: '#6b6358', marginTop: 6, lineHeight: 1.6 }}>Massas, molhos, pizzas, pães e sobremesas italianas.</div>
            </div>
            <div style={{ padding: '24px 0', borderBottom: '1px solid #e6dccd' }}>
              <div className="serif" style={{ fontSize: 58, lineHeight: 0.9, color: '#8a3a26' }}>94</div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', marginTop: 10 }}>Páginas ilustradas</div>
              <div style={{ fontSize: 14, color: '#6b6358', marginTop: 6, lineHeight: 1.6 }}>Uma foto de página inteira para cada receita.</div>
            </div>
            <div style={{ paddingTop: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase' }}>Entrega imediata</div>
              <div style={{ fontSize: 14, color: '#6b6358', marginTop: 6, lineHeight: 1.6 }}>Link de download no seu e-mail assim que o pagamento é confirmado.</div>
            </div>
          </div>

          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <div className="arch" style={{ position: 'relative', width: '100%', maxWidth: 400, aspectRatio: '3 / 4', boxShadow: '0 40px 80px rgba(60,40,25,.22)' }}>
              <img src={`${IMG}/nonna.jpg`} alt="Senhora abrindo massa fresca com rolo de madeira numa cozinha iluminada" style={{ objectPosition: 'center 18%' }} />
            </div>
            <div className="frost" style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', padding: '14px 22px', borderRadius: 4, whiteSpace: 'nowrap' }}>
              <div className="serif" style={{ fontSize: 19, fontStyle: 'italic' }}>Feito à mão, como na Itália</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
            {[
              ['trat_carbonara', 'Trattoria', 'Carbonara', 'cremosa, sem creme de leite'],
              ['dolci_tiramisu', 'Dolci', 'Tiramisù', 'a receita clássica de família'],
              ['trat_pizza', 'Trattoria', 'Pizza', 'massa de fermentação lenta']
            ].map(([img, book, name, note]) => (
              <div key={img} style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div className="plate" style={{ width: 120, height: 120, flex: '0 0 auto' }}>
                  <img src={`${IMG}/${img}.jpg`} alt={name} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: '#8a6b45' }}>{book}</div>
                  <div className="serif" style={{ fontSize: 26, lineHeight: 1.1, marginTop: 4 }}>{name}</div>
                  <div style={{ fontSize: 13, color: '#6b6358', marginTop: 4 }}>{note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28, flexWrap: 'wrap', marginTop: 72 }}>
          <button className="btn" onClick={openCheckout} data-testid="kit-cta-top">Quero o kit completo</button>
          <a className="link" href="#dentro">Ver por dentro dos livros</a>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e6dccd', borderBottom: '1px solid #e6dccd', background: '#f4eee4' }}>
        <div className="wrap seals" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 24, paddingTop: 26, paddingBottom: 26, fontSize: 14, color: '#3d3731' }}>
          <span>Celular, tablet e computador</span>
          <span>Medidas em gramas e xícaras</span>
          <span>Tempo e nível em cada receita</span>
          <span>{card ? `Pix ou cartão em até ${Math.max(card.max_installments, maxWithInterest)}x` : 'Pagamento seguro via Pix'}</span>
        </div>
      </div>

      {/* Coleção */}
      <div id="colecao" style={{ paddingTop: 112, paddingBottom: 72 }}>
        <div className="wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 32, flexWrap: 'wrap', marginBottom: 36 }}>
          <div style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="kicker">01 · A coleção</div>
            <h2 className="h2">Uma biblioteca de cozinha italiana que cresce com você</h2>
          </div>
          <p className="lead" style={{ maxWidth: 360, fontSize: 15 }}>Dois títulos já disponíveis e novos livros entrando na coleção. Arraste para conhecer.</p>
        </div>
        <div className="carousel" style={{ maxWidth: 1264, margin: '0 auto', boxSizing: 'border-box' }}>
          {[
            { img: 'capa_trat', name: 'Trattoria em Casa', note: '28 receitas · massas, molhos e pizzas' },
            { img: 'capa_dolci', name: 'Dolci della Nonna', note: '10 doces italianos de família' }
          ].map(b => (
            <div key={b.img} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="cov"><img src={`${IMG}/${b.img}.jpg`} alt={`Capa ${b.name}`} /></div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: '#2f5a3d' }}>Incluído no kit</div>
                <div className="serif" style={{ fontSize: 24, marginTop: 6 }}>{b.name}</div>
                <div style={{ fontSize: 14, color: '#6b6358', marginTop: 2 }}>{b.note}</div>
              </div>
            </div>
          ))}
          {[
            ['Volume III', 'Pães & Fermentação Natural', '#efe7da'],
            ['Volume IV', 'Antipasti & Aperitivo', '#ecdcd2'],
            ['Volume V', 'Risotos & Polentas', '#e2e5d6']
          ].map(([vol, name, bg]) => (
            <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="cov soon" style={{ background: bg }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.3em', textTransform: 'uppercase', color: '#8a6b45' }}>{vol}</div>
                <div className="serif" style={{ fontSize: 30, color: '#3a322a', marginTop: 14, lineHeight: 1.08 }}>{name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: '#8d8377' }}>Em breve · não incluído no kit</div>
                <div className="serif" style={{ fontSize: 24, marginTop: 6 }}>{name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Por dentro */}
      <div id="dentro" style={{ background: '#f4eee4', paddingTop: 112, paddingBottom: 112, borderTop: '1px solid #e6dccd', borderBottom: '1px solid #e6dccd' }}>
        <div className="wrap two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 80, alignItems: 'center' }}>
          <div className="spread">
            <div><img src={`${IMG}/trat_carbonara.jpg`} alt="Página de foto da receita de carbonara" /></div>
            <div style={{ background: '#fffdf8' }}><img src={`${IMG}/pag_trat.jpg`} alt="Página da receita com ingredientes e modo de preparo" style={{ objectFit: 'contain' }} /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="kicker">02 · Por dentro</div>
            <h2 className="h2">Cada receita abre com uma foto de página inteira</h2>
            <p className="lead">Na página ao lado: rendimento, tempo, nível, ingredientes separados por etapa, modo de preparo numerado, o erro mais comum e como conservar.</p>
            <Tick>Massa fresca à mão, sem máquina, com a proporção certa</Tick>
            <Tick>Molhos clássicos explicados do jeito italiano</Tick>
            <Tick>Tiramisù, cannoli e panna cotta de confeitaria</Tick>
          </div>
        </div>
      </div>

      {/* Receitas */}
      <div id="receitas" style={{ paddingTop: 112, paddingBottom: 112 }}>
        <div className="wrap">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center', marginBottom: 52 }}>
            <div className="kicker c">03 · Algumas das receitas</div>
            <h2 className="h2">Do primeiro prato à sobremesa</h2>
          </div>
          <div className="gal">
            <figure style={{ gridColumn: 'span 2', gridRow: 'span 2' }}>
              <img src={`${IMG}/trat_ragu.jpg`} alt="Ragù alla bolognese" />
              <figcaption className="frost" style={{ fontSize: 20 }}>Ragù alla bolognese</figcaption>
            </figure>
            {[
              ['trat_ravioli', 'Ravioli'],
              ['dolci_cannoli', 'Cannoli'],
              ['trat_pesto', 'Pesto alla genovese'],
              ['dolci_pannacotta', 'Panna cotta']
            ].map(([img, name]) => (
              <figure key={img}>
                <img src={`${IMG}/${img}.jpg`} alt={name} />
                <figcaption className="frost">{name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>

      {/* Oferta */}
      <div id="oferta" style={{ paddingTop: 112, paddingBottom: 120, background: 'linear-gradient(180deg,#faf7f2 0%,#f1e6d8 100%)', borderTop: '1px solid #e6dccd' }}>
        <div className="wrap">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center', marginBottom: 60 }}>
            <div className="kicker c">04 · Oferta de lançamento</div>
            <h2 className="h2" style={{ maxWidth: 760 }}>Os dois livros juntos, por menos</h2>
          </div>
          <div className="two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 72, alignItems: 'center' }}>
            <div style={{ position: 'relative', height: 340 }}>
              <div className="book r" style={{ position: 'absolute', width: '40%', left: '12%', top: 28, zIndex: 1 }}><img src={`${IMG}/capa_dolci.jpg`} alt="Capa do livro Dolci della Nonna" /></div>
              <div className="book" style={{ position: 'absolute', width: '44%', right: '12%', top: 0, zIndex: 2 }}><img src={`${IMG}/capa_trat.jpg`} alt="Capa do livro Trattoria em Casa" /></div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e6dccd', borderRadius: 6, padding: 44, display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 40px 80px rgba(60,40,25,.12)', position: 'relative' }} data-testid="kit-offer-card">
              <div style={{ position: 'absolute', top: 0, left: 44, right: 44, height: 3, background: '#8a3a26' }} />
              <div className="kicker" style={{ fontSize: 11 }}>{offer.name}</div>
              <div className="serif" style={{ fontSize: 28, lineHeight: 1.15 }}>Trattoria em Casa + Dolci della Nonna</div>
              {from !== null && (
                <div style={{ fontSize: 15, color: '#8d8377' }}>
                  de <span className="strike">{brl(from)}</span> por
                </div>
              )}
              {card ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 26, fontWeight: 600, color: '#8a3a26' }}>{card.max_installments}x</span>
                    <span className="serif price" style={{ fontSize: 80, fontWeight: 600, lineHeight: 0.9, color: '#8a3a26' }} data-testid="kit-installment">{brl(card.installment_value)}</span>
                  </div>
                  <div style={{ fontSize: 14, color: '#5a5249' }}>sem juros no cartão de crédito · total {brl(card.total)}{maxWithInterest > card.max_installments ? ` · ou em até ${maxWithInterest}x com juros de ${rateLabel(Number(card.interest_monthly) || 0)}` : ''}</div>
                  <div style={{ padding: '14px 18px', background: '#f4eee4', borderRadius: 4, fontSize: 16 }} data-testid="kit-pix">
                    ou <strong>{brl(pix)}</strong> à vista no Pix{savings > 0 ? ` · economia de ${brl(savings)}` : ''}
                  </div>
                </>
              ) : (
                <div className="serif price" style={{ fontSize: 80, fontWeight: 600, lineHeight: 0.9, color: '#8a3a26' }} data-testid="kit-pix">{brl(pix)}</div>
              )}
              <div style={{ height: 1, background: '#e6dccd' }} />
              <Tick>38 receitas com foto e passo a passo</Tick>
              <Tick>Guia de harmonização de massas e molhos</Tick>
              <Tick>Download no e-mail assim que o pagamento é confirmado</Tick>
              <button className="btn" onClick={openCheckout} style={{ width: '100%', minHeight: 60 }} data-testid="kit-cta">
                Quero o kit
              </button>
              <div style={{ textAlign: 'center', fontSize: 13, color: '#6b6358' }}>{card ? 'Pix ou cartão de crédito em ambiente seguro' : 'Pagamento via Pix em ambiente seguro'}</div>
            </div>
          </div>
        </div>
      </div>

      {TESTIMONIALS.length > 0 && (
        <div style={{ paddingTop: 112, paddingBottom: 104 }}>
          <div className="wrap">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center', marginBottom: 52 }}>
              <div className="kicker c">Leitores</div>
              <h2 className="h2">O que dizem os leitores</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 24 }}>
              {TESTIMONIALS.map(t => (
                <div key={t.who} style={{ background: '#fff', border: '1px solid #e6dccd', borderRadius: 4, padding: 34 }}>
                  <p className="serif" style={{ margin: 0, fontSize: 21, lineHeight: 1.5, fontStyle: 'italic' }}>“{t.text}”</p>
                  <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8a6b45' }}>{t.who}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dúvidas */}
      <div id="perguntas" style={{ paddingTop: 104, paddingBottom: 112 }}>
        <div className="wrap two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)', gap: 72, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="kicker">05 · Dúvidas</div>
            <h2 className="h2">Perguntas frequentes</h2>
            <p className="lead" style={{ fontSize: 15 }}>Não encontrou o que procura? Escreva para <a href="mailto:suporte@norqva.com">suporte@norqva.com</a>.</p>
          </div>
          <div>
            {[
              ['Os livros são físicos?', 'Não. São livros digitais em PDF, com acabamento de livro impresso. Leia no celular, no tablet ou no computador, ou imprima.'],
              ['Como recebo depois de pagar?', 'Assim que o pagamento é confirmado (Pix ou cartão), você recebe no e-mail o link para baixar os dois livros.'],
              ['Preciso de equipamento profissional?', 'Não. As receitas foram pensadas para a cozinha de casa, com rolo, faca e forno comum.'],
              ['E se eu não gostar?', 'Você tem 7 dias a partir da compra para pedir o reembolso, como garante o Código de Defesa do Consumidor. Basta escrever para suporte@norqva.com.']
            ].map(([q, a], i) => (
              <details key={q} style={{ borderTop: '1px solid #ddd0bd', borderBottom: i === 3 ? '1px solid #ddd0bd' : undefined, padding: '22px 0' }}>
                <summary>{q}</summary>
                <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.7, color: '#5a5249' }}>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', overflow: 'hidden', borderTop: '1px solid #e6dccd' }}>
        <img src={`${IMG}/trat_focaccia.jpg`} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(250,247,242,.96) 0%,rgba(250,247,242,.88) 45%,rgba(250,247,242,.35) 100%)' }} />
        <div className="wrap" style={{ paddingTop: 112, paddingBottom: 112 }}>
          <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}>
            <div className="kicker">Comece hoje</div>
            <h2 className="h2">Hoje à noite, o jantar pode ser uma <span style={{ fontStyle: 'italic', color: '#8a3a26' }}>massa feita por você</span>.</h2>
            <button className="btn" onClick={openCheckout}>{ctaLabel}</button>
          </div>
        </div>
      </div>

      <div style={{ background: '#f4eee4', borderTop: '1px solid #e6dccd' }}>
        <div className="wrap" style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', paddingTop: 40, paddingBottom: 40, fontSize: 13, color: '#6b6358' }}>
          <span className="serif" style={{ fontSize: 18, letterSpacing: '.14em', textTransform: 'uppercase', color: '#1f1b17' }}>Cozinha Italiana em Casa</span>
          <span>Atendimento: <a href="mailto:suporte@norqva.com">suporte@norqva.com</a></span>
          <span>© {new Date().getFullYear()} NORQVA Intelligence Ltda.</span>
        </div>
      </div>

      {showCheckout && (
        <CheckoutView
          offer={offer as any}
          isDemo={offer.is_demo}
          initialCustomer={customerDraft}
          onCustomerChange={setCustomerDraft}
          onOrderCreated={order => {
            setShowCheckout(false);
            if (order?.id && order?.checkout_token) {
              savePurchaseSession({ orderId: order.id, checkoutToken: order.checkout_token, offerHumanId: offer.human_id, status: 'PENDING', offerName: offer.name });
            }
            setActiveOrder(order);
          }}
          onCancel={() => setShowCheckout(false)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}

      {activeOrder && (
        <PaymentStatus
          orderId={activeOrder.id}
          checkoutToken={activeOrder.checkout_token}
          amount={activeOrder.total_amount || pix}
          paymentMethod={activeOrder.payment_method === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX'}
          installments={activeOrder.installments}
          look="light"
          accent="#8a3a26"
          isDemo={offer.is_demo}
          onPaymentConfirmed={() => {
            updatePurchaseSessionStatus(activeOrder.id, 'PAID');
            navigate(`/pedido/${activeOrder.id}/entrega#token=${activeOrder.checkout_token}`);
          }}
          onBackToCheckout={() => {
            setActiveOrder(null);
            setShowCheckout(true);
          }}
          onClose={() => setActiveOrder(null)}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}
    </div>
  );
};
