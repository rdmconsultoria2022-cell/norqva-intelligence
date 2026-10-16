# NORQVA-0082: Visão Geral mobile premium (protótipo, fase 3 do redesign)

**Branch:** `ai/NORQVA-0082-visao-geral-premium` (a partir da `main`, commit b2ad7fd)
**Executor:** Claude · **Revisão:** revisão independente (subagente) feita; CI pendente · **Merge:** NÃO. Aguarda aprovação do protótipo pelo Ricardo.
**Autorização:** briefing "NORQVA — Redesign Mobile Premium inspirado no aplicativo XP" (16/10/2026): auditoria + protótipo da Visão Geral; sem produção, sem deploy, sem outras telas antes do "aprovado". · **Risco:** LOW (só apresentação)

## Escopo do protótipo

- Tokens do Design System NORQVA Premium no `tailwind.config.js` (`nq-*`: cores com contraste conferido, escala de texto com mínimo de 12 px).
- Peças compartilhadas em `components/ui/premium.tsx` (Section, Surface, Row/RowGroup, StatusPill, ProgressBar, Disclosure, Stat, formatação pt-BR).
- `features/dashboard/ExecutiveOverview.tsx`: nova Visão Geral (receita em destaque, investimento, ROAS, resultado estimado, vendas, comparação com o período anterior, o que precisa de você, teto, campanhas, operação, últimas vendas). `DashboardView` delega `section="overview"` para ela; a aba Financeiro não muda.
- `features/dashboard/previousPeriod.ts`: datas do período anterior com a mesma regra do servidor; sem comparação quando o anterior cairia antes de 25/09/2026.
- Topo e barra de baixo com os tokens novos; sino de alertas; nomes curtos na barra ("Início", "Ajustes").

## Regras respeitadas

Mesmos endpoints, mesmas fórmulas (tudo vem do resumo financeiro do servidor). Aprovação de campanha e teto continuam só nos componentes originais (`LaunchPlansCard`, `ExperimentGuardCard`), abertos dentro de áreas expansíveis. Nada de backend, banco, Meta, Asaas, permissões ou auditoria.

## Pendente antes de qualquer merge

- Atualizar testes: `norqva_0030_products_results` (título da seção, `/financial/dashboard` agora é chamado na Visão Geral, "ver detalhes" do crédito virou linha clicável), `norqva_0071_header_period_layout` (ordem e testids da Visão Geral; período saiu do topo nessa tela), `norqva_0024_menu_areas` (rótulos "Início"/"Ajustes").
- Teste novo: `norqva_0082_previous_period.test.ts` (rodado localmente com Bun: 9/9).
- CI verde.
