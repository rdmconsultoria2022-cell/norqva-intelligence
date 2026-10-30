# NORQVA-0154: livros avulsos no WhatsApp vão todos juntos, numerados

**Branch:** `ai/NORQVA-0154-avulsos-numerados` · **Pedido:** Ricardo, 29/10/2026 21h14 ("em livro avulso, enviar as imagens de todos os livros, numa forma que facilite o cliente escolher") · **Tipo:** conteúdo e abordagem do atendente (pagamento e entrega intactos) · **Risco:** LOW

## Correção

- Imagens dos 5 livros com o número grande ("LIVRO 1" a "LIVRO 5") e a linha "Para escolher este, responda N" (`build_cards.py`). Ordem: 1 Trattoria, 2 Risotos, 3 Antipasti, 4 Pães, 5 Dolci.
- Legenda com número, nome e preço ("Livro 1 · Trattoria em Casa · R$ 19,90"); `OfferCard.number`.
- `send_offer_card` com um livro avulso manda as imagens de TODOS os livros com imagem válida, em ordem, e no fim a pergunta "Qual livro você quer? É só responder com o número (...)". Pedir de novo não reenvia (a IA é avisada para pedir o número).
- Catálogo do atendente diz o número de cada livro ("Se o cliente responder 2, é este livro"); regra 6b: dois ou mais avulsos → mostrar uma vez que os 5 livros saem mais em conta; mantendo, uma cobrança por livro.
- Condições de atendimento (texto da empresa) atualizadas para a abordagem nova (aceito pelo Ricardo em 29/10 21h14).

## Testes

`norqva_0153_offer_cards.test.ts` (caso novo NORQVA-0154).

## Revisão independente

(pendente)

## Execução

(pendente)
