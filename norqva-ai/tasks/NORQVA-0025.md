# NORQVA-0025: Fase 2 da consolidação — Criativos numa tela só

**Branch:** `ai/NORQVA-0025-criativos-tela-unica` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 08/10/2026 18h46 ("Aprovado"), contrato no Claude Docs "NORQVA-0025 — Contrato: Fase 2, Criativos numa Tela Só" · **Risco:** MEDIUM

## Problema

O Creative Lab cadastrava criativo à mão mas não anexava arquivo depois, não aprovava nem ligava a anúncio; a Fábrica fazia isso, mas filtrava `batch_code IS NOT NULL` e não enxergava criativos manuais. Aprovar exige claims verificadas, e só lote registrava claims.

## Escopo

1. A Fábrica vira a tela **Criativos** (menu: um item só em Operação; a aba antiga `creatives` redireciona).
2. Todos os criativos não apagados aparecem, com selo de origem (`origin`: BATCH, AI_TEAM, MANUAL, META).
3. "Novo criativo" na tela; `POST /api/creatives` aceita arquivo vazio (valida http/https quando vem), grava `primary_text`, `utm_content_key` e `content_hash`.
4. `POST /api/creative-factory/creatives/:id/claims` (ADMIN, CREATIVE): liga claim existente do mesmo produto ou cria nova `UNVERIFIED`. Bloqueado em criativo APPROVED/SUPERSEDED.
5. Revisão, nova versão, anexar arquivo e ligar anúncio passam a valer para qualquer criativo.
6. Textos: "fora da Fábrica" → "sem criativo no NORQVA"; Método "Trazer para Criativos".

## Regras

Regra de aprovação igual (claims verificadas, só ADMIN aprova; ADMIN verifica claims). Nada publicado na Meta. Lotes iguais. Sem migration. Pagamento e entrega intocados.

## Testes

`backend/src/tests/norqva_0025_creatives_unified.test.ts`, `frontend/src/tests/norqva_0025_creatives_view.test.tsx`; testes do menu e da Fábrica atualizados para os nomes novos.
