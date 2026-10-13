# NORQVA-0057: Produtos com todos os campos editáveis; excluir e restaurar

**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Pedido:** Ricardo, 13/10/2026 17h07: "Na tela Produtos também preciso que todos os campos sejam editáveis para me proporcionar atualizações, edições e exclusão se necessário".

## Parte 1: editar (sem aprovação, D-0037: tela e texto)

**Branch:** `ai/NORQVA-0057-editar-produto-campos` · **Risco:** LOW

- Editar produto ganha descrição, custo estimado e observações; notas da procedência podem ser apagadas.
- Editar oferta ganha upsell e cross-sell (texto; não mudam cobrança nem entrega).
- `updateProduct`: descrição não vazia (até 5.000), custo >= 0 com até 2 casas, observações texto ou vazio.
- Testes: `norqva_0057_edit_product_fields.test.ts`, `norqva_0057_offer_upsell.test.tsx`.

## Parte 2: excluir e restaurar (aguarda "Aprovado")

Contrato no Claude Docs "NORQVA-0057 — Contrato: excluir e restaurar produtos e ofertas".
