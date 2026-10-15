# NORQVA-0069: ofertas de saída no Voltar do pagamento do kit (R$ 49,90 e R$ 39,90)

**Pedido e aprovação:** Ricardo, 15/10/2026: ao clicar em Voltar no pagamento do kit, mostrar "Você desbloqueou uma oferta especial: kit completo por apenas R$ 49,90"; se voltar de novo, outra proposta por R$ 39,90. Contrato com as contas (a R$ 49,90 sobra cerca de R$ 45 e a R$ 39,90 cerca de R$ 35 depois de imposto e taxa do Pix) e "Aprovado" do Ricardo em 15/10/2026. **Risco:** MEDIUM (preço e pagamento).

- Migration 063: coluna `offers.exit_offer_id` (aditiva) e, em bloco `DO`, duas ofertas ATIVAS do mesmo produto da OFF-000010, com os mesmos 5 PDFs e o mesmo cartão: R$ 49,90 e R$ 39,90. OFF-000010 → R$ 49,90 → R$ 39,90. Só cria se a OFF-000010 estiver ativa, entregar exatamente 5 PDFs e não tiver oferta de saída. Auditoria `EXIT_OFFER_CREATED` ou `EXIT_OFFERS_SKIPPED`.
- `GET /api/public/offers/:id` devolve `exit_offer: { human_id }` (só se a oferta de saída estiver ATIVA).
- Checkout (`CheckoutView`): o botão Voltar mostra a proposta (`ExitOfferScreen`). Aceitar abre o mesmo pagamento com a oferta de saída (o servidor cobra o preço dela; sem livros avulsos). Voltar de novo mostra a seguinte. O último Voltar fecha.
- Proteções: uma vez por navegador (`localStorage`), nada em modo demo, nada para quem já gerou o pedido (a tela de pagamento já substituiu o checkout), e a proposta só aparece se for mais barata que a oferta atual.
- Resultados: cada degrau vende como oferta própria (OFF-... de saída), então dá para comparar. Revisar com 20 vendas: se mais de 1 em 3 vier das saídas, tirar a de R$ 39,90.
- Testes: `norqva_0069_exit_offers.test.tsx`, `norqva_0069_exit_offer_public.test.ts`.
