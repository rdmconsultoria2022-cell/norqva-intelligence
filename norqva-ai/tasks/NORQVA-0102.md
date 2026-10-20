# NORQVA-0102 — Ativar número oficial na API da Meta (PIN)

Data: 19/10/2026. Parte da etapa 2/3 do contrato NORQVA-0079 (aprovado em 15/10/2026 23h27).

## Problema
O número dedicado da Trattoria (+55 31 98585-5642) foi colocado na conta "Trattoria em Casa" (WABA 1578522077628653)
e verificado por SMS, mas fica "Pendente": a Cloud API só envia depois do registro
(`POST /{phone_number_id}/register` com o PIN de 6 números da verificação em duas etapas). O NORQVA não fazia isso.

## O que mudou
- `cloudAccounts.ts`: `registerCloudNumber` (só ADMIN, rota `POST /api/whatsapp/cloud/numbers/:id/register`).
  PIN validado (6 números), enviado só para a Meta, nunca salvo nem gravado no histórico.
- "Conferir na Meta" e o cadastro do número leem `platform_type`: diferente de `CLOUD_API` = número pendente
  (status DISCONNECTED com o aviso "Falta ativar o número...").
- Erros novos com texto claro: 133010 (não ativado), 133005 (PIN errado), 133006 (falta verificar), 133009 (tentativas rápidas).
- Tela: botão "Ativar número" no cartão do número oficial, com campo do PIN.

## Testes
Backend (Graph API simulada) e tela em `norqva_0079_whatsapp_cloud.test.*`.

## Rollback
Reverter o merge. Nada no banco muda (sem migration).
