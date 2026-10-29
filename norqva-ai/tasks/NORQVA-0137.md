# NORQVA-0137: PDF enviado direto no WhatsApp

**Branch:** `ai/NORQVA-0137-pdf-no-whatsapp` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 28/10/2026 23h46 ("aprovado"), contrato no Claude Docs "NORQVA-0137 — PDF enviado direto no WhatsApp" · **Risco:** MEDIUM (entrega ao comprador; regra do PAID igual)

## Contexto

Algumas pessoas não conseguem baixar pelo link. Até aqui o WhatsApp mandava só o link de acesso depois do PAID.

## Escopo

- Migration 087 (só aditiva): `whatsapp_pdf_sends` (cada envio dos arquivos de um pedido: PAID ou RESEND, enviados e pulados).
- `provider.sendDocument` (Evolution: `sendMedia` com `mediatype: document`; oficial: `type: document` por link). Opcional na interface.
- `sendOrderPdfs` (`whatsappDelivery.ts`): só pedido PAID com pagamento CONFIRMED, só entregas ACTIVE (estorno/contestação revogam), só PDF, até 60 MB (acima fica só o link), no máximo 3 envios por pedido, link assinado de 15 minutos, cada arquivo registrado na conversa como `[arquivo] nome.pdf`. Nunca lança exceção.
- Depois do link de acesso (compra feita pela conversa), os PDFs vão logo em seguida; a mensagem avisa "Logo abaixo eu também mando o arquivo em PDF".
- Atendente: ferramenta `resend_files` e regra 5a. Só pedido pago desta conversa ou com o mesmo telefone (55 + DDD + 8 últimos, `phoneKey`); sem compra, pede o e-mail e chama uma pessoa (nada é enviado). Os arquivos saem depois da resposta, com tudo conferido de novo.
- Testes `norqva_0137_whatsapp_pdf.test.ts`.

Nada é liberado sem PAID confirmado pelo Asaas. E-mail de acesso e link iguais.
