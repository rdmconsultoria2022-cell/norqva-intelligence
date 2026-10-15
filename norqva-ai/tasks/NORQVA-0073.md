# NORQVA-0073: números desde o início das vendas, sem testes

**Pedido e autorização:** Ricardo, 15/10/2026 10h38: "Retire todas as tentativas de compra não efetuadas que estão em nome de Débora Souza Pena e Ricardo Andrade Lucas. Esses custos de teste devem ser removidos. Eu preciso enxergar a operação de quando começamos a vender." (mexe em dados de pedidos: o pedido explícito do Ricardo vale como Aprovado). **Risco:** MEDIUM (reclassificação de pedidos, só aditiva).

**Dados conferidos no painel (15/10/2026 10h30):**
- Antes de 25/09/2026: R$ 1.480 de gasto (campanhas "NORQVA E2E META TESTE 01" e "NORQVA | EXP-2026-001 | TRATTORIA | SALES") e 1 venda (09/09).
- A partir de 25/09/2026: R$ 1.738 de gasto, 28 vendas pagas, R$ 665,70.
- Tentativas não pagas de teste: 3 de Débora Souza Pena (10/10) e 2 de Ricardo Andrade Lucas / "RICARDO A LUCAS" (10/10 e 15/10). A compra PAGA de "RICARDO A LUCAS" (10/10 22h10, R$ 27,90) não foi incluída: o pedido fala só das não efetuadas.

**Mudanças:**
- `utils/commercialTimezone.ts`: `operationStartDate()` (padrão 2026-09-25; `OPERATION_START_DATE=YYYY-MM-DD` muda, `off` desliga; desligado nos testes automáticos). `resolvePeriodFilter`: "Tudo" vai do início da operação até hoje; outros períodos começam no máximo no início.
- Painel financeiro passa a usar `resolvePeriodFilter` (mesma regra das outras telas). Demografia também respeita o início.
- Tela: "Tudo" aparece como "Desde 25/09", com a nota no menu do período.
- Migration 064: as 5 tentativas não pagas viram `STAGING_SANDBOX_QA` (só com exatamente 5 no critério; auditoria `ORDER_RECLASSIFIED_TEST` ou `ORDER_RECLASSIFY_SKIPPED`). Nada é apagado.
- Testes: `norqva_0073_operation_start.test.ts`.
