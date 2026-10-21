# NORQVA-0108: kit completo na primeira tela da página do kit

**Branch:** `ai/NORQVA-0108-kit-primeira-tela` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** com o "sim" do Ricardo
**Autorização:** só tela e texto (D-0037). Preços, ofertas, pagamento e checkout não mudam.

## Problema (evidência)

Na página `/kit/OFF-000010` (KIT TRATTORIA COMPLETO — 5 LIVROS, R$ 29,90, "de R$ 94,50"), a primeira tela do celular mostrava só "Livros digitais de receitas italianas / A cozinha da nonna, explicada receita por receita. / OFERTAS A PARTIR DE R$ 14,90 / VER AS OFERTAS". Quem chega do anúncio do kit não via o kit nem o preço dele sem rolar, e o "a partir de R$ 14,90" ancorava no livro avulso mais barato. A faixa preta do alto também dizia "Ofertas a partir de R$ 14,90".

## O que muda

- Só quando a oferta é o kit completo (`isFullKit`: 5 PDFs entregues; nada de código de oferta fixo), o topo mostra, nesta ordem e cabendo numa tela de 390×844: as 5 capas em leque, "A cozinha da nonna em 5 livros", "5 livros digitais · 74 receitas com foto e passo a passo" (`FULL_KIT_RECIPES`), "de R$ 94,50 por R$ 29,90" (valores da oferta no servidor) e o botão "Quero o kit completo" (o mesmo pagamento do kit; com WhatsApp ligado, a mesma escolha dos outros botões). Embaixo: "Entrega imediata no e-mail", "Pagamento seguro via Pix ou cartão" e o link "ou veja os livros separados, a partir de R$ 14,90" (vai para as ofertas).
- No kit completo a faixa do alto passa a dizer "Kit completo · 5 livros por R$ 29,90".
- No computador o topo continua em duas colunas (texto à esquerda, leque à direita), com o parágrafo de apresentação.
- Imagens: capas do topo com `loading="eager"` e `width`/`height`; fotos mais abaixo (nonna, pratos, galeria, página por dentro, capas da coleção, fundo do fecho, pratos flutuantes do topo do kit) com `loading="lazy"`.
- Kit de 2 livros e demais páginas: sem mudança. ViewContent, OFFER_VIEW, barra do celular e seção de ofertas continuam iguais.

## Arquivos

- `frontend/src/features/public/KitLandingPage.tsx`: topo do kit completo, faixa do alto, `loading="lazy"`.
- `frontend/src/features/public/kitMotion.tsx`: `Book3D` com `width`/`height` na capa.
- `frontend/src/tests/norqva_0108_kit_hero.test.tsx` (novo) e `norqva_0076_kit_book_list.test.tsx` (ajuste do topo).

## Testes

- Vitest: ordem dos elementos do topo, preço e "de" do servidor, botão abre o pagamento do kit, capas `eager` com tamanho e demais imagens `lazy`, ViewContent com o valor do kit, kit de 2 livros com o topo antigo. Suite inteira do frontend verde (88 arquivos, 497 testes) e `tsc` sem erros.
- Captura local 390×844 (Vite com API simulada): tudo do topo cabe na primeira tela (link dos avulsos termina em ~718 px), sem rolagem lateral.
