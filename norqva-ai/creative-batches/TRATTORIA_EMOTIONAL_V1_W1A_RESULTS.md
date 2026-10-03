# TRATTORIA_EMOTIONAL_V1_MASTER — Wave 1A: resultado (Visual Language Proof)

**Status:** `WAITING_HUMAN_VISUAL_APPROVAL` · nenhuma imagem aprovada, rejeitada ou regenerada pelo Claude · Wave 1B, vídeo e TTS **não** iniciados.
**Execução:** 2026-10-01 23:15 → 2026-10-02 00:09 (BRT), no Windows do operador (`factory_cli.py wave-run --wave W1A --max-credits 180`).
**Arquivos:** `D:\NORQVA\norqva-criativos-engine\campaigns\trattoria-emotional-v1-master\waves\W1A\<asset>\<asset>_aNN.png`.

## Financeiro

| Item | Valor |
|---|---|
| Modelo | `nano-banana-2` · 2K · 9:16 (catálogo `kie.nano-banana-2.t2i.2k`, VERIFIED_OPERATOR) |
| POSTs pagos | **15** (1 por tentativa; nenhum duplicado, nenhuma reconciliação) |
| Custo por imagem | 12 créditos (US$ 0,06) |
| Custo total registrado | **180 créditos** (US$ 0,90) = teto da W1A |
| Saldo KIE antes | 6.991,93 |
| Saldo KIE depois | 6.811,93 |
| **Delta real** | **180,00 créditos**: preço confirmado pela variação de saldo |
| Orçamento restante da W1A | 0 (não transfere para outra wave) |

## Integridade e QA técnico

- 15/15 arquivos com SHA-256 idêntico ao registrado no `wave_state.json`.
- 15/15 **QA técnico PASS**: PNG 1536×2752 (2K, 9:16), proporção dentro da política COVER.
- Ledger: as 15 tarefas em estado `QA`, cada uma com 1 único `POSTING` no histórico.
- Prompt usado = o da spec (`factory_spec.json`, idêntico ao `TRATTORIA_EMOTIONAL_V1_W1A_PLAN.md`); o `payload_sha` é o mesmo dentro de cada asset (variantes do mesmo prompt).

## Assets

| Tentativa | taskId | SHA-256 (início) | Custo | QA |
|---|---|---|---|---|
| W1A_D1_ENVIRONMENT_MASTER.a01 | 1205c7047db4734eebe8bb8fb3209442 | 4837730ad460 | 12 | PASS |
| W1A_D1_ENVIRONMENT_MASTER.a02 | 09d1c89c89b4244119e72af0a9d50e23 | af139106bcac | 12 | PASS |
| W1A_D2_HERO_DISH.a01 | 5d5d9c2ce97315127f0a2599c8f4636e | 8d2f68e7cbaa | 12 | PASS |
| W1A_D2_HERO_DISH.a02 | 2ddc12550eb259a5a6163631725ee3e3 | b17e3dacdc78 | 12 | PASS |
| W1A_A_SC01_FOOD_HERO.a01 | 409ce56e80a94a34d85784b93a9ea715 | 8cc86036e0f4 | 12 | PASS |
| W1A_A_SC01_FOOD_HERO.a02 | 6a59827431f49941f90a8d9518d648cc | aaf52bf2cf4d | 12 | PASS |
| W1A_A_SC01_FOOD_HERO.a03 | c625dcba2981b99988e62f70cd5d2977 | 134968f07166 | 12 | PASS |
| W1A_B_SC04_SERVING.a01 | 91dc9e2b72deeedc37ff17c760f70d1f | 35eb61a8add9 | 12 | PASS |
| W1A_B_SC04_SERVING.a02 | 03c786188b18c50f406aaa607aa0ad0d | 2b77643f70ac | 12 | PASS |
| W1A_B_SC04_SERVING.a03 | 2db7869ced62ede926c750514dacf437 | e9ea3b4d6a26 | 12 | PASS |
| W1A_B_SC04_SERVING.a04 | 5ebf74ddc2b187969cd900bd39d8632f | 050b6c650a74 | 12 | PASS |
| W1A_C_SC06_TABLE_MOMENT.a01 | 81851370742a9520e50b94e946bc476a | 133f6195cb68 | 12 | PASS |
| W1A_C_SC06_TABLE_MOMENT.a02 | eae60b657e720e1c282b864e76662528 | e18e4b5d2daf | 12 | PASS |
| W1A_C_SC06_TABLE_MOMENT.a03 | 567dfe0d4e308ed910f424b0cb4778d2 | fd7b57331cba | 12 | PASS |
| W1A_C_SC06_TABLE_MOMENT.a04 | ee552a0bbdfa65aa9c63fc7f3c1d0f8d | 622ef125c6af | 12 | PASS |

## Avaliação preliminar automática (Claude) — não é aprovação

Critérios do operador: desejo de comida, realismo humano, credibilidade emocional, linguagem cinematográfica, imaginação de compra. Notas de 1 a 5, pela leitura visual de cada imagem.

| Tentativa | Leitura | Anomalias encontradas |
|---|---|---|
| D1.a01 | Cozinha muito "vivida", rica em detalhes, pendente de latão, mesa posta com vela acesa. Desejável, mas um pouco "decorada", próxima de editorial de revista. Linguagem 4 · credibilidade 3 | Janela azul saturada demais; muitos objetos (excesso de produção) |
| D1.a02 | A mais fotográfica do lote: enquadramento pela porta, vapor real na frigideira, mesa redonda simples. Parece uma noite real. Linguagem 5 · credibilidade 5 | Nenhuma relevante |
| D2.a01 | Prato muito crível: molho com textura, manjericão e parmesão reais, marca d'água de copo e borrão de molho no prato. Desejo 4 · realismo 5 | Molho um pouco "pedaçudo" |
| D2.a02 | Boa luz e mesa real, porém o garfo está sujo de molho sem ninguém ter comido, e o queijo forma um monte uniforme. Desejo 4 · realismo 3 | Garfo sujo sem lógica; queijo "colocado" |
| A.a01 | Pegador levantando a massa, mãos reais (aliança), fogão e bancada com bagunça plausível. Desejo 4 · realismo 4 | Não é o macro a 45° pedido (plano médio); molho um pouco aguado |
| A.a02 | A mais "cinematográfica": vapor forte e contraluz. O vapor é volumoso demais, flerta com "efeito". Desejo 4 · realismo 3 | Vapor exagerado; leve pose de foto de comida |
| A.a03 | Plano limpo e iluminado; a massa suspensa parece "congelada" e o molho tem grãos amarelos (milho/alho) não pedidos. Desejo 3 · realismo 3 | Massa suspensa rígida; ingrediente indefinido |
| B.a01 | Personagens consistentes, mãos corretas, cozinha coerente; o sorriso dela é aberto (puxa para comercial). Realismo 4 · emoção 3 | Sorriso de comercial |
| B.a02 | Muito parecido com a01; sorriso amplo, olhar fixo nele. Realismo 4 · emoção 3 | Pose publicitária leve |
| B.a03 | Expressão mais natural, gesto de servir crível, guardanapo xadrez, prato levemente inclinado. Realismo 4 · emoção 4 | Nenhuma relevante |
| B.a04 | Sorriso pequeno e natural (o mais próximo do pedido); mas a vela está apagada, as taças vazias e ele olha para o prato, não para ela. Realismo 4 · emoção 4 | Vela apagada; troca de olhar não acontece |
| C.a01 | Gargalhada aberta e brinde: alegria crível, mas puxa para banco de imagem. **3 pratos para 2 pessoas.** Emoção 3 · realismo 3 | Prato extra na mesa |
| C.a02 | Calorosa e bem iluminada; **3 pratos para 2 pessoas**; garrafa de vinho branco com tinto nas taças. Emoção 4 · realismo 3 | Prato extra; vinho incoerente |
| C.a03 | A mais íntima: sentados lado a lado, brinde contido, pão na cesta, migalhas. Continuidade forte com B (roupa, cabelo, cozinha). Emoção 4 · realismo 4 | Taças sobrepostas de forma estranha no brinde |
| C.a04 | Conversa natural, mãos dela em gesto; **3 pratos + pratos extras**, ele descalço. Emoção 4 · realismo 3 | Pratos extras |

### Padrões do lote

- **Melhor que os criativos anteriores:** luz prática quente, cozinha brasileira de classe média crível, comida com textura real; nenhuma pele plástica, nenhuma mão deformada, nenhum ambiente de luxo.
- **Continuidade:** o casal (ele de suéter ferrugem e avental, ela de camisa de linho e brincos dourados) se manteve idêntico nas 8 imagens de pessoas. A mesa, a luminária e os azulejos também. Isso valida o método "descrição textual fixa" para a W1B.
- **Risco principal:** nas cenas com pessoas, os sorrisos amplos e o enquadramento central puxam para "lifestyle de banco de imagens". Não chega a ser falha, mas é o ponto a corrigir na direção.
- **Erros de lógica de cena:** 3 de 4 imagens do SC06 têm prato a mais; SC01 não atingiu o macro pedido.

## Recomendação de continuidade

Não acionar a regra de parada (a estética não repete o padrão artificial anterior), mas também não ampliar volume. Sugestão para o operador decidir:

1. **Referências canônicas candidatas:** D1.a02 (ambiente), D2.a01 (prato), B.a03 (personagens e serviço), C.a03 (momento à mesa), A.a01 (SC01, com ressalva do enquadramento).
2. **Na W1B (somente com nova autorização):** usar essas imagens como referência e ajustar o prompt: sorrisos contidos, "exatamente dois pratos", macro real a 45° no SC01, vela acesa; nada de aumentar o número de gerações.

Decisão visual final: humana (`wave-review --decision APPROVE|REJECT`).
