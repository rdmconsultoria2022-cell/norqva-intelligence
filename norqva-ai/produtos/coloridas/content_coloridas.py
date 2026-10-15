# -*- coding: utf-8 -*-
"""Conteúdo das receitas de Massas Coloridas (Volume VI da coleção Cozinha Italiana em Casa).

Mesma estrutura dos Volumes III a V: slug, title, tag, intro, meta (4 itens), ingredients (grupos), steps, notes, tip e,
opcional, left (notas que vão para a coluna dos ingredientes).
Medidas caseiras: líquidos 240 ml/xícara, 15 ml/colher de sopa, 5 ml/colher de chá; farinha de trigo ≈ 120 g/xícara;
sêmola ≈ 150 g/xícara; parmesão ralado fino ≈ 80 g/xícara; manteiga ≈ 15 g/colher de sopa; sal fino ≈ 6 g/colher de chá;
ovo grande ≈ 50 g sem casca, gema ≈ 18 g.
Todas as massas de cor (01 a 08) partem de 400 g de farinha + sêmola e rendem cerca de 600 g de massa (4 a 5 porções).
Regra do livro: ovos + ingrediente de cor ≈ metade do peso da farinha (página 04).
"""

FARINHA = "300 g de farinha de trigo tipo 00 ou comum (2½ xícaras)"
SEMOLA = "100 g de sêmola de trigo duro (cerca de ⅔ de xícara)"
SAL = "1 pitada de sal fino"
COZ = "Cozinhe a massa em água fervente com sal por 2 a 3 minutos, até ficar macia com leve resistência ao morder. Reserve 1 xícara da água do cozimento."

RECIPES = [
    dict(
        slug="amarela", left=["Sem açafrão"],
        title="Tagliatelle amarelas de açafrão",
        tag="A massa base do livro, com abobrinha, limão e parmesão",
        intro="Esta é a massa que serve de molde para todas as outras: farinha, sêmola e ovos, com açafrão para deixar o amarelo "
              "mais vivo. Aprenda aqui o ponto da massa; nas receitas seguintes, muda só o ingrediente que dá a cor.",
        meta=[("Rendimento", "4 a 5 porções (cerca de 600 g de massa)"), ("Preparo", "40 min"),
              ("Descanso", "30 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                FARINHA, SEMOLA,
                "3 ovos grandes e 2 gemas, em temperatura ambiente",
                "1 envelope de açafrão verdadeiro em pó (0,1 g; não é o açafrão-da-terra) dissolvido em 15 ml de água morna (1 colher de sopa), ou 1 colher de chá de cúrcuma (3 g) com 15 ml de água",
                SAL,
            ]),
            ("Molho", [
                "2 abobrinhas médias em palitos finos (cerca de 400 g)",
                "45 ml de azeite (3 colheres de sopa)",
                "2 dentes de alho fatiados",
                "Raspas de 1 limão-siciliano",
                "50 g de parmesão ralado fino (⅔ de xícara)",
                "Sal e pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Misture a farinha e a sêmola na bancada e abra um buraco no centro. Bata os ovos e as gemas com o açafrão dissolvido (ou a cúrcuma) e o sal e despeje no centro.",
            "Com um garfo, puxe a farinha das bordas aos poucos até formar uma massa grossa. Sove por 8 a 10 minutos, até ficar lisa, elástica e com a cor uniforme, sem riscos (página 04).",
            "Embrulhe em filme e deixe descansar 30 minutos em temperatura ambiente.",
            "Divida em 4 partes. Abra cada uma com o rolo até 1 a 1,5 mm, polvilhando sêmola. Enrole a folha sem apertar, corte tiras de 6 a 8 mm, solte e forme ninhos.",
            "Para o molho, aqueça o azeite numa frigideira grande em fogo médio, doure o alho por 1 minuto e junte a abobrinha e sal. Salteie por 4 a 5 minutos, até ficar macia nas bordas e ainda verde.",
            COZ,
            "Passe a massa para a frigideira, junte as raspas de limão, metade do parmesão e 3 a 4 colheres de sopa da água reservada. Mexa por 1 minuto, até o molho envolver os fios. Sirva com o restante do queijo e pimenta.",
        ],
        notes=[
            ("Água do cozimento", "1 litro de água e 10 g de sal (2 colheres de chá rasas) para cada 100 g de massa. Vale para todas as receitas do livro."),
            ("Sem açafrão", "A cúrcuma dá um amarelo forte e quase não muda o sabor. Sem nenhum dos dois, a massa fica amarelo-clara, só com a cor das gemas."),
            ("Segurança", "Massa crua com ovo, ainda úmida, não fica mais de 2 horas fora da geladeira (a secagem completa dos ninhos é a exceção, veja a receita 12). Não prove a massa crua."),
        ],
        tip="Se a massa estiver dura e quebradiça ao sovar, molhe só as mãos e continue. Se estiver grudando, polvilhe farinha às colheradas.",
    ),
    dict(
        slug="verde", left=["Ponto"],
        title="Pappardelle verdes de ervas",
        tag="Manjericão e salsinha, com tomate-cereja e parmesão",
        intro="Um verde-claro e perfumado, feito só com ervas frescas. Para um verde mais escuro, de espinafre, "
              "use a massa verde do Trattoria em Casa (Volume I, receita 03).",
        meta=[("Rendimento", "4 a 5 porções"), ("Preparo", "50 min"),
              ("Descanso", "30 min"), ("Nível", "Médio")],
        ingredients=[
            ("Cor", [
                "60 g de folhas de manjericão (cerca de 3 xícaras, sem apertar)",
                "30 g de folhas de salsinha (cerca de 1½ xícara)",
            ]),
            ("Massa", [FARINHA, SEMOLA, "3 ovos grandes", SAL]),
            ("Molho", [
                "400 g de tomate-cereja cortados ao meio",
                "45 ml de azeite (3 colheres de sopa)",
                "1 dente de alho amassado",
                "50 g de parmesão em lascas",
                "Folhas de manjericão para servir",
            ]),
        ],
        steps=[
            "Ferva água numa panela e prepare uma tigela com água e gelo. Mergulhe as ervas por 10 segundos e passe direto para o gelo: é isso que mantém o verde (página 04).",
            "Escorra e esprema as ervas com as mãos, com força, até não sair mais água. Bata no mixer ou liquidificador com os ovos e o sal até virar um creme verde liso.",
            "Faça o monte de farinha e sêmola, despeje o creme no centro e forme a massa. Sove por 10 minutos.",
            "Embrulhe em filme e descanse 30 minutos. Abra até 1,5 mm e corte tiras largas, de 2 a 2,5 cm, com faca ou carretilha.",
            "Para o molho, aqueça o azeite com o alho em fogo médio por 1 minuto, junte os tomates e sal e salteie por 5 minutos, até começarem a desmanchar.",
            "Cozinhe a massa em água fervente com sal por 2 a 3 minutos, até ficar macia com leve resistência ao morder. Passe para a frigideira com 3 a 4 colheres de sopa da água do cozimento e misture por 1 minuto.",
            "Sirva com as lascas de parmesão e folhas de manjericão.",
        ],
        notes=[
            ("Por que ferver as ervas", "Crua, a erva batida escurece e deixa a massa verde-amarronzada. Os 10 segundos na água fervente fixam o verde."),
            ("Ponto", "A massa de ervas fica um pouco mais mole que a amarela. Junte farinha às colheradas até ela não grudar nos dedos."),
        ],
        tip="Faça o creme de ervas logo antes da massa: depois de algumas horas, ele perde o verde vivo.",
    ),
    dict(
        slug="rosa", left=["Sem forno"],
        title="Tagliatelle rosa de beterraba",
        tag="Com molho de gorgonzola e nozes",
        intro="A beterraba dá à massa crua um tom forte, entre o vinho e o magenta; depois de cozida, a cor clareia para um rosa mais suave. "
              "O gorgonzola e as nozes equilibram o doce da beterraba.",
        meta=[("Rendimento", "4 a 5 porções"), ("Preparo", "50 min + 1 h de forno"),
              ("Descanso", "30 min"), ("Nível", "Médio")],
        ingredients=[
            ("Cor", ["1 beterraba média (cerca de 200 g)"]),
            ("Massa", [FARINHA, SEMOLA, "2 ovos grandes e 1 gema", SAL]),
            ("Molho", [
                "200 ml de creme de leite fresco (¾ de xícara + 1 colher de sopa)",
                "150 g de gorgonzola em pedaços",
                "50 g de nozes picadas grosseiramente (½ xícara)",
                "Pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Embrulhe a beterraba inteira, com casca, em papel-alumínio e asse em forno preaquecido a 200 °C por 50 a 60 minutos, até a faca entrar sem resistência. Deixe esfriar e descasque com luvas: a beterraba mancha.",
            "Bata a beterraba no mixer até virar um purê liso. Pese 100 g; se estiver ralo, mexa numa frigideira em fogo baixo até engrossar (página 04). Deixe esfriar.",
            "Bata o purê com os ovos, a gema e o sal. Faça o monte de farinha e sêmola, despeje no centro e forme a massa. Sove por 10 minutos, até a cor ficar uniforme.",
            "Embrulhe em filme e descanse 30 minutos. Abra até 1 a 1,5 mm e corte tiras de 6 a 8 mm.",
            "Para o molho, aqueça o creme de leite numa frigideira em fogo baixo, junte o gorgonzola e mexa por 2 a 3 minutos, até derreter, sem deixar ferver forte.",
            "Cozinhe a massa em água fervente com sal por 2 a 3 minutos, até ficar macia com leve resistência ao morder. Passe para o molho com um pouco da água do cozimento e misture.",
            "Sirva com as nozes e pimenta moída na hora.",
        ],
        notes=[
            ("A cor no cozimento", "A beterraba solta cor na água e a massa clareia. Cozinhe só o tempo indicado."),
            ("Sem forno", "Cozinhe a beterraba com casca em água por 40 minutos. O purê fica mais ralo: engrosse na frigideira antes de usar."),
            ("Segurança", "Gestantes: o gorgonzola só é seguro bem quente, com o molho soltando vapor. Na dúvida, troque por 150 g de requeijão cremoso."),
        ],
        tip="Toste as nozes numa frigideira seca por 3 minutos, mexendo, até soltarem aroma. Fazem diferença no prato.",
    ),
    dict(
        slug="vermelha",
        title="Fettuccine vermelho de tomate",
        tag="Com alho, azeite, pimenta e rúcula",
        intro="O extrato de tomate e a páprica doce dão uma massa vermelho-alaranjada, com leve gosto de tomate. "
              "Por isso o molho é simples: alho, azeite e rúcula fresca.",
        meta=[("Rendimento", "4 a 5 porções"), ("Preparo", "40 min"),
              ("Descanso", "30 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                FARINHA, SEMOLA,
                "40 g de extrato de tomate concentrado (2 colheres de sopa cheias)",
                "1 colher de chá de páprica doce (2 g)",
                "3 ovos grandes e 1 gema",
                SAL,
            ]),
            ("Molho", [
                "60 ml de azeite (¼ de xícara)",
                "3 dentes de alho fatiados finos",
                "½ colher de chá de pimenta calabresa (opcional)",
                "50 g de rúcula (cerca de 2 xícaras)",
                "40 g de parmesão ralado fino (½ xícara)",
            ]),
        ],
        steps=[
            "Bata os ovos, a gema, o extrato, a páprica e o sal com um garfo até virar um creme vermelho liso, sem pedaços de extrato.",
            "Faça o monte de farinha e sêmola, despeje o creme no centro e forme a massa. Sove por 8 a 10 minutos, até ficar lisa e com a cor uniforme.",
            "Embrulhe em filme e descanse 30 minutos. Abra até 1,5 mm e corte tiras de 1 cm.",
            "Comece pelo molho: aqueça o azeite com o alho e a pimenta em fogo baixo por 2 a 3 minutos, até o alho ficar dourado-claro, e desligue. Não deixe escurecer: alho queimado amarga.",
            COZ,
            "Passe a massa para a frigideira, junte 3 a 4 colheres de sopa da água reservada e o parmesão e mexa por 1 minuto, até o molho ficar brilhante. Desligue, junte a rúcula e sirva.",
        ],
        notes=[
            ("Com pimentão", "Troque o extrato e a páprica por 80 g de pimentão vermelho assado, sem pele, batido até virar purê grosso, e use só 2 ovos e 1 gema. A cor fica mais alaranjada."),
            ("A cor no cozimento", "A massa vermelha perde pouca cor na água: fica um pouco mais alaranjada."),
        ],
        tip="Escolha extrato de tomate só com tomate e sal no rótulo. Os que levam açúcar ou amido deixam a massa adocicada e mudam o ponto.",
    ),
    dict(
        slug="laranja", left=["Com abóbora"],
        title="Pappardelle laranja de cenoura",
        tag="Na manteiga dourada com sálvia",
        intro="Cenoura cozida e bem batida dá uma massa laranja viva, levemente adocicada, que segura bem a cor. "
              "A manteiga com sálvia é um dos molhos mais simples do norte da Itália e deixa a cor aparecer.",
        meta=[("Rendimento", "4 a 5 porções"), ("Preparo", "50 min"),
              ("Descanso", "30 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Cor", ["2 cenouras médias (cerca de 250 g)"]),
            ("Massa", [FARINHA, SEMOLA, "2 ovos grandes e 1 gema", SAL]),
            ("Molho", [
                "80 g de manteiga (cerca de 5 colheres de sopa)",
                "12 folhas de sálvia fresca",
                "50 g de parmesão ralado fino (⅔ de xícara)",
                "Pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Descasque as cenouras, corte em rodelas e cozinhe em água sem sal por 15 a 20 minutos, até ficarem bem macias. Escorra e deixe secar 5 minutos na peneira.",
            "Bata no mixer até virar um purê liso. Pese 100 g; se estiver ralo, engrosse numa frigideira em fogo baixo, mexendo (página 04). Deixe esfriar.",
            "Bata o purê com os ovos, a gema e o sal. Faça o monte de farinha e sêmola, despeje no centro, forme a massa e sove por 10 minutos.",
            "Embrulhe em filme e descanse 30 minutos. Abra até 1,5 mm e corte tiras de 2 a 2,5 cm.",
            "Comece pelo molho: derreta a manteiga com a sálvia numa frigideira grande em fogo médio, por 2 a 3 minutos, até a manteiga ficar dourada, com cheiro de avelã, e as folhas crocantes. Desligue.",
            COZ,
            "Passe a massa para a frigideira, junte o parmesão e 3 a 4 colheres de sopa da água reservada e mexa até formar um molho cremoso. Sirva com pimenta.",
        ],
        notes=[
            ("Com abóbora", "Troque a cenoura por 200 g de abóbora cabotiá em cubos, assada a 200 °C por 30 minutos, até ficar macia. Bata e pese 100 g. A cor fica laranja-dourada."),
            ("Ponto da manteiga", "Tire do fogo assim que dourar: em segundos ela passa de dourada a queimada."),
        ],
        tip="Sobrou purê? Congele em porções de 100 g, a medida de uma receita de massa.",
    ),
    dict(
        slug="roxa", left=["Por que o limão"],
        title="Tagliolini roxo de repolho",
        tag="Com ricota, limão e hortelã",
        intro="O repolho roxo muda de cor conforme o que encontra: na massa com ovo, fica entre o roxo e o azul. "
              "O molho branco, de ricota, faz a cor aparecer no prato.",
        meta=[("Rendimento", "4 a 5 porções"), ("Preparo", "50 min"),
              ("Descanso", "30 min"), ("Nível", "Médio")],
        ingredients=[
            ("Cor", [
                "300 g de repolho roxo fatiado fino (cerca de ¼ de repolho)",
                "1 colher de chá de suco de limão (5 ml)",
            ]),
            ("Massa", [FARINHA, SEMOLA, "2 ovos grandes e 1 gema", SAL]),
            ("Molho", [
                "250 g de ricota fresca",
                "45 ml de azeite (3 colheres de sopa)",
                "Raspas de 1 limão-siciliano",
                "15 folhas de hortelã picadas",
                "40 g de parmesão ralado fino (½ xícara)",
            ]),
        ],
        steps=[
            "Cozinhe o repolho com 100 ml de água numa panela tampada, em fogo médio, por 10 a 12 minutos, até ficar bem macio.",
            "Bata com o líquido da panela até virar um purê liso. Mexa numa frigideira em fogo baixo até engrossar como purê de batata (página 04). Pese 100 g, junte o limão e deixe esfriar.",
            "Bata o purê com os ovos, a gema e o sal. Forme a massa com a farinha e a sêmola e sove por 10 minutos, até a cor ficar uniforme.",
            "Embrulhe em filme e descanse 30 minutos. Abra até 1 mm e corte tiras finas, de 3 mm.",
            "Numa tigela grande, amasse a ricota com o azeite, as raspas de limão, a hortelã, o parmesão e sal.",
            "Cozinhe a massa em água fervente com sal por 1½ a 2 minutos, até ficar macia com leve resistência ao morder. Reserve 1 xícara da água.",
            "Junte a massa à tigela com 4 a 5 colheres de sopa da água quente e misture até a ricota virar um creme. Sirva logo.",
        ],
        notes=[
            ("Por que o limão", "Em contato com o ovo, o repolho roxo fica azulado. Um pouco de limão no purê (1 colher de chá) puxa a cor para o violeta; limão demais deixa a massa rosada."),
            ("A cor no cozimento", "Como a beterraba, o repolho solta cor na água. Prefira cortes finos, que cozinham rápido."),
        ],
        tip="Não use bicarbonato no cozimento do repolho: ele deixa a cor azul-esverdeada e o gosto de sabão.",
    ),
    dict(
        slug="preta", left=["Onde encontrar"],
        title="Tagliolini pretos com camarão",
        tag="Tinta de lula, alho e limão",
        intro="A tinta de lula deixa a massa preta e brilhante, com um leve gosto de mar. Em Veneza e na Sicília, a tinta de sépia é "
              "clássica nos molhos de massa, quase sempre com frutos do mar e sem queijo.",
        meta=[("Rendimento", "4 porções"), ("Preparo", "45 min"),
              ("Descanso", "30 min"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                FARINHA, SEMOLA,
                "3 ovos grandes e 2 gemas",
                "15 g de tinta de lula ou de sépia (1 colher de sopa, cerca de 4 sachês de 4 g)",
                SAL,
            ]),
            ("Molho", [
                "400 g de camarão médio limpo",
                "60 ml de azeite (¼ de xícara)",
                "3 dentes de alho fatiados",
                "100 ml de vinho branco seco (⅓ de xícara + 1 colher de sopa)",
                "Raspas e suco de ½ limão-siciliano",
                "2 colheres de sopa de salsinha picada",
            ]),
        ],
        steps=[
            "Bata os ovos, as gemas, a tinta e o sal até virar um líquido preto uniforme. Use avental: a tinta mancha tecido.",
            "Faça o monte de farinha e sêmola, despeje no centro e forme a massa. Sove por 8 a 10 minutos, até ficar lisa e preta por igual, sem riscos.",
            "Embrulhe em filme e descanse 30 minutos. Abra até 1 mm, polvilhando sêmola, e corte tiras finas, de 3 mm.",
            "Seque os camarões com papel-toalha e tempere com sal. Aqueça metade do azeite numa frigideira grande em fogo alto e doure os camarões por 1 minuto de cada lado, até ficarem rosados e opacos. Retire.",
            "Na mesma frigideira, em fogo médio, junte o restante do azeite e o alho e refogue por 1 minuto. Junte o vinho e deixe ferver por 2 minutos.",
            "Cozinhe a massa em água fervente com sal por 1½ a 2 minutos. Como ela é preta, não dá para ver o ponto: prove um fio. Reserve 1 xícara da água do cozimento.",
            "Passe a massa para a frigideira com os camarões, as raspas, o suco de limão, a salsinha e um pouco da água do cozimento. Mexa por 1 minuto e sirva.",
        ],
        notes=[
            ("Onde encontrar", "A tinta é vendida em sachês, congelada ou em pote, em peixarias e lojas de produtos importados. Depois de aberta, guarde como indica o rótulo."),
            ("Segurança", "A tinta vem da lula ou da sépia: quem tem alergia a frutos do mar não deve comer esta massa. O vinho não perde todo o álcool; para crianças e gestantes, troque por caldo de legumes."),
        ],
        tip="Na Itália, massa com frutos do mar quase nunca leva queijo. A salsinha e o limão fazem esse papel.",
    ),
    dict(
        slug="cacau", left=["Qual cacau"],
        title="Pappardelle de cacau com cogumelos",
        tag="Cacau sem açúcar, cogumelos e tomilho",
        intro="Na Itália, o cacau aparece há séculos em pratos salgados, como os molhos agridoces de caça. Na massa, ele não deixa "
              "nada doce: dá cor marrom e um leve amargor, que combina com cogumelos, carnes de panela e queijos curados.",
        meta=[("Rendimento", "4 a 5 porções"), ("Preparo", "45 min"),
              ("Descanso", "30 min"), ("Nível", "Fácil")],
        ingredients=[
            ("Massa", [
                "260 g de farinha de trigo tipo 00 ou comum (2 xícaras + 2 colheres de sopa)",
                SEMOLA,
                "40 g de cacau em pó 100%, sem açúcar (½ xícara)",
                "4 ovos grandes",
                "15 ml de água (1 colher de sopa), se precisar",
                SAL,
            ]),
            ("Molho", [
                "400 g de cogumelos fatiados (paris, shiitake ou uma mistura)",
                "30 ml de azeite (2 colheres de sopa)",
                "40 g de manteiga (cerca de 3 colheres de sopa)",
                "2 dentes de alho picados",
                "1 colher de sopa de folhas de tomilho",
                "50 g de parmesão ralado fino (⅔ de xícara)",
            ]),
        ],
        steps=[
            "Peneire juntos a farinha, a sêmola e o cacau, para não ficar grumo. Faça o monte na bancada e abra o centro.",
            "Bata os ovos com o sal, despeje no centro e forme a massa. O cacau absorve mais líquido: se a massa ficar quebradiça, junte a água aos poucos. Sove por 10 minutos.",
            "Embrulhe em filme e descanse 30 minutos. Abra até 1,5 mm e corte tiras de 2 a 2,5 cm.",
            "Aqueça o azeite e metade da manteiga numa frigideira grande em fogo alto. Junte os cogumelos e deixe 2 minutos sem mexer; depois salteie por 4 a 5 minutos, até dourarem. Junte o alho, o tomilho e sal e mexa por 1 minuto.",
            COZ,
            "Passe a massa para os cogumelos com o restante da manteiga, metade do parmesão e 3 a 4 colheres de sopa da água. Mexa por 1 minuto, até o molho envolver a massa. Sirva com o restante do queijo.",
        ],
        notes=[
            ("Qual cacau", "Use cacau em pó 100%, sem açúcar. Chocolate em pó e achocolatado têm açúcar e deixam a massa doce e mole."),
            ("Outros molhos", "Combina com ragù de carne, linguiça na manteiga com sálvia ou o ragù de cogumelos do Volume V (receita 10)."),
        ],
        tip="Cogumelo só doura com espaço: com a frigideira cheia, ele solta água e cozinha. Se precisar, doure em duas vezes.",
    ),
    dict(
        slug="listrada", left=["Combinações"],
        title="Farfalle listradas",
        tag="Massa em duas cores, com ervilha e presunto cru",
        intro="Duas massas de cores diferentes, cortadas em tiras e abertas juntas, viram uma folha listrada. "
              "Em formato de borboleta, as listras aparecem de longe. A mesma folha listrada volta no ravioli da receita 11.",
        meta=[("Rendimento", "4 a 5 porções"), ("Preparo", "1 h (com as massas prontas)"),
              ("Secagem", "15 min"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "300 g de massa amarela (meia receita 01), descansada",
                "300 g de massa verde (meia receita 02) ou de outra cor, descansada",
                "Sêmola para polvilhar",
            ]),
            ("Molho", [
                "40 g de manteiga (cerca de 3 colheres de sopa)",
                "300 g de ervilha congelada (2 xícaras)",
                "100 ml de creme de leite fresco (⅓ de xícara + 1 colher de sopa)",
                "40 g de parmesão ralado fino (½ xícara)",
                "100 g de presunto cru em tiras",
                "Pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Abra cada massa com o rolo até 2 mm, em retângulos do mesmo comprimento. Corte as duas folhas em tiras de 1,5 cm de largura.",
            "Na bancada polvilhada com sêmola, monte uma folha alternando as tiras das duas cores, lado a lado, com 2 mm de uma sobre a outra (página 04).",
            "Passe o rolo de leve no sentido das listras, para colar. Depois abra no mesmo sentido até 1 a 1,5 mm. Se uma emenda abrir, umedeça com o dedo molhado e aperte.",
            "Com carretilha ou faca, corte retângulos de 4 × 3 cm, com as listras no sentido do lado maior. Aperte o centro de cada um com o polegar e o indicador, formando a borboleta.",
            "Deixe as farfalle secar 15 minutos sobre um pano polvilhado com sêmola: o vinco firma e não abre na água.",
            "Derreta a manteiga numa frigideira em fogo médio, junte as ervilhas e sal e cozinhe por 3 minutos. Junte o creme de leite e deixe ferver 1 minuto.",
            "Cozinhe as farfalle em água fervente com sal por 3 a 4 minutos, até o centro dobrado ficar macio. Misture ao molho com o parmesão e um pouco da água. Sirva com o presunto e pimenta.",
        ],
        notes=[
            ("Combinações", "Amarelo e verde, rosa e amarelo, preto e amarelo. Duas cores que contrastam ficam mais bonitas do que três parecidas."),
            ("Aparas", "As sobras listradas, cortadas em losangos irregulares (maltagliati), vão bem no caldo ou na sopa de feijão."),
            ("Segurança", "Gestantes: troque o presunto cru por presunto cozido ou cubos de bacon bem dourados."),
        ],
        tip="Abra a folha sempre no sentido das listras. No sentido contrário, as tiras alargam e as emendas abrem.",
    ),
    dict(
        slug="ervas", left=["Com manteiga"],
        title="Lenços de massa com ervas prensadas",
        tag="Pasta laminata servida no caldo",
        intro="Folhas de ervas presas entre duas camadas finas de massa ficam à vista, como num vitral. O caldo claro e quente "
              "é o jeito mais bonito de servir: as folhas aparecem em cada pedaço.",
        meta=[("Rendimento", "4 porções (prato de entrada)"), ("Preparo", "50 min (com a massa pronta)"),
              ("Cozimento", "3 min"), ("Nível", "Médio")],
        ingredients=[
            ("Massa", [
                "300 g de massa amarela (meia receita 01), descansada",
                "50 a 60 folhas pequenas e planas: salsinha lisa, manjericão, sálvia ou endro",
                "Sêmola para polvilhar",
            ]),
            ("Para servir", [
                "1,2 litro de caldo de legumes quente (5 xícaras), caseiro ou o do Volume V, receita 01",
                "40 g de parmesão ralado fino (½ xícara)",
                "Azeite e pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Lave as folhas, tire os talos e seque bem com papel-toalha, uma por uma. Folha molhada faz a massa grudar e rasgar.",
            "Divida a massa em 4 partes. Abra uma o mais fino que conseguir, quase transparente, com cerca de 0,5 mm. Mantenha as outras cobertas com filme.",
            "Arrume as folhas sobre metade da folha de massa, separadas 3 a 4 cm umas das outras. Se a massa estiver seca, umedeça de leve com os dedos molhados.",
            "Dobre a outra metade por cima e aperte com as mãos, tirando o ar. Passe o rolo com firmeza até a folha ficar bem fina, com cerca de 0,7 mm, a ponto de ver as ervas por transparência (página 04).",
            "Corte quadrados de 6 a 7 cm, cada um com uma folha. Polvilhe sêmola e repita com o restante da massa.",
            "Aqueça o caldo até ferver e acerte o sal. À parte, cozinhe os lenços em água fervente com sal por 2 a 3 minutos, até ficarem macios.",
            "Distribua os lenços em pratos fundos aquecidos, cubra com o caldo quente e sirva com parmesão, um fio de azeite e pimenta.",
        ],
        notes=[
            ("Por que cozinhar à parte", "Cozida no caldo, a massa solta farinha e turva o caldo. Na água, o caldo fica claro e as ervas aparecem."),
            ("Com manteiga", "Sem caldo, sirva os lenços com manteiga derretida e parmesão, como prato principal. Rende 3 porções."),
        ],
        tip="Folhas pequenas e planas dão o melhor desenho. Talo grosso rasga a massa ao passar o rolo.",
    ),
    dict(
        slug="ravioli", left=["Ar dentro"],
        title="Ravioli bicolor de ricota",
        tag="Folha listrada, recheio de ricota e limão, molho de tomate fresco",
        intro="A folha de cima é listrada, a de baixo é lisa: cada ravioli mostra as duas cores. O recheio leve de ricota "
              "e o tomate fresco não escondem o desenho.",
        meta=[("Rendimento", "4 porções (cerca de 30 ravioli)"), ("Preparo", "1 h 15 min (com as massas prontas)"),
              ("Cozimento", "4 min"), ("Nível", "Avançado")],
        ingredients=[
            ("Massa", [
                "225 g de massa amarela (pouco mais de ⅓ da receita 01)",
                "75 g de massa rosa (⅛ da receita 03) ou de outra cor",
            ]),
            ("Recheio", [
                "250 g de ricota fresca bem escorrida",
                "40 g de parmesão ralado fino (½ xícara)",
                "1 gema",
                "Raspas de ½ limão-siciliano, noz-moscada e sal",
            ]),
            ("Molho", [
                "600 g de tomate maduro picado (cerca de 5)",
                "45 ml de azeite (3 colheres de sopa)",
                "2 dentes de alho amassados",
                "Folhas de manjericão",
            ]),
        ],
        steps=[
            "Misture a ricota, o parmesão, a gema, as raspas, uma pitada de noz-moscada e sal até virar um creme firme. Guarde na geladeira.",
            "Com 75 g da massa amarela e a massa rosa, faça uma folha listrada como na receita 09 e abra até 1 mm. Abra os 150 g restantes da massa amarela numa folha lisa do mesmo tamanho.",
            "Sobre a folha lisa, coloque colheres de chá cheias de recheio a cada 5 cm. Pincele água em volta de cada porção.",
            "Cubra com a folha listrada e aperte em volta de cada recheio, de dentro para fora, tirando todo o ar. Corte quadrados de 5 cm com carretilha e aperte as bordas de novo.",
            "Para o molho, aqueça o azeite com o alho em fogo médio por 1 minuto, junte os tomates e sal e cozinhe por 10 a 12 minutos, até desmanchar e engrossar. Junte o manjericão.",
            "Cozinhe os ravioli em água com sal fervendo de leve, sem borbulhar forte, por 3 a 4 minutos, até as bordas ficarem macias. Retire com escumadeira, passe para o molho e sirva.",
        ],
        notes=[
            ("Ar dentro", "Ravioli com ar estoura no cozimento. Aperte bem antes de cortar."),
            ("Para adiantar", "Congele os ravioli crus numa bandeja com sêmola, sem encostar; depois de duros, passe para um saco fechado. Até 1 mês. Cozinhe sem descongelar, 1 a 2 minutos a mais."),
        ],
        tip="A folha listrada vai por cima: no prato, os ravioli ficam com as listras para cima.",
    ),
    dict(
        slug="quatro", left=["Congelar"],
        title="Tagliatelle em quatro cores",
        tag="Amarela, laranja, rosa e verde numa receita só",
        intro="Quatro massas pequenas, feitas em sequência na mesma bancada, viram ninhos coloridos. É uma boa receita para "
              "fazer com as crianças e a que mais impressiona à mesa.",
        meta=[("Rendimento", "6 porções (cerca de 850 g de massa)"), ("Preparo", "1 h 15 min"),
              ("Descanso", "30 min"), ("Nível", "Médio")],
        ingredients=[
            ("Amarela", ["100 g de farinha (¾ de xícara + 1 colher de sopa), 1 ovo grande e ¼ de colher de chá de cúrcuma"]),
            ("Laranja", ["150 g de farinha (1¼ xícara), 1 ovo grande e 30 g de purê grosso de cenoura (receita 05)"]),
            ("Rosa", ["150 g de farinha (1¼ xícara), 1 ovo grande e 30 g de purê grosso de beterraba (receita 03)"]),
            ("Verde", ["150 g de farinha (1¼ xícara), 1 ovo grande e 30 g de espinafre escaldado, espremido e batido"]),
            ("Molho", [
                "80 g de manteiga (cerca de 5 colheres de sopa)",
                "80 g de parmesão ralado fino (1 xícara)",
                "Pimenta-do-reino a gosto",
            ]),
        ],
        steps=[
            "Faça as massas em sequência, da mais clara para a mais escura, para não manchar: amarela, laranja, rosa e verde. Para cada uma, bata o ovo com a cor e uma pitada de sal, junte à farinha e sove por 6 a 8 minutos (página 04).",
            "Ajuste cada massa: ela deve ficar lisa e firme, sem grudar. Se grudar, junte farinha às colheradas.",
            "Embrulhe cada uma em filme e descanse 30 minutos. Limpe a bancada e as mãos entre uma cor e outra.",
            "Abra cada massa até 1 a 1,5 mm e corte tiras de 6 a 8 mm. Forme ninhos misturando as quatro cores.",
            COZ,
            "Derreta a manteiga numa frigideira grande em fogo baixo, junte a massa, o parmesão e 4 a 5 colheres de sopa da água reservada e mexa até formar um molho cremoso. Sirva com pimenta.",
        ],
        notes=[
            ("Secar", "Para guardar fora da geladeira, seque os ninhos à sombra, em lugar fresco e arejado, por 24 a 48 horas, até ficarem duros por inteiro e quebrarem ao dobrar. Em dias úmidos ou quentes, não seque: congele. Guarde em pote fechado por até 2 semanas e cozinhe por 4 a 5 minutos. Ao sol, a cor desbota."),
            ("Congelar", "Congele os ninhos frescos numa bandeja e depois passe para um saco fechado: até 1 mês. Cozinhe sem descongelar, 1 minuto a mais. É o jeito que melhor guarda a cor."),
        ],
        tip="Adiante as cores: cada massa crua, embrulhada em filme, fica até 1 dia na geladeira. Tire 30 minutos antes de abrir.",
    ),
]

# Quadro das cores (página 03): (cor, ingrediente, para 400 g de farinha e sêmola, no cozimento)
COLORS = [
    ("Amarela", "Açafrão ou cúrcuma", "3 ovos + 2 gemas + 0,1 g de açafrão", "Mantém"),
    ("Verde", "Manjericão e salsinha", "90 g de ervas frescas, escaldadas e espremidas + 3 ovos", "Mantém"),
    ("Rosa", "Beterraba assada", "100 g de purê + 2 ovos + 1 gema", "Clareia"),
    ("Vermelha", "Extrato de tomate", "40 g de extrato + 3 ovos + 1 gema", "Clareia pouco"),
    ("Laranja", "Cenoura ou abóbora", "100 g de purê + 2 ovos + 1 gema", "Mantém"),
    ("Roxa", "Repolho roxo", "100 g de purê + 2 ovos + 1 gema", "Clareia"),
    ("Preta", "Tinta de lula", "15 g de tinta + 3 ovos + 2 gemas", "Mantém"),
    ("Marrom", "Cacau sem açúcar", "40 g de cacau no lugar de 40 g de farinha + 4 ovos", "Mantém"),
]

# Planejamento: (receita, quando preparar, conservação)
PLANNING = [
    ("Massas 01 a 08 (crua, em bola)", "Até 1 dia antes, embrulhada em filme", "Geladeira 1 dia; tire 30 min antes de abrir"),
    ("Ninhos cortados", "Até 2 dias antes", "Geladeira 2 dias em pote; congelador 1 mês"),
    ("Ninhos secos", "Até 2 semanas antes", "Pote fechado, em lugar seco e escuro"),
    ("Purês de beterraba e cenoura", "Até 3 dias antes", "Geladeira 3 dias; congelador 3 meses"),
    ("Purê de repolho roxo", "Até 1 dia antes", "Geladeira 1 dia"),
    ("Creme de ervas", "Na hora", "Escurece em poucas horas"),
    ("Farfalle listradas", "Até 1 dia antes, secas 15 min", "Geladeira 1 dia; congelador 1 mês"),
    ("Lenços de ervas", "No dia", "Cobertos com filme, na geladeira, até 6 h"),
    ("Ravioli crus", "Até 1 mês antes, congelados", "Congelador 1 mês"),
    ("Molhos de tomate e ragù", "Até 3 dias antes", "Geladeira 3 dias; congelador 3 meses"),
    ("Molhos de manteiga, alho e queijo", "Na hora", "Não guardam bem"),
    ("Massa cozida com molho", "Na hora", "Sobras: geladeira 1 dia, reaqueça na frigideira"),
]

# Harmonização: (cor, sugestão, acompanha, por quê)
PAIRINGS = [
    ("Amarela e laranja", "Cores quentes", "Manteiga e sálvia, legumes, frutos do mar",
     "Sabor neutro ou levemente doce aceita molhos leves e claros."),
    ("Verde", "Ervas ou espinafre", "Tomate, ricota, queijos frescos",
     "O verde contrasta com o vermelho e o branco e repete o perfume das ervas."),
    ("Rosa e roxa", "Beterraba e repolho", "Queijos, nozes, manteiga, ricota",
     "Molho branco deixa a cor aparecer; molho de tomate esconde."),
    ("Vermelha", "Tomate", "Alho e azeite, rúcula, camarão",
     "Já tem gosto de tomate: outro molho de tomate só repetiria."),
    ("Preta", "Tinta de lula", "Camarão, lula, mexilhão, limão",
     "Combina com o mar. Queijo não entra."),
    ("Marrom", "Cacau", "Cogumelos, ragù de carne, linguiça",
     "O leve amargor do cacau pede sabores fortes e terrosos."),
]

# Fotos (geradas na KIE, google/nano-banana): mesmo cenário dos volumes anteriores.
STYLE = ("appetizing editorial food photography, warm golden side light, served on a cream ceramic plate with a thin gold rim, "
         "a dusty rose linen napkin, dark rustic wooden table, shallow depth of field, Italian home cooking, "
         "natural vegetable colors, no artificial colors, "
         "no text, no letters, no logos, no brand labels, no people, no hands")
PHOTOS = {
    "00_capa": ("2:3", "Overhead view of nests of fresh homemade tagliatelle in natural colors arranged in a row on a floured dark wooden table: "
                "golden yellow, bright green, beet pink, carrot orange, red-orange tomato, purple, squid ink black and cocoa brown, "
                "a small cream plate with a thin gold rim holding striped bow-tie pasta, a few basil leaves, a halved beetroot and a carrot, "
                "dusty rose linen napkin, semolina dusting"),
    "01_amarela": ("3:2", "Golden yellow saffron tagliatelle tossed with thin zucchini matchsticks, lemon zest and grated parmesan, "
                   "on a cream plate with a thin gold rim, a halved lemon beside it"),
    "02_verde": ("3:2", "Wide light green herb pappardelle with sautéed halved cherry tomatoes, parmesan shavings and fresh basil leaves, "
                 "on a cream plate with a thin gold rim"),
    "03_rosa": ("3:2", "Pink beetroot tagliatelle in a light creamy gorgonzola sauce topped with chopped toasted walnuts and black pepper, "
                "on a cream plate with a thin gold rim, a small roasted beetroot beside it"),
    "04_vermelha": ("3:2", "Red-orange tomato fettuccine tossed with olive oil, golden garlic slices, red chili flakes and fresh arugula, "
                    "grated parmesan, on a cream plate with a thin gold rim"),
    "05_laranja": ("3:2", "Wide bright orange carrot pappardelle in brown butter with crispy fried sage leaves and grated parmesan, "
                   "on a cream plate with a thin gold rim, a carrot with green top beside it"),
    "06_roxa": ("3:2", "Thin violet purple tagliolini made with red cabbage, tossed with creamy white ricotta, lemon zest and chopped mint, "
                "on a cream plate with a thin gold rim, a wedge of red cabbage in the background"),
    "07_preta": ("3:2", "Glossy black squid ink tagliolini with pink seared shrimp, garlic, chopped parsley and lemon zest, "
                 "on a cream plate with a thin gold rim, a lemon wedge beside it"),
    "08_cacau": ("3:2", "Wide dark brown cocoa pappardelle with golden sautéed sliced mushrooms, thyme leaves and grated parmesan, "
                 "on a cream plate with a thin gold rim"),
    "09_listrada": ("3:2", "Bow-tie farfalle pasta with bold yellow and green stripes, in a light cream sauce with green peas, "
                    "topped with thin ribbons of prosciutto and black pepper, on a cream plate with a thin gold rim"),
    "10_ervas": ("3:2", "Thin square sheets of fresh yellow pasta with whole flat parsley and basil leaves pressed inside, visible through the pasta, "
                 "floating in clear golden vegetable broth in a cream deep bowl with a thin gold rim, parmesan and olive oil drizzle"),
    "11_ravioli": ("3:2", "Square ravioli with pink and yellow striped tops, in a fresh chunky tomato sauce with basil leaves, "
                   "on a cream plate with a thin gold rim"),
    "12_quatro": ("3:2", "Fresh tagliatelle in four natural colors mixed together, yellow, orange, pink and green, "
                  "tossed in butter and parmesan on a cream plate with a thin gold rim, "
                  "four small raw pasta nests of the same colors on the floured wooden table beside it"),
}
