# NORQVA-0075: oferta depois da compra do Trattoria (+4 livros por R$ 27,90)

**Pedido e autorização:** item 2 do diagnóstico de 15/10/2026 ("oferta depois da compra: os outros 4 livros por R$ 27,90"); Ricardo: "2- Aprovado" em 15/10/2026 10h38. **Risco:** MEDIUM (oferta nova com preço; pagamento e entrega pelos caminhos que já existem).

**Motivo:** a venda média é R$ 23,64 e o anúncio custa mais que isso. Quem acabou de pagar é quem mais compra de novo, e hoje não recebia nenhuma proposta.

**Mudanças:**
- Migration 066: coluna `offers.post_purchase_offer_id` (aditiva). Em bloco `DO`, cria a oferta "COMPLETE A COLEÇÃO — +4 LIVROS" a R$ 27,90, ATIVA, no produto do kit de 5, com os PDFs do kit (OFF-000010) menos o do Trattoria: Dolci, Pães, Antipasti e Risotos. Cartão com as condições do Kit Cozinha Italiana (OFF-000006, mesmo preço), se existir; senão só Pix. Liga o Trattoria (OFF-000001) a ela. Só cria se o Trattoria estiver ativo e sobrarem exatamente 4 PDFs; auditoria `POST_PURCHASE_OFFER_CREATED` ou `POST_PURCHASE_OFFER_SKIPPED`.
- `GET /api/orders/:id` (com o token do comprador): `post_purchase_offer` só para pedido PAGO da conta real cuja oferta principal tem oferta depois da compra ATIVA, se o pedido não tem nenhum dos livros dela (quem levou o Dolci no adicional não vê) e se o comprador ainda não comprou essa oferta.
- Tela de entrega: cartão "Complete a coleção" com as 4 capas e o botão "Quero os 4 livros por R$ 27,90". Abre o mesmo pagamento das outras ofertas (Pix ou cartão); a entrega é a de sempre, só com PAID do Asaas.
- Testes: `norqva_0075_post_purchase_offer.test.ts` (servidor) e `.test.tsx` (tela).

**A decidir com o Ricardo:** quem levou o Dolci no adicional fica sem proposta. Uma oferta de 3 livros (Pães, Antipasti, Risotos) precisaria de preço aprovado.

**Conferir depois do deploy:** auditoria `POST_PURCHASE_OFFER_CREATED` com o código da oferta nova; cadastrar os custos dela (taxa R$ 1,99, imposto 6%).
