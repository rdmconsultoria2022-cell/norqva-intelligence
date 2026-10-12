import React, { useState } from 'react';
import { API_BASE } from '../../lib/api';
import { getAttributionContext } from '../../services/attribution';

// NORQVA-0054 (contrato NORQVA-0053 item 3): página → WhatsApp → pagamento.
// Com o WhatsApp da marca disponível, o botão principal abre a conversa com a mensagem pronta e um
// código de origem (campanha, anúncio, clique). "Pagar aqui mesmo" continua como opção menor: se o
// WhatsApp cair, as vendas não param. Sem WhatsApp disponível, a página fica como antes (children).

export async function requestWhatsAppLink(offerHumanId: string): Promise<string> {
  const ctx = getAttributionContext();
  const res = await fetch(`${API_BASE}/public/whatsapp/ref`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offer_human_id: offerHumanId,
      visitor_id: ctx.visitor_id,
      session_id: ctx.session_id,
      fbclid: ctx.fbclid,
      fbc: ctx.fbc,
      fbp: ctx.fbp,
      utm_source: ctx.utm_source,
      utm_medium: ctx.utm_medium,
      utm_campaign: ctx.utm_campaign,
      utm_content: ctx.utm_content,
      attribution_metadata: {
        campaign_id: ctx.campaign_id,
        adset_id: ctx.adset_id,
        ad_id: ctx.ad_id,
        placement: ctx.placement,
        site_source_name: ctx.site_source_name
      },
      event_source_url: typeof window !== 'undefined' ? window.location.href : null
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) throw new Error(data?.error || 'WhatsApp indisponível agora.');
  return String(data.url);
}

const WA_GREEN = '#1F8F4E';

// abre o WhatsApp (trocável nos testes: o jsdom não deixa mudar window.location)
let navigate = (url: string) => {
  window.location.href = url;
};
export function goToWhatsApp(url: string) {
  navigate(url);
}
export function setWhatsAppNavigatorForTests(fn: ((url: string) => void) | null) {
  navigate = fn || ((url: string) => {
    window.location.href = url;
  });
}

export const BuyChoice: React.FC<{
  available: boolean;
  offerHumanId: string;
  onCheckout: () => void;
  testId?: string;
  dark?: boolean;
  children: React.ReactNode;
}> = ({ available, offerHumanId, onCheckout, testId, dark, children }) => {
  const [busy, setBusy] = useState(false);
  if (!available) return <>{children}</>;
  const go = async () => {
    setBusy(true);
    try {
      goToWhatsApp(await requestWhatsAppLink(offerHumanId));
    } catch {
      // WhatsApp fora do ar: segue a compra pela página
      onCheckout();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, width: '100%', maxWidth: 420, minWidth: 0 }} data-testid={testId || 'buy-choice'}>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        data-testid="whatsapp-cta"
        style={{
          width: '100%',
          minHeight: 56,
          border: 'none',
          borderRadius: 12,
          background: WA_GREEN,
          color: '#fff',
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: '.02em',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.75 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          boxShadow: '0 10px 24px rgba(31,143,78,.28)'
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.2-.3-.2-.5-.3Z" />
        </svg>
        <span>{busy ? 'Abrindo o WhatsApp…' : 'Quero pelo WhatsApp'}</span>
      </button>
      <button
        type="button"
        onClick={onCheckout}
        data-testid="pay-here-link"
        style={{
          background: 'none',
          border: 'none',
          padding: 4,
          color: dark ? '#cbd5e1' : '#6b5b4b',
          fontSize: 13,
          textDecoration: 'underline',
          cursor: 'pointer'
        }}
      >
        Prefere pagar aqui mesmo? Pix ou cartão
      </button>
    </div>
  );
};
