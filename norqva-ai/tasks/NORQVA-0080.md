# NORQVA-0080: livro + Dolci por R$ 24,90 e kit de 5 livros por R$ 29,90

**Branch:** `ai/NORQVA-0080-oferta-livro-dolci` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Pedido:** Ricardo, 16/10/2026 01h34: "a oferta dos 5 livros tem um custo muito alto de venda". Livro principal + Dolci della Nonna, página por oferta, livro a R$ 19,90, Dolci a R$ 14,90, "de R$ 34,90 por R$ 24,90, leve mais um livro de sobremesa por apenas R$ 5,00 comprando os dois", Pix ou cartão em até 10x com acréscimo, kit de 5 a R$ 29,90.
**Autorização:** contrato NORQVA-0080 no Claude Docs, "Aprovado (Recomendado)" em 16/10/2026 01h42 (preço e pagamento, D-0037). · **Risco:** MEDIUM

## Ajustes aprovados junto com o pedido

- "De R$ 34,80", não R$ 34,90: é a soma real (R$ 19,90 + R$ 14,90). Referência maior que a soma seria falsa (CDC).
- 10x não cabe nesses valores: parcela mínima de R$ 5,00. Com 1x sem acréscimo e 2,99% ao mês acima, o máximo é 4x no livro (R$ 19,90), 5x no livro + Dolci (R$ 24,90) e 6x no kit (R$ 29,90). A página mostra só o parcelamento real.
- Ofertas de saída do kit (R$ 49,90 e R$ 39,90) pausadas. Oferta depois da compra do Trattoria (+4 livros) de R$ 27,90 para R$ 9,90. Kit Cozinha Italiana (OFF-000006) de R$ 34,80 por R$ 24,90.

## Mudanças

- **Migration 068** (bloco `DO`, com checagem de cada oferta e auditoria):
  - adicional Dolci (OFF-000005) por R$ 5,00, ligado, com o texto "Leve mais um livro de sobremesa por apenas R$ 5,00 comprando os dois." no Trattoria (OFF-000001), Pães (OFF-000007), Antipasti (OFF-000008) e Risotos (OFF-000009)
  - cartão nos quatro livros, no kit de 5 (OFF-000010), no OFF-000006 e na oferta depois da compra: até 10 parcelas permitidas, 1 sem acréscimo, 2,99% ao mês acima, `card_total_price` nulo (o total no cartão é o preço do Pix)
  - OFF-000010 de R$ 94,50 por R$ 29,90, saídas PAUSADA, OFF-000006 de R$ 34,80 por R$ 24,90, +4 livros a R$ 9,90
  - eventos: `BOOK_DOLCI_COMBO_SET`/`_SKIPPED`, `OFFER_CARD_PLAN`, `KIT_PRICE_CHANGED`/`KIT_PRICE_SKIPPED`, `EXIT_OFFER_PAUSED`, `POST_PURCHASE_PRICE_CHANGED`/`_SKIPPED`
- **`GET /api/public/offers/:id`:** o adicional traz `regular_price` (preço do Dolci sozinho), para o "de" ser a soma real.
- **Página de cada livro (`/p/OFF-…`):** seção "Oferta dos dois livros" (`BookComboOffer.tsx`, `id="oferta"`) antes do fecho: capas, "de R$ 34,80 por R$ 24,90", frase do Dolci, parcelamento real no cartão com taxa e total (Decreto 5.903/2006), "Quero os dois por R$ 24,90" (pagamento com o Dolci já marcado, `initialWithBump`) e "Só o livro por R$ 19,90". No topo, link "Ou leve com o Dolci della Nonna por R$ 24,90". Com cartão, "Pix ou cartão" e botão "Comprar". Sem adicional, a página fica como antes.
- **Página do kit:** com só 1x sem acréscimo, o preço do Pix fica em destaque e o parcelamento com acréscimo vem embaixo, em vez de "1x R$ 29,90". Os textos "Pix ou cartão" seguem o cartão da oferta.
- O servidor continua calculando o valor de tudo. Entrega só com PAID do Asaas.

## Testes

- `backend/src/tests/norqva_0080_book_combo_migration.test.ts` (parcelas reais; migration 068 em transação com códigos trocados: adicional, cartão, kit, saídas, +4 livros, sem Dolci)
- `backend/src/tests/norqva_0032_bump_claims.test.ts` (adicional público com `regular_price`)
- `frontend/src/tests/norqva_0080_book_combo.test.tsx` (contas, seção na página, Dolci marcado, nenhum "10x", página sem adicional igual)
- Migration 068 rodada também num PostgreSQL 16 local, duas vezes seguidas, com as ofertas simuladas: resultado esperado e sem duplicar.

## Conferir depois do deploy

- Auditoria da migration 068 em `audit_logs` e `GET /api/public/offers/OFF-000001`, `OFF-000007`, `OFF-000008`, `OFF-000009`, `OFF-000010`.
- Cadastrar custos (taxa e imposto) não muda: as ofertas já existiam.

## Execução

(preencher depois do merge)
