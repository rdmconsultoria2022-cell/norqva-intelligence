# 05 — API AND BACKEND

## 1. Visão Geral do Backend
* **Runtime:** Node.js 20.x
* **Framework:** Express 4.x com TypeScript
* **Ponto de Entrada:** `backend/src/index.ts`
* **Total de Endpoints Mapeados:** 164 rotas registradas.

---

## 2. Middleware Pipeline (Ordem de Execução)
1. **`requestIdMiddleware`**: Adiciona `X-Request-Id` em todas as requisições para rastreabilidade nos logs.
2. **`securityHeadersMiddleware`**: Aplica cabeçalhos de segurança HTTP (CSP, HSTS, X-Content-Type-Options, etc.).
3. **`corsMiddleware`**: Validação rigorosa de origens permitidas (`CORS_ALLOWED_ORIGINS`).
4. **`rateLimiterMiddleware`**: Proteção contra ataques de negação de serviço e abuso de endpoints sensíveis.
5. **`authMiddleware`**: Validação de JWT Supabase Auth e injeção do contexto do usuário.
6. **`requireRole('ADMIN' | 'OPERATOR' | 'VIEWER')`**: Controle de acesso baseado em papéis (RBAC estrito).
7. **`errorHandlerMiddleware`**: Captura global de exceções, sanitização de erros e prevenção de vazamento de stack traces.

---

## 3. Catálogo de Grupos de Rotas Principais

### A. Rotas Públicas (Sem Autenticação)
* `GET /api/health`: Health check da API e do pool de banco de dados.
* `GET /api/public/offers/:slug`: Detalhes da oferta para renderização da página de vendas.
* `POST /api/public/orders`: Criação de pedido e geração de cobrança Pix via Asaas.
* `GET /api/public/orders/:id/status`: Polling de status do pagamento Pix.
* `POST /api/public/telemetry/funnel`: Ingestão de eventos do funil comercial (Gate 17.0B).
* `GET /api/public/delivery/:token`: Acesso e download do infoproduto adquirido.
* `POST /api/public/recovery/request`: Solicitação de reenvio de acesso via e-mail.

### B. Rotas de Webhook (Autenticação por Assinatura/Token de Integração)
* `POST /api/webhooks/asaas`: Notificação de pagamento confirmado (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`).

### C. Rotas Administrativas & Inteligência (Requer Autenticação + RBAC)
* `GET /api/dashboard/overview`: Linha Executiva, métricas agregadas de DRE e KPIs.
* `GET /api/dashboard/funnel`: Funil comercial first-party com taxas de conversão.
* `GET /api/intelligence/demographics`: Métricas demográficas consolidadas (Gate 16.6G).
* `POST /api/intelligence/demographics/sync`: Disparo de sincronização demográfica Meta.
* `GET /api/intelligence/creative-performance`: Métricas de engajamento e conversão por criativo.
* `GET /api/market-discovery/search`: Busca e análise de anúncios concorrentes.
* `POST /api/meta/sync`: Disparo manual de sincronização de campanhas e insights diários.
