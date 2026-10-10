# Revisão editorial e técnica — Trattoria em Casa

Fonte: `src.pdf` (39 p.). Destino: `content_trattoria.py` (estrutura do Dolci + `module` e `img`).
"p." = página do PDF original. A coluna "Mudança" descreve o que está no content.

Convenções aplicadas a todo o livro (não repetidas linha a linha):
- Quadros "Dica do Chef" e "Ponto técnico" viraram `tip`. Nas receitas de 2 páginas os dois quadros tinham o mesmo texto e foram unidos.
- "Erro comum a evitar" virou a nota "Erro comum". Os quadros técnicos longos viraram notas curtas: Il mantecare (07), Slow cooking e soffritto (08), O limite dos 65 °C (09), Controle de umidade (15) e Arquitetura das camadas (17).
- Ficha técnica (Tempo/Rendimento/Dificuldade/Cocção) virou `meta` com 4 itens: Rendimento, Preparo, 3º contextual (Descanso/Cozimento/Forno/Fermentação/Termômetro/Ponto-chave) e Nível. "Fácil / Básico", "Médio / Paciência", "Médio / Técnica de Emulsão" etc. foram simplificados para Fácil/Médio/Muito fácil.
- Toda instrução de cozimento de massa passou a dizer "água fervente com sal (10 g por litro)". Princípio: 1 L de água + 10 g de sal para cada 100 g de massa.
- Todo forno passou a ter um passo explícito de "Preaqueça a X °C".
- Medidas caseiras entre parênteses: farinha 1 xícara ≈ 120 g; líquidos 1 xícara = 240 ml, 1 colher de sopa = 15 ml; sêmola ≈ 170 g/xícara; manteiga ≈ 14 g por colher de sopa; sal fino ≈ 6 g por colher de chá; fermento seco ≈ 3 g por colher de chá.
- Unidades: "300g" → "300 g", "1.5mm" → "1,5 mm", "250°C" → "250 °C"; "pimenta do reino" → "pimenta-do-reino"; "tomate cereja" → "tomate-cereja".
- Quando os passos citavam um ingrediente ausente da lista, ele foi incluído. A quantidade foi tirada do próprio texto quando possível. Senão, foi usada uma quantidade usual, listada em **Dúvidas**.
- Nos molhos (07, 12, 13, 21–24) entrou o grupo "Para servir", com a massa calculada pelo rendimento (≈100 g de massa seca por porção). O original não listava a massa, embora os passos a usassem.

---

## 1. Segurança alimentar

| p. | Trecho original | Mudança | Motivo |
|---|---|---|---|
| 17 (10 Carbonara) | Dica do Chef: "A temperatura ideal da frigideira para colocar o creme de ovos é quando você consegue encostar a mão no fundo sem queimar." | Removida. Nova dica: medir com termômetro, mexer sem parar e juntar a água quente aos poucos até 70 °C. | Encostar a mão na panela é perigoso e, sobretudo, leva a uma temperatura baixa demais para a gema. |
| 17 (10) | Passos 4–5: tirar a frigideira do fogo e despejar o creme de ovos (sem temperatura final) | Passo 6: creme fora do fogo + 2 colheres (sopa) de água **quente** do cozimento. Passo 7 novo: conferir 70 °C no termômetro e, se não chegar, apoiar a frigideira sobre uma panela com água fervente (sem fogo direto), mexendo, até 70 °C. Servir em seguida. "Termômetro culinário" entrou como utensílio e `meta` "Termômetro: molho a 70 °C". | Gema e ovo inteiro não cozidos no prato final. |
| 17 (10) | — | Nota **"Segurança alimentar"**: "As gemas são misturadas fora do fogo e aquecidas pelo calor da massa e da água do cozimento até ficarem cremosas e atingirem 70 °C, confirmados com termômetro culinário, sem virar ovo mexido." | Pedido editorial. |
| 4–10, 22–24 (receitas 01–03, 06, 15, 16) | Massas frescas sem orientação de conservação | Notas "Conservação": massas 01/02/03: geladeira até 2 dias em pote fechado ou congelar, cozinhando sem descongelar. Recheadas 15/16: cozinhar no mesmo dia ou congelar (recheio de ricota/queijo fresco é mais perecível). Nhoque 06: congelar cru. | Massa fresca com ovo é perecível. |
| — | Outros pratos com ovo | Conferidos: nhoque (gema cozida na fervura) e recheio do ravioli (gema cozida 3 min). Nenhum outro prato final leva ovo cru. | — |

## 2. Correções técnicas

| p. | Receita / trecho | Mudança | Motivo |
|---|---|---|---|
| 3 | Princípio 03 "Água salgada como o mar" | Título "Água bem salgada"; texto: 1 L de água e 10 g de sal para cada 100 g de massa. | Água do mar tem ~35 g/L, mais de 3× o recomendado. A imagem levaria a salgar demais. |
| 3 | 4 Princípios: no original, só os títulos (ilustração) | Cada princípio ganhou 1–2 frases redigidas **a partir do conteúdo do próprio livro** (receita 01, descanso de 30–45 min, quadro do mantecare). | Pedido: título + 1–2 frases. |
| 4–5 (01) | "Rendimento: 4 porções (400g)" | "4 a 5 porções (cerca de 600 g de massa)". | 400 g é o peso da farinha+sêmola. Com 4 ovos (~200 g) dá ~600 g de massa, ou seja, 4–5 porções de 120–150 g. |
| 4–5 (01) | Passo 1: vulcão "com a farinha" (a sêmola não aparecia) | Misturar farinha e sêmola antes do vulcão; sal junto dos ovos. | A sêmola estava na lista, mas nenhum passo a usava. |
| 5 (01) | Sem tempo de cozimento | Passo 7: 1½–2 min (tagliolini), 2–3 min (fettuccine/tagliatelle), tirados da tabela da p. 38. Nota "Água do cozimento". | Completar a receita com dado do próprio livro. |
| 6 (02) | "Rendimento: 4 porções (380g)" | "4 porções (cerca de 520 g de massa)". | 350 g de sêmola + 170 ml de água = 520 g. |
| 6 (02) | Tag "Cavatelli / Orecchiette", mas só o cavatelli era explicado | Nota "Orecchiette" com a técnica padrão (disco arrastado com a faca e virado sobre o polegar). Cozimento 4–5 min com sal virou passo. | Promessa do subtítulo não cumprida. |
| 7 (03) | "Rendimento: 4 porções (420g)" | "4 porções (cerca de 550 g de massa)". | 350 g de farinha + ~100 g de ovos + ~110–130 g de espinafre espremido ≈ 560–580 g. **Valor estimado** (ver Dúvidas). |
| 7 (03) | — | Passo de ajuste: farinha se grudar, mãos úmidas se esfarelar. Cozimento 2–3 min virou passo. | A umidade do espinafre varia; sem esse ajuste, a receita pode falhar. |
| 8 (04) | "1 porção de Massa aos Ovos" | "1 receita de massa clássica aos ovos (receita 01)". O mesmo ajuste foi feito em 05, 15 e 16. | "Porção" sugeria 1/4 da receita, o que não bate com as 4 porções. |
| 8 (04) | "Dobre as pontas da folha em direção ao centro em dobras de 4cm" | "Dobre a folha sobre si mesma, das pontas para o centro, em dobras de cerca de 4 cm, sem apertar". Cozimento 2–3 min com sal virou passo (ficha: 2½ min). | Clareza do gesto. |
| 9 (05) | Intro "2cm a 2.5cm" × passo "2.5cm" | Padronizado "2–2,5 cm". Cozimento "3–3½ min" (ficha 3 min; tabela 3–3,5). | Coerência interna. |
| 10 (06) | Noz-moscada no passo 4, mas não na lista | Incluída "a gosto". | Ingrediente faltante. |
| 10 (06) | "Tempo: 40 minutos" com batatas assadas a 180 °C | Preparo "40 min + cozimento das batatas"; passo 1 com tempos usuais: vapor 25–30 min, forno preaquecido a 180 °C 50–60 min. | 800 g de batata não assam em menos de 40 min. Os tempos são estimativas usuais (ver Dúvidas). |
| 10 (06) | "Rendimento: 4 a 5 porções (600g)" | "4 a 5 porções (cerca de 850 g)". | 800 g de batata (~720 g descascada) + 120–150 g de farinha + gema ≈ 860 g. A receita 19 usa 600 g = ~¾ desta receita, e isso foi explicitado lá. |
| 10 (06) | Dica: "...garante um nhoque com 70% menos farinha" | Removido o "70%". Texto: a Asterix é mais seca que a Monalisa e pede bem menos farinha. | Número sem base verificável. |
| 10 (06) | "corte cubos de 1.5cm" | "corte em pedaços de 1,5 cm"; cozinhar "em levas" e em água com sal. | Precisão. |
| 11–12 (07) | Passo 3: "despeje os tomates na **frigideira**" (o alho estava em "panela") | Padronizado: molho na panela; mantecare na frigideira. Ordem: amassar o tomate antes de aquecer o azeite. | Incoerência de utensílio e ordem lógica. |
| 12 (07) | Quadro "Il Mantecare" (3 itens) | Virou os passos 6–8 (escorrer 1 min antes do al dente, 50 ml de água do cozimento, finalizar fora do fogo) e uma nota curta. | Preservar o quadro técnico sem estourar a página. |
| 13–14 (08) | Dica: "amacia o colágeno das carnes moídas" | "suaviza a acidez do tomate e deixa o ragù com textura macia e aveludada". | Afirmação científica imprecisa. |
| 13–14 (08) | Sem indicação de massa | Nota "Para servir": molho para ~600 g de massa seca ou 750 g de fresca (6 porções). | Coerência com o rendimento. |
| 15–16 (09) | Passo 2 "desligue o fogo" × passo 4 "salteie por 1 minuto" | A água de pimenta ferve, a massa é salteada 1 min em fogo médio e só então a frigideira sai do fogo (30 s) para receber o queijo. Passo 1 novo: cozinhar a massa ~2 min antes do ponto e reservar a água. | Os passos eram contraditórios: não dá para saltear com o fogo desligado. |
| 15–16 (09) | Quadro "O limiar térmico da emulsão (<65°C)" | Nota "O limite dos 65 °C" ("cerca de 65 °C"). | Preservado e condensado. |
| 17 (10) | Pimenta no passo 2, mas não na lista; "2 colheres da gordura" | Pimenta incluída; "2 colheres (sopa)". Passo para cozinhar a massa e reservar a água. | Ingrediente faltante; precisão. |
| 18 (11) | Vinho branco (passo 2) e pimenta (passo 4) ausentes da lista | Incluídos: 60 ml de vinho branco seco e 1 peperoncino seco (ou ½ colher de chá de calabresa). **Quantidades usuais, não do original** (ver Dúvidas). | Ingredientes faltantes. |
| 18 (11) | 350 g de massa para "4 porções" (87 g/porção) | Rendimento "3 a 4 porções". | Referência de ≈100 g de massa seca por porção. |
| 19 (12) | Alho, sal grosso e azeite nos passos, mas não na lista | Incluídos: 1 dente de alho (o passo fala em "o dente de alho"), 1 pitada de sal grosso e 100 ml de azeite. **Azeite em quantidade usual** (ver Dúvidas). "Para servir": 400 g de massa. | Ingredientes faltantes. Sem azeite não existe pesto. |
| 20 (13) | "Manteiga queimada suave (avulada/castanha)"; "beurre noisette" | "manteiga dourada, cor de avelã (manteiga noisette)". | "Avulada" não existe. Termo padronizado. |
| 21 (14) | Salsinha no passo 5, mas não na lista; "Tempo: 5 minutos" com cocção de 8 min | Salsinha "a gosto"; Preparo 15 min (inclui a massa); 3º meta "Cozimento: 8 min (molho)". Passo 1: a massa vai ao fogo junto com o molho. | Ingrediente faltante; incoerência de tempo. |
| 22–23 (15) | Passo 5 "água fervente" × quadro "fogo médio-baixo, sem ebulição violenta" | Passo 6: "água com sal em fervura branda (fogo médio-baixo) por 3 minutos". Espinafre "bem escorrido". | Contradição interna. Prevaleceu a orientação técnica do quadro. |
| 22–23 (15) | Quadro "Controle de umidade & vácuo artesanal" | Nota "Controle de umidade". O item "do centro para as bordas" foi para o passo 4. | Preservado. |
| 24 (16) | Título "...Queijo & **Ervas**", mas sem ervas na lista e sem passo de recheio | Ervas frescas "a gosto" (salsinha, manjericão ou tomilho) e passo 1 de mistura do recheio. Muçarela de búfala bem escorrida. | Ingrediente do título ausente; etapa faltante. |
| 25–26 (17) | Ficha "Forno: 35 min" × passo "30 minutos" | "190 °C, 30–35 min", com forno preaquecido. Massa "(receita 01)". | Incoerência. |
| 27 (18) | "Coloque 2 colheres de recheio" em 10 folhas | "cerca de 60 g, ou 4 colheres de sopa, cada". | 400 g de frango + 200 g de requeijão = 600 g ÷ 10 = 60 g; 2 colheres deixariam sobrar metade do recheio. |
| 27 (18) | "ervas picadas" e "salpique os queijos" sem constar da lista | Incluídos 2 colheres (sopa) de ervas (salsinha e cebolinha) e 50 g de parmesão. **Quantidades sugeridas** (ver Dúvidas). Forno preaquecido a 200 °C, 25 min. | Ingredientes faltantes. |
| 28 (19) | Creme de leite fresco e provolone nos passos, mas não na lista | Incluídos 250 ml de creme de leite fresco e 50 g de provolone. **Quantidades sugeridas** (ver Dúvidas). | Sem creme não há fonduta; o provolone é o "4º queijo" do título. |
| 28 (19) | Ficha "15 minutos no forno alto" × passo "220°C por 12 minutos" | "220 °C, 12–15 min", preaquecido. "600 g de nhoque (cerca de ¾ da receita 06)". | Incoerência. |
| 29 (20) | "molho rosé" sem receita nem ingredientes | Grupo "Molho rosé": 400 ml de pomodoro (receita 07) + 200 ml de creme de leite fresco, aquecidos sem ferver. **Proporção sugerida** (ver Dúvidas). | Molho citado e inexistente no livro. |
| 29 (20) | Passo 1 "Abra as folhas de massa fresca cozidas por 1 minuto" | Separado em: cozinhar 1 min, passar por água fria e secar; depois abrir sobre filme. Forno preaquecido a 190 °C. | Clareza. |
| 30 (21) | Intro "Pronto em 12 minutos" × ficha 5 + 10 min | "prontos em cerca de 15 minutos". Sal e pimenta incluídos; manjericão restante na finalização. | Incoerência de tempo; ingredientes implícitos. |
| 30 (21) | Erro comum: "Mexer os tomates logo que caem na panela **fria**" | "assim que entram na frigideira". | O passo 1 manda aquecer em fogo alto: "panela fria" contradizia. |
| 31 (22) | Noz-moscada e pimenta no passo 4, mas não na lista; nozes tostadas na dica e não nos passos | Incluídas "a gosto". Tostar as nozes virou o passo 1. Grupo "Para servir". | Ingredientes e etapa faltantes. |
| 32 (23) | Azeitonas, alcaparras, pimenta calabresa, salsinha e spaghetti nos passos, mas não na lista | Incluídos: 60 g de azeitonas pretas (~12), 1 colher (sopa) de alcaparras lavadas, ½ colher (chá) de calabresa, 1 punhado de salsinha, 350 g de spaghetti. **Quantidades usuais** (ver Dúvidas). | Ingredientes faltantes, inclusive os do subtítulo. |
| 33 (24) | Tomilho e vinho branco nos passos, mas não na lista; sem indicação de quando salgar | Incluídos 2 ramos de tomilho e 60 ml de vinho branco (**sugeridos**). Passo final: sal e pimenta só no fim (coerente com a dica). Passo 1: limpar sem lavar (vem do "erro comum"). | Ingredientes faltantes. |
| 34 (25) | Sal e pimenta branca no passo 5, mas não na lista | Incluídos "a gosto". Roux "sem deixar dourar". | Ingrediente faltante. |
| 34 (25) | Dica: "garantia matemática de que o molho nunca empelotará" | "Leite morno sobre o roux quente é o que evita os grumos". | Exagero. |
| 35 (26) | Azeite no passo 3, mas não na lista | Incluído "15 ml (1 colher de sopa)" (**sugerido**). | Ingrediente faltante. |
| 35 (26) | "Divida em 3 bolas de 270g" | "cerca de 280 g". | 500 + 330 + 12 + 3 + 15 = 860 g ÷ 3 ≈ 287 g. 270 g deixaria sobra. |
| 35 (26) | "asse sobre assadeira muito quente a 250°C" | Passo novo: preaquecer o forno a 250 °C (ou no máximo) com a assadeira dentro por 30 min. Assar 8–10 min. Fermentação de 24 h na geladeira mantida, + 2 h em temperatura ambiente. | A assadeira só fica "muito quente" se for preaquecida junto com o forno. |
| 35 (26) | "Água mineral fria" | "água filtrada fria". | Não precisa ser mineral. |
| 36 (27) | Ficha "+3h fermentação" | Mantido "cerca de 3 h" (3 dobras × 15 min + 2 h ≈ 2 h 45). Forno preaquecido a 220 °C; assar cerca de 22 min. Azeite da assadeira: "cerca de 45 ml" (**sugerido**). | Coerência e quantidade faltante. |
| 36 (27) | Erro comum: "Usar pouco azeite na assadeira: a focaccia frita no azeite por baixo, criando a base crocante." | "Economizar no azeite da assadeira: é ele que frita a base da focaccia e a deixa crocante." | Do jeito que estava, a frase parecia dizer que pouco azeite é que frita a base. |
| 37 (28) | Manjericão no passo 1, mas não na lista; "5 minutos de forno" sem temperatura | Manjericão "a gosto". Forno preaquecido a 200 °C, cerca de 5 min (ou grelha). **Temperatura sugerida** (ver Dúvidas). | Ingrediente e dado faltantes. |
| 38 | Tabela: "Spaghetti / Bucatini: 2 - 3 min" | "Frescos: 2–3 min · secos: conforme a embalagem". | Todas as receitas com spaghetti/bucatini (09, 10, 11, 14, 23) usam massa seca, que leva bem mais de 3 min. |
| 38 | "Lasanha & Canelone: Bolognese com Bechamel ao Forno, 30 - 35 min" | "Ragù com bechamel, ao forno"; tempo "lasanha 30–35 min · cannelloni 25 min". | A receita 18 assa por 25 min. |
| 38 | Cabeçalho "TEMPO" | "Cozimento". | Clareza. |

## 3. Títulos

Capitalização normalizada para o padrão do Dolci (só a inicial maiúscula, nomes italianos mantidos). Mudanças de texto:

| # | Original | Novo |
|---|---|---|
| 01 | Massa Clássica aos Ovos | Massa clássica aos ovos |
| 02 | Massa de Sêmola & Água | Massa de sêmola e água |
| 03 | Massa Verde de Espinafre Natural | Massa verde de espinafre |
| 04 | Tagliatelle & Fettuccine na Faca | Tagliatelle e fettuccine na faca |
| 05 | Pappardelle Rústico de Trattoria | Pappardelle rústico |
| 06 | Nhoque de Batata Tradicional (Sem pesar na massa) | Nhoque de batata |
| 07 | Pomodoro & Basilico Autêntico (San Marzano) | Pomodoro e basilico |
| 08 | Ragu alla Bolognese Tradicional | Ragù alla bolognese |
| 09 | Cacio e Pepe Perfeito | Cacio e pepe |
| 10 | Carbonara Clássica | Carbonara |
| 11 | All'Amatriciana Tradicional | Amatriciana |
| 12 | Pesto alla Genovese Fresco no Pilão/Mixer | Pesto alla genovese |
| 13 | Burro e Salvia Aveludado | Burro e salvia |
| 14 | Aglio, Olio e Peperoncino Perfeito | Aglio, olio e peperoncino |
| 15 | Ravioli de Ricota Fresca & Espinafre | Ravioli de ricota e espinafre |
| 16 | Tortellini Clássico de Queijo & Ervas | Tortellini de queijo e ervas |
| 17 | Lasanha Tradicional alla Bolognese | Lasanha alla bolognese |
| 18 | Cannelloni Recheado de Frango com Ervas | Cannelloni de frango com ervas |
| 19 | Nhoque Gratinado aos 4 Queijos Italianos | Nhoque gratinado aos quatro queijos |
| 20 | Rondelli aos **Quatro Queijos** & Molho Rosé | Rondelli de queijos ao molho rosé. Só há 3 queijos na lista (muçarela, prato/provolone, ricota). |
| 21 | Sugo Rápido com Tomates Cereja Tostados | Sugo rápido de tomate-cereja |
| 22 | Molho Cremoso de Gorgonzola & Nozes | Molho de gorgonzola e nozes |
| 23 | Molho alla Puttanesca Tradicional | Molho alla puttanesca |
| 24 | Molho de Cogumelos Frescos & **Manteiga de Ervas** | Molho de cogumelos com manteiga e tomilho. A única erva é o tomilho; não há manteiga de ervas. |
| 25 | Molho Branco Aveludado (Bechamel suave) | Molho bechamel (tag: "Molho branco aveludado") |
| 26 | Massa de Pizza de Fermentação de 24h para Forno Caseiro | Massa de pizza de fermentação lenta (tag: "24 horas na geladeira, para forno doméstico") |
| 27 | Focaccia Genovese Crocante com Alecrim | Focaccia genovese com alecrim |
| 28 | Bruschetta Tradicional ao Azeite e Ervas Frescas | Bruschetta de tomate e manjericão. A única erva é o manjericão; o tomate é o principal. |
| p. 3 | Princípio 03 "Água salgada como o mar" | "Água bem salgada" (ver Correções técnicas) |
| Mód. 02 | Os Molhos Clássicos & Emulsões | Molhos clássicos & emulsões |

## 4. Linguagem (resumo)

- Retirados superlativos e marketing: "a base mais nobre", "leve como nuvem", "o segredo absoluto", "o clássico absoluto", "pureza técnica", "o antepasto mais amado", "garantia matemática", "suntuosas", "restaurantes de Bolonha", "Perfeito" nos títulos, "imitam fornos a lenha" → "lembram o forno a lenha".
- Frases técnicas reescritas na voz imperativa do Dolci ("Junte…", "Cozinhe…"), com uma ação principal por passo e os tempos em faixa ("2–3 minutos").
- Ajustes de vocabulário: "Verta" → "Adicione/junte"; "Deglaceie" → "raspando o fundo"; "fouet" → "batedor de arame"; "Roux claro" mantido e explicado; "ativa a proteína" → "hidrata"; "cozinha noturna" → "clássico de fim de noite"; "100% vegana" → "sem ovos" (sem rótulo de dieta).
- Nenhuma promessa de saúde. Nenhuma marca comercial: San Marzano, Parmigiano Reggiano, Grana Padano e Pecorino Romano são denominações de origem; Asterix e Monalisa são cultivares; requeijão e creme de leite de caixinha são categorias.
- Nos módulos, "&" foi mantido nos títulos (identidade do original); no corpo do texto, "e".
- Encerramento (p. 39): "COZINHAR É CRIAR LAÇOS, COMPARTILHAR É A TRADIÇÃO." → "Cozinhar é criar laços; compartilhar é a tradição." (ponto e vírgula entre orações independentes; caixa normal). "para a sua mesa" → "à sua mesa".
- Citação da p. 38: "memórias inesquecíveis" → "memórias à mesa" (redundância).
- A frase de destaque da p. 5 ("Você não precisa de máquinas…") ficou em `HIGHLIGHT`, sem alteração. O briefing dizia p. 4; no PDF, ela está sobre a foto da p. 5.

## 5. Dúvidas (decidir antes de publicar)

1. **Quantidades acrescentadas que não existem no original.** Os ingredientes eram citados nos passos sem medida. Usei valores usuais; peço confirmação:
   - 11 Amatriciana: vinho branco 60 ml; 1 peperoncino ou ½ colher (chá) de calabresa.
   - 12 Pesto: azeite 100 ml; 1 pitada de sal grosso.
   - 18 Cannelloni: ervas 2 colheres (sopa) (salsinha e cebolinha); parmesão 50 g.
   - 19 Nhoque 4 queijos: creme de leite fresco 250 ml; provolone 50 g.
   - 20 Rondelli: molho rosé = 400 ml de pomodoro + 200 ml de creme de leite.
   - 23 Puttanesca: azeitonas 60 g; alcaparras 1 colher (sopa); calabresa ½ colher (chá); salsinha 1 punhado; spaghetti 350 g.
   - 24 Cogumelos: tomilho 2 ramos; vinho branco 60 ml.
   - 26 Pizza: azeite 15 ml. 27 Focaccia: azeite da assadeira ~45 ml. 28 Bruschetta: forno a 200 °C.
   - Massa "Para servir" nos molhos: 100 g de massa seca por porção.
2. **Rendimentos recalculados** (01: ~600 g; 02: ~520 g; 03: ~550 g; 06: ~850 g) são estimativas por soma de ingredientes. O 03 depende de quanto o espinafre perde ao ser espremido.
3. **06 Nhoque:** os tempos de vapor (25–30 min) e de forno (50–60 min a 180 °C) não estão no original. Variam com o tamanho das batatas.
4. **17 Lasanha:** 500 ml de bechamel para fundo, 4–5 camadas e "bastante" no topo é pouco para 6–8 porções. Considerar 750 ml (1½ receita 25). Também não há tamanho do refratário nem das 12 folhas. Não alterei.
5. **20 Rondelli:** o título original prometia 4 queijos e só listava 3. Renomeei. Alternativa: acrescentar parmesão para gratinar e manter "quatro queijos".
6. **02 Orecchiette:** a técnica da nota foi acrescentada pela revisão (o original só cita o formato). Manter ou retirar do subtítulo?
7. **16 Tortellini:** "ervas a gosto" acrescentadas por causa do título. Definir quais e quanto.
8. **08 Ragù:** a receita da Accademia (1982) leva pancetta **e** carnes; o original dá "lombo suíno **ou** pancetta". Mantive "ou" e troquei "A receita clássica da Accademia" por "Inspirado na receita registrada pela Accademia", porque o vinho tinto e o lombo diferem do registro oficial.
9. **09 Cacio e pepe:** limite de "65 °C" mantido como "cerca de 65 °C". A faixa citada na literatura culinária varia (≈60–70 °C).
10. **Massa de lasanha/cannelloni/rondelli** (17, 18, 20): o original não diz quantas receitas de massa 01 são necessárias nem o tamanho das folhas (exceto o cannelloni, 12 × 15 cm). Mantive só "(receita 01)".
11. Os textos dos **4 princípios** foram redigidos pela revisão (o original tem só os títulos na ilustração).


## Decisões tomadas (Claude, 10/10/2026)

- Dúvida 1 (quantidades ausentes no original): mantidos os valores usuais propostos.
- Dúvida 2 (lasanha): bechamel aumentado para 750 ml (1½ receita do molho 25). 500 ml não cobre 4–5 camadas num refratário para 6–8 porções.
- Dúvida 3 (orecchiette): nota mantida — a receita 02 promete orecchiette no subtítulo.
- Dúvida 4 (ervas do tortellini): mantido "a gosto".
- Dúvida 5 (rendimentos e tempos estimados): mantidos; são coerentes com as quantidades de cada receita.
