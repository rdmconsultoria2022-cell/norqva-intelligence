# 13 — TECHNICAL DEBT AND RISKS

## 1. Dívida Técnica Identificada

1. **Monolito de Rotas (`backend/src/controllers/api.ts`):**
   * O arquivo `api.ts` contém mais de 5.600 linhas agregando múltiplos domínios (Auth, Orders, Products, Payments, Webhooks, Delivery, Dashboard, Insights).
   * *Recomendação Futura:* Modularizar em sub-roteadores dedicados por domínio (`ordersRouter`, `paymentsRouter`, `intelligenceRouter`).

2. **Resiliência a Timezone / Virada de Dia:**
   * Algumas queries analíticas históricas dependiam do fuso UTC vs `America/Sao_Paulo`. O Gate 16.4e/j corrigiu a sincronização do dia corrente, mas é recomendável manter testes contínuos de virada de mês/ano.

3. **Duplicação de Lógica de Formatação:**
   * Utilitários de formatação de moeda (BRL) e datas encontram-se definidos tanto no frontend quanto no backend.

---

## 2. Riscos Operacionais e Mitigações

| Risco | Impacto | Nível | Mitigação Atual |
| :--- | :--- | :---: | :--- |
| **Vazamento de Orçamento Meta** | Gastos imprevistos em anúncios | **ALTO** | Guardrail `META_MUTATION_ENABLED=false` com bloqueio em código. |
| **Dupla Contagem de Receita** | Distorção no DRE e ROAS | **MÉDIO** | Constraint de unicidade em `payments.order_id` e transações atômicas. |
| **Falha de Webhook Asaas** | Pedido pago não liberado | **MÉDIO** | Endpoint de status com polling ativo no frontend e recuperação manual. |
| **Rate Limit da Graph API Meta** | Atraso na sincronização de dados | **BAIXO** | Agendador com intervalos controlados (`metaSchedulerService.ts`). |
