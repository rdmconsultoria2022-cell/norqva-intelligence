# 02 — REPOSITORY MAP

## 1. Estrutura de Diretórios da Raiz

```text
norqva-intelligence/
├── backend/                  # API REST Express + TypeScript + SQL Migrations
│   ├── public/               # Ativos estáticos e PDFs entregáveis
│   │   └── products/         # PDFs dos infoprodutos (ex: Trattoria)
│   ├── src/
│   │   ├── controllers/      # Handlers de rotas HTTP (api.ts, telemetry, etc.)
│   │   ├── db/               # Conexão, migrations SQL, seeders e scripts
│   │   │   └── migrations/   # 26 migrations versionadas (001 a 025)
│   │   ├── intelligence/     # Modelos de inteligência de mercado
│   │   ├── middleware/       # Auth, RBAC, CORS, Rate Limit, Logging, Security
│   │   ├── services/         # Motores de negócio (Meta, Attribution, Asaas, etc.)
│   │   ├── tests/            # 49 suítes de testes Jest/Supertest
│   │   ├── types/            # Declarações TypeScript globais
│   │   └── index.ts          # Ponto de entrada do servidor Express
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # Single Page Application React 18 + Vite
│   ├── src/
│   │   ├── components/       # Componentes compartilhados (Layout, AppShell, etc.)
│   │   ├── features/         # Módulos verticais de domínio (Dashboard, Checkout, etc.)
│   │   ├── lib/              # Utilitários de API e clientes
│   │   ├── services/         # Serviços de atribuição, Meta Pixel e sessão
│   │   ├── tests/            # 23 suítes de testes Vitest/Testing Library
│   │   ├── theme/            # Design tokens e tipografia
│   │   ├── types/            # Tipagens de domínio e entidades
│   │   ├── App.tsx           # Roteador principal e Providers
│   │   └── main.tsx          # Bootstrap React
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── NORQVA_CLAUDE_AUDIT_PACKAGE/ # Pacote documental sanitizado para auditoria
```

---

## 2. Mapa Detalhado de Módulos do Backend (`backend/src/`)

* **`controllers/`**:
  * `api.ts` (5.600+ linhas): Hub consolidado de rotas (Auth, Products, Offers, Orders, Payments, Webhooks, Delivery, Dashboard, Insights, Creative Performance).
  * `telemetryController.ts`: Ingestão first-party de eventos do funil comercial (`OFFER_VIEW`, `CHECKOUT_MODAL_OPENED`, etc.).
  * `marketDiscoveryController.ts`: Provedores e endpoints para inteligência de mercado e descoberta de anúncios.
  * `orchestrationController.ts`: Orquestração de agentes e sessões autônomas.

* **`services/`**:
  * `attribution/`:
    * `deterministicAttributionResolver.ts`: Resolução determinística de parâmetros de tráfego.
    * `attributionAnalyticsService.ts`: Agregação e cálculo de ROAS, CAC e conversão por criativo/campanha.
  * `meta/`:
    * `metaClient.ts`: Cliente HTTP da Graph API (leitura de campanhas, adsets, ads, insights diários).
    * `metaSyncService.ts`: Motor de sincronização e normalização de métricas de mídia.
    * `metaDemographicIngestionService.ts`: Ingestão de métricas agregadas por idade e gênero.
    * `metaSchedulerService.ts`: Agendador seguro de sincronização periódica.
    * `metaMutatingClient.ts`: Cliente com travas de segurança para criação e mutação de anúncios.
  * `intelligence/`:
    * `demographicAnalyticsService.ts`: Agregação e formatação demográfica para a UI.
    * `creativePerformanceService.ts`: Métricas de engajamento, CTR, CPC e conversão por criativo.
  * `marketIntelligence/`:
    * `marketDiscoveryProvider.ts`, `marketIngestionService.ts`, `metaAdLibraryProvider.ts`.
  * `entitlements/`:
    * `entitlementService.ts`: Liberação e validação de acessos a infoprodutos e webapps.
  * `emailService.ts` & `resendProvider.ts`: Envio transacional de credenciais e magic links.

---

## 3. Mapa Detalhado de Módulos do Frontend (`frontend/src/`)

* **`features/`**:
  * `dashboard/`: Visão Executiva V1, Inteligência Financeira V1, Linha Executiva, Funil First-Party, DRE.
  * `public/`: `PublicOfferPage.tsx` (página de vendas da oferta pública com telemetria).
  * `checkout/`: `CheckoutView.tsx` (checkout transparente, dados do pagador, validação de CPF).
  * `payment/`: `PaymentStatus.tsx` (exibição de QR Code Pix dinâmico, cópia de payload, polling de status).
  * `delivery/`: `OrderDeliveryView.tsx`, `DigitalDelivery.tsx`, recuperação de acesso.
  * `intelligence/`: `DemographicIntelligenceView.tsx`, `CreativePerformanceView.tsx`.
  * `acquisition/`: `MetaAdsView.tsx` (visão de campanhas e métricas Meta).
  * `experiments/`: `ExperimentsView.tsx` (gestão de testes A/B e criativos).
  * `opportunities/`: `OpportunitiesView.tsx` (detecção de oportunidades de escala).
  * `auth/`: `Login.tsx`, `ForgotPassword.tsx`, `PasswordRecovery.tsx`, hook `useAuth.ts`.
