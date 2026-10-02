# CREATIVE_FACTORY_KIE_CAPABILITY_AUDIT

**Escopo:** `D:\NORQVA\norqva-criativos-engine` (Creative Factory local) para executar o TRATTORIA_EMOTIONAL_V1.
**Modo:** somente leitura. **Nenhum POST, nenhum crédito consumido, nenhuma implementação.** O `.env` (que contém a `KIE_API_KEY`) **não foi aberto, copiado nem registrado**.
**Autor:** Claude · 2026-10-01

---

## 1. Arquitetura encontrada

A Creative Factory é um orquestrador Python, guiado por manifesto e com gates humanos, executado no venv local (`venv\Scripts\python.exe`, com `PYTHONPATH=engine/src` ou pelo `run_engine.ps1`). Ela chama a KIE (`https://api.kie.ai/api/v1/jobs`) e monta o vídeo com Remotion.

```
campaign_manifest.json (schema factory-manifest-v1)
        │
   factory.cli  ──run / plan / approve / reject / status
        │
 FactoryOrchestrator ── estados (FactoryStage × FactoryState) em factory_state.json
        │
 PREFLIGHT → IMAGE_GENERATION → IMAGE_QA → HUMAN_VISUAL_REVIEW
          → SPEECH_GENERATION → HUMAN_AUDIO_REVIEW
          → BROLL_GENERATION (i2v, só com imagem VISUAL_APPROVED: pre_video_gate)
          → TIMELINE_BUILD → REMOTION_PREP → RENDER → FINAL_QA → HUMAN_FINAL_REVIEW → COMPLETED
        │
 KieImageGenerator (generator.py) ── createTask → recordInfo (poll) → download
```

### Arquivos responsáveis

| Função | Arquivo |
|---|---|
| Cliente/gerador KIE da Factory | `engine/src/factory/generator.py` (`KieImageGenerator`) |
| Orquestração, budget, gates, ledger por stage | `engine/src/factory/orchestrator.py` (93 KB) |
| CLI | `engine/src/factory/cli.py` (`run --authorize-stage --max-credits`, `plan`, `approve`, `reject`, `status`, `--dry-run`, `--resume`) |
| Estados e transições | `engine/src/factory/execution_state.py` |
| Ciclo de vida do asset | `engine/src/factory/asset_lifecycle.py` (generation/technical/visual/audio/content status; `is_asset_render_eligible`) |
| Gate imagem → vídeo | `engine/src/factory/pre_video_gate.py` (`authorize_image_to_video`) |
| QA técnico (ffprobe, aspecto STRICT/COVER/CONTAIN, duração) | `engine/src/factory/technical_qa.py` |
| QA visual automático + adaptador de visão externo | `engine/src/factory/visual_qa.py` |
| Preflight | `engine/src/factory/preflight.py` |
| Manifesto e schema | `engine/src/factory/manifest_parser.py`, `schemas/factory-manifest-v1.schema.json` |
| Guard de custo determinístico (catálogo de créditos) | `engine/src/criativos-infinitos/.../scripts/kie_cost_guard.py`, **não ligado à Factory** |
| Guard de idempotência | `.../scripts/idempotent_guard.py`, usado só pelo `gen.py` legado, **não pela Factory** |
| Helper KIE legado (inclui `credit`) | `.../scripts/kie.py` |
| Montagem | `campaigns/<id>/edit` (Remotion; `Ad.tsx` é composição de **UGC com personagem falando**) |

### Pontos fortes (certificados em produção real, Gates 8C a 8F)

- **Autenticação:** `KIE_API_KEY` lida do ambiente ou do `.env` local; nunca vai para o manifesto.
- **Consulta de saldo:** `get_credit_balance()` (`GET /api/v1/chat/credit`) roda **antes e depois de cada stage pago**, e o saldo fica no resultado da execução.
- **Ledger:** `credits_consumed` por asset no manifesto, total por stage, `balance_before`/`balance_after`.
- **Budget gate:** só gera com `--authorize-stage` + `--max-credits`. **HARD STOP** se a próxima geração passar do teto.
- **Gates humanos:** fila `human_approval_queue`; `approve`/`reject --reason`; o vídeo só sai de imagem `VISUAL_APPROVED`.
- **Lineage/integridade:** `taskId`, SHA-256, tamanho e dimensões por asset; `replaces` para retakes.
- **Dry-run e plano:** `plan` e `run --dry-run` sem POST.

---

## 2. Modelos implementados × necessários

| Modelo (KIE) | Na Factory hoje | Custo real certificado | Necessário para o V1 |
|---|---|---|---|
| `google/nano-banana` (texto → imagem) | ✅ `create_nano_banana_task` | **4 cr/imagem** (Gate 8C: 3 imagens = 12 cr) | Útil para fundos e objetos |
| `google/nano-banana-edit` (imagem + referência) | ❌ só no `gen.py` legado | 4 cr (catálogo do guard) | **Sim**: continuidade entre tomadas |
| **Nano Banana 2** (referências, 2K) | ❌ | ≈ 12 cr em 2K (US$ 0,06; a confirmar) | **Sim**: pessoas e comida realistas |
| `grok-imagine-video-1-5-preview` (pessoa falando com lip-sync) | ✅ `create_grok_speech_task` | **27 cr/take de 6 s** (Gate 8D/8D.1) | Não (o V1 usa voz em off) |
| `kling-3.0/video` (i2v, 5 s, std, sem som) | ✅ `create_kling_broll_task` | **70 cr/vídeo** (Gate 8E: 2 = 140 cr) | **Sim**: alternativa para pessoas (A/B na W2) |
| **Veo 3.1 Fast** (i2v / reference, 9:16) | ❌ | ≈ 60–65 cr/vídeo de 8 s (US$ 0,30–0,325; a confirmar) | **Sim**: comida, vapor, líquidos |
| **Veo 3.1 Quality** | ❌ | ≈ 250–255 cr/vídeo (US$ 1,25–1,275; a confirmar) | **Sim**: só nas 3 tomadas-herói, se o Fast falhar |
| **ElevenLabs TTS** (voz em off, só áudio) | ❌ (a "speech" da Factory é vídeo do Grok, não TTS) | **desconhecido** | **Sim**: narrador |

---

## 3. Saldo atual

**Não consultado.** O mecanismo seguro existe (`get_credit_balance()` e `kie.py credit`), mas exige rodar no seu computador, onde está o `.env`. A shell remota do seu computador **não iniciou nesta sessão** ("workspace unavailable"). Por regra, não levo a chave para outro ambiente.

**Para consultar (GET, custo zero; imprime só o número):**
```powershell
cd D:\NORQVA\norqva-criativos-engine
.\run_engine.ps1 engine\src\criativos-infinitos\skill\criativos-infinitos\scripts\kie.py credit
```
Último saldo certificado (histórico, **não** atual): **9.055,43 créditos**.

---

## 4. Lacunas e riscos encontrados no código certificado

| # | Achado | Impacto no V1 |
|---|---|---|
| L1 | Custos **fixos no código** (4, 27, 70 cr) em vez de vir do `kie_cost_guard` | Modelos novos ficariam com custo errado no ledger e no teto |
| L2 | Limiares de autorização **específicos do teste E2E** (`IMAGE_GENERATION` exige `max_credits ≥ 12`, `SPEECH ≥ 54`, `BROLL ≥ 140`) | Waves com outros valores ficariam bloqueadas ou mal autorizadas |
| L3 | **Idempotência parcial:** o `taskId` é salvo depois do POST, mas a retomada só olha "o arquivo existe?". Se cair entre o POST e o download, uma nova execução **posta de novo** | Risco de cobrança dupla em vídeos caros (Veo Quality ≈ 255 cr) |
| L4 | Categorias fixas no manifesto (`images`, `speech_takes`, `brolls`) e uma tentativa por asset | Sem "tentativas máximas por asset", sem referência entre assets, sem trilha de voz |
| L5 | Mensagem e fluxo do stage de imagem assumem "3 imagens" (texto fixo) | Cosmético, mas indica código feito sob medida para o E2E |
| L6 | Composição Remotion é de UGC (pessoa falando + b-roll + hooks) | O V1 precisa de composição narrativa: cenas + voz em off + trilha + cartão |
| L7 | QA técnico em aspecto STRICT 9:16 | OK para Veo e NB2 em 9:16; checar as dimensões reais na primeira saída |
| L8 | **A pasta não parece estar em Git** (não há `.git` na raiz) | Sem histórico para reverter; qualquer extensão precisa de backup ou Git antes |

---

## 5. Modificações necessárias (estender, sem criar integração paralela)

1. **Registro único de modelos e custos.** Ligar o `kie_cost_guard` à Factory e incluir `nano-banana-2`, `nano-banana-edit`, `veo3.1-fast`, `veo3.1-quality` e `elevenlabs-tts`. Custo desconhecido = `BLOCK_REQUIRES_HUMAN_OVERRIDE` (já é o comportamento do guard). Remover os custos fixos (L1).
2. **`generator.py` (`KieImageGenerator`):** métodos novos `create_nano_banana_2_task(prompt, image_refs)`, `create_veo31_task(prompt, first_frame_url, mode=fast|quality, aspect='9:16')` e `create_tts_task(text, voice)` (só áudio), reaproveitando `poll_task`, `download_file` e os callbacks atuais.
3. **Orquestrador:** autorização por **wave/lista de assets** (`--authorize-assets` ou `--wave`), com o teto vindo do guard, no lugar dos limiares fixos (L2). Os stages atuais são reaproveitados: keyframes → `IMAGE_GENERATION`; cenas → `BROLL_GENERATION` (vídeo i2v sem som, já protegido pelo `pre_video_gate`); voz → stage de áudio com `HUMAN_AUDIO_REVIEW`.
4. **Idempotência (L3):** antes de qualquer POST, se o asset já tem `taskId`, consultar `recordInfo` e baixar em vez de postar.
5. **Manifesto v1.1 (aditivo):** `model`, `references[]`, `attempt`/`max_attempts`, `parent_asset_id`, `license`, categoria `voiceover`. Campanhas v1 continuam válidas.
6. **Remotion:** composição nova `TrattoriaEmotional` (cenas, voz, trilha, cartão final). A composição UGC não é tocada.
7. **Testes:** transporte simulado para os payloads novos; `plan`/`--dry-run` da campanha Trattoria com **zero POST**; regressão do `factory-e2e-test-001` (o `plan` e o `status` têm que continuar iguais e com 0 POST).

**Esforço estimado:** 1,5 a 2,5 dias de desenvolvimento, **0 crédito** (tudo validado em dry-run e com transporte simulado). Antes: colocar a pasta em Git, ou fazer backup (L8).

---

## 6. Orçamento revisado em créditos (unidades reais da Factory e da KIE)

Conversão: 200 cr = US$ 1. "Certificado" = medido nos Gates 8C–8E. "Catálogo" = preço público KIE, a confirmar na primeira operação de cada modelo (o guard bloqueia se o custo for desconhecido).

### Wave 1: keyframes de fundação

| ASSET | MODEL | WHY THIS MODEL | ATTEMPTS (plan./máx.) | UNIT COST | MAX COST | APPROVAL GATE |
|---|---|---|---|---|---|---|
| K01_COZINHA_LUZ | nano-banana (v1) | Cenário sem pessoas; modelo certificado e barato | 2 / 3 | 4 cr (certificado) | 12 cr | HUMAN_VISUAL_REVIEW |
| K04_MESA_PARA_DOIS | nano-banana (v1) | Objetos; baixo risco | 2 / 3 | 4 cr (certificado) | 12 cr | HUMAN_VISUAL_REVIEW |
| K02_PERSONAGEM_A | Nano Banana 2 · 2K | Rosto e mãos realistas; vira referência | 4 / 6 | ≈ 12 cr (catálogo) | 72 cr | HUMAN_VISUAL_REVIEW |
| K03_PERSONAGEM_B | Nano Banana 2 · 2K | Idem | 4 / 6 | ≈ 12 cr | 72 cr | HUMAN_VISUAL_REVIEW |
| K05_PRATO_HEROI | Nano Banana 2 · 2K | Realismo de comida | 3 / 5 | ≈ 12 cr | 60 cr | HUMAN_VISUAL_REVIEW |
| K06_SC01_FRAME | Nano Banana 2 · 2K + refs K01/K05 | Quadro do hook | 3 / 5 | ≈ 12 cr | 60 cr | HUMAN_VISUAL_REVIEW |
| K07_SC04_FRAME | Nano Banana 2 · 2K + refs K02/K03/K04/K05 | Duas pessoas juntas: maior risco | 4 / 6 | ≈ 12 cr | 72 cr | HUMAN_VISUAL_REVIEW |
| K08_SC06_FRAME | Nano Banana 2 · 2K + mesmas refs | Talheres e taças | 4 / 6 | ≈ 12 cr | 72 cr | HUMAN_VISUAL_REVIEW |
| **Wave 1** | | | **26 / 40** | | **432 cr (US$ 2,16)** | **PARE** |

Esperado: **280 cr (US$ 1,40)**.

### Wave 2: teste crítico de movimento (go/no-go)

| ASSET | MODEL | WHY THIS MODEL | ATTEMPTS (plan./máx.) | UNIT COST | MAX COST | APPROVAL GATE |
|---|---|---|---|---|---|---|
| SC01_HOOK_PASTA | Veo 3.1 Fast i2v (K06) → Quality só se o Fast falhar | Física de molho e vapor | Fast 2/2 · Quality 0/2 | 65 cr / 255 cr (catálogo) | 640 cr | HUMAN_VISUAL_REVIEW |
| SC04_HUMAN_SERVING | A/B: Veo 3.1 Fast × **Kling 3.0** (certificado) → vencedor; Quality se necessário | Movimento humano; escolher com evidência | 3 / 4 | 65 / 70 / 255 cr | 460 cr | HUMAN_VISUAL_REVIEW |
| SC06_EMOTIONAL_PAYOFF | Mesmo A/B | Talheres e taças em movimento | 3 / 4 | 65 / 70 / 255 cr | 460 cr | HUMAN_VISUAL_REVIEW |
| **Wave 2** | | | **8 / 12** | | **1.560 cr (US$ 7,80)** | **PARE · go/no-go** |

Esperado: **540 cr (US$ 2,70)**.

### Wave 3: produção (projeção; o modelo de cada asset é confirmado depois da W2)

| ASSET | MODEL | ATTEMPTS (plan./máx.) | UNIT COST | MAX COST | APPROVAL GATE |
|---|---|---|---|---|---|
| Keyframes SC02, SC03a–e, SC05a/c/d/e | Nano Banana 2 · 2K | 14 / 22 | ≈ 12 cr | 264 cr | HUMAN_VISUAL_REVIEW |
| SC02_TABLE_PREPARATION | Vencedor de pessoas na W2 (Kling 3.0 certificado) | 1 / 2 | 70 cr | 140 cr | HUMAN_VISUAL_REVIEW |
| SC03_FRESH_PASTA_PROCESS (5) | Veo 3.1 Fast | 5 / 8 | 65 cr | 520 cr | HUMAN_VISUAL_REVIEW |
| SC05_FOOD_DESIRE (5) | Veo 3.1 Fast (+ carbonara em Quality, se preciso) | 5 / 8 + 0 / 1 | 65 / 255 cr | 775 cr | HUMAN_VISUAL_REVIEW |
| VOZ (≈ 450 caracteres) | ElevenLabs via KIE | 3 / 6 | **desconhecido** → teto de 50 cr com override humano | 50 cr | **HUMAN_AUDIO_REVIEW** |
| Trilha e sons | Biblioteca royalty-free com uso comercial | — | 0 | 0 | HUMAN_AUDIO_REVIEW |
| **Wave 3** | | | | **1.749 cr (US$ 8,75)** | **PARE · rough cut** |

Esperado: **≈ 908 cr (US$ 4,54)**.

### Total

| | Esperado | Worst-case |
|---|---|---|
| Wave 1 | 280 cr | 432 cr |
| Wave 2 | 540 cr | 1.560 cr |
| Wave 3 | 908 cr | 1.749 cr |
| **Total** | **≈ 1.728 cr (US$ 8,64)** | **≈ 3.741 cr (US$ 18,71)** |

Contra o último saldo certificado (9.055,43 cr), o pior caso usaria 41%. **O saldo atual precisa ser lido antes da Wave 1.**

---

## 7. Riscos de regressão

| Risco | Mitigação |
|---|---|
| Mudar o orquestrador quebrar o fluxo certificado do `factory-e2e-test-001` | Teste de regressão: `plan` e `status` da campanha certificada idênticos antes e depois, com 0 POST |
| Trocar custos fixos pelo guard mudar o teto dos stages antigos | Os valores certificados (4/27/70) entram no catálogo; os testes do guard (casos A–E) continuam passando |
| Idempotência nova postar quando não devia | Teste com `taskId` existente: deve fazer poll/download, nunca `createTask` |
| Pasta fora do Git | Inicializar Git (ou backup completo) antes da primeira linha alterada |
| Custo real do Veo, NB2 ou ElevenLabs diferente do catálogo | O guard bloqueia custo desconhecido; o primeiro POST de cada modelo é isolado e conferido no `balance_before`/`balance_after` |

---

## 8. Recomendação

**Executar o Emotional Food Storytelling V1 pela Creative Factory existente, estendida, sem criar uma segunda integração KIE.**

- **O Gate C não roda direto hoje.** Faltam Nano Banana 2, nano-banana-edit (referência), Veo 3.1 e ElevenLabs, e os limiares e custos fixos (L1/L2) foram feitos para o teste E2E.
- **Sequência proposta:**
  1. Git/backup da pasta;
  2. extensão da Factory (itens 1–7 da seção 5), validada só com dry-run e transporte simulado, **0 crédito**;
  3. leitura do saldo pelo `kie.py credit`;
  4. autorização da Wave 1 (teto de **432 cr**).
- **Alternativa mais rápida para a Wave 1, sem código:** usar só o `nano-banana` v1 certificado (4 cr/imagem, teto de 160 cr para 40 imagens), sem referências entre tomadas. É mais barata e imediata, mas tem menos realismo e continuidade mais fraca entre as personagens. Não recomendo para pessoas e comida, que são o centro deste criativo.

**PARE.** Nenhuma geração paga, nenhuma implementação, até nova autorização humana.
