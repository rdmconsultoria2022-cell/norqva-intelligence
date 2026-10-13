# NORQVA-0057: Produtos com todos os campos editáveis; excluir e restaurar

**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Pedido:** Ricardo, 13/10/2026 17h07: "Na tela Produtos também preciso que todos os campos sejam editáveis para me proporcionar atualizações, edições e exclusão se necessário".

## Parte 1: editar (sem aprovação, D-0037: tela e texto)

**Branch:** `ai/NORQVA-0057-editar-produto-campos` · **Risco:** LOW

- Editar produto ganha descrição, custo estimado e observações; notas da procedência podem ser apagadas.
- Editar oferta ganha upsell e cross-sell (texto; não mudam cobrança nem entrega).
- `updateProduct`: descrição não vazia (até 5.000), custo >= 0 com até 2 casas, observações texto ou vazio.
- Testes: `norqva_0057_edit_product_fields.test.ts`, `norqva_0057_offer_upsell.test.tsx`.

## Parte 2: excluir e restaurar

**Autorização:** contrato no Claude Docs "NORQVA-0057 — Contrato: excluir e restaurar produtos e ofertas", aprovado pelo Ricardo em 13/10/2026 17h11 ("Aprovado"). · **Risco:** MEDIUM (tira oferta das vendas)

- Migration 060 (aditiva): `deleted_at` e `deleted_by` em produtos e ofertas.
- `services/catalog/catalogTrashService.ts`: excluir = `is_deleted` (nada apagado do banco). Travas da oferta: ATIVA/TESTE pede pausa; campanha na Meta que leva a ela; adicional no Pix ativo de outra oferta; pedido PENDING dos últimos 3 dias. Produto: só sem ofertas abertas (as arquivadas vão junto). Restaurar: oferta volta PAUSADA (rascunho segue rascunho), produto PRONTO/ATIVO/ARQUIVADO volta PAUSADO; oferta só volta depois do produto. Tudo com o código digitado e auditoria crítica (`OFFER_DELETED`, `OFFER_RESTORED`, `PRODUCT_DELETED`, `PRODUCT_RESTORED`).
- Rotas ADMIN: `GET /api/catalog/trash`, `POST /api/{products|offers}/:id/{delete|restore}`.
- Lista de ofertas ignora ofertas de produto na lixeira; o painel financeiro continua mostrando a venda de oferta excluída no período em que vendeu.
- Tela: "Excluir oferta"/"Excluir produto" (ou "Restaurar" quando arquivado) e a Lixeira no topo da tela Produtos.
- Testes: `norqva_0057_catalog_trash.test.ts`, `norqva_0057_catalog_trash.test.tsx`.

## Continua igual

Quem já comprou continua baixando (a entrega não olha se a oferta foi excluída); página e checkout de oferta excluída não abrem; nenhuma migration altera dados.
