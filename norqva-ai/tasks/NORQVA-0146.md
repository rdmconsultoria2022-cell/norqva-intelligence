# NORQVA-0146: PDF enviado direto no WhatsApp

**Branch:** `ai/NORQVA-0137-pdf-no-whatsapp (nome mantido; o número 0137 já era do mandato de operação)` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 28/10/2026 23h46 ("aprovado"), contrato no Claude Docs "NORQVA-0146 — PDF enviado direto no WhatsApp" · **Risco:** MEDIUM (entrega ao comprador; regra do PAID igual)

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

## Revisão independente (aplicada)

- Número 0146 (o 0137 já era o mandato de operação; a tarefa dele foi mantida). Branch com o nome antigo.
- Os PDFs depois do PAID vão **em segundo plano**: a confirmação do pagamento (webhook do Asaas) não espera os arquivos subirem.
- A mensagem só avisa "mando o arquivo em PDF" quando há PDF elegível (pago, entrega ativa, até 60 MB, dentro do limite).
- A ferramenta do atendente só aceita pedido com entrega ACTIVE e com PDF elegível; senão chama uma pessoa.
- `sendDocument` da Evolution com 90 s de limite; legenda só quando não está vazia; arquivo repetido no pedido sai uma vez só.

## Limites conhecidos

- O envio do PAID conta como 1 dos 3; sobram 2 reenvios. Duas conversas ao mesmo tempo podem passar 1 envio do limite.
- O arquivo enviado fica no celular do comprador e nos servidores do WhatsApp/Evolution; a revogação do NORQVA não alcança essas cópias.
- O telefone do pedido feito pela página é o que o comprador digitou; o dono daquele número pode receber o PDF dessa compra (só o livro, nenhum dado da pessoa).
- Quem tem duas compras recebe pelo atendente os arquivos da mais recente.
