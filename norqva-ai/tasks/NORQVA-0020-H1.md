# NORQVA-0020 · H1 — Auditoria imutável de decisões (`decision_events`)

**Plano:** `NORQVA_DECISION_GOVERNANCE_HARDENING_PLAN.md`, item H1. **Autorizado pelo operador** em 2026-10-04 23:37 BRT, só o H1.
**Branch:** `ai/H1-decision-events` · **Risco:** baixo (registro). Não muda regras de ativação, não mexe na Meta.

## O que entra
- **Migration 039** (só aditiva): tabela `decision_events`, índices e, no Postgres real, trigger que recusa `UPDATE`, `DELETE` e `TRUNCATE`. Única exceção: `purge_decision_event_pii(dias)`, que só apaga `ip`/`user_agent` de eventos mais antigos que a janela e marca `pii_purged_at`. Qualquer outra coluna alterada faz o UPDATE falhar, mesmo dentro da exceção.
- **`backend/src/db/decisionEvents.ts`**: contexto da requisição, higienização de segredos, `beginDecision` / `finish`, expurgo, listagem.
- **Instrumentados** (registro antes e depois, sem mudar o resultado):
  - `POST /api/launch-plans/:id/answer` (`LAUNCH_PLAN_ANSWER`);
  - `POST /api/launch-plans/:id/create` (`LAUNCH_PLAN_CREATE_ON_META`);
  - `POST /api/meta-control/:type/:id/status` (`META_ENTITY_STATUS`);
  - `POST /api/meta-control/:type/:id/budget` (`META_ENTITY_DAILY_BUDGET`).
- **Novo** `GET /api/decision-events?plan_id=&limit=` (ADMIN, só leitura).
- **Retenção:** expurgo de IP/user-agent na subida do servidor e a cada 24 h. `DECISION_EVENTS_PII_RETENTION_DAYS`, padrão 180, entre 1 e 3650.
- `/privacidade.html`: menciona o registro de IP e navegador e a retenção.

## Campos registrados
`correlation_id`, `phase` (`REQUESTED` → `EXECUTED` | `REJECTED` | `FAILED`), `action`, `decision` (ex.: `YES`, `CAMPAIGN:ACTIVE`, `ADSET:20`), `plan_id`, `plan_code`, `user_id`, `user_email`, `actor_type` (`HUMAN` | `AUTOMATION` | `SYSTEM`), `session_id` (claim `session_id` do JWT Supabase), `ip`, `user_agent`, `meta_ids`, `result` (resumo higienizado), `error` (higienizado), `is_demo`, `created_at`, `pii_purged_at`.

**Nunca gravados:** token, cabeçalho `Authorization`, cookie, senha, `x-norqva-automation-token` nem segredo em texto livre. O token só é lido em memória para extrair o `session_id`. `result` e `error` passam por `sanitizeForAudit`/`redactSecrets`: chaves sensíveis viram `[REDACTED]`, e são removidos padrões de JWT, token Meta (`EAA…`), `Bearer …`, `access_token=…`, chave Asaas (`$aact_…`) e chaves `sk_/rk_`.

## Comportamento em falha (fail-closed / fail-safe)
1. **Antes da execução (fail-closed):** se a linha `REQUESTED` não puder ser gravada, a decisão **não é executada** e a API responde **503** ("Auditoria de decisões indisponível. Nada foi executado."). Nenhuma ação acontece sem rastro.
2. **Depois da execução (fail-safe, nunca silencioso):** a ação pode já ter ocorrido na Meta e não é desfeita. Se a linha de resultado não puder ser gravada:
   - o evento resumido vai para o log do servidor (`[DECISION AUDIT] result write failed`);
   - grava-se `audit_logs.DECISION_AUDIT_RESULT_WRITE_FAILED` (crítico, melhor esforço);
   - a resposta da API leva `audit_incomplete: true`.

   A linha `REQUESTED` já existe nesse caso.
3. **Fora do registro:** requisições barradas pelo middleware de autenticação (sem login, 401; papel errado, 403) não chegam ao fluxo de decisão e continuam só no log HTTP.

## Fora de escopo (H2–H9)
Confirmação forte, idempotência por chave, `spend_cap`, vigia do teto, pausa automática, alertas, comparabilidade. R-0019-01 continua **ABERTO**.

## Testes
`backend/src/tests/h1_decision_events.test.ts`:
- gravação correta;
- ausência de segredos;
- HUMAN/AUTOMATION/SYSTEM;
- UPDATE/DELETE/TRUNCATE recusados;
- tentativa de burlar a exceção da retenção;
- expurgo;
- falha antes (503, nada executado) e depois (`audit_incomplete` + `audit_logs`);
- recusa registrada;
- endpoint de leitura.

Regressão: suítes NORQVA-0019 (launch plans) e NORQVA-0006 (meta control) sem mudança de expectativas.
