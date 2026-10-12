# 03 — GERAÇÃO NA KIE (Nano Banana · Kling 3.0 · Grok Imagine Video 1.5 · Suno)

> **NORQVA (contrato NORQVA-0053):** onde este arquivo falar de persona, UGC, depoimento, casting,
> fala gerada por IA, troca de gerador por recusa de conteúdo ou preço, valem as **Regras NORQVA**
> do `SKILL.md`: sem pessoa de IA apresentada como real, sem depoimento inventado, sem preço, e
> recusa de conteúdo = parar e avisar. Formatos permitidos: anúncios mudos de comida (`AdMudo`).


API: `https://api.kie.ai/api/v1/jobs/createTask` + poll em `recordInfo?taskId=`.
Auth: `Authorization: Bearer $KIE_API_KEY`. O helper `scripts/kie.py` faz create/poll/download;
`scripts/gen.py` orquestra o pacote inteiro a partir do `script.json`.

## Custos (planeje ANTES de gerar)

| Item | Modelo | Custo aprox. |
|------|--------|--------------|
| Imagem (ref/cena) | `google/nano-banana` / `-edit` | ~4 cr |
| Vídeo FALADO 5-8s em INGLÊS (voz+lipsync nativos) | `kling-3.0/video` sound:true std | ~20 cr/s |
| Vídeo FALADO 5-8s em PT/ES/outros (voz+lipsync nativos) | `grok-imagine-video-1-5-preview` 720p | 4,5 cr/s (~36 cr/take 8s) |
| Vídeo MUDO 5s (b-roll, i2v) | `kling-3.0/video` sound:false std | ~14 cr/s (~70 cr/take) |
| Música instrumental | Suno via `/api/v1/generate` | ~6-12 cr |

Pacotes de referência: **GC/Storytelling** (1 persona falando: ~13 takes + 2 brolls +
7 imgs) ≈ 1.900 cr ≈ US$10 · **Podcast** (2 personas, mais takes de reação) ≈ 2.300 cr
≈ US$12 · pacote sem VO — só quando o nicho valida formato mudo (~10 takes + 12 imgs)
≈ 800 cr ≈ US$4.
Saldo: `GET /api/v1/chat/credit`. Regra da skill: estimar, informar, e pedir OK se > 2.500 cr.

## Imagens — Nano Banana

- **Base do personagem**: `google/nano-banana`, `{"prompt":..., "output_format":"png", "image_size":"9:16"}`.
- **Todas as outras cenas**: `google/nano-banana-edit` com `image_urls:[<url da base>]` e
  prompt começando por **"the exact same <persona> from the reference image — identical
  face, same hair, same clothes —"**. Sem essa âncora o rosto DERIVA entre cenas.
- Pode passar 2 refs (base + mascote/produto) pra compor personagem + elemento recorrente.
- Estilo: escolha UMA frase de estilo e repita idêntica em todo prompt do pacote
  (ex.: "candid still frame from a real smartphone video" ou "high-end 3D animated film
  still in the style of a Pixar movie"). Misturar frases de estilo = pacote incoerente.
- **⛔ ANTI-PLÁSTICO (pele realista — obrigatório em persona live-action).** "Photorealistic"
  sozinho ativa o prior de beleza do modelo e sai pele de porcelana que grita IA. A base do
  personagem JÁ NASCE real — as cenas via edit herdam, e o i2v propaga pro vídeo de graça:
  - USE: "candid still frame from a real smartphone video, slightly grainy with mild
    compression, unretouched natural skin with visible pores, fine lines and slight shine,
    no beauty filter, no retouching, documentary look, real shadows".
  - EVITE como descritor principal: "photorealistic", "realistic skin texture", "beautiful
    lighting" (todos empurram pro render de estúdio).
  - Calibre olhando um FRAME dos winners raspados (filmagem real = ground truth do nicho) e
    descreva AQUELA câmera. ⚠️ Anexar o frame como 2ª referência de "estilo" no
    nano-banana-edit NÃO funciona — o edit pesa quase tudo na ref de identidade e ignora a
    de qualidade (testado). A alavanca é o VOCABULÁRIO, não a ref anexada.
  - QC de pele (gate de imagem): compare o rosto gerado com um frame de winner — se o seu
    parece render 3D do lado da filmagem real, reprova e regenera a BASE (consertar cena a
    cena não adianta; a base contamina tudo).
- Sempre terminar com **"9:16, no text, no UI elements, no recording indicators"** (texto
  vem depois, no Remotion — texto gerado por IA em imagem sai errado e não é editável).
- **⚠️ NUNCA descreva a cena como "recording a video / selfie video / filming"** — o modelo
  desenha a UI de gravação LITERAL (bolinha REC, timestamp) queimada na imagem, e ela se
  propaga pra TODOS os takes via i2v. Diga a POSE, não o ato de gravar: "facing the camera
  at close mid-shot, casual candid framing, direct eye contact".
- Cadeia de dependência: gere a base PRIMEIRO, espere a URL, depois as cenas que a
  referenciam (o gen.py ordena sozinho).

### Recusa de conteúdo (NORQVA)

Se o gerador recusar uma imagem ou vídeo por conteúdo, o `gen.py` para com "RECUSA DE
CONTEÚDO". Não troque de gerador e não reescreva para passar: avise o Ricardo. Em comida isso
quase nunca acontece; quando acontece, normalmente é um prompt ambíguo.

## ⚠️ MODELO DE FALA POR IDIOMA (NORQVA: fala gerada por IA está desligada; seção mantida só como referência)

**Kling 3.0 só gera áudio confiável em INGLÊS.** Em PT/ES/outros ele puxa o áudio pro
inglês (mesmo com voz e prompt no idioma certo) — resultado: áudio inglês debaixo de
legenda PT = lixo. Regra:

| Idioma do ad | Modelo de fala | Observações |
|--------------|----------------|-------------|
| Inglês | `kling-3.0/video` (sound:true) | ok, ~20 cr/s |
| PT / ES / outros | **Grok Imagine Video 1.5** (`grok-imagine-video-1-5-preview`, endpoint `/jobs` normal) | fala nativa no idioma-alvo, 4,5 cr/s a 720p (~36 cr / take 8s ≈ US$0,18) |

O `gen.py` já escolhe sozinho pelo `meta.idioma` do script.json (LANG != en → Grok). Só
garanta que o `meta.idioma` está certo. **B-rolls mudos continuam no Kling** (não têm fala).

### Grok Imagine Video 1.5 na KIE (fala multilíngue)
- Mesmo endpoint/poll de tudo (`/api/v1/jobs/createTask` + `recordInfo`), modelo
  `grok-imagine-video-1-5-preview`. i2v: `image_urls:[<url da cena aprovada>]`.
- Input: `{"prompt": ..., "image_urls": [...], "resolution": "720p", "duration": 8, "aspect_ratio": "9:16"}`
  — `duration` é INTEIRO (1-15s); `aspect_ratio` é ignorado com 1 imagem (segue a imagem).
- Prompt em INGLÊS descrevendo cena/mood; a fala vai entre aspas no idioma do ad:
  `She speaks directly to camera in fluent Brazilian Portuguese. She says, in Brazilian
  Portuguese: "<fala>". Clean audio, no background music. No on-screen text, no subtitles,
  no captions, no UI elements.`
- Preço: 480p 2,4 cr/s · 720p 4,5 cr/s · 1080p 8 cr/s (1080p aceita só 1 imagem).
- Saída 720p vem em 720×1264 (9:16 aproximado) — o Remotion cobre em 1080×1920 sem problema.
- Validado 05/set/2026 (pacote Receitas Sem Pensar, PT-BR): 9 takes, transcrição 100% igual
  ao roteiro, 310 cr por 69s. QC visual segue igual ao dos outros modelos (`04-qc.md`).

## Vídeos — Kling 3.0

**Take falado (i2v)**: partir SEMPRE de imagem aprovada no QC:
```json
{"prompt": "<cena>, <mood>, natural movements. She speaks in <voz>. She says: \"<fala>\". No background music, clean room tone only.",
 "image_urls": ["<url da cena>"], "sound": true, "duration": "6", "mode": "std", "multi_shots": false}
```
**B-roll mudo**: mesmo formato com `"sound": false` e prompt só de ação/câmera.

### Gotchas do Kling (todos custaram crédito pra aprender — respeite)

1. **Engole palavras em finais densos.** Fechamento de fala com palavras simples e curtas.
   Por isso TODO take falado é transcrito e conferido palavra a palavra no QC.
2. **Displays/LED/relógios derretem** com o tempo do take (3:04 vira lixo). Prompt pedindo
   "digits stay static" NÃO resolve. Fix pós: recortar o display do frame 0 (que vem da
   imagem, perfeito) e sobrepor estático no clipe inteiro — receita em `04-qc.md`.
3. **Gírias/metáforas viram objetos literais** em cena ("spilling tea" = chá derramando).
   Prompt de cena sempre literal e físico.
4. **Frame 1 tem fade escuro** — pra amostrar cor (chroma) ou congelar frame, use o meio
   do vídeo, nunca o frame 1 (exceto overlay de display, que usa o frame 0 exato).
5. **Rate limit**: bursts de createTask tomam 429. Throttle de 3 concorrentes + backoff
   (o gen.py já faz). Não aumente.
6. **URLs de resultado da KIE expiram** (tempfile). Baixe imediatamente; se precisar
   reusar uma imagem como referência dias depois, o `refs/urls.json` local guarda as URLs —
   se expiraram (403), re-hospede o PNG local ou regenere.
7. Duração: use 5s pra b-roll e 5-8s pra fala (dimensione pela fala real; não corte).

## Música — Suno via KIE

Endpoint DIFERENTE (não é /jobs):
```
POST https://api.kie.ai/api/v1/generate
{"prompt":"<estilo instrumental>","instrumental":true,"customMode":false,"model":"V4",
 "callBackUrl":"https://example.com/cb"}   ← obrigatório, pode ser dummy (a skill faz poll)
```
Poll: `GET /api/v1/generate/record-info?taskId=` até `status:SUCCESS` → `sunoData[].audioUrl`
(vem 2 faixas por task — baixe as duas, escolha a melhor). Use em ads SEM narração;
ads com VO não precisam de trilha (o usuário pluga trending sound na plataforma se quiser).

## Padrões de eficiência

- **Corpo pago = ouro.** Variações novas (hook novo, casting novo via nano-banana-edit
  mantendo a copy) custam ~10% do pacote. Só regenere corpo quando o ângulo muda.
- Prova estática animada (zoom lento em imagem) sai por ~5 cr com ffmpeg zoompan em vez
  de 70+ no Kling — use pra inserts de prova (antes/depois, print, gráfico).
- Gere imagem → QC → vídeo. Vídeo de imagem reprovada = crédito jogado fora.
