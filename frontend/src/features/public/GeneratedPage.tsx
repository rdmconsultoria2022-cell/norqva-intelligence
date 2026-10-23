import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Check, Lock } from 'lucide-react';
import { API_BASE } from '../../lib/api';
import { captureUrlAttribution } from '../../services/attribution';
import { FRESH, FRESH_BUTTON_STYLE } from '../../lib/productLook';

// NORQVA-0116 (D-0116): página de venda gerada (texto 100% nosso) e publicada pelo dono em /v/:slug.
// Visual das páginas do comprador ('light' creme e terracota, ou 'fresh' do Seca Barriga). Os botões levam
// ao pagamento do NORQVA (/p/<oferta>?checkout=1) mantendo os parâmetros de origem (UTMs, fbclid...).
// O PageView da Meta sai pelo App (rota pública do comprador), como nas outras páginas.

export interface PublicGeneratedSection {
  order: number;
  role: string;
  headline: string;
  body: string;
  bullets: string[];
  cta_label: string;
  image_url: string | null;
}

export interface PublicGeneratedPage {
  slug: string;
  theme: 'light' | 'fresh';
  title: string;
  offer: { human_id: string };
  sections: PublicGeneratedSection[];
  meta_pixel_id?: string | null;
}

/** Link do pagamento: ?checkout=1 + todos os parâmetros que vieram no link da página (UTMs, fbclid...). */
export function checkoutHref(offerHumanId: string, search: string): string {
  const incoming = new URLSearchParams(search || '');
  const out = new URLSearchParams();
  out.set('checkout', '1');
  incoming.forEach((v, k) => {
    if (k !== 'checkout') out.append(k, v);
  });
  return `/p/${encodeURIComponent(offerHumanId)}?${out.toString()}`;
}

const paragraphs = (text: string) =>
  String(text || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

export const GeneratedPage: React.FC = () => {
  const params = useParams<{ slug?: string }>();
  const location = useLocation();
  const slug = decodeURIComponent(params.slug || location.pathname.replace(/^\/v\/?/, '').split('/')[0] || '').trim();
  const [page, setPage] = useState<PublicGeneratedPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    captureUrlAttribution();
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/generated-pages/${encodeURIComponent(slug)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Página não encontrada.');
        if (alive) setPage(data as PublicGeneratedPage);
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
  const shell = fresh ? 'bg-[#F7F8F4] text-[#18211C]' : 'bg-[#FAF7F2] text-stone-800';

  if (error || !page) {
    return (
      <div className={`min-h-screen flex items-center justify-center px-4 font-sans antialiased ${shell}`} data-testid="generated-page-state">
        <p className="text-sm text-stone-500">{error ? 'Esta página não está disponível.' : 'Carregando...'}</p>
      </div>
    );
  }

  const href = checkoutHref(page.offer.human_id, location.search);
  const firstCta = page.sections.find(s => s.cta_label.trim())?.cta_label || 'Quero o meu';
  const heading = fresh ? 'font-bold text-[#18211C]' : 'font-serif text-stone-900';
  const button = `inline-flex w-full sm:w-auto min-h-[52px] items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-bold text-white shadow-lg transition active:scale-95 ${
    fresh ? 'hover:brightness-95' : 'bg-[#B83B1E] hover:bg-[#8F2810]'
  }`;

  return (
    <div className={`min-h-screen font-sans antialiased pb-24 sm:pb-0 ${shell}`} data-testid="generated-page" data-look={fresh ? 'fresh' : 'light'}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        {page.sections.map((s, i) => {
          const hero = i === 0;
          const H = (hero ? 'h1' : 'h2') as keyof JSX.IntrinsicElements;
          return (
            <section
              key={s.order}
              data-testid="generated-section"
              className={`py-10 sm:py-14 ${i > 0 ? `border-t ${fresh ? 'border-[#E3E7DF]' : 'border-stone-200'}` : ''}`}
            >
              {s.image_url && (
                <img
                  src={s.image_url}
                  alt=""
                  loading={hero ? 'eager' : 'lazy'}
                  className="mb-6 w-full rounded-2xl object-cover shadow-md aspect-[3/2]"
                />
              )}
              {s.headline && (
                <H className={`${heading} ${hero ? 'text-3xl sm:text-4xl leading-tight' : 'text-2xl sm:text-3xl leading-snug'} mb-4 break-words`}>{s.headline}</H>
              )}
              {paragraphs(s.body).map((p, k) => (
                <p key={k} className={`mb-4 whitespace-pre-line leading-relaxed ${hero ? 'text-lg' : 'text-base'} ${fresh ? 'text-[#2C3A31]' : 'text-stone-700'}`}>
                  {p}
                </p>
              ))}
              {s.bullets.length > 0 && (
                <ul className="mb-4 space-y-2">
                  {s.bullets.map((b, k) => (
                    <li key={k} className="flex gap-2 leading-relaxed">
                      <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" style={{ color: fresh ? FRESH.to : '#B83B1E' }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.cta_label.trim() && (
                <div className="mt-6">
                  <a href={href} className={button} style={fresh ? FRESH_BUTTON_STYLE : undefined} data-testid="generated-cta">
                    {s.cta_label}
                  </a>
                  <p className={`mt-2 flex items-center gap-1 text-xs ${fresh ? 'text-[#5B665F]' : 'text-stone-500'}`}>
                    <Lock aria-hidden="true" className="h-3 w-3" /> Pagamento seguro por Pix ou cartão
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </main>
      {/* celular: botão fixo embaixo */}
      <div className={`fixed inset-x-0 bottom-0 border-t p-3 sm:hidden ${fresh ? 'bg-white/95 border-[#E3E7DF]' : 'bg-[#FAF7F2]/95 border-stone-200'}`}>
        <a href={href} className={button} style={fresh ? FRESH_BUTTON_STYLE : undefined} data-testid="generated-cta-sticky">
          {firstCta}
        </a>
      </div>
    </div>
  );
};

export default GeneratedPage;
