# NORQVA-0024: Fase 1 da consolidação — menu em áreas

**Branch:** `ai/NORQVA-0024-menu-areas` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 08/10/2026 18h40 ("Aprovado"); desenho de 8 telas aprovado às 18h38 (Claude Docs "NORQVA — Análise de Consolidação de Telas") · **Risco:** LOW (só menu)

## Escopo

`Sidebar.tsx` passa a agrupar as 18 telas atuais em áreas recolhíveis, na ordem do fluxo:

- **Visão Geral:** Visão Geral (antes "Visão Executiva"), Créditos Meta
- **Inteligência:** Base de campanhas, Time de IAs, Oportunidades (antes "Intelligence"), Performance de Criativos, Demografia, Decisões
- **Operação:** Produtos, Ofertas, Creative Lab, Fábrica de Criativos, Método NORQVA, Meta Ads, Experimentos
- **Configurações:** Marcas, Equipe, Configurações

A área da tela aberta não recolhe. `navigationItems` continua exportado (lista plana, usada no título do Header).

## Regras

Ids das telas inalterados; nenhuma tela, rota, dado, permissão, backend, pagamento, entrega ou Meta alterado. Área Vendas entra na fase 3.

## Testes

`frontend/src/tests/norqva_0024_menu_areas.test.tsx`; testes existentes do Sidebar continuam válidos.
