# TASK CONTRACT — NORQVA-0001

**Título:** Correções da revisão da Fase 1 (Medir certo) — CAPI, custos reais, funil e honestidade dos dados
**Autor do contrato:** Claude (revisor técnico) · **Aprovação do escopo:** operador humano · **Data:** 2026-09-27
**Executor:** Antigravity
**Risco:** CRITICAL (toca ASAAS_WEBHOOK e META_PURCHASE)

---

## 1. OBJECTIVE

Fazer a Fase 1 medir de verdade, não parecer que mede. Ao final:

- a Meta recebe compras com dados de correspondência completos (`fbc`, `fbp`, e-mail, telefone, IP, user-agent);
- nenhum evento é marcado como enviado sem ter sido enviado;
- eventos que falharem são reenviados depois;
- o DRE nunca descarta impostos ou custos fixos;
- CPA de equilíbrio e CPA-alvo só aparecem quando os custos foram configurados;
- Pix vencido entra no funil;
- score simulado continua marcado como simulado para sempre.

Métrica de negócio que esta tarefa move: **diferença entre vendas no Gerenciador de Eventos da Meta e pedidos PAID ≤ 10% em 7 dias** (medida após deploy, fora deste contrato).

---

## 2. MODE

`SANDBOX_IMPLEMENTATION`

`DEPLOY_ALLOWED = FALSE`

---

## 3. PASSO 0 — BASELINE (obrigatório, antes de qualquer edição)

A working tree atual contém dois grupos de alterações não commitadas:

- **Grupo A — trabalho SEC-03/Fase 1 já revisado:** `backend/src/index.ts`, `backend/src/controllers/api.ts`, `backend/src/services/landingPageProbeService.ts`, `backend/src/utils/envValidation.ts`, `backend/src/services/meta/metaCapiService.ts`, `backend/src/db/migrations/026_commercial_phase1_real_metrics_and_security.sql`, `backend/src/tests/gate_sec03_phase1.test.ts`, `frontend/src/features/opportunities/OpportunitiesView.tsx`.
- **Grupo B — protótipo UI/UX 1.0A (NÃO faz parte desta tarefa):** `frontend/src/components/layout/AppShell.tsx`, `Header.tsx`, `Sidebar.tsx`, `frontend/src/features/dashboard/DashboardView.tsx`, `frontend/src/lib/api.ts`, `frontend/src/theme/`.

Execute e salve a saída em `norqva-ai/reports/NORQVA-0001/00_baseline.txt`:

1. `git status`, `git branch`, `git rev-parse HEAD`.
2. `git switch -c ai/NORQVA-0001`.
3. Commit 1 — somente os arquivos do Grupo A: `chore(NORQVA-0001): baseline SEC-03 phase 1 (revisado)`.
4. O Grupo B permanece não commitado e não pode aparecer em nenhum commit deste branch.
5. Rodar a suíte completa **antes** de editar, e salvar a saída bruta:
   - `npm test --workspace=backend` → `01_baseline_backend_tests.txt`
   - `npm test --workspace=frontend` → `01_baseline_frontend_tests.txt`

Se houver arquivos modificados fora dos Grupos A e B: **STOP + REQUEST_SCOPE_EXPANSION**.

---

## 4. AUTHORIZED_SCOPE

| Arquivo | O que pode mudar |
| --- | --- |
| `backend/src/services/meta/metaCapiService.ts` | Itens 2 e 3 |
| `backend/src/services/meta/capiRetryJob.ts` (novo) | Item 3 |
| `backend/src/controllers/api.ts` | Somente: `webhookAsaas` (ramo de evento não confirmado), bloco `OVERDUE` de `reconcileAndFinalizePayment`, bloco de custos de `getFinancialDashboard`, novos handlers de unit economics, `getOpportunities` e `analyzeOpportunity` (flag de simulação), `event_time` do Purchase no pós-commit |
| `backend/src/index.ts` | Registrar rotas novas de unit economics e iniciar o job de retry |
| `backend/src/db/migrations/027_norqva_0001_capi_costs_honesty.sql` (novo) | Itens 2, 3, 5, 7 |
| `frontend/src/services/attribution.ts` | Item 1 |
| `frontend/src/features/checkout/CheckoutView.tsx` | Item 1 — somente incluir campos no corpo da requisição |
| `backend/src/tests/norqva_0001.test.ts` (novo) | Testes |
| `frontend/src/tests/norqva_0001_attribution.test.ts` (novo) | Testes |
| `norqva-ai/**` | Contrato e relatórios |

## 5. PROTECTED_SCOPE (não tocar)

- Caminho de pagamento confirmado: `finalizePaidOrder`, a transação `BEGIN/COMMIT` de `reconcileAndFinalizePayment`, validação de valor e de ambiente, lock `FOR UPDATE`.
- Autenticação do webhook (token Asaas, comparação em tempo constante).
- Entrega digital, entitlements, magic links, recuperação de acesso.
- `metaMutatingClient.ts`, `META_MUTATION_ENABLED`.
- `middleware/auth.ts`, RBAC existente.
- Migrations 001–026 (nenhuma edição).
- Arquivos do Grupo B (UI/UX).
- `render.yaml`, `.github/workflows/*`, variáveis de ambiente.

## 6. CHANGE_BUDGET

```
MAX_CODE_FILES_CHANGED = 10   (norqva-ai/** não conta)
MAX_NEW_MIGRATIONS = 1
DATABASE_CHANGE = TRUE (somente via migration 027, aditiva)
API_CONTRACT_CHANGE = TRUE (somente: rotas novas de unit economics; campos novos em respostas; nenhum campo existente removido ou renomeado)
PAYMENT_CORE_CHANGE = LIMITED (apenas o ramo OVERDUE/não confirmado)
META_MUTATION = FALSE
```

Exceder qualquer limite: **STOP_AND_ESCALATE**.

---

## 7. ITENS DE IMPLEMENTAÇÃO

### Item 1 — Capturar `fbc` e `fbp` no frontend
- Em `attribution.ts`: ler cookies `_fbp` e `_fbc`. Se `_fbc` não existir e houver `fbclid`, montar `fbc = "fb.1." + <timestamp em ms da primeira captura do fbclid> + "." + fbclid`. Guardar o timestamp junto do `fbclid` na primeira captura. Não alterar a caixa (maiúsculas/minúsculas) do `fbclid`.
- Expor `fbc`, `fbp` no contexto de atribuição.
- Em `CheckoutView.tsx`: incluir `fbc`, `fbp` e `event_source_url: window.location.href` no corpo da criação do pedido. Nenhuma outra mudança no componente.
- **Aceite:** teste de frontend cobre: cookie `_fbc` presente; ausente com `fbclid`; ausente sem `fbclid` (→ `null`); `_fbp` presente/ausente.

### Item 2 — Nada de "enviado" falso
- Sem `META_ACCESS_TOKEN`: gravar `status = 'SKIPPED'`, `error_message = 'META_ACCESS_TOKEN ausente'`, retornar `success: false`. Remover o `fbtrace_id` simulado.
- Migration 027: ampliar o CHECK de `capi_events.status` para `('PENDING','SENT','FAILED','SKIPPED')`.
- Versão da Graph API: usar a mesma fonte de versão de `metaClient.ts` (não fixar `v26.0` separadamente).
- **Aceite:** teste sem token → linha `SKIPPED`, nenhuma chamada `fetch`.

### Item 3 — Retentativa real e idempotência
- `sendEvent`: se já existir linha com o mesmo `(event_id, is_demo)` e `status = 'SENT'`, retornar sem reenviar.
- Na primeira criação, o `payload` (incluindo `event_time`) é gravado e **nunca reconstruído** em retentativas.
- Purchase: `event_time` = momento da confirmação do pagamento (não o momento do envio).
- `capiRetryJob.ts`: a cada 5 minutos, selecionar `status IN ('PENDING','FAILED')`, `attempts < max_attempts`, `created_at > NOW() - INTERVAL '6 days'`, `last_attempt_at` respeitando backoff exponencial (5 min, 15 min, 1 h, 3 h, 12 h…), com `FOR UPDATE SKIP LOCKED`; reenviar o payload gravado.
- Migration 027: `max_attempts` default passa a 8 para linhas novas.
- Job só inicia fora de `NODE_ENV=test` e para no shutdown gracioso.
- **Aceite:** testes cobrem: SENT não reenvia; FAILED é reenviado pelo job com o `event_time` original; evento com mais de 6 dias não é reenviado; erro 4xx (≠429) não é retentado.

### Item 4 — DRE nunca descarta custos
- Em `getFinancialDashboard`: `totalCosts = totalKnownGatewayFees + otherCosts` **sempre**. Taxa desconhecida só altera `costCoverage` para `PARTIAL`/`UNKNOWN`; não remove impostos, custos variáveis nem fixos.
- **Aceite:** teste com um pagamento de taxa desconhecida mostra impostos e custo fixo rateado incluídos em `totalCosts`.

### Item 5 — Unit economics configurável e honesto
- Migration 027: tabela `business_cost_settings` (`id`, `monthly_fixed_costs`, `is_demo`, `updated_at`, única por `is_demo`). O rateio de custo fixo passa a usar essa tabela; `offer_unit_economics.monthly_fixed_costs` deixa de ser lido (não remover a coluna).
- Rotas novas, `requireRole(['ADMIN'])`:
  - `GET /api/offers/:id/unit-economics`
  - `PUT /api/offers/:id/unit-economics` — validar: `tax_rate` 0–0,5; `gateway_pct_fee` 0–0,2; `gateway_fixed_fee` 0–50; `other_variable_cost` ≥ 0; `target_net_margin` 0–0,9.
  - `GET` e `PUT /api/settings/business-costs`
- Em `byOffer`: novo campo `unit_economics_status: 'CONFIGURED' | 'UNCONFIGURED'`. Se `UNCONFIGURED`: `breakeven_cpa`, `target_cpa`, `breakeven_roas`, `target_roas` = `null`.
- **Não** inserir valores de imposto ou taxa inventados. Os valores reais serão informados pelo operador depois do merge.
- **Aceite:** testes de validação (400 fora da faixa), RBAC (403 para não-ADMIN), `UNCONFIGURED` retorna `null`, `CONFIGURED` retorna os valores da fórmula.

### Item 6 — Pix vencido entra no funil
- `webhookAsaas`: para `PAYMENT_OVERDUE`, chamar o caminho de reconciliação que resulta em `EXPIRED`. Não alterar o ramo de eventos confirmados.
- `PIX_EXPIRED`: preencher `visitor_id`, `session_id`, `fbclid` e UTMs a partir do pedido (hoje vão `unknown_visitor` e `null`).
- **Aceite:** teste de webhook `PAYMENT_OVERDUE` → pagamento `EXPIRED` + evento `PIX_EXPIRED` com atribuição do pedido; `PAYMENT_RECEIVED` continua passando nos testes existentes sem alteração.

### Item 7 — Score simulado fica simulado para sempre
- Migration 027: `opportunity_scores.is_simulated BOOLEAN NOT NULL DEFAULT TRUE` (todas as linhas existentes vieram do provedor simulado) e `ai_provider VARCHAR(50)`.
- `analyzeOpportunity` grava os dois campos a cada score.
- `getOpportunities` usa o valor gravado por score, não a configuração atual do servidor.
- **Aceite:** teste — score gravado como simulado continua `SIMULADA` mesmo com `AGENTIC_AI_PROVIDER=openai` definido depois.

---

## 8. REQUIRED_TESTS

- Suítes novas descritas em cada item.
- Suíte completa backend + frontend após as mudanças.
- `npm run build --workspace=backend` e `--workspace=frontend`.
- Typecheck sem erros novos.
- Comparação com o baseline: **nenhum teste que passava no baseline pode falhar**. Testes que já falhavam no baseline devem ser listados, não corrigidos silenciosamente.

## 9. FORBIDDEN_ACTIONS

- Deploy, merge, push para `main` ou `staging`.
- Executar migrations contra banco real (staging ou produção).
- Chamadas reais à Meta ou ao Asaas.
- Commitar arquivos do Grupo B.
- Editar migrations 001–026.
- Alterar testes existentes para fazê-los passar. Se um teste existente precisar mudar por mudança legítima de contrato, **STOP** e explicar.

**Permitido ao final:** `git push -u origin ai/NORQVA-0001` e abrir **pull request em rascunho** para `main` (via `gh`, se disponível; senão, informar que o operador deve abrir). Isso aciona o CI sem deploy.

## 10. STOP_CONDITIONS

- Necessidade de tocar arquivo fora do AUTHORIZED_SCOPE.
- Qualquer mudança no caminho de pagamento confirmado.
- Teste que passava no baseline passa a falhar e a causa não é óbvia em 2 tentativas.
- Budget excedido.
- Arquivos desconhecidos na working tree.

Em qualquer STOP: não improvisar. Registrar em `norqva-ai/reports/NORQVA-0001/STOP.md` e parar.

---

## 11. EXPECTED_OUTPUT

Evidência **bruta** (não resumida) em `norqva-ai/reports/NORQVA-0001/`:

- `00_baseline.txt`, `01_baseline_backend_tests.txt`, `01_baseline_frontend_tests.txt`
- `02_final_backend_tests.txt`, `02_final_frontend_tests.txt`
- `03_builds.txt`
- `04_git_diff_stat.txt` (`git diff --stat main...HEAD`) e `05_git_diff.patch` (`git diff main...HEAD`)
- `06_git_status_final.txt`

Resposta ao operador — **somente** este JSON, nada de relatório longo:

```json
{
  "task_id": "NORQVA-0001",
  "agent": "antigravity",
  "status": "DONE | STOPPED",
  "branch": "ai/NORQVA-0001",
  "head_commit": "",
  "pr_url": "",
  "scope_respected": true,
  "code_files_changed": [],
  "migrations_added": [],
  "baseline": { "backend": "X passed / Y failed", "frontend": "X passed / Y failed" },
  "final": { "backend": "X passed / Y failed", "frontend": "X passed / Y failed" },
  "newly_failing_tests": [],
  "builds": "PASS | FAIL",
  "items": { "1": "DONE", "2": "DONE", "3": "DONE", "4": "DONE", "5": "DONE", "6": "DONE", "7": "DONE" },
  "risks": [],
  "decision_required": false,
  "recommended_next_action": "Claude review of PR"
}
```

## 12. PRÓXIMO GATE

Gate F — revisão independente do Claude sobre: este contrato + diff do PR + saídas brutas de teste + leitura do repositório. Resultado: `APPROVED`, `APPROVED_WITH_OBSERVATIONS`, `CHANGES_REQUIRED` ou `BLOCKED`.

## 13. DECISÕES HUMANAS PENDENTES (fora do executor)

1. Após o merge: informar alíquota de imposto real, taxa Pix do plano Asaas e custos fixos mensais (via as novas rotas).
2. No GitHub: proteger `main` (CI verde + aprovação obrigatória antes do merge).
3. Na Render: confirmar `META_ACCESS_TOKEN` com permissão no pixel e `META_PIXEL_ID` antes do deploy.
