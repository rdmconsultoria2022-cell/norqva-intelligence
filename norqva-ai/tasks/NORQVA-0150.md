# NORQVA-0150: aviso "Ativação incompleta" some quando tudo já está ativo na Meta

**Branch:** `ai/NORQVA-0150-aviso-ativacao` · **Tipo:** correção de tela (D-0037, sem aprovação) · **Risco:** LOW (só leitura; nada é gravado nem enviado à Meta)

## Problema (29/10/2026 17h35)

A tela Campanhas pedia "Sim" de novo para o plano do mandato (`CMP-OFF-000010-26102623215556`, status APPROVED) por causa de um erro antigo da Meta (#613, limite de chamadas), embora campanha, conjunto e os 4 anúncios estivessem ATIVOS.

## Correção

- `LaunchPlanService.list`: plano APPROVED com `last_error` ganha `activation_complete` (campanha, conjuntos e anúncios de `meta_ids` todos com status ACTIVE na última sincronização; `activationComplete`).
- `CampaignEditorService.get/list` (tela Campanhas) também devolvem `activation_complete`.
- `needsOperator` (cartão, resumo da Visão Executiva e faixa do celular "aguardando seu Sim"): não pede resposta quando `activation_complete`.
- Tela Campanhas: plano assim aparece como "Ativa" (`shownStatus`) e sem o quadro "Último erro".

## Testes

`backend/src/tests/norqva_0150_activation_notice.test.ts`, `frontend/src/tests/norqva_0150_activation_notice.test.tsx`.

## Revisão independente

Subagente (29/10): bloqueante aplicado (a faixa do celular usava a regra antiga e a lista de `/api/campaigns` não trazia `activation_complete`); aplicada também a nota do rótulo "Aprovada (ativando)" e do "Último erro". Fica como está: orçamento não é conferido (no nosso fluxo é aplicado antes de ativar); entre 00h e 06h a pausa noturna deixa a campanha PAUSED e o aviso pode voltar, como já acontecia.

## Execução

(pendente)
