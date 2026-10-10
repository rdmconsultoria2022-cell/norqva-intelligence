# NORQVA-0035: editar oferta e produto pela tela

**Branch:** `ai/NORQVA-0035-editar-oferta-produto` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 10/10/2026 07h54 ("Aprovado"), contrato no Claude Docs "NORQVA-0035 — Contrato: Editar oferta e produto pela tela" · **Risco:** LOW

## Por que

A oferta do adicional foi cadastrada como "Dormi Della Nonna" e o nome aparece na caixinha do checkout; a tela não tinha como editar oferta (só status) nem o nome do produto.

## Escopo

- `OfferEditor` no cartão da oferta (ADMIN e PRODUCT): nome, preço, promocional, descrição e bônus; aviso de que preço novo vale só para próximos pedidos.
- Edição de produto ganha nome e categoria (botão "Editar produto (nome, situação e procedência)").
- `updateOffer`: nome não vazio, preço > 0, promocional > 0 ou vazio (limpa); auditoria `OFFER_UPDATE` quando o status não muda. `updateProduct`: nome e categoria não vazios.

## Regras

Preço do pedido segue vindo do servidor; preço do adicional segue o de "Adicional no Pix"; sem migration; testes sem serviços externos.
