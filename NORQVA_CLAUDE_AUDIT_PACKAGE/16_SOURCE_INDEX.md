# 16 — SOURCE INDEX & EVIDENCE CATALOG

Este catálogo mapeia detalhadamente cada conclusão, módulo e métrica deste relatório com os arquivos de código-fonte, migrations, testes e commits correspondentes.

---

## 1. Índices por Módulo

### A. Autenticação, RBAC e Segurança
* **Código Fonte:** `backend/src/middleware/auth.ts`, `backend/src/middleware/securityHeaders.ts`
* **Testes de Certificação:** `backend/src/tests/gate16_6g_security_auth.test.ts`, `backend/src/tests/auth.test.ts`
* **Commit Canônico:** `3d1503aadc7c98eeb00652c7862de80ebcc210b6`

### B. Telemetria e Funil Comercial (Gate 17.0B)
* **Código Fonte:** `backend/src/controllers/telemetryController.ts`, `frontend/src/features/public/PublicOfferPage.tsx`, `frontend/src/services/attribution.ts`
* **Migrations SQL:** `backend/src/db/migrations/011_commercial_funnel_telemetry.sql`, `025_add_checkout_modal_opened_funnel_event.sql`
* **Testes de Certificação:** `backend/src/tests/gate17_0b_funnel_instrumentation.test.ts`, `frontend/src/tests/gate17_0b_public_offer_cta.test.tsx`
* **Commit Canônico:** `e689c8893b35ac90a2abab70201a0675a04f4ae0`

### C. Inteligência Demográfica (Gate 16.6G)
* **Código Fonte:** `backend/src/services/meta/metaDemographicIngestionService.ts`, `backend/src/services/intelligence/demographicAnalyticsService.ts`, `frontend/src/features/intelligence/DemographicIntelligenceView.tsx`
* **Migrations SQL:** `backend/src/db/migrations/024_meta_demographic_insights_core_v1.sql`
* **Testes de Certificação:** `backend/src/tests/gate16_6c_demographic_foundation.test.ts`, `backend/src/tests/gate16_6d_meta_demographic_ingestion.test.ts`, `backend/src/tests/gate16_6e_demographic_analytics.test.ts`, `frontend/src/tests/gate16_6f_demographic_intelligence_ui.test.tsx`

### D. Pagamentos e Asaas Pix
* **Código Fonte:** `backend/src/controllers/api.ts` (seções `/api/public/orders`, `/api/webhooks/asaas`)
* **Migrations SQL:** `backend/src/db/migrations/005_sprint2_5_commercial.sql`, `006_sprint2_5_payments.sql`
* **Testes de Certificação:** `backend/src/tests/sprint2_5c_payment.test.ts`, `backend/src/tests/asaas_safety.test.ts`, `backend/src/tests/production_payment_lock.test.ts`

### E. Entrega Digital & Fulfillment
* **Código Fonte:** `backend/src/services/entitlements/entitlementService.ts`, `backend/src/services/emailService.ts`, `frontend/src/features/delivery/DigitalDelivery.tsx`
* **Migrations SQL:** `backend/src/db/migrations/007_sprint2_5d_deliveries.sql`, `018_order_recovery_tokens.sql`, `019_order_customer_sessions.sql`
* **Testes de Certificação:** `backend/src/tests/sprint2_5d_delivery.test.ts`, `backend/src/tests/durable_customer_recovery.test.ts`

### F. UI/UX Prototype (Gate UI/UX 1.0A)
* **Código Fonte:** `frontend/src/theme/tokens.ts`, `frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/layout/Header.tsx`, `frontend/src/features/dashboard/DashboardView.tsx`
* **Status:** Protótipo local validado contra 194 testes do frontend.
