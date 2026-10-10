# -*- coding: utf-8 -*-
"""Conteúdo das receitas de Dolci della Nonna."""

RECIPES = [
    dict(
        slug="tiramisu", left=["Sem mascarpone"],
        title="Tiramisù",
        tag="Mascarpone, café e cacau — sem ovo cru",
        intro="Camadas de biscoito embebido em café e creme de mascarpone fazem deste clássico do Vêneto um dos grandes doces italianos. "
              "Nesta versão, as gemas são cozidas com o açúcar em banho-maria antes de entrar no creme.",
        meta=[("Rendimento", "8 porções (refratário de 20 × 30 cm)"), ("Preparo", "40 min"),
              ("Geladeira", "mínimo 6 h (ideal 12 h)"), ("Nível", "Médio")],
        ingredients=[
            ("Creme", [
                "4 gemas (cerca de 80 g)",
                "100 g de açúcar (½ xícara + 1 colher de sopa)",
                "45 ml de água ou vinho Marsala (3 colheres de sopa)",
                "500 g de mascarpone gelado",
                "200 ml de creme de leite fresco gelado (cerca de ¾ de xícara + 1 colher de sopa)",
            ]),
            ("Montagem", [
                "300 ml de café coado forte, frio (1¼ xícara)",
                "200 g de biscoito tipo champanhe (cerca de 30 unidades)",
                "2 colheres de sopa de cacau em pó (cerca de 12 g)",
            ]),
        ],
        steps=[
            "Em uma tigela refratária, misture as gemas, o açúcar e a água (ou o Marsala). Apoie a tigela sobre uma panela com água em fervura baixa, sem que o fundo encoste na água.",
            "Cozinhe mexendo sempre com um batedor de arame, sem parar, até a mistura atingir 70 °C no termômetro culinário, cerca de 6–8 minutos. Ela engrossa, clareia e cobre as costas da colher: esses sinais mostram a textura, mas só o termômetro confirma os 70 °C.",
            "Retire do banho-maria e continue batendo por 3–4 minutos, até amornar. Deixe esfriar completamente.",
            "Em outra tigela, mexa o mascarpone gelado apenas até ficar liso. Junte o creme de gemas frio e misture delicadamente.",
            "Bata o creme de leite fresco gelado até o ponto de chantili mole e incorpore à mistura de mascarpone com movimentos de baixo para cima.",
            "Passe rapidamente cada biscoito no café (1 segundo de cada lado) e forre o fundo do refratário. Cubra com metade do creme.",
            "Repita a camada de biscoitos e finalize com o restante do creme. Alise, cubra com filme e leve à geladeira por no mínimo 6 horas.",
            "Na hora de servir, polvilhe o cacau por uma peneira fina.",
        ],
        notes=[
            ("Segurança alimentar", "Esta receita não usa ovo cru: as gemas são aquecidas com o açúcar até 70 °C, confirmados com termômetro culinário. Mantenha o tiramisù na geladeira e consuma em até 3 dias."),
            ("Sem mascarpone", "Substitua os 500 g de mascarpone por 350 g de cream cheese em temperatura ambiente e acrescente 150 ml de creme de leite fresco aos 200 ml da receita (total de 350 ml, batidos em chantili)."),
        ],
        tip="O segredo está na mão leve: mexa o mascarpone gelado só até ficar liso, porque batido demais ele talha. Deixe que o chantili traga a leveza.",
    ),
    dict(
        slug="pannacotta",
        title="Panna cotta",
        tag="Com calda de frutas vermelhas",
        intro="Creme cozido do Piemonte, delicado e macio na colher. "
              "A calda de frutas vermelhas traz o contraste perfeito entre suavidade e frescor.",
        meta=[("Rendimento", "6 taças de 120 ml"), ("Preparo", "25 min"),
              ("Geladeira", "mínimo 4 h (ideal de um dia para o outro)"), ("Nível", "Fácil")],
        ingredients=[
            ("Creme", [
                "8 g de gelatina em pó incolor e sem sabor (cerca de 2½ colheres de chá, ou ⅔ de um envelope de 12 g)",
                "45 ml de água fria (3 colheres de sopa)",
                "500 ml de creme de leite fresco (cerca de 2 xícaras)",
                "150 ml de leite integral (½ xícara + 2 colheres de sopa)",
                "70 g de açúcar (⅓ de xícara + 1 colher de sopa)",
                "1 colher de chá de essência de baunilha",
            ]),
            ("Calda", [
                "300 g de frutas vermelhas frescas ou congeladas (cerca de 2 xícaras)",
                "60 g de açúcar (⅓ de xícara)",
                "1 colher de sopa de suco de limão",
            ]),
        ],
        steps=[
            "Polvilhe a gelatina sobre a água fria em uma tigela pequena e deixe hidratar por 5 minutos, sem mexer.",
            "Em uma panela, aqueça o creme de leite, o leite e o açúcar em fogo médio, mexendo, até começar a sair vapor e surgirem pequenas bolhas na borda. Não deixe ferver.",
            "Desligue o fogo, junte a gelatina hidratada e mexa por 1 minuto, até dissolver totalmente. Acrescente a baunilha.",
            "Passe por uma peneira e distribua em 6 taças. Deixe amornar, cubra e leve à geladeira por no mínimo 4 horas.",
            "Calda: leve as frutas, o açúcar e o limão ao fogo médio por 8–10 minutos, mexendo de vez em quando, até as frutas desmancharem e a calda engrossar levemente. Esfrie.",
            "Sirva a panna cotta gelada com a calda fria por cima.",
        ],
        notes=[
            ("Para desenformar", "Use 10 g de gelatina, despeje em forminhas untadas com fio de óleo neutro e, na hora de servir, mergulhe a base em água quente por 5 segundos antes de virar no prato."),
        ],
        tip="A delicadeza está no equilíbrio: com 8 g de gelatina para esta quantidade de líquido, ela firma na taça e continua macia, tremendo de leve na colher. Gelatina demais a deixa borrachuda.",
    ),
    dict(
        slug="nonna",
        title="Torta della Nonna",
        tag="Massa frola e creme de limão-siciliano",
        intro="A torta de domingo da Toscana, feita para reunir a família: duas camadas de massa frola amanteigada, um creme "
              "perfumado com limão-siciliano e o toque crocante dos pinoli.",
        meta=[("Rendimento", "10 fatias (forma de 22 cm, fundo removível)"), ("Preparo", "1 h + 30 min de descanso"),
              ("Forno", "180 °C, 40–45 min"), ("Nível", "Médio")],
        ingredients=[
            ("Massa frola", [
                "350 g de farinha de trigo (cerca de 3 xícaras rasas)",
                "120 g de açúcar (⅔ de xícara)",
                "1 pitada de sal",
                "raspas de 1 limão-siciliano",
                "175 g de manteiga sem sal gelada, em cubos",
                "1 ovo + 1 gema",
            ]),
            ("Creme de limão-siciliano", [
                "500 ml de leite integral (cerca de 2 xícaras)",
                "raspas de 1 limão-siciliano (só a parte amarela)",
                "4 gemas",
                "120 g de açúcar (⅔ de xícara)",
                "45 g de amido de milho (cerca de 5 colheres de sopa rasas)",
                "1 colher de sopa de manteiga (15 g)",
            ]),
            ("Cobertura", [
                "30 g de pinoli ou 40 g de amêndoas laminadas",
                "açúcar de confeiteiro para polvilhar",
            ]),
        ],
        steps=[
            "Massa: misture farinha, açúcar, sal e raspas. Junte a manteiga e esfarele com as pontas dos dedos até virar uma farofa. Acrescente o ovo e a gema e una sem sovar. Divida em duas partes (⅔ e ⅓), embrulhe em filme e leve à geladeira por 30 minutos.",
            "Creme: aqueça o leite com as raspas até quase ferver. Em uma tigela, misture as gemas, o açúcar e o amido.",
            "Despeje o leite quente aos poucos sobre as gemas, mexendo. Volte tudo à panela e cozinhe em fogo médio, mexendo sem parar, até ferver e engrossar. Cozinhe mais 1 minuto. Junte a manteiga, cubra com filme encostado no creme e esfrie.",
            "Preaqueça o forno a 180 °C. Abra a parte maior da massa entre dois plásticos e forre o fundo e a lateral da forma. Fure o fundo com um garfo.",
            "Espalhe o creme frio. Abra a parte menor da massa, cubra a torta e feche bem as bordas.",
            "Pincele a superfície com um pouco de água, espalhe os pinoli ou as amêndoas e pressione levemente.",
            "Asse por 40–45 minutos, até dourar. Se a cobertura escurecer rápido demais, cubra com papel-alumínio nos últimos 10 minutos.",
            "Deixe esfriar por 2 horas antes de desenformar. Polvilhe açúcar de confeiteiro na hora de servir.",
        ],
        notes=[],
        tip="Para perfumar o creme, use só as raspas amarelas do limão-siciliano: a parte branca amarga. E não junte o suco ao leite, porque ele talha.",
    ),
    dict(
        slug="caprese",
        title="Torta caprese",
        tag="Chocolate e amêndoas, sem farinha de trigo",
        intro="De Capri para a sua mesa: um bolo intenso de chocolate e amêndoas, úmido por dentro e de casquinha fina por cima. "
              "A estrutura vem da farinha de amêndoas e dos ovos batidos: a receita não leva farinha de trigo.",
        meta=[("Rendimento", "10 fatias (forma de 22 cm)"), ("Preparo", "25 min"),
              ("Forno", "170 °C, 35–40 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "200 g de chocolate meio amargo (50% a 60% de cacau), picado",
                "150 g de manteiga sem sal",
                "4 ovos, gemas e claras separadas",
                "150 g de açúcar (¾ de xícara + 1 colher de sopa), dividido em duas partes",
                "200 g de farinha de amêndoas (cerca de 2 xícaras)",
                "1 pitada de sal",
            ]),
            ("Para servir", [
                "açúcar de confeiteiro para polvilhar",
                "chantili sem açúcar ou sorvete de creme (opcional)",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 170 °C. Unte a forma com manteiga e forre o fundo com papel-manteiga.",
            "Derreta o chocolate com a manteiga em banho-maria ou no micro-ondas, em intervalos de 30 segundos, mexendo entre eles. Deixe amornar.",
            "Bata as gemas com metade do açúcar por cerca de 3 minutos, até clarear. Junte o chocolate morno e misture.",
            "Acrescente a farinha de amêndoas e o sal e misture até ficar homogêneo. A massa fica densa.",
            "Em outra tigela, limpa e seca, bata as claras até espumar, junte o restante do açúcar e bata até picos moles.",
            "Misture ⅓ das claras na massa para soltá-la e incorpore o restante delicadamente, de baixo para cima.",
            "Despeje na forma e asse por 35–40 minutos. Está pronta quando a borda estiver firme e um palito no centro sair com migalhas úmidas, sem massa líquida.",
            "Deixe esfriar na forma por 30 minutos antes de desenformar. Polvilhe açúcar de confeiteiro.",
        ],
        notes=[
            ("Sem farinha de amêndoas", "Processe 200 g de amêndoas sem pele com 2 colheres de sopa do açúcar da receita, em pulsos curtos, até virar uma farinha. Sem o açúcar e sem pulsar, a amêndoa vira pasta."),
        ],
        tip="Não se preocupe se o centro baixar um pouco ao esfriar ou a superfície rachar. É assim que a caprese é: densa e úmida por dentro, quebradiça por cima.",
    ),
    dict(
        slug="cantucci",
        title="Cantucci",
        tag="Biscotti de amêndoas, assados duas vezes",
        intro="Crocantes, dourados e cheios de amêndoas, os biscoitos de Prato duram semanas no pote e foram feitos para "
              "mergulhar no café ou em um cálice de vinho de sobremesa. A segunda assada é o que dá a crocância.",
        meta=[("Rendimento", "cerca de 40 unidades"), ("Preparo", "20 min + 10 min de descanso"),
              ("Forno", "180 °C por 25 min, depois 150 °C por 20 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "250 g de farinha de trigo (cerca de 2 xícaras)",
                "150 g de açúcar (¾ de xícara + 1 colher de sopa)",
                "1 colher de chá de fermento químico em pó",
                "1 pitada de sal",
                "raspas de 1 laranja",
                "2 ovos + 1 gema (reserve a clara)",
                "1 colher de chá de essência de baunilha",
                "150 g de amêndoas inteiras com pele (cerca de 1 xícara)",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 180 °C e forre uma assadeira com papel-manteiga.",
            "Em uma tigela, misture farinha, açúcar, fermento, sal e raspas de laranja.",
            "Junte os ovos, a gema e a baunilha e misture com uma colher, depois com as mãos, até formar uma massa firme e levemente pegajosa. Incorpore as amêndoas.",
            "Com as mãos enfarinhadas, divida a massa em dois rolos de cerca de 5 cm de largura e 2 cm de altura. Coloque na assadeira com 8 cm de distância entre eles.",
            "Pincele com a clara reservada, levemente batida. Asse por 25 minutos, até ficarem firmes e dourados.",
            "Retire e deixe descansar 10 minutos. Baixe o forno para 150 °C.",
            "Com faca de serra, corte os rolos na diagonal em fatias de 1 a 1,5 cm. Arrume as fatias deitadas na assadeira.",
            "Asse por 10 minutos, vire as fatias e asse mais 10 minutos, até secarem. Eles terminam de endurecer ao esfriar.",
        ],
        notes=[
            ("Conservação", "Depois de totalmente frios, guarde em pote hermético, longe de umidade e calor, em temperatura ambiente, por até 3 semanas."),
        ],
        tip="Corte os rolos ainda mornos, depois do descanso, com faca de serra e movimentos suaves, sem pressionar. Assim cada fatia mantém as amêndoas no lugar: frios, eles esfarelam; quentes demais, amassam.",
    ),
    dict(
        slug="affogato",
        title="Affogato al caffè",
        tag="Sorvete afogado em café quente",
        intro="A sobremesa mais rápida do livro: uma bola de sorvete de creme e uma dose de café bem quente "
              "despejada na hora, à mesa. É a maneira mais simples de transformar o café do fim do jantar em sobremesa.",
        meta=[("Rendimento", "4 taças"), ("Preparo", "5 min"),
              ("Taças", "15 min no congelador, antes"), ("Nível", "Fácil")],
        ingredients=[
            ("Affogato", [
                "4 bolas de sorvete de creme ou baunilha (cerca de 70 g cada)",
                "4 doses de café espresso (30–40 ml cada) ou 200 ml de café coado bem forte",
                "4 cantucci (opcional, para acompanhar)",
            ]),
            ("Versão sem café, para crianças", [
                "4 bolas de sorvete de creme",
                "100 g de chocolate ao leite ou meio amargo, picado",
                "100 ml de creme de leite fresco ou leite integral (cerca de ⅓ de xícara + 1 colher de sopa)",
            ]),
        ],
        steps=[
            "Coloque as taças ou copos baixos no congelador por 15 minutos.",
            "Prepare o café. No coado, use 2 colheres de sopa de pó para cada 100 ml de água: o café precisa ser forte para não ficar aguado sobre o sorvete.",
            "Distribua as bolas de sorvete nas taças geladas.",
            "Leve as taças à mesa e despeje o café bem quente sobre o sorvete diante de cada pessoa. Sirva imediatamente, com colher e um cantucci ao lado.",
            "Versão sem café: aqueça o creme de leite até sair vapor, desligue, junte o chocolate e espere 1 minuto. Mexa até ficar liso.",
            "Despeje a calda de chocolate quente sobre o sorvete, no lugar do café, e sirva na hora.",
        ],
        notes=[
            ("Sobre a versão infantil", "Ela não leva café. O chocolate tem naturalmente um pouco de cafeína, bem menos que o café; para crianças pequenas, prefira chocolate ao leite, ou troque a calda pela calda de frutas vermelhas da panna cotta."),
            ("Para adultos que evitam cafeína", "Use café descafeinado, preparado do mesmo jeito."),
        ],
        tip="Sirva diante dos convidados, uma taça por vez. O encontro do café quente com o sorvete gelado dura poucos segundos, e é isso que torna cada colherada especial.",
    ),
    dict(
        slug="zabaione",
        title="Zabaione com frutas",
        tag="Creme aerado de gemas, cozido em banho-maria",
        intro="Gemas, açúcar e vinho batidos sobre o vapor até virarem uma espuma morna e brilhante. "
              "Servido ainda morno sobre frutas frescas, une a leveza do creme ao frescor das frutas.",
        meta=[("Rendimento", "4 taças"), ("Preparo", "20 min"),
              ("Servir", "na hora, ainda morno"), ("Nível", "Médio")],
        ingredients=[
            ("Zabaione", [
                "4 gemas (cerca de 80 g)",
                "60 g de açúcar (⅓ de xícara)",
                "120 ml de vinho Marsala ou vinho do Porto (½ xícara)",
            ]),
            ("Versão sem álcool", [
                "troque o vinho por 120 ml de suco de uva integral tinto + 1 colher de sopa de suco de limão",
                "reduza o açúcar para 40 g (3 colheres de sopa), porque o suco já é doce",
            ]),
            ("Para servir", [
                "400 g de frutas frescas: morangos, uvas sem semente, pêssego ou frutas vermelhas, em pedaços",
            ]),
        ],
        steps=[
            "Distribua as frutas em 4 taças e reserve.",
            "Em uma tigela refratária, misture as gemas e o açúcar com o batedor de arame até clarear. Junte o vinho (ou o suco com limão).",
            "Apoie a tigela sobre uma panela com água em fervura baixa, sem que o fundo encoste na água.",
            "Bata sem parar, raspando as laterais, até a mistura triplicar de volume, ficar espessa e atingir 70 °C no termômetro culinário, cerca de 8–10 minutos. A fita grossa que demora a sumir indica a textura, mas a temperatura deve ser confirmada no termômetro.",
            "Retire do banho-maria e bata mais 30 segundos fora do fogo.",
            "Despeje o zabaione morno sobre as frutas e sirva imediatamente.",
        ],
        notes=[
            ("Segurança alimentar", "As gemas precisam chegar a 70 °C, confirmados com termômetro culinário, sempre mexendo. Não sirva a mistura antes disso."),
            ("Sobre o álcool", "A 70 °C o vinho não evapora por completo. Para crianças, gestantes e quem não bebe, faça a versão com suco de uva."),
        ],
        tip="O segredo é a paciência: água em fervura suave e o batedor sempre em movimento. Fervura forte cozinha as gemas nas bordas e forma grumos.",
    ),
    dict(
        slug="crostata",
        title="Crostata di marmellata",
        tag="Torta de geleia com treliça",
        intro="A torta de lanche das casas italianas: massa frola amanteigada, geleia de frutas e uma treliça dourada "
              "que convida a cortar mais uma fatia. Fica melhor no dia seguinte.",
        meta=[("Rendimento", "10 fatias (forma de 24 cm, fundo removível)"), ("Preparo", "30 min + 30 min de descanso"),
              ("Forno", "180 °C, 35–40 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa frola", [
                "300 g de farinha de trigo (2½ xícaras)",
                "100 g de açúcar (½ xícara + 1 colher de sopa)",
                "½ colher de chá de fermento químico em pó",
                "1 pitada de sal",
                "raspas de 1 limão",
                "150 g de manteiga sem sal gelada, em cubos",
                "1 ovo + 1 gema",
            ]),
            ("Recheio", [
                "350 g de geleia de fruta firme: damasco, frutas vermelhas, morango ou goiaba (cerca de 1 xícara)",
            ]),
            ("Para servir", [
                "açúcar de confeiteiro para polvilhar (opcional)",
            ]),
        ],
        steps=[
            "Misture farinha, açúcar, fermento, sal e raspas. Junte a manteiga e esfarele com as pontas dos dedos até virar uma farofa.",
            "Acrescente o ovo e a gema e una sem sovar, só até formar uma bola. Separe ⅓ da massa para a treliça. Embrulhe as duas partes em filme e leve à geladeira por 30 minutos.",
            "Preaqueça o forno a 180 °C. Abra a parte maior entre dois plásticos, com cerca de 4 mm de espessura, e forre a forma, fundo e lateral. Fure o fundo com um garfo.",
            "Mexa a geleia para soltá-la e espalhe sobre a massa, deixando 1 cm livre na borda.",
            "Abra a massa reservada e corte tiras de 1,5 cm. Disponha-as em diagonal sobre a geleia, cruzando em treliça. Pressione as pontas na borda.",
            "Asse por 35–40 minutos, até a massa ficar dourada e a geleia borbulhar nas aberturas.",
            "Deixe esfriar completamente na forma, pelo menos 1 hora, antes de desenformar e cortar. A geleia firma ao esfriar. Se quiser, polvilhe açúcar de confeiteiro na hora de servir.",
        ],
        notes=[
            ("Mesma técnica, outra medida", "Usa a mesma técnica de massa frola da Torta della Nonna, em proporções diferentes e com uma pitada de fermento, para ficar mais macia."),
        ],
        tip="Se a massa rachar ao forrar a forma, não se preocupe nem abra de novo: remende com pedacinhos de massa, pressionando com os dedos. Massa frola trabalhada demais fica dura.",
    ),
    dict(
        slug="budino",
        title="Budino al cioccolato",
        tag="Pudim cremoso de chocolate, de panela",
        intro="Um creme de chocolate cozido na panela, sem forno nem banho-maria: engrossado com amido e firmado "
              "na geladeira, fica liso, denso e aveludado na colher.",
        meta=[("Rendimento", "6 taças de cerca de 125 ml"), ("Preparo", "20 min"),
              ("Geladeira", "mínimo 3 h"), ("Nível", "Fácil")],
        ingredients=[
            ("Creme", [
                "600 ml de leite integral (2½ xícaras)",
                "100 g de açúcar (½ xícara + 1 colher de sopa)",
                "30 g de cacau em pó (cerca de 5 colheres de sopa)",
                "35 g de amido de milho (cerca de 4 colheres de sopa rasas)",
                "1 pitada de sal",
                "100 g de chocolate meio amargo, picado",
                "1 colher de sopa de manteiga (15 g)",
                "1 colher de chá de essência de baunilha",
            ]),
            ("Para servir (opcional)", [
                "chantili sem açúcar, raspas de chocolate ou cantucci triturado",
            ]),
        ],
        steps=[
            "Em uma panela, fora do fogo, misture o açúcar, o cacau, o amido e o sal.",
            "Junte cerca de 150 ml do leite frio e mexa com o batedor de arame até não restar nenhum grumo. Acrescente o restante do leite.",
            "Leve ao fogo médio, mexendo sem parar e raspando o fundo, até ferver e engrossar, cerca de 8 minutos.",
            "Abaixe o fogo e cozinhe por mais 2 minutos, ainda mexendo: o amido precisa desse tempo para firmar.",
            "Desligue o fogo, junte o chocolate picado, a manteiga e a baunilha e mexa até ficar liso e brilhante.",
            "Distribua nas taças, cubra com filme encostado na superfície (para não criar película) e leve à geladeira por no mínimo 3 horas.",
        ],
        notes=[
            ("Para desenformar", "Aumente o amido para 45 g, cozinhe da mesma forma e despeje em forminhas levemente untadas. Na geladeira por 4 horas."),
        ],
        tip="Dissolva o amido no leite ainda frio, antes de esquentar. Esse pequeno cuidado garante um creme liso do começo ao fim: amido em leite quente empelota.",
    ),
    dict(
        slug="cannoli",
        title="Cannoli em taça",
        tag="Creme de ricota, laranja e chocolate — sem fritura",
        intro="Inspirada no cannolo siciliano, esta versão em taça reúne creme de ricota com raspas de laranja, "
              "gotas de chocolate e casquinha crocante triturada no lugar da massa frita.",
        meta=[("Rendimento", "6 taças"), ("Preparo", "20 min + 1 h para drenar a ricota"),
              ("Geladeira", "1 h para o creme"), ("Nível", "Fácil")],
        ingredients=[
            ("Creme de ricota", [
                "500 g de ricota fresca",
                "80 g de açúcar de confeiteiro (⅔ de xícara)",
                "raspas de 1 laranja",
                "1 colher de chá de essência de baunilha",
                "½ colher de chá de canela em pó (opcional)",
                "100 ml de creme de leite fresco gelado (⅓ de xícara + 1 colher de sopa)",
                "60 g de gotas de chocolate meio amargo (⅓ de xícara) + um pouco para decorar",
            ]),
            ("Crocante", [
                "5 casquinhas de sorvete (cerca de 60 g) ou 80 g de biscoito tipo waffle",
                "30 g de pistache sem sal picado (opcional)",
            ]),
        ],
        steps=[
            "Coloque a ricota em uma peneira forrada com papel-toalha, sobre uma tigela, e deixe drenar na geladeira por 1 hora (ou de um dia para o outro).",
            "Passe a ricota drenada pela peneira, apertando com uma colher, ou bata no processador por 1 minuto, até ficar lisa.",
            "Misture a ricota com o açúcar de confeiteiro, as raspas de laranja, a baunilha e a canela.",
            "Bata o creme de leite fresco gelado até o ponto de chantili e incorpore delicadamente ao creme de ricota. Junte as gotas de chocolate.",
            "Cubra e leve à geladeira por 1 hora para firmar.",
            "Triture grosseiramente as casquinhas ou os biscoitos, com as mãos ou dentro de um saco plástico com o rolo de massa.",
            "Na hora de servir, monte as taças: uma camada de crocante, uma de creme, mais crocante e creme. Finalize com gotas de chocolate, raspas de laranja e, se quiser, o pistache.",
        ],
        notes=[
            ("Antecedência", "O creme pode ser feito até 2 dias antes. Monte as taças só na hora, para o crocante não amolecer."),
        ],
        tip="Uma boa drenagem faz toda a diferença: o soro da ricota é o que amolece o creme. Não pule essa etapa, é ela que deixa o creme firme na colher.",
    ),
]

PAIRINGS = [
    ("Massas com molho de tomate",
     "Pomodoro, arrabbiata e molhos de tomate em geral: ácidos e leves.",
     "Tiramisù, Torta caprese, Budino al cioccolato",
     "O prato deixa espaço para uma sobremesa mais rica. Chocolate e café fecham bem a acidez do tomate."),
    ("Molhos cremosos e de queijo",
     "Molhos de manteiga, creme, queijos e carbonara: ricos e untuosos.",
     "Zabaione com frutas, Panna cotta com calda, Affogato",
     "Depois de um prato gorduroso, prefira frescor e acidez: frutas, calda de frutas vermelhas ou café."),
    ("Massas recheadas e de forno",
     "Lasanhas, canelones e gratinados: pratos fartos e demorados.",
     "Affogato, Cantucci com café, Cannoli em taça",
     "Porções pequenas e prontas na hora. Quem já comeu bem agradece uma sobremesa curta."),
    ("Pizzas e antepastos",
     "Noite descontraída, muitas pessoas, comida dividida no centro da mesa.",
     "Torta della Nonna, Crostata di marmellata, Tiramisù",
     "Doces que se cortam em fatias ou se servem do refratário, feitos com antecedência e fáceis de dividir."),
]

PLANNING = [
    ("Tiramisù", "Na véspera", "Até 3 dias, na geladeira"),
    ("Panna cotta", "Até 2 dias antes", "Até 3 dias (calda: 5 dias), na geladeira"),
    ("Torta della Nonna", "Na véspera", "Até 3 dias, na geladeira"),
    ("Torta caprese", "Até 2 dias antes", "Até 3 dias, bem embalada; em dias quentes, na geladeira"),
    ("Cantucci", "Até 2 semanas antes", "Até 3 semanas, em pote hermético, longe de umidade e calor"),
    ("Affogato al caffè", "Na hora", "Calda de chocolate: até 5 dias, na geladeira"),
    ("Zabaione com frutas", "Na hora", "Servir em seguida"),
    ("Crostata di marmellata", "Até 2 dias antes", "Até 3 dias, coberta, em local fresco"),
    ("Budino al cioccolato", "Até 2 dias antes", "Até 3 dias, na geladeira"),
    ("Cannoli em taça", "Creme até 2 dias antes", "Montar só na hora de servir"),
]
