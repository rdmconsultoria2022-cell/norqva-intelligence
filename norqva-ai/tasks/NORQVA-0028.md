# NORQVA-0028: Fase 4b — Campanha completa numa tela

**Branch:** `ai/NORQVA-0028-campanha-completa` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 08/10/2026 19h50 ("Aprovado"), contrato no Claude Docs "NORQVA-0028 — Contrato: Fase 4b, Campanha Completa numa Tela" · **Risco:** HIGH (Meta)

## Escopo

- Tela **Campanhas** com lista única: planos (`launch_plans`) e campanhas da Meta sem plano ("Criadas fora do NORQVA"), cada uma com gasto, vendas, CPA do período e alertas abertos.
- Abas do plano: Configuração (editor da 4a), Resultado e controle (`MetaAdsView` filtrada pela campanha), Teto e vigia (`ExperimentGuardCard` do plano), Método (`MethodView` filtrado pela oferta) e Experimento (capital, gasto e a resposta do Sim). Campanha de fora mostra só resultado e controle.
- Controle com escopo: `MetaControlDialog` envia `scope_campaign`; o `meta-control` recusa (409) campanha, conjunto ou anúncio de outra campanha e responde 503 se não conseguir conferir. A trava do Sim (4a) continua.
- `POST /api/experiments/:id/performance` recusa (409) experimento ligado a um plano (capital reservado pelo Sim).
- Menu: saem Meta Ads, Método NORQVA e Experimentos; os endereços antigos abrem Campanhas; o badge de alertas vai para Campanhas; Campanhas fica visível para todos os perfis (`GET /api/campaigns*` liberado para leitura); só ADMIN altera.
- Experimentos antigos, sem plano, ficam em "Histórico de experimentos", só consulta.

## Regras

Nenhuma regra de gasto muda; nenhuma migration; nenhum teste fala com a Meta.

## Testes

`backend/src/tests/norqva_0028_campaign_scope.test.ts`, `frontend/src/tests/norqva_0028_campaign_complete.test.tsx`; testes de menu, badge e Campanhas (perfil sem ADMIN) atualizados.
