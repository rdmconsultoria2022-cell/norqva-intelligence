# NORQVA-0027: Fase 4a — Campanhas, modo manual e criação pausada pela tela

**Branch:** `ai/NORQVA-0027-campanhas` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 08/10/2026 19h26 ("Aprovado"), contrato no Claude Docs "NORQVA-0027 — Contrato: Fase 4a, Campanhas e Modo Manual" · **Risco:** HIGH (Meta)

## Escopo

- Tela **Campanhas** (Operação, só ADMIN): cada campanha = `launch_plans`, situação em português, `LaunchPlansCard` (Sim/Não) no topo.
- Migration 044 (aditiva): `launch_plans.manual_fields`, `auto_values`, `ad_creatives`.
- `CampaignEditorService` (só rascunho DRAFT/FAILED sem objetos na Meta):
  - `fill`: para cada anúncio, versão APROVADA mais nova da linhagem do criativo (pelo nome do anúncio ou o escolhido à mão); exige VIDEO, link https e `content_hash` igual ao da última aprovação; preenche vídeo, texto e título (campos manuais intactos), renomeia o anúncio para a chave do criativo e refaz `url_tags`.
  - `fields`: edição de texto, título, CTA, destino, orçamento por conjunto, teto e hipótese; marca como manual e guarda o valor automático anterior.
  - `ads/:i/creative`: escolher o criativo à mão; `reset`: volta ao automático.
  - `POST /api/campaigns`: campanha nova a partir de oferta + criativos aprovados (BR, 25–65, Advantage, pixel oficial).
  - "Zerar" é no formulário (limpa os campos; nada é salvo até "Salvar").
- "Criar na Meta (pausada)" usa a rota existente `POST /api/launch-plans/:id/create`, com confirmação.
- Travas novas: `meta-control` recusa ACTIVE em objeto de plano CREATING/CREATED_PAUSED/AWAITING_OPERATOR/REJECTED/FAILED; arquivo trocado depois da aprovação não entra em anúncio ("Aprovar de novo" na tela Criativos); revisão de criativo sem hash grava o hash antes de aprovar.

## Regras

Tudo nasce pausado; ativar e gastar só com o Sim; limites de orçamento e teto inalterados; nenhum teste fala com a Meta.

## Testes

`backend/src/tests/norqva_0027_campaigns.test.ts`, `frontend/src/tests/norqva_0027_campaigns_view.test.tsx`; teste do menu atualizado.
