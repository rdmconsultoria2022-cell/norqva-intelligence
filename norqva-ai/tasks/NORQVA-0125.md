# NORQVA-0125: WhatsApp para quem não concluiu o pagamento

**Branch:** `ai/NORQVA-0125-recuperacao-whatsapp` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Ricardo decide (não mesclado pelo executor)
**Autorização:** Ricardo, 24/10/2026 23h53 ("Aprovado"), contrato no Claude Docs "NORQVA-0125 — WhatsApp para quem não concluiu o pagamento" · **Risco:** MEDIUM (mensagem nova ao cliente; nada muda em cobrança ou entrega)

## Decisão

Uma mensagem só, com texto fixo, pelo número de atendimento (Evolution, hoje o 5642), para quem gerou um pagamento nos últimos 30 dias e não pagou. O dono escolhe quem recebe numa tela e o servidor manda devagar.

## Escopo

- **Quem entra** (`services/whatsapp/paymentRecovery.ts`, `computeRecoveryPeople`): pedido PENDING ou CANCELLED com cobrança gerada, conta real (`is_demo = FALSE`, `COMMERCIAL_PRODUCTION`, fora da conta TEST do oficial), dos últimos 30 dias, com telefone; a pessoa (e-mail ou telefone normalizados) nunca pagou; oferta ATIVA ou TESTE; não pediu para parar; nunca recebeu. Vários pedidos = uma pessoa, mensagem sobre o mais recente com oferta no ar. Telefone normalizado = 55 + DDD + 8 últimos números (o WhatsApp às vezes tira o 9).
- **Tela** (só ADMIN): Vendas → WhatsApp → "Pagamentos não concluídos" (`frontend/src/features/whatsapp/RecoveryPanel.tsx`): lista (primeiro nome, produto, data do pedido, telefone mascarado), caixa para tirar qualquer pessoa, a mensagem exata, "Enviar" com confirmação, e "Envios" com Na fila, Enviada, Falhou, Pulada + motivo. Rotas `GET /api/whatsapp/recovery` e `POST /api/whatsapp/recovery/send`.
- **Fila** (`runRecoveryQueue`, agendador a cada minuto no `index.ts`): uma pessoa a cada 2 a 4 minutos (sorteado), só das 09h às 20h de Brasília (calculado pelo fuso); fora disso espera. Antes de cada envio confere no Asaas e recalcula a pessoa (pagou no meio = Pulada "Já pagou"). Sem número conectado ou com o atendente desligado nada sai e abre aviso "Mensagens de recuperação paradas" na central (resolve sozinho quando volta a enviar).
- **Uma por pessoa para sempre:** `whatsapp_recovery_messages` com `phone_key` único e `email_key` único (migration 082); reserva condicional (`QUEUED → SENDING`) e vez da fila no banco (`whatsapp_recovery_state`), então dois servidores não mandam duas vezes. **Falhou é final** (inclusive tempo esgotado/5xx, resultado incerto): nunca volta à fila e aparece na lista sem poder marcar ("Falhou — não reenviamos"). Só "Pulada" antes do envio por motivo passageiro volta (`HUMAN_CONVERSATION`, `SEND_BLOCKED`, `PHONE_CHANGED`, `RECHECK_FAILED`, `OUTSIDE_HOURS`).
- **Revisão independente (25/10/2026):** pago também pela Kiwify (`external_sales` PAID/REFUNDED/CHARGEBACK) e por pagamento confirmado em qualquer pedido; conferência no Asaas de todos os pedidos da pessoa (PENDING, REQUIRES_RECONCILIATION, EXPIRED); 3 falhas de conferência = Pulada `RECHECK_FAILED` com aviso, sem travar a fila; envio preso em "Enviando" por mais de 10 min = aviso; número escolhido pela marca da oferta (sem número da marca = Pulada `SEND_BLOCKED`, nunca o número de outra marca; número da marca fora = espera com aviso); horário conferido de novo na hora do `sendText`; tela recebe um id opaco, nunca o telefone; quem já pediu "parar" em qualquer conversa (inclusive no histórico) fica de fora.
- **Link:** `FRONTEND_URL/p/<oferta>?checkout=1&name=...&email=...&utm_source=whatsapp&utm_medium=recuperacao&utm_campaign=pagamento_nao_concluido&utm_content=<código>&src=wa-rec-<código>`. Código em `whatsapp_refs` ligado à conversa (venda pela conversa também fica como recuperação). Sem CPF.
- **Conversa:** a mensagem fica em Conversas, a conversa continua no atendente (BOT). Conversa com pessoa (HUMAN ou "precisa de pessoa") = Pulada.
- **SAIR:** fora da recuperação, a regra de sempre não muda. Depois da recuperação (procurada pelo telefone normalizado, vale também resposta de @lid ou sem o 9): "sair", "parar", "pare", "stop" escritos de qualquer jeito; "não quero", "não, obrigado", "sem interesse" só se for a primeira resposta da pessoa e o atendente ainda não tiver falado. Grava `whatsapp_recovery_optouts` (telefone e e-mail), a conversa vira "Pediu para parar" e o atendente responde uma vez, texto fixo. A conversa de outra forma de jid herda a origem da recuperação.
- **Cópia guardada:** em Conversas a mensagem fica com o link sem `name` e `email`; o link completo só vai para a pessoa.
- **Chave:** `WHATSAPP_RECOVERY_ENABLED=true` liga o envio. Desligada, a tela mostra a lista e o "Enviar" fica desligado com o aviso.

## Regras

Nada muda em preço, cobrança, entrega ou liberação de acesso. Mensagem sem preço (D-0053). Testes com WhatsApp e Asaas simulados (`norqva_0125_whatsapp_recovery.test.ts` no backend e no frontend). Migration só aditiva.

## Fora do escopo / diferenças do contrato

- Número oficial (Cloud API) não envia esta mensagem: fora da janela de 24h a Meta só aceita modelo aprovado. Fica com a Evolution.
- Conversa já com uma pessoa da equipe é pulada (para não atropelar o atendimento).
