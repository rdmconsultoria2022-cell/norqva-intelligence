# NORQVA-0152: áudio chega junto com o webhook (a Evolution não guarda mensagens)

**Branch:** `ai/NORQVA-0152-audio-webhook` · **Tipo:** ajuste da NORQVA-0151 (mesma aprovação, 29/10/2026 17h56) · **Risco:** LOW–MEDIUM

## Problema

A NORQVA-0151 baixava o áudio pela Evolution (`getBase64FromMediaMessage`), o que exige `DATABASE_SAVE_DATA_NEW_MESSAGE=true`
no servidor do WhatsApp. Isso faria a Evolution guardar todas as mensagens, inclusive CPF em texto aberto (contra a regra do CPF).
No Render o valor está `false` (Ricardo, 29/10 18h27).

## Correção

- Webhook da Evolution com `base64: true`: o arquivo do áudio vem na mensagem. Só o áudio é usado, guardado **na memória** por
  até 15 min (`rememberInboundAudio`/`takeInboundAudio` em `voice.ts`, até 3 MB) e só com `WHATSAPP_AUDIO_ENABLED=true`. Nada vai para o banco.
- `transcribePending` usa primeiro o áudio da memória; a Evolution fica como segunda tentativa.
- Corpo do webhook do WhatsApp com limite próprio de 25 MB (fotos e vídeos também vêm em base64); o resto da API segue com 1 MB.
- Número já conectado recebe o webhook novo sozinho, uma vez, sem QR Code (`ensureMediaWebhook`: segredo novo + `setWebhook`;
  falhou, volta o segredo antigo). Marca `whatsapp_numbers.webhook_media_base64` (migration 089, aditiva). Conectar de novo também marca.

## Testes

`norqva_0152_audio_webhook.test.ts`: áudio do webhook transcrito sem chamar a Evolution e sem o arquivo no banco; chave desligada
ignora o arquivo; reconfiguração uma vez, com volta do segredo na falha; chave desligada não mexe no webhook.

## Revisão independente

(preencher)

## Execução

(preencher no merge)
