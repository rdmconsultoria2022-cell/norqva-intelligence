# Revisão técnica: Pães & Fermentação Natural (Volume III)

Livro novo, escrito pelo Claude em 12/10/2026, sem PDF de origem. A estrutura é a mesma do Dolci (`dolci/content.py`) e segue as convenções do `trattoria/revisao_trattoria.md`:
- gramas e mililitros, com a medida caseira entre parênteses;
- forno sempre preaquecido;
- ponto da massa descrito além do tempo;
- nenhuma promessa de saúde e nenhuma marca.

## Escolhas do livro

- 12 receitas (decisão do Ricardo, 12/10/2026): o fermento natural (01) e 11 pães. A capa diz "11 pães italianos e o fermento natural".
- Fermento natural (receita 01) a 100% de hidratação. Os pães 02, 03, 05 e 12 usam 100 g dele no pico. Cada um traz a troca por fermento seco: 2 g de fermento seco, mais 50 g de farinha (ou sêmola) e 50 ml de água, o que mantém a hidratação.
- Hidratação dos pães:

  | Pão | Hidratação |
  |---|---|
  | 02 rústico | 72% |
  | 03 pugliese | 73% |
  | 04 ciabatta (biga a 50%) | 80% |
  | 05 azeitonas | 71% |
  | 12 integral | 76% |

- Os pães de casca crocante (02, 03 e 05) assam em panela tampada a 250 °C, porque é o jeito mais confiável de ter vapor em forno doméstico. A ciabatta usa uma forma com água no fundo do forno.
- Rendimento = peso do pão **assado**, com cerca de 12% de perda no forno. Nos pãezinhos e nas porções, é o peso da porção crua (igual ao passo de divisão).
- Segurança na abertura: não provar massa crua, porque farinha crua pode ter bactérias. Na receita 01: sinais de contaminação do fermento. Nas receitas 02, 03 e 05: aviso da panela a 250 °C. Na 04: aviso do vapor e do vidro da porta.
- Fotos geradas na KIE (google/nano-banana), no cenário do Trattoria e do Dolci, e conferidas contra cada receita. Três fotos foram refeitas:
  - a capa, que mostrava uma baguete, pão que não está no livro;
  - a 03, que precisava do corte em cruz;
  - a 11, em que as piadinas empilhadas pareciam cruas.

## Revisão independente (subagente, 12/10/2026)

Sem bloqueios. Os 19 apontamentos foram aplicados:

| # | Ponto | Mudança |
|---|---|---|
| 1 | O rendimento mostrava a massa crua | 02 e 03 → 850 g; 05 → 950 g; 12 → 900 g; 04 → 2 × 400 g |
| 2 | A capa dizia "12 pães", mas a 01 é o fermento | "11 pães italianos e o fermento natural" |
| 3 | 08 Grissini: 20 × 12 cm dava cerca de 20 palitos grossos | Retângulo de 30 × 12 cm, tiras de 1 × 12 cm, 2 assadeiras |
| 4 | 09 Taralli: 12 g não fazem um cordão de 12 cm × 0,7 cm | Cordões de 14–15 cm × 1 cm |
| 5 | 04 Ciabatta: a biga firme empelota | Despedaçar a biga e desmanchar na água antes da farinha |
| 6 | Avisos de queimadura só na 02 | Aviso da panela também na 03 e na 05; vidro da porta na 04 |
| 7 | "Saco de pano" valia para todos os pães | Agora vale só para os de casca crocante |
| 8 | 11 Piadina: ½ colher de chá de bicarbonato pesa 2,5 g, não 3 g | 2,5 g |
| 9 | 06 Focaccia: pouco azeite para a base "quase frita" | 80 ml (50 ml na assadeira e 30 ml por cima) |
| 10 | 01 Fermento: "descarte metade" deixava o pote crescer | "Mantenha só 50 g" já nos dias 2 e 3 |
| 11 | 01: "mofo com pelos" | Qualquer mofo; usar colher e pote limpos |
| 12–13 | A tabela de planejamento citava prazos que não estavam nas receitas | Nota da massa na geladeira na 11; conservação na 04 (3 meses) |
| 14 | 03 sem troca de fermento | Nota "Sem fermento natural" |
| 15 | 05: o filão podia não caber na panela | "Filão curto, que caiba na panela" |
| 16–18 | Textos genéricos demais | Harmonização, abertura e introdução da 03 ajustadas |
| 19 | "°C" quebrava de linha | Espaço não separável antes de °C no montador |

## Montagem

`python build_paes.py` gera `PAES_E_FERMENTACAO_NATURAL.pdf` (31 páginas). Roda no Linux, com as fontes Liberation e o Chromium de `/opt/pw-browsers`, e no Windows, com Times New Roman e Arial (mesmas métricas) e o Chromium do Playwright. O PDF e o HTML não vão para o repositório, como nos outros livros.
