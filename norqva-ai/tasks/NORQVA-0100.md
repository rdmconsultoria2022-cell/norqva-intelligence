# NORQVA-0100: política de privacidade com o atendimento pelo WhatsApp

**Branch:** `ai/NORQVA-0100-privacidade-whatsapp` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** mudança de texto (D-0037). Necessária para publicar o app "NORQVA Atendimento" na Meta (etapa 3 da NORQVA-0079). · **Risco:** LOW

## Mudanças (`frontend/public/privacidade.html`)

- Dados coletados: mensagens do WhatsApp oficial (número, nome do perfil, conteúdo); CPF guardado mascarado e usado só para o Pix.
- Finalidade: atendente automático com IA, cobrança e entrega após pagamento confirmado; "parar" e pedido de pessoa.
- Compartilhamento: plataforma do WhatsApp Business (Meta) e provedor de IA (OpenAI), que recebe a conversa sem o CPF.
- Retenção: mensagens do WhatsApp apagadas após 180 dias (rotina da NORQVA-0046).
- Data de atualização: 19/10/2026.
