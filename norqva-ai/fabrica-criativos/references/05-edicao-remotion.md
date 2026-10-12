# 05 — EDIÇÃO (Remotion) · versão NORQVA: anúncio mudo de comida (`AdMudo`)

O NORQVA só usa a composição **`AdMudo`** (`templates/edit-template/src/Mudo.tsx`). Os formatos
originais com pessoa de IA falando (React, UGC, Split-UGC, Visual com voz de avatar, cutaways
sobre fala, legenda por transcrição, antes/depois de pessoa) foram tirados (Regras NORQVA).

## Montagem

1. `cp -R <skill>/templates/edit-template <pacote>/edit && (cd <pacote>/edit && npm install)`.
2. `theme.ts`: já vem com creme e terracota dos livros de cozinha; ajuste à página do produto.
3. `python3 <skill>/scripts/build_mudo.py <pacote>`: confere o `script.json` (preço, ids,
   chamadas repetidas, arquivos, duração das cenas) e grava `edit/public/mudo.json` com os
   arquivos usados.
4. Render de cada anúncio: `cd <pacote>/edit && npx remotion render src/index.ts <Id> ../out/<Id>.mp4 --timeout=120000`.

## Formato do `mudo` no `script.json` (ver `templates/script-exemplo.json`)

```json
"mudo": {
  "music": "music.mp3",                 // gerada pelo gen.py <pacote> music (opcional)
  "narration": "narracao.mp3",          // opcional: voz REAL do Ricardo (nunca voz de IA "de cliente")
  "body": [ {"src": "takes/br_massa.mp4", "seconds": 3.5, "lines": ["Massa fresca em casa", "sem máquina"]} ],
  "ads": [ {"id": "KitMesa", "abertura": {"src": "takes/br_lasanha.mp4", "seconds": 3, "lines": ["..."]},
            "cta": {"text": "VEJA AS RECEITAS", "color": "#B5523B", "arrow": "👇"}, "ctaSeconds": 2.5} ]
}
```

- **Cena** = `src` (b-roll `takes/*.mp4` ou imagem `refs/*.png` — páginas REAIS do livro entram
  como imagem com zoom lento), `seconds` e 1-2 `lines` curtas de texto na tela.
- **Anúncio** = abertura própria + o mesmo corpo + chamada final própria. A chamada fica sobre a
  última cena do corpo, que é estendida por `ctaSeconds` (padrão 2,5 s): o b-roll da última cena
  precisa durar `seconds + ctaSeconds` (o `build_mudo.py` confere) ou use uma imagem.
- **Ids**: só letras, números e hífen (underscore quebra o render). Nome do arquivo = id.

## Texto na tela e chamada

- 1-2 linhas grandes por cena (`StaticOverlay`: fundo escuro arredondado, entrada suave).
- Frases curtas, sem preço (D-0053), só promessas VERIFICADAS do produto.
- Chamada final (`CtaArrow`): texto + seta pulsando para o botão do feed, DIFERENTE em cada anúncio.
- Música abaixo da narração quando houver as duas (0,18); sozinha, 0,6.

## Regras do Remotion (bugs que já custaram tempo)

1. `Composition id` só `a-z A-Z 0-9 -`.
2. Fonte custom é opcional (`theme.fontFile`); sempre renderize com `--timeout=120000`.
3. `staticFile()` para todo arquivo de `public/`.
4. Vídeo mais curto que a cena = fim preto: corte a cena ou gere b-roll maior.
