# NORQVA-0161 — WhatsApp: capas dos livros do kit sempre junto

**Pedido (Ricardo, 01/11/2026 23h14):** "No atendimento, ajuste para que o atendente sempre envie as imagens dos livros que compõem o kit. Isso dá mais robustez para que a compra seja concluída." (conversa do Chef Francisco Romim: pediu o Kit Trattoria Completo pelo código URS7XT e recebeu só texto.)

**Tipo:** conteúdo do atendimento (D-0037, sem aprovação prévia). Nenhuma cobrança, preço ou entrega muda.

## O que muda

- `services/whatsapp/samples.ts`: `KIT_BOOK_COVERS` (capas no site, sem preço): Kit de 5 = Trattoria, Risotos, Antipasti, Pães, Dolci; Coleção = os 5 + o cardápio bônus; +4 livros; kit de 2. Legenda `Livro do kit · <livro>`; `kitCoversSent` lê o histórico (capa já enviada nesta conversa, por qualquer kit, não vai de novo).
- `services/whatsapp/attendant.ts`: `kitTopic` decide se o assunto é um kit (imagem de kit nesta resposta > cliente falou "kit"/"coleção" > anúncio de origem da conversa é um kit; só kit do catálogo do número) e `queueKitCovers` põe as capas que faltam no fim da resposta, depois do texto e da imagem da oferta. Não vai na resposta que gerou cobrança (o código do Pix fica por último) nem na que reenvia arquivos. Envio automático (não depende de a IA lembrar); regra 6b2 no prompt avisa a IA para não descrever as capas.
- Não mexe na ordem das ofertas com preço (D-0153): as capas não têm preço.

## Testes

`norqva_0153_offer_cards.test.ts`: pedido do kit → 5 capas depois do texto, uma vez por conversa; imagem da coleção → 6 capas (com o cardápio); conversa sem kit → nenhuma. `norqva_0151_whatsapp_audio.test.ts` ajustado (falou do kit no áudio: capas vêm depois).
