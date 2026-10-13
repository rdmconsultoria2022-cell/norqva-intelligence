// NORQVA-0061: textos e imagens da página de venda (/p/...) de cada livro de cozinha.
// O Trattoria é o padrão (textos de antes, sem mudança). Os Volumes III, IV e V têm página própria,
// escolhida pela chave `book` que o servidor devolve com a oferta.

export interface BookPage {
  brand: string;
  brandSub: string;
  announce: string;
  cover: string;
  coverAlt: string;
  pagesNote: string;
  badge: string;
  defaultTitle: string;
  lead: string;
  mobileTitle: string;
  mobileText: string;
  galleryTitle: string;
  galleryText: string;
  gallery: { img: string; alt: string; label: string; title: string; text: string }[];
  modulesKicker: string;
  modulesTitle: string;
  modulesText: string;
  modules: { n: string; title: string; items: string[] }[];
  finalTitle: string;
  finalText: string;
  footer: string;
}

const TRATTORIA: BookPage = {
  brand: 'TRATTORIA EM CASA',
  brandSub: 'Cucina Tradizionale Italiana',
  announce: 'Edição Especial 2026 • 28 Preparações Italianas com Fichas Técnicas',
  cover: '/images/trattoria/proto_01_capa_1788381677692.jpg',
  coverAlt: 'Trattoria em Casa — Livro Digital Oficial',
  pagesNote: 'E-book Digital Completo • 39 Páginas em Alta Resolução',
  badge: 'Guia Prático de Massas & Molhos',
  defaultTitle: 'Trattoria em Casa — Massas & Molhos Italianos',
  lead: 'Aprenda os segredos das massas artesanais frescas e dos molhos clássicos italianos em um guia prático, direto e ricamente ilustrado.',
  mobileTitle: '28 Preparações Selecionadas',
  mobileText: 'Massas frescas, molhos clássicos e fichas com gramaturas para o Brasil.',
  galleryTitle: 'O Que Você Irá Preparar em Sua Cozinha',
  galleryText: 'Fotografias reais das preparações ensinadas no livro, com ingredientes acessíveis e métodos testados para garantir o resultado perfeito.',
  gallery: [
    {
      img: '/images/trattoria/clean_massa_classica_hero.jpg',
      alt: 'Massa Clássica aos Ovos',
      label: 'Módulo 01 • Fundamentos',
      title: 'Massa Clássica aos Ovos (Tagliolini & Fettuccine)',
      text: 'A proporção de ouro (100g de farinha para 1 ovo), o tempo exato de sova e o descanso do glúten para abrir massas finas e elásticas.'
    },
    {
      img: '/images/trattoria/clean_pomodoro_san_marzano.jpg',
      alt: 'Pomodoro & Basilico Autêntico',
      label: 'Módulo 02 • Molhos Clássicos Italianos',
      title: 'Pomodoro San Marzano & Basilico Fresco',
      text: 'O cozimento suave sem queimar o alho, a extração da doçura natural do tomate e a finalização com manjericão na temperatura certa.'
    },
    {
      img: '/images/trattoria/clean_bolognese_ragu.jpg',
      alt: 'Ragu alla Bolognese Tradicional',
      label: 'Módulo 02 • Emulsão & Cozimento Lento',
      title: 'Ragu alla Bolognese Tradicional',
      text: 'O soffritto tradicional de aipo, cenoura e cebola, a caramelização das carnes com vinho e a redução aveludada em fogo brando.'
    }
  ],
  modulesKicker: 'Estrutura Pedagógica Completa',
  modulesTitle: 'O Conteúdo Detalhado dos 5 Módulos',
  modulesText: 'Fichas técnicas ilustradas passo a passo, rendimentos, tabelas de conversão e tempos de cozimento.',
  modules: [
    {
      n: '1',
      title: 'Módulo 01: A Arte da Massa Artesanal Fresca',
      items: [
        '01. A Proporção Clássica de Ovos e Farinha',
        '02. Massa de Sêmola & Água sem Ovos (Sul da Itália)',
        '03. Tagliatelle & Fettuccine Clássicos',
        '04. Pappardelle Rústico para Molhos Encorpados',
        '05. Nhoque de Batata Aveludado (Sem Ficar Pesado)',
        '06. O Ponto Exato do "Al Dente" & Água do Cozimento'
      ]
    },
    {
      n: '2',
      title: 'Módulo 02: Os Molhos Clássicos & Emulsões',
      items: [
        '07. Pomodoro & Basilico Autêntico (San Marzano)',
        '08. Ragu alla Bolognese Tradicional (Cozimento Lento)',
        '09. Cacio e Pepe Perfeito (Cremoso sem Nata)',
        '10. Carbonara Clássica (Gema, Pecorino & Guanciale)',
        "11. All'Amatriciana Tradicional",
        '12. Pesto alla Genovese Fresco'
      ]
    },
    {
      n: '3',
      title: 'Módulo 03: Massas Recheadas & Forno',
      items: [
        '13. Ravioli de Ricota Fresca & Espinafre',
        '14. Tortellini Clássico de Queijo & Ervas',
        '15. Lasanha Tradicional alla Bolognese',
        '16. Nhoque Gratinado aos 4 Queijos Italianos'
      ]
    },
    {
      n: '4 e 5',
      title: 'Módulos 04 e 05: Molhos Rápidos, Pizzas & Antepastos',
      items: [
        '17. Sugo Rápido com Tomates Cereja Tostados (15 min)',
        '18. Molho alla Puttanesca Tradicional (15 min)',
        '19. Massa de Pizza de Fermentação de 24h para Casa',
        '20. Focaccia Genovese Crocante com Alecrim'
      ]
    }
  ],
  finalTitle: 'Comece Hoje Mesmo Sua Jornada na Culinária Italiana',
  finalText: 'Tenha em mãos o guia definitivo com 28 preparações selecionadas, proporções exatas e técnicas que garantem elogios na sua mesa.',
  footer: 'TRATTORIA EM CASA'
};

const common = {
  pagesNote: 'Livro digital em PDF • 31 páginas • 12 receitas com foto',
  galleryText: 'Algumas das receitas do livro. Cada uma tem foto, ingredientes em gramas e medidas caseiras, e o passo a passo com o ponto certo.',
  modulesKicker: 'Coleção Cozinha Italiana em Casa',
  modulesText: 'Receitas com foto, medidas em gramas e caseiras, tempos e o ponto de cada preparo, além de planejamento e sugestões de combinação.'
};

const PAES: BookPage = {
  ...common,
  brand: 'PÃES & FERMENTAÇÃO NATURAL',
  brandSub: 'Coleção Cozinha Italiana em Casa • Volume III',
  announce: 'Volume III • 11 pães italianos e o fermento natural',
  cover: '/images/livros/paes/capa.jpg',
  coverAlt: 'Capa do livro Pães & Fermentação Natural',
  badge: 'Pães italianos feitos em casa',
  defaultTitle: 'Pães & Fermentação Natural',
  lead: 'Do fermento natural feito do zero ao pão rústico de casca crocante, com o passo a passo de cada etapa e o ponto certo da massa explicado.',
  mobileTitle: '12 receitas com foto',
  mobileText: 'Fermento natural, pães de fermentação longa e pães rápidos, com medidas em gramas.',
  galleryTitle: 'O que você vai assar em casa',
  gallery: [
    { img: '/images/livros/paes/rustico.jpg', alt: 'Pão rústico de fermentação natural', label: 'Receita 02', title: 'Pão rústico de fermentação natural', text: 'Farinha, água, sal e fermento natural, assado na panela tampada para a casca ficar crocante e dourada.' },
    { img: '/images/livros/paes/ciabatta.jpg', alt: 'Ciabatta', label: 'Receita 04', title: 'Ciabatta', text: 'Massa bem hidratada com biga feita na véspera, para um miolo leve e cheio de buracos.' },
    { img: '/images/livros/paes/focaccia.jpg', alt: 'Focaccia barese', label: 'Receita 06', title: 'Focaccia barese', text: 'A focaccia de Bari, com batata na massa e tomate, azeitonas e orégano por cima: macia por dentro e crocante no fundo.' }
  ],
  modulesTitle: 'As 12 receitas do livro',
  modules: [
    { n: '1', title: 'O fermento e os pães de fermentação longa', items: ['01. Fermento natural', '02. Pão rústico de fermentação natural', '03. Pane pugliese de sêmola', '04. Ciabatta', '05. Pão de azeitonas e alecrim'] },
    { n: '2', title: 'Focaccia, panini e pão de forma', items: ['06. Focaccia barese', "07. Panini all'olio", '12. Pão integral na forma'] },
    { n: '3', title: 'Crocantes para o aperitivo', items: ['08. Grissini torinesi', '09. Taralli com erva-doce', '10. Friselle'] },
    { n: '4', title: 'Pão rápido de frigideira', items: ['11. Piadina romagnola'] }
  ],
  finalTitle: 'Pão feito em casa, à italiana',
  finalText: 'Doze receitas com foto e passo a passo, do fermento natural ao pão de frigideira.',
  footer: 'PÃES & FERMENTAÇÃO NATURAL'
};

const ANTIPASTI: BookPage = {
  ...common,
  brand: 'ANTIPASTI & APERITIVO',
  brandSub: 'Coleção Cozinha Italiana em Casa • Volume IV',
  announce: 'Volume IV • 12 receitas para abrir a mesa à italiana',
  cover: '/images/livros/antipasti/capa.jpg',
  coverAlt: 'Capa do livro Antipasti & Aperitivo',
  badge: 'Antepastos e aperitivo italiano',
  defaultTitle: 'Antipasti & Aperitivo',
  lead: 'Da bruschetta aos arancini, os antepastos e o drinque do fim de tarde italiano, com o que dá para adiantar na véspera.',
  mobileTitle: '12 receitas com foto',
  mobileText: 'Antepastos de legumes, frituras, tábua de frios e spritz, com medidas em gramas.',
  galleryTitle: 'O que você vai servir',
  gallery: [
    { img: '/images/livros/antipasti/caponata.jpg', alt: 'Caponata siciliana', label: 'Receita 03', title: 'Caponata siciliana', text: 'Berinjela dourada no azeite com tomate, azeitonas e alcaparras, no agridoce de vinagre e açúcar.' },
    { img: '/images/livros/antipasti/arancini.jpg', alt: 'Arancini de muçarela', label: 'Receita 09', title: 'Arancini de muçarela', text: 'Bolinhos de arroz com açafrão e coração de queijo, empanados e fritos até dourar.' },
    { img: '/images/livros/antipasti/tagliere.jpg', alt: 'Tábua de frios e queijos', label: 'Receita 11', title: 'Tábua de frios, queijos e caprese', text: 'Como escolher, cortar e montar a tábua do aperitivo, com as quantidades por pessoa.' }
  ],
  modulesTitle: 'As 12 receitas do livro',
  modules: [
    { n: '1', title: 'Pão e torradinhas', items: ['01. Bruschetta de feijão-branco e alecrim', '02. Crostini de ricota, mel e nozes'] },
    { n: '2', title: 'Legumes', items: ['03. Caponata siciliana', '04. Pimentões assados marinados', '05. Abobrinha à scapece', '06. Rolinhos de berinjela com ricota', '07. Cogumelos recheados ao forno'] },
    { n: '3', title: 'Para comer com palito', items: ['08. Frittata de abobrinha e hortelã', '09. Arancini de muçarela', '10. Almôndegas pequenas ao forno'] },
    { n: '4', title: 'A tábua e o drinque', items: ['11. Tábua de frios, queijos e caprese no palito', '12. Spritz e aperitivo sem álcool'] }
  ],
  finalTitle: 'Receba à italiana',
  finalText: 'Doze receitas com foto e passo a passo, e um roteiro do que fazer na véspera e na hora.',
  footer: 'ANTIPASTI & APERITIVO'
};

const RISOTOS: BookPage = {
  ...common,
  brand: 'RISOTOS & POLENTAS',
  brandSub: 'Coleção Cozinha Italiana em Casa • Volume V',
  announce: 'Volume V • 7 risotos, 4 polentas e o caldo caseiro',
  cover: '/images/livros/risotos/capa.jpg',
  coverAlt: 'Capa do livro Risotos & Polentas',
  badge: 'O conforto do norte da Itália',
  defaultTitle: 'Risotos & Polentas',
  lead: 'O método do risoto cremoso e da polenta sem grumos, explicado uma vez e repetido em doze receitas.',
  mobileTitle: '12 receitas com foto',
  mobileText: 'Caldo caseiro, sete risotos e quatro polentas, com medidas em gramas.',
  galleryTitle: 'O que você vai preparar',
  gallery: [
    { img: '/images/livros/risotos/milanese.jpg', alt: 'Risoto alla milanese', label: 'Receita 02', title: 'Risoto alla milanese', text: 'O clássico de Milão, com açafrão, manteiga e parmesão, cremoso só pelo amido do arroz.' },
    { img: '/images/livros/risotos/funghi.jpg', alt: 'Risoto de cogumelos', label: 'Receita 03', title: 'Risoto de cogumelos', text: 'Dois cogumelos dourados em fogo alto e misturados no fim, com tomilho e parmesão.' },
    { img: '/images/livros/risotos/ragu.jpg', alt: 'Polenta com ragù de cogumelos', label: 'Receita 10', title: 'Polenta com ragù de cogumelos', text: 'Polenta cremosa coberta com um ragù de cogumelos, tomate e vinho, sem carne.' }
  ],
  modulesTitle: 'As 12 receitas do livro',
  modules: [
    { n: '1', title: 'A base', items: ['01. Caldo de legumes caseiro'] },
    { n: '2', title: 'Risotos', items: ['02. Risoto alla milanese', '03. Risoto de cogumelos', '04. Risoto de abóbora com sálvia', '05. Risoto de limão-siciliano', '06. Risi e bisi', '07. Risoto de camarão', '08. Risoto de linguiça ao vinho tinto'] },
    { n: '3', title: 'Polentas', items: ['09. Polenta cremosa', '10. Polenta com ragù de cogumelos', '11. Polenta grelhada', '12. Polenta ao forno gratinada'] }
  ],
  finalTitle: 'Uma panela no fogo, a família à mesa',
  finalText: 'Doze receitas com foto e passo a passo, do caldo caseiro à polenta gratinada.',
  footer: 'RISOTOS & POLENTAS'
};

const PAGES: Record<string, BookPage> = { paes: PAES, antipasti: ANTIPASTI, risotos: RISOTOS };

export function bookPageFor(book: string | null | undefined): BookPage {
  return (book && PAGES[book]) || TRATTORIA;
}

/** Livros com capa e fotos já publicadas no site. Os Volumes IV e V entram aqui quando as fotos chegarem. */
export const READY_BOOKS = new Set<string>(['paes']);

/** Capa de cada livro da coleção na página do kit. */
export const COLLECTION_COVERS: Record<string, string> = {
  paes: PAES.cover,
  antipasti: ANTIPASTI.cover,
  risotos: RISOTOS.cover
};
