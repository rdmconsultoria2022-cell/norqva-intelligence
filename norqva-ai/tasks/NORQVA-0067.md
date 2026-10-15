# NORQVA-0067: trocar a oferta de um criativo (tela Editar da Fábrica)

**Pedido:** Ricardo, 15/10/2026 ("faça essas alterações"): os 4 criativos do kit estavam ligados ao Kit Cozinha Italiana (2 livros) e a oferta certa é o KIT TRATTORIA COMPLETO — 5 LIVROS (OFF-000010). A tela Editar não deixava trocar produto e oferta.
**Regra de aprovação:** mexe em classificação de criativo (não em pagamento, entrega, Meta nem dados de clientes). Recusa se o criativo já está ligado a um anúncio da Meta.

- `POST /api/creative-factory/creatives/:id/offer` `{ offer_id }` (ADMIN e CREATIVE): troca oferta e produto no mesmo criativo, sem nova versão e sem mudar a aprovação.
- As promessas ligadas acompanham o produto novo: reaproveita a de mesmo texto e tipo, ou cria uma cópia NÃO VERIFICADA (a verificação não atravessa produtos; o Ricardo verifica no produto novo). Promessa de preço não é levada (D-0053). Recusa criativo ligado a anúncio da Meta ou em teste/no ar. Auditoria `CREATIVE_OFFER_CHANGED`.
- Tela: em Editar, bloco "Oferta deste criativo" com a lista de ofertas e o botão "Trocar oferta".
- Teste: `norqva_0066_creative_change_offer.test.ts`.
