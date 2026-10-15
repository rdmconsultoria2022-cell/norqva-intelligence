# NORQVA-0064: livros avulsos no pagamento do kit de 5 em qualquer página

**Branch:** `ai/NORQVA-0064-avulsos-em-toda-pagina` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Pedido:** Ricardo, 14/10/2026 21h26, com print do pagamento do kit OFF-000010 (R$ 79,92): "Não apareceu a opção de compra avulsa". **Autorização:** correção de erro do contrato NORQVA-0063 (aprovado em 14/10/2026 20h11). · **Risco:** LOW

## Causa

O kit de 5 livros (OFF-000010, 5 PDFs) foi aberto pela página da oferta (`/p/`), e a lista de livros avulsos só era passada ao pagamento pela página `/kit/`.

## Correção

- O pagamento (`CheckoutView`) busca sozinho `GET /api/public/collection` quando a oferta é o kit de 5 (5 PDFs ou mais) e a página não mandou a lista. Vale para `/p/` e `/kit/`.
- Filtro dos livros vendáveis num lugar só (`toSaleBooks` em `collectionChoice.ts`).
- Sem mudança no servidor, no pedido ou no pagamento.

## Testes

- `frontend/src/tests/norqva_0063_checkout_avulsos.test.tsx`: dois testes novos (busca sozinho no kit de 5; não busca nas outras ofertas).
