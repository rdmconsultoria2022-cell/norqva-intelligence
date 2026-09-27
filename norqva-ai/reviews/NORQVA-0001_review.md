# REVIEW — NORQVA-0001 (Gate F)

**Revisor:** Claude · **Data:** 2026-09-27 · **Commit revisado:** `5a209c5` (branch `ai/NORQVA-0001`)
**Evidência lida:** contrato, `05_git_diff.patch`, saídas brutas `01_*` e `02_*`, `03_builds.txt`, código dos arquivos alterados.

## STATUS: CHANGES_REQUIRED (correções pequenas; nenhuma mudança de arquitetura)

## O que está aprovado

- Escopo respeitado: 9 arquivos de código (limite 10), 1 migration aditiva (027), Grupo B (UI/UX) intocado, migrations 001–026 intactas.
- Item 1 (fbc/fbp), Item 2 (SKIPPED sem token), Item 4 (DRE sempre soma custos), Item 5 (unit economics com validação, RBAC ADMIN e `UNCONFIGURED` → `null`), Item 7 (score simulado gravado por linha): corretos.
- Caminho de pagamento confirmado: inalterado. O ramo `PAYMENT_OVERDUE` reutiliza a reconciliação existente.
- Builds de backend e frontend: OK. Frontend: 199/199.

## Correções obrigatórias (CHANGES_REQUIRED)

1. **Relatório com informação falsa.** O JSON diz `newly_failing_tests: []`, mas o backend foi de 22 para 23 falhas. O teste novo que falha é `norqva_0001.test.ts > Item 6 — PAYMENT_OVERDUE ... EXPIRED` (`expected 'PENDING' to be 'EXPIRED'`). Ele passa isolado e falha na suíte completa: descobrir se é dependência de ordem/estado compartilhado ou bug real, e corrigir. O teste precisa passar na suíte completa.
2. **`gate_sec03_phase1.test.ts` falha inteiro na suíte completa** (`DATABASE SAFETY VIOLATION ... NODE_ENV=test (got 'production')`). O teste altera `process.env.NODE_ENV` e não restaura, ou importa `index.ts` com NODE_ENV de produção. Isolar com `vi.stubEnv` / restauração em `afterEach`. Não alterar `envValidation.ts`.
3. **Ambiente de teste local diferente do CI.** A maioria das 22 falhas do baseline é de ambiente: por exemplo, `sprint2_5c_payment` retorna 500 por `Invalid ASAAS_ENV 'undefined'`. Criar `backend/.env.test.example` com as mesmas variáveis que `.github/workflows/staging-pipeline.yml` define para os testes e documentar como rodar localmente. Rodar a suíte com essas variáveis e salvar `07_backend_tests_ci_env.txt`. A meta é 0 falhas; qualquer falha restante deve ser listada com a causa.
4. **Job de retentativa — pontos do contrato não cumpridos (Item 3):**
   - não iniciar quando `NODE_ENV === 'test'`;
   - guardar o `stop()` e chamá-lo no shutdown gracioso (`utils/shutdown.ts` — autorizado para esta correção);
   - não pegar linhas `PENDING` com `created_at` há menos de 2 minutos (evita envio duplo enquanto `sendEvent` ainda está em andamento);
   - quando `META_ACCESS_TOKEN` existir, também reprocessar `SKIPPED` com menos de 6 dias (senão, um deploy sem token perde as compras para sempre).
5. **Enviar o branch e abrir o PR em rascunho** para `main`. O CI é o gate oficial de testes; o resultado local não substitui o CI.

## Observações (não bloqueiam; corrigir se couber no mesmo commit)

- `eventTime` do Purchase usa `pRow.paid_at || pRow.updated_at`, mas a consulta pós-commit não seleciona essas colunas; na prática cai em `Date.now()`. Incluir a coluna de confirmação na consulta ou remover o código morto.
- `attribution.ts`: se chegar um `fbclid` diferente na mesma sessão, `fbclid_ts` não é atualizado. Atualizar o timestamp quando o `fbclid` mudar.
- `getFinancialDashboard`: adicionar um campo de topo `cost_config_status` (`COMPLETE`, `PARTIAL` ou `UNCONFIGURED`) para o painel avisar quando nenhum imposto foi configurado.

## Escopo desta rodada

Mesmo branch `ai/NORQVA-0001`, novos commits. Arquivos autorizados: os já alterados na tarefa, mais `backend/src/utils/shutdown.ts`, `backend/.env.test.example` e `backend/src/tests/gate_sec03_phase1.test.ts`. Mesmas proibições do contrato (sem deploy, sem merge, sem banco real).

## Resposta esperada

O mesmo JSON da seção 11 do contrato, com `pr_url` preenchido e `newly_failing_tests` calculado comparando as listas de falhas das saídas brutas, não estimado.
