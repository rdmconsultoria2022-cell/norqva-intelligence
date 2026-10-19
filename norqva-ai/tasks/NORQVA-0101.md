# NORQVA-0101: registro do motivo de falha de entrega no WhatsApp oficial

**Branch:** `ai/NORQVA-0101-whatsapp-log-status` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** correção de erro e diagnóstico (D-0037) · **Risco:** LOW (só registro em log, sem dado de cliente além dos 4 últimos dígitos)

## Motivo

19/10/2026: a mensagem de teste "hello_world" enviada pelo painel da Meta para o destinatário de teste aparece como enviada, mas não chega. A Meta informa o motivo no aviso de status (`statuses[].errors`), que chega ao webhook do NORQVA, mas era descartado porque a mensagem não foi enviada pelo NORQVA.

## Mudanças

- `cloudWebhook.ts`: status `failed` gera log `WHATSAPP_CLOUD_DELIVERY_FAILED` com código, título, mensagem e detalhe da Meta e os 4 últimos dígitos do destino. Evento de número não cadastrado gera `WHATSAPP_CLOUD_WEBHOOK_UNKNOWN_NUMBER`.
- `whatsappController.ts`: cada POST aceito gera `WHATSAPP_CLOUD_WEBHOOK` com contagens (recebidas, status, ignoradas), sem conteúdo.
