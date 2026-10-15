# NORQVA-0065: botão de checkout da tela Produtos com a escolha de livros avulsos

**Branch:** `ai/NORQVA-0065-checkout-admin-kit` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Pedido:** Ricardo, 14/10/2026 21h47, print do checkout do kit OFF-000010 aberto dentro do NORQVA ("Não apareceu as opções de livro avulso"). **Autorização:** correção de erro do contrato NORQVA-0063. · **Risco:** LOW

## Causa

O checkout aberto pela tela Produtos monta a oferta com o cadastro interno e só copiava da página pública o cartão e o adicional. Sem `delivery_files`, o kit de 5 era tratado como o kit de 2.

## Correção

- `App.tsx` (`onCheckout`): copia também `delivery_files` da oferta pública. Com isso o checkout da tela Produtos mostra kit completo ou livros avulsos, igual ao comprador.
