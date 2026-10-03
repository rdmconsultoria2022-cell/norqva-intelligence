# TRATTORIA EM CASA — Sprint de Produção TR-SPRINT-01 · Gate Humano Final

**Estado:** `READY_FOR_HUMAN_FINAL_REVIEW` · **Data:** 2026-10-03 · **Não publicado. Campanha controle intocada. Orçamento Meta inalterado.**

Arquivos (Windows): `D:\NORQVA\norqva-criativos-engine\campaigns\trattoria-emotional-v1-master\sprint\final\`
— `CREATIVE_V1_EMOTIONAL.mp4`, `CREATIVE_V2_FOOD_DESIRE.mp4`, `CREATIVE_V3_HYBRID.mp4`, `PROVENANCE_AND_QA.json`, `specs/`, `music/`.

## Custos

| Item | Créditos |
|---|---|
| S1 — 18 keyframes nano-banana-2 2K (12 cada) | 216 |
| Probe B — 1 clipe Veo 3.1 1080p 8s | 65 |
| S2V — 11 clipes Veo 3.1 1080p 8s (65 cada) | 715 |
| Narrações ElevenLabs (14 tentativas, todas falha remota) | 0 |
| Rejeição `veo-3-1-fast` (422, sem tarefa) | 0 |
| **Total da sprint** | **996** (teto 2.500) |

Saldo KIE: **6.811,93 → 5.815,93** (delta 996,00 = soma dos itens). Referências W1A (D1.a02, D2.a01, B.a03, C.a02) vieram da Wave 1A (180 cr, fora da sprint).

## Criativos

### CREATIVE_V1_EMOTIONAL — “Prepare algo especial para quem você ama.”
- **Duração:** 21,5 s · **Hook (0–2,8 s):** mãos abrindo massa fresca na bancada enfarinhada.
- **Roteiro (sem narração):** preparo da massa → ele mexe o molho e olha para a porta → acende a vela → ela chega e se emociona → ele serve → brinde à mesa → cartão de oferta.
- **Textos:** “Hoje o jantar é pra alguém especial.” · “Mesa posta. Vela acesa.” · “Prepare algo especial para quem você ama.”
- **CTA:** “Conheça o Trattoria em Casa” · cartão: Receitas italianas · e-book digital · R$ 19,90 · Acesso após a confirmação do pagamento.
- **Créditos atribuídos:** 438 (6 clipes 390 + 4 keyframes 48).
- **QA técnico:** PASS — 1080x1920, H.264 30 fps, AAC 48 kHz, −14,1 LUFS, pico −2,8 dBTP.

### CREATIVE_V2_FOOD_DESIRE — “Isso pode sair da sua cozinha.”
- **Duração:** 17,6 s · **Hook (0–2,6 s):** close do garfo girando o tagliatelle, molho escorrendo, vapor.
- **Roteiro:** garfo → tiras de massa fresca → pinça envolvendo massa no molho → parmesão ralado → empratamento → garfo de novo → cartão.
- **Textos:** “Isso pode sair da sua cozinha.” · “Massa fresca, feita à mão.” · “Molho envolvendo cada fio.” · “Parmesão na hora.”
- **CTA / cartão:** idem.
- **Créditos atribuídos:** 385 (5 clipes 325 + 5 keyframes 60).
- **QA técnico:** PASS — −14,7 LUFS, pico −1,9 dBTP.

### CREATIVE_V3_HYBRID — desejo + emoção + oferta
- **Duração:** 15,7 s · **Hook (0–3,2 s):** pinça erguendo o tagliatelle do molho sobre a chama, nuvem de vapor.
- **Roteiro:** massa no fogo → empratamento → ele serve → os dois à mesa → cartão.
- **Textos:** “Restaurante? Hoje é em casa.” · “Feito por você, pra quem você ama.” · “Receitas italianas para fazer em casa.”
- **CTA / cartão:** idem.
- **Créditos atribuídos:** 77 exclusivos (1 clipe + 1 keyframe); reutiliza 3 clipes já contados em V1/V2.
- **QA técnico:** PASS — −14,4 LUFS, pico −1,7 dBTP.

Keyframes S1 não selecionados: 8 × 12 = 96 cr (custo de exploração).

## Modelos e linhagem
- **Imagem:** nano-banana-2 2K com referências W1A (ambiente D1.a02, prato D2.a01, personagens B.a03, mesa C.a02).
- **Vídeo:** `veo-3-1` via `jobs/createTask`, image-to-video 1080p 8 s 9:16; a KIE executa como **Fast** (eco `veo3_fast`, 65 cr). Arquivo final = `resultJson.data.result_urls` (filho 1080p); `origin_urls` nunca usado.
- **Trilha:** original procedural (`tools/music_trattoria.py`, sem samples) — violão Karplus-Strong, palheta tipo acordeão, pizzicato, shaker; modos emotional/desire/hybrid.
- **Áudio ambiente:** nativo do Veo (muito baixo, ~−53 LUFS).
- **Tipografia:** TeX Gyre Pagella (licença GUST, uso comercial livre); paleta creme #F4EBDD + terracota #C0643B; sem verde.
- **Montagem:** `tools/compose_trattoria.py` (ffmpeg; loudnorm −14 LUFS; limitador).
- taskId, SHA-256 e trechos usados de cada clipe: `PROVENANCE_AND_QA.json`.

| Criativo | SHA-256 (final) |
|---|---|
| V1 | 390aa64e6dcb6131377267a8bed9f2c5f9f42a424533e9f921565ba9c4179079 |
| V2 | f5f5e5d3dbe241c879251a8158f63a5ff52597455079c06a65978b51c57fec5f |
| V3 | 17747cb7e91c5a5137960d276d92f9b907dc7120d23e1024a14402810530bdb3 |

## Limitações
1. **Sem narração.** ElevenLabs via KIE (Multilingual v2 e Turbo 2.5) retornou 500 “Internal Error” em 14/14 tentativas — vozes por nome e ID, texto curto ASCII idêntico ao exemplo da documentação. Falha do provedor; custo 0. Os criativos foram montados para funcionar sem som (textos + trilha). Se a narração voltar, gerar as falas custa ~12 cr e remonta-se sem novos vídeos.
2. Artefatos de IA evitados por corte (ex.: massa “voando” no clipe de rolo, segundo ralador no parmesão); os trechos usados foram revisados quadro a quadro em 1 fps — revisar em velocidade normal no gate.
3. O garfo do V2 reaparece no fim (mesmo clipe, outro trecho).
4. V1 abre com preparo (mãos/massa) — desejo gastronômico menos imediato que V2/V3; é a escolha narrativa do território emocional.
5. Personagens consistentes entre cenas (mesma roupa/rosto), mas são gerados por IA — validar naturalidade.

## Recomendação de experimento na Meta (não executado)
- **Não mexer** na campanha/criativo controle que já vendeu; manter orçamento.
- Nova campanha de teste (Vendas, mesma conversão/pixel), **1 conjunto** com o público que vendeu, **3 anúncios** (V1, V2, V3) — ou ABO com 3 conjuntos idênticos se quiser divisão forçada de verba.
- Orçamento modesto e igual por criativo por 5–7 dias; `utm_content` = `TR_V1_EMO`, `TR_V2_FOOD`, `TR_V3_HYB` (casando com o nome do anúncio, para a atribuição da tela Meta Ads funcionar).
- Métricas: hook rate (3 s/impressões), hold 50%, CTR link, CPC, custo por compra; decidir por custo por compra quando houver ≥ 3 vendas por variante; antes disso, usar hook rate e CTR como sinais.
- Posicionamentos: Reels/Stories (9:16 nativo).

## Infraestrutura (correções mínimas, testadas)
- Contrato Veo: `veo-3-1-fast` bloqueado no catálogo (422 do provedor); `veo-3-1` registrado a 65 cr (VERIFIED_OBSERVED).
- `poll_task`: URLs finais também em `resultJson.data.result_urls` / `response` (origin nunca).
- `sprint_runner`: custo informado pela KIE (`creditsConsumed`) registrado; retomada de tarefa existente sem POST.
- Smoke: checagens W1A independentes do estado; pendência de reconciliação com taskId permitida (sem taskId continua bloqueando).
- Suíte: 115 testes OK; `WINDOWS_SMOKE=PASS`.

---

## Revisão do end card (2026-10-03) — masters finais

Única alteração: fechamento comercial. Nenhuma imagem/vídeo regenerado, trilha e normalização preservadas (áudio copiado bit a bit do master de origem), 0 créditos KIE.

**Linhagem:** `SOURCE_MASTER` (CREATIVE_Vx_*.mp4, preservado) → `END_CARD_REVISION` (`tools/endcard_revision.py`: mesmo ponto de corte e dissolve de 0,45 s; fundo = último quadro da cena, desfocado e escurecido; 3 camadas tipográficas com entrada escalonada) → `FINAL_MASTER` (CREATIVE_Vx_*_FINAL.mp4).

**Novo end card:** “Trattoria em Casa” (Pagella itálico) · “Receitas italianas / para fazer em casa” · **R$ 19,90** (negrito, maior elemento) · botão terracota **QUERO CONHECER** · secundário discreto “e-book digital • acesso após pagamento”. Todo o conteúdo entre y 330–1178 px (zona segura Reels/Stories: 268–1248 px; laterais 6 %).

| Master final | Duração | LUFS | Pico | SSIM pré-end card vs origem | SHA-256 |
|---|---|---|---|---|---|
| CREATIVE_V1_EMOTIONAL_FINAL.mp4 | 21,5 s | −14,1 | −2,8 dBTP | 0,995 | 52b8a7a4f8d12d3f4986f0d54e834ea9636b23429a0e5b9494174f4ba21b264e |
| CREATIVE_V2_FOOD_DESIRE_FINAL.mp4 | 17,6 s | −14,7 | −1,9 dBTP | 0,996 | 1e70d562a65dfb0da6636812ad9255976e5bf5a97a5d59577a8ea7fee5644820 |
| CREATIVE_V3_HYBRID_FINAL.mp4 | 15,7 s | −14,4 | −1,7 dBTP | 0,995 | 83825fa9728d809cbc7fbb3ec9cdd64d757c9b82575f900a869f2db43489c31e |

QA (todos PASS): 1080x1920, 30 fps, H.264 High yuv420p, AAC 48 kHz estéreo, duração igual à origem, sem clipping, sem segmentos pretos, decodificação sem erros, áudio idêntico à origem, layout na zona segura. Capturas: `V1_ENDCARD.png`, `V2_ENDCARD.png`, `V3_ENDCARD.png`. Detalhes: `ENDCARD_REVISION_PROVENANCE_QA.json`.

`KIE_CREDITS_USED=0` · `META_PUBLICATION=NOT_EXECUTED` · `CONTROL_CAMPAIGN=UNTOUCHED` · `FINAL_STATE=READY_FOR_HUMAN_FINAL_REVIEW`
