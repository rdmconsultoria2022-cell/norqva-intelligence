# NORQVA-0052: editar o teto na tela Campanhas e não pausar campanha lucrativa

**Branch:** `ai/NORQVA-0052-teto-e-lucro` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** contrato NORQVA-0052 aprovado pelo Ricardo em 11/10/2026 21h14 · **Risco:** MEDIUM (gasto na Meta)

## Motivo

Ricardo (11/10/2026 21h14): "Adicione uma função de editar o teto de gasto na tela Campanhas, e outro critério: se a campanha estiver dando lucro o NORQVA não deverá pausar a campanha".

## Escopo

- Migration 058 (aditiva): `launch_plans.max_spend_initial_brl`, `max_spend_ceiling_brl`, `profit_extend_enabled`, `cap_extensions`.
- `POST /api/launch-plans/:id/spend-cap`: qualquer situação; rascunho grava como edição manual; subir depois do Sim pede código + motivo (≥ 10 letras); teto máximo e regra de lucro; pergunta de ativação atualizada; plano CAPPED com teto acima do gasto volta a WATCHING (sem reativar); auditoria `LAUNCH_PLAN_CAP_CHANGED`.
- Vigia (`experimentGuardService.ts`): no teto, mede o lucro (campanha inteira e últimos 3 dias; ≥ 3 vendas pagas comerciais; líquido > gasto) e estende o teto em 50% até o teto máximo; decisão SYSTEM `EXPERIMENT_GUARD_EXTEND_CAP`, alerta/auditoria `EXPERIMENT_CAP_EXTENDED_PROFIT`, novo `spend_cap` na Meta. Qualquer dúvida → pausa como antes.
- Meta: leitura `getCampaignSpendBetween` (insights com `time_range`, só GET).
- Tela: cartão "Teto dos experimentos" dentro da campanha (aba Teto e vigia) com "Editar teto", teto máximo, "Não pausar se estiver dando lucro" e lucro atual.
- Testes: `norqva_0052_cap_profit.test.ts` (backend), `norqva_0052_cap_edit.test.tsx` (frontend); ajustes em H6/H8.

## Fora do escopo

- Nada é ativado nem gasto por esta mudança; orçamento diário não muda sozinho.
