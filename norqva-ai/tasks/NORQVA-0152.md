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
- Corpo do webhook do WhatsApp até 40 MB (fotos e vídeos também vêm em base64), aceito **só** com número e segredo certos
  (`webhookSecretMatches`, cache de 1 min); qualquer outro pedido segue no limite de 1 MB. Memória do áudio com teto de ~50 MB.
- Número já conectado passa a receber o áudio sozinho, uma vez, sem QR Code e sem trocar o endereço (`ensureMediaWebhook`: lê
  `GET /webhook/find` e grava o mesmo endereço com base64; endereço de outro número não é tocado; falha não muda nada e só tenta de novo
  em 1 h). Marca `whatsapp_numbers.webhook_media_base64` (migration 089, aditiva). Conectar de novo também marca.

## Testes

`norqva_0152_audio_webhook.test.ts`: áudio do webhook transcrito sem chamar a Evolution e sem o arquivo no banco; chave desligada
ignora o arquivo; reconfiguração uma vez, com volta do segredo na falha; chave desligada não mexe no webhook.

## Revisão independente

Subagente (29/10/2026). Bloqueantes corrigidos: (1) a troca de segredo podia deixar o número mudo (a Evolution não tenta de novo
depois de 404): agora o endereço não muda; (2) corpo de 25 MB aceito de qualquer um: agora só com o segredo certo. Também: espera
de 1 h entre tentativas, teto da memória. Observado na Evolution (fora do NORQVA): ela escreve as mensagens recebidas no próprio log
do Render (texto já era assim; agora também o começo do áudio). Vídeo acima de ~30 MB não passa (a Evolution tenta de novo e desiste).

## Execução

(preencher no merge)
