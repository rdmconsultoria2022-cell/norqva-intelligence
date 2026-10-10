# NORQVA-0046: atendente de vendas no WhatsApp (até 100 números, tudo dentro do NORQVA)

**Executor:** Claude · **Revisão:** CI + revisão independente por etapa · **Merge:** Claude
**Autorização:** Ricardo, 10/10/2026 19h38 ("Aprovado! Eu preciso que você execute esse desenvolvimento com total autonomia"), contrato NORQVA-0046 no Claude Docs · **Risco:** HIGH (API não oficial, risco de banimento aceito pelo Ricardo às 19h31)

## Decisões

- Motor: Evolution API (código aberto) em serviço próprio no Render, atrás da camada `services/whatsapp/provider.ts` (troca pela API oficial = nova classe com a mesma interface).
- Até 100 números (`MAX_WHATSAPP_NUMBERS`), cada um ligado a uma marca. Atendente nasce desligado.
- Webhook por número com segredo no endereço (hash no banco, troca a cada conexão); o segredo não vai para o log.
- Só conversas privadas (grupos, status e canais ignorados). "Parar" bloqueia mensagens; se o cliente voltar a escrever, uma pessoa decide.
- Mensagens apagadas após 180 dias (rotina diária).

## Etapas

1. **Branch `ai/NORQVA-0046-whatsapp-etapa1`:** migration 056, camada do motor, números (cadastro, QR Code, status, trocar, excluir), webhook, conversas (ver, responder, assumir/devolver), tela WhatsApp na área Vendas.
2. **Branch `ai/NORQVA-0046-whatsapp-etapa2`:** entrega pelo WhatsApp após pagamento confirmado pelo Asaas (migration 057, link `/acesso` próprio com finalidade WHATSAPP, uma vez por pedido, até 3 tentativas pela varredura; respeita o "parar"; o código do link não fica no histórico da conversa).
3. **Branch `ai/NORQVA-0046-whatsapp-etapa3`:** atendente com IA (`services/whatsapp/attendant.ts`, OpenAI com ferramentas: Pix, cartão, conferir pagamento, chamar pessoa). Cobranças passam pelos mesmos controladores do checkout do site (cliente, pedido, Pix/cartão), com `orders.whatsapp_conversation_id` e `utm_source=whatsapp`. Catálogo = ofertas ATIVAS da marca do número. CPF reconhecido pelo dígito verificador: mascarado no banco, guardado só na memória por 1 h e nunca enviado à IA. Limites: 20 respostas por conversa e 150 mensagens por número por hora (passou, chama pessoa). Pix repetido em 30 min reaproveita a mesma cobrança. Condições de atendimento (geral e por número) com versões; modelo sugerido com o conteúdo dos livros. Sem `OPENAI_API_KEY`, a conversa é marcada para uma pessoa.
4. **Branch `ai/NORQVA-0046-whatsapp-etapa4`:** aba Resultados (7/30/90 dias): conversas novas, mensagens, respostas do atendente, pedidos, vendas pagas (só PAID pelo Asaas), conversão e valor, por número e no total.
5. Teste com o número do Ricardo e liberação.

## Configuração do servidor (uma vez, Ricardo no Render)

Serviço Web "norqva-whatsapp" com a imagem `evoapicloud/evolution-api:latest`, porta 8080, e no `norqva-staging-api` as variáveis `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`.

## Testes

`backend/src/tests/norqva_0046_whatsapp.test.ts` e `frontend/src/tests/norqva_0046_whatsapp.test.tsx` (motor sempre simulado).
