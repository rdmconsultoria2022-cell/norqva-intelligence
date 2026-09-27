# REVIEW R7 (FINAL) — NORQVA-0001

**Revisor/executor:** Claude · **Data:** 2026-09-27 · **PR:** #1 · **Commit:** `9a8df9d`
**CI:** run `36352865409` — **SUCCESS** (0 erros)

## STATUS: APPROVED — pronto para merge após as condições de deploy abaixo

## O que foi entregue

- Itens 1–7 do contrato: `fbc`/`fbp`, CAPI honesto (`SKIPPED` sem token), retentativa com payload preservado, DRE sem descarte de custos, unit economics configurável (ADMIN), `PIX_EXPIRED` via webhook, score simulado persistido.
- Item 8: Vitest 1.6.1 (CVE-2025-24964).
- Estabilização da suíte de testes, que dependia da ordem de execução e de variáveis vazando entre arquivos:
  - `setup/envIsolation.ts`: ambiente de teste canônico definido antes de cada arquivo (`AUTH_MODE=demo`, `NODE_ENV=test`);
  - seed de demonstração idempotente (`seed.ts` remove só os dados demo da Meta antes de recriar);
  - fixtures de admin com e-mail próprio (gate16_6d, gate16_6e); reset de usuários com `TRUNCATE ... CASCADE` (gate16_6g);
  - migration 025 com `NOT VALID`, conforme D-0001 (aprovada pelo operador);
  - 5 suítes sem dependência de ordem (sprint2_5e, norqva_0001, production_payment_lock, market K&L, genesis).

## Condições para merge (operador)

1. **Render:** confirmar `CPF_CNPJ_HASH_SECRET`. Sem essa variável a API não sobe em produção desde o SEC-03. Confirmar também `META_ACCESS_TOKEN`, `META_PIXEL_ID` e `META_API_VERSION`.
2. **Backup do banco** antes do merge. As migrations 026 e 027 rodam no `preDeployCommand`; ambas só acrescentam.
3. Merge na `main` = deploy automático (Render + Vercel).

## Achados paralelos

- `backend/src/tests/provision_production_genesis.test.ts:16` contém a senha de um Postgres local no fallback da connection string, e o repositório é público. Se essa senha for usada em qualquer outro lugar, trocar. Remover no NORQVA-0002.
- Workflow do CI usa actions em Node 20 (aviso de depreciação); atualizar no NORQVA-0002.

## Próxima tarefa sugerida: NORQVA-0002

Suíte de testes sem estado compartilhado (schema por arquivo, sem `DROP schema_migrations`), checagem automática de escopo no CI, limpeza das duas pendências acima.
