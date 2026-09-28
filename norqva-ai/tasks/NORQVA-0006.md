# NORQVA-0006: Controle de campanhas Meta + botão "Abrir Arquivo"

**Branches:** `ai/NORQVA-0006-creative-lab-file` (botão) e `ai/NORQVA-0006-meta-control` (controle), a partir da `main` em `f6ca00a`
**Executor:** Claude · **Revisão:** CI · **Merge e deploy:** usuário
**Decisão:** D-0007

## Objetivo

1. Creative Lab: o botão "Abrir Arquivo" só aparece com link http(s) válido. Criativos da Fábrica sem arquivo mostram "Sem arquivo (Fábrica)".
2. Ativar/pausar campanha, conjunto e anúncio e mudar o orçamento diário pela tela Meta Ads do NORQVA, sem abrir o Gerenciador.

## Escopo (controle)

- **Migration 030 (aditiva):** `meta_campaigns.daily_budget` e `lifetime_budget`; a sincronização passa a gravar o orçamento da campanha (Advantage+/CBO).
- **`metaMutatingClient`:**
  - preflight real no Graph (`/me`, `/me/permissions`, `/act_…`, pixel), com cache de 5 min (30 s se falhar);
  - `setEntityStatus` resolve a linha pelo Meta ID ou UUID e chama a Meta sempre com o Meta ID;
  - novo `setDailyBudget` (campanha ou conjunto; mínimo R$ 5; teto `META_MAX_DAILY_BUDGET_BRL`, padrão R$ 100; recusa conjunto quando o orçamento está na campanha).
- **Rotas (ADMIN):**
  - `GET /api/meta-control/status`;
  - `POST /api/meta-control/:tipo/:id/status`;
  - `POST /api/meta-control/:tipo/:id/budget`.
- **UI:** aviso com o estado do controle, coluna "Ações" (Pausar/Ativar, Orçamento) e diálogo de confirmação.

## Para ligar em produção (usuário)

1. Mesclar os PRs. O Render aplica a migration 030 no deploy.
2. No Render, em Environment, definir `META_MUTATION_ENABLED=true`. Opcional: `META_MAX_DAILY_BUDGET_BRL`.
3. Garantir que o `META_ACCESS_TOKEN` tenha a permissão `ads_management` na conta `act_2887010388338951`.
4. No NORQVA, em Meta Ads, clicar em "Sincronizar Agora". O aviso deve ficar verde ("Controle de campanhas ativo").

## Critérios de aceite

- CI verde, com testes para:
  - preflight real e cache;
  - bloqueio sem flag e sem `ads_management`, sem chamada à Meta;
  - Meta ID correto;
  - teto e mínimo;
  - CBO x ABO;
  - acesso só de ADMIN;
  - UI com confirmação.
