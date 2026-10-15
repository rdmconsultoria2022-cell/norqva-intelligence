# NORQVA-0068: botão "Pagar com cartão" sem texto na página do kit

**Pedido:** Ricardo, 15/10/2026 (print do modal "Aguardando pagamento com cartão"). **Autorização:** correção de erro de tela (D-0037). Só cor do texto do link; pagamento, cobrança e entrega não mudam. **Risco:** LOW

**Causa:** a página do kit pinta todo link de terracota (`.kl a{color:#8a3a26}`). O botão "Pagar com cartão em ambiente seguro" é um link com fundo terracota, e essa regra (mais específica que `text-white`) deixava o texto da mesma cor do fundo.

**Correção:** o link do botão ganha `style={{ color: '#fff' }}` em `PaymentStatus.tsx` (visual `light`). Teste em `norqva_0041_installments.test.tsx`.
