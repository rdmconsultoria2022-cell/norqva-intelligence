# NORQVA-0062: opções de exibição na tela Produtos

**Branch:** `ai/NORQVA-0062-produtos-exibicao` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Pedido:** Ricardo, 13/10/2026 20h01, com um print da tela Criativos: "Adicione essas opções de exibição na tela Produtos". **Autorização:** só tela (D-0037). · **Risco:** LOW

## Escopo

- Filtro por situação de venda, com contagem: Todos, À venda (tem oferta ATIVA), Em teste (oferta em TESTE), Fora do ar.
- "Exibir arquivados": produtos ARQUIVADO ficam ocultos por padrão.
- "Procurar pelo nome do produto" e "Todas as marcas" (inclui "Sem marca").
- Modos de exibição iguais aos da tela Criativos: lista, grade e ícones. Os ícones mostram a capa (Trattoria, Dolci e os livros da coleção com imagem no site); clicar abre o produto na lista com as ofertas.
- O navegador lembra o modo escolhido.
- Teste: `norqva_0062_products_display.test.tsx`.
