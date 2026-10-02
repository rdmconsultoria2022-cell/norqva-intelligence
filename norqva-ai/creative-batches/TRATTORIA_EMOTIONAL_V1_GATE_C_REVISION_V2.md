# TRATTORIA_EMOTIONAL_V1_MASTER — GATE_C_REVISION_V2

**Status:** aguardando nova autorização humana. **Zero geração paga. Nenhum POST pago foi feito nesta auditoria.**
**Substitui:** o plano de orçamento do `TRATTORIA_EMOTIONAL_V1_GATE_C.md` (≈ 32 tentativas, teto de US$ 70 não autorizado).
**Autor:** Claude · 2026-10-01

---

## 1. Auditoria da infraestrutura KIE

### 1.1 No NORQVA (repositório `norqva-intelligence`, todos os branches)

| Item | Resultado |
|---|---|
| Cliente/serviço KIE no backend | **Não existe.** Nenhuma chamada a `api.kie.ai` |
| Variáveis de ambiente `KIE_*` (código e `render.yaml`) | **Não existem** |
| Integração KIE na Creative Factory (NORQVA-0005) | **Não existe.** A Fábrica registra criativos, claims e aprovações, mas não gera mídia |
| Rastro de uso da KIE | Só no `frontend/public/app/bolso-blindado/RELEASE_MANIFEST.json`, em `financial_ledger`: `reference_kie_balance: 8679.43`, `credits_consumed: 0`, `paid_calls: 0`, de **2026-09-18** |

**Conclusão:** a "infraestrutura KIE existente" **não está neste repositório.** Ela provavelmente vive no ambiente de quem gerou os assets do Bolso Blindado (Antigravity/GPT ou scripts locais). **Preciso que o operador indique onde ela está** (repositório, pasta no computador ou ferramenta) para auditar o código e o registro de custos.

### 1.2 Na conta KIE

O saldo só pode ser lido com a chave da conta (`GET https://api.kie.ai/api/v1/chat/credit`, com `Authorization: Bearer`). **Não tenho a chave, e por regra não manipulo chaves.** Por isso:

| Item pedido | Situação |
|---|---|
| **Saldo atual** | **Não verificado.** Última referência: **8.679,43 créditos ≈ US$ 43,40** (18/09). O operador confirma no painel da KIE |
| Nano Banana 2 | Disponível no catálogo público: 1K US$ 0,04 · 2K US$ 0,06 · 4K US$ 0,09 por imagem |
| Veo 3.1 Fast | Disponível: **US$ 0,325 por vídeo** (1080p) |
| Veo 3.1 Quality | Disponível: **US$ 1,275 por vídeo** (1080p) |
| Image-to-video / reference-to-video | Disponível no Veo 3.1 da KIE: `FIRST_AND_LAST_FRAMES_2_VIDEO` e `REFERENCE_2_VIDEO` (este só no Fast/Lite) |
| 9:16 | Disponível (`aspect_ratio: 9:16`) |
| ElevenLabs TTS | Disponível na KIE: `text-to-speech-multilingual-v2`, `turbo-2-5`, `text-to-dialogue-v3`. **Preço por caractere, suporte a português e licença comercial não confirmados** na documentação pública |
| Kling 3.0 (alternativa para pessoas) | Disponível: US$ 0,07 por segundo |
| Conversão de créditos | 200 créditos = US$ 1 (1 crédito = US$ 0,005), segundo a tabela pública de VEO 3 (60 créditos = US$ 0,30) |

**Custos reais em créditos:** os valores acima são da página pública. Antes de cada wave, confirmo o custo de **uma** operação de cada tipo pelo registro da conta (o primeiro POST autorizado de cada modelo) e só então sigo.

**Pendências de licença (bloqueiam o render final, não a Wave 1):**
- uso comercial do vídeo do Veo gerado via KIE: confirmar nos termos da KIE;
- uso comercial da voz ElevenLabs gerada via KIE: confirmar se a KIE repassa a licença. Se não repassar, a voz vai para a conta própria da ElevenLabs (Starter, US$ 5), **só com nova autorização**.

**Não foi criado nada:** nenhuma chave Gemini, nenhuma conta Google, nenhuma chave ElevenLabs, nenhum billing externo.

---

## 2. Geração progressiva por waves

Cada wave termina em **PARE + revisão humana**. A wave seguinte só começa com autorização explícita.

### Wave 1: keyframes de fundação

Só o necessário para fixar personagem, cozinha, luz, figurino, mesa, pratos, linguagem e continuidade. Mais alternativas só onde o risco visual é maior. Modelo: **Nano Banana 2, 2K** (US$ 0,06 = 12 créditos por imagem), com edição por referência para manter a continuidade.

| ASSET | MODEL | WHY THIS MODEL | ATTEMPTS (planejado / máx.) | UNIT COST | MAX COST | APPROVAL GATE |
|---|---|---|---|---|---|---|
| K01_COZINHA_LUZ (bancada, panela, luz de anoitecer) | Nano Banana 2 · 2K | Define cenário e luz de todas as cenas; edição por referência mantém a mesma cozinha | 2 / 3 | US$ 0,06 | US$ 0,18 | W1 · revisão humana |
| K02_PERSONAGEM_A (quem cozinha; rosto, mãos, figurino) | Nano Banana 2 · 2K | Alto risco: rosto e mãos; precisa ser referência estável para o vídeo | 4 / 6 | US$ 0,06 | US$ 0,36 | W1 · revisão humana |
| K03_PERSONAGEM_B (quem recebe) | Nano Banana 2 · 2K | Mesmo risco de K02 | 4 / 6 | US$ 0,06 | US$ 0,36 | W1 · revisão humana |
| K04_MESA_PARA_DOIS (pratos, taças, guardanapos) | Nano Banana 2 · 2K | Baixo risco; objetos | 2 / 3 | US$ 0,06 | US$ 0,18 | W1 · revisão humana |
| K05_PRATO_HEROI (tagliatelle al pomodoro) | Nano Banana 2 · 2K | Risco alto de comida "plástica"; é o prato que aparece em SC01, SC04 e SC06 | 3 / 5 | US$ 0,06 | US$ 0,30 | W1 · revisão humana |
| K06_SC01_FRAME (frigideira, macro, vapor) | Nano Banana 2 · 2K (ref. K01 + K05) | Quadro inicial do hook; decide o primeiro segundo | 3 / 5 | US$ 0,06 | US$ 0,30 | W1 · revisão humana |
| K07_SC04_FRAME (A serve, B recebe) | Nano Banana 2 · 2K (ref. K02 + K03 + K04 + K05) | Duas pessoas juntas é o maior risco de anatomia e continuidade | 4 / 6 | US$ 0,06 | US$ 0,36 | W1 · revisão humana |
| K08_SC06_FRAME (garfada, brinde) | Nano Banana 2 · 2K (mesmas refs) | Mesmo risco de K07, mais talheres e taças | 4 / 6 | US$ 0,06 | US$ 0,36 | W1 · revisão humana |
| **Wave 1** | | | **26 / 40 imagens** | | **US$ 2,40 (480 créditos)** | **PARE** |

**Custo esperado da Wave 1: US$ 1,56 (312 créditos). Máximo: US$ 2,40 (480 créditos).**

### Wave 2: teste crítico de movimento (só com os keyframes aprovados)

Só SC01, SC04 e SC06. Objetivo: provar **human-first + realismo de comida + movimento humano natural + continuidade**. Se falhar: **STOP.** Nada mais é gerado; revisamos modelo, prompt e direção.

| ASSET | MODEL | WHY THIS MODEL | ATTEMPTS (planejado / máx.) | UNIT COST | MAX COST | APPROVAL GATE |
|---|---|---|---|---|---|---|
| SC01_HOOK_PASTA | Veo 3.1 Fast, first-frame (K06), 9:16 → sobe para Veo 3.1 Quality só se o Fast falhar em física de molho e vapor | O Veo é o mais forte em líquidos, vapor e macro de comida; o Fast é 4× mais barato para provar o conceito | Fast 2 / 2 · Quality 0 / 2 | US$ 0,325 / 1,275 | US$ 3,20 | W2 · revisão humana |
| SC04_HUMAN_SERVING | **A/B por asset:** Veo 3.1 Fast (K07) × Kling 3.0, 5 s (K07) → a 2ª tentativa vai para o vencedor; Quality só se necessário | Movimento humano natural é o maior risco; o teste lado a lado escolhe o modelo com evidência, não por suposição | Fast 1 + Kling 1 + vencedor 1 / + Quality 1 | US$ 0,325 / 0,35 / 1,275 | US$ 2,30 | W2 · revisão humana |
| SC06_EMOTIONAL_PAYOFF | Mesmo A/B de SC04 (K08) | Mesmo risco: rostos, talheres, taças em movimento | Fast 1 + Kling 1 + vencedor 1 / + Quality 1 | US$ 0,325 / 0,35 / 1,275 | US$ 2,30 | W2 · revisão humana |
| **Wave 2** | | | **≈ 8 / 12 vídeos** | | **US$ 7,80 (1.560 créditos)** | **PARE · go/no-go** |

**Custo esperado da Wave 2: ≈ US$ 2,70 (540 créditos). Máximo: US$ 7,80 (1.560 créditos).**

### Wave 3: produção completa (projeção; só após aprovação da Wave 2)

O modelo de cada asset da Wave 3 é **confirmado depois da Wave 2**, com base no que funcionou. A tabela é a projeção.

| ASSET | MODEL (projeção) | WHY | ATTEMPTS (planejado / máx.) | UNIT COST | MAX COST | APPROVAL GATE |
|---|---|---|---|---|---|---|
| Keyframes SC02, SC03a–e, SC05a/c/d/e | Nano Banana 2 · 2K | Herdam K01–K05 | 14 / 22 | US$ 0,06 | US$ 1,32 | W3 · revisão de keyframes |
| SC02_TABLE_PREPARATION | Vencedor de pessoas na W2 (Veo Fast ou Kling) | Uma pessoa, movimento simples | 1 / 2 | ≈ US$ 0,35 | US$ 0,70 | W3 · revisão humana |
| SC03_FRESH_PASTA_PROCESS (5 macros de 0,8 s) | Veo 3.1 Fast | Macro de ingredientes; cada clipe de 8 s rende o trecho útil | 5 / 8 | US$ 0,325 | US$ 2,60 | W3 · revisão humana |
| SC05_FOOD_DESIRE (5 closes) | Veo 3.1 Fast; carbonara pode subir para Quality | Comida é protagonista; a carbonara é o close mais exigente | 5 / 8 + Quality 0 / 1 | US$ 0,325 / 1,275 | US$ 3,88 | W3 · revisão humana |
| SC07_OFFER | Sem geração (reaproveita SC06 + tipografia) | — | 0 | — | US$ 0 | W3 · revisão do cartão |
| Voz (≈ 450 caracteres, até 6 versões) | ElevenLabs multilingual v2 via KIE (se licença e pt-BR ok) | Voz premium sem novo billing | 3 / 6 | ≈ US$ 0,03 por versão (estimado) | ≈ US$ 0,20 | Gate F · **revisão humana de áudio** |
| Trilha e sons | Biblioteca royalty-free com uso comercial | Sem custo; licença registrada no lineage | — | US$ 0 | US$ 0 | Gate F |
| **Wave 3** | | | | | **≈ US$ 8,70 (1.740 créditos)** | **PARE · rough cut (Gate G/H)** |

---

## 3. Resumo de custos

| | Esperado | Máximo (worst-case) |
|---|---|---|
| Wave 1: keyframes | US$ 1,56 · 312 créditos | **US$ 2,40 · 480 créditos** |
| Wave 2: teste crítico | US$ 2,70 · 540 créditos | **US$ 7,80 · 1.560 créditos** |
| Wave 3: produção (projeção) | US$ 4,50 · 900 créditos | **US$ 8,70 · 1.740 créditos** |
| **Total** | **≈ US$ 8,80 · 1.750 créditos** | **≈ US$ 18,90 · 3.780 créditos** |

O worst-case revisado cai de US$ 70 para **≈ US$ 19 (≈ R$ 102)**. Se o saldo de 18/09 continuar, isso equivale a **44% dos 8.679 créditos**.

Preços: tabela pública da KIE em 01/10/2026. Confirmo o custo real de cada modelo na primeira operação autorizada dele.

---

## 4. Decisões aplicadas desta revisão

- **"Imagens ilustrativas":** **não** entra automaticamente. Só com requisito aplicável confirmado para o canal. A D-0010 foi ajustada.
- **"28 receitas italianas":** continua **bloqueada** para locução e render final até a confirmação no produto. A Wave 1 e a Wave 2 não dependem dela.
- **Modelo por asset:** cada asset tem o seu modelo. A W2 faz A/B entre Veo e Kling nas cenas com pessoas, para escolher com evidência.
- **Nada é publicado na Meta** e nenhuma campanha é alterada.

---

## 5. O que preciso do operador para autorizar a Wave 1

1. **Onde está a infraestrutura KIE** (repositório, pasta ou ferramenta) e quem executa as chamadas: o ambiente que já tem a chave, ou integração no NORQVA com a chave colocada por você na Render.
2. **Saldo atual** da conta KIE (painel da KIE).
3. **Autorização da Wave 1** com teto de **US$ 2,40 (480 créditos)**.
