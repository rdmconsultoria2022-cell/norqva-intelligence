# NORQVA-0128: botão flutuante do WhatsApp na página do kit

**Branch:** `ai/NORQVA-0128-whatsapp-flutuante` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** mudança de tela (D-0037, sem aprovação prévia); pedido do Ricardo em 25/10/2026 01h24 · **Risco:** LOW

## Escopo

- `FloatingWhatsApp` em `features/public/WhatsAppChoice.tsx`: botão verde "Falar no WhatsApp" fixo no canto direito, aparece quando a pessoa passa da primeira dobra (mesmo gatilho da barra fixa `barOn`) e some com o pagamento aberto ou pedido em andamento. No celular fica acima da barra "Ver ofertas".
- Mesmo caminho do botão principal: `requestWhatsAppLink` (código de origem, campanha, anúncio); se falhar, abre o pagamento da página.
- Só aparece com `offer.whatsapp.available` (número conectado e atendente ligado), como o botão principal.
- Usado em `KitLandingPage.tsx` (`/kit/<oferta>`).

Nada muda em preço, cobrança ou entrega. Testes em `norqva_0054_whatsapp_cta.test.tsx`.
