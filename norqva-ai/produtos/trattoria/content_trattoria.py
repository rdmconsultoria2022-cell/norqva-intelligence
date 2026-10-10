# -*- coding: utf-8 -*-
"""Conteúdo de Trattoria em Casa — Massas & Molhos Italianos.

Mesma estrutura de dados de Dolci della Nonna (dolci/content.py), com os campos
extras "module" ('01'..'05') e "img" (nome-base da imagem da receita).
Revisão editorial e técnica registrada em revisao_trattoria.md.
"""

BOOK = dict(
    title="Trattoria em Casa",
    subtitle="Massas & Molhos Italianos",
    edition="Edição Digital 2026",
    count="28 preparações selecionadas",
)

# Frase de destaque (original p. 5, sobre a foto da massa aberta no rolo)
HIGHLIGHT = "Você não precisa de máquinas para fazer massas incríveis em casa."

# Os 4 princípios fundamentais (original p. 3 — no original só os títulos; textos
# redigidos a partir do conteúdo técnico do próprio livro).
PRINCIPLES = [
    ("A proporção 100 g : 1 ovo",
     "Na massa aos ovos, use 100 g de farinha para cada ovo grande. É a medida da massa clássica "
     "(receita 01): 400 g de farinha e sêmola para 4 ovos."),
    ("O descanso do glúten",
     "Depois de sovada, a massa descansa de 30 a 45 minutos envolta em filme. O glúten relaxa "
     "e a massa abre fina com o rolo, sem encolher."),
    ("Água bem salgada",
     "Cozinhe a massa em bastante água fervente com sal: 1 litro de água e 10 g de sal "
     "(2 colheres de chá rasas) para cada 100 g de massa."),
    ("Il mantecare",
     "Termine a massa na frigideira, com o molho e um pouco da água do cozimento, rica em amido. "
     "Mexendo, forma-se um molho liso e brilhante que envolve cada fio."),
]

MODULES = [
    ("01", "Fundamentos & a massa perfeita",
     "Massas frescas feitas à mão, do ponto da massa aos cortes clássicos.",
     ["massa-ovos", "semola", "massa-espinafre", "tagliatelle", "pappardelle", "nhoque"]),
    ("02", "Molhos clássicos & emulsões",
     "Os grandes molhos italianos e a técnica de uni-los à massa com a água do cozimento.",
     ["pomodoro", "ragu", "cacio-pepe", "carbonara", "amatriciana", "pesto", "burro-salvia", "aglio-olio"]),
    ("03", "Massas recheadas & forno",
     "Ravioli, tortellini e pratos gratinados para reunir a família à mesa.",
     ["ravioli", "tortellini", "lasanha", "cannelloni", "nhoque-4-queijos", "rondelli"]),
    ("04", "Molhos rápidos de 15 minutos",
     "Molhos que ficam prontos no tempo de cozimento da massa.",
     ["sugo-cereja", "gorgonzola", "puttanesca", "cogumelos", "bechamel"]),
    ("05", "Pizzas & antepastos caseiros",
     "Massas fermentadas e antepastos pensados para o forno de casa.",
     ["pizza", "focaccia", "bruschetta"]),
]

RECIPES = [
    # ───────────────────────── MÓDULO 01 ─────────────────────────
    dict(
        slug="massa-ovos", module="01", img="01_massa_ovos",
        title="Massa clássica aos ovos",
        tag="Tagliolini e fettuccine",
        intro="A base da cozinha da Emília-Romanha: massa sedosa e elástica, aberta à mão com o rolo, sem máquina. "
              "É o ponto de partida dos cortes deste módulo e das massas recheadas.",
        meta=[("Rendimento", "4 a 5 porções (cerca de 600 g de massa)"), ("Preparo", "20 min"),
              ("Descanso", "30–45 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "300 g de farinha de trigo tipo 00 ou comum (2½ xícaras)",
                "100 g de sêmola de trigo duro (cerca de ⅔ de xícara)",
                "4 ovos grandes em temperatura ambiente (cerca de 200 g sem casca)",
                "1 pitada de sal fino",
            ]),
            ("Para abrir", [
                "Sêmola para polvilhar",
            ]),
        ],
        steps=[
            "Misture a farinha e a sêmola, faça um monte na bancada limpa e abra uma cavidade no centro (o “vulcão”). Quebre os ovos dentro e junte o sal.",
            "Com um garfo, bata os ovos e vá puxando a farinha das bordas aos poucos, até formar uma massa grossa.",
            "Sove com a palma das mãos por 8–10 minutos, até a massa ficar lisa e elástica.",
            "Envolva em filme e deixe descansar por 30–45 minutos em temperatura ambiente.",
            "Abra com o rolo até 1–2 mm de espessura, polvilhando com sêmola para não grudar.",
            "Polvilhe a folha com sêmola, enrole sem apertar e corte no formato desejado (veja as receitas 04 e 05).",
            "Cozinhe em água fervente com sal: 1½–2 minutos para tagliolini e 2–3 minutos para fettuccine e tagliatelle.",
        ],
        notes=[
            ("Água do cozimento", "Use 1 litro de água e 10 g de sal (2 colheres de chá rasas) para cada 100 g de massa."),
            ("Conservação", "Massa crua, em ninhos polvilhados com sêmola: até 2 dias na geladeira, em pote fechado, ou congelada. Cozinhe sem descongelar."),
        ],
        left=["Água do cozimento"],
        tip="Se o dia estiver seco e a massa parecer dura ao sovar, umedeça apenas as mãos com água morna. Nunca jogue água direto na bancada.",
    ),
    dict(
        slug="semola", module="01", img="02_semola",
        title="Massa de sêmola e água",
        tag="Cavatelli e orecchiette",
        intro="Tradição do Sul da Itália (Puglia e Sicília): massa sem ovos, firme ao dente e rústica, modelada à mão.",
        meta=[("Rendimento", "4 porções (cerca de 520 g de massa)"), ("Preparo", "15 min"),
              ("Descanso", "20 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "350 g de sêmola de trigo duro (cerca de 2 xícaras)",
                "170 ml de água morna, a 40 °C (cerca de ¾ de xícara)",
                "1 pitada de sal marinho fino",
            ]),
        ],
        steps=[
            "Misture a sêmola e o sal em uma tigela grande.",
            "Junte a água morna aos poucos, mexendo com uma colher de pau até formar grumos.",
            "Passe para a bancada e sove com firmeza por 6 minutos, até obter uma massa compacta e homogênea.",
            "Cubra com um pano úmido e deixe descansar por 20 minutos.",
            "Faça rolinhos da espessura de um lápis e corte pedaços de 1 cm.",
            "Cavatelli: arraste cada pedaço sobre a bancada com a ponta de uma faca sem serra, para que ele se enrole e forme o centro oco.",
            "Cozinhe em água fervente com sal (10 g por litro) por 4–5 minutos.",
        ],
        notes=[
            ("Orecchiette", "Com os mesmos pedaços de 1 cm, arraste com a faca formando um disco curvo e vire-o do avesso sobre a ponta do polegar."),
            ("Erro comum", "Usar água fria: a sêmola fica quebradiça e granulada."),
            ("Conservação", "Crua, polvilhada com sêmola: até 2 dias na geladeira ou congelada. Cozinhe sem descongelar."),
        ],
        left=["Erro comum", "Conservação"],
        tip="A água morna hidrata a sêmola mais depressa: a massa fica coesa e os cavatelli mantêm a forma e o centro oco, que segura o molho.",
    ),
    dict(
        slug="massa-espinafre", module="01", img="03_espinafre",
        title="Massa verde de espinafre",
        tag="Para tagliatelle verde e lasanha",
        intro="Cor verde intensa que vem só do espinafre, sem corantes. Sabor suave e textura delicada.",
        meta=[("Rendimento", "4 porções (cerca de 550 g de massa)"), ("Preparo", "25 min"),
              ("Descanso", "30 min"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "300 g de folhas de espinafre fresco, limpas",
                "350 g de farinha de trigo tipo 00 (cerca de 3 xícaras)",
                "2 ovos grandes",
                "1 pitada de noz-moscada ralada",
            ]),
        ],
        steps=[
            "Branqueie o espinafre em água fervente por 60 segundos e passe para água com gelo.",
            "Esprema com as mãos e torça dentro de um pano de prato até não sair mais nenhuma gota de água.",
            "Bata o espinafre bem seco com os ovos no liquidificador ou mixer, sem acrescentar água, até obter um creme verde liso.",
            "Na bancada, misture o creme com a farinha e a noz-moscada e sove por 10 minutos, até a massa ficar lisa.",
            "Se a massa grudar nas mãos, polvilhe farinha aos poucos; se esfarelar, umedeça apenas as mãos.",
            "Envolva em filme e deixe descansar por 30 minutos.",
            "Abra a 1–2 mm e corte em tagliatelle ou folhas de lasanha. Cozinhe em água fervente com sal por 2–3 minutos.",
        ],
        notes=[
            ("Erro comum", "Bater o espinafre cru com água: a massa fica fibrosa, úmida e com gosto amargo."),
            ("Conservação", "Crua: até 2 dias na geladeira, em pote fechado, ou congelada."),
        ],
        left=["Erro comum"],
        tip="O ponto-chave da massa verde é secar bem o espinafre: qualquer excesso de água desequilibra a proporção de farinha.",
    ),
    dict(
        slug="tagliatelle", module="01", img="04_tagliatelle",
        title="Tagliatelle e fettuccine na faca",
        tag="Corte à mão, sem máquina",
        intro="O corte artesanal clássico, para molhos encorpados e ragus.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "15 min"),
              ("Cozimento", "2–3 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "1 receita de massa clássica aos ovos (receita 01), aberta a 1,5 mm",
                "50 g de sêmola fina para polvilhar (cerca de ⅓ de xícara)",
            ]),
            ("Utensílio", [
                "Faca de chef afiada, de lâmina larga",
            ]),
        ],
        steps=[
            "Corte a massa aberta em folhas retangulares e deixe secar na bancada por 5 minutos, para perder a umidade da superfície.",
            "Polvilhe os dois lados de cada folha com bastante sêmola.",
            "Dobre a folha sobre si mesma, das pontas para o centro, em dobras de cerca de 4 cm, sem apertar.",
            "Com a faca, corte tiras de 6 mm para fettuccine ou de 8 mm para tagliatelle.",
            "Passe a lâmina por baixo do centro das dobras e levante: as tiras se soltam e formam ninhos.",
            "Cozinhe em água fervente com sal (10 g por litro) por 2–3 minutos.",
        ],
        notes=[
            ("Erro comum", "Cortar a massa ainda muito úmida: as tiras grudam no momento do corte."),
        ],
        tip="Polvilhe com sêmola, e não com farinha de trigo comum: assim as fitas não grudam umas nas outras quando você enrola a massa.",
    ),
    dict(
        slug="pappardelle", module="01", img="05_pappardelle",
        title="Pappardelle rústico",
        tag="Fitas largas para ragus",
        intro="Fitas largas, de 2 a 2,5 cm, ideais para ragus de carne e molhos de cogumelos.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "15 min"),
              ("Cozimento", "3–3½ min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "1 receita de massa clássica aos ovos (receita 01), aberta a 2 mm",
                "Sêmola para polvilhar",
            ]),
            ("Utensílios", [
                "Cortador de massa liso ou carretilha dentada",
                "Régua culinária (opcional)",
            ]),
        ],
        steps=[
            "Abra a massa um pouco mais grossa que a do tagliatelle, com cerca de 2 mm.",
            "Corte retângulos longos, de 20–25 cm de comprimento.",
            "Com a régua ou seguindo uma linha reta, corte fitas de 2–2,5 cm de largura.",
            "Passe as fitas na sêmola e forme ninhos soltos sobre papel-manteiga.",
            "Cozinhe em bastante água fervente com sal (10 g por litro) por 3–3½ minutos, até ficarem al dente.",
        ],
        notes=[
            ("Erro comum", "Abrir a massa fina demais: fitas largas e finas quebram na panela ao serem misturadas ao molho."),
        ],
        tip="A largura do pappardelle sustenta pedaços maiores de carne desfiada e molhos rústicos sem quebrar.",
    ),
    dict(
        slug="nhoque", module="01", img="06_nhoque",
        title="Nhoque de batata",
        tag="Leve, com o mínimo de farinha",
        intro="Nhoque macio e leve, que leva só a farinha necessária para dar liga.",
        meta=[("Rendimento", "4 a 5 porções (cerca de 850 g)"), ("Preparo", "40 min + cozimento das batatas"),
              ("Cozimento", "1–2 min (até boiar)"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "800 g de batata Asterix (casca rosada)",
                "120–150 g de farinha de trigo tipo 00 (1 a 1¼ xícara)",
                "1 gema de ovo grande",
                "1 colher (café) de sal fino (cerca de 2 g)",
                "Noz-moscada ralada a gosto",
            ]),
        ],
        steps=[
            "Cozinhe as batatas com casca no vapor (cerca de 25–30 minutos) ou asse sobre sal grosso em forno preaquecido a 180 °C (cerca de 50–60 minutos), até ficarem macias.",
            "Descasque ainda quentes e passe duas vezes pelo espremedor, direto sobre a bancada.",
            "Espalhe o purê e deixe esfriar, para que todo o vapor se dissipe.",
            "Junte a gema, o sal e a noz-moscada e incorpore a farinha aos poucos, só até dar liga. Não sove.",
            "Faça rolos e corte em pedaços de 1,5 cm.",
            "Cozinhe em água fervente com sal (10 g por litro), em levas, e retire com a escumadeira assim que boiarem.",
        ],
        notes=[
            ("Erro comum", "Sovar a massa: o glúten se desenvolve e o nhoque fica pesado e borrachudo."),
            ("Conservação", "Crus, congele em assadeira polvilhada com farinha e depois guarde em saco. Cozinhe sem descongelar."),
        ],
        left=["Erro comum"],
        tip="A batata Asterix é mais seca e farinhenta que a Monalisa. Cozida no vapor ou assada, sem contato com a água, ela pede bem menos farinha, e o nhoque fica mais leve.",
    ),

    # ───────────────────────── MÓDULO 02 ─────────────────────────
    dict(
        slug="pomodoro", module="02", img="07_pomodoro",
        title="Pomodoro e basilico",
        tag="Molho de tomate e manjericão",
        intro="O molho de tomate fundamental da cozinha italiana: doce, fresco e brilhante. "
              "Também é a base do cannelloni (receita 18).",
        meta=[("Rendimento", "4 porções"), ("Preparo", "10 min"),
              ("Cozimento", "20–25 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Molho", [
                "800 g de tomate pelado, de preferência San Marzano (2 latas)",
                "60 ml de azeite extravirgem (4 colheres de sopa)",
                "2 dentes de alho levemente amassados",
                "1 maço generoso de manjericão fresco",
                "Sal e pimenta-do-reino a gosto",
            ]),
            ("Para servir", [
                "400 g de massa seca (ou cerca de 500 g de massa fresca)",
                "50 ml da água do cozimento (cerca de 3 colheres de sopa)",
            ]),
        ],
        steps=[
            "Em uma tigela, amasse os tomates pelados com as mãos ou com um garfo.",
            "Em uma panela, aqueça o azeite em fogo médio-baixo com o alho inteiro, até o alho dourar levemente e perfumar o azeite.",
            "Retire o alho e despeje os tomates com cuidado, pois espirram.",
            "Junte metade das folhas de manjericão, rasgadas com as mãos, e uma pitada de sal.",
            "Cozinhe em fogo baixo por 20–25 minutos, até o azeite se separar na superfície. Acerte o sal e a pimenta.",
            "Cozinhe a massa em água fervente com sal e escorra 1 minuto antes do ponto al dente.",
            "Junte a massa ao molho em uma frigideira com a água do cozimento e misture até o molho envolver a massa, brilhante.",
            "Desligue o fogo e finalize com o manjericão restante.",
        ],
        notes=[
            ("Il mantecare", "A água do cozimento, rica em amido, une o azeite e o tomate em um molho liso e brilhante. Fora do fogo, o calor residual termina de cozinhar a massa sem escurecer o manjericão."),
        ],
        tip="Não bata o tomate pelado no liquidificador: isso tritura as sementes e deixa o molho amargo e alaranjado.",
    ),
    dict(
        slug="ragu", module="02", img="08_ragu",
        title="Ragù alla bolognese",
        tag="Cozimento lento",
        intro="Inspirado na receita registrada pela Accademia Italiana della Cucina: encorpado, macio e aromático. "
              "É também a base da lasanha (receita 17).",
        meta=[("Rendimento", "6 porções"), ("Preparo", "20 min"),
              ("Cozimento", "2 h"), ("Nível", "Médio")],
        ingredients=[
            ("Carnes", [
                "400 g de carne bovina moída (acém ou patinho)",
                "200 g de lombo suíno moído ou pancetta picada",
            ]),
            ("Soffritto", [
                "1 cebola, 1 cenoura média e 1 talo de salsão, picados bem miúdos",
                "Azeite para refogar",
            ]),
            ("Líquidos e temperos", [
                "150 ml de vinho tinto seco (½ xícara + 2 colheres de sopa)",
                "2 colheres (sopa) de extrato de tomate",
                "300 ml de caldo de carne quente (1¼ xícara)",
                "150 ml de leite integral (½ xícara + 2 colheres de sopa)",
                "Sal e pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Em uma panela pesada, refogue a cebola, a cenoura e o salsão no azeite, em fogo baixo, até ficarem macios e translúcidos.",
            "Junte a pancetta (se usar) e as carnes. Aumente o fogo e doure, mexendo sempre para soltar a carne.",
            "Adicione o vinho e cozinhe até o álcool evaporar completamente.",
            "Dissolva o extrato de tomate em um pouco do caldo quente e junte à panela.",
            "Tampe e cozinhe em fogo mínimo por 2 horas, acrescentando o leite e o restante do caldo aos poucos, sempre que o molho secar.",
            "Acerte o sal e a pimenta no final.",
        ],
        notes=[
            ("Slow cooking e soffritto", "Pique o soffritto bem miúdo. Evapore todo o vinho antes do leite: o molho ganha aroma sem acidez residual. Fogo brando e panela pesada por 2 horas deixam a carne muito macia."),
            ("Para servir", "Rende molho para cerca de 600 g de massa seca ou 750 g de massa fresca (tagliatelle ou pappardelle)."),
        ],
        tip="O leite integral suaviza a acidez do tomate e deixa o ragù com textura macia e aveludada.",
    ),
    dict(
        slug="cacio-pepe", module="02", img="09_cacio_pepe",
        title="Cacio e pepe",
        tag="Cremoso, sem creme de leite",
        intro="Só três ingredientes (pecorino, pimenta-do-reino em grãos e a água do cozimento), unidos por uma emulsão feita fora do fogo.",
        meta=[("Rendimento", "2 a 3 porções"), ("Preparo", "15 min"),
              ("Ponto-chave", "queijo abaixo de 65 °C"), ("Nível", "Médio")],
        ingredients=[
            ("Ingredientes", [
                "300 g de spaghetti ou tonnarelli",
                "160 g de pecorino romano ralado fino",
                "2 colheres (sopa) de pimenta-do-reino em grãos, moída na hora",
                "Água do cozimento da massa, rica em amido",
            ]),
        ],
        steps=[
            "Cozinhe a massa em água fervente com sal até ficar bem al dente, cerca de 2 minutos antes do ponto. Reserve a água do cozimento.",
            "Enquanto isso, toste a pimenta moída a seco em uma frigideira grande, em fogo médio, por 1 minuto, até perfumar.",
            "Junte à frigideira 1 concha da água do cozimento e deixe levantar fervura.",
            "Em uma tigela, misture o pecorino com 2 conchas da água do cozimento já morna, batendo com um garfo até formar uma pasta grossa.",
            "Transfira a massa para a frigideira com a água de pimenta e salteie por 1 minuto em fogo médio.",
            "Retire a frigideira do fogo, espere 30 segundos e junte a pasta de pecorino, mexendo rápido até emulsionar. Se engrossar demais, junte um pouco mais de água.",
        ],
        notes=[
            ("O limite dos 65 °C", "Acima de cerca de 65 °C a proteína do pecorino coagula e forma grumos. Por isso o queijo é misturado com água morna, numa tigela fora do fogo, antes de encontrar a massa. A pimenta tostada a seco libera seus óleos aromáticos e perfuma a emulsão."),
        ],
        tip="Nunca junte o queijo com a frigideira sobre o fogo: ele coagula e vira uma bola borrachuda.",
    ),
    dict(
        slug="carbonara", module="02", img="10_carbonara",
        title="Carbonara",
        tag="Gema, pecorino e pimenta",
        intro="O clássico de Roma, sem creme de leite e sem cebola: o creme vem das gemas, do queijo e da água do cozimento.",
        meta=[("Rendimento", "2 a 3 porções"), ("Preparo", "15 min"),
              ("Termômetro", "molho a 70 °C"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "300 g de spaghetti ou rigatoni",
                "150 g de guanciale (ou bacon) em cubos médios",
            ]),
            ("Creme de ovos", [
                "4 gemas e 1 ovo inteiro (de preferência caipiras)",
                "80 g de pecorino romano ralado (ou metade pecorino e metade parmigiano)",
                "Pimenta-do-reino moída na hora (bastante)",
            ]),
            ("Utensílio", [
                "Termômetro culinário",
            ]),
        ],
        steps=[
            "Coloque o guanciale em uma frigideira grande ainda fria e leve ao fogo médio até ficar crocante por fora e macio por dentro. Mantenha a gordura na frigideira.",
            "Em uma tigela, bata as gemas, o ovo, o queijo e bastante pimenta até obter um creme espesso.",
            "Cozinhe a massa em água fervente com sal até ficar al dente. Reserve um pouco da água do cozimento.",
            "Transfira a massa para a frigideira do guanciale com 2 colheres (sopa) da gordura derretida e misture.",
            "Afaste a frigideira do fogo por 1 minuto, para baixar a temperatura da panela.",
            "Fora do fogo, despeje o creme de ovos e mexa vigorosamente, juntando 2 colheres (sopa) da água quente do cozimento, até virar um molho cremoso e brilhante.",
            "Confira com o termômetro: o molho deve chegar a 70 °C. Se não chegar, apoie a frigideira sobre uma panela com água fervente, mexendo sem parar, até atingir 70 °C. Sirva em seguida.",
        ],
        notes=[
            ("Segurança alimentar", "As gemas são misturadas fora do fogo e aquecidas pelo calor da massa e da água do cozimento até ficarem cremosas e atingirem 70 °C, confirmados com termômetro culinário, sem virar ovo mexido."),
            ("Erro comum", "Deixar a frigideira no fogo ligado ao juntar o creme de ovos: a carbonara vira ovo mexido."),
        ],
        left=["Erro comum"],
        tip="Não meça a temperatura com a mão: use o termômetro. Mexer sem parar e acrescentar a água quente aos poucos deixa o creme liso e brilhante enquanto ele chega aos 70 °C.",
    ),
    dict(
        slug="amatriciana", module="02", img="11_amatriciana",
        title="Amatriciana",
        tag="Guanciale, tomate e pecorino",
        intro="O equilíbrio entre o salgado do guanciale, a acidez do tomate e um toque picante.",
        meta=[("Rendimento", "3 a 4 porções"), ("Preparo", "15 min"),
              ("Cozimento", "15 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Ingredientes", [
                "350 g de bucatini ou spaghetti",
                "150 g de guanciale (ou bacon) em tiras",
                "60 ml de vinho branco seco (4 colheres de sopa)",
                "500 g de tomate pelado San Marzano, amassado",
                "1 peperoncino seco (ou ½ colher de chá de pimenta calabresa)",
                "60 g de pecorino romano ralado",
            ]),
        ],
        steps=[
            "Em uma frigideira de ferro ou inox, doure o guanciale em fogo baixo, sem azeite, até soltar a gordura.",
            "Junte o vinho branco, raspando o fundo, e deixe evaporar por 2 minutos.",
            "Retire os pedaços crocantes e reserve sobre papel-toalha.",
            "Na gordura que ficou na frigideira, junte a pimenta e o tomate amassado e cozinhe por 12 minutos.",
            "Enquanto isso, cozinhe a massa em água fervente com sal até ficar al dente.",
            "Junte a massa ao molho e desligue o fogo. Acrescente o guanciale crocante e finalize com o pecorino.",
        ],
        notes=[
            ("Erro comum", "Fritar o guanciale em azeite: a gordura dele já basta e é a base de sabor do molho."),
        ],
        tip="Reservar o guanciale e só devolvê-lo no final mantém a carne crocante, em contraste com a massa macia.",
    ),
    dict(
        slug="pesto", module="02", img="12_pesto",
        title="Pesto alla genovese",
        tag="No pilão ou no processador, sem fogo",
        intro="O aroma fresco da Ligúria: verde vivo e textura aveludada.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "10 min"),
              ("Cozimento", "sem fogo (só a massa)"), ("Nível", "Fácil")],
        ingredients=[
            ("Pesto", [
                "70 g de folhas de manjericão fresco, limpas e bem secas",
                "30 g de pinoli ou castanha-de-caju, tostados",
                "1 dente de alho",
                "1 pitada de sal grosso",
                "60 g de parmigiano reggiano ou grana padano ralado",
                "30 g de pecorino romano ralado",
                "100 ml de azeite extravirgem (cerca de 7 colheres de sopa)",
            ]),
            ("Para servir", [
                "400 g de massa seca",
                "2 colheres (sopa) da água do cozimento",
            ]),
        ],
        steps=[
            "No pilão ou no processador, amasse o alho com o sal grosso até formar uma pasta.",
            "Junte os pinoli (ou as castanhas) e amasse até triturar.",
            "Acrescente o manjericão aos poucos. No processador, use o modo pulsar, em toques curtos.",
            "Incorpore os queijos e junte o azeite em fio contínuo, misturando delicadamente.",
            "Cozinhe a massa em água fervente com sal até ficar al dente.",
            "Fora do fogo, misture o pesto à massa quente com a água do cozimento. Nunca leve o pesto ao fogo.",
        ],
        notes=[
            ("Erro comum", "Aquecer o pesto na panela: o calor escurece o manjericão e separa o azeite do queijo."),
        ],
        tip="Se usar processador, deixe a lâmina 10 minutos no congelador antes: o calor do atrito escurece o manjericão.",
    ),
    dict(
        slug="burro-salvia", module="02", img="13_burro_salvia",
        title="Burro e salvia",
        tag="Manteiga dourada e sálvia",
        intro="Simplicidade que valoriza massas recheadas e nhoques caseiros.",
        meta=[("Rendimento", "3 a 4 porções"), ("Preparo", "5 min"),
              ("Cozimento", "5 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Molho", [
                "100 g de manteiga sem sal (cerca de 7 colheres de sopa)",
                "12–15 folhas de sálvia fresca",
                "80 g de parmigiano reggiano ralado na hora",
                "Sal e pimenta-do-reino moída a gosto",
            ]),
            ("Para servir", [
                "Ravioli (receita 15), tortellini (receita 16) ou nhoque (receita 06), cozidos",
                "1 concha da água do cozimento",
            ]),
        ],
        steps=[
            "Derreta a manteiga em fogo baixo em uma frigideira larga.",
            "Quando a manteiga começar a espumar, junte as folhas de sálvia inteiras.",
            "Deixe a manteiga tostar suavemente até ficar dourada, cor de avelã (manteiga noisette), e a sálvia ficar crocante.",
            "Junte a concha de água do cozimento e mexa em círculos para formar uma emulsão cremosa.",
            "Acrescente a massa recheada ou os nhoques e salteie. Fora do fogo, finalize com o queijo, o sal e a pimenta.",
        ],
        notes=[
            ("Erro comum", "Deixar a manteiga escurecer demais: de dourada a queimada e amarga leva poucos segundos."),
        ],
        tip="O ponto de manteiga dourada (noisette) traz notas de avelã que transformam o prato.",
    ),
    dict(
        slug="aglio-olio", module="02", img="14_aglio_olio",
        title="Aglio, olio e peperoncino",
        tag="Alho, azeite e pimenta",
        intro="O clássico italiano de fim de noite: picante, com alho dourado e molho acetinado.",
        meta=[("Rendimento", "2 porções"), ("Preparo", "15 min"),
              ("Cozimento", "8 min (molho)"), ("Nível", "Fácil")],
        ingredients=[
            ("Ingredientes", [
                "250 g de spaghetti",
                "80 ml de azeite extravirgem (⅓ de xícara)",
                "4 dentes de alho em lâminas finas",
                "1 pimenta dedo-de-moça picada (ou peperoncino seco)",
                "Salsinha picada a gosto",
                "1 concha da água do cozimento",
            ]),
        ],
        steps=[
            "Coloque o spaghetti para cozinhar em água fervente com sal: ele deve estar bem al dente quando o molho ficar pronto.",
            "Coloque o azeite e o alho em uma frigideira fria e ligue em fogo baixíssimo.",
            "Cozinhe o alho devagar, por 4–5 minutos, até dourar levemente.",
            "Junte a pimenta 30 segundos antes de o alho terminar de dourar.",
            "Despeje a concha de água do cozimento (cuidado com os respingos) e ferva por 1 minuto para emulsionar.",
            "Junte o spaghetti, desligue o fogo, acrescente a salsinha e misture até cada fio ficar envolvido pelo azeite.",
        ],
        notes=[
            ("Erro comum", "Queimar o alho: escuro, ele fica amargo e compromete o prato."),
        ],
        tip="Começar o alho no azeite frio faz com que ele cozinhe por dentro antes de dourar por fora, com sabor doce e suave.",
    ),

    # ───────────────────────── MÓDULO 03 ─────────────────────────
    dict(
        slug="ravioli", module="03", img="15_ravioli",
        title="Ravioli de ricota e espinafre",
        tag="Tradição italiana",
        intro="Recheio cremoso e suave envolvido por massa fina e delicada aos ovos.",
        meta=[("Rendimento", "4 porções (24 ravioli)"), ("Preparo", "40 min"),
              ("Cozimento", "3 min"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "1 receita de massa clássica aos ovos (receita 01), aberta em tiras de 1 mm de espessura",
            ]),
            ("Recheio", [
                "300 g de ricota fresca bem drenada",
                "150 g de espinafre refogado, bem escorrido e picado fino",
                "50 g de parmesão ralado",
                "1 gema",
                "Noz-moscada, sal e pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Misture a ricota, o espinafre, o parmesão, a gema, a noz-moscada, o sal e a pimenta até obter uma pasta homogênea.",
            "Sobre uma tira de massa, distribua porções de recheio do tamanho de uma noz, com 4 cm de distância entre elas.",
            "Pincele água ao redor do recheio e cubra com outra tira de massa.",
            "Pressione com os dedos ao redor de cada porção, do centro para as bordas, expulsando todo o ar.",
            "Corte com carretilha ou cortador redondo.",
            "Cozinhe em água com sal em fervura branda (fogo médio-baixo) por 3 minutos.",
        ],
        notes=[
            ("Controle de umidade", "Esprema a ricota em um pano limpo: recheio úmido amolece a massa crua. Fervura forte pode romper os ravioli; mantenha a água em fervura branda."),
            ("Conservação", "Crus, cozinhe no mesmo dia ou congele em assadeira polvilhada com sêmola e depois guarde em saco. Cozinhe sem descongelar."),
        ],
        tip="Expulsar todo o ar de dentro do ravioli evita que ele infle e estoure na água quente.",
    ),
    dict(
        slug="tortellini", module="03", img="16_tortellini",
        title="Tortellini de queijo e ervas",
        tag="Dobrado à mão",
        intro="O formato símbolo da Emília-Romanha, dobrado à mão ao redor do dedo indicador.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "45 min"),
              ("Cozimento", "3 min"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "1 receita de massa clássica aos ovos (receita 01), aberta a 1 mm",
            ]),
            ("Recheio", [
                "200 g de queijo fontina ou muçarela de búfala, picado",
                "100 g de ricota",
                "50 g de parmigiano ralado",
                "Ervas frescas picadas a gosto (salsinha, manjericão ou tomilho)",
            ]),
        ],
        steps=[
            "Misture os queijos e as ervas até formar uma pasta. Se usar muçarela de búfala, escorra-a bem antes de picar.",
            "Abra a massa bem fina (1 mm) e corte quadrados de 4 × 4 cm.",
            "Coloque uma bolinha de recheio no centro de cada quadrado.",
            "Dobre em triângulo, pressionando as bordas para selar.",
            "Una as duas pontas da base do triângulo ao redor do dedo indicador, pressionando para colar.",
            "Vire a ponta de cima para trás, formando o “umbigo” característico do tortellini.",
            "Cozinhe em água fervente com sal por 3 minutos.",
        ],
        notes=[
            ("Erro comum", "Rechear demais: o excesso vaza pelas bordas e impede a selagem."),
            ("Conservação", "Crus, cozinhe no mesmo dia ou congele em assadeira e depois guarde em saco."),
        ],
        left=["Erro comum"],
        tip="Mantenha os quadrados cobertos com filme enquanto dobra os outros, para as bordas não ressecarem.",
    ),
    dict(
        slug="lasanha", module="03", img="17_lasanha",
        title="Lasanha alla bolognese",
        tag="Massa aos ovos, ragù e bechamel",
        intro="Camadas de massa fresca aos ovos, ragù de cozimento lento e bechamel aveludado.",
        meta=[("Rendimento", "6 a 8 porções"), ("Preparo", "30 min"),
              ("Forno", "190 °C, 30–35 min"), ("Nível", "Médio")],
        ingredients=[
            ("Montagem", [
                "12 folhas de massa fresca aos ovos (receita 01)",
                "600 g de ragù alla bolognese (receita 08)",
                "750 ml de bechamel (1½ receita do molho 25)",
                "150 g de parmigiano reggiano ralado",
                "20 g de manteiga para untar (1½ colher de sopa)",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 190 °C.",
            "Cozinhe as folhas de massa em água fervente com sal por apenas 60 segundos e passe para água com gelo.",
            "Seque as folhas sobre um pano de prato limpo.",
            "Unte um refratário com a manteiga e espalhe uma camada fina de bechamel no fundo.",
            "Alterne massa, ragù, bechamel e parmigiano, em 4 ou 5 camadas.",
            "Termine com bastante bechamel e parmigiano por cima.",
            "Asse por 30–35 minutos, até gratinar e dourar.",
            "Deixe descansar 15 minutos fora do forno antes de cortar.",
        ],
        notes=[
            ("Arquitetura das camadas", "O bechamel no fundo e no topo evita que as bordas ressequem no forno. Não exagere no recheio de cada camada, para a lasanha se sustentar. O descanso fora do forno firma os queijos e garante fatias limpas."),
        ],
        tip="Deixe a lasanha descansar 15 minutos antes de cortar: ela assenta e as fatias saem inteiras, sem desmanchar.",
    ),
    dict(
        slug="cannelloni", module="03", img="18_cannelloni",
        title="Cannelloni de frango com ervas",
        tag="Ao molho pomodoro, gratinado",
        intro="Rolinhos de massa fresca recheados com frango desfiado cremoso, gratinados no forno.",
        meta=[("Rendimento", "4 a 6 porções (10 cannelloni)"), ("Preparo", "30 min"),
              ("Forno", "200 °C, 25 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Recheio", [
                "400 g de peito de frango cozido e bem desfiado",
                "200 g de requeijão cremoso ou ricota temperada",
                "2 colheres (sopa) de ervas frescas picadas (salsinha e cebolinha)",
                "Sal e noz-moscada a gosto",
            ]),
            ("Montagem", [
                "10 folhas de massa fresca aos ovos de 12 × 15 cm (receita 01)",
                "400 ml de molho pomodoro (receita 07)",
                "50 g de parmesão ralado",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 200 °C.",
            "Misture o frango, o requeijão (ou a ricota), as ervas, o sal e a noz-moscada.",
            "Cozinhe as folhas de massa em água fervente com sal por 1 minuto e seque sobre um pano.",
            "Divida o recheio entre as folhas (cerca de 60 g, ou 4 colheres de sopa, cada), coloque em uma das pontas e enrole sem apertar, formando um tubo.",
            "Cubra o fundo de um refratário com parte do molho e acomode os cannelloni lado a lado.",
            "Cubra com o restante do molho e polvilhe o parmesão.",
            "Asse por 25 minutos, até borbulhar e dourar.",
        ],
        notes=[
            ("Erro comum", "Enrolar apertado demais: a massa precisa de espaço para expandir no forno."),
        ],
        tip="Cubra totalmente os cannelloni com o molho, para que as pontas da massa não ressequem no forno.",
    ),
    dict(
        slug="nhoque-4-queijos", module="03", img="19_nhoque_4queijos",
        title="Nhoque gratinado aos quatro queijos",
        tag="Fonduta cremosa ao forno",
        intro="Nhoque de batata envolvido em uma fonduta cremosa de queijos e gratinado.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "15 min"),
              ("Forno", "220 °C, 12–15 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Nhoque", [
                "600 g de nhoque de batata (cerca de ¾ da receita 06)",
            ]),
            ("Fonduta", [
                "250 ml de creme de leite fresco (cerca de 1 xícara)",
                "100 g de gorgonzola ou outro queijo azul, picado",
                "100 g de queijo fontina ou muçarela, ralado",
                "50 g de provolone ralado",
                "80 g de parmigiano reggiano ralado",
            ]),
        ],
        steps=[
            "Preaqueça o forno a 220 °C.",
            "Em uma panela, aqueça o creme de leite em fogo baixo, sem deixar ferver.",
            "Junte o gorgonzola, o fontina, o provolone e metade do parmigiano e mexa até derreter por completo.",
            "Cozinhe os nhoques em água fervente com sal e retire assim que subirem à superfície.",
            "Misture os nhoques à fonduta e transfira para um refratário.",
            "Cubra com o restante do parmigiano e leve ao forno por 12–15 minutos, até gratinar.",
        ],
        notes=[
            ("Erro comum", "Ferver o molho de queijo em fogo alto: a gordura se separa e a textura fica arenosa."),
        ],
        tip="Use creme de leite fresco (cerca de 35% de gordura): o creme de leite de caixinha talha com facilidade em temperatura alta.",
    ),
    dict(
        slug="rondelli", module="03", img="20_rondelli",
        title="Rondelli de queijos ao molho rosé",
        tag="Rocambole de massa, fatiado e assado",
        intro="Rodelas de massa recheada com queijos, assadas em molho aveludado de tomate e creme.",
        meta=[("Rendimento", "5 porções"), ("Preparo", "25 min + 20 min de geladeira"),
              ("Forno", "190 °C, 25 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa e recheio", [
                "2 folhas grandes de massa fresca aos ovos (receita 01)",
                "250 g de muçarela ralada",
                "150 g de queijo prato ou provolone ralado",
                "100 g de ricota amassada",
            ]),
            ("Molho rosé", [
                "400 ml de molho pomodoro (receita 07)",
                "200 ml de creme de leite fresco (¾ de xícara + 1 colher de sopa)",
            ]),
        ],
        steps=[
            "Cozinhe as folhas de massa em água fervente com sal por 1 minuto, passe por água fria e seque.",
            "Abra as folhas sobre filme plástico.",
            "Misture os queijos e espalhe por igual sobre toda a superfície da massa.",
            "Enrole firme, como um rocambole, e leve à geladeira por 20 minutos para firmar.",
            "Preaqueça o forno a 190 °C. Aqueça o pomodoro com o creme de leite, sem ferver, para fazer o molho rosé.",
            "Corte fatias de 2,5 cm com uma faca bem afiada.",
            "Espalhe parte do molho em um refratário, acomode os rondelli deitados e cubra com o restante.",
            "Asse por 25 minutos.",
        ],
        notes=[
            ("Erro comum", "Cortar com faca cega: ela esmaga o rondelli e expulsa o recheio."),
        ],
        tip="Gelar o rocambole antes de cortar deixa as rodelas bem redondas, sem amassar.",
    ),

    # ───────────────────────── MÓDULO 04 ─────────────────────────
    dict(
        slug="sugo-cereja", module="04", img="21_sugo_cereja",
        title="Sugo rápido de tomate-cereja",
        tag="Tomates tostados no azeite",
        intro="Tomates-cereja caramelizados no azeite, com alho e manjericão, prontos em cerca de 15 minutos.",
        meta=[("Rendimento", "2 a 3 porções"), ("Preparo", "5 min"),
              ("Cozimento", "10 min"), ("Nível", "Muito fácil")],
        ingredients=[
            ("Molho", [
                "400 g de tomate-cereja ou sweet grape maduros, cortados ao meio",
                "60 ml de azeite extravirgem (4 colheres de sopa)",
                "2 dentes de alho fatiados",
                "1 xícara de folhas de manjericão fresco",
                "Sal e pimenta-do-reino a gosto",
            ]),
            ("Para servir", [
                "250 g de massa seca",
                "2 colheres (sopa) da água do cozimento",
            ]),
        ],
        steps=[
            "Coloque a massa para cozinhar em água fervente com sal.",
            "Aqueça o azeite em fogo alto em uma frigideira larga.",
            "Junte os tomates com o lado cortado para baixo e deixe dourar por 3 minutos, sem mexer, até caramelizar.",
            "Junte o alho e metade do manjericão, abaixe o fogo e pressione alguns tomates para soltar o suco. Tempere com sal e pimenta.",
            "Junte a massa al dente e a água do cozimento e misture em fogo alto por 1 minuto.",
            "Finalize com o manjericão restante.",
        ],
        notes=[
            ("Erro comum", "Mexer os tomates assim que entram na frigideira: isso impede a caramelização dos açúcares naturais."),
        ],
        tip="Deixar o tomate tostar sem mexer no início cria notas levemente defumadas, que lembram o forno a lenha.",
    ),
    dict(
        slug="gorgonzola", module="04", img="22_gorgonzola",
        title="Molho de gorgonzola e nozes",
        tag="Cremoso, com nozes tostadas",
        intro="Rico e aveludado, com a crocância das nozes tostadas. Combina com fettuccine e nhoque.",
        meta=[("Rendimento", "3 porções"), ("Preparo", "5 min"),
              ("Cozimento", "8 min"), ("Nível", "Muito fácil")],
        ingredients=[
            ("Molho", [
                "150 g de gorgonzola doce (dolce), picado",
                "150 ml de creme de leite fresco (½ xícara + 2 colheres de sopa)",
                "50 g de nozes picadas",
                "1 colher (chá) de manteiga",
                "Noz-moscada e pimenta-do-reino a gosto",
            ]),
            ("Para servir", [
                "300 g de massa seca (ou cerca de 400 g de fettuccine fresco ou nhoque)",
            ]),
        ],
        steps=[
            "Toste as nozes em uma frigideira seca por 2 minutos e reserve.",
            "Na mesma frigideira, em fogo baixo, derreta a manteiga com o gorgonzola.",
            "Junte o creme de leite e misture com um batedor de arame até o queijo se dissolver.",
            "Deixe reduzir suavemente por 4 minutos, até ficar aveludado.",
            "Tempere com noz-moscada e pimenta. Não acrescente sal.",
            "Junte a massa cozida, salteie e finalize com as nozes por cima.",
        ],
        notes=[
            ("Erro comum", "Salgar o molho: o gorgonzola já é salgado o suficiente."),
        ],
        tip="Tostar as nozes antes elimina a umidade e realça o sabor dos seus óleos naturais.",
    ),
    dict(
        slug="puttanesca", module="04", img="23_puttanesca",
        title="Molho alla puttanesca",
        tag="Azeitonas, alcaparras e anchova",
        intro="Sabor intenso do sul da Itália, com azeitonas pretas, alcaparras e um toque de anchova.",
        meta=[("Rendimento", "3 a 4 porções"), ("Preparo", "5 min"),
              ("Cozimento", "12 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Molho", [
                "400 g de tomate pelado amassado",
                "45 ml de azeite extravirgem (3 colheres de sopa)",
                "2 dentes de alho picados",
                "3 filés de anchova em conserva (opcional, mas tradicional)",
                "60 g de azeitonas pretas sem caroço (cerca de 12)",
                "1 colher (sopa) de alcaparras lavadas",
                "½ colher (chá) de pimenta calabresa",
                "1 punhado de salsinha fresca picada",
            ]),
            ("Para servir", [
                "350 g de spaghetti",
            ]),
        ],
        steps=[
            "Coloque o spaghetti para cozinhar em água fervente com sal.",
            "Aqueça o azeite em fogo médio e junte o alho e as anchovas.",
            "Mexa com a colher até as anchovas se desfazerem por completo no azeite.",
            "Junte as azeitonas, as alcaparras e a pimenta e refogue por 2 minutos.",
            "Acrescente o tomate e cozinhe em fogo médio por 10 minutos.",
            "Misture ao spaghetti al dente e finalize com a salsinha.",
        ],
        notes=[
            ("Erro comum", "Usar alcaparras sem lavar: a salmoura salga demais o prato."),
        ],
        tip="A anchova não deixa gosto de peixe: ela se desfaz no azeite e reforça o sabor (umami) da base do molho.",
    ),
    dict(
        slug="cogumelos", module="04", img="24_cogumelos",
        title="Molho de cogumelos com manteiga e tomilho",
        tag="Cogumelos dourados, molho brilhante",
        intro="Terroso, aromático e elegante. Perfeito com pappardelle ou fettuccine.",
        meta=[("Rendimento", "3 porções"), ("Preparo", "10 min"),
              ("Cozimento", "10 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Molho", [
                "300 g de cogumelos frescos variados (paris, shimeji ou portobello), fatiados",
                "40 g de manteiga sem sal gelada (cerca de 3 colheres de sopa)",
                "30 ml de azeite extravirgem (2 colheres de sopa)",
                "1 dente de alho ralado",
                "2 ramos de tomilho fresco",
                "60 ml de vinho branco seco (4 colheres de sopa)",
                "Sal e pimenta-do-reino a gosto",
            ]),
            ("Para servir", [
                "300 g de pappardelle ou fettuccine secos (ou cerca de 400 g frescos)",
                "Água do cozimento da massa",
            ]),
        ],
        steps=[
            "Limpe os cogumelos com papel-toalha ou pincel, sem lavar.",
            "Aqueça o azeite e metade da manteiga em fogo alto, até a frigideira ficar bem quente.",
            "Espalhe os cogumelos sem sobrepor e deixe dourar por 4 minutos, sem mexer, até formar uma crosta.",
            "Junte o alho, o tomilho e o vinho, raspando o fundo da frigideira.",
            "Junte a massa cozida, o restante da manteiga gelada e um pouco da água do cozimento, mexendo até formar um molho brilhante.",
            "Tempere com sal e pimenta só no final.",
        ],
        notes=[
            ("Erro comum", "Lavar os cogumelos em água corrente: eles absorvem água como esponjas e não douram."),
        ],
        tip="Não salgue os cogumelos no início: o sal puxa a água e eles cozinham no próprio vapor em vez de dourar.",
    ),
    dict(
        slug="bechamel", module="04", img="25_molho_branco",
        title="Molho bechamel",
        tag="Molho branco aveludado",
        intro="A base francesa adotada pela cozinha italiana em lasanhas e gratinados. É usada na lasanha (receita 17).",
        meta=[("Rendimento", "500 ml de molho"), ("Preparo", "5 min"),
              ("Cozimento", "10 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Molho", [
                "40 g de manteiga sem sal (cerca de 3 colheres de sopa)",
                "40 g de farinha de trigo (⅓ de xícara)",
                "500 ml de leite integral morno (cerca de 2 xícaras)",
                "1 pitada generosa de noz-moscada ralada na hora",
                "Sal e pimenta-do-reino branca a gosto",
            ]),
        ],
        steps=[
            "Derreta a manteiga em fogo médio em uma panela de fundo grosso.",
            "Junte a farinha de uma vez e mexa com o batedor de arame por 2 minutos, sem deixar dourar (roux claro).",
            "Despeje o leite morno aos poucos, batendo vigorosamente para não empelotar.",
            "Cozinhe em fogo baixo, mexendo sempre, até engrossar e cobrir as costas de uma colher (ponto napê).",
            "Tempere com sal, pimenta branca e a noz-moscada.",
        ],
        notes=[
            ("Erro comum", "Cozinhar o roux por pouco tempo: o molho fica com gosto de farinha crua."),
        ],
        left=["Erro comum"],
        tip="Leite morno sobre o roux quente é o que evita os grumos: a farinha se dispersa por igual antes de engrossar o molho.",
    ),

    # ───────────────────────── MÓDULO 05 ─────────────────────────
    dict(
        slug="pizza", module="05", img="26_pizza",
        title="Massa de pizza de fermentação lenta",
        tag="24 horas na geladeira, para forno doméstico",
        intro="Borda alta, aerada e crocante, pensada para assar na temperatura máxima do forno de casa.",
        meta=[("Rendimento", "3 pizzas de 30 cm"), ("Preparo", "20 min"),
              ("Fermentação", "24 h na geladeira + 2 h"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "500 g de farinha de trigo com 10–12% de proteína (cerca de 4¼ xícaras)",
                "330 ml de água filtrada fria (cerca de 1⅓ xícara; 66% de hidratação)",
                "3 g de fermento biológico seco (1 colher de chá rasa)",
                "12 g de sal fino (2 colheres de chá)",
                "15 ml de azeite (1 colher de sopa), mais um pouco para untar o pote",
            ]),
        ],
        steps=[
            "Dissolva o fermento na água fria em uma tigela.",
            "Junte a farinha aos poucos e misture até formar uma massa rústica.",
            "Acrescente o sal e o azeite e sove por 8 minutos, até a massa ficar lisa.",
            "Coloque em um pote untado com azeite, tampe bem e leve à geladeira por 24 horas (fermentação lenta).",
            "Divida em 3 bolas de cerca de 280 g e deixe crescer, cobertas, em temperatura ambiente por 2 horas.",
            "Preaqueça o forno a 250 °C (ou na temperatura máxima) com a assadeira dentro, por 30 minutos.",
            "Abra cada bola com as pontas dos dedos, cubra a gosto e asse sobre a assadeira bem quente por 8–10 minutos.",
        ],
        notes=[
            ("Erro comum", "Abrir a pizza com rolo: a borda fica baixa e densa, como um biscoito."),
        ],
        left=["Erro comum"],
        tip="Abra a massa só com as mãos, empurrando o ar do centro para as bordas. O rolo destrói as bolhas que formam a borda aerada.",
    ),
    dict(
        slug="focaccia", module="05", img="27_focaccia",
        title="Focaccia genovese com alecrim",
        tag="Crocante por fora, macia por dentro",
        intro="Crosta dourada, miolo macio e as covinhas clássicas cheias de azeite e sal grosso.",
        meta=[("Rendimento", "1 assadeira de 30 × 40 cm"), ("Preparo", "20 min"),
              ("Fermentação", "cerca de 3 h"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "500 g de farinha de trigo (cerca de 4¼ xícaras)",
                "380 ml de água morna (1½ xícara + 1 colher de sopa; 76% de hidratação)",
                "5 g de fermento biológico seco (1½ colher de chá)",
                "10 g de sal fino (1¾ colher de chá)",
                "20 ml de azeite extravirgem (1 colher de sopa + 1 colher de chá)",
            ]),
            ("Assadeira e cobertura", [
                "Azeite para untar bem a assadeira (cerca de 45 ml)",
                "30 ml de azeite + 30 ml de água morna (2 colheres de sopa de cada)",
                "Sal grosso e alecrim fresco a gosto",
            ]),
        ],
        steps=[
            "Misture a água, o fermento e a farinha em uma tigela até formar uma massa muito úmida e macia.",
            "Junte o sal e os 20 ml de azeite. Faça 3 séries de dobras, com 15 minutos de intervalo entre elas.",
            "Transfira para a assadeira bem untada com azeite e deixe crescer por 2 horas, até dobrar de volume.",
            "Preaqueça o forno a 220 °C.",
            "Bata o azeite e a água morna da cobertura e regue a massa.",
            "Afunde as pontas dos dedos em toda a massa, formando as covinhas. Salpique sal grosso e alecrim.",
            "Asse por cerca de 22 minutos, até dourar.",
        ],
        notes=[
            ("Erro comum", "Economizar no azeite da assadeira: é ele que frita a base da focaccia e a deixa crocante."),
        ],
        tip="A emulsão de azeite e água morna sobre a massa, antes de assar, deixa a crosta dourada sem ressecar.",
    ),
    dict(
        slug="bruschetta", module="05", img="28_bruschetta",
        title="Bruschetta de tomate e manjericão",
        tag="Antepasto clássico",
        intro="Pão rústico tostado, alho fresco e tomates perfumados: o antepasto italiano mais conhecido.",
        meta=[("Rendimento", "6 fatias"), ("Preparo", "10 min + 10 min de marinada"),
              ("Forno", "200 °C, cerca de 5 min"), ("Nível", "Muito fácil")],
        ingredients=[
            ("Ingredientes", [
                "6 fatias de pão italiano ou de fermentação natural, com 1,5 cm de espessura",
                "3 tomates italianos maduros e firmes, sem sementes, em cubos pequenos",
                "1 dente de alho cru, cortado ao meio",
                "60 ml de azeite extravirgem (4 colheres de sopa)",
                "Folhas de manjericão fresco, sal e pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Em uma tigela, tempere o tomate com 3 colheres (sopa) do azeite, sal, pimenta e manjericão rasgado. Deixe marinar por 10 minutos.",
            "Toste as fatias de pão no forno preaquecido a 200 °C (cerca de 5 minutos) ou na grelha, até ficarem firmes e crocantes por fora.",
            "Com o pão ainda quente, esfregue o alho cortado sobre a superfície: a crosta funciona como uma lixa.",
            "Distribua o tomate sobre as fatias.",
            "Finalize com a colher (sopa) de azeite restante e sirva imediatamente.",
        ],
        notes=[
            ("Erro comum", "Colocar o tomate no pão frio ou montar com muita antecedência: a torrada amolece."),
        ],
        left=["Erro comum"],
        tip="Esfregar o alho cru no pão quente transfere só o aroma, sem pedaços de alho na mordida.",
    ),
]

# Harmonização de massas & molhos (original p. 38).
PAIRINGS_INTRO = "Como combinar o formato da massa com a textura do molho."
PAIRINGS_HEAD = ("Formato da massa", "Molhos ideais", "Cozimento")
PAIRINGS = [
    ("Tagliolini / fitas finas", "Manteiga e sálvia, molhos leves", "1½–2 min"),
    ("Fettuccine / tagliatelle", "Ragù alla bolognese, pomodoro com ervas", "2–3 min"),
    ("Pappardelle", "Ragus encorpados de carne", "3–3½ min"),
    ("Spaghetti / bucatini", "Carbonara, cacio e pepe, amatriciana",
     "Frescos: 2–3 min · secos: conforme a embalagem"),
    ("Cavatelli / orecchiette", "Pesto alla genovese, brócolis e alho", "4–5 min"),
    ("Nhoque de batata", "Quatro queijos gratinado, pomodoro", "1–2 min (até boiar)"),
    ("Ravioli e tortellini", "Manteiga dourada, caldos claros", "3–4 min"),
    ("Lasanha e cannelloni", "Ragù com bechamel, ao forno",
     "Forno: lasanha 30–35 min · cannelloni 25 min"),
]
PAIRINGS_QUOTE = "A combinação certa transforma ingredientes simples em memórias à mesa."
PAIRINGS_CAPTION = "Um jantar italiano em casa, com método simples e organizado."

# Encerramento (original p. 39).
CLOSING = dict(
    title="Cozinhar é criar laços; compartilhar é a tradição.",
    text="Que cada preparação deste guia leve mais sabor, presença e afeto à sua mesa.",
    signoff="Buon appetito!",
    credit="Norqva Gastronomia Digital · Edição Digital 2026",
)
