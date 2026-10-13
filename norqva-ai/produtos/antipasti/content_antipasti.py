# -*- coding: utf-8 -*-
"""Conteúdo das receitas de Antipasti & Aperitivo (Volume IV da coleção Cozinha Italiana em Casa).

Mesma estrutura do Volume III (paes/content_paes.py): slug, title, tag, intro, meta (4 itens), ingredients (grupos),
steps, notes, tip e, opcional, left (notas que vão para a coluna dos ingredientes).
Medidas caseiras: líquidos 240 ml/xícara, 15 ml/colher de sopa, 5 ml/colher de chá; sal fino ≈ 6 g/colher de chá;
açúcar ≈ 12 g/colher de sopa; queijo parmesão ralado fino ≈ 80 g/xícara; farinha de rosca ≈ 110 g/xícara;
farinha de trigo ≈ 120 g/xícara; ricota fresca amassada ≈ 240 g/xícara; arroz arbóreo ≈ 200 g/xícara.
"""

RECIPES = [
    dict(
        slug="bruschetta",
        title="Bruschetta de feijão-branco e alecrim",
        tag="Bruschetta — pão tostado, creme rústico de feijão e rúcula",
        intro="A bruschetta vem do campo do centro da Itália: pão tostado na brasa, esfregado com alho e regado com azeite. "
              "Na Toscana, ganha por cima feijão-branco amassado com alecrim, um antepasto farto e barato.",
        meta=[("Rendimento", "12 bruschettas (4 a 6 porções)"), ("Preparo", "25 min"),
              ("Pão", "6 a 8 min tostando"), ("Nível", "Fácil")],
        ingredients=[
            ("Creme de feijão", [
                "360 g de feijão-branco cozido e escorrido (2 xícaras)",
                "45 ml de azeite extravirgem (3 colheres de sopa)",
                "1 dente de alho picado",
                "1 colher de chá de alecrim fresco picado",
                "15 ml de suco de limão-siciliano (1 colher de sopa)",
                "3 g de sal fino (½ colher de chá)",
                "Pimenta-do-reino moída na hora",
            ]),
            ("Pão e cobertura", [
                "12 fatias de pão rústico ou italiano, com 1,5 cm de espessura (cerca de 300 g)",
                "1 dente de alho, cortado ao meio",
                "1 punhado de folhas de rúcula",
                "Azeite extravirgem para regar",
            ]),
        ],
        steps=[
            "Numa frigideira, aqueça o azeite em fogo baixo com o alho picado e o alecrim por 2 minutos, sem deixar o alho dourar.",
            "Junte o feijão e aqueça por 3 minutos, mexendo.",
            "Desligue e amasse com um garfo, deixando alguns grãos em pedaços. Junte o suco de limão, o sal e a pimenta. Se ficar seco, junte 1 a 2 colheres de sopa de água.",
            "Toste as fatias de pão numa frigideira canelada ou chapa bem quente, 2 a 3 minutos de cada lado, ou no forno preaquecido a 220 °C por 6 a 8 minutos, até as bordas dourarem.",
            "Com o pão ainda quente, esfregue o lado cortado do alho uma ou duas vezes em cada fatia e regue com um fio de azeite.",
            "Espalhe o creme morno sobre as fatias, cubra com a rúcula e termine com um fio de azeite e pimenta moída na hora.",
        ],
        notes=[
            ("Feijão em casa", "Deixe 150 g de feijão-branco cru de molho por 8 horas, troque a água e cozinhe em fogo baixo por 1 a 1h30, até ficar bem macio. Rende cerca de 360 g cozido. O feijão em lata, escorrido e lavado, também serve."),
            ("Outras coberturas", "A bruschetta de tomate e manjericão está no Trattoria em Casa (Volume I, receita 28). Cogumelos salteados com alho e salsinha também combinam com este pão."),
            ("Conservação", "O creme de feijão fica até 3 dias na geladeira; aqueça antes de usar. Monte só na hora: o pão amolece em 15 minutos."),
        ],
        tip="Guarde um pouco da água do cozimento do feijão: ela deixa o creme mais liso e saboroso do que água pura.",
    ),
    dict(
        slug="crostini", left=["Mel e bebês"],
        title="Crostini de ricota, mel e nozes",
        tag="Crostini — torradinhas com creme de ricota e limão",
        intro="Os crostini são torradinhas finas, a base de muitos aperitivos italianos. Esta versão junta o salgado do "
              "parmesão, o fresco do limão e o doce do mel, e fica pronta em menos de meia hora.",
        meta=[("Rendimento", "20 crostini"), ("Preparo", "15 min"),
              ("Forno", "10 min a 200 °C"), ("Nível", "Fácil")],
        ingredients=[
            ("Torradinhas", [
                "½ baguete fina (cerca de 30 cm, 130 g), cortada na diagonal em 20 fatias de 1 cm",
                "30 ml de azeite (2 colheres de sopa)",
            ]),
            ("Creme de ricota", [
                "250 g de ricota fresca bem escorrida (cerca de 1 xícara)",
                "30 g de parmesão ralado fino (⅓ de xícara + 1 colher de sopa)",
                "Raspas da casca de ½ limão-siciliano",
                "2 g de sal fino (⅓ de colher de chá)",
                "Pimenta-do-reino moída na hora",
            ]),
            ("Cobertura", [
                "40 g de nozes picadas grosseiramente (⅓ de xícara)",
                "2 colheres de sopa de mel (cerca de 40 g)",
                "Folhas de tomilho fresco (opcional)",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 200 °C. Arrume as fatias numa assadeira, pincele o azeite dos dois lados e asse por 8 a 10 minutos, até dourarem nas bordas. Deixe esfriar: elas ficam crocantes ao esfriar.",
            "Toste as nozes numa frigideira seca em fogo médio por 3 a 4 minutos, mexendo, até soltarem perfume. Passe para um prato para não queimarem no calor da frigideira.",
            "Amasse a ricota com um garfo e misture o parmesão, as raspas de limão, o sal e a pimenta até formar um creme. Para um creme mais liso, bata 30 segundos no processador.",
            "Na hora de servir, espalhe cerca de 1 colher de sopa de creme em cada torradinha.",
            "Cubra com as nozes, um fio de mel e, se quiser, as folhas de tomilho.",
        ],
        notes=[
            ("Ricota úmida", "Se a ricota soltar soro, deixe 30 minutos numa peneira forrada com papel-toalha, na geladeira, antes de fazer o creme."),
            ("Mel e bebês", "Não ofereça mel a crianças com menos de 1 ano de idade."),
            ("Conservação", "As torradinhas ficam crocantes por até 5 dias em pote fechado. O creme, até 2 dias na geladeira. Monte só na hora."),
        ],
        tip="O mel vai por último e na hora: colocado antes, ele escorre e amolece a torradinha.",
    ),
    dict(
        slug="caponata",
        title="Caponata siciliana",
        tag="Agrodolce de berinjela, tomate, azeitonas e alcaparras",
        intro="A caponata é o antepasto agridoce da Sicília: berinjela dourada no azeite, cozida com tomate, salsão, "
              "azeitonas e alcaparras, e temperada com vinagre e açúcar. Fica melhor no dia seguinte.",
        meta=[("Rendimento", "6 porções (cerca de 1 kg)"), ("Preparo", "1 h 15 min"),
              ("Descanso", "2 h (melhor no dia seguinte)"), ("Nível", "Fácil")],
        ingredients=[
            ("Berinjela", [
                "2 berinjelas médias (cerca de 700 g)",
                "6 g de sal fino (1 colher de chá)",
                "90 ml de azeite (6 colheres de sopa)",
            ]),
            ("Molho", [
                "30 ml de azeite (2 colheres de sopa)",
                "1 cebola média em cubos (cerca de 150 g)",
                "2 talos de salsão em fatias de 1 cm (cerca de 120 g)",
                "1 lata de tomate pelado picado, com o líquido (400 g)",
                "60 g de azeitonas verdes sem caroço, em rodelas (½ xícara)",
                "20 g de alcaparras escorridas (2 colheres de sopa)",
                "45 ml de vinagre de vinho tinto (3 colheres de sopa)",
                "18 g de açúcar (1½ colher de sopa)",
                "10 folhas de manjericão",
                "Sal e pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Corte as berinjelas em cubos de 2 cm, misture com o sal e deixe escorrer numa peneira por 30 minutos. Seque bem com papel-toalha.",
            "Aqueça metade dos 90 ml de azeite numa frigideira grande em fogo médio-alto e doure metade da berinjela por 8 a 10 minutos, mexendo de vez em quando, até ficar dourada e macia por dentro. Reserve e repita com o resto do azeite e da berinjela.",
            "Na mesma frigideira, aqueça os 30 ml de azeite e refogue a cebola e o salsão em fogo médio por 8 minutos, até ficarem macios.",
            "Junte o tomate e cozinhe por 10 minutos, mexendo de vez em quando, até o molho engrossar.",
            "Junte as azeitonas, as alcaparras e a berinjela e cozinhe por mais 5 minutos.",
            "Dissolva o açúcar no vinagre, junte à panela e cozinhe por 2 a 3 minutos, até o cheiro forte do vinagre suavizar.",
            "Prove e acerte o sal e a pimenta, lembrando que azeitonas e alcaparras já são salgadas. Desligue, junte o manjericão rasgado e deixe esfriar por até 1 hora. Leve à geladeira, coberta, por pelo menos 1 hora e tire 30 minutos antes de servir.",
        ],
        notes=[
            ("Agrodolce", "O equilíbrio entre o ácido do vinagre e o doce do açúcar é o que define a caponata. Prove depois de fria: se ficou ácida demais, junte açúcar aos poucos; se ficou doce, um fio de vinagre."),
            ("Erro comum", "Encher a frigideira de berinjela: ela cozinha no vapor, encharca de azeite e não doura. Doure em duas levas."),
            ("Conservação", "Em pote fechado na geladeira, até 4 dias. Tire 30 minutos antes de servir."),
        ],
        tip="Sirva sobre crostini, ao lado de queijos ou como acompanhamento de carne grelhada. Um pouco de caponata transforma um sanduíche.",
    ),
    dict(
        slug="peperoni", left=["Segurança alimentar"],
        title="Pimentões assados marinados",
        tag="Peperoni arrostiti — doces, macios e perfumados de alho",
        intro="Assados até a pele estufar, os pimentões ficam doces e macios. Sem a pele, vão para uma marinada simples "
              "de azeite, alho e vinagre, e acompanham pão, queijos e carnes.",
        meta=[("Rendimento", "6 porções (cerca de 500 g)"), ("Preparo", "25 min"),
              ("Forno", "35 a 40 min + 1 h marinando"), ("Nível", "Fácil")],
        ingredients=[
            ("Pimentões", [
                "4 pimentões grandes, 2 vermelhos e 2 amarelos (cerca de 1 kg)",
            ]),
            ("Marinada", [
                "60 ml de azeite extravirgem (4 colheres de sopa)",
                "1 dente de alho em lâminas finas",
                "15 ml de vinagre de vinho branco (1 colher de sopa)",
                "3 g de sal fino (½ colher de chá)",
                "1 colher de sopa de salsinha picada",
                "Pimenta-do-reino moída na hora",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 230 °C. Arrume os pimentões inteiros numa assadeira forrada com papel-alumínio.",
            "Asse por 35 a 40 minutos, virando na metade do tempo, até a pele estufar e ganhar manchas escuras.",
            "Passe os pimentões quentes para uma tigela e tampe por 15 minutos. O vapor solta a pele.",
            "Sobre a tigela, para aproveitar o caldo, retire a pele com as mãos, abra os pimentões e descarte o cabo e as sementes. Não lave em água: o sabor vai embora.",
            "Corte em tiras de cerca de 2 cm. Coe o caldo que ficou na tigela.",
            "Misture o azeite, o alho, o vinagre, o sal, a pimenta e 2 colheres de sopa do caldo coado. Junte as tiras e a salsinha e misture com cuidado.",
            "Cubra e leve à geladeira por pelo menos 1 hora. Tire 20 minutos antes de servir.",
        ],
        notes=[
            ("Segurança alimentar", "Legumes com alho cobertos de azeite ficam sempre na geladeira, em pote fechado, e devem ser consumidos em até 4 dias. Nunca guarde em temperatura ambiente nem por semanas: é a condição em que a bactéria do botulismo pode se desenvolver."),
            ("Sem forno", "Na boca do fogão a gás, asse o pimentão direto na chama, virando com uma pinça de cabo longo até a pele ficar preta por inteiro. Não deixe o fogão sem vigilância."),
            ("Erro comum", "Tirar do forno cedo: a pele ainda presa não sai e o pimentão fica firme. Espere as manchas escuras em todos os lados."),
        ],
        tip="Pimentão vermelho e amarelo são os mais doces depois de assados. O verde fica mais amargo; use pouco, só pela cor.",
    ),
    dict(
        slug="scapece", left=["Óleo quente"],
        title="Abobrinha à scapece",
        tag="Zucchine alla scapece — frita e marinada com hortelã",
        intro="Prato de Nápoles: rodelas de abobrinha fritas até dourar e marinadas em vinagre, alho e hortelã. "
              "O vinagre corta a gordura da fritura e a hortelã deixa tudo fresco.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "1 h 15 min"),
              ("Descanso", "1 h marinando"), ("Nível", "Fácil")],
        ingredients=[
            ("Abobrinha", [
                "4 abobrinhas italianas médias (cerca de 800 g)",
                "500 ml de óleo de soja, girassol ou canola, para fritar (cerca de 2 xícaras)",
                "Sal fino a gosto",
            ]),
            ("Marinada", [
                "45 ml de vinagre de vinho branco (3 colheres de sopa)",
                "30 ml de azeite extravirgem (2 colheres de sopa)",
                "1 dente de alho em lâminas finas",
                "12 folhas de hortelã",
            ]),
        ],
        steps=[
            "Corte as abobrinhas em rodelas de cerca de 4 mm. Espalhe sobre um pano limpo, sem sobrepor, e deixe secar por 30 minutos, virando uma vez.",
            "Aqueça o óleo numa frigideira funda de cerca de 24 cm (camada de 1 a 1,5 cm) até 170 a 175 °C (página 04).",
            "Frite as rodelas em levas, sem amontoar, por 4 a 5 minutos, virando, até dourarem com manchas castanhas.",
            "Escorra sobre papel-toalha e salpique sal ainda quente.",
            "Numa travessa, faça camadas de abobrinha, lâminas de alho e hortelã rasgada.",
            "Misture o vinagre com o azeite e regue por cima. Deixe marinar por até 1 hora em temperatura ambiente e sirva. Para servir mais tarde, leve à geladeira, coberta, e tire 20 minutos antes.",
        ],
        notes=[
            ("Óleo quente", "Nunca deixe a frigideira sozinha no fogo. Se o óleo soltar fumaça, desligue. Em caso de fogo, tampe a frigideira e desligue o fogo: nunca jogue água."),
            ("Erro comum", "Abobrinha úmida espirra no óleo e fica mole. Secar no pano é o passo que faz a diferença."),
            ("Conservação", "Depois de marinada, guarde em pote fechado na geladeira por até 3 dias. Tire 20 minutos antes de servir."),
        ],
        tip="Fica ainda melhor no dia seguinte, quando o vinagre e a hortelã já penetraram. Bom acompanhamento para carnes e peixes grelhados.",
    ),
    dict(
        slug="involtini",
        title="Rolinhos de berinjela com ricota",
        tag="Involtini di melanzane — gratinados no molho de tomate",
        intro="Fatias finas de berinjela grelhada, enroladas com recheio de ricota e manjericão e gratinadas no molho de tomate. "
              "Funcionam como antepasto ou, com uma salada, como prato principal leve.",
        meta=[("Rendimento", "16 rolinhos (4 porções)"), ("Preparo", "45 min"),
              ("Forno", "20 a 25 min a 200 °C"), ("Nível", "Médio")],
        ingredients=[
            ("Berinjela", [
                "2 berinjelas grandes (cerca de 800 g)",
                "45 ml de azeite para pincelar (3 colheres de sopa)",
            ]),
            ("Recheio", [
                "250 g de ricota fresca bem escorrida (cerca de 1 xícara)",
                "1 ovo",
                "40 g de parmesão ralado fino (½ xícara)",
                "8 folhas de manjericão picadas",
                "3 g de sal fino (½ colher de chá)",
                "Pimenta-do-reino moída na hora",
            ]),
            ("Para montar", [
                "300 ml de molho de tomate (1¼ xícara)",
                "125 g de muçarela ralada grossa (1¼ xícara)",
                "20 g de parmesão ralado (¼ de xícara)",
            ]),
        ],
        steps=[
            "Corte as berinjelas no comprimento em fatias de cerca de 5 mm, descartando as duas fatias das pontas, só de casca. Separe as 16 maiores.",
            "Pincele as fatias com azeite dos dois lados e grelhe numa frigideira canelada ou chapa em fogo médio-alto, 2 a 3 minutos de cada lado, até ficarem macias e marcadas. Reserve num prato.",
            "Misture a ricota, o ovo, o parmesão, o manjericão, o sal e a pimenta.",
            "Preaqueça o forno a 200 °C. Espalhe metade do molho no fundo de um refratário de cerca de 20 × 30 cm.",
            "Coloque 1 colher de sopa cheia de recheio na ponta mais larga de cada fatia e enrole. Arrume no refratário com a emenda para baixo.",
            "Cubra com o restante do molho, a muçarela e o parmesão.",
            "Asse por 20 a 25 minutos, até o molho borbulhar nas bordas e o queijo dourar. Descanse 10 minutos antes de servir.",
        ],
        notes=[
            ("Molho de tomate", "Use o Pomodoro e basilico do Trattoria em Casa (Volume I, receita 07) ou um molho de tomate pronto de boa qualidade."),
            ("Erro comum", "Fatias grossas não enrolam e quebram; fatias cruas por dentro ficam borrachudas. Fatias finas e grelhadas até ficarem moles."),
            ("Conservação", "Na geladeira, em pote fechado, até 3 dias. Reaqueça no forno a 180 °C por 15 minutos, até ficar bem quente no centro."),
        ],
        tip="Pode montar o refratário até a véspera e guardar na geladeira, coberto. No dia, asse 5 a 10 minutos a mais.",
    ),
    dict(
        slug="funghi",
        title="Cogumelos recheados ao forno",
        tag="Funghi ripieni — farinha de rosca, parmesão e salsinha",
        intro="Os talos picados viram parte do recheio, com alho, farinha de rosca, parmesão e salsinha. "
              "Assados até dourar, os cogumelos ficam macios por dentro e crocantes por cima.",
        meta=[("Rendimento", "16 cogumelos (4 porções)"), ("Preparo", "25 min"),
              ("Forno", "18 a 20 min a 200 °C"), ("Nível", "Fácil")],
        ingredients=[
            ("Cogumelos", [
                "16 cogumelos-de-paris grandes, de 4 a 5 cm (cerca de 400 g)",
                "15 ml de azeite para regar (1 colher de sopa)",
            ]),
            ("Recheio", [
                "Os talos dos cogumelos, picados fino",
                "30 ml de azeite (2 colheres de sopa)",
                "1 dente de alho picado",
                "40 g de farinha de rosca (6 colheres de sopa)",
                "30 g de parmesão ralado fino (⅓ de xícara + 1 colher de sopa)",
                "2 colheres de sopa de salsinha picada",
                "2 g de sal fino (⅓ de colher de chá)",
                "Pimenta-do-reino moída na hora",
            ]),
        ],
        steps=[
            "Limpe os cogumelos com um pano úmido ou pincel. Não deixe de molho: eles absorvem água.",
            "Retire os talos com cuidado, torcendo, e pique fino.",
            "Preaqueça o forno a 200 °C.",
            "Aqueça o azeite numa frigideira em fogo médio, junte o alho e os talos e refogue por 4 a 5 minutos, até a água que eles soltam secar.",
            "Fora do fogo, junte a farinha de rosca, o parmesão, a salsinha, o sal e a pimenta. O recheio deve ficar úmido e esfarelado; se estiver seco, junte 1 colher de sopa de água.",
            "Recheie as cabeças dos cogumelos, apertando de leve, e arrume numa assadeira. Regue com o azeite.",
            "Asse por 18 a 20 minutos, até os cogumelos ficarem macios e o recheio dourado. Sirva mornos.",
        ],
        notes=[
            ("Variação", "Para um recheio mais rico, junte 50 g de linguiça calabresa picada bem fino ao refogado do passo 4."),
            ("Para adiantar", "Recheie até 4 horas antes e guarde na geladeira, coberto. Asse na hora, 2 a 3 minutos a mais."),
            ("Conservação", "Melhor no dia. Na geladeira, até 2 dias; reaqueça no forno a 180 °C por 8 a 10 minutos."),
        ],
        tip="Escolha cogumelos do mesmo tamanho, firmes e fechados embaixo. Assim todos assam no mesmo tempo e o recheio não cai.",
    ),
    dict(
        slug="frittata", left=["Segurança alimentar"],
        title="Frittata de abobrinha e hortelã",
        tag="Frittata al forno — assada na forma e cortada em quadradinhos",
        intro="A frittata é a omelete grossa italiana. Assada numa forma quadrada e cortada em cubos, vira um aperitivo "
              "prático, que pode ser feito antes e servido morno ou em temperatura ambiente.",
        meta=[("Rendimento", "25 quadradinhos (forma de 20 × 20 cm)"), ("Preparo", "20 min"),
              ("Forno", "22 a 25 min a 180 °C"), ("Nível", "Fácil")],
        ingredients=[
            ("Legumes", [
                "2 abobrinhas italianas médias (cerca de 400 g)",
                "4 g de sal fino, divididos (⅔ de colher de chá)",
                "½ cebola picada (cerca de 60 g)",
                "30 ml de azeite (2 colheres de sopa)",
            ]),
            ("Ovos", [
                "6 ovos",
                "45 ml de leite (3 colheres de sopa)",
                "50 g de parmesão ralado fino (½ xícara + 2 colheres de sopa)",
                "8 folhas de hortelã picadas",
                "Pimenta-do-reino moída na hora",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 180 °C. Unte uma forma de 20 × 20 cm e forre o fundo e as laterais com papel-manteiga.",
            "Rale as abobrinhas no lado grosso do ralador, misture com 2 g do sal (⅓ de colher de chá) e deixe 10 minutos. Esprema bem dentro de um pano limpo para tirar a água.",
            "Aqueça o azeite numa frigideira em fogo médio e refogue a cebola por 4 minutos. Junte a abobrinha e refogue por mais 4 minutos, até secar.",
            "Numa tigela, bata os ovos com o leite, o parmesão, o restante do sal, a pimenta e a hortelã.",
            "Junte a abobrinha morna, misture e despeje na forma.",
            "Asse por 22 a 25 minutos, até o centro ficar firme ao toque e um palito sair sem ovo líquido.",
            "Descanse 10 minutos, desenforme pelo papel e corte em 25 quadradinhos de 4 cm.",
        ],
        notes=[
            ("Segurança alimentar", "Asse até o centro estar firme, sem ovo líquido. Depois de pronta, a frittata fica até 2 horas fora da geladeira; depois disso, guarde."),
            ("Conservação", "Na geladeira, em pote fechado, até 3 dias. Sirva fria, em temperatura ambiente ou aquecida por 8 minutos no forno a 160 °C."),
            ("Erro comum", "Não espremer a abobrinha: a água que sobra deixa a frittata úmida e com o fundo mole."),
        ],
        tip="Espete um tomate-cereja e uma folha de hortelã em cada quadradinho com um palito: vira um aperitivo de festa.",
    ),
    dict(
        slug="arancini", left=["Arroz cozido"],
        title="Arancini de muçarela",
        tag="Bolinhos de arroz da Sicília, com coração de queijo",
        intro="Arancini quer dizer “laranjinhas”: bolinhos de arroz com açafrão, recheados, empanados e fritos até dourar. "
              "O arroz é cozido como um risoto bem firme e esfriado antes de modelar.",
        meta=[("Rendimento", "12 arancini"), ("Preparo", "1 h 30 min"),
              ("Tempo", "2 h para o arroz esfriar"), ("Nível", "Médio")],
        ingredients=[
            ("Arroz", [
                "300 g de arroz arbóreo ou carnaroli (1½ xícara)",
                "900 ml de caldo de legumes quente (3¾ xícaras)",
                "1 envelope de açafrão verdadeiro em pó (0,1 g), não açafrão-da-terra",
                "30 g de manteiga (2 colheres de sopa)",
                "50 g de parmesão ralado fino (½ xícara + 2 colheres de sopa)",
                "Sal a gosto",
            ]),
            ("Recheio", [
                "120 g de muçarela em 12 cubos de cerca de 2 cm",
            ]),
            ("Para empanar e fritar", [
                "60 g de farinha de trigo (½ xícara)",
                "100 ml de água (⅓ de xícara + 1 colher de sopa)",
                "150 g de farinha de rosca fina (1⅓ xícara)",
                "1 litro de óleo de soja, girassol ou canola",
            ]),
        ],
        steps=[
            "Aqueça o arroz a seco por 1 minuto, mexendo. Junte o caldo uma concha por vez, mexendo sempre, como num risoto. Dissolva o açafrão na segunda concha.",
            "Cozinhe por 16 a 18 minutos, até o arroz absorver o caldo e ficar macio, com o grão ainda firme, e a panela quase seca.",
            "Desligue, junte a manteiga e o parmesão e acerte o sal. Espalhe numa assadeira em camada fina, cubra com filme e leve à geladeira por 2 horas, até ficar frio e firme.",
            "Com as mãos úmidas, divida o arroz em 12 porções de cerca de 80 g. Achate cada porção na palma, ponha um cubo de muçarela no centro e feche, apertando bem, formando uma bola.",
            "Bata a farinha de trigo com a água até não ter grumos. Passe cada bola nessa mistura e depois na farinha de rosca, cobrindo bem. Leve à geladeira por 15 minutos.",
            "Aqueça o óleo numa panela funda, com no máximo metade da altura, até 170 a 175 °C (página 04). Frite 3 ou 4 arancini de cada vez por 5 a 6 minutos, virando, até ficarem dourados por igual e bem quentes no centro.",
            "Escorra sobre papel-toalha e espere 5 minutos antes de servir: o queijo de dentro fica muito quente.",
        ],
        notes=[
            ("Arroz cozido", "Não deixe arroz cozido mais de 1 hora fora da geladeira. Esfrie espalhado em camada fina, guarde coberto e use em até 1 dia."),
            ("Óleo quente", "Nunca deixe a panela sozinha no fogo e não encha mais que a metade. Em caso de fogo, tampe a panela e desligue o fogo: nunca jogue água."),
            ("Assados ou congelados", "Sem fritar: borrife azeite e asse a 200 °C por 25 a 30 minutos, virando na metade. Crus e empanados, congelam por 2 meses: frite sem descongelar a 160 °C por 8 a 10 minutos e, se o centro estiver frio, termine 10 minutos no forno a 180 °C."),
        ],
        tip="Sobrou risoto? Ele vira arancini: use cerca de 950 g de risoto frio, guardado na geladeira por no máximo 1 dia, no lugar dos passos 1 a 3.",
    ),
    dict(
        slug="polpettine", left=["Segurança alimentar"],
        title="Almôndegas pequenas ao forno",
        tag="Polpettine — carne, pão, parmesão e limão",
        intro="Pequenas, macias e assadas em vez de fritas, as polpettine são servidas espetadas com palito, puras ou com "
              "molho de tomate para mergulhar. O pão molhado no leite é o que deixa a carne macia.",
        meta=[("Rendimento", "cerca de 36 almôndegas (6 porções)"), ("Preparo", "30 min"),
              ("Forno", "15 a 18 min a 200 °C"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "500 g de carne moída (patinho ou acém)",
                "60 g de pão amanhecido sem casca (cerca de 2 fatias)",
                "80 ml de leite (⅓ de xícara)",
                "1 ovo",
                "40 g de parmesão ralado fino (½ xícara)",
                "1 dente de alho ralado",
                "2 colheres de sopa de salsinha picada",
                "Raspas da casca de ½ limão-siciliano",
                "6 g de sal fino (1 colher de chá)",
                "Pimenta-do-reino moída na hora",
            ]),
            ("Para assar e servir", [
                "30 ml de azeite (2 colheres de sopa)",
                "Molho de tomate quente, para servir (opcional)",
                "Palitos",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 200 °C e forre uma assadeira com papel-manteiga untado.",
            "Deixe o pão de molho no leite por 5 minutos e amasse com um garfo até virar uma pasta.",
            "Numa tigela, junte a carne, a pasta de pão, o ovo, o parmesão, o alho, a salsinha, as raspas de limão, o sal e a pimenta. Misture com as mãos só até ficar uniforme: misturar demais endurece as almôndegas.",
            "Para conferir o sal, frite uma colher de chá da massa numa frigideira até cozinhar por inteiro e prove. Não prove a massa crua.",
            "Com as mãos úmidas, faça bolinhas de cerca de 20 g (1 colher de sopa cheia). Arrume na assadeira e pincele com azeite.",
            "Asse por 15 a 18 minutos, até dourarem e ficarem firmes. Corte uma ao meio: o centro não pode estar rosado.",
            "Sirva quentes, espetadas com palitos, puras ou com o molho de tomate ao lado.",
        ],
        notes=[
            ("Segurança alimentar", "Carne moída precisa cozinhar por completo, até 71 °C no centro, sem parte rosada. Lave as mãos, a bancada e os utensílios depois de mexer na carne crua."),
            ("Conservação", "Assadas, ficam até 3 dias na geladeira e congelam por até 3 meses. Reaqueça no forno ou no molho de tomate até ficarem bem quentes no centro."),
        ],
        tip="Faça todas do mesmo tamanho, com uma colher de sopa como medida. Assim todas ficam prontas ao mesmo tempo.",
    ),
    dict(
        slug="tagliere",
        title="Tábua de frios, queijos e caprese no palito",
        tag="Tagliere all'italiana — como montar e servir",
        intro="O tagliere é a tábua de frios e queijos que abre o aperitivo italiano. Não é receita de fogão, "
              "é de escolha e montagem: três queijos, três frios e alguns acompanhamentos que conversam entre si.",
        meta=[("Rendimento", "1 tábua para 6 pessoas"), ("Preparo", "30 min"),
              ("Montagem", "até 30 min antes"), ("Nível", "Fácil")],
        ingredients=[
            ("Queijos (cerca de 300 g)", [
                "100 g de parmesão ou grana, em lascas",
                "100 g de queijo cremoso ou de casca mole (gorgonzola, brie)",
                "100 g de queijo de sabor médio (provolone ou um pecorino jovem)",
            ]),
            ("Frios (cerca de 300 g)", [
                "100 g de presunto cru fatiado fino",
                "100 g de salame italiano fatiado",
                "100 g de mortadela em cubos",
            ]),
            ("Caprese no palito", [
                "20 tomates-cereja (cerca de 200 g)",
                "20 bolinhas de muçarela de búfala (cerca de 200 g)",
                "20 folhas pequenas de manjericão",
                "Azeite, sal e pimenta-do-reino",
            ]),
            ("Acompanhamentos", [
                "100 g de azeitonas, 1 cacho de uvas e 40 g de nozes",
                "2 colheres de sopa de mel ou geleia de figo",
                "Grissini, taralli ou crostini (Volume III e receita 02)",
            ]),
        ],
        steps=[
            "Tire os queijos da geladeira 30 minutos antes: frios demais, eles perdem o sabor.",
            "Monte a caprese: em cada palito, um tomate, uma folha de manjericão e uma bolinha de muçarela. Tempere com azeite, sal e pimenta só na hora de servir.",
            "Comece pelos queijos, espalhados pela tábua com espaço entre eles. Corte cada um de um jeito: lascas, fatias e cunhas.",
            "Distribua os frios ao lado: o presunto cru dobrado em ondas, o salame em leque e a mortadela em cubos com palitos.",
            "Preencha os espaços com a caprese, as azeitonas, as uvas e as nozes. Ponha o mel ou a geleia num potinho perto do queijo mais forte.",
            "Sirva os pães e os grissini ao lado, num cesto, para não amolecerem sobre os frios.",
        ],
        notes=[
            ("Quantidades", "Como aperitivo, conte cerca de 50 g de queijo e 50 g de frios por pessoa. Se a tábua for a refeição, dobre."),
            ("Segurança alimentar", "A tábua fica no máximo 2 horas fora da geladeira (1 hora em dia muito quente). Frios curados crus, como presunto cru e salame, e queijos de casca mole ou azuis cremosos, como brie e gorgonzola, costumam ser desaconselhados na gravidez. Se houver uma pessoa grávida à mesa, ofereça também mortadela, parmesão e provolone."),
        ],
        tip="Combine queijo forte com doce (gorgonzola com mel), queijo curado com fruta (parmesão com uva) e frio salgado com algo fresco.",
    ),
    dict(
        slug="spritz", left=["Com responsabilidade"],
        title="Spritz e aperitivo sem álcool",
        tag="O drinque do aperitivo italiano, e uma versão para todos",
        intro="No norte da Itália, o fim de tarde tem nome: aperitivo. O spritz, de espumante e bitter de laranja, "
              "é o drinque mais pedido. Ao lado, uma versão sem álcool com a mesma cor e o mesmo amargor leve.",
        meta=[("Rendimento", "1 drinque de cada"), ("Preparo", "5 min"),
              ("Serviço", "na hora"), ("Nível", "Fácil")],
        ingredients=[
            ("Spritz", [
                "90 ml de espumante seco (prosecco ou brut), gelado",
                "60 ml de bitter de laranja vermelho, de baixo teor alcoólico, gelado",
                "30 ml de água com gás gelada",
                "Gelo",
                "½ rodela de laranja",
            ]),
            ("Aperitivo sem álcool", [
                "60 ml de suco de laranja fresco e coado",
                "15 ml de suco de limão (1 colher de sopa)",
                "10 ml de xarope de groselha (2 colheres de chá)",
                "100 ml de água tônica gelada",
                "Gelo, 1 rodela de laranja e 1 ramo de alecrim",
            ]),
        ],
        steps=[
            "Spritz: encha uma taça grande de vinho com gelo até cerca de dois terços.",
            "Despeje o espumante, depois o bitter e por fim a água com gás. Essa é a proporção 3-2-1.",
            "Mexa uma única vez, de baixo para cima, para não perder o gás. Decore com a meia rodela de laranja.",
            "Sem álcool: encha um copo alto com gelo.",
            "Junte o suco de laranja, o suco de limão e a groselha. Complete com a água tônica.",
            "Mexa de leve e decore com a rodela de laranja e o ramo de alecrim.",
        ],
        notes=[
            ("Com responsabilidade", "Beba com moderação. A venda e a oferta de bebida alcoólica são proibidas para menores de 18 anos. Se for dirigir, escolha a versão sem álcool. Na gravidez, também."),
            ("Proporção 3-2-1", "Três partes de espumante, duas de bitter e uma de água com gás. Para um drinque menos amargo, use menos bitter e mais espumante."),
            ("Erro comum", "Ingredientes em temperatura ambiente derretem o gelo e aguam o drinque. Deixe tudo na geladeira desde a véspera."),
        ],
        tip="Sirva o spritz com um petisco salgado ao lado, como azeitonas, taralli ou batata chips: é assim que se faz nos bares de Veneza.",
    ),
]

# Planejamento: (receita, quando preparar, conservação)
PLANNING = [
    ("Bruschetta", "Creme até 3 dias antes; pão 1 dia antes", "Monte na hora; não guarda montada"),
    ("Crostini", "Torradas até 5 dias antes; creme na véspera", "Torradas em pote; creme 2 dias na geladeira"),
    ("Caponata", "1 a 2 dias antes (fica melhor)", "Geladeira, até 4 dias"),
    ("Pimentões assados", "1 dia antes", "Geladeira, até 4 dias"),
    ("Abobrinha à scapece", "No dia ou na véspera", "Geladeira, até 3 dias"),
    ("Rolinhos de berinjela", "Monte até a véspera; asse no dia", "Geladeira, até 3 dias"),
    ("Cogumelos recheados", "Recheie até 4 h antes; asse na hora", "Geladeira, até 2 dias"),
    ("Frittata", "No dia ou na véspera", "Geladeira, até 3 dias"),
    ("Arancini", "Arroz na véspera; frite no dia", "Crus e empanados congelam 2 meses"),
    ("Almôndegas", "Até 1 dia antes; reaqueça", "Geladeira 3 dias; congelam 3 meses"),
    ("Tábua de frios", "Compras na véspera; monte 30 min antes", "Fora da geladeira no máximo 2 h"),
    ("Spritz", "Ingredientes gelados desde a véspera", "Prepare na hora"),
]

# Harmonização: (ocasião, exemplo, antepastos, por quê)
PAIRINGS = [
    ("Aperitivo rápido", "Fim de tarde, visita inesperada", "Bruschetta, crostini, spritz",
     "Prontos em cerca de meia hora, com ingredientes de mercado."),
    ("Antes de uma massa", "Pratos do Trattoria em Casa", "Pimentões assados, abobrinha à scapece",
     "Legumes leves e ácidos, que abrem o apetite sem pesar."),
    ("Almoço de domingo", "Mesa da família, muitas pessoas", "Tábua de frios, caponata, frittata",
     "Feitos antes, servidos em temperatura ambiente."),
    ("Festa e aniversário", "Comida de pé, com palito", "Arancini, almôndegas, caprese no palito",
     "Comem-se numa mordida, sem talher nem prato."),
    ("Mesa vegetariana", "Sem carne e sem peixe", "Rolinhos de berinjela, cogumelos, caponata",
     "Pratos de legumes que funcionam também como principal. Para vegetarianos estritos, use queijo duro de coalho microbiano."),
    ("Com vinho", "Tinto leve, branco ou espumante", "Tábua de frios, crostini, cogumelos",
     "Queijo, frios e cogumelos acompanham bem vinhos de corpo leve a médio."),
]

# Fotos (geradas na KIE, google/nano-banana): mesmo cenário dos volumes anteriores.
STYLE = ("appetizing editorial food photography, warm golden side light, served on a cream ceramic plate with a thin gold rim, "
         "a dusty rose linen napkin, dark rustic wooden table, shallow depth of field, Italian home cooking, "
         "no text, no letters, no logos, no brand labels, no people, no hands")
PHOTOS = {
    "00_capa": ("2:3", "Overhead-angled view of an Italian antipasti spread on a dark wooden table: a cream plate with a thin gold rim holding "
                "white bean and arugula bruschetta, a small bowl of caponata, strips of roasted red and yellow peppers glistening with olive oil, golden arancini, "
                "cherry tomato and mozzarella skewers, slices of prosciutto and salami, chunks of parmesan, green olives, "
                "two glasses of orange spritz with ice and orange slices, dusty rose linen napkin"),
    "01_bruschetta": ("3:2", "Six slices of toasted rustic bread with grill marks topped with coarsely mashed creamy white cannellini beans, "
                      "fresh arugula leaves, a little chopped rosemary and a drizzle of olive oil, on a cream plate with a thin gold rim, "
                      "a halved garlic clove and a rosemary sprig beside it"),
    "02_crostini": ("3:2", "Small round toasts topped with smooth white ricotta cream, chopped toasted walnuts, a drizzle of golden honey and thyme leaves, "
                    "arranged on a cream plate with a thin gold rim, a small jar of honey with a wooden dipper beside it"),
    "03_caponata": ("3:2", "Sicilian caponata in a cream ceramic bowl with a thin gold rim: glossy cubes of golden fried eggplant in a thick tomato sauce "
                    "with sliced green olives, capers, celery pieces and fresh basil leaves, a few slices of toasted bread beside it"),
    "04_peperoni": ("3:2", "Strips of peeled roasted red and yellow bell peppers glistening with olive oil, thin garlic slices and chopped parsley, "
                    "arranged on a cream plate with a thin gold rim, a small ceramic bowl of the same peppers beside it"),
    "05_scapece": ("3:2", "Round slices of fried zucchini with golden brown spots, layered with thin garlic slices and fresh mint leaves, "
                   "glossy with vinegar and olive oil, on a cream plate with a thin gold rim"),
    "06_involtini": ("3:2", "Baked eggplant rolls filled with ricotta, in a rectangular ceramic baking dish with bubbling tomato sauce "
                     "and golden melted mozzarella, one roll served on a cream plate with a thin gold rim, fresh basil"),
    "07_funghi": ("3:2", "Baked white button mushroom caps stuffed with a golden crisp breadcrumb, parmesan and parsley filling, "
                  "arranged on a cream plate with a thin gold rim, scattered chopped parsley"),
    "08_frittata": ("3:2", "Small square pieces of baked zucchini frittata, golden on top with visible green zucchini shreds and mint, "
                    "some skewered with a cherry tomato and a mint leaf on a wooden toothpick, on a cream plate with a thin gold rim"),
    "09_arancini": ("3:2", "Golden crispy fried round arancini rice balls on a cream plate with a thin gold rim, one broken open showing "
                    "yellow saffron rice and a stretchy melted mozzarella center"),
    "10_polpettine": ("3:2", "Small golden baked meatballs, some on wooden toothpicks, on a cream plate with a thin gold rim, "
                      "a small bowl of red tomato sauce for dipping beside them, chopped parsley on top"),
    "11_tagliere": ("3:2", "Italian charcuterie and cheese board on a wooden board: chunks of parmesan, a wedge of blue gorgonzola, sliced provolone, "
                    "folded thin prosciutto, salami slices, cubes of mortadella, cherry tomato, basil and buffalo mozzarella skewers, "
                    "olives, grapes, walnuts, a small bowl of honey, breadsticks"),
    "12_spritz": ("3:2", "Two drinks side by side: a large wine glass of bright orange spritz with ice and half an orange slice, and a tall glass "
                  "of a red-orange alcohol-free drink with ice, an orange slice and a rosemary sprig, a small bowl of green olives beside them"),
}
