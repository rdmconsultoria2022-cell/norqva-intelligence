# Lote TR-M01: kit de 5 livros, "veja por dentro" + pedido pelo WhatsApp (4 vídeos + 4 imagens)

**Campanha:** clique-para-WhatsApp (o cliente conversa com o atendente, paga por Pix e recebe na conversa o link para baixar os PDFs).
**Botão:** **Enviar mensagem** (WhatsApp).
**Status:** feito em 26/10/2026 (NORQVA-0139). Nada foi publicado na Meta. Tudo nasce pausado. Ativar só com o "sim" do Ricardo.
**Autor:** Claude · 2026-10-26

## O que mudou em relação ao KIT-B01 (auditoria de 19/10)
1. **Produto real nos 2 primeiros segundos:** cada vídeo abre com páginas de verdade dos PDFs (geradas pelos scripts de `norqva-ai/produtos/*` e rasterizadas com `pdftoppm`) num celular desenhado em código (sem marca), com uma frase que diz o que é o produto.
2. **Mesma oferta do destino:** o kit de 5 livros digitais em PDF. Sem preço no vídeo e no texto (D-0053).
3. **Entrega mostrada:** a cena final ilustra a conversa (marcada "ilustração" na tela): pedido, "Pagamento confirmado!" e o link "Baixar os 5 livros em PDF", que é o que o sistema manda de verdade (`whatsappDelivery.ts`: link de acesso depois do PAID confirmado pelo Asaas, não os arquivos anexados). Por isso a frase é "O link para baixar chega aqui".
4. **Legenda igual à foto:** cada nome de prato foi conferido contra a foto da própria receita no livro. A foto que o KIT-B01-H05 chamava de "Cannoli" é a receita **"Cannoli em taça"** do Dolci (creme na taça com pedaços de casquinha, não o canudo); aqui ela aparece com o nome certo.

## Números conferidos nos arquivos dos livros (26/10/2026)
| Livro | Receitas (`content_*.py`) | Páginas (PDF gerado) |
|---|---|---|
| Trattoria em Casa | 28 | 67 |
| Dolci della Nonna | 10 | 27 |
| Pães & Fermentação Natural | 12 | 31 |
| Antipasti & Aperitivo | 12 | 31 |
| Risotos & Polentas | 12 | 31 |
| **Total** | **74** | **187** |

Correção em relação ao KIT-B01: "medidas em gramas e xícaras" não vale para todas. Gramas ou ml aparecem em 73 das 74 receitas e xícaras em 57 das 74. Por isso este lote diz "gramas, ml e, na maioria das receitas, também xícaras" e só mostra xícaras numa página que tem xícaras (tiramisù).

## Claims usadas (a verificar na Fábrica)
1. O kit reúne 5 livros digitais em PDF (Trattoria, Dolci, Pães, Antipasti, Risotos & Polentas).
2. São 74 receitas e 187 páginas no total; o Trattoria tem 67 páginas e 28 receitas; o Dolci tem 10 receitas.
3. As receitas têm passo a passo numerado; medidas em gramas/ml e, na maioria, também em xícaras.
4. Carbonara "sem creme de leite, como em Roma" (texto do próprio livro: "O clássico de Roma, sem creme de leite").
5. O pedido é feito pelo WhatsApp, o pagamento é por Pix e, depois da confirmação, o link para baixar os livros chega na conversa (o mesmo acesso também vai por e-mail).
6. **Conferir antes de ativar:** a oferta do kit que o atendente apresenta entrega os 5 PDFs (a migration 086 cita o kit OFF-000010 com os 5 PDFs). O KIT-B01 registrou que em 15/10 a oferta entregava 2.

Sem preço, sem "acesso vitalício", sem promessa de resultado ou saúde, sem escassez, sem depoimento e nada sobre a situação pessoal de quem vê.

## Os 4 criativos (vídeo vertical 1080x1920, 15 s, H.264 + AAC, -14 LUFS)

Chave = nome do anúncio = utm_content. Botão: **Enviar mensagem**.

| Chave | Ângulo | Gancho (0–2 s) | Título (≤40) | Texto principal (≤125) |
|---|---|---|---|---|
| TR-M01-H01-M1-C1 | Veja por dentro | Celular rolando o PDF do Trattoria (capa, sumário, carbonara) + "Veja por dentro os livros de receitas em PDF" | Veja por dentro: 5 livros em PDF | Massas, doces, pães, antipasti e risotos em 5 livros de receitas em PDF. Peça pelo WhatsApp e receba o link na conversa. |
| TR-M01-H02-M1-C1 | Sobremesas de família (renovação do KIT-B01-H05) | Celular com o PDF do Dolci (capa, tiramisù) + "Livro de sobremesas italianas em PDF" | Sobremesas italianas em PDF | Tiramisù, panna cotta e cannoli em taça, passo a passo, e mais 4 livros no kit. Peça pelo WhatsApp e receba na conversa. |
| TR-M01-H03-M1-C1 | O jantar de hoje | Página real da carbonara no celular + "Livro de massas italianas em PDF" | Carbonara passo a passo, em PDF | Carbonara, ragù e mais 72 receitas italianas em 5 livros digitais. Peça pelo WhatsApp e receba o link na conversa. |
| TR-M01-H04-M1-C1 | Medidas e passo a passo | Zoom na lista de ingredientes real do tiramisù + "Receitas em PDF com medidas e passo a passo" | Medidas exatas e passo a passo | Gramas, ml e, na maioria das receitas, também xícaras. São 5 livros em PDF. Peça pelo WhatsApp e receba o link na conversa. |

Roteiro (o texto exato de cada cena está em `TR-M01-assets/tools/build_trm01.py`):
- **H01:** PDF do Trattoria no celular, rolando capa → sumário → foto da carbonara → zoom nos ingredientes (0–6,4 s) · as 5 capas "São 5 livros no kit / 74 receitas · 187 páginas em PDF" · conversa no WhatsApp.
- **H02:** PDF do Dolci (capa → tiramisù → zoom na receita) · Panna cotta "com calda de frutas vermelhas" · Cannoli em taça · capas "E mais 4 livros no kit" · conversa.
- **H03:** PDF do Trattoria (foto da carbonara → ingredientes → modo de preparo) · foto Carbonara · foto Ragù alla bolognese · capas · conversa.
- **H04:** zoom na lista de ingredientes do tiramisù (gramas, ml e xícaras) → modo de preparo numerado → página inteira · foto do tiramisù · capas "5 livros · 74 receitas / passo a passo numerado, em PDF" · conversa.

Cena final de todos: "Peça pelo WhatsApp e receba os livros na conversa / Pagamento por Pix. O link para baixar chega aqui." + botão desenhado "Toque em Enviar mensagem".

## Imagens de feed (1080x1350, 4:5)
`TR-M01-H0N-M1-C1-feed.jpg`, uma por ângulo, com o mesmo título e texto da tabela: celular com a página real do PDF, "5 livros em PDF · 74 receitas" e "Peça pelo WhatsApp e receba os livros na conversa".

## Observações
- As fotos dos pratos e as capas são as dos próprios livros (`norqva-ai/produtos/*/jpg/` e `frontend/public/images/`). Nada de pessoas, mãos ou texto gerado por IA. Trilha original (`KIT-B01-assets/tools/music.py`).
- As páginas no celular são do Trattoria e do Dolci: os PDFs de Antipasti e Risotos gerados aqui saem sem as fotos (as fotos ficam no computador do Ricardo), então esses dois aparecem só pelas capas.
- Quadros conferidos um a um em 0,3 s, 1,5 s, 3 s, 8 s e 14 s de cada vídeo. Em 1,5 s e 3 s alguns quadros pegam a página no meio da rolagem (é movimento, dura menos de 1 s).

## Arquivos
`TR-M01-assets/TR-M01-H0N-M1-C1.mp4` (2 a 4 MB cada) e `TR-M01-assets/TR-M01-H0N-M1-C1-feed.jpg`.
Para refazer: `python3 norqva-ai/creative-batches/TR-M01-assets/tools/build_trm01.py <pasta de saída> [CHAVE ...]` (gera os PDFs que faltarem; precisa de Playwright + Chromium, Pillow, numpy/scipy, `pdftoppm` e `ffmpeg`).

## Próximo passo do Ricardo
Assistir, escolher os que aprova, anexar na Fábrica de Criativos e verificar as claims (principalmente a 6). Subir na campanha clique-para-WhatsApp com o botão "Enviar mensagem", tudo pausado; ativar só com o "sim" dele.
