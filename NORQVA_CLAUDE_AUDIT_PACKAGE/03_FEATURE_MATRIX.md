# 03 — FEATURE MATURITY MATRIX

Esta matriz classifica formalmente cada capacidade do sistema com base exclusiva em evidências verificáveis de código, testes, migrations e deployments.

## Legenda de Status:
* **DEPLOYED**: Presente em produção (Vercel/Render) com commit correspondente e verificado.
* **CERTIFIED**: Testado com sucesso em suíte dedicada e validado com dados reais/sintéticos.
* **IMPLEMENTED**: Código completo e funcional na base principal, com testes unitários/integrados.
* **PARTIALLY_IMPLEMENTED**: Estrutura base pronta, mas com dependências ou integrações parciais.
* **LOCAL_ONLY**: Desenvolvido e validado apenas no ambiente local (sem deploy).
* **PLANNED**: Especificado em documentação ou roadmap, mas sem código de suporte ativo.

---

## Tabela de Maturidade de Recursos

| Domínio / Feature | Status | Evidência Técnica (Código / Migration / Teste) |
| :--- | :---: | :--- |
| **Supabase Authentication** | **DEPLOYED** | `backend/src/middleware/auth.ts`, `frontend/src/features/auth/` |
| **Strict RBAC (Fail-Closed)**| **DEPLOYED** | Commit `3d1503a`, `gate16_6g_security_auth.test.ts` |
| **Catálogo de Produtos** | **DEPLOYED** | Migration 005, 014, 020, 022 (`products`, `product_offers`) |
| **Oferta Pública (Landing Page)**| **DEPLOYED** | `PublicOfferPage.tsx`, `public_commerce_entry.test.tsx` |
| **Checkout Transparente** | **DEPLOYED** | `CheckoutView.tsx`, `checkout_data_contract.test.ts` |
| **Geração de Cobrança Pix** | **DEPLOYED** | Integrado com Asaas Produção, `sprint2_5c_payment.test.ts` |
| **Processamento de Webhooks** | **DEPLOYED** | `POST /api/webhooks/asaas`, trava transacional, `asaas_safety.test.ts` |
| **Entrega Digital (Magic Links)**| **DEPLOYED** | `DigitalDelivery.tsx`, `entitlementService.ts`, Migration 007 |
| **Recuperação de Acessos** | **DEPLOYED** | Migration 018, 019, `AccessRecoveryView.tsx`, `durable_customer_recovery.test.ts` |
| **Telemetria de Funil Comercial**| **DEPLOYED** | Gate 17.0B, Migration 025, Commit `e689c88`, `telemetryController.ts` |
| **Atribuição Determinística B2**| **DEPLOYED** | `deterministicAttributionResolver.ts`, `attributionAnalyticsService.ts` |
| **Ingestão Diária Meta Ads** | **DEPLOYED** | Gate 16.4e/j, `metaSyncService.ts`, `metaClient.ts` |
| **Inteligência Demográfica** | **DEPLOYED** | Gate 16.6G, Migration 024, `DemographicIntelligenceView.tsx` |
| **Performance de Criativos** | **DEPLOYED** | `creativePerformanceService.ts`, `CreativePerformanceView.tsx` |
| **Inteligência de Mercado V1** | **IMPLEMENTED**| Migration 023, `marketDiscoveryController.ts`, `marketDiscoveryProvider.ts` |
| **Agente de Produtos (AI)** | **IMPLEMENTED**| `product_intelligence_agent.test.ts`, `openAIStructuredProvider.ts` |
| **Meta Ads Mutação / Escrita** | **LOCKED / SAFE** | Trava `META_MUTATION_ENABLED=false`, `production_payment_lock.test.ts` |
| **Publicação Automática de Ads**| **PLANNED / LOCKED** | Bloqueado por guardrail de governança até autorização expressa |
| **UI/UX Refresh V1 (AppShell/Dash)**| **LOCAL_ONLY** | Gate UI/UX 1.0A (`frontend/src/theme/`, `DashboardView.tsx`) |
