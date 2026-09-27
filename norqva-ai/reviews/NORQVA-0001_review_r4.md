# REVIEW R4 — NORQVA-0001 (CI do PR #1)

**Revisor:** Claude · **Data:** 2026-09-27 · **PR:** #1 · **Commit:** `0a711a4` · **CI:** run `36348779901` — **FAILURE**

## STATUS: CHANGES_REQUIRED — não fazer merge

## Correção da revisão R3

Na R3 eu classifiquei as falhas locais como "ambiente da máquina local". **Estava errado.** O CI do GitHub, que na `main` é verde (run #107), falha neste branch com os mesmos erros. As falhas foram introduzidas por este branch.

## Falhas no CI (anotações do run)

| Arquivo de teste (existente, passa na `main`) | Erro |
| --- | --- |
| `gate16_4j_current_day_meta_ingestion`, `gate07_4_telemetry`, `agentic_foundation` | `DATABASE SAFETY VIOLATION ... NODE_ENV=test (got 'production')` |
| `creative_performance_engine` (testes 2, 3, 6, 8, 9) | `META_API_VERSION is strictly required in staging/production` |
| `entitlement_bridge` (F) | `expected 'failed' to be 'pending'` |
| `auth.test` | `duplicate key ... uq_meta_ad_accounts_id_demo` (seed rodando duas vezes) |

## Causa provável

`backend/vitest.config.ts` usa `pool: 'forks'` com `singleFork: true`: **todos os arquivos de teste rodam no mesmo processo e compartilham `process.env` e o banco.** Os testes novos ou alterados neste branch (`gate_sec03_phase1`, `norqva_0001`, `production_payment_lock`, `financial_intelligence_dashboard`) mexem em `NODE_ENV`, `APP_ENV`, `ASAAS_*` e `META_*`. Basta um caminho sem restauração (inclusive dentro de módulo importado durante o teste, como `index.ts`, que roda `validateProductionEnvironment()` no import) para contaminar os arquivos seguintes. O `auth.test` duplicando seed é consistente com isso.

## Correções exigidas

1. **Isolamento estrutural de ambiente (não teste a teste):**
   - Criar `backend/src/tests/setup/envIsolation.ts` e registrar em `vitest.config.ts` via `test.setupFiles`.
   - Na primeira carga, guardar um snapshot de `process.env` em `globalThis.__NORQVA_ENV_SNAPSHOT__`. Em `beforeAll` e `afterAll` de cada arquivo, restaurar exatamente esse snapshot (apagar chaves extras e reatribuir as originais). Não reatribuir `process.env = {...}`.
   - Nos testes novos, trocar mutações diretas por `vi.stubEnv(...)` + `vi.unstubAllEnvs()` em `afterEach`.
2. **Descobrir a origem exata:** rodar localmente com a mesma configuração do CI (`singleFork`) e a ordem padrão, e isolar qual arquivo deixa `NODE_ENV=production` (bisect: rodar a suíte sem cada arquivo alterado). Registrar a causa em `10_ci_failure_root_cause.txt`, com a saída bruta que a comprova.
3. **Item 8 (pendente):** `vitest` e `@vitest/coverage-v8` do backend para `^1.6.1`, com o lockfile regenerado.
4. **Critério de aceite:** o CI do PR #1 verde. Não há outro critério. Resultado local não substitui.

## Arquivos autorizados nesta rodada

`backend/vitest.config.ts`, `backend/src/tests/setup/envIsolation.ts` (novo), os 4 arquivos de teste citados acima, `backend/package.json`, `package-lock.json` e `norqva-ai/**`. Nenhuma mudança em código de produção. Se a correção exigir código de produção, STOP e explicar.
