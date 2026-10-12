# 03 — GERAÇÃO NA KIE · versão NORQVA (imagem, b-roll mudo e música)

API: `https://api.kie.ai/api/v1/jobs/createTask` + consulta em `recordInfo?taskId=`.
Autenticação: `Authorization: Bearer $KIE_API_KEY`. O `scripts/kie.py` cria, consulta e baixa;
o `scripts/gen.py` faz o pacote inteiro a partir do `script.json`
(`images` → `videos` → `music`). Fala gerada por IA está desligada no NORQVA: o `gen.py` recusa
`lines`/`hooks`.

## Custos (estimar e pedir o OK do Ricardo ANTES de gerar)

| Item | Modelo | Custo aprox. |
|------|--------|--------------|
| Imagem (cena de comida) | `google/nano-banana` / `-edit` | ~4 cr |
| B-roll mudo 5 s (i2v) | `kling-3.0/video` sound:false std | ~14 cr/s (~70 cr/take) |
| Música instrumental | Suno via `/api/v1/generate` | ~6-12 cr |

Pacote mudo de referência (1 corpo × 4 aberturas): ~8 b-rolls + ~10 imagens + 1 música
≈ 600-800 cr ≈ US$ 3-4. Teto sem nova pergunta: 2.000 cr (Regra NORQVA 7).
Saldo: `python3 scripts/kie.py credit`.

## Imagens — Nano Banana

- Cena base: `google/nano-banana`, `{"prompt":..., "output_format":"png", "image_size":"9:16"}`.
- Variação da mesma cena (mesmo prato, outro ângulo): `google/nano-banana-edit` com
  `image_urls:[<url da base>]` e o prompt começando por "the exact same dish from the reference image".
- Uma ÚNICA frase de estilo repetida em todo o pacote (ex.: "appetizing editorial food
  photography, warm golden light").
- Cenário dos livros: prato creme com borda dourada, linho rosado, mesa escura, luz quente.
- Toda imagem termina com **"9:16, no text, no UI elements, no people, no hands"**.
- Páginas do livro NÃO são geradas: são capturas reais do PDF (`pdftoppm`, ver `INSTALL.md`).

### Recusa de conteúdo

Se o gerador recusar por conteúdo, o `gen.py` para com "RECUSA DE CONTEÚDO". Não troque de
gerador e não reescreva para passar: avise o Ricardo. Em comida isso quase nunca acontece.

## B-roll — Kling 3.0 (mudo)

```json
{"prompt": "<ação e câmera>. No on-screen text, no captions, no UI elements.",
 "image_urls": ["<url da imagem aprovada>"], "sound": false, "duration": "5", "mode": "std", "multi_shots": false}
```
O Kling 3.0 é i2v: sempre parte de uma imagem aprovada no QC (o `gen.py` gera o quadro inicial
se o b-roll não tiver `ref`).

Cuidados (custaram crédito para aprender):
1. **Metáforas viram objetos literais** ("chuva de sabor" vira chuva). Prompt sempre físico.
2. **Quadro 1 tem fade escuro**: para congelar um quadro, use o meio do vídeo.
3. **Limite de chamadas**: 3 ao mesmo tempo com espera (o `gen.py` já faz). Não aumente.
4. **Links da KIE expiram**: baixe na hora (`refs/urls.json` guarda as URLs; se expirou, gere de novo).
5. Duração: 5 s por b-roll. A última cena do corpo precisa de `seconds + ctaSeconds`.

## Música — Suno via KIE (`gen.py <pacote> music`)

Endpoint próprio:
```
POST https://api.kie.ai/api/v1/generate
{"prompt":"<estilo instrumental>","instrumental":true,"customMode":false,"model":"V4",
 "callBackUrl":"https://example.com/cb"}   ← obrigatório, pode ser fictício (o gen.py consulta)
```
Consulta: `GET /api/v1/generate/record-info?taskId=` até `status: SUCCESS` → `sunoData[].audioUrl`.
Vêm 2 faixas: `music.mp3` e `music_alt.mp3`; ouça e escolha. Prompt em `mudo.music_prompt`.

## Economia

- **Corpo aprovado vale ouro**: aberturas novas sobre o mesmo corpo custam ~10% do pacote.
- Zoom lento em imagem (ffmpeg zoompan ou cena de imagem no `AdMudo`) custa ~4 cr contra ~70 no Kling.
- Imagem → QC → vídeo. Vídeo feito de imagem reprovada é crédito jogado fora.
