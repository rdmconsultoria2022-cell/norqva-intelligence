# NORQVA-0036: tela Criativos mostra todos os anúncios como aparecem no Instagram e no Facebook

**Branch:** `ai/NORQVA-0036-criativos-previa` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 10/10/2026 08h32 ("Aprovado"), contrato no Claude Docs "NORQVA-0036 — Contrato: Tela Criativos mostra todos os anúncios como aparecem no Instagram e no Facebook" · **Risco:** LOW (só leitura)

## Decisão

Adaptar a tela Criativos existente (já agrupa por campanha) em vez de criar outra.

## Escopo

- Imagem: criativo sem arquivo usa a imagem do anúncio da Meta ligado; imagem com link vencido mostra aviso em vez de quebrar.
- Sincronização: mais fontes de imagem (carrossel, asset_feed_spec); se a Meta recusar o campo novo, volta ao pedido antigo.
- Situação real (`adDelivery`): rodando só com anúncio, conjunto e campanha ativos; pausado/em análise/recusado com motivo; filtro "Só o que está rodando".
- "Ver como aparece": prévia oficial da Meta (`GET /{ad}/previews`) em Instagram feed, Stories e Facebook feed via `GET /api/meta/ads/:adId/preview` (só anúncios sincronizados da conta, cache de 1 h, só iframe de facebook.com) e atalho para o Gerenciador.
- Migration 048: tira do faturamento a compra de teste do adicional (10/10/2026 08:18), só se houver exatamente um pedido no critério (pedido do Ricardo, mesmo critério da 028).

## Regras

Só leitura na Meta; nada de pausar/ativar; testes com a Meta simulada; nada apagado.
