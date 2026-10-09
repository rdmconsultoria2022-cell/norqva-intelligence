# NORQVA-0031: Cartões de receita, critérios recomendados e custos por oferta

**Branch:** `ai/NORQVA-0031-cartoes-criterios-custos` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 08/10/2026 23h51 ("Aprovado"), análise e contrato no Claude Docs "NORQVA-0031 — Análise: Cartões de Receita e Critérios Recomendados" · **Risco:** LOW (só frontend)

## Escopo

1. Cartões Receita atribuída / orgânica / não atribuída (Resultados → Financeiro) leem `performanceAttribution.attributedMediaTruth.commercialRollup` (antes liam nomes inexistentes e mostravam zero). Ambíguos somados ao "Não atribuído"; aviso quando a soma difere do faturamento.
2. Aba Critérios: recomendação do Claude por item (`features/research/recommendation.ts`, 6 de 21 mudam) e botão "Usar a recomendação do Claude" que só preenche o formulário; valer continua exigindo salvar e validar.
3. Produtos: "Custos e equilíbrio" por oferta (ADMIN), usando `GET/PUT /api/offers/:id/unit-economics` que já existia sem tela; equilíbrio calculado na hora.

## Regras

Sem mudança de servidor nem de banco; nenhum cálculo financeiro muda; testes não falam com a Meta nem com o Asaas.

## Testes

`frontend/src/tests/norqva_0031_cards_criteria_costs.test.tsx`.
