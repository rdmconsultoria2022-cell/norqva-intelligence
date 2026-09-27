# 11 — DEPLOYMENT STATE

## 1. Ambientes de Execução

| Componente | Plataforma / Host | URL Canônica | Branch / Gatilho |
| :--- | :--- | :--- | :--- |
| **Frontend** | Vercel Edge CDN | `https://norqva-intelligence-frontend.vercel.app` | `main` (Deploy Automático via Git) |
| **Backend API** | Render Web Service | `https://norqva-staging-api.onrender.com` | `main` (Deploy Automático via Git) |
| **Database** | Supabase Postgres 15 | Hospedado na AWS (Região São Paulo / US-East) | Migrations SQL manuais/controladas |

---

## 2. Últimos Commits em Produção
* **HEAD Atual em `main`:** `e689c8893b35ac90a2abab70201a0675a04f4ae0`
  * *Mensagem:* `feat(telemetry): add checkout modal opened funnel instrumentation (Gate 17.0B)`
  * *Data:* 26/09/2026 00:14 BRT
* **Commit Anterior:** `3d1503aadc7c98eeb00652c7862de80ebcc210b6`
  * *Mensagem:* `fix(auth): eliminate auto-provisioning and enforce strict fail-closed RBAC (SEC-01, SEC-02)`
  * *Data:* 25/09/2026 23:52 BRT

---

## 3. Status da Working Tree Local
* **Arquivos Modificados (UI/UX 1.0A Prototype):**
  * `frontend/src/components/layout/AppShell.tsx`
  * `frontend/src/components/layout/Header.tsx`
  * `frontend/src/components/layout/Sidebar.tsx`
  * `frontend/src/features/dashboard/DashboardView.tsx`
  * `frontend/src/lib/api.ts`
  * `frontend/src/theme/` (Untracked)
* **Status:** Não commitados, mantidos estritamente locais para revisão antes de aprovação.
