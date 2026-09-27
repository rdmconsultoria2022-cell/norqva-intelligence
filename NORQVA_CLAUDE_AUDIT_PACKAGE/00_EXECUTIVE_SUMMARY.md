# 00 — EXECUTIVE SUMMARY

## 1. Visão Geral do Projeto
O **NORQVA Intelligence** é uma plataforma proprietária de inteligência comercial, aquisição de tráfego pago (Meta Ads), conversão em checkout transparente, liquidação via Pix (Asaas), entrega digital garantida de infoprodutos (PDF/WebApps) e reconciliação financeira de ponta a ponta (DRE em tempo real).

O sistema opera com separação estrita entre ambientes (**DEMO** vs **REAL**), proveniência auditável de dados (`DEMO_SEED`, `REAL_META_SYNC`, `COMMERCIAL_LIVE`) e guardrails de segurança financeira e de mídia.

---

## 2. Estado Atual do Sistema (Snapshot em 26/09/2026)

| Domínio | Estado Técnico | Evidência Principal |
| :--- | :---: | :--- |
| **Infraestrutura** | **ESTÁVEL / DEPLOYED** | Render Staging API + Vercel Production Frontend + Supabase PostgreSQL |
| **Autenticação & RBAC** | **CERTIFICADO (SEC-01/SEC-02 REMEDIATED)** | Commit `3d1503a`, fail-closed RBAC, eliminação de auto-provisionamento |
| **Catálogo & Ofertas** | **PRODUÇÃO** | Oferta ativa: *Trattoria em Casa* (PDF V2) e *Bolso Blindado* (Web App) |
| **Checkout & Pagamentos** | **CERTIFICADO / PRODUÇÃO** | Asaas Pix com webhook idempotente, QR Code dinâmico, PIX copia-e-cola |
| **Entrega Digital (Fulfillment)**| **CERTIFICADO** | Magic links assinados com TTL, recuperação por token e idempotência |
| **Meta Ads (Ingestão)** | **CERTIFICADO** | Sincronização diária de campanhas, conjuntos, anúncios e demografia |
| **Meta Ads (Escrita/Mutação)** | **GUARDRAILS ATIVOS (SAFE LOCKED)** | `META_MUTATION_ENABLED=false`, dry-run certificado |
| **Telemetria do Funil** | **DEPLOYED (GATE 17.0B)** | Commit `e689c88`, evento canônico `CHECKOUT_MODAL_OPENED` ativo |
| **Atribuição First-Party** | **OPERACIONAL** | Resolução determinística (`fbclid`, UTMs, `visitor_id`, `session_id`) |
| **Inteligência Demográfica** | **DEPLOYED (GATE 16.6G)** | Ingestão agregada por idade/gênero na Migration 024 |
| **UI/UX Refresh V1** | **LOCAL PROTOTYPE (GATE UI/UX 1.0A)** | Design System moderno (`slate-50`), 6 KPIs executivos, funil de 5 etapas |

---

## 3. Cobertura de Testes e Certificações
* **Backend Test Suite:** 49 suítes de teste, 598 testes automatizados (**100% PASS**).
* **Frontend Test Suite:** 23 suítes de teste, 194 testes automatizados (**100% PASS**).
* **Total de Testes Automatizados:** 792 testes.
* **Certificações Formais Concluídas:** Gate 07.x, Gate 16.4e/f/j, Gate 16.6c/d/e/f/g, Gate 17.0a/b.

---

## 4. Principais Destaques Arquiteturais
1. **Atribuição Determinística (B2 Attribution Engine):** Correlaciona impressões e cliques do Meta Ads com sessões de checkout e pedidos pagos sem perda de parâmetros UTM ou fbclid.
2. **Isolamento Demo/Real Rigoroso:** Todas as tabelas críticas de inteligência contêm colunas `is_demo` e `data_provenance` para evitar contaminação estatística.
3. **Resiliência de Webhooks:** Handlers de pagamento protegidos por locks transacionais (`SELECT ... FOR UPDATE`) e registros de idempotência.
4. **Segurança de Auth Reforçada:** O middleware de autenticação não auto-provisiona usuários nem infere permissões administrativas por email, garantindo controle estrito via tabela `users` com papéis `ADMIN`, `OPERATOR` ou `VIEWER`.
