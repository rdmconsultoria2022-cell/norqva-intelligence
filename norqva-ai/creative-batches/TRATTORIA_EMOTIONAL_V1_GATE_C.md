# TRATTORIA_EMOTIONAL_V1_MASTER — Gate C: plano de geração

**Status:** aguardando aprovação humana. **Zero geração paga até a aprovação.**
**Base:** roteiro (Gate A aprovado com ajustes) e storyboard (Gate B aprovado) em `TRATTORIA_EMOTIONAL_V1.md` · regras de figurantes em D-0010.
**Autor:** Claude · 2026-10-01

---

## 1. Estratégia: imagem antes de vídeo

Gerar vídeo direto do texto desperdiça crédito: a maioria das tomadas sai com mão, comida ou rosto errado, e cada tentativa custa caro. O plano faz em duas etapas, com aprovação humana entre elas:

1. **Quadros-chave (still):** para cada tomada, 4 opções de imagem. Custa centavos. Você aprova 1 por tomada. É aqui que se travam rosto, roupa, cozinha, prato e luz, e portanto a continuidade.
2. **Imagem → vídeo:** só os quadros aprovados viram vídeo (image-to-video). O vídeo herda o que já foi aprovado, e o retrabalho cai muito.

Os vídeos são gerados **sem áudio**. Voz, trilha e sons de cozinha entram na montagem (Gate F), com controle total e licença clara.

---

## 2. Modelos propostos

| Etapa | Modelo | Por quê |
|---|---|---|
| Quadros-chave | **Gemini 3.1 Flash Image ("Nano Banana")**, 2K | Bom em comida e mãos, edição por instrução para manter continuidade entre tomadas, custo baixo |
| Vídeo (maioria) | **Veo 3.1 Fast**, image-to-video, 1080p, 9:16, sem áudio | Física de líquidos e vapor convincente, aceita quadro inicial, 9:16 nativo |
| Vídeo (3 tomadas-herói) | **Veo 3.1** (qualidade), image-to-video | SC01 (hook), SC05 carbonara e SC06 (brinde): onde a qualidade decide se a pessoa para de rolar |
| Alternativa de vídeo | Kling 2.5 Turbo Pro (image-to-video) | Mais barato por segundo. Plano B se o Veo errar muito em mãos ou massa |
| Voz | **ElevenLabs**, plano Starter (licença comercial), voz pt-BR, modelo multilíngue | Licença comercial a partir do plano Starter; o plano gratuito não permite uso comercial |
| Trilha e sons | Biblioteca royalty-free com uso comercial (Pixabay) ou efeitos da ElevenLabs | Sem custo extra; a licença fica registrada no lineage |

---

## 3. Assets e quantidade de gerações

| Asset | Tomadas | Duração gerada | Quadros-chave (4 por tomada) | Tentativas de vídeo previstas | Segundos de vídeo |
|---|---|---|---|---|---|
| SC01_HOOK_PASTA | 1 | 6 s | 4 | 3 (Veo 3.1 qualidade) | 18 s (qualidade) |
| SC02_TABLE_PREPARATION | 1 | 6 s | 4 | 3 | 18 s |
| SC03_FRESH_PASTA_PROCESS | 5 (farinha, abrir, sovar, molho, parmesão) | 4 s cada | 20 | 2 por tomada | 40 s |
| SC04_HUMAN_SERVING | 1 | 6 s | 4 | 3 | 18 s |
| SC05_FOOD_DESIRE | 5 (carbonara, pomodoro, cacio e pepe, ragu, garfo) | 4 s cada | 20 | 2 por tomada (carbonara em qualidade) | 32 s Fast + 8 s qualidade |
| SC06_EMOTIONAL_PAYOFF | 1 | 6 s | 4 | 3 (Veo 3.1 qualidade) | 18 s (qualidade) |
| SC07_OFFER | reaproveita SC06 + tipografia | — | 0 | 0 | 0 |
| **Total** | **14 tomadas** | | **56 imagens** | **≈ 32 vídeos** | **≈ 108 s Fast + 44 s qualidade** |

"Tentativas previstas" já contam com rejeições na inspeção humana. Se uma tomada passar de primeira, o resto do orçamento dela fica sem uso.

---

## 4. Custo estimado

Preços de referência públicos de setembro de 2026, de agregadores e guias. **O preço oficial é confirmado no console antes de cada lote (Gate D).** Câmbio de referência: US$ 1 ≈ R$ 5,40.

| Item | Cálculo | Faixa (US$) |
|---|---|---|
| Quadros-chave | 56 × US$ 0,10 (2K) | ≈ 6 |
| Vídeo Veo 3.1 Fast, sem áudio | 108 s × US$ 0,08–0,25/s | 9 – 27 |
| Vídeo Veo 3.1 qualidade, sem áudio | 44 s × US$ 0,20–0,40/s | 9 – 18 |
| Voz ElevenLabs Starter (1 mês, licença comercial) | fixo | 5 |
| Trilha e sons (royalty-free) | — | 0 |
| **Total estimado** | | **≈ US$ 29 – 56 (≈ R$ 160 – 300)** |

### Orçamento solicitado

**Teto: US$ 70 (≈ R$ 380)**, liberado em três parcelas, cada uma com parada obrigatória:

| Parcela | Libera | Teto | Parada |
|---|---|---|---|
| 1 | Quadros-chave das 14 tomadas | US$ 10 | Você aprova 1 quadro por tomada (Gate E parcial) |
| 2 | Vídeos das 14 tomadas | US$ 50 | Você aprova cada vídeo (Gate E) |
| 3 | Voz + montagem | US$ 10 | Rough cut (Gate G/H) |

**Regra de parada:** se uma tomada for rejeitada 3 vezes, eu paro, reviso o prompt ou o quadro com você, e só então gasto de novo. Se o custo acumulado passar de 80% de uma parcela, aviso antes de continuar.

---

## 5. Créditos disponíveis e execução

**Não tenho acesso a nenhuma conta paga** (Google AI Studio/Vertex, Kling, ElevenLabs), e o NORQVA não tem chave do Google nem da ElevenLabs configurada. Por regra, eu não gero, copio nem colo chaves de API. Duas formas de executar:

- **(A) Você gera, eu dirijo e faço QA.** Você roda os prompts deste plano na sua conta (Google Flow ou AI Studio, ElevenLabs) e me manda os arquivos. Eu inspeciono, aprovo ou rejeito, e monto o corte. Começa hoje, sem código.
- **(B) Integração no NORQVA.** Você coloca as chaves na Render (`GEMINI_API_KEY`, `ELEVENLABS_API_KEY`). Eu implemento a geração na Fábrica de Criativos, com teto de gasto, registro de custo, SHA e lineage por asset, e aprovação humana em cada gate. Leva 1–2 dias de desenvolvimento e serve para os próximos criativos.

**Preciso que você me diga:** qual caminho (A ou B), e quanto crédito existe hoje em cada conta.

---

## 6. Rastreabilidade de cada asset (lineage)

Registro por asset em `norqva-ai/creative-batches/TR-EMO-V1/lineage.json`:

```
asset_id, scene, take, stage (KEYFRAME|VIDEO|VOICE|MUSIC|SFX|CUT),
model, model_version, prompt, negative_prompt, seed, parent_asset_id,
duration_s, cost_usd, sha256, technical_qa, visual_qa, human_approval (APPROVED|REJECTED + motivo),
license (para voz, trilha e sons), created_at
```

---

## 7. Prompts-base dos quadros-chave (rascunho para aprovação)

Bloco de estilo comum, anexado a todos os prompts:

> *Cinematic warm Italian home dinner, natural practical lighting (warm lamp, dusk window), real modest home kitchen with wood, steel, ceramic and linen, subtle imperfections, shallow but natural depth of field, 35mm film look, true-to-life food texture, ordinary attractive people in home clothes, no one looks at the camera. Vertical 9:16.*

Bloco negativo comum:

> *No plastic skin, no deformed or extra fingers, no geometric perfect food, no luxury showroom kitchen, no excessive bokeh, no surreal lighting, no oversaturation, no text, no logos, no green color cast, no smiling to camera.*

| Tomada | Prompt específico |
|---|---|
| SC01 | Macro at 45° of fresh tagliatelle being tossed with tongs into glossy tomato pomodoro sauce in a steel pan, irregular real steam rising, sauce clinging to strands, a few basil leaves |
| SC02 | Medium shot, a person in a soft knit sweater seen from 3/4 behind, setting the second wine glass on a small wooden dinner table for two, linen napkins, simple cream plates, warm lamp in background |
| SC03a | Macro of flour falling onto a worn wooden board, fine powder, side light |
| SC03b | Macro of a rolling pin opening a sheet of fresh egg pasta dough on the same wooden board, natural uneven edges |
| SC03c | Close-up of two hands folding and kneading yellow egg pasta dough, natural nails, flour on knuckles, same sleeves as SC02 |
| SC03d | Close-up of a wooden spoon stirring pomodoro sauce in the same steel pan as SC01 |
| SC03e | Close-up of parmesan being grated with a box grater directly onto a plate of tagliatelle al pomodoro |
| SC04 | Medium profile shot, the same person from SC02 placing a plate of tagliatelle al pomodoro in front of their partner seated at the table; the partner looks up with a small genuine smile; eye contact between them; no one looks at the camera |
| SC05a | Macro of spaghetti carbonara on a cream ceramic plate, glossy silky sauce (not scrambled egg), crisp guanciale, black pepper |
| SC05b | Macro of tagliatelle al pomodoro with fresh basil on a terracotta plate |
| SC05c | Macro of creamy cacio e pepe (tonnarelli), glossy emulsion, cracked black pepper |
| SC05d | Macro of pappardelle with slow-cooked ragù alla bolognese, rich texture |
| SC05e | Macro of a fork twirling tagliatelle al pomodoro, parmesan on top |
| SC06 | Wide-medium shot of the same couple at the same table, first bite, relaxed conversation, glasses gently raised toward each other, warm lamp, cozy home |

Os prompts de vídeo (movimento) usam o quadro aprovado como imagem inicial e descrevem só o movimento: "slow 5 cm dolly-in, steam drifts, tongs lift and turn the pasta once" etc. Eles são escritos depois da aprovação dos quadros.

---

## 8. Itens que continuam bloqueando o corte final

- "28 receitas": exige verificação no produto (contagem no PDF).
- Legenda *"Imagens ilustrativas"* no SC05 e no SC07 (D-0010).
- Nada é publicado na Meta e nenhuma campanha é alterada (seção 12 do briefing).
