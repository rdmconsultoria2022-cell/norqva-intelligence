# NORQVA-0135: Kit de Bordado com a capa certa (e fora das regras do kit de livros)

**Branch:** `ai/NORQVA-0135-capa-bordado` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** correção de erro (D-0037); relato do Ricardo em 25/10/2026 03h45 ("o livro de bordados aparece com a capa de cozinha italiana") · **Risco:** LOW

## Contexto

O produto foi renomeado para "Kit de Bordado NORQVA". Várias regras tratam nome que começa com "Kit" como o kit de livros de cozinha.

## Escopo

- Tela Produtos (`productCover`): bordado usa `/images/bordado/capa.jpg` antes da regra do kit.
- `isKitOffer`: oferta com "bordado" no nome não vai para a página `/kit/` (que é a do kit de livros); segue em `/p/`.
- Página de entrega: "Seu Kit de Bordado está pronto!" em vez de "Seu livro Bordado".
- Testes `norqva_0135_*`.

## Revisão independente (aplicada)

- Pagamento (`CheckoutView`): bordado com a capa do bordado, "Kit digital em PDF", "50 riscos para iniciantes • PDF para imprimir" e "O kit em PDF chega neste e-mail" (antes: capas e textos do Trattoria/Dolci).
- Entrega (`DigitalDelivery`): cartão do arquivo com capa e título do Kit de Bordado; título "Seu Kit de Bordado está pronto!".
- Página `/p/OFF-000015` (`PublicOfferPage`): o bordado vai direto ao cartão de pagamento, como o Seca Barriga (antes abria a página de venda do Trattoria). A venda do bordado é na página gerada `/v/`.
- `isBordadoName` e `BORDADO_INFO` em `lib/productLook.ts` (uma regra só nas telas).
