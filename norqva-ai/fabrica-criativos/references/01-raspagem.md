# 01 — RASPAGEM DA BIBLIOTECA DE ANÚNCIOS (qualquer nicho)

> **NORQVA (contrato NORQVA-0053):** onde este arquivo falar de persona, UGC, depoimento, casting,
> fala gerada por IA, troca de gerador por recusa de conteúdo ou preço, valem as **Regras NORQVA**
> do `SKILL.md`: sem pessoa de IA apresentada como real, sem depoimento inventado, sem preço, e
> recusa de conteúdo = parar e avisar. Formatos permitidos: anúncios mudos de comida (`AdMudo`).

> **Raspagem (decisão do Ricardo, risco assumido):** sempre num navegador limpo, SEM login,
> nunca com a conta do Facebook ou de anúncios dele, com `--scrolls` entre 10 e 25. Os anúncios
> copiados servem só para entender formato e estrutura; nunca reaproveite frase, imagem ou vídeo.


Objetivo: capturar TODOS os ads ativos de um anunciante/nicho, identificar os winners e
baixar os top vídeos pra análise. Funciona pra qualquer nicho — o método é o mesmo.

## Montando a URL de busca

A busca mais limpa é pelo **domínio do funil do concorrente** (pega todos os ads dele, zero ruído):

```
https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&q=<dominio>%2F&search_type=keyword_unordered&sort_data[mode]=total_impressions&sort_data[direction]=desc
```

- `q=<dominio>%2F` — ex.: `plan.concorrente.com%2F`. A barra final filtra links reais.
- `sort_data[mode]=total_impressions&direction=desc` — winners primeiro.
- Busca por termo genérico ("emagrecimento") traz ruído — se precisar, use uma frase
  EXATA que só aquele anunciante usa (título do produto, nome do mecanismo).

## Método: DUAS vias (JSON embutido no DOM + intercept GraphQL) — não raspe o DOM renderizado

`scripts/scrape.py` já implementa. **⚠️ O FB migrou os dados do GraphQL (resposta XHR) pra
JSON EMBUTIDO no HTML** (scripts `data-sjs`); por isso o scraper cobre as duas vias e não
depende do transporte. Como funciona:
- Chrome REAL, headed (`channel:"chrome", headless:false`) — o FB bloqueia headless puro.
- **Via atual — JSON embutido:** a cada scroll pega `page.content()`, extrai cada bloco
  `<script type="application/json">` (a store do Relay hidratada) e roda `harvest()` nele.
  Colhe DURANTE o scroll porque o DOM é virtualizado (cards somem ao rolar).
- **Via legado — GraphQL:** ainda escuta `page.on("response")` filtrando `/graphql/` caso
  alguma query volte por lá; split por `\n{` e parse individual.
- `harvest()` acha nós com `ad_archive_id`/`adArchiveID` (snake OU camelCase) + `snapshot`.
  Cada nó traz TUDO: `page_name`, `start_date`, `collation_count`,
  `snapshot.videos[].video_hd_url`, `snapshot.body.text` (copy completa), `cta_text`,
  `link_url`, `title`, imagens. Se o FB mudar o transporte de novo mas manter a forma do
  objeto, continua funcionando.
- Scroll programático (~25 × 2400px com 1,1s de pausa) pra carregar a página inteira.

Uso (com o python do venv): `<skill>/.venv/bin/python scripts/scrape.py --url "<ads library url>" --name <slug> [--domain <dominio>] [--per-type 12] --outdir <pasta>/ads`

## Seleção: quantos ads e balanceamento vídeo × imagem

**A URL TEM que estar ordenada por impressões** (`sort_data[mode]=total_impressions&sort_data[direction]=desc`)
— assim a ORDEM de captura já é o ranking de winners. Numa biblioteca de 18k anúncios você
NÃO pega tudo: o scraper forma um pool (~25 scrolls), **deduplica por criativo único** e
seleciona o **TOP-N de CADA mídia** — mesma quantidade de vídeo e de imagem.
- **N padrão = 12 por tipo (≈24 no total).** Racional: winner maduro repete o padrão em
  3-5 corpos no top 10 → passou de ~12/15 é o mesmo padrão; e vídeo se transcreve 1-por-vez
  (custo), então mais que isso é desperdício. Ajuste com `--per-type`.
- **Balanceado:** o objetivo é a MESMA quantidade nos dois formatos. Se um tipo tiver menos
  que N — ou zero (ex.: nicho 100% vídeo) — pega o que tem e avisa; siga com o que existe.
- Saídas: `<name>-raw.json` (tudo cru, pra auditar) e `<name>.json` (a SELEÇÃO balanceada,
  cada ad com campo `media: video|image`). O print mostra `VÍDEO x/y · IMAGEM x/y`.
- Se um tipo vier abaixo de N e você quer mais, aumente `--scrolls` (o pool cresce e sobem
  mais criativos daquele formato).

## Interpretando os dados

- **`collation_count` = quantos ads usam o MESMO criativo.** É o melhor proxy de winner
  disponível (o FB não expõe impressões de ads comerciais). 70 repetições = o anunciante
  está escalando aquele criativo com força.
- **Deduplique por criativo** (nome do arquivo de vídeo na URL), não por ad id — o mesmo
  vídeo aparece em dezenas de ads. O que interessa é o ranking de criativos ÚNICOS.
- **⚠️ Caso "farm" (collation 1x em tudo):** operações blackhat/agressivas rodam centenas de
  criativos únicos em dezenas de páginas descartáveis — collation_count vira inútil. Proxy
  alternativo: a ORDEM de captura (a busca já veio ordenada por impressões — os primeiros
  da lista são os winners). Sinais de farm: muitas páginas com nome de pessoa, body dos ads
  vazio ("."), LP cloakeada (.info/.click) — anote isso no doc do nicho, é um dado
  estratégico sobre como o mercado opera.
- **⚠️ Ads-ISCA de catálogo (cloaking) — detectar e EXCLUIR do pool.** Parte das operações
  agressivas sobe anúncios cuja mídia NÃO TEM NADA A VER com o nicho — foto de gato em cima
  de um PC, meme, pet, paisagem — com **"esse anúncio tem várias versões" mostrando N fotos
  quase idênticas da mesma cena** (mesmo gato, ângulo levemente diferente). Isso é
  deliberado: a isca esconde o anúncio real da Biblioteca (cloaking de criativo). Checklist
  de detecção — **2 ou mais sinais juntos = isca**:
  1. Mídia sem relação com o nicho/oferta do anunciante;
  2. Múltiplas "versões" que são a MESMA imagem com variação cosmética (crop/ângulo);
  3. `link_url` em domínio de tracker/descartável (`trk.*`, `.site`, `.click`, `.info`)
     em vez do funil real;
  4. Copy vaga de pura curiosidade, sem mecanismo nem promessa do nicho
     ("Only 1.08% of People Know This", "tap to learn more").
  **Consequência dura: isca NUNCA entra no top-N, nunca é transcrita e nunca vira
  referência de copy/formato no doc do nicho** — analisar isca como winner contamina toda a
  extração de padrão e induz o pacote ao erro. Registre apenas na seção de inteligência
  operacional do doc ("o mercado deste nicho cloakeia com iscas de catálogo") como DADO.
  Se o filtro derrubar o pool abaixo do N desejado, aumente `--scrolls` ou refine a busca
  (domínio do funil real, frase exata do mecanismo).
- Repare na razão bodies/criativos: winners maduros rodam 1 copy de body em dezenas de
  vídeos. Isso te diz qual copy está validada (a que se repete) e quantos corpos visuais
  distintos existem de verdade (normalmente 3-5 no top 10).

## Baixando os vídeos

`curl -L` com headers obrigatórios (sem eles a CDN recusa):
```
-A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
-e "https://www.facebook.com/"
```
⚠️ As URLs `fbcdn` EXPIRAM — baixe logo depois da raspagem, na mesma sessão.

## Analisando os top vídeos

1. **Transcrição**: UM POR VEZ (nunca paralelo — transcrição local satura RAM/GPU).
   Vídeos que transcrevem só "Música" = criativo sem narração (texto-na-tela) — isso é um
   DADO, não um erro: anote que o formato winner é mudo.
2. **Grid de frames por vídeo** (6 frames, ffmpeg): é assim que você "assiste" o criativo.
   ```
   ffmpeg -i video.mp4 -vf "fps=6/$DUR,scale=360:-1,tile=3x2" -frames:v 1 grid.jpg
   ```
   Leia: formato (UGC? animação? talking head?), texto na tela, estrutura do end card,
   como o produto/app aparece, casting.
3. Registre tudo no doc do nicho (template em `templates/NICHE-template.md`).
