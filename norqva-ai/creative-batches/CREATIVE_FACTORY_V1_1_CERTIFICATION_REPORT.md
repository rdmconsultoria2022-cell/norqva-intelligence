# CREATIVE_FACTORY_V1_1_CERTIFICATION_REPORT

**Fonte canônica:** `D:\NORQVA\norqva-criativos-engine` · **Data:** 2026-10-01 · **Autor:** Claude
**Escopo:** hardening (P0–P2), novas capabilities (P3), composição EMOTIONAL_FOOD_STORYTELLING (P4), spec TRATTORIA_EMOTIONAL_V1_MASTER (P5), testes (P6), saldo (P7).
**Geração paga nesta etapa: 0. POST pago KIE: 0. Créditos consumidos: 0.** Nenhuma publicação na Meta e nenhuma campanha alterada. O Payment Core e o NORQVA em produção não foram tocados. O E2E certificado não foi regenerado e nenhum asset certificado foi sobrescrito.

---

## Critério final

| Critério | Resultado |
|---|---|
| `FACTORY_V1_1_CERTIFIED` | **TRUE**. 97/97 testes passam numa cópia byte-idêntica do código canônico. A suíte ainda **não rodou no Windows** (ver seção 12, item 1). |
| `DUPLICATE_PAID_POST_RISK` | **CONTROLLED**. `DUPLICATE_PAID_POSTS = 0` em 20 cenários de crash, falha e concorrência. O baseline duplicava (seção 5). |
| `LEGACY_E2E_REGRESSION` | **PASS**. Plano do E2E idêntico ao baseline; master certificado intacto (seção 9). |
| `PAID_GENERATION_EXECUTED` | **0** |

---

## 1. Estado e versionamento anterior

- `D:\NORQVA\norqva-criativos-engine` **não tinha Git** (sem `.git`, embora houvesse `.gitignore`). A shell do computador não iniciou ("Workspace unavailable"), então não dava para rodar `git init` no Windows. Por isso a versão foi preservada assim:
  1. **Snapshot de arquivos** em `_snapshots/pre_v1_1_20261001/`, com os 4 arquivos originais que foram modificados e o `SNAPSHOT_MANIFEST.json` (SHA-256 de cada original, de cada arquivo V1.1 e dos 29 arquivos do E2E certificado).
  2. **Histórico Git completo** em `_snapshots/norqva-creative-factory-v1_1.bundle` (sha256 `7e73a34e…c2fb`). O baseline é o commit `7e07afd` e a V1.1 é o `313dc3a`. Para restaurar: `git clone norqva-creative-factory-v1_1.bundle factory-history`. Só tem código e metadados.
- **Fora do versionamento:** `.env`, `.env.*`, `venv/`, binários, mídia de campanha e `node_modules`. O `.env` nunca foi lido, copiado nem registrado.
- **Verificado antes de escrever:** os 4 arquivos do Windows eram byte-idênticos ao baseline (SHA-256), e cada gravação usou o mtime como guarda.

| Artefato certificado | SHA-256 | Estado |
|---|---|---|
| `campaigns/factory-e2e-test-001/out/AdUgc_V1.mp4` (27.869.635 bytes) | `802c70959809e94409807604d7291af6a043daafefe22e72bbb9f60da32c6f7d` | Intacto (tamanho e mtime originais no Windows) |
| 9 assets canônicos declarados no manifesto (gates 8C–8F) | conferidos contra o manifesto | 9/9 batem |
| Demais 19 arquivos do E2E-001 | no `SNAPSHOT_MANIFEST.json` | Nenhum arquivo do E2E-001 foi escrito |

## 2. Arquivos modificados

**Modificados (4).** O original de cada um está no snapshot.

| Arquivo | Mudança |
|---|---|
| `engine/src/factory/generator.py` | Todo POST pago passa por `_execute_paid_task` (ledger). Download atômico. Whisper importado só quando usado. Construtores de payload de NB2, edit, Veo 3.1 e TTS. `generate_from_catalog`. Custos vêm do catálogo. |
| `engine/src/factory/orchestrator.py` | Custos do catálogo. Limiar de cada stage derivado do plano. `_paid_task_precheck` (reconcilia e falha fechado). Lock por campanha em `run()`. Decisão humana espelhada no ledger. O stage de imagem só faz POST do que está no plano. |
| `engine/src/factory/pre_video_gate.py` | O valor fixo de 70 cr virou custo do catálogo (`COST_UNKNOWN` bloqueia). |
| `engine/src/factory/cli.py` | Só **comandos novos**. Os comandos `run`, `plan`, `approve`, `reject` e `status` estão inalterados. |

**Novos (13):**
- **Módulos:** `paid_task_ledger.py`, `model_catalog.py`, `campaign_lock.py`, `wave_runner.py`
- **Catálogo e schema:** `catalog/kie_models.json`, `schemas/factory-spec-v1_1.schema.json`
- **Composição:** `compositions/__init__.py`, `compositions/emotional_storytelling.py`
- **Entrada da CLI:** `factory_cli.py` na raiz
- **Testes:** `tests/test_v1_1_paid_task_idempotency.py`, `tests/test_v1_1_catalog_waves_composition.py`, `tests/v11_fakes.py`
- **Campanha:** `campaigns/trattoria-emotional-v1-master/factory_spec.json`, mais o animatic de preview e a sua validação

**Não tocados:**
- os 5 stages de montagem e render UGC (timeline, preparação Remotion, render, QA final);
- as pastas `edit/` (Remotion);
- `technical_qa.py`, `visual_qa.py`, `asset_lifecycle.py`, `execution_state.py`, `manifest_parser.py`, `preflight.py`;
- o schema `factory-manifest-v1`;
- os testes legados.

## 3. Arquitetura final

```
factory_cli.py ─► engine/src/factory/cli.py
   ├─ run/plan/approve/reject/status ──► FactoryOrchestrator (pipeline UGC certificado, manifest v1)
   └─ catalog / ledger / reconcile / balance / wave-* / preview-render / final-gate / tts-gate  [V1.1]
                                          │
FactoryOrchestrator ──┐                   ▼
WaveRunner (spec v1.1)┴─► KieImageGenerator  ──►  KIE /jobs/createTask (ÚNICO ponto de POST pago)
                           │  _execute_paid_task: PaidTaskLedger (estado persistido, atômico)
                           │  generate_from_catalog: ModelCatalog.quote (COST_UNKNOWN → BLOCK)
                           └─ CampaignLock (1 processo por campanha)
WaveRunner ─► compositions/emotional_storytelling (ffmpeg) ─► preview (animatic) | FINAL (gates)
```

- **Uma integração KIE só.** A V1.1 reaproveita `KieImageGenerator`, o QA técnico, o pre-video gate e os gates humanos.
- **Dois tipos de campanha convivem:**
  - Legado (`campaign_manifest.json`, AdUgc): continua pelo orquestrador.
  - Spec v1.1 (`factory_spec.json`): roda pelo `wave_runner`, com waves, tentativas, referências e lineage.

## 4. Solução de idempotência das tarefas pagas

**Ciclo de vida persistido** em `paid_tasks_ledger.json` (gravação atômica: temp, fsync e replace; relê o disco antes de cada transição):

`PLANNED → POSTING → TASK_CREATED → POLLING → REMOTE_SUCCESS → DOWNLOADED → QA → APPROVED/REJECTED`

Estados terminais e de bloqueio: `POST_REJECTED`, `REMOTE_FAILED` e `RECONCILIATION_REQUIRED`. As decisões humanas `NO_TASK_CONFIRMED` e `RETRY_AUTHORIZED` ficam auditadas.

**Regras (UNKNOWN REMOTE STATE = FAIL CLOSED):**

1. **Existe taskId** (no ledger ou no manifesto): o sistema só reconcilia. Faz GET recordInfo (grátis), depois polling e download. **Nunca faz POST.**
2. **Estado `POSTING` ou `RECONCILIATION_REQUIRED` sem taskId:** levanta `ReconciliationRequired`. Só sai disso por `reconcile --attach-task-id` (o operador acha a task no log da KIE) ou `--confirm-no-task`.
3. **Novo POST só com evidência determinística de que não há task:**
   - estado `PLANNED` (o processo caiu antes do POST);
   - recusa explícita do provedor: HTTP 4xx, exceto 408, ou código no corpo em {400, 401, 402, 403, 404, 413, 422, 429, 505};
   - decisão humana.
   
   Timeout, conexão resetada, 5xx, código 500/501/455 ou código desconhecido contam como **UNKNOWN**.
4. **Manifesto legado `PENDING` sem taskId** (a assinatura do bug antigo): falha fechado. O código anterior fazia novo POST nesse caso.
5. **Download** vai para `.part` e é renomeado atomicamente. Arquivo corrompido (reprovado no QA técnico) leva a novo download da **mesma** task.
6. **`REMOTE_FAILED`:** o resume refaz o polling da mesma task. Nova tentativa paga só com `reconcile --authorize-retry`, e a tentativa anterior fica arquivada.
7. **Concorrência:** `.factory.lock` (O_EXCL) em `run`, `wave-run`, `wave-review` e `reconcile`. Um segundo processo é recusado. Um lock que sobra de um crash não é apagado sozinho.
8. **Kill switch:** `NORQVA_PAID_POSTS_DISABLED=1` bloqueia qualquer POST antes da rede.

**Revisão independente.** Um agente separado auditou a solução e achou 4 brechas, todas corrigidas e cobertas por teste:
- concorrência entre processos;
- corpo com código 500 tratado como "sem task";
- resume fazendo POST sem autorização de crédito;
- divergência do limiar legado.

As reproduções dele, rodadas de novo, deram: concorrência → `CampaignLocked` com 15 POSTs (não 30); código 500 → 0 tasks órfãs; resume com 0 crédito → `BUDGET` bloqueado.

## 5. Evidência dos testes de crash e recuperação

O provedor é simulado (`tests/v11_fakes.FakeKie`). O "crash" é uma `BaseException` que imita o processo sendo morto. Depois de cada crash, um **processo novo** (gerador e ledger recarregados do disco) retoma.

| Cenário | POSTs enviados | Tasks pagas | **Duplicadas** | Estado final | Resultado |
|---|---|---|---|---|---|
| Caminho feliz | 1 | 1 | **0** | DOWNLOADED | ok |
| Crash antes do POST | 1 | 1 | **0** | DOWNLOADED | Resume faz o único POST |
| Crash logo após o POST (resposta perdida) | 1 | 1 | **0** | DOWNLOADED | FAIL CLOSED → humano anexa a task → recuperado |
| Timeout depois do envio | 1 | 1 | **0** | DOWNLOADED | FAIL CLOSED → reconciliado |
| Crash depois do taskId | 1 | 1 | **0** | DOWNLOADED | Recuperado sem POST |
| Crash durante o polling | 1 | 1 | **0** | DOWNLOADED | Recuperado sem POST |
| Crash depois do sucesso remoto | 1 | 1 | **0** | DOWNLOADED | Novo download |
| Crash durante o download | 1 | 1 | **0** | DOWNLOADED | Nenhum arquivo parcial; novo download |
| Download corrompido | 1 | 1 | **0** | DOWNLOADED | Novo download da mesma task |
| Recusa 4xx (HTTP) | 2 | 1 | **0** | DOWNLOADED | Recusa determinística → POST permitido |
| Recusa 422 (corpo) | 2 | 1 | **0** | DOWNLOADED | Idem |
| Código 500 no corpo (a task pode existir) | 1 | 1 | **0** | RECONCILIATION_REQUIRED | FAIL CLOSED |
| Falha remota + retry humano | 2 | 2 | **0** | DOWNLOADED | Retry autorizado e auditado |
| Kill switch | 0 | 0 | **0** | PLANNED | Bloqueado antes da rede |
| Orquestrador: 2 imagens, teto exato de 8 cr | 2 | 2 | **0** | QA | Aguarda revisão humana |
| Orquestrador: resume depois do taskId | 2 | 2 | **0** | QA | Recuperado |
| Orquestrador: resposta do POST perdida | 2 | 2 | **0** | QA | FAIL CLOSED → reconciliado |
| Manifesto legado PENDING sem taskId | 2 | 2 | **0** | QA | FAIL CLOSED → humano confirma |
| Orquestrador: download corrompido | 2 | 2 | **0** | QA | Novo download sem POST |
| Segundo processo concorrente | 0 | 0 | **0** | n/a | LOCKED_OUT |

Os testes da Wave 1 cobrem mais três casos:
- crash no meio do lote: o resume exige autorização para os POSTs pendentes e fica em 15 tasks e 0 órfãs;
- preço do catálogo subiu entre execuções: nenhum POST com o preço novo, mas a task já paga é recuperada;
- concorrência: bloqueada.

**Controle (baseline sem V1.1), mesmo cenário "crash depois do taskId + nova execução":** 3 tasks criadas para 2 assets, ou seja, **1 POST pago duplicado**. Na V1.1 ficam 2 tasks e **0 duplicados**.

## 6. Catálogo de modelos

O arquivo é `engine/src/factory/catalog/kie_models.json`. A cotação só sai para entradas com `cost_status` igual a `VERIFIED_OBSERVED` ou `VERIFIED_OPERATOR` e custo maior que 0. Casam só parâmetros exatos, sem interpolação: Grok de 8 s ou Kling `pro`, por exemplo, dão `COST_UNKNOWN`. Duas entradas com custos diferentes também dão `COST_UNKNOWN`.

| Entrada | Modelo | Capability | Unidade | Custo (cr) | Status do custo | Uso comercial |
|---|---|---|---|---|---|---|
| `kie.nano-banana.t2i.default` | google/nano-banana | IMAGE_T2I | imagem | 4 | VERIFIED_OBSERVED (8C) | UNVERIFIED |
| `kie.grok-imagine-video-1-5.speech.720p.6s` | grok-imagine-video-1-5-preview | SPEECH_VIDEO_I2V | clipe 6 s | 27 | VERIFIED_OBSERVED (8D) | UNVERIFIED |
| `kie.kling-3.0.i2v.std.5s.silent` | kling-3.0/video | VIDEO_I2V (fallback) | clipe 5 s | 70 | VERIFIED_OBSERVED (8E) | UNVERIFIED |
| `kie.nano-banana-2.t2i.1k/2k/4k` | nano-banana-2 | IMAGE_T2I | imagem | 8 / 12 / 18 | CATALOG_UNVERIFIED → **bloqueia** | UNVERIFIED |
| `kie.nano-banana-2.ref.2k` | nano-banana-2 | IMAGE_REFERENCE (até 14 refs) | imagem | 12 | CATALOG_UNVERIFIED → **bloqueia** | UNVERIFIED |
| `kie.nano-banana-edit.edit.default` | google/nano-banana-edit | IMAGE_EDIT | imagem | 4 | CATALOG_UNVERIFIED → **bloqueia** | UNVERIFIED |
| `kie.veo-3-1-fast.i2v.8s` | veo-3-1-fast | VIDEO_I2V, 9:16 | clipe 8 s | ~60 | CATALOG_UNVERIFIED → **bloqueia** | UNVERIFIED |
| `kie.veo-3-1-fast.ref2v.8s` | veo-3-1-fast | VIDEO_REFERENCE (1–3 refs) | clipe 8 s | ~60 | CATALOG_UNVERIFIED → **bloqueia** | UNVERIFIED |
| `kie.veo-3-1-quality.i2v.8s` | veo-3-1 | VIDEO_I2V | clipe 8 s | ~250 | CATALOG_UNVERIFIED → **bloqueia** | UNVERIFIED |
| `kie.elevenlabs.tts.multilingual-v2` | elevenlabs/text-to-speech-multilingual-v2 | TTS | 1k caracteres | — | **UNKNOWN → bloqueia** | UNVERIFIED |

Cada entrada também registra provider, resolução, duração, aspect ratios, suporte a referências, `last_verified_at` e `contract_status`.

**Para liberar um modelo** (ação humana, auditada em `verification_history`):

```
.\run_engine.ps1 factory_cli.py catalog verify-cost --entry kie.nano-banana-2.t2i.2k --credits 12 --source "console KIE 2026-10-0X" --operator <nome>
```

A licença comercial tem um comando à parte: `catalog verify-license`.

## 7. Capabilities adicionadas

| Capability | Modelo KIE | Contrato implementado | Situação |
|---|---|---|---|
| Imagem T2I 1K/2K/4K | `nano-banana-2` | `prompt, image_input[], aspect_ratio, resolution, output_format` | Pronta; custo a verificar |
| Imagem com referências (continuidade) | `nano-banana-2` + `image_input` (≤14) | As URLs vêm das tentativas **aprovadas** (GET recordInfo grátis) | Pronta; usada em K06–K08 |
| Edição | `google/nano-banana-edit` | `prompt, image_urls (≤10), image_size` | Pronta; custo a verificar |
| Vídeo i2v 9:16 | `veo-3-1-fast` / `veo-3-1` | `generation_type FIRST_AND_LAST_FRAMES_2_VIDEO`, 1–2 imagens | Pronta; custo a verificar. O nome exato do modelo está conferido na documentação, mas a primeira chamada real ainda não foi observada |
| Vídeo por referência | `veo-3-1-fast` (Fast/Lite apenas) | `REFERENCE_2_VIDEO`, 1–3 refs, só 9:16 ou 16:9 | Pronta; o Quality é recusado por validação |
| Fallback de vídeo | `kling-3.0/video` std 5 s | Inalterado (certificado) | Preservado |
| Narração TTS (separada do speech-video) | `elevenlabs/text-to-speech-multilingual-v2` | `text, voice, stability, similarity_boost, style, speed, timestamps, language_code` | Implementada; **bloqueada** por `tts-gate` |

**ElevenLabs via KIE (investigação P3):**

| Item | Achado |
|---|---|
| Modelo | Multilingual v2 (também Turbo 2.5) |
| pt-BR | O modelo suporta português segundo a documentação da ElevenLabs. A página da KIE não lista idiomas. A qualidade do sotaque brasileiro **não foi avaliada** (ninguém ouviu) |
| Custo | A KIE **não publica** o custo → `UNKNOWN` |
| Licença | Os Termos de Uso da KIE (vigentes desde 01/08/2025) **não tratam** de propriedade nem de uso comercial do conteúdo gerado → `UNVERIFIED` |

**A licença comercial não foi presumida**, nem para os modelos já certificados. O render FINAL da V1.1 exige `commercial_use_status = VERIFIED_OPERATOR`, com link ou registro dos termos, para todo modelo usado. O pipeline UGC legado não ganhou esse gate, para não regredir, mas o risco está registrado.

## 8. Composição EMOTIONAL_FOOD_STORYTELLING

O módulo é `compositions/emotional_storytelling.py`, **independente** do template Remotion UGC: não importa, não lê e não renderiza nada dele. O render usa ffmpeg, o mesmo motor que o QA técnico já usa (`bin/ffmpeg.exe` no Windows).

**Recursos:**
- tomadas cinematográficas: vídeo com trim e congelamento do último quadro, ou still com movimento (push-in, pull-out, pan, tilt);
- VO contínua;
- ambiente por cena;
- trilha com ducking sob a VO (sidechain);
- SFX de comida com marcação de tempo;
- overlays controlados (um por vez, fade de 0,25 s);
- oferta tardia e CTA;
- cenas de duração variável;
- transições discretas (corte, dissolve ou fade para preto de no máximo 0,5 s);
- assets de modelos diferentes;
- normalização para −14 LUFS.

**Validação editorial** (bloqueia o render):
- 9:16, 1080×1920;
- duração total entre 15 e 60 s;
- tomadas entre 0,5 e 10 s;
- oferta só a partir de 70% do vídeo e como última cena;
- nenhum overlay de oferta antes disso;
- CTA obrigatório;
- overlays de até 2 linhas com 42 caracteres;
- trilha em no máximo −12 dB e com ducking;
- VO começando em até 1,5 s.

**Modo FINAL** acrescenta:
- nenhum placeholder;
- todo asset APROVADO por humano;
- licença de VO, trilha, SFX e ambiente;
- uso comercial verificado;
- nenhuma claim bloqueada.

**Animatic sem mídia paga.** `campaigns/trattoria-emotional-v1-master/preview/TR_EMO_V1_MASTER_ANIMATIC_PREVIEW.mp4`:
- 1080×1920, 30 fps, 27,0 s, com áudio, −13,7 LUFS;
- QA técnico PASS;
- marca d'água "PREVIEW - NAO PUBLICAR".

São cartões de placeholder com áudio sintético. O vídeo valida tempo, transições e overlays, **não estética**.

## 9. Resultado das regressões

| Teste | Resultado |
|---|---|
| Suíte completa (`unittest`) | **97/97 OK**: 28 legados, inalterados, mais 69 novos |
| Snapshot dos planos do E2E (8 combinações de stage e crédito, campanhas 001 e 002) | **IDÊNTICO** ao baseline |
| Oráculo diferencial: 440 planos (8 variantes sintéticas × 5 stages × 11 tetos) | 404 idênticos. Os outros 36 diferem **só** em `next_action` e sempre no sentido mais conservador: a V1.1 recusa executar quando o teto não cobre o stage inteiro ou o stage não tem nada a gerar. `estimated_credits`, a lista a gerar e a lista bloqueada são **idênticos em 440/440** |
| Master certificado `AdUgc_V1.mp4` | SHA igual; no Windows, tamanho e mtime são os originais |
| Template UGC | Pastas `edit/` com 0 alterações. As 5 funções de montagem e render são **idênticas** ao baseline (comparação por AST) |
| Composição nova | Render com placeholders e render com imagem e vídeo reais sintéticos: PASS |

**Mudança de comportamento intencional (P2).** Os limiares fixos do teste E2E (12/54/140 cr) viraram "teto ≥ custo do stage no plano". O pedido de remover tetos fixos do E2E exigia isso. Exemplos:
- 2 imagens com teto de 8 cr agora executam (antes eram recusadas);
- 1 speech com teto de 30 cr agora executa;
- 3 b-rolls com teto de 140 cr agora são recusados, porque precisam de 210 (antes começavam e paravam no meio);
- speech com duração diferente de 6 s vira `COST_UNKNOWN` (antes o preço era extrapolado a 4,5 cr/s).

## 10. Saldo KIE atual

```
KIE_CURRENT_BALANCE=NOT_QUERIED
```

A shell do computador não iniciou ("Workspace unavailable"). O único mecanismo seguro é o da máquina local, porque a chave fica no `.env` e não sai de lá. Para consultar (GET, custo zero; imprime só a linha do saldo):

```
cd D:\NORQVA\norqva-criativos-engine
.\run_engine.ps1 factory_cli.py balance
```

Referência histórica: 9.055,43 cr (certificação 8F). Há registro de 8.679 cr em 18/09. Os dois valores são históricos, não o saldo atual.

## 11. Orçamento revisado da Wave 1

O orçamento é derivado do plano (`wave-plan`), com Nano Banana 2 2K a 12 cr por imagem. **Esse preço ainda é de catálogo, não verificado.**

| Lote | Conteúdo | Créditos | US$ |
|---|---|---|---|
| Lote 1 (fase 1) | K01–K05: 2+4+4+2+3 = 15 variantes | **180** | 0,90 |
| Lote 2 (fase 2, depois de aprovar as referências) | K06–K08: 3+4+4 = 11 variantes, com refs aprovadas | 132 | 0,66 |
| **Esperado (26 tentativas)** | | **312** | **1,56** |
| Retentativas até o máximo (+14) | Só com nova autorização de crédito por lote | 168 | 0,84 |
| **Teto da wave (40 tentativas)** | Limite rígido no código | **480** | **2,40** |

**Situação atual de `wave-plan W1`:** `BLOCKED_COST_UNKNOWN__OPERATOR_MUST_VERIFY_CATALOG`. É o comportamento correto: só libera quando o preço do NB2 2K for confirmado.

## 12. Readiness para TRATTORIA_EMOTIONAL_V1_MASTER

A spec é `campaigns/trattoria-emotional-v1-master/factory_spec.json`:
- lineage `TRATTORIA → EMOTIONAL_FOOD_STORYTELLING → V1_MASTER`;
- cenas SC01–SC07 com VO, overlays e SFX do Gate A;
- K01–K08 com prompts, referências e tentativas do GATE_C_REVISION_V2;
- W2 e W3 travadas;
- claims registradas.

Os criativos TR-B01 e as campanhas existentes estão intactos.

| Etapa | Status | O que falta |
|---|---|---|
| **Wave 1** | **READY_PENDING_HUMAN** | (1) rodar a suíte no Windows: `.\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"`; (2) consultar o saldo; (3) confirmar no console da KIE o preço do NB2 2K e registrar com `catalog verify-cost` para `kie.nano-banana-2.t2i.2k` e `kie.nano-banana-2.ref.2k`; (4) **nova autorização humana** da W1 (teto de 480 cr; primeiro lote de 180 cr) |
| Wave 2 | LOCKED | Aprovação dos keyframes da W1; preço do Veo 3.1 Fast/Quality verificado; assets de vídeo da W2 adicionados à spec |
| Narração (TTS) | BLOCKED | Custo, licença comercial e avaliação de pt-BR da ElevenLabs via KIE. A fala do SC05 ainda está bloqueada pela claim TR-CL-01 |
| Render FINAL | BLOCKED (32 motivos em `final-gate`) | Assets aprovados, licenças de VO, trilha e SFX, uso comercial verificado, e "28 receitas" confirmado no PDF |

**Execução da W1 quando autorizada:**

```
.\run_engine.ps1 factory_cli.py wave-run --campaign campaigns\trattoria-emotional-v1-master --wave W1 --max-credits 180 --operator <nome>
```

O comando para sozinho na revisão humana. A revisão é feita com `wave-review --attempt K01_COZINHA_LUZ.a01 --decision APPROVE|REJECT`.

**PARE.** A Wave 1 não foi iniciada e só começa com nova autorização humana.
