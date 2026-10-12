# 05 — EDIÇÃO NO REMOTION (montagem, legendas, formatos, end cards)

> **NORQVA (contrato NORQVA-0053):** onde este arquivo falar de persona, UGC, depoimento, casting,
> fala gerada por IA, troca de gerador por recusa de conteúdo ou preço, valem as **Regras NORQVA**
> do `SKILL.md`: sem pessoa de IA apresentada como real, sem depoimento inventado, sem preço, e
> recusa de conteúdo = parar e avisar. Formatos permitidos: anúncios mudos de comida (`AdMudo`).


O projeto de edição pronto está em `templates/edit-template/`. Fluxo: copie o template
pra pasta do pacote → `scripts/build.py` gera os JSONs → configure `theme.ts` → renderize.

## Setup por pacote

1. `cp -R templates/edit-template <pacote>/edit && cd <pacote>/edit && npm install`
   (se o install.sh já instalou no template, pode reutilizar o node_modules).
2. `scripts/build.py <pacote>`: transcreve todos os takes (word timestamps, SERIAL),
   aplica chroma key nos green screens, recorta silêncio das pontas (trimStart/trimEnd =
   primeira/última palavra ± 0,3s) e escreve em `edit/public/`: `timeline.json` (body),
   `ctas.json`, `hooks_timeline.json` + copia takes.
3. `theme.ts`: cores e fonte DO FUNIL do usuário (paleta extraída na Fase 3). End card
   que parece a página de destino = coerência que converte.
4. Assets em `edit/public/`: `funnel/*.png` (screenshots do funil), fonte `.ttf`,
   `music.mp3` (se houver), `takes/`.

## Os formatos de hook (Hooks.tsx — prontos no template)

| Formato | Composition | Como monta | Detalhe crítico |
|---------|-------------|-----------|-----------------|
| **React** | `AdReact` | avatar keyado (.mov alpha) ancorado no RODAPÉ sobre o 1º frame do body CONGELADO | `objectFit: contain` + `objectPosition: bottom` — a pessoa NUNCA é cortada, seja qual for a proporção do take (o `cover` antigo cortava rosto/criava faixa preta quando o take não era 9:16). Freeze com `brightness(0.5)` = lê como "vídeo pausado" |
| **Split** | `AdSplit` | b-roll MUDO na metade de cima durante os primeiros 3,5s do body (que toca embaixo) | b-roll de demonstração/cena forte; áudio é o do body |
| **Split-UGC** | `AdSplitUgc` | a pessoa do UGC FALANDO (voz+legenda) na metade de cima + o ad rodando embaixo durante a abertura → depois body fullscreen | é o **2º split** do pacote: um split com b-roll do ad, outro com o rosto do depoimento. Usa um id de hook UGC próprio (`hk_ugc2`) |
| **UGC** | `AdUgc` | take falado espontâneo fullscreen → corta pro body | take próprio, não recorte do body. **SEM celular na mão** (ela É a câmera) |
| **Visual** | `AdVisual` | b-roll fullscreen (muted, loop) + ÁUDIO de um take green screen (só a voz) | gera-se um take gs normal e usa-se apenas o áudio — workaround validado p/ VO |

Body comum a todos: sequência de clips com **punch-in alternado** (clipes ímpares em
`scale(1.1)` — simula segunda câmera, zero custo) + CTA falado + end card.

## Cutaways de b-roll no meio do body (obrigatório — mata o talking-head)

`cutaways` no `defaultProps` de qualquer Composition: b-roll mudo POR CIMA de um clip
falado, com o áudio da fala continuando embaixo (padrão de edição DR clássico):
```ts
cutaways: [{ over: "L03", src: "takes/br_gel.mp4", at: 1.0, dur: 2.4 }]
```
- `over` = id do clip do body · `at`/`dur` em segundos RELATIVOS ao início do clip.
- Fade-in de 3 frames, saída seca; legenda continua por cima do cutaway.
- **Regra de pacote: além do hook e da demonstração em cena, TODO body tem ≥1 cutaway
  no meio** (cobrindo o maior trecho de fala sem ação física). Gere b-rolls a mais na
  Fase 5 pensando nisso — b-roll sobrando custa ~70 cr; talking-head reprova o ad.
- Vale pra todos os formatos (os hooks repassam `cutaways`/`transitions` via BodyProps).

## Inserts de IMAGEM no canto (dopamina — `inserts`)

Foto/print que PIPOCA no canto enquanto a fala continua. NÃO ocupa a tela inteira:
polaroid de ~40% da largura na METADE DE CIMA (a legenda mora embaixo), pop-in com spring
+ leve rotação, saída em fade de 4 frames:

**⛔ FUNÇÃO ANTES DE FORMA — insert é prova, não decoração.** Antes de criar qualquer
insert, responda: *"o que esta imagem PROVA nesta fala?"* Mapeamento:
- fala de **prova social** ("minhas pacientes...") → foto/print DA prova — e se abre
  "antes", FECHA com "depois" no beat de resultado da MESMA fala ou da seguinte;
- fala de **passado** ("antigamente eu...") → foto antiga da persona;
- **claim numérico** ("perdi 12 quilos") → print/foto do número, não imagem genérica;
- fala de **mecanismo** → imagem do mecanismo em ação.
**Regra do par: antes/depois é uma UNIDADE — nunca metade.** "Antes" sozinho planta a
imagem negativa e não fecha o contraste (o desejo nasce do CONTRASTE, não da dor). Se não
couber o par, não use antes/depois nessa fala. Insert sem função narrativa = não entra;
"dinamismo" sozinho não justifica.
**⛔ Regra da verossimilhança do par: roupas, cenário e luz DIFERENTES entre antes e
depois.** Mesma roupa + mesmo quarto = "tirou no mesmo dia" — mata a credibilidade da
prova (ninguém emagrece em 3 semanas com a mesma foto). Antes: flash duro, roupa
levantada, expressão cansada. Depois: OUTRO dia — luz natural, outro cômodo, roupa
ajustada que ela "não usava antes" (blusa na calça jeans, vestido), postura e sorriso.
**Como gerar o contraste (o edit resiste a mudar corpo):** o nano-banana-edit ancora na
referência e entrega mudança de barriga tímida mesmo com "dramatically flatter" — NÃO
empilhe adjetivos; mude o ESTADO (roupa ajustada, cós largo puxado, cenário novo), que o
modelo executa de verdade. Mantenha só rosto/cabelo na âncora ("the exact same woman —
identical face, same hair — but on a DIFFERENT day...").
**QC do par NO TAMANHO REAL:** confira o contraste no tamanho da polaroid renderizada
(~430px), não na imagem cheia — se não ler em 1 segundo ali, reprova e regenera.
```ts
inserts: [{ over: "L06", src: "inserts/antes.png", at: 0.5, dur: 2.8,
            pos: "top-right", rotate: -5, label: "antes" }]
```
- `pos`: `top-left` | `top-right` (default) | `top-center` · `w`: largura px (default 430)
  · `polaroid: false` tira a moldura branca · `label`: legenda da polaroid ("antes", "2019").
- A imagem é gerada na Fase 5 (nano-banana, ~4 cr) no REGISTRO de foto real: "amateur
  smartphone photo, grainy, harsh flash" — polida demais deixa de parecer prova. Salve em
  `edit/public/inserts/`.
- Sincronize com a PALAVRA-gatilho da fala (word timestamps do build): o insert entra
  quando a palavra é dita, não solto no meio da frase.
- Alterne `pos`/`rotate` entre inserts do mesmo ad (tudo no mesmo canto = template).
- QC: o insert não pode cobrir o rosto de quem fala nem a zona de legenda.

## Transições de corte (estilo CapCut, sutis — `transitions`)

Cada corte do body leva **punch-zoom** (1.07→1 em 5 frames) + **flash branco** (0.35→0
em 3 frames) — o "snap" de edição rápida sem virar slideshow. Ligado por default;
`transitions: false` desliga (corte 100% seco). NÃO adicione slides/wipes/giros longos:
DR vive de corte seco com impacto — transição visível demais = cara de template.

## Legendas (Captions)

- **Chunks de 3 palavras**, sincronizados por word timestamps da transcrição.
- Estilo DR validado: Arial Black 900, 64px (1080×1920), UPPERCASE, branco,
  `WebkitTextStroke 3px black` + `paintOrder: stroke fill`, sombra.
- **Highlight de 1 palavra por chunk** (a mais longa) com fundo colorido (cor do tema).
- **NUNCA karaokê palavra-a-palavra** (testado e reprovado — cansa e distrai).
- Posição: bloco a ~640px do fundo (safe zone de UI do feed). Legenda NUNCA sobre rosto —
  se a cena tem rosto baixo, suba/desça o bloco naquele formato (prop `bottom`).
- Cenas SEM VO (ads mudos): texto ESTÁTICO por cena (1-2 linhas grandes), scrim escuro
  arredondado atrás (rgba(12,20,38,0.42), radius 28) + fade-in de 10 frames, fonte do
  funil, palavras-chave coloridas no tema.

## CTA — o fechamento que converte (PADRÃO: texto pulsante sobre o vídeo)

**NÃO existe mais end card de marca** (aquele cartão com wordmark/screenshot tinha cara de
anúncio). O fechamento agora é **nativo**: nos segundos finais (a fala do CTA), um **pill de
texto grande + uma seta pulsando** apontando pro botão do feed, **por cima do vídeo** — a
legenda daquela cena dá lugar ao CTA. Componente `CtaArrow` no `Ad.tsx`.
- **VARIA por ad** (obrigatório — cada ad do pacote tem o seu, pra não ficar tudo igual):
  `ctaOverlay: { text, color?, font?, arrow? }` no `defaultProps` de cada Composition do
  Root.tsx. Ex.: `{ text: "WATCH THE FREE VIDEO", arrow: "▼" }`, outro
  `{ text: "GET THE RECIPE", color: "#e0a93b", arrow: "👇" }`.
  - **text**: verbo + promessa curta, coerente com o CTA falado (UPPERCASE).
  - **color**: default = cor de ação do funil (`THEME.accent`); varie por ad pra dar ritmo.
  - **arrow**: `▼` / `👇` / `☟` etc. — aponta pro botão do feed (embaixo).
  - **font**: default Arial Black; troque se o nicho pede outra pegada.
- Animação padrão: entrada com spring, seta quicando (sine) + pulso de opacidade.
- `shoot_funnel.py` continua no pacote (screenshot do funil serve de prova/ref), mas NÃO é
  mais o fechamento do vídeo.

## Regras duras do Remotion (bugs que já custaram tempo)

1. `Composition id`: só `a-z A-Z 0-9 -` — underscore QUEBRA o render.
2. Fonte custom: `delayRender` + `FontFace` — `delayRender("font", {timeoutInMilliseconds:
   120000})` e SEMPRE renderizar com `--timeout=120000` (fonte às vezes estoura o default).
3. Vídeo com alpha (avatar keyado): `<OffthreadVideo transparent src=".mov">`.
4. Áudio de .mov ProRes é PCM — pra usar só a voz de um take keyado, aponte o `<Audio>`
   pro .mp4 ORIGINAL (cópia em `takes_raw/`), não pro .mov.
5. Trim por frames: `trimBefore/trimAfter = Math.round(segundos * fps)`.
6. Música: volume 0.85 com fade-in 1s e fade-out 1,5s (interpolate no volume). VO sempre
   acima da música — se houver ambos, música a 0.25.
7. Render: `npx remotion render src/index.ts <CompId> ../out/<CompId>.mp4 --timeout=120000`.
8. `staticFile()` para TODO asset de public/ (nunca path relativo).

## Nomes de arquivo de saída

`<Marca><Formato>.mp4` — ex.: `AlunaReact.mp4`, `AlunaSplit.mp4`. Sem espaço, sem
underscore, sem acento (id da Composition = nome do arquivo).
