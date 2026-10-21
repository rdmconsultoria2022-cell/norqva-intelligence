# NORQVA-0105: criativos inteiros no celular e fundo escuro até a borda

**Branch:** `ai/NORQVA-0105-criativos-mobile` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** com o "sim" do Ricardo
**Autorização:** só tela (D-0037). Pedido do Ricardo em 20/10/2026 23h00 (captura da tela Criativos no celular e especificação "Correção de responsividade dos criativos e navegação inferior mobile").

## Diagnóstico (causas)

1. **Prévia da Meta cortada:** a prévia oficial é uma página da Meta de largura fixa (o quadro tem `width`/`height` próprios). A tela espremia o iframe com `max-width: 100%`, e o conteúdo de dentro (que não se adapta) era cortado à direita.
2. **Rolagem lateral:** nomes longos sem espaço (código do criativo, do anúncio, link no texto) não quebravam e alargavam o card além da tela (`main` com 677 px numa tela de 360).
3. **Arquivo do criativo:** caixa fixa 4:5 no celular; em lista no celular a mídia ocupava uma faixa baixa (`fill`), deixando vídeo 9:16 pequeno. Imagem da Meta com `object-cover` (recortava).
4. **Faixa branca embaixo (Android):** a página não pedia desenho até a borda (`viewport-fit=cover`), não declarava esquema escuro (`color-scheme`), e o fundo do `html` e a `theme-color` não eram os do painel.

## O que muda

- `AdLivePreview.tsx`: `FittedFrame` mostra o quadro da Meta no tamanho dela e reduz por igual (`transform: scale`) para caber; aviso "Prévia inteira, reduzida… (87%)". Imagem da Meta com `object-contain`.
- Backend (só leitura, aditivo): `MetaClient.getAdPreviewFrame` devolve também `width`/`height` do iframe da Meta; `GET /api/meta/ads/:adId/preview` passa a mandar `width` e `height`. Nada muda na Meta nem no banco.
- `CreativeFactoryView.tsx`: cards com `min-w-0` e quebra de palavras longas (`overflow-wrap:anywhere`); no celular o arquivo aparece na proporção dele.
- `CreativePreview.tsx`: caixa na proporção real do arquivo (lida ao carregar), `object-contain`, até 70% da altura da tela; janela ampliada limitada à largura da tela.
- `index.html`: `viewport-fit=cover` e `color-scheme` escuro (claro nas páginas do comprador). `AppShell.tsx`: no painel, fundo do `html`/`body` e `theme-color` iguais ao topo e à barra de áreas (`#101010`). A barra de áreas já respeita `env(safe-area-inset-bottom)` e fica fora da área de rolagem (não cobre conteúdo).

## Testes (harness local com Playwright, larguras 320, 360, 390, 430, 768 e 1280)

- Sem rolagem lateral em nenhuma largura (antes: 677 px de conteúdo em telas de 320 a 430).
- Prévias da Meta (Instagram feed, Stories, Facebook feed) inteiras, reduzidas a 74–96% no celular e 100% a partir de 430.
- Arquivos 9:16, 4:5, 1:1 e 16:9 com a caixa na proporção do arquivo no celular, sem recorte (`contain`).
- Barra de áreas começa exatamente onde termina a área de rolagem (sem sobrepor).

## Limitações

- A cor da barra de navegação do Android é do sistema. Com o app desenhando até a borda (Chrome 135+ e app instalado), a área atrás dela fica escura; em versões antigas o Android pode manter a barra clara. Conferir no celular depois de publicar; o app instalado atualiza os dados da instalação sozinho em até 1 dia (ou reinstalar o atalho).
- Teclado aberto: comportamento padrão do Chrome (a barra de áreas fica atrás do teclado). Não testável fora do aparelho.
