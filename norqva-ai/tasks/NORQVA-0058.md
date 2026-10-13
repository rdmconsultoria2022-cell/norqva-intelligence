# NORQVA-0058: tela Criativos — claims recolhíveis, filtro por campanha, edição completa e lixeira

**Branch:** `ai/NORQVA-0058-criativos-filtros-edicao` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Pedido:** Ricardo, 13/10/2026 18h02: ocultar as Claims, campo com os nomes das campanhas nos filtros, todo o conteúdo do criativo editável e com exclusão.
**Autorização:** tela e texto sem aprovação (D-0037); a exclusão segue as regras da lixeira aprovadas em 13/10/2026 17h11 (D-0057): reversível, com código digitado, nada apagado e nada muda na Meta. · **Risco:** LOW

## Escopo

- Claims começam ocultas ("mostrar/ocultar"; o navegador lembra a escolha); o aviso de pendentes continua visível.
- Filtro "Procurar pelo nome da campanha" (lista com todas as campanhas e "Criativos não publicados").
- Editar: gancho, mecanismo, título, texto, CTA, roteiro e arquivo. O mecanismo entrou na revisão (`reviseCreative`): mudar conteúdo revisado cria nova versão para aprovar de novo.
- Lixeira de criativos: migration 061 (aditiva, `deleted_at`/`deleted_by`), `services/creative/creativeTrashService.ts`. Excluir leva todas as versões; bloqueia se um anúncio ligado está rodando na Meta ou se uma campanha do NORQVA na Meta usa o criativo. Restaurar traz as mesmas versões. Auditoria crítica `CREATIVE_DELETED`/`CREATIVE_RESTORED`.
- Rotas ADMIN: `GET /api/creative-factory/trash`, `POST /api/creative-factory/creatives/:id/{delete|restore}`.
- Testes: `norqva_0058_creative_trash.test.ts`, `norqva_0058_creatives_filters_edit.test.tsx`; ajuste no `norqva_0005` (claims ocultas).
