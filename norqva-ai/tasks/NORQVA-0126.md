# NORQVA-0126: link de download estável na página de entrega

**Branch:** `ai/NORQVA-0126-link-download-estavel` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 25/10/2026 01h06 ("aprovado"), contrato no Claude Docs "NORQVA-0126" · **Risco:** MEDIUM (entrega ao comprador; nada muda em cobrança nem na regra de só entregar com PAID)

## Contexto

Em 25/10/2026 uma compra paga abriu a página de entrega e o botão "Baixar" deu "Link Não Encontrado". Causa: cada chamada a `GET /api/checkout/orders/:id/delivery-tokens` gerava um link novo e invalidava o anterior. A pré-visualização do Google (ou outra aba, ou F5) chamou a rota 3 segundos depois do comprador e o link que estava na tela dele morreu.

## Escopo

- Migration 083 (só aditiva): `order_deliveries.delivery_token_enc` e `delivery_token_enc_version`.
- `getDeliveryTokens` guarda o link atual criptografado (mesma chave do CPF, `encryptData`) e, enquanto ele valer por mais de 1 h e o hash bater, devolve o mesmo link. Senão gera um novo como antes.
- Revogação (hash zerado ou trocado por outra rota) continua valendo: a cópia guardada só é usada se o hash dela for o hash atual.

## Regras

Só pedido PAID com entrega ACTIVE recebe link (sem mudança). Limite de downloads e validade sem mudança. Testes em `norqva_0126_delivery_link.test.ts`; D13/D14 do 2.5D ajustados (troca agora só com link perto de vencer).
