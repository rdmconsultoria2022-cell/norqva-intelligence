# NORQVA-0063: checkout do kit com kit completo ou livros avulsos

**Branch:** `ai/NORQVA-0063-checkout-avulsos` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Pedido:** Ricardo, 14/10/2026 19h50, com print do checkout: "crie essa tela de pagamento com uma opção de seleção em kit completo, e a opção de compra de cada livro separado". **Autorização:** contrato NORQVA-0063 no Claude Docs, "Aprovado" em 14/10/2026 20h11 (mexe em pedido e pagamento, D-0037). · **Risco:** MEDIUM

## Escopo

- Pagamento na página do kit: "Kit completo · 5 livros" (padrão, com economia sobre a soma) ou "Escolher livros avulsos" (lista com capa, receitas e preço), sugestão "Por mais R$ X você leva os 5", botão desligado sem livro.
- Pedido com vários livros: `POST /api/checkout` aceita `extra_offer_human_ids` (até 4); preço e oferta do servidor (`resolveCollectionExtras`); extras como `is_bump = TRUE`; recusa repetido, inativo, fora da coleção, arquivo em comum, junto com adicional, quantidade > 1.
- `GET /api/public/collection` passa a incluir Trattoria (OFF-000001) e Dolci (OFF-000005), com `offer_id` e `card` de cada livro.
- `GET /api/public/offers/:id` informa `delivery_files`; com 5 ou mais, a página do kit mostra os 5 livros.
- Textos do pagamento sem "acesso permanente" e com explicação do CPF.
- Sem migration. Sem mudança no Asaas, no webhook, na entrega ou no CPF.

## Testes

- `backend/src/tests/norqva_0063_collection_extras.test.ts`
- `frontend/src/tests/norqva_0063_checkout_avulsos.test.tsx`
- `norqva_0061_collection_books.test.ts` atualizado (campos novos na lista pública).
