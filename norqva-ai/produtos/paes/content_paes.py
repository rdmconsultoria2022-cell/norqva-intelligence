# -*- coding: utf-8 -*-
"""Conteúdo das receitas de Pães & Fermentação Natural (Volume III da coleção Cozinha Italiana em Casa).

Mesma estrutura do Dolci (dolci/content.py): slug, title, tag, intro, meta (4 itens), ingredients (grupos),
steps, notes, tip e, opcional, left (notas que vão para a coluna dos ingredientes).
Medidas caseiras: farinha de trigo ≈ 120 g/xícara; sêmola ≈ 170 g/xícara; líquidos 240 ml/xícara,
15 ml/colher de sopa, 5 ml/colher de chá; sal fino ≈ 6 g/colher de chá; fermento biológico seco ≈ 3 g/colher de chá.
"""

RECIPES = [
    dict(
        slug="fermento",
        title="Fermento natural",
        tag="Lievito madre do zero — farinha, água e 7 a 10 dias",
        intro="O fermento natural é uma cultura de leveduras e bactérias que já vivem na farinha. "
              "Feito uma vez e alimentado com regularidade, ele fermenta os pães 02, 03, 05 e 12 deste livro.",
        meta=[("Rendimento", "cerca de 100 g de fermento ativo"), ("Preparo", "5 min por dia"),
              ("Tempo", "7 a 10 dias até ficar ativo"), ("Nível", "Fácil")],
        ingredients=[
            ("Para começar (dia 1)", [
                "50 g de farinha de trigo integral (⅓ de xícara + 1 colher de sopa)",
                "50 ml de água filtrada em temperatura ambiente (3 colheres de sopa + 1 colher de chá)",
            ]),
            ("Para cada alimentação", [
                "50 g de farinha de trigo (⅓ de xícara + 1 colher de sopa)",
                "50 ml de água filtrada em temperatura ambiente",
            ]),
            ("Utensílios", [
                "Pote de vidro de cerca de 500 ml, com tampa",
                "Elástico ou fita para marcar o nível",
            ]),
        ],
        steps=[
            "Dia 1: no pote limpo, misture a farinha integral e a água até não sobrar farinha seca. Apoie a tampa sem rosquear e deixe em um lugar entre 22 e 26 °C, longe do sol.",
            "Dias 2 e 3: uma vez por dia, mantenha só 50 g da mistura no pote, junte 50 g de farinha de trigo e 50 ml de água e misture bem. É comum o fermento borbulhar muito no dia 2 e quase parar no dia 3 ou 4: continue alimentando.",
            "Do dia 4 em diante: alimente a cada 12 horas. Mantenha só 50 g no pote, junte 50 g de farinha e 50 ml de água, misture e marque o nível com o elástico.",
            "O fermento está pronto quando, por 3 dias seguidos, dobra de volume em 4 a 8 horas depois de alimentado, tem bolhas por toda a massa e cheiro agradável de iogurte ou fruta madura.",
            "Para usar: alimente de 4 a 8 horas antes e use no pico, quando dobrou e o topo está abaulado. Para 100 g, alimente 50 g de fermento com 50 g de farinha e 50 ml de água e use 100 g; os 50 g que sobram continuam no pote.",
            "Manutenção: guarde 50 g na geladeira e alimente uma vez por semana (50 g de farinha e 50 ml de água), deixando 1 a 2 horas fora antes de voltar à geladeira. Antes de assar, faça uma ou duas alimentações em temperatura ambiente.",
        ],
        notes=[
            ("Segurança alimentar", "Use sempre colher e pote limpos. Um líquido escuro por cima é sinal de fome: descarte o líquido e alimente. Qualquer mofo (branco felpudo, verde, preto ou azul) ou manchas cor-de-rosa ou laranja indicam contaminação: jogue tudo fora, lave o pote e recomece."),
            ("O descarte", "Jogue a parte descartada no lixo, não na pia: ela endurece no encanamento."),
        ],
        tip="Água com muito cloro atrasa o começo. Use água filtrada ou deixe a água da torneira descansar destampada por algumas horas antes de usar.",
    ),
    dict(
        slug="rustico", left=["Sem fermento natural"],
        title="Pão rústico de fermentação natural",
        tag="Pane casereccio — casca crocante, assado na panela",
        intro="O pão de todo dia das casas do interior da Itália: farinha, água, sal e fermento natural. "
              "A fermentação longa na geladeira dá sabor levemente ácido e casca bem dourada.",
        meta=[("Rendimento", "1 pão de cerca de 850 g"), ("Preparo", "40 min de trabalho"),
              ("Fermentação", "4 a 6 h + 12 a 16 h na geladeira"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "100 g de fermento natural ativo, no pico (receita 01)",
                "350 ml de água em temperatura ambiente (cerca de 1½ xícara)",
                "450 g de farinha de trigo (3¾ xícaras)",
                "50 g de farinha de trigo integral (⅓ de xícara + 1 colher de sopa)",
                "10 g de sal fino (1⅔ colher de chá)",
            ]),
            ("Para modelar e assar", [
                "Farinha de arroz ou sêmola para polvilhar",
                "Panela de ferro com tampa (ou outra panela com tampa que vá ao forno a 250 °C)",
                "Cesto de fermentação ou tigela forrada com pano",
            ]),
        ],
        steps=[
            "Em uma tigela grande, dissolva o fermento em 330 ml da água. Junte as farinhas e misture até não sobrar farinha seca. Cubra e descanse 30 minutos.",
            "Junte o sal e os 20 ml de água restantes e aperte a massa com a mão, em pinça, por 2 a 3 minutos, até incorporar.",
            "Cubra e deixe fermentar em temperatura ambiente (24 a 26 °C) por 4 a 6 horas. Nas primeiras 2 horas, faça uma série de dobras a cada 30 minutos (página 04).",
            "A massa está no ponto quando cresceu cerca de 50%, está abaulada, tem bolhas na superfície e nas laterais e se solta da tigela.",
            "Vire na bancada levemente enfarinhada, forme uma bola frouxa e descanse 20 minutos. Modele de novo, esticando a superfície, e coloque com a emenda para cima no cesto polvilhado com farinha de arroz. Cubra e leve à geladeira por 12 a 16 horas.",
            "Preaqueça o forno a 250 °C com a panela tampada dentro, por 45 minutos. Vire o pão sobre papel-manteiga, faça um corte de 1 cm de profundidade com lâmina bem afiada e, segurando pelo papel, coloque na panela quente.",
            "Asse tampado por 20 minutos. Destampe, baixe para 230 °C e asse mais 20 a 25 minutos, até a casca ficar bem dourada e o fundo soar oco ao ser batido.",
            "Esfrie sobre uma grade por pelo menos 1 hora antes de cortar.",
        ],
        notes=[
            ("Sem fermento natural", "Troque os 100 g de fermento por 2 g de fermento biológico seco (⅔ de colher de chá) e acrescente à massa 50 g de farinha e 50 ml de água. A fermentação em temperatura ambiente cai para 2 a 3 horas."),
            ("Cuidado com a panela", "Use luvas grossas: panela e tampa ficam a 250 °C. Apoie a tampa quente sobre uma tábua, nunca na pia molhada."),
            ("Erro comum", "Cortar o pão quente: o miolo ainda está terminando de assentar e fica pegajoso."),
        ],
        tip="Observe a massa, não o relógio. Em dia frio a fermentação demora mais; em dia quente, menos. Os sinais do passo 4 valem mais que o tempo.",
    ),
    dict(
        slug="pugliese", left=["Sem fermento natural", "Cuidado com a panela"],
        title="Pane pugliese de sêmola",
        tag="Sêmola de trigo duro, miolo amarelo e perfumado",
        intro="Na Puglia, o pão é feito com sêmola de trigo duro remoída, da mesma família de farinha das massas secas. "
              "O miolo fica amarelo, macio e com leve perfume adocicado; a casca, grossa e escura.",
        meta=[("Rendimento", "1 pão de cerca de 850 g"), ("Preparo", "40 min de trabalho"),
              ("Fermentação", "4 a 5 h + 10 a 12 h na geladeira"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "500 g de sêmola de trigo duro remoída (cerca de 3 xícaras)",
                "360 ml de água morna, a cerca de 30 °C (1½ xícara)",
                "100 g de fermento natural ativo, no pico (receita 01)",
                "10 g de sal fino (1⅔ colher de chá)",
            ]),
            ("Para modelar e assar", [
                "Sêmola para polvilhar",
                "Panela de ferro com tampa e cesto de fermentação (como na receita 02)",
            ]),
        ],
        steps=[
            "Misture a sêmola com 330 ml da água até não sobrar sêmola seca. Cubra e descanse 1 hora: a sêmola absorve água mais devagar que a farinha comum.",
            "Junte o fermento, o sal e os 30 ml de água restantes. Amasse na própria tigela por 5 a 8 minutos, até a massa ficar lisa. Ela é mais pesada e menos elástica que a de farinha de trigo comum.",
            "Cubra e fermente em temperatura ambiente por 4 a 5 horas, com uma série de dobras a cada 30 minutos na primeira 1h30.",
            "Quando tiver crescido cerca de 50%, modele uma bola firme na bancada polvilhada com sêmola e coloque com a emenda para cima no cesto polvilhado. Cubra e leve à geladeira por 10 a 12 horas.",
            "Preaqueça o forno a 250 °C com a panela tampada dentro, por 45 minutos. Vire o pão sobre papel-manteiga, faça um corte em cruz e transfira para a panela.",
            "Asse tampado por 20 minutos. Destampe, baixe para 230 °C e asse mais 25 a 30 minutos, até a casca ficar castanho-escura.",
            "Esfrie sobre uma grade por pelo menos 1 hora antes de cortar.",
        ],
        notes=[
            ("Onde encontrar", "Procure “sêmola de trigo duro remoída” ou “semola rimacinata”. A sêmola grossa, usada no nhoque à romana, deixa o pão arenoso."),
            ("Sem fermento natural", "Troque os 100 g de fermento por 2 g de fermento biológico seco (⅔ de colher de chá) e acrescente 50 g de sêmola e 50 ml de água. A primeira fermentação cai para 2 a 3 horas."),
            ("Cuidado com a panela", "Use luvas grossas: panela e tampa ficam a 250 °C. Apoie a tampa quente sobre uma tábua, nunca na pia molhada."),
            ("Conservação", "Em saco de pano ou papel, 3 a 4 dias. Para guardar mais, fatie e congele por até 3 meses; toste sem descongelar."),
        ],
        tip="Com uma fatia deste pão, um fio de azeite e um tomate maduro esfregado por cima, o lanche da tarde está pronto.",
    ),
    dict(
        slug="ciabatta", left=["Conservação"],
        title="Ciabatta",
        tag="Com biga — massa muito hidratada, miolo cheio de buracos",
        intro="A ciabatta nasceu no Vêneto e ganhou o nome pelo formato achatado, de chinelo. "
              "A biga, um pré-fermento feito na véspera, dá sabor e força a uma massa tão mole que quase escorre.",
        meta=[("Rendimento", "2 ciabattas de cerca de 400 g"), ("Preparo", "30 min de trabalho"),
              ("Fermentação", "16 h (biga) + cerca de 3 h"), ("Nível", "Médio")],
        ingredients=[
            ("Biga (na véspera)", [
                "200 g de farinha de trigo (1⅔ xícara)",
                "100 ml de água fria (⅓ de xícara + 1 colher de sopa)",
                "1 g de fermento biológico seco (⅓ de colher de chá)",
            ]),
            ("Massa", [
                "300 g de farinha de trigo (2½ xícaras)",
                "300 ml de água em temperatura ambiente (1¼ xícara)",
                "2 g de fermento biológico seco (⅔ de colher de chá)",
                "10 g de sal fino (1⅔ colher de chá)",
                "Azeite para untar o pote e farinha para polvilhar",
            ]),
        ],
        steps=[
            "Na véspera, misture os ingredientes da biga até formar uma massa grossa e irregular, sem sovar. Cubra e deixe 16 horas em temperatura ambiente fresca (18 a 22 °C) ou 1 hora fora e 16 horas na geladeira.",
            "Despedace a biga na tigela, junte 280 ml da água e desmanche com os dedos. Junte o fermento e a farinha e misture até não sobrar farinha seca. Cubra e descanse 20 minutos.",
            "Junte o sal e os 20 ml de água restantes, apertando a massa com a mão até a água ser absorvida. Massa mole e pegajosa é normal.",
            "Passe para um pote retangular untado com azeite. Fermente coberta por cerca de 2 horas, com uma série de dobras com a mão molhada a cada 30 minutos, até a massa dobrar e ficar cheia de bolhas.",
            "Vire com cuidado sobre a bancada bem enfarinhada, sem apertar. Enfarinhe a superfície, corte em 2 retângulos e transfira cada um para um papel-manteiga enfarinhado, esticando de leve até cerca de 25 × 10 cm.",
            "Cubra com pano e deixe crescer 45 minutos. Enquanto isso, preaqueça o forno a 250 °C com uma assadeira na grade do meio e uma forma vazia na grade de baixo.",
            "Deslize as ciabattas com o papel sobre a assadeira quente. Jogue 1 xícara de água na forma de baixo e feche a porta. Asse 10 minutos, baixe para 220 °C e asse mais 15 a 18 minutos, até dourar bem. Esfrie sobre uma grade por 30 minutos antes de cortar.",
        ],
        notes=[
            ("Cuidado com o vapor", "Jogue a água com o braço esticado e o rosto afastado, sem respingar no vidro da porta: o vapor queima e o vidro pode trincar."),
            ("Erro comum", "Pôr mais farinha para a massa parar de grudar. É a água que forma os buracos: trabalhe com as mãos molhadas e uma espátula."),
            ("Conservação", "Melhor no dia. Para guardar, congele inteira ou cortada ao meio por até 3 meses; aqueça 8 minutos no forno a 200 °C, sem descongelar."),
        ],
        tip="Depois da fermentação, mexa na massa o mínimo possível. Cada aperto tira as bolhas que vão virar o miolo aberto.",
    ),
    dict(
        slug="azeitonas",
        title="Pão de azeitonas e alecrim",
        tag="Pane alle olive — fermentação natural com ervas",
        intro="Uma variação do pão rústico com azeitonas pretas e alecrim fresco, comum nas padarias da Ligúria e da Toscana. "
              "Fica ótimo com queijos, frios e saladas.",
        meta=[("Rendimento", "1 pão de cerca de 950 g"), ("Preparo", "40 min de trabalho"),
              ("Fermentação", "4 a 6 h + 12 h na geladeira"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "100 g de fermento natural ativo, no pico (receita 01)",
                "340 ml de água em temperatura ambiente (1⅓ xícara + 1 colher de sopa)",
                "500 g de farinha de trigo (4 xícaras + 2 colheres de sopa)",
                "9 g de sal fino (1½ colher de chá)",
            ]),
            ("Recheio", [
                "150 g de azeitonas pretas sem caroço, bem escorridas (cerca de 1 xícara)",
                "1 colher de sopa de alecrim fresco picado",
            ]),
        ],
        steps=[
            "Seque as azeitonas com papel-toalha e pique em pedaços grandes, de 3 ou 4 por azeitona.",
            "Dissolva o fermento em 320 ml da água, junte a farinha e misture até não sobrar farinha seca. Cubra e descanse 30 minutos.",
            "Junte o sal e os 20 ml de água restantes e aperte a massa com a mão até incorporar.",
            "Depois de 30 minutos, espalhe as azeitonas e o alecrim sobre a massa e incorpore fazendo a primeira série de dobras.",
            "Continue como no pão rústico (receita 02, passos 3 e 4): dobras a cada 30 minutos nas primeiras 2 horas, até a massa crescer cerca de 50% em 4 a 6 horas.",
            "Modele um filão curto, que caiba na panela, e coloque com a emenda para cima no cesto ou numa tigela comprida forrada com pano enfarinhado. Cubra e leve à geladeira por 12 horas.",
            "Asse como o pão rústico: forno preaquecido a 250 °C com a panela dentro por 45 minutos, 20 minutos tampado e 20 a 25 minutos destampado a 230 °C.",
            "Esfrie sobre uma grade por pelo menos 1 hora antes de cortar.",
        ],
        notes=[
            ("Azeitonas", "A salmoura em excesso deixa a massa pegajosa e o pão salgado demais. Por isso a receita leva um pouco menos de sal que o pão rústico."),
            ("Sem fermento natural", "Use a mesma troca da receita 02: 2 g de fermento biológico seco, mais 50 g de farinha e 50 ml de água."),
            ("Cuidado com a panela", "Use luvas grossas: panela e tampa ficam a 250 °C. Apoie a tampa quente sobre uma tábua, nunca na pia molhada."),
        ],
        tip="Pique as azeitonas em pedaços grandes. Inteiras, elas afundam e abrem buracos; picadas demais, tingem o miolo de roxo.",
    ),
    dict(
        slug="barese",
        title="Focaccia barese",
        tag="Com batata na massa, tomate-cereja e azeitonas",
        intro="Em Bari, a focaccia leva batata cozida na massa, o que deixa o miolo macio e úmido, e é coberta com tomates espremidos, "
              "azeitonas e orégano. A base fica crocante, quase frita no azeite.",
        meta=[("Rendimento", "1 assadeira de 30 × 40 cm (8 pedaços)"), ("Preparo", "40 min"),
              ("Fermentação", "cerca de 3 h"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "120 g de batata (1 batata pequena)",
                "250 g de farinha de trigo (2 xícaras + 1 colher de sopa)",
                "250 g de sêmola de trigo duro remoída (cerca de 1½ xícara)",
                "4 g de fermento biológico seco (1⅓ colher de chá)",
                "330 ml de água morna (cerca de 1⅓ xícara)",
                "10 g de sal fino (1⅔ colher de chá)",
            ]),
            ("Cobertura", [
                "80 ml de azeite (⅓ de xícara): 50 ml para a assadeira e 30 ml para regar",
                "250 g de tomate-cereja (cerca de 20)",
                "80 g de azeitonas verdes ou pretas (cerca de ½ xícara)",
                "1 colher de chá de orégano seco",
                "1 pitada de sal grosso",
            ]),
        ],
        steps=[
            "Cozinhe a batata com casca em água até ficar macia, cerca de 25 minutos. Descasque, amasse ainda morna e deixe esfriar.",
            "Em uma tigela, misture a farinha, a sêmola, a batata e o fermento. Junte 300 ml da água e misture até formar uma massa grudenta. Descanse 15 minutos.",
            "Junte o sal e os 30 ml de água restantes e sove na tigela por 5 minutos, até a massa ficar lisa. Cubra e deixe crescer por 1h30 a 2 horas, até dobrar.",
            "Unte a assadeira com 50 ml de azeite. Despeje a massa e, com as pontas dos dedos untadas, espalhe até os cantos. Se ela encolher, espere 10 minutos e continue.",
            "Esprema de leve cada tomate cortado ao meio sobre a massa e afunde-o com o lado cortado para cima. Distribua as azeitonas, regue com os 30 ml de azeite restantes e polvilhe o orégano e o sal grosso.",
            "Deixe crescer mais 45 minutos. Enquanto isso, preaqueça o forno a 230 °C.",
            "Asse na grade de baixo por 25 a 30 minutos, até a base ficar dourada e crocante. Espere 10 minutos antes de cortar.",
        ],
        notes=[
            ("A batata", "Prefira batata de polpa farinhenta, como a Asterix. Ela se desmancha na massa e deixa o miolo macio por mais tempo."),
            ("Conservação", "Melhor no dia. As sobras vão para a geladeira em pote fechado por até 2 dias; aqueça 5 minutos no forno a 200 °C."),
        ],
        tip="O suco dos tomates espremidos tempera a superfície da massa e carameliza no forno. Não tenha medo de apertar.",
    ),
    dict(
        slug="panini",
        title="Panini all'olio",
        tag="Pãezinhos macios de azeite, em bola ou em nó",
        intro="Pãezinhos de casca fina e miolo macio, feitos com azeite na massa. "
              "Servem para sanduíche de mortadela, para acompanhar sopas ou para a mesa do café.",
        meta=[("Rendimento", "12 pãezinhos de cerca de 70 g"), ("Preparo", "30 min de trabalho"),
              ("Fermentação", "cerca de 2 h"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "500 g de farinha de trigo (4 xícaras + 2 colheres de sopa)",
                "10 g de açúcar (2 colheres de chá)",
                "5 g de fermento biológico seco (1⅔ colher de chá)",
                "260 ml de água morna (1 xícara + 1 colher de sopa)",
                "50 ml de azeite (3 colheres de sopa + 1 colher de chá)",
                "9 g de sal fino (1½ colher de chá)",
            ]),
            ("Para pincelar", [
                "1 gema",
                "1 colher de sopa de leite",
            ]),
        ],
        steps=[
            "Em uma tigela, misture a farinha, o açúcar e o fermento. Junte a água e o azeite e misture até formar uma massa.",
            "Junte o sal e sove por 10 minutos na bancada (ou 6 a 7 minutos na batedeira com gancho), até a massa ficar lisa, macia e passar no teste da janela (página 04).",
            "Cubra e deixe crescer até dobrar, cerca de 1 hora.",
            "Divida em 12 porções de cerca de 70 g e modele bolinhas lisas. Para o formato de nó, role cada porção num cordão de 25 cm, dê um nó simples e esconda a ponta por baixo.",
            "Arrume na assadeira forrada com papel-manteiga, com espaço entre eles. Cubra e deixe crescer 45 minutos. Enquanto isso, preaqueça o forno a 200 °C.",
            "Pincele com a gema batida com o leite e asse por 15 a 18 minutos, até dourar.",
        ],
        notes=[
            ("Erro comum", "Água quente demais: acima de 40 °C ela enfraquece o fermento. Morna é a água que você sente no pulso sem incômodo."),
            ("Conservação", "Em saco fechado, 2 dias. Congelados, até 3 meses: aqueça 8 minutos no forno a 180 °C, sem descongelar."),
        ],
        tip="Para pãezinhos do mesmo tamanho, pese cada porção. É o jeito mais fácil de todos assarem no mesmo tempo.",
    ),
    dict(
        slug="grissini",
        title="Grissini torinesi",
        tag="Palitos crocantes esticados à mão",
        intro="Os grissini nasceram em Turim, no Piemonte. Os artesanais são esticados à mão, ficam irregulares e quebram com um estalo: "
              "nada a ver com os de pacote.",
        meta=[("Rendimento", "cerca de 30 grissini"), ("Preparo", "30 min"),
              ("Fermentação", "cerca de 1h30"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "250 g de farinha de trigo (2 xícaras + 1 colher de sopa)",
                "3 g de fermento biológico seco (1 colher de chá)",
                "140 ml de água morna (½ xícara + 1 colher de sopa)",
                "30 ml de azeite (2 colheres de sopa), mais um pouco para pincelar",
                "5 g de sal fino (cerca de ¾ de colher de chá)",
            ]),
            ("Para polvilhar", [
                "Sêmola de trigo duro",
                "Opcional: gergelim, alecrim picado ou parmesão ralado",
            ]),
        ],
        steps=[
            "Misture a farinha e o fermento. Junte a água e o azeite, depois o sal, e sove por 8 minutos, até a massa ficar lisa.",
            "Abra a massa num retângulo de cerca de 30 × 12 cm sobre a bancada untada com azeite. Pincele azeite por cima, cubra com filme e deixe crescer por 1 hora.",
            "Polvilhe a superfície com sêmola (e com gergelim, alecrim ou parmesão, se usar). Com uma faca, corte tiras de 1 cm de largura e 12 cm de comprimento.",
            "Pegue cada tira pelas pontas e estique enquanto a assenta na assadeira forrada com papel-manteiga, até cerca de 30 cm. Deixe 1 cm entre elas e use 2 assadeiras (ou asse em 2 fornadas).",
            "Preaqueça o forno a 200 °C enquanto os grissini descansam por 15 minutos.",
            "Asse por 15 a 20 minutos, até ficarem dourados e secos. Esfrie na assadeira: eles terminam de endurecer fora do forno.",
        ],
        notes=[
            ("Conservação", "Em pote bem fechado, até 1 semana. Se amolecerem, 5 minutos no forno a 180 °C devolvem a crocância."),
        ],
        tip="Estique, não role. É o esticar que deixa a superfície irregular e crocante, como a dos grissini de padaria de Turim.",
    ),
    dict(
        slug="taralli",
        title="Taralli com erva-doce",
        tag="Argolinhas da Puglia, fervidas e assadas",
        intro="Os taralli são servidos com vinho no aperitivo da Puglia. A massa não leva fermento: "
              "eles são fervidos rapidamente e depois assados, o que cria a casca lisa e crocante.",
        meta=[("Rendimento", "cerca de 40 taralli"), ("Preparo", "1 h"),
              ("Forno", "200 °C, 25 a 30 min"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "300 g de farinha de trigo (2½ xícaras)",
                "6 g de sal fino (1 colher de chá)",
                "1 colher de sopa de sementes de erva-doce",
                "100 ml de vinho branco seco (⅓ de xícara + 1 colher de sopa)",
                "80 ml de azeite (⅓ de xícara)",
            ]),
        ],
        steps=[
            "Misture a farinha, o sal e a erva-doce. Junte o vinho e o azeite e sove por 5 minutos, até a massa ficar lisa e macia, sem grudar. Cubra e descanse 30 minutos.",
            "Corte pedaços de cerca de 12 g, role em cordões de 14 a 15 cm e cerca de 1 cm de espessura e feche em argola, sobrepondo e apertando as pontas.",
            "Ferva uma panela grande com água. Cozinhe os taralli em levas de 8 a 10: quando subirem à superfície, em 1 a 2 minutos, retire com escumadeira e deixe escorrer sobre um pano limpo.",
            "Preaqueça o forno a 200 °C. Deixe os taralli secarem por 15 minutos e arrume-os na assadeira forrada com papel-manteiga.",
            "Asse por 25 a 30 minutos, até ficarem dourados e bem secos. Esfrie completamente antes de guardar.",
        ],
        notes=[
            ("Por que ferver", "A fervura cozinha a superfície antes do forno. É ela que dá aos taralli a casca lisa, brilhante e crocante."),
            ("Conservação", "Bem frios e em pote fechado, até 2 semanas."),
        ],
        tip="Para conferir o ponto, parta um tarallo frio: ele deve quebrar seco, sem miolo úmido. Se o centro estiver macio, volte a fornada ao forno por mais 5 minutos.",
    ),
    dict(
        slug="friselle", left=["Para servir"],
        title="Friselle",
        tag="Rosquinhas assadas duas vezes, para comer com tomate",
        intro="As friselle são rosquinhas assadas, cortadas ao meio e secas no forno. Duram semanas na despensa. "
              "Na hora de comer, um mergulho rápido na água, tomate maduro, azeite e orégano.",
        meta=[("Rendimento", "8 rosquinhas (16 friselle)"), ("Preparo", "30 min de trabalho"),
              ("Forno", "200 °C, depois 150 °C"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "250 g de farinha de trigo (2 xícaras + 1 colher de sopa)",
                "250 g de sêmola de trigo duro remoída (cerca de 1½ xícara)",
                "5 g de fermento biológico seco (1⅔ colher de chá)",
                "300 ml de água morna (1¼ xícara)",
                "15 ml de azeite (1 colher de sopa)",
                "10 g de sal fino (1⅔ colher de chá)",
            ]),
            ("Para servir", [
                "Tomates maduros",
                "Azeite, sal e orégano seco a gosto",
            ]),
        ],
        steps=[
            "Misture a farinha, a sêmola e o fermento. Junte a água e o azeite, depois o sal, e sove por 10 minutos, até a massa ficar lisa. Cubra e deixe dobrar, cerca de 1 hora.",
            "Divida em 8 porções de cerca de 100 g. Role cada uma num cordão de 25 cm e feche em rosca, apertando a emenda.",
            "Arrume na assadeira forrada com papel-manteiga, cubra e deixe crescer 45 minutos. Enquanto isso, preaqueça o forno a 200 °C.",
            "Asse por 20 minutos, até dourar levemente. Esfrie por 10 minutos.",
            "Com uma faca de serra, corte cada rosca ao meio na horizontal. Volte à assadeira com o lado cortado para cima e asse a 150 °C por 40 a 50 minutos, até secarem por completo.",
            "Esfrie totalmente antes de guardar.",
            "Para servir: passe cada frisella na água fria por 2 a 3 segundos e escorra. Esfregue meio tomate maduro por cima, regue com azeite e tempere com sal e orégano.",
        ],
        notes=[
            ("Conservação", "Bem secas e em pote fechado, até 1 mês."),
        ],
        tip="O mergulho é rápido de propósito: a frisella amolece por fora e continua crocante no centro.",
    ),
    dict(
        slug="piadina", left=["Banha ou azeite"],
        title="Piadina romagnola",
        tag="Pão achatado da Romagna, feito na frigideira",
        intro="Na Romagna, a piadina é vendida em quiosques à beira da estrada: assada na chapa, recheada ainda quente e dobrada ao meio. "
              "Não precisa de forno nem de fermentação longa.",
        meta=[("Rendimento", "6 piadinas de 24 cm"), ("Preparo", "40 min"),
              ("Descanso", "30 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "500 g de farinha de trigo (4 xícaras + 2 colheres de sopa)",
                "10 g de sal fino (1⅔ colher de chá)",
                "2,5 g de bicarbonato de sódio (½ colher de chá)",
                "80 ml de azeite (⅓ de xícara) ou 100 g de banha",
                "220 ml de água morna (1 xícara, menos 1 colher de sopa)",
            ]),
            ("Para rechear (sugestão)", [
                "Presunto cru, rúcula e queijo fresco cremoso",
            ]),
        ],
        steps=[
            "Misture a farinha, o sal e o bicarbonato. Junte o azeite (ou a banha em pedaços) e vá acrescentando a água aos poucos, sovando por 8 a 10 minutos, até a massa ficar lisa e firme.",
            "Embrulhe em filme plástico e descanse por 30 minutos.",
            "Divida em 6 porções de cerca de 135 g e abra cada uma com o rolo, em discos de 24 cm e 2 a 3 mm de espessura.",
            "Aqueça uma frigideira grossa ou chapa em fogo médio-alto, sem óleo. Cozinhe cada piadina por 1½ a 2 minutos de cada lado, furando com um garfo as bolhas que se formarem, até aparecerem manchas douradas.",
            "Empilhe as piadinas prontas sob um pano limpo enquanto cozinha as outras: assim elas continuam macias.",
            "Recheie ainda quente e dobre ao meio.",
        ],
        notes=[
            ("Banha ou azeite", "A banha é a gordura tradicional da Romagna e deixa a piadina mais macia e folhada. O azeite faz uma versão mais leve, também muito boa."),
            ("Conservação", "A massa embrulhada aguenta 1 dia na geladeira; deixe 30 minutos fora antes de abrir. Crua, aberta e separada por papel-manteiga, congela por até 2 meses. Cozida, dura 2 dias em saco fechado; reaqueça na frigideira."),
        ],
        tip="Não deixe a frigideira esfriar entre uma piadina e outra. Na chapa morna, a massa resseca antes de dourar.",
    ),
    dict(
        slug="integral", left=["Sem fermento natural"],
        title="Pão integral na forma",
        tag="Pane integrale — metade integral, fermentação natural",
        intro="Um pão de forma rústico, com metade de farinha integral e fermento natural. "
              "Fatia bem, aguenta vários dias e fica ótimo torrado.",
        meta=[("Rendimento", "1 pão de cerca de 900 g (forma de 25 × 11 cm)"), ("Preparo", "30 min de trabalho"),
              ("Fermentação", "4 a 5 h + 2 a 3 h na forma"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "250 g de farinha de trigo integral (2 xícaras + 1 colher de sopa)",
                "250 g de farinha de trigo (2 xícaras + 1 colher de sopa)",
                "370 ml de água em temperatura ambiente (1½ xícara + 2 colheres de chá)",
                "100 g de fermento natural ativo, no pico (receita 01)",
                "10 g de sal fino (1⅔ colher de chá)",
                "20 g de mel (1 colher de sopa)",
            ]),
            ("Para a forma", [
                "Azeite para untar",
            ]),
        ],
        steps=[
            "Misture as duas farinhas com 340 ml da água até não sobrar farinha seca. Cubra e descanse 45 minutos: a farinha integral precisa de mais tempo para absorver a água.",
            "Junte o fermento, o sal, o mel e os 30 ml de água restantes e aperte a massa com a mão até incorporar.",
            "Cubra e fermente em temperatura ambiente por 4 a 5 horas, com uma série de dobras a cada 30 minutos na primeira 1h30, até a massa crescer cerca de 50%.",
            "Unte a forma. Modele a massa num cilindro do comprimento da forma e coloque com a emenda para baixo.",
            "Cubra e deixe crescer até a massa chegar perto da borda da forma: 2 a 3 horas em temperatura ambiente ou cerca de 12 horas na geladeira.",
            "Preaqueça o forno a 220 °C. Borrife água na superfície, faça um corte no sentido do comprimento e asse por 40 a 45 minutos, até a casca ficar castanha e o fundo, ao desenformar, soar oco.",
            "Desenforme e esfrie sobre uma grade por 2 horas antes de fatiar.",
        ],
        notes=[
            ("Sem fermento natural", "Troque os 100 g de fermento por 2 g de fermento biológico seco (⅔ de colher de chá) e acrescente 50 g de farinha e 50 ml de água. A primeira fermentação cai para cerca de 2 horas."),
            ("Conservação", "Fatiado, em saco fechado, 4 a 5 dias. Congela bem por até 3 meses; toste as fatias sem descongelar."),
        ],
        tip="O pão integral cresce menos que o branco, porque o farelo corta parte da rede de glúten. Miolo mais fechado é normal.",
    ),
]

# Planejamento: (receita, quando começar, conservação)
PLANNING = [
    ("Fermento natural", "7 a 10 dias antes da primeira fornada", "Geladeira, alimentado 1 vez por semana"),
    ("Pão rústico", "Na manhã da véspera; assa no dia", "3 a 4 dias em saco de pano; congela fatiado"),
    ("Pane pugliese", "Na manhã da véspera; assa no dia", "3 a 4 dias em saco de pano; congela fatiado"),
    ("Ciabatta", "Biga na noite da véspera; assa no dia", "No dia; congela por até 3 meses"),
    ("Pão de azeitonas", "Na manhã da véspera; assa no dia", "2 a 3 dias em saco de pano"),
    ("Focaccia barese", "No dia, cerca de 4 horas antes", "Melhor no dia; geladeira até 2 dias"),
    ("Panini all'olio", "No dia, cerca de 3 horas antes", "2 dias em saco fechado; congelam"),
    ("Grissini", "Até 1 semana antes", "Pote fechado, até 1 semana"),
    ("Taralli", "Até 2 semanas antes", "Pote fechado, até 2 semanas"),
    ("Friselle", "Até 1 mês antes", "Pote fechado, até 1 mês"),
    ("Piadina", "Massa até 1 dia antes, na geladeira", "Cozida, 2 dias; crua, congela"),
    ("Pão integral", "No dia (ou forma na geladeira à noite)", "4 a 5 dias em saco fechado; congela"),
]

# Harmonização: (tipo de prato, exemplo, pães, por quê)
PAIRINGS = [
    ("Massas com molho de tomate", "Pomodoro, amatriciana, puttanesca", "Pão rústico, pane pugliese",
     "Miolo firme para recolher o molho do prato, a scarpetta."),
    ("Massas cremosas e ao forno", "Carbonara, lasanha, nhoque gratinado", "Grissini, panini all'olio",
     "Pão mais leve para não pesar depois de um prato rico."),
    ("Antepastos e aperitivo", "Frios, queijos, azeitonas, vinho", "Taralli, grissini, pão de azeitonas",
     "Crocantes e salgados, feitos para beliscar."),
    ("Saladas e pratos de verão", "Tomate, muçarela, salada verde", "Friselle, focaccia barese",
     "Absorvem o azeite e o suco do tomate sem desmanchar."),
    ("Sopas e caldos", "Minestrone, sopa de legumes", "Pão integral, pane pugliese",
     "Fatias torradas que aguentam o caldo."),
    ("Lanche rápido", "Almoço leve, lanche da tarde", "Piadina, panini all'olio",
     "Recheados na hora, sem talheres."),
]
