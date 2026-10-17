# NORQVA-0094: segurança em Campanhas (etapa 1 do Centro de Controle)

**Branch:** `ai/NORQVA-0094-seguranca-campanhas` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** com o "sim" do Ricardo
**Autorização:** Ricardo, 16/10/2026 22h29 ("Sim" às etapas 1 e 2 do diagnóstico NORQVA-0093 no Claude Docs) · **Risco:** MEDIUM (controle de campanhas na Meta)

## O que muda

1. **Rota antiga desligada:** `POST /api/meta/migrate-destination-url` responde 410. Alterava anúncio na Meta sem a chave, sem conferência de credencial, sem registro de decisão e com IDs fixos.
2. **Pausa pela tela marca o plano:** pausar a campanha de um plano ACTIVE/APPROVED grava `operator_paused_at`. Reativar essa campanha pede o código do plano digitado (vale como novo Sim) e é recusado se o gasto já chegou ao teto. Registros `LAUNCH_PLAN_PAUSED_BY_OPERATOR` / `LAUNCH_PLAN_RESUMED_BY_OPERATOR`.
3. **Orçamento pela tela atualiza o plano:** mudar o orçamento de um conjunto do plano atualiza `spec.adsets` e `daily_budget_brl` (o vigia projeta com ele). Plano CAPPED não muda orçamento por aqui. Registro `LAUNCH_PLAN_BUDGET_SYNCED`.
4. A conferência do plano é fail-closed para ativar e mudar orçamento; pausar nunca é bloqueado por ela.

## Revisto

A "pausa de emergência com a chave desligada" do diagnóstico não foi mudada: `META_MUTATION_ENABLED` desligada é o "desliga tudo" de propósito (teste G20). Com a chave ligada a pausa funciona.

## Arquivos

- `backend/src/controllers/metaControlController.ts`, `backend/src/index.ts`
- Migration 070 (só aditiva): `launch_plans.operator_paused_at`, `operator_paused_by`
- `frontend/src/features/acquisition/MetaControl.tsx`: campo do código quando o servidor pede
- Teste `backend/src/tests/norqva_0094_seguranca_campanhas.test.ts`
