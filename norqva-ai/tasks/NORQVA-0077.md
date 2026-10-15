# NORQVA-0077: tirar "7 dias para pedir reembolso" da página do kit

**Pedido:** Ricardo, 15/10/2026 12h24. **Autorização:** mudança de texto (D-0037). **Risco:** LOW

**Mudanças** (`KitLandingPage.tsx`):
- Topo: sai "7 dias para pedir reembolso" da lista de garantias (ficam "Entrega imediata no e-mail" e a forma de pagamento).
- Faixa de números: o cartão "7 Dias de garantia, para pedir o reembolso" (mesma frase) vira "1 Pagamento único, sem mensalidade nem assinatura", para a faixa continuar com 4 números.
- Mantida a pergunta "E se eu não gostar?" nas dúvidas, que explica o direito de arrependimento do Código de Defesa do Consumidor (vale por lei de qualquer forma).
- Teste `norqva_0070_kit_motion.test.tsx` ajustado.
