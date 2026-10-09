# NORQVA-0029: Fase 5 — Pesquisa numa tela, com critérios validados pelo dono

**Branch:** `ai/NORQVA-0029-pesquisa` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 08/10/2026 21h06 ("Aprovado"), contrato no Claude Docs "NORQVA-0029 — Contrato: Fase 5, Pesquisa numa Tela" · **Risco:** MEDIUM

## Escopo

- Tela **Pesquisa** (Inteligência) com as abas Base (Base de campanhas + mercado europeu + seleção), Oportunidades (Time de IAs), Critérios e Histórico (módulo antigo, só consulta).
- Migration 045 (aditiva): `research_criteria_versions` e `campaign_opportunities.criteria_version`.
- `CriteriaService`: v1 nasce em rascunho com os valores de sempre; ajuste cria versão nova em rascunho; validar (ADMIN) só o rascunho mais novo com os textos atuais; a validada anterior vira SUPERSEDED; nada é apagado. Sem versão validada, vale `DEFAULT_NUMBERS` (comportamento de antes).
- Números usados de verdade: classes da Base (`scoreEntity`), padrões da seleção de candidatos, pesos e notas do mercado europeu (`scoreNiche`). Checklist do validador e regras das IAs (`criteriaTexts.ts`) entram na validação por hash.
- Avaliação grava `criteria_version`; contexto das IAs recebe os critérios em vigor; "Aprovar plano" (conta real) recusado sem versão validada ou com texto mudado.
- `POST /api/opportunities` (módulo antigo, análise simulada) responde 410; o que existe fica no Histórico, sem botões.
- Menu: saem Base de campanhas, Time de IAs e Oportunidades; os endereços antigos abrem Pesquisa na aba correspondente. Leitura para os perfis de análise (inclui OPERATIONS na lista de oportunidades).

## Regras

Nada gasta nem cria na Meta; plano aprovado continua em rascunho e pausado até o Sim; nenhum teste fala com a Meta ou com as IAs.

## Testes

`backend/src/tests/norqva_0029_research_criteria.test.ts`, `frontend/src/tests/norqva_0029_research.test.tsx`; testes de menu e Base ajustados.
