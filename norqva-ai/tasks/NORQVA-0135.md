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
