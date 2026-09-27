# 06 — FRONTEND AND UI

## 1. Visão Geral do Frontend
* **Stack:** React 18, TypeScript, Vite, TailwindCSS, Lucide Icons, KaTeX.
* **Roteador:** Roteamento declarativo com suporte a rotas públicas, autenticadas e recuperação.
* **Estado e Contexto:** Contextos dedicados para Autenticação (`useAuth`), Atribuição (`attribution.ts`) e Sessão de Compra (`purchaseSession.ts`).

---

## 2. Mapa de Rotas do Frontend

| Rota | Componente / View | Tipo | Descrição |
| :--- | :--- | :---: | :--- |
| `/` | `DashboardView.tsx` | Protegida | Dashboard executiva com KPIs, DRE, Mídia e Funil. |
| `/oferta` | `PublicOfferPage.tsx` | Pública | Página de conversão com telemetria first-party. |
| `/checkout` | `CheckoutView.tsx` | Pública | Checkout transparente integrado com Asaas Pix. |
| `/pagamento` | `PaymentStatus.tsx` | Pública | QR Code Pix dinâmico e monitoramento em tempo real. |
| `/entrega` | `OrderDeliveryView.tsx` | Pública | Download seguro de infoprodutos e webapps. |
| `/recuperar-acesso` | `AccessRecoveryView.tsx` | Pública | Formulário de recuperação de pedidos por e-mail. |
| `/inteligencia/demografia`| `DemographicIntelligenceView.tsx`| Protegida | Relatórios demográficos por idade e gênero. |
| `/inteligencia/criativos` | `CreativePerformanceView.tsx` | Protegida | Performance comparativa de criativos e anúncios. |
| `/aquisicao/meta-ads` | `MetaAdsView.tsx` | Protegida | Monitoramento de campanhas, conjuntos e anúncios. |
| `/experimentos` | `ExperimentsView.tsx` | Protegida | Painel de controle de testes A/B. |
| `/login` | `Login.tsx` | Pública | Autenticação administrativa com Supabase Auth. |

---

## 3. UI/UX Refresh V1 (Gate UI/UX 1.0A)
Implementada modernização visual completa em ambiente local:
* **Tema:** Light SaaS profissional (`slate-50`, `#F8FAFC`).
* **Superfícies:** Cards em branco puro com bordas sutis (`border-slate-200/80`) e sombras suaves.
* **Componentes de Navegação:** Sidebar com logo estilizado e menu contextual; Header glassmorphic com switcher `DEMO / REAL`.
* **Visualização de Funil:** 5 etapas com cálculo dinâmico de conversão e perda por etapa.
