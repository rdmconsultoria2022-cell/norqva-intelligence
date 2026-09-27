# 01 — SYSTEM ARCHITECTURE

## 1. Visão Macro da Arquitetura

O ecossistema NORQVA é composto por 3 camadas principais:
1. **Frontend (SPA):** React 18 + TypeScript + Vite + TailwindCSS hospedado na Vercel.
2. **Backend (API REST):** Node.js 20 + Express + TypeScript hospedado no Render (Web Service).
3. **Persistência & Dados:** PostgreSQL hospedado no Supabase, com pooling transacional, triggers e migrations SQL versionadas.

```mermaid
flowchart TD
    subgraph Traffic_Layer ["Camada de Tráfego & Aquisição"]
        META["Meta Ads (Feed / Stories / Reels)"]
        PARAM["UTM Tags + fbclid + ad_id + campaign_id"]
        META --> PARAM
    end

    subgraph Public_Layer ["Camada Pública de Conversão"]
        LP["PublicOfferPage (/oferta)"]
        MODAL["CheckoutModal (CHECKOUT_MODAL_OPENED)"]
        CHK["CheckoutView (CHECKOUT_STARTED)"]
        PARAM --> LP
        LP --> MODAL
        MODAL --> CHK
    end

    subgraph Payment_Layer ["Camada de Pagamentos (Payment Core)"]
        ASAAS["Asaas API (Pix Cobrança / QR Code)"]
        WH["Asaas Webhook (PAYMENT_RECEIVED)"]
        CHK -->|POST /api/public/orders| ASAAS
        ASAAS -->|Webhook HTTP| WH
    end

    subgraph Fulfillment_Layer ["Camada de Entrega & Pós-Venda"]
        DELIV["DigitalDeliveryService (Magic Link / Token)"]
        MAIL["ResendProvider / EmailService"]
        WH --> DELIV
        DELIV --> MAIL
    end

    subgraph Intelligence_Layer ["Camada de Inteligência & Atribuição"]
        ATTR["DeterministicAttributionResolver"]
        DEMO["DemographicAnalyticsService"]
        CREAT["CreativePerformanceService"]
        DASH["DashboardView (Linha Executiva / DRE)"]
        WH --> ATTR
        ATTR --> DASH
        DEMO --> DASH
        CREAT --> DASH
    end
```

---

## 2. Diagrama de Comunicação e Protocolos

| Origem | Destino | Protocolo | Autenticação / Segurança |
| :--- | :--- | :--- | :--- |
| **Cliente Web** | Frontend Vercel | HTTPS / TLS 1.3 | CDN Vercel Edge |
| **Frontend** | Backend Render | HTTPS / REST | Bearer JWT (Supabase Auth) / Anonymous Session |
| **Backend** | Supabase Postgres | TCP / SSL (`pg` Pool) | Connection Pooling / SSL `rejectUnauthorized: false` |
| **Asaas Gateway** | Backend Render | HTTPS POST Webhook | Header `asaas-access-token` com Constant-Time Comparison |
| **Backend** | Meta Marketing API | HTTPS Graph API v19+ | Bearer `META_ACCESS_TOKEN` |
| **Backend** | Resend API | HTTPS REST | Bearer `RESEND_API_KEY` |

---

## 3. Topologia de Infraestrutura

```mermaid
graph LR
    User([Usuário Final / Operador]) --> Vercel[Vercel CDN / Frontend]
    Vercel --> Render[Render API / Backend Node.js]
    Render --> Supabase[(Supabase PostgreSQL 15)]
    Render --> MetaAPI[Meta Graph API]
    Render --> AsaasAPI[Asaas Payment Gateway]
    Render --> ResendAPI[Resend Transactional Email]
```
