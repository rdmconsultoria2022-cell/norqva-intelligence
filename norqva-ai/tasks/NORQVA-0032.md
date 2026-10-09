# NORQVA-0032: Adicional no Pix (order bump) e promessas verificadas por produto

**Branch:** `ai/NORQVA-0032-adicional-promessas` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 09/10/2026 00h32 ("Aprovado"), contrato no Claude Docs "NORQVA-0032 — Contrato: Adicional no Pix e Promessas Verificadas" · **Risco:** HIGH (pagamento e entrega)

## Escopo

- Migration 046 (aditiva): `offer_bumps` (um adicional por oferta, preço no servidor, desligado por padrão) e `order_items.is_bump`.
- `OfferBumpService`: configuração (ADMIN, `GET/PUT /api/offers/:id/bump`), recusa adicional sem arquivo próprio ou com arquivo em comum; `active()` para o checkout; `publicView()` na página pública.
- `createOrder`: `with_bump: true` (o navegador não manda preço) cria o segundo item `is_bump` e soma ao total antes do Pix; adicional indisponível → 409.
- Pedidos com dois itens: item principal determinístico (ORDER BY is_bump) em acesso do comprador, telemetria, recuperação; recuperação vale com qualquer entrega ativa; reenvio troca uma entrega só; `prepareDelivery` cria as que faltam; Vendas lista os itens; e-mail cita os dois; tarifa do Pix só no produto do item principal; adicional não concede acesso por nome; pixel da marca do item principal; Purchase com `content_ids` das duas ofertas (um evento só, valor pago).
- Equilíbrio: soma o adicional líquido médio a partir de 20 pedidos pagos com adicional configurado; custos mostram o rendimento.
- Promessas por produto: `GET/POST /api/products/:id/claims` (cadastro ADMIN/PRODUCT como UNVERIFIED; verificar segue ADMIN no PATCH existente); contexto das IAs só com promessas verificadas, válidas e do produto da oportunidade.
- Telas: caixinha desmarcada no checkout com total atualizado; "Adicional no Pix" na oferta (ADMIN); "Promessas" no produto com sugestões.

## Regras

Entrega só com PAID confirmado pelo Asaas; preço do servidor; CPF como hoje; um Purchase por pedido; banco aditivo; testes sem Meta/Asaas.

## Testes

`backend/src/tests/norqva_0032_bump_claims.test.ts`, `frontend/src/tests/norqva_0032_bump_claims.test.tsx`.
