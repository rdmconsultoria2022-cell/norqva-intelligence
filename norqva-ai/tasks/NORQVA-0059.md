# NORQVA-0059: livro Antipasti & Aperitivo (Volume IV)

**Branch:** `ai/NORQVA-0059-livro-antipasti` · **Executor:** Claude · **Revisão:** revisão culinária independente + CI · **Merge:** Claude
**Autorização:** conteúdo de produto (PDF), sem aprovação prévia (D-0037). Pedido do Ricardo em 13/10/2026 18h31 ("os três livros que estão faltando"); "Aprovado" às 18h35 para seguir pelo caminho recomendado (fotos geradas no computador dele). Um volume por vez (D-0055). · **Risco:** LOW (só arquivos de conteúdo)

## Escopo

- `norqva-ai/produtos/antipasti/`:
  - `content_antipasti.py`: 12 receitas, planejamento, harmonização e os pedidos das fotos;
  - `build_antipasti.py`: gera `ANTIPASTI_E_APERITIVO.pdf` com 31 páginas, mesmo visual do Volume III;
  - `gerar_fotos.py`: gera a capa e as 12 fotos na KIE (cerca de 52 créditos), no computador do Ricardo;
  - `revisao_antipasti.md`: escolhas do livro e a revisão independente aplicada.
- `.gitignore`: PDF e HTML gerados pelos builds dos livros não vão para o Git.

## Falta

- Fotos (no computador do Ricardo) e a conferência de cada uma contra a receita.
- Revisão do Ricardo.
- Venda: cadastrar o produto e o PDF no NORQVA, com aprovação, porque mexe na entrega ao comprador.
