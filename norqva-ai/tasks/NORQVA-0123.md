# NORQVA-0123: WhatsApp — venda ligada ao anúncio, um lembrete de Pix e fotos de amostra

**Branch:** `ai/NORQVA-0123-whatsapp-anuncio-lembrete-amostras` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 24/10/2026 01h55 ("Aprovado"), contrato no Claude Docs "NORQVA-0123 — Contrato: WhatsApp (atribuição do anúncio, lembrete de Pix e fotos de amostra)" · **Risco:** MEDIUM (mensagem nova ao cliente; nada muda em cobrança ou entrega)

## Contexto

Em 24/10/2026 a Evolution voltou a ser usada no +55 31 98585-5642 (`WHATSAPP_EVOLUTION_ENABLED=true`, servidor `evolution-api-latest-s3lt.onrender.com` com banco próprio `norqva-whatsapp-db`) e a campanha clique-para-WhatsApp "NQ – Trattoria – WhatsApp – Conversas" foi publicada pelo Ricardo.

## Escopo

- **A. Origem do anúncio:** a mensagem que vem de anúncio clique-para-WhatsApp (Evolution: `contextInfo.externalAdReply` com `sourceType = ad`; oficial: `referral`) vira uma origem em `whatsapp_refs` (`utm_source = facebook`, `utm_medium = whatsapp_ad`, `utm_content` e `attribution_metadata.ad_id`, `ctwa_clid`). O pedido herda pelo `refForConversation`; a atribuição liga o `ad_id` ao anúncio sincronizado. Código da página tem preferência. Só `ad_id` numérico; nada do texto do anúncio. `services/whatsapp/whatsappRefs.ts`.
- **B. Lembrete de Pix:** `services/whatsapp/pixReminder.ts`, passo 7 da varredura de pagamentos. Um lembrete por Pix (tabela `whatsapp_payment_reminders`, migration 081), texto fixo, Pix com 30 a 120 min, só o mais novo da conversa, conversa no BOT, número conectado e atendente ligado, ninguém escreveu nos últimos 25 min, limites por hora, 08h–22h de Brasília, confere no Asaas antes. Oficial só com janela de 24h. `WHATSAPP_PIX_REMINDER_ENABLED=true` liga (padrão desligado).
- **C. Fotos de amostra:** ferramenta `send_samples` do atendente (`services/whatsapp/samples.ts`): lista fixa de fotos do site por livro e kit, no máximo 4 por conversa, só JPEG/PNG até 5 MB conferidos pelo conteúdo; `sendImage` aceita `mimetype`.

## Regras

Nada muda em preço, cobrança, entrega ou liberação de acesso. Testes com WhatsApp, IA, Asaas e imagens simulados (`norqva_0123_whatsapp.test.ts`). Migration só aditiva.
