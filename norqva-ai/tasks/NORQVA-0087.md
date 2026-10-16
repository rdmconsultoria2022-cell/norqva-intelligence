# NORQVA-0087: Operação (Produtos e Criativos) no Design System NORQVA Premium (fase 4, etapa 6)

**Branch:** `ai/NORQVA-0087-operacao-premium` (a partir da `main`, depois da NORQVA-0086)
**Executor:** Claude · **Revisão:** revisão independente (subagente) + CI · **Merge:** só com o "sim" do Ricardo depois das capturas
**Autorização:** Ricardo, 16/10/2026 19h22 ("Pode"). · **Risco:** LOW (só apresentação)

## Escopo

- Produtos: título no padrão; filtros em botões que deslizam; cartão do produto com nome, código, categoria, marca e situação em letras normais; procedência, marca, editar e excluir dentro de "Gerenciar produto" (`<details>`, conteúdo continua na página); oferta com preço em destaque, ferramentas em 2 colunas e checkout como botão principal.
- Criativos: título no padrão; filtros em botões que deslizam; botões de revisão em tons (aprovar verde, pedir ajuste amarelo, rejeitar vermelho) e os demais neutros; CTR com vírgula.
- Seletor de exibição (lista, grade, ícones) com botões de 40 px.
- Janelas de novo produto, editar produto e nova oferta (App): tokens e fundo escurecido.

## Regras respeitadas

Mesmas chamadas, mesmos handlers e mesmas condições de perfil (ADMIN/PRODUCT). Checkout, pagamento e entrega não mudaram (só a cor do botão "Checkout da oferta").
