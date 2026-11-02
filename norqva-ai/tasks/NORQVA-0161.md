# NORQVA-0161 — WhatsApp: capas dos livros do kit sempre junto

**Pedido (Ricardo, 01/11/2026 23h14):** "No atendimento, ajuste para que o atendente sempre envie as imagens dos livros que compõem o kit. Isso dá mais robustez para que a compra seja concluída." (conversa do Chef Francisco Romim: pediu o Kit Trattoria Completo pelo código URS7XT e recebeu só texto.)

**Tipo:** conteúdo do atendimento (D-0037, sem aprovação prévia). Nenhuma cobrança, preço ou entrega muda.

## O que muda

- **Uma imagem só por kit** ("O que vem no …", capas numeradas, sem preço, no visual dos cartões de oferta): `frontend/public/images/whatsapp/kit-capas-{colecao,kit5,kit4,kit2}.jpg`, geradas por `norqva-ai/produtos/whatsapp_cards/build_kit_covers.py` (mudou capa ou composição: rodar de novo). Uma mensagem só (não estoura o limite de respostas por hora nem faz rajada de imagens).
- `services/whatsapp/samples.ts`: `KIT_COVER_IMAGES`, `kitCoverKeyFor` (catálogo), `kitCoverKeyFromText` (texto do cliente: "não quero kit" e bordado não contam; "kit" sem detalhe = 5 livros), `kitCoversSent` (Coleção e Kit de 5 têm os mesmos livros: mostrou um, não manda o outro).
- `services/whatsapp/attendant.ts`: `kitTopic` decide se o assunto é um kit (imagem de kit nesta resposta > cliente falou "kit"/"coleção" > anúncio de origem da conversa é um kit; só kit do catálogo do número) e `queueKitCovers` põe a imagem no fim da resposta, depois do texto e da imagem da oferta. Lê tudo o que o cliente escreveu desde a última resposta. Número com mais de uma marca sem assunto escolhido: só pela imagem de kit já enviada. Não vai na resposta que gerou cobrança (o código do Pix fica por último), que reenvia arquivos ou que pediu uma pessoa, nem em conversa com pedido aguardando ou pago. Envio automático (não depende de a IA lembrar); regra 6b2 no prompt avisa a IA para não descrever as capas.
- Não mexe na ordem das ofertas com preço (D-0153): as capas não têm preço.

## Testes

`norqva_0153_offer_cards.test.ts`: pedido do kit → a imagem do kit depois do texto, uma vez por conversa (nem a da coleção depois); imagem da coleção → a imagem da coleção; "não quero kit" e conversa sem kit → nenhuma; leitura do texto do cliente. Revisão independente aplicada (imagem única, negação, várias marcas, pagamento/pessoa, mensagens juntadas). `norqva_0151_whatsapp_audio.test.ts` ajustado (falou do kit no áudio: capas vêm depois).
