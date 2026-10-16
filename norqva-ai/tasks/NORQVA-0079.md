# NORQVA-0079: WhatsApp oficial (Cloud API da Meta) — etapa 1

**Branch:** `ai/NORQVA-0079-whatsapp-cloud-etapa1` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** Ricardo, 15/10/2026 23h27 ("Aprovado para todas as questões"), contrato NORQVA-0079 no Claude Docs · **Risco:** MÉDIO (código novo isolado, migração só aditiva, envio real desligado por padrão)

## Decisões aprovadas (15/10/2026 23h27)

1. Etapa 1 implementada e mesclada após CI verde e revisão.
2. App da Meta dedicado ao WhatsApp, no portfólio "Norqva".
3. Conta de teste ligada à marca Trattoria em Casa.
4. Homologação com Pix de um produto pago pelo Ricardo, pedido marcado como teste.
5. Destinatário de teste: número informado pelo Ricardo no chat (só recebe; nunca remetente).

## Escopo (etapa 1 — base, sem envio real)

- Migration 067 (aditiva): `whatsapp_cloud_accounts`; em `whatsapp_numbers` provider, conta, phone_number_id, número exibido, nome verificado, qualidade, limite; em `whatsapp_messages` delivery_status, error_code, template_name.
- `utils/secretBox.ts`: token e App Secret criptografados (AES-256-GCM, chave `WHATSAPP_SECRETS_KEY`).
- `services/whatsapp/metaCloudProvider.ts`: motor oficial (texto, imagem por upload, template), travas, erros da Meta, nova tentativa em limite.
- `services/whatsapp/cloudAccounts.ts`: contas por marca e ambiente, conferência (permissões, WABA, números, assinatura do webhook), número oficial, `providerForNumber`.
- `services/whatsapp/cloudWebhook.ts`: verificação GET, assinatura sobre o corpo bruto, conversão, status de envio sem rebaixar.
- `services/whatsapp/serviceWindow.ts`: janela de 24h (margem de 5 min).
- `services/whatsapp/errors.ts`: `WhatsAppError` em arquivo próprio (evita import circular; `whatsappService` reexporta).
- `whatsappService.ts`: `ingestInbound()` extraída de `handleWebhook` sem mudar comportamento; número oficial em conectar/atualizar/trocar/excluir; resposta do operador por número com janela e registro de BLOCKED.
- `attendant.ts`: motor por número; com envio barrado não gera cobrança; pedido de número TEST vira `STAGING_SANDBOX_QA`.
- `whatsappDelivery.ts`: motor por número; janela fechada ou trava = `SKIPPED` (o e-mail de acesso continua); varredura roda também com conta oficial ativa.
- `whatsappRefs.ts`: botão das páginas só com número que responde (Evolution ligada, ou oficial PRODUCTION conferido com envio liberado). Número de teste nunca aparece.
- `provider.ts`: Evolution só com `WHATSAPP_EVOLUTION_ENABLED=true`.
- `controllers/api.ts`: pedido que não é `COMMERCIAL_PRODUCTION` não envia Purchase para a Meta (pedido de teste não vira compra falsa).
- `middleware/logging.ts`: `hub.verify_token` mascarado nos logs.
- `index.ts`: corpo bruto só na rota do webhook oficial; rotas novas; webhook oficial fora do limitador geral.
- Tela: `CloudAccountsPanel.tsx` na aba Números (travas, contas, verify token mostrado uma vez, conferir, usar número); número oficial sem QR Code; conversa com janela fechada não deixa digitar; status da mensagem (bloqueada, entregue, lida, não chegou).

Diferença do contrato: `utils/envValidation.ts` não foi alterado — o aviso de chave ausente aparece na tela (`secrets_key_configured`) e o cadastro devolve 503 claro.

## Rotas

| Rota | Quem |
| --- | --- |
| `GET/POST /api/whatsapp/cloud/webhook/:accountId` | Meta (público, assinatura obrigatória no POST) |
| `GET /api/whatsapp/cloud/accounts` | ADMIN, OPERATIONS |
| `POST /api/whatsapp/cloud/accounts`, `PATCH/DELETE /:id`, `POST /:id/check` | ADMIN |
| `POST /api/whatsapp/cloud/numbers` | ADMIN |

## Travas (padrão ao entrar)

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `WHATSAPP_CLOUD_SEND_ENABLED` | ausente = bloqueado | nada sai para a Meta; mensagem fica `BLOCKED` |
| `WHATSAPP_CLOUD_ENVIRONMENTS` | `TEST` | ambientes que podem enviar |
| `WHATSAPP_EVOLUTION_ENABLED` | ausente = desligada | Evolution não conecta nem envia |
| `WHATSAPP_SECRETS_KEY` | — | obrigatória para cadastrar conta (32 bytes, base64 ou hex) |

## Testes

`backend/src/tests/norqva_0079_whatsapp_cloud.test.ts` e `frontend/src/tests/norqva_0079_whatsapp_cloud.test.tsx` (Graph API e Asaas sempre simulados). Os testes da NORQVA-0046/0047/0054 continuam sem alteração.

## Rollback

Desligar `WHATSAPP_CLOUD_SEND_ENABLED` (ou desativar a conta na tela) volta ao estado anterior; reverter o PR deixa a tabela e as colunas novas vazias e inofensivas.
