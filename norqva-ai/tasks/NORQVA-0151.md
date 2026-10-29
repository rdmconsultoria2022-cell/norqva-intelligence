# NORQVA-0151: atendente do WhatsApp entende e responde áudio

**Branch:** `ai/NORQVA-0151-audio-whatsapp` · **Autorização:** "Aprovado" do Ricardo em 29/10/2026 17h56 (Claude Docs "NORQVA-0151") · **Risco:** MEDIUM (dados de cliente: voz; pagamento e entrega intactos)

## Escopo

- `services/whatsapp/voice.ts`: chave `WHATSAPP_AUDIO_ENABLED`, transcrição (`gpt-4o-mini-transcribe`, `WHATSAPP_TRANSCRIBE_MODEL`), voz
  (`gpt-4o-mini-tts`, voz `nova`, OGG/Opus; `WHATSAPP_TTS_MODEL`, `WHATSAPP_TTS_VOICE`), marcadores e `speechText` (sem emoji, link, lista; até 600 caracteres).
- `provider.ts` (Evolution): `getMediaBase64` (`/chat/getBase64FromMediaMessage`) e `sendAudio` (`/message/sendWhatsAppAudio`), opcionais na interface.
- `whatsappService.extractText`: áudio gravado como `[áudio m:ss]` (duração do WhatsApp).
- `attendant.ts`: `transcribePending` (áudios dos últimos 15 min, até 3; >2 min ou >3 MB = `[áudio longo ...]`; falha = `[áudio não transcrito]`),
  regra 6 nova quando ligado, regra 9 (resposta falada curta) quando a última mensagem é áudio transcrito; `sendAll` manda a voz antes do texto
  (registro `[áudio enviado]`, kind AUDIO); falha na voz segue só por texto.
- Nada muda em cobrança, entrega, limites de envio e motor oficial (sem `getMediaBase64`: regra antiga).

## Testes

`norqva_0151_whatsapp_audio.test.ts`: marcadores, fala limpa, prompt por chave; conversa com áudio (CPF mascarado e fora da IA, voz + texto),
áudio longo, falha de transcrição, falha de voz, cliente que escreve, chave desligada. Suíte local: só as falhas de ambiente de sempre.

## Revisão independente

Subagente (29/10/2026): nada bloqueante no código. Aplicado: registro da ida do áudio à OpenAI na D-0151; CPF falado em pedaços
(`compactSpokenNumbers`); pedido falado para parar (`isSpokenStop`, OPT_OUT_RE, isExplicitStop) põe a conversa em OPTED_OUT sem resposta;
`[áudio enviado]` fora dos limites por hora; regra 6 explica `[áudio m:ss]` antigo sem texto. Antes de ligar a chave: conferir
`DATABASE_SAVE_DATA_NEW_MESSAGE=true` no servidor da Evolution.

## Execução

(preencher no merge)
