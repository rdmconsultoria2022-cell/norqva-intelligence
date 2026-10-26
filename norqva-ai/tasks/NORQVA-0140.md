# NORQVA-0140: Cardápio italiano de 4 semanas com a foto de cada prato

**Branch:** `ai/NORQVA-0140-cardapio-fotos` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** depois do CI verde
**Autorização:** conteúdo de PDF (D-0037, sem aprovação); pedido do Ricardo em 26/10/2026: "faltou as imagens do prato, é um diferencial muito grande nesse produto" · **Risco:** LOW

## Escopo

- Plano de cada semana em 2 páginas com cartões: dia, foto do prato, nome da receita, livro · nº · página, quantas vezes fazer
  para 4 pessoas e a observação. Fim de semana com foto grande; acompanhamentos, pão e sobremesa com foto menor.
  Listas de compras como estavam. Página "Para variar" com a foto de cada sugestão. 18 páginas, 2,8 MB.
- **A foto é sempre a que o livro usa para aquela receita** (mesma regra de cada script dos livros):
  Trattoria pelo campo `img` da receita (`trattoria/jpg/`), Dolci pelo mapa de `dolci/build2.py`, Pães/Antipasti/Risotos
  por `NN_slug.jpg` (posição da receita). As fotos de Antipasti e Risotos ficam no computador do Ricardo (fora do git): sem
  elas, o build usa a cópia da mesma foto que está no site (`frontend/public/images/livros/...`, 1536 × 1024 como as do livro).
  Prato sem foto da própria receita: o build para com "FOTO FALTANDO". Fotos reduzidas para 760 px (JPEG 78) em `_fotos/` (fora do git).
- **Cardápio ajustado:** das receitas de Antipasti e Risotos só 6 têm a foto disponível aqui (caponata, arancini, tábua,
  risoto alla milanese, risoto de cogumelos, polenta grelhada). Os pratos sem foto (risoto de limão, de camarão, de abóbora,
  de linguiça, polenta com ragù de cogumelos, cogumelos recheados, bruschetta de feijão, almôndegas, frittata, rolinhos de
  berinjela, crostini e pimentões) saíram e entraram, com foto: arancini, nhoque com burro e salvia, cavatelli (massa de
  sêmola) com sugo, polenta grelhada, cannelloni de frango e molhos rápidos. A semana 4 repete de propósito pratos rápidos do mês
  ("os preferidos"). As listas de compras são recalculadas a partir das receitas, com a mesma conferência de sempre.
- Os mapeamentos de ingredientes das receitas que saíram ficam no arquivo (continuam conferidos contra o livro) para voltar
  quando as fotos de Antipasti e Risotos estiverem no repositório.

## Fotos usadas (receita ← arquivo)

Saída do build (`python build_cardapio.py` imprime a lista):

| Livro | Nº | Receita | Foto |
|---|---|---|---|
| Trattoria | 02 | Massa de sêmola e água | trattoria/jpg/02_semola.jpg |
| Trattoria | 03 | Massa verde de espinafre | trattoria/jpg/03_espinafre.jpg |
| Trattoria | 05 | Pappardelle rústico | trattoria/jpg/05_pappardelle.jpg |
| Trattoria | 06 | Nhoque de batata | trattoria/jpg/06_nhoque.jpg |
| Trattoria | 07 | Pomodoro e basilico | trattoria/jpg/07_pomodoro.jpg |
| Trattoria | 08 | Ragù alla bolognese | trattoria/jpg/08_ragu.jpg |
| Trattoria | 09 | Cacio e pepe | trattoria/jpg/09_cacio_pepe.jpg |
| Trattoria | 10 | Carbonara | trattoria/jpg/10_carbonara.jpg |
| Trattoria | 11 | Amatriciana | trattoria/jpg/11_amatriciana.jpg |
| Trattoria | 12 | Pesto alla genovese | trattoria/jpg/12_pesto.jpg |
| Trattoria | 13 | Burro e salvia | trattoria/jpg/13_burro_salvia.jpg |
| Trattoria | 14 | Aglio, olio e peperoncino | trattoria/jpg/14_aglio_olio.jpg |
| Trattoria | 15 | Ravioli de ricota e espinafre | trattoria/jpg/15_ravioli.jpg |
| Trattoria | 16 | Tortellini de queijo e ervas | trattoria/jpg/16_tortellini.jpg |
| Trattoria | 17 | Lasanha alla bolognese | trattoria/jpg/17_lasanha.jpg |
| Trattoria | 18 | Cannelloni de frango com ervas | trattoria/jpg/18_cannelloni.jpg |
| Trattoria | 19 | Nhoque gratinado aos quatro queijos | trattoria/jpg/19_nhoque_4queijos.jpg |
| Trattoria | 20 | Rondelli de queijos ao molho rosé | trattoria/jpg/20_rondelli.jpg |
| Trattoria | 21 | Sugo rápido de tomate-cereja | trattoria/jpg/21_sugo_cereja.jpg |
| Trattoria | 22 | Molho de gorgonzola e nozes | trattoria/jpg/22_gorgonzola.jpg |
| Trattoria | 23 | Molho alla puttanesca | trattoria/jpg/23_puttanesca.jpg |
| Trattoria | 24 | Molho de cogumelos com manteiga e tomilho | trattoria/jpg/24_cogumelos.jpg |
| Trattoria | 27 | Focaccia genovese com alecrim | trattoria/jpg/27_focaccia.jpg |
| Trattoria | 28 | Bruschetta de tomate e manjericão | trattoria/jpg/28_bruschetta.jpg |
| Dolci | 01 | Tiramisù | dolci/jpg/01_tiramisu.jpg |
| Dolci | 02 | Panna cotta | dolci/jpg/02_panna_cotta.jpg |
| Dolci | 03 | Torta della Nonna | dolci/jpg/03_torta_della_nonna.jpg |
| Dolci | 04 | Torta caprese | dolci/jpg/04_torta_caprese.jpg |
| Dolci | 05 | Cantucci | dolci/jpg/05_cantucci.jpg |
| Dolci | 06 | Affogato al caffè | dolci/jpg/06_affogato.jpg |
| Dolci | 07 | Zabaione com frutas | dolci/jpg/07_zabaione.jpg |
| Dolci | 08 | Crostata di marmellata | dolci/jpg/08_crostata.jpg |
| Dolci | 09 | Budino al cioccolato | dolci/jpg/09_budino.jpg |
| Dolci | 10 | Cannoli em taça | dolci/jpg/10_cannoli.jpg |
| Pães | 02 | Pão rústico de fermentação natural | paes/jpg/02_rustico.jpg |
| Pães | 03 | Pane pugliese de sêmola | paes/jpg/03_pugliese.jpg |
| Pães | 04 | Ciabatta | paes/jpg/04_ciabatta.jpg |
| Pães | 05 | Pão de azeitonas e alecrim | paes/jpg/05_azeitonas.jpg |
| Pães | 06 | Focaccia barese | paes/jpg/06_barese.jpg |
| Pães | 11 | Piadina romagnola | paes/jpg/11_piadina.jpg |
| Antipasti | 03 | Caponata siciliana | site: images/livros/antipasti/caponata.jpg |
| Antipasti | 09 | Arancini de muçarela | site: images/livros/antipasti/arancini.jpg |
| Antipasti | 11 | Tábua de frios, queijos e caprese no palito | site: images/livros/antipasti/tagliere.jpg |
| Risotos | 02 | Risoto alla milanese | site: images/livros/risotos/milanese.jpg |
| Risotos | 03 | Risoto de cogumelos | site: images/livros/risotos/funghi.jpg |
| Risotos | 11 | Polenta grelhada | site: images/livros/risotos/polenta_grelhada.jpg |

Cada página foi gerada em PNG e conferida: cada foto bate com o nome da receita ao lado.

## Pendência

- Para voltar a usar os outros pratos de Antipasti e Risotos: copiar as fotos dos livros (`antipasti/jpg/` e `risotos/jpg/`
  do computador do Ricardo) para o repositório, ou rodar o build lá; o build já procura nessas pastas primeiro.
- A cópia do site dos 6 pratos foi publicada como foto do livro (NORQVA-0064/0065, mesmo tamanho das fotos da KIE); não deu
  para comparar byte a byte com o arquivo do livro, que está fora do git.

## Revisão independente

(preencher)
