# NORQVA-0153: atendente do WhatsApp mostra as ofertas em imagens, uma de cada vez

**Branch:** `ai/NORQVA-0153-cartoes-whatsapp` · **Pedido:** Ricardo, 29/10/2026 20h48 ("envie as imagens com as informações de conteúdo e preço... primeiro o kit mais caro...") · **Tipo:** conteúdo e abordagem do atendente (pagamento e entrega intactos) · **Risco:** LOW–MEDIUM

## Problema

Na conversa da Alba (29/10 20h30) o atendente listou as 7 ofertas com preço em texto de uma vez.

## Correção

- Imagens 1080x1350 de cada oferta (capas, conteúdo e preço do Pix): `frontend/public/images/whatsapp/off-0000NN.jpg`, geradas por `norqva-ai/produtos/whatsapp_cards/build_cards.py` (Playwright).
- `services/whatsapp/offerCards.ts`: lista das imagens com o preço escrito em cada uma (`cardFor` só libera se o preço do catálogo for o mesmo), imagens já enviadas na conversa (`cardsSent`, pela legenda gravada) e a ordem (`cardOrderCheck`).
- Ferramenta nova `send_offer_card` no atendente. Ordem travada no servidor: 1ª opção = oferta em destaque (Coleção Trattoria Completa, R$ 47,00); 2ª = a alternativa dela (Kit Trattoria Completo, R$ 29,90), só depois da 1ª; livros avulsos só depois das duas ou com `customer_asked_individual` (cliente pediu avulso). Cada imagem uma vez por conversa.
- Regra fixa 6b reescrita: nunca listar vários produtos com preço; uma oferta por vez pela imagem; 2ª opção quando o cliente não pede para pagar a 1ª; sem imagem (preço mudou) apresenta só aquela oferta em texto.
- Catálogo do atendente marca 1ª opção, 2ª opção, avulso e se há imagem.
- Preço mudou? Ajustar `OFFER_CARDS` e `build_cards.py`, rodar e publicar; até lá o atendente usa texto.

## Testes

`backend/src/tests/norqva_0153_offer_cards.test.ts`; `norqva_0147_ordem_atendente.test.ts` atualizado para a regra nova.

## Revisão independente

(pendente)

## Execução

(pendente)
