# NORQVA-0054: página → WhatsApp → pagamento, com código de origem

**Branch:** `ai/NORQVA-0054-venda-whatsapp` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** contrato NORQVA-0053, item 3, aprovado pelo Ricardo em 12/10/2026 12h12 ("1 Aprovado!") · **Risco:** MEDIUM (caminho de compra, dados de clique)

## Escopo

- Migration 059 (aditiva): `whatsapp_refs` e `whatsapp_conversations.ref_id`.
- `services/whatsapp/whatsappRefs.ts`: número disponível para a oferta (conectado + atendente ligado + marca), código de 6 caracteres, link `wa.me` com mensagem pronta sem preço, ligação da conversa ao código, origem para o pedido (até 28 dias).
- `POST /api/public/whatsapp/ref` (público, limite do checkout); `GET /api/public/offers/:id` ganha `whatsapp: { available }`.
- Webhook: lê o código na mensagem do cliente e liga a conversa. Atendente: o pedido herda utm, fbclid/fbc/fbp, IP/navegador e URL da página; sem código, sem o IP do servidor.
- Páginas `/p/` e `/kit/`: botão "Quero pelo WhatsApp" + "Prefere pagar aqui mesmo? Pix ou cartão". Sem WhatsApp disponível, nada muda.
- Testes: `norqva_0054_whatsapp_refs.test.ts`, `norqva_0054_whatsapp_cta.test.tsx`.

## Continua igual

Entrega só com PAID do Asaas (WhatsApp + e-mail); CPF nunca vai para a IA; "parar" respeitado; preço vem do servidor.
