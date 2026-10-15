# NORQVA-0066: sincronização automática da Meta logo após o deploy e incluindo hoje

**Branch:** `ai/NORQVA-0066-meta-sync-hoje` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Pedido:** Ricardo, 14/10/2026 21h54: "Faça uma auditoria no sistema... sensação de que os custos da meta não estão aparecendo". **Autorização:** correção de erro (D-0037). Só leitura de dados da Meta; não mexe em gasto, orçamento nem campanhas. · **Risco:** LOW

## Causa encontrada na auditoria

1. A sincronização automática só rodava depois de um intervalo inteiro (60 min) desde que o servidor subiu. Cada merge é um deploy e reinicia esse relógio: em dias com vários merges, ela quase nunca rodava.
2. A rodada automática usava o período `last_3d` da Meta, que não inclui o dia de hoje. Com o filtro "Hoje", o gasto aparecia zerado até alguém clicar em Sincronizar.

## Correção

- Primeira rodada 2 minutos depois de o servidor subir; depois, no intervalo normal.
- A rodada automática lê os últimos 7 dias incluindo hoje (fuso de São Paulo), o que também cobre falhas de alguns dias.
- Teste: `meta_automated_sync.test.ts` (dois testes novos).
