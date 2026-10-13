# -*- coding: utf-8 -*-
"""Conteúdo das receitas de Risotos & Polentas (Volume V da coleção Cozinha Italiana em Casa).

Mesma estrutura dos Volumes III e IV: slug, title, tag, intro, meta (4 itens), ingredients (grupos), steps, notes, tip e,
opcional, left (notas que vão para a coluna dos ingredientes).
Medidas caseiras: líquidos 240 ml/xícara, 15 ml/colher de sopa, 5 ml/colher de chá; sal fino ≈ 6 g/colher de chá;
arroz arbóreo ≈ 200 g/xícara; parmesão ralado fino ≈ 80 g/xícara; manteiga ≈ 15 g/colher de sopa;
fubá para polenta ≈ 150 g/xícara.
"""

RECIPES = [
    dict(
        slug="caldo", left=["Sem tempo"],
        title="Caldo de legumes caseiro",
        tag="Brodo vegetale — a base de todos os risotos do livro",
        intro="O risoto é arroz cozido no caldo, e o sabor do caldo vai para cada grão. Este caldo leva só legumes, "
              "fica pronto em uma hora e congela bem: vale fazer em dobro.",
        meta=[("Rendimento", "cerca de 2 litros"), ("Preparo", "15 min"),
              ("Cozimento", "1 h em fogo baixo"), ("Nível", "Fácil")],
        ingredients=[
            ("Legumes", [
                "2 cebolas médias cortadas ao meio, com casca (cerca de 300 g)",
                "2 cenouras em pedaços grandes (cerca de 200 g)",
                "2 talos de salsão com as folhas (cerca de 150 g)",
                "1 tomate maduro cortado ao meio",
                "1 alho-poró, só a parte verde, lavado (opcional)",
            ]),
            ("Temperos", [
                "5 talos de salsinha",
                "1 folha de louro",
                "6 grãos de pimenta-do-reino",
                "2,5 litros de água fria (10½ xícaras)",
                "6 g de sal fino (1 colher de chá)",
            ]),
        ],
        steps=[
            "Lave bem os legumes. Não precisa descascar a cebola: a casca dá cor dourada ao caldo.",
            "Coloque todos os ingredientes numa panela grande, com a água fria.",
            "Leve ao fogo médio até começar a ferver, retirando com uma escumadeira a espuma que subir. Baixe o fogo para o mínimo e cozinhe destampado por 1 hora, com bolhas pequenas e espaçadas.",
            "Coe numa peneira fina, apertando os legumes de leve com uma concha. Descarte os legumes.",
            "Prove: o caldo deve ter gosto suave e um pouco de sal. Ele vai reduzir no risoto, por isso não salgue mais.",
        ],
        notes=[
            ("Sem tempo", "Use caldo de legumes em cubo ou em pó, dissolvido com o dobro da água indicada na embalagem. Como ele já é salgado, deixe para acertar o sal do risoto só no fim."),
            ("Para frango ou carne", "Os risotos 02 e 08 ficam ainda mais saborosos com caldo de frango: junte à panela 500 g de carcaça ou asas de frango e mais 500 ml de água, e cozinhe por 1 h 30 min."),
            ("Conservação", "Esfrie rápido, numa tigela dentro de outra com água e gelo, e guarde em potes fechados: até 3 dias na geladeira ou 3 meses no congelador."),
        ],
        tip="Congele o caldo em porções de 1,2 litro, a quantidade de um risoto para 4 pessoas. Basta descongelar e aquecer.",
    ),
    dict(
        slug="milanese",
        title="Risoto alla milanese",
        tag="Açafrão, manteiga e parmesão — o risoto clássico de Milão",
        intro="O risoto mais famoso da Itália é amarelo-ouro por causa do açafrão e cremoso só pelo amido do arroz, "
              "pela manteiga e pelo parmesão. Em Milão, acompanha o ossobuco; sozinho, já é um prato completo.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "10 min"),
              ("Cozimento", "cerca de 25 min"), ("Nível", "Médio")],
        ingredients=[
            ("Risoto", [
                "1,2 litro de caldo de legumes (5 xícaras), receita 01",
                "30 ml de azeite (2 colheres de sopa)",
                "1 cebola pequena bem picada (cerca de 80 g)",
                "320 g de arroz arbóreo ou carnaroli (1⅔ xícara)",
                "100 ml de vinho branco seco (⅓ de xícara + 1 colher de sopa)",
                "1 envelope de açafrão verdadeiro em pó (0,1 g) ou 1 pitada de pistilos",
            ]),
            ("Para finalizar", [
                "40 g de manteiga gelada em cubos (cerca de 3 colheres de sopa)",
                "60 g de parmesão ralado fino (¾ de xícara)",
                "Sal a gosto",
            ]),
        ],
        steps=[
            "Aqueça o caldo numa panela e mantenha quente, em fogo mínimo. Dissolva o açafrão em ½ xícara do caldo quente.",
            "Numa panela larga de fundo grosso, aqueça o azeite em fogo médio e refogue a cebola por 4 a 5 minutos, até ficar transparente, sem dourar.",
            "Junte o arroz e toste por 2 minutos, mexendo, até os grãos ficarem brilhantes e quentes ao toque (página 04).",
            "Junte o vinho e mexa até evaporar.",
            "Junte o caldo quente, uma concha por vez, mexendo com frequência e esperando quase secar antes da próxima. Na metade do tempo, junte o caldo com açafrão.",
            "Cozinhe por 16 a 18 minutos, até o arroz ficar macio por fora e ainda firme no centro, al dente. O risoto deve ficar cremoso e escorrer devagar.",
            "Desligue o fogo, junte a manteiga e o parmesão e mexa com vigor por 1 minuto (mantecatura). Acerte o sal, tampe e descanse 1 minuto antes de servir.",
        ],
        notes=[
            ("Açafrão", "Use açafrão verdadeiro, não açafrão-da-terra. Na falta, ½ colher de chá de cúrcuma dá a cor, mas não o perfume."),
            ("Erro comum", "Juntar caldo frio: a fervura para, o arroz cozinha por fora e fica duro por dentro. O caldo fica sempre quente, na panela ao lado."),
            ("Álcool", "O vinho evapora parte do álcool, não todo. Para crianças, gestantes e quem não bebe, troque pelo mesmo volume de caldo e 1 colher de chá de suco de limão. Vale para todos os risotos com vinho branco."),
        ],
        tip="Sirva em pratos aquecidos e na hora: o risoto continua engrossando no prato. Se esperar, solte com uma concha de caldo quente.",
    ),
    dict(
        slug="funghi",
        title="Risoto de cogumelos",
        tag="Risotto ai funghi — cogumelos dourados, tomilho e parmesão",
        intro="Dois tipos de cogumelo, dourados separadamente em fogo alto para concentrar o sabor e misturados ao risoto "
              "no fim. Um clássico do outono no norte da Itália.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "20 min"),
              ("Cozimento", "cerca de 25 min"), ("Nível", "Médio")],
        ingredients=[
            ("Cogumelos", [
                "300 g de cogumelos-de-paris em fatias",
                "150 g de cogumelos shiitake em fatias, sem os talos",
                "30 ml de azeite (2 colheres de sopa)",
                "1 dente de alho picado",
                "1 colher de chá de tomilho fresco",
                "3 g de sal fino (½ colher de chá)",
            ]),
            ("Risoto", [
                "1,2 litro de caldo de legumes quente (5 xícaras), receita 01",
                "30 ml de azeite (2 colheres de sopa)",
                "1 cebola pequena bem picada (cerca de 80 g)",
                "320 g de arroz arbóreo ou carnaroli (1⅔ xícara)",
                "100 ml de vinho branco seco (⅓ de xícara + 1 colher de sopa)",
                "40 g de manteiga gelada em cubos",
                "50 g de parmesão ralado fino (½ xícara + 2 colheres de sopa)",
                "2 colheres de sopa de salsinha picada",
                "Sal a gosto",
            ]),
        ],
        steps=[
            "Aqueça metade do azeite numa frigideira grande em fogo alto e doure metade dos cogumelos, sem mexer no primeiro minuto, por 5 a 6 minutos, até dourarem e a água secar. Retire e repita com o restante do azeite e dos cogumelos.",
            "Junte o alho, o tomilho e o sal à última leva, refogue 1 minuto e junte a primeira leva. Reserve.",
            "Numa panela larga, refogue a cebola no azeite em fogo médio por 4 a 5 minutos, sem dourar. Toste o arroz por 2 minutos, mexendo.",
            "Junte o vinho e mexa até evaporar. Junte o caldo quente, uma concha por vez, mexendo com frequência.",
            "Depois de 12 minutos, junte dois terços dos cogumelos.",
            "Continue até completar 16 a 18 minutos, com o arroz al dente e cremoso.",
            "Desligue, junte a manteiga e o parmesão e mexa com vigor por 1 minuto. Acerte o sal. Sirva com o restante dos cogumelos e a salsinha por cima.",
        ],
        notes=[
            ("Cogumelos secos", "Para um sabor mais intenso, hidrate 15 g de cogumelos secos em 200 ml de água quente por 20 minutos. Pique e junte aos frescos; coe a água em papel-toalha e use no lugar de parte do caldo."),
            ("Segurança", "Use só cogumelos comprados. Cogumelos colhidos no campo podem ser venenosos e parecidos com os comestíveis."),
            ("Para adiantar", "Os cogumelos dourados ficam até 1 dia na geladeira, cobertos. Aqueça na frigideira antes de juntar ao risoto."),
        ],
        tip="Não lave os cogumelos de molho: limpe com pano úmido ou pincel. Encharcados, eles não douram.",
    ),
    dict(
        slug="abobora",
        title="Risoto de abóbora com sálvia",
        tag="Risotto alla zucca — abóbora assada, sálvia na manteiga",
        intro="Metade da abóbora derrete no risoto e o deixa alaranjado e adocicado; a outra metade vai em cubos assados. "
              "As folhas de sálvia fritas na manteiga dão o toque final.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "20 min"),
              ("Cozimento", "25 min + 25 min de forno"), ("Nível", "Médio")],
        ingredients=[
            ("Abóbora", [
                "600 g de abóbora cabotiá descascada, em cubos de 2 cm",
                "15 ml de azeite (1 colher de sopa)",
                "3 g de sal fino (½ colher de chá)",
            ]),
            ("Risoto", [
                "1,2 litro de caldo de legumes quente (5 xícaras), receita 01",
                "30 ml de azeite (2 colheres de sopa)",
                "1 cebola pequena bem picada (cerca de 80 g)",
                "320 g de arroz arbóreo ou carnaroli (1⅔ xícara)",
                "100 ml de vinho branco seco (⅓ de xícara + 1 colher de sopa)",
                "30 g de manteiga gelada em cubos (2 colheres de sopa)",
                "50 g de parmesão ralado fino (½ xícara + 2 colheres de sopa)",
                "Noz-moscada ralada na hora",
                "Sal a gosto",
            ]),
            ("Sálvia", [
                "20 g de manteiga (1⅓ colher de sopa)",
                "12 folhas de sálvia fresca",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 200 °C. Misture a abóbora com o azeite e o sal e asse numa assadeira por 25 minutos, até ficar macia e dourada nas bordas. Amasse metade com um garfo e reserve a outra metade em cubos.",
            "Numa panela larga, refogue a cebola no azeite em fogo médio por 4 a 5 minutos, sem dourar. Toste o arroz por 2 minutos, mexendo.",
            "Junte o vinho e mexa até evaporar. Junte o caldo quente, uma concha por vez, mexendo com frequência.",
            "Depois de 10 minutos, junte a abóbora amassada.",
            "Continue até completar 16 a 18 minutos, com o arroz al dente e cremoso. Junte os cubos de abóbora no último minuto.",
            "Desligue, junte a manteiga, o parmesão e uma pitada de noz-moscada e mexa com vigor por 1 minuto. Acerte o sal.",
            "Numa frigideira pequena, derreta a manteiga em fogo médio e frite as folhas de sálvia por 30 a 40 segundos, até ficarem crocantes. Sirva o risoto com a sálvia e a manteiga por cima.",
        ],
        notes=[
            ("Abóbora", "A cabotiá (japonesa) é a mais doce e firme. A abóbora-de-pescoço também funciona; a moranga solta mais água e deixa o risoto mais mole."),
            ("Erro comum", "Juntar a abóbora crua: ela demora mais que o arroz para cozinhar e deixa o risoto aguado. Assada antes, concentra o sabor."),
            ("Conservação", "A abóbora assada fica até 3 dias na geladeira. O risoto pronto é melhor na hora (veja o planejamento, página 29)."),
        ],
        tip="Asse a abóbora na véspera. No dia, o risoto fica pronto em 30 minutos.",
    ),
    dict(
        slug="limao",
        title="Risoto de limão-siciliano",
        tag="Risotto al limone — fresco, perfumado e muito simples",
        intro="Na costa de Amalfi, o limão-siciliano entra no risoto em três tempos: raspas no início, suco no fim e "
              "raspas frescas por cima. Leve, fresco e ótimo com peixe grelhado.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "10 min"),
              ("Cozimento", "cerca de 25 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Risoto", [
                "1,2 litro de caldo de legumes quente (5 xícaras), receita 01",
                "30 ml de azeite (2 colheres de sopa)",
                "1 cebola pequena bem picada (cerca de 80 g)",
                "320 g de arroz arbóreo ou carnaroli (1⅔ xícara)",
                "100 ml de vinho branco seco (⅓ de xícara + 1 colher de sopa)",
                "2 limões-sicilianos grandes",
            ]),
            ("Para finalizar", [
                "40 g de manteiga gelada em cubos (cerca de 3 colheres de sopa)",
                "50 g de parmesão ralado fino (½ xícara + 2 colheres de sopa)",
                "Sal e pimenta-do-reino a gosto",
                "Folhas de manjericão ou hortelã (opcional)",
            ]),
        ],
        steps=[
            "Lave os limões e rale a casca dos dois, só a parte amarela, guardando as raspas separadas: as de um vão para o risoto, as do outro ficam para servir. Depois esprema os limões e separe 30 ml de suco (2 colheres de sopa).",
            "Numa panela larga, refogue a cebola no azeite em fogo médio por 4 a 5 minutos, sem dourar. Junte as raspas do primeiro limão e toste o arroz por 2 minutos, mexendo.",
            "Junte o vinho e mexa até evaporar. Junte o caldo quente, uma concha por vez, mexendo com frequência.",
            "Cozinhe por 16 a 18 minutos, até o arroz ficar al dente e cremoso.",
            "Desligue, junte a manteiga, o parmesão e o suco de limão e mexa com vigor por 1 minuto. Prove e acerte o sal, a pimenta e, se quiser mais ácido, mais suco.",
            "Sirva com as raspas do segundo limão e, se quiser, folhas de manjericão ou hortelã.",
        ],
        notes=[
            ("Erro comum", "Juntar o suco de limão no começo: cozido, ele fica amargo e perde o perfume. O suco vai só no fim, com o fogo desligado."),
            ("Raspas", "Rale só a parte amarela da casca. A parte branca, logo abaixo, é amarga."),
            ("Com camarão", "Salteie 300 g de camarão limpo em 1 colher de sopa de azeite, em fogo alto, por 2 a 3 minutos, até ficar rosado e opaco por inteiro, e sirva por cima. Nessa versão, use só metade do parmesão."),
        ],
        tip="Prefira limão-siciliano: o taiti é mais ácido e tem perfume diferente. Se só tiver taiti, use metade do suco.",
    ),
    dict(
        slug="ervilha",
        title="Risi e bisi",
        tag="Arroz com ervilhas do Vêneto, quase uma sopa",
        intro="O prato da primavera de Veneza: arroz e ervilhas cozidos juntos, mais mole que um risoto, "
              "para comer de colher. Antigamente era servido ao doge no dia de São Marcos, 25 de abril.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "15 min"),
              ("Cozimento", "cerca de 25 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Arroz", [
                "1,4 litro de caldo de legumes quente (5¾ xícaras), receita 01",
                "30 ml de azeite (2 colheres de sopa)",
                "20 g de manteiga (1⅓ colher de sopa)",
                "1 cebola pequena bem picada (cerca de 80 g)",
                "80 g de bacon ou pancetta em cubinhos (opcional)",
                "400 g de ervilhas frescas ou congeladas (cerca de 2¾ xícaras)",
                "280 g de arroz arbóreo ou vialone nano (1⅓ xícara + 2 colheres de sopa)",
            ]),
            ("Para finalizar", [
                "30 g de manteiga gelada (2 colheres de sopa)",
                "50 g de parmesão ralado fino (½ xícara + 2 colheres de sopa)",
                "2 colheres de sopa de salsinha picada",
                "Sal e pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Numa panela larga, aqueça o azeite e a manteiga em fogo médio. Refogue a cebola e o bacon, se usar, por 5 minutos, até a cebola ficar macia.",
            "Junte as ervilhas e duas conchas de caldo e cozinhe por 5 minutos. Se forem congeladas, cozinhe só 2 minutos.",
            "Junte o arroz e mexa por 1 minuto. Não há vinho nesta receita.",
            "Junte o caldo quente aos poucos, mexendo de vez em quando, por 16 a 18 minutos, até o arroz ficar al dente.",
            "O ponto é bem mais mole que o de um risoto: o arroz deve ficar solto num creme líquido, que se come de colher. Se precisar, junte mais caldo no fim.",
            "Desligue, junte a manteiga, o parmesão e a salsinha e mexa. Acerte o sal e a pimenta e sirva em pratos fundos.",
        ],
        notes=[
            ("Ervilha fresca", "Se usar ervilha fresca na vagem, compre cerca de 1 kg. Cozinhe as vagens vazias no caldo por 20 minutos e coe: o caldo fica com mais sabor de ervilha."),
            ("Vegetariano", "Sem o bacon, o prato é vegetariano. Para vegetarianos estritos, use queijo duro de coalho microbiano."),
        ],
        tip="Ervilha congelada é colhida e congelada no ponto, e é quase tão boa quanto a fresca. Não precisa descongelar.",
    ),
    dict(
        slug="camarao", left=["Segurança alimentar"],
        title="Risoto de camarão",
        tag="Risotto ai gamberi — caldo com as cascas, camarão no ponto",
        intro="O segredo é o caldo: as cascas e cabeças do camarão, douradas e cozidas no caldo de legumes, "
              "dão ao risoto sabor de mar. O camarão entra só no fim, para não endurecer.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "30 min"),
              ("Cozimento", "cerca de 25 min"), ("Nível", "Médio")],
        ingredients=[
            ("Camarão e caldo", [
                "500 g de camarão médio com casca e cabeça (rende cerca de 300 g limpo)",
                "15 ml de azeite (1 colher de sopa)",
                "1,3 litro de caldo de legumes (5½ xícaras), receita 01",
            ]),
            ("Risoto", [
                "30 ml de azeite (2 colheres de sopa)",
                "1 cebola pequena bem picada (cerca de 80 g)",
                "1 dente de alho picado",
                "320 g de arroz arbóreo ou carnaroli (1⅔ xícara)",
                "100 ml de vinho branco seco (⅓ de xícara + 1 colher de sopa)",
                "30 g de manteiga gelada (2 colheres de sopa)",
                "Raspas de 1 limão-siciliano e 2 colheres de sopa de salsinha",
                "Sal e pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Descasque os camarões, guardando cascas e cabeças. Retire a tripa das costas com a ponta de uma faca e leve os camarões limpos à geladeira.",
            "Numa panela, doure as cascas e cabeças no azeite em fogo alto por 3 minutos, mexendo. Junte o caldo, ferva e cozinhe em fogo baixo por 15 minutos. Coe e mantenha quente.",
            "Numa panela larga, refogue a cebola no azeite em fogo médio por 4 minutos. Junte o alho por 30 segundos e toste o arroz por 2 minutos, mexendo.",
            "Junte o vinho e mexa até evaporar. Junte o caldo quente, uma concha por vez, mexendo com frequência, por 14 minutos.",
            "Junte os camarões e continue por mais 3 a 4 minutos, até eles ficarem rosados e opacos por inteiro e o arroz al dente.",
            "Desligue, junte a manteiga, as raspas de limão e a salsinha e mexa com vigor. Acerte o sal e a pimenta e sirva na hora.",
        ],
        notes=[
            ("Segurança alimentar", "Camarão fresco tem cheiro de mar, nunca de amônia. Mantenha na geladeira até usar e cozinhe até ficar opaco por inteiro. Sobras: geladeira e consumo em até 1 dia."),
            ("Sem queijo", "Na Itália, risoto de frutos do mar não leva parmesão: o queijo cobre o sabor do camarão. A manteiga basta."),
            ("Erro comum", "Juntar o camarão cedo: ele encolhe e fica borrachudo. Bastam 3 a 4 minutos."),
        ],
        tip="Camarão congelado funciona bem: descongele na geladeira de um dia para o outro, ou no saco fechado sob água fria corrente; nunca em temperatura ambiente.",
    ),
    dict(
        slug="linguica", left=["Álcool"],
        title="Risoto de linguiça ao vinho tinto",
        tag="Risotto al vino rosso e salsiccia — rústico, de inverno",
        intro="Um risoto de cor violeta, cozido com vinho tinto e linguiça esfarelada, como se faz no Piemonte "
              "nos dias frios. Encorpado, pede um copo do mesmo vinho.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "15 min"),
              ("Cozimento", "cerca de 30 min"), ("Nível", "Médio")],
        ingredients=[
            ("Risoto", [
                "300 g de linguiça toscana sem a pele",
                "15 ml de azeite (1 colher de sopa)",
                "1 cebola pequena bem picada (cerca de 80 g)",
                "320 g de arroz arbóreo ou carnaroli (1⅔ xícara)",
                "250 ml de vinho tinto seco (1 xícara + 2 colheres de chá)",
                "1 litro de caldo de legumes ou de frango quente (4 xícaras + 2 colheres de sopa), receita 01",
                "1 ramo de alecrim",
            ]),
            ("Para finalizar", [
                "30 g de manteiga gelada (2 colheres de sopa)",
                "50 g de parmesão ralado fino (½ xícara + 2 colheres de sopa)",
                "Sal e pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Numa panela larga, aqueça o azeite em fogo médio-alto e doure a linguiça esfarelada com uma colher por 6 a 8 minutos, até ficar dourada e sem parte rosada.",
            "Baixe o fogo para médio, junte a cebola e o alecrim e refogue por 4 minutos.",
            "Junte o arroz e toste por 2 minutos, mexendo.",
            "Junte o vinho de uma vez e cozinhe, mexendo, até ser quase todo absorvido, por 4 a 5 minutos.",
            "Junte o caldo quente, uma concha por vez, mexendo com frequência, por 16 a 18 minutos, até o arroz ficar al dente e cremoso.",
            "Retire o alecrim. Desligue, junte a manteiga e o parmesão e mexa com vigor por 1 minuto. Acerte o sal e a pimenta.",
        ],
        notes=[
            ("Álcool", "O vinho cozinha bastante, mas não perde todo o álcool. Para crianças, gestantes e quem não bebe, prefira outro risoto do livro."),
            ("Linguiça", "Use linguiça toscana fresca, de porco. A linguiça defumada, como a calabresa, deixa o risoto salgado e com gosto de fumaça."),
            ("Erro comum", "Usar vinho muito tânico ou de má qualidade: o sabor concentra. Escolha um tinto seco e frutado, que você beberia."),
        ],
        tip="Prove antes de salgar: a linguiça e o parmesão já trazem bastante sal.",
    ),
    dict(
        slug="polenta", left=["Respingos"],
        title="Polenta cremosa",
        tag="Polenta morbida — mole, lisa e com parmesão",
        intro="A polenta mole é o prato-base do norte da Itália: fubá cozido devagar até ficar cremoso, servido como "
              "acompanhamento ou coberto com um molho. As receitas 10 a 12 partem dela.",
        meta=[("Rendimento", "4 porções (cerca de 1,2 kg)"), ("Preparo", "5 min"),
              ("Cozimento", "40 a 45 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Polenta", [
                "1,2 litro de água (5 xícaras)",
                "300 ml de leite (1¼ xícara)",
                "8 g de sal fino (1⅓ colher de chá)",
                "250 g de fubá para polenta, de moagem média (cerca de 1⅔ xícara)",
            ]),
            ("Para finalizar", [
                "40 g de manteiga (cerca de 3 colheres de sopa)",
                "50 g de parmesão ralado fino (½ xícara + 2 colheres de sopa)",
                "Pimenta-do-reino moída na hora",
            ]),
        ],
        steps=[
            "Numa panela grande de fundo grosso, aqueça a água, o leite e o sal até começar a ferver.",
            "Baixe o fogo para médio e despeje o fubá em chuva fina, mexendo sem parar com um batedor de arame, para não formar grumos (página 04).",
            "Quando engrossar, depois de 2 a 3 minutos, baixe o fogo para o mínimo e troque o batedor por uma colher de pau.",
            "Cozinhe por 40 a 45 minutos, com a panela semitampada, mexendo a cada 5 minutos e raspando o fundo e os cantos.",
            "Está pronta quando não tem mais gosto de fubá cru, se solta das laterais da panela e cai da colher em fio grosso. Se engrossar demais, junte água quente aos poucos.",
            "Desligue, junte a manteiga e o parmesão e misture. Acerte o sal e sirva logo, com pimenta moída na hora.",
        ],
        notes=[
            ("Respingos", "A polenta borbulhante espirra e queima. Mexa com colher de cabo longo, use luva e mantenha o rosto afastado da panela."),
            ("Fubá", "Use fubá próprio para polenta, de moagem média. O fubá mimoso, muito fino, empelota; a polenta pré-cozida fica pronta em 5 a 8 minutos, mas tem menos sabor."),
            ("Para firmar", "Para as receitas 11 e 12, use 1 litro de água e nada de leite com os mesmos 250 g de fubá: a polenta fica mais firme e pode ser cortada depois de fria."),
        ],
        tip="Polenta espera: tampada e em fogo mínimo, fica cremosa por até 30 minutos. Mexa e junte um pouco de água quente antes de servir.",
    ),
    dict(
        slug="ragu",
        title="Polenta com ragù de cogumelos",
        tag="Polenta con ragù di funghi — molho de cogumelos e tomate",
        intro="Polenta cremosa coberta com um ragù de cogumelos, tomate e vinho tinto, sem carne mas encorpado. "
              "No inverno, é a refeição completa das casas de montanha.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "20 min"),
              ("Cozimento", "45 min (junto com a polenta)"), ("Nível", "Fácil")],
        ingredients=[
            ("Ragù", [
                "500 g de cogumelos-de-paris e shiitake (sem os talos) picados grosseiramente",
                "45 ml de azeite (3 colheres de sopa)",
                "1 cebola média picada (cerca de 150 g)",
                "1 cenoura pequena picada fino (cerca de 80 g)",
                "2 dentes de alho picados",
                "100 ml de vinho tinto seco (⅓ de xícara + 1 colher de sopa)",
                "1 lata de tomate pelado picado (400 g)",
                "1 ramo de alecrim e 1 folha de louro",
                "6 g de sal fino (1 colher de chá) e pimenta-do-reino",
            ]),
            ("Para servir", [
                "1 receita de polenta cremosa (receita 09)",
                "Parmesão ralado a gosto",
            ]),
        ],
        steps=[
            "Comece a polenta (receita 09). Enquanto ela cozinha, prepare o ragù.",
            "Numa frigideira grande, aqueça 1 colher de sopa do azeite em fogo alto e doure metade dos cogumelos por 5 a 6 minutos, até a água secar; repita com mais 1 colher de sopa e o restante. Reserve.",
            "Na mesma frigideira, aqueça o restante do azeite em fogo médio e refogue a cebola e a cenoura por 6 minutos. Junte o alho por 1 minuto.",
            "Junte o vinho e deixe evaporar por 2 minutos.",
            "Junte o tomate, os cogumelos, o alecrim, o louro, o sal e a pimenta. Cozinhe em fogo baixo, semitampado, por 25 minutos, mexendo de vez em quando, até o molho engrossar.",
            "Retire o alecrim e o louro e acerte o sal. Sirva a polenta em pratos fundos, com o ragù por cima e parmesão a gosto.",
        ],
        notes=[
            ("Com carne", "Para uma versão com carne, use o ragù alla bolognese do Trattoria em Casa (Volume I, receita 08) sobre a polenta."),
            ("Conservação", "O ragù fica até 3 dias na geladeira e congela por 3 meses. Aqueça até ferver antes de servir."),
            ("Álcool", "Para crianças, gestantes e quem não bebe, troque o vinho por caldo de legumes."),
        ],
        tip="Sirva a polenta numa tábua de madeira, no centro da mesa, com o ragù por cima: é assim que se faz nas casas do norte da Itália.",
    ),
    dict(
        slug="grelhada",
        title="Polenta grelhada",
        tag="Polenta alla griglia — fatias firmes, douradas na chapa",
        intro="Polenta firme, esfriada numa forma, cortada em fatias e dourada na chapa até ficar crocante por fora "
              "e macia por dentro. Acompanha carnes e linguiças, ou vira aperitivo com uma cobertura.",
        meta=[("Rendimento", "12 fatias (4 a 6 porções)"), ("Preparo", "50 min + 30 min na chapa"),
              ("Descanso", "2 h para firmar"), ("Nível", "Fácil")],
        ingredients=[
            ("Polenta firme", [
                "1 litro de água (4 xícaras + 2 colheres de sopa)",
                "6 g de sal fino (1 colher de chá)",
                "250 g de fubá para polenta, de moagem média (cerca de 1⅔ xícara)",
                "30 g de manteiga (2 colheres de sopa)",
                "40 g de parmesão ralado fino (½ xícara)",
            ]),
            ("Para grelhar e servir", [
                "45 ml de azeite (3 colheres de sopa)",
                "Cobertura a gosto: ragù de cogumelos (receita 10), caponata ou pimentões assados (Volume IV, receitas 03 e 04), ou queijo gorgonzola",
            ]),
        ],
        steps=[
            "Unte com azeite uma forma retangular de cerca de 20 × 30 cm.",
            "Cozinhe a polenta com a água, o sal e o fubá como na receita 09, passos 1 a 5, sem leite. Ela fica mais grossa: mexa com mais frequência.",
            "Desligue, junte a manteiga e o parmesão e despeje na forma, alisando a superfície com uma espátula molhada. A camada deve ter cerca de 1,5 cm.",
            "Deixe esfriar 30 minutos e leve à geladeira por pelo menos 1h30, até firmar.",
            "Desenforme e corte em 12 pedaços (3 faixas no lado de 20 cm e 4 no de 30 cm).",
            "Aqueça uma frigideira canelada ou chapa em fogo médio-alto, pincele as fatias com azeite e grelhe por 4 a 5 minutos de cada lado, sem mexer, até ficarem douradas e com marcas.",
            "Sirva quente, pura ou com a cobertura escolhida.",
        ],
        notes=[
            ("Erro comum", "Virar a fatia cedo: ela gruda e quebra. Espere a crosta se formar; quando estiver pronta, ela se solta sozinha."),
            ("No forno", "Sem chapa: asse as fatias pinceladas com azeite numa assadeira forrada, a 220 °C, por 25 a 30 minutos, virando na metade."),
            ("Conservação", "A polenta firme, ainda sem grelhar, fica até 4 dias na geladeira, coberta com filme. Grelhe só na hora. O gorgonzola costuma ser desaconselhado na gravidez."),
        ],
        tip="Sobrou polenta cremosa? Espalhe na forma ainda quente: no dia seguinte, vira polenta grelhada.",
    ),
    dict(
        slug="forno",
        title="Polenta ao forno gratinada",
        tag="Polenta pasticciata — em camadas, com molho de tomate e queijos",
        intro="Camadas de polenta firme, molho de tomate e queijos, gratinadas no forno como uma lasanha sem massa. "
              "Prato de domingo, que pode ser montado na véspera.",
        meta=[("Rendimento", "6 porções"), ("Preparo", "20 min + polenta firme (receita 11)"),
              ("Forno", "30 a 35 min a 200 °C"), ("Nível", "Médio")],
        ingredients=[
            ("Polenta firme", [
                "1 receita de polenta firme da receita 11, despejada em forma de 20 × 30 cm e firmada na geladeira",
            ]),
            ("Molho e queijos", [
                "600 ml de molho de tomate (2½ xícaras)",
                "250 g de muçarela ralada grossa (2½ xícaras)",
                "60 g de parmesão ralado fino (¾ de xícara)",
                "10 folhas de manjericão",
                "15 ml de azeite (1 colher de sopa)",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 200 °C. Unte com o azeite um refratário de cerca de 20 × 30 cm.",
            "Desenforme a polenta firme e corte em 12 retângulos. Com uma faca longa deitada, corte cada retângulo ao meio na espessura, formando 24 fatias finas, de cerca de 0,7 cm.",
            "Espalhe um terço do molho no fundo do refratário e cubra com 12 fatias de polenta, lado a lado, sem sobrepor.",
            "Cubra com mais um terço do molho, metade da muçarela, metade do parmesão e as folhas de manjericão.",
            "Faça mais uma camada com as 12 fatias restantes, o restante do molho, da muçarela e do parmesão.",
            "Asse por 30 a 35 minutos, até o molho borbulhar nas bordas e o queijo dourar.",
            "Descanse 10 minutos antes de cortar, para as camadas firmarem.",
        ],
        notes=[
            ("Molho de tomate", "Use o Pomodoro e basilico do Trattoria em Casa (Volume I, receita 07) ou um molho de tomate pronto de boa qualidade."),
            ("Para adiantar", "Monte até a véspera e guarde coberto na geladeira. Asse 10 a 15 minutos a mais, até ficar bem quente no centro."),
            ("Conservação", "Assada, fica até 3 dias na geladeira. Reaqueça no forno a 180 °C por 20 minutos, até ficar bem quente no centro."),
        ],
        tip="Para uma versão mais rica, troque metade do molho de tomate pelo ragù de cogumelos da receita 10.",
    ),
]

# Planejamento: (receita, quando preparar, conservação)
PLANNING = [
    ("Caldo de legumes", "Até 3 dias antes, ou congelado", "Geladeira 3 dias; congelador 3 meses"),
    ("Risoto alla milanese", "Na hora de servir", "Melhor na hora; sobras 1 dia"),
    ("Risoto de cogumelos", "Cogumelos dourados até 1 dia antes", "Melhor na hora; sobras 1 dia"),
    ("Risoto de abóbora", "Abóbora assada na véspera", "Melhor na hora; sobras 1 dia"),
    ("Risoto de limão", "Na hora de servir", "Melhor na hora; sobras 1 dia"),
    ("Risi e bisi", "Na hora de servir", "Melhor na hora; sobras 1 dia"),
    ("Risoto de camarão", "Caldo de cascas até 1 dia antes", "Na hora; sobras 1 dia"),
    ("Risoto de linguiça", "Na hora de servir", "Melhor na hora; sobras 1 dia"),
    ("Polenta cremosa", "Até 30 min antes, tampada", "Sobras: geladeira até 3 dias; viram polenta grelhada"),
    ("Ragù de cogumelos", "Até 3 dias antes", "Geladeira 3 dias; congela 3 meses"),
    ("Polenta grelhada", "Polenta firme até 4 dias antes", "Grelhe na hora"),
    ("Polenta ao forno", "Monte na véspera; asse no dia", "Geladeira, até 3 dias"),
]

# Harmonização: (prato, sugestão, acompanha, por quê)
PAIRINGS = [
    ("Risoto alla milanese", "Prato único ou com carne", "Ossobuco, carne assada",
     "É o par clássico de Milão: o açafrão combina com o molho da carne."),
    ("Risotos de legumes", "Abóbora, cogumelos, ervilha", "Salada verde, vinho branco",
     "Uma salada ácida equilibra a cremosidade do risoto."),
    ("Risotos leves", "Limão, camarão", "Peixe grelhado (com o de limão), vinho branco ou espumante",
     "Sabores frescos que não disputam com o peixe."),
    ("Risoto de linguiça", "Prato de inverno", "Vinho tinto, verduras refogadas",
     "Pede um tinto do mesmo estilo usado na panela."),
    ("Polenta cremosa", "Base para molhos", "Ragù, cogumelos, queijos, carnes de panela",
     "Neutra e cremosa, recolhe o molho como o pão."),
    ("Polenta grelhada", "Acompanhamento ou aperitivo", "Linguiça, churrasco, antepastos do Volume IV",
     "Crocante por fora, substitui o pão ou a batata."),
]

# Fotos (geradas na KIE, google/nano-banana): mesmo cenário dos volumes anteriores.
STYLE = ("appetizing editorial food photography, warm golden side light, served on a cream ceramic plate with a thin gold rim, "
         "a dusty rose linen napkin, dark rustic wooden table, shallow depth of field, Italian home cooking, "
         "no text, no letters, no logos, no brand labels, no people, no hands")
PHOTOS = {
    "00_capa": ("2:3", "A cream shallow bowl with a thin gold rim filled with creamy golden saffron risotto topped with grated parmesan, "
                "beside it a wooden board with creamy yellow polenta topped with a mushroom and tomato ragù, a wooden spoon, "
                "a small bowl of grated parmesan and a sprig of sage on a dark wooden table, dusty rose linen napkin"),
    "01_caldo": ("3:2", "A large pot of golden clear vegetable broth with halved onions, carrot chunks, celery stalks with leaves, "
                 "a halved tomato, parsley stems and a bay leaf, a ladle pouring broth into a cream bowl with a thin gold rim"),
    "02_milanese": ("3:2", "Creamy bright golden yellow saffron risotto, glossy and loose, in a cream shallow bowl with a thin gold rim, "
                    "a few saffron threads and grated parmesan on top"),
    "03_funghi": ("3:2", "Creamy risotto with golden browned sliced button and shiitake mushrooms on top, chopped parsley and thyme, "
                  "in a cream shallow bowl with a thin gold rim"),
    "04_abobora": ("3:2", "Creamy orange pumpkin risotto with roasted golden pumpkin cubes and crispy fried sage leaves on top, "
                   "in a cream shallow bowl with a thin gold rim"),
    "05_limao": ("3:2", "Creamy pale risotto topped with fresh lemon zest and a few small basil leaves, a halved yellow lemon beside it, "
                 "in a cream shallow bowl with a thin gold rim"),
    "06_ervilha": ("3:2", "Venetian risi e bisi: soupy rice with many bright green peas in a loose creamy broth, chopped parsley, "
                   "in a cream deep bowl with a thin gold rim, a spoon beside it"),
    "07_camarao": ("3:2", "Creamy risotto topped with pink cooked shrimp, lemon zest and chopped parsley, "
                   "in a cream shallow bowl with a thin gold rim, no cheese"),
    "08_linguica": ("3:2", "Creamy purple-red risotto cooked with red wine and crumbled browned Italian sausage, a small fresh rosemary sprig as garnish, "
                    "in a cream shallow bowl with a thin gold rim, a glass of red wine in the background"),
    "09_polenta": ("3:2", "Soft creamy yellow polenta with melting butter and grated parmesan and black pepper, "
                   "in a cream shallow bowl with a thin gold rim, a wooden spoon beside it"),
    "10_ragu": ("3:2", "Creamy yellow polenta topped with a thick mushroom and tomato ragù, a rosemary sprig and grated parmesan, "
                "in a cream shallow bowl with a thin gold rim"),
    "11_grelhada": ("3:2", "Rectangular slices of firm grilled polenta with golden crust and dark grill marks, "
                    "some topped with mushroom ragù, on a cream plate with a thin gold rim"),
    "12_forno": ("3:2", "A rectangular ceramic baking dish of baked layered polenta with bubbling tomato sauce and golden melted mozzarella, "
                 "one square portion served on a cream plate with a thin gold rim showing the layers, basil leaves"),
}
