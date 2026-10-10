# NORQVA-0042: "Checkout da oferta" da tela mostra o cartão e a capa certa

**Branch:** `ai/NORQVA-0042-checkout-cartao-tela` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** correção de tela (D-0037, sem aprovação prévia) · **Risco:** LOW

## Motivo

Ricardo (10/10/2026 18h35): pelo botão "Checkout da oferta" (Produtos) o kit só mostrava Pix. A tela usava a oferta interna, que não traz as condições do cartão. Além disso, o resumo do produto mostrava uma capa quebrada (arquivo inexistente) e "28 Preparações" até no kit.

## Escopo

- "Checkout da oferta" busca as condições públicas da oferta (cartão e adicional), as mesmas que o comprador vê. Sem resposta, segue só com Pix como antes.
- Resumo do checkout: capa do Trattoria, do Dolci ou as duas (kit), e descrição de acordo com o livro.
- Nada muda em pagamento: o servidor continua decidindo valores e parcelas.
