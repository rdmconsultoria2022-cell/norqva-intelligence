# NORQVA-0150: aviso "Ativação incompleta" some quando tudo já está ativo na Meta

**Branch:** `ai/NORQVA-0150-aviso-ativacao` · **Tipo:** correção de tela (D-0037, sem aprovação) · **Risco:** LOW (só leitura; nada é gravado nem enviado à Meta)

## Problema (29/10/2026 17h35)

A tela Campanhas pedia "Sim" de novo para o plano do mandato (`CMP-OFF-000010-26102623215556`, status APPROVED) por causa de um erro antigo da Meta (#613, limite de chamadas), embora campanha, conjunto e os 4 anúncios estivessem ATIVOS.

## Correção

- `LaunchPlanService.list`: plano APPROVED com `last_error` ganha `activation_complete` (campanha, conjuntos e anúncios de `meta_ids` todos com status ACTIVE na última sincronização; `activationComplete`).
- `needsOperator` (cartão e resumo da Visão Executiva): não pede resposta quando `activation_complete`.

## Testes

`backend/src/tests/norqva_0150_activation_notice.test.ts`, `frontend/src/tests/norqva_0150_activation_notice.test.tsx`.

## Revisão independente

(pendente)

## Execução

(pendente)
