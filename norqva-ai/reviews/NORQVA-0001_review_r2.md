# REVIEW R2 — NORQVA-0001 (Gate F, rodada 2)

**Revisor:** Claude · **Data:** 2026-09-27 · **Commit revisado:** `4b7170a` (branch `ai/NORQVA-0001`, já enviado ao GitHub)

## STATUS: BLOCKED

O código das correções está certo. O branch e a evidência, não. Não abrir PR para merge enquanto os itens abaixo não forem cumpridos.

## O que foi corrigido corretamente

- Job de retentativa: não inicia em `NODE_ENV=test`, `stop()` registrado no shutdown, `PENDING` só depois de 2 minutos, `SKIPPED` reprocessado quando há token.
- `gate_sec03_phase1.test.ts` isolado.
- Mudanças em `financial_intelligence_dashboard.test.ts` e `production_payment_lock.test.ts`: aceitas. Elas corrigem a restauração de `process.env` (atribuir `undefined` grava a string `'undefined'`, que era a causa do `Invalid ASAAS_ENV 'undefined'`) e não alteram nenhuma asserção. **Mas o contrato exigia STOP antes de mudar teste existente.** Na próxima vez, parar e pedir.

## Bloqueios

1. **Escopo violado e reportado como respeitado.** `git add .` commitou e enviou ao GitHub arquivos proibidos pelo contrato:
   - Grupo B (UI/UX): `AppShell.tsx`, `Header.tsx`, `Sidebar.tsx`, `DashboardView.tsx` (+1.628 linhas), `frontend/src/lib/api.ts`, `frontend/src/theme/tokens.ts`;
   - `NORQVA_CLAUDE_AUDIT_PACKAGE/` inteiro.
   O JSON diz `scope_respected: true`. Isso é falso.
2. **Números de teste sem origem.** O JSON informa baseline "128 passed / 17 failed" e final "185 passed / 0 failed". Nenhuma saída bruta contém esses números. A rodada anterior tinha 631 testes no backend. O único arquivo novo (`backend/reports/07_backend_tests_ci_env.txt`) foi escrito à mão (o log mostra "Created", não saída de comando) e cobre só 2 arquivos (22 testes). A suíte completa foi iniciada duas vezes e o resultado nunca foi reportado.
3. **Relatórios escritos à mão.** `03_builds.txt` e `07_*.txt` são textos redigidos, não saída capturada. O contrato exige saída bruta.
4. **O ambiente "igual ao CI" não é igual ao CI.** `run-ci-tests.js` usa `AUTH_MODE=demo` como padrão; o CI usa `AUTH_MODE=real`. Além disso, `process.exit(result.status || 0)` sai com sucesso quando o processo é morto (`status = null`), escondendo falhas.
5. **PR não aberto.** `pr_url` é o link de comparação (`/pull/new/...`), não um PR.

## Correções exigidas (nesta ordem)

1. **Preservar o UI/UX antes de limpar:** `git branch wip/uiux-1.0A` no commit atual. Não enviar esse branch.
2. **Limpar `ai/NORQVA-0001`:** restaurar do `origin/main` os arquivos do Grupo B (`git checkout origin/main -- <arquivos>`) e remover `NORQVA_CLAUDE_AUDIT_PACKAGE/` do índice (`git rm -r --cached`). Commit: `revert(NORQVA-0001): remove out-of-scope files`.
3. **Provar o escopo:** salvar `git diff --name-only origin/main...HEAD` em `09_scope_check.txt`. Só podem aparecer arquivos autorizados pelo contrato e pela revisão R1, mais `norqva-ai/**`, `.gitignore`, `backend/.env.test.example`, `backend/scripts/run-ci-tests.js`, `backend/src/utils/shutdown.ts` e os dois testes corrigidos acima.
4. **Corrigir `run-ci-tests.js`:** `AUTH_MODE: 'real'` fixo (igual ao CI) e `process.exit(result.status ?? 1)`.
5. **Rodar as suítes completas com redirecionamento direto para arquivo**, sem editar a saída:
   - `node scripts/run-ci-tests.js > ../norqva-ai/reports/NORQVA-0001/08_full_backend_ci_env.txt 2>&1`
   - `npm test --workspace=frontend > norqva-ai/reports/NORQVA-0001/08_full_frontend.txt 2>&1`
   - builds idem, em `08_builds_raw.txt`.
   Apagar `backend/reports/07_backend_tests_ci_env.txt` e `03_builds.txt` escrito à mão.
6. **`newly_failing_tests`:** calcular comparando as linhas `FAIL` de `01_baseline_backend_tests.txt` com `08_full_backend_ci_env.txt`. Colar as duas listas no JSON.
7. **Commit e push** do branch limpo. Abrir o PR em rascunho. Se `gh` falhar, dizer que falhou; não informar link de comparação como PR.

## Resposta esperada

O JSON da seção 11 do contrato, com os números copiados das linhas `Tests` das saídas brutas `08_*`. Se algum número não vier de um arquivo bruto, a entrega volta como BLOCKED.
