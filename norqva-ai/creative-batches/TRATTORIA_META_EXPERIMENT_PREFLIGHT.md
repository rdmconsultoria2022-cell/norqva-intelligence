# TRATTORIA — Experimento comercial na Meta · Pre-publication gate

**Data:** 2026-10-03 · **Autor:** Claude · **Modo:** somente leitura (nada publicado, nada editado na Meta)

## Evidências usadas
- API NORQVA em produção (sessão autenticada do operador, só GET): `/api/meta/connection/status`, `/api/meta/campaigns|adsets|ads` (sincronizado com a Meta em 2026-10-03 04:13 UTC, status SUCCESS), `/api/intelligence/creative-performance` (7d/30d/all), `/api/admin/payments/validate-connection`, `/api/admin/telemetry/funnel-summary`.
- Gerenciador de Eventos (dataset 1049452567443586) e Gerenciador de Anúncios (leitura da tela do conjunto de controle; nenhum clique em editar/publicar).
- Página pública `trattoria.norqva.com.br` com UTMs de teste (`utm_campaign=AUDIT_NO_ADS`).
- Código em `origin/main` @ 5e9f45e (auditoria por arquivo:linha).
- Dados de pedido individual (PII) **não** foram lidos — só agregados.

## 1. Estado real da Meta
| Item | Valor |
|---|---|
| Portfólio | Norqva (business 1361471345973932) |
| Conta de anúncios | act_2887010388338951 · BRL · America/Sao_Paulo · token VALID · usuário de sistema NORQVA_Backend |
| Dataset/Pixel | NORQVA WEB DATA **1049452567443586** (o pixel da marca Trattoria 1451147833528630 não está roteado: oferta `meta_pixel_id=null`) |
| **CONTROL — campanha** | `NORQVA_TRATTORIA_REVENUE_V1` · id 120249666098740097 · ACTIVE · Vendas (Campanha de vendas Advantage+ ativada) |
| **CONTROL — conjunto** | `TRATTORIA_ABO_BROAD_BR_V1` · id 120249666098760097 · ACTIVE · ABO R$ 30/dia · conversões no site · Maximizar conversões · evento Comprar · atribuição **Padrão** · lance Volume mais alto · BR, 25–65, público Advantage+, sem interesses |
| **CONTROL — anúncio** | `TRATTORIA_V1_AD_C_HOOK_MASSA_CASEIRA` · id 120249666532700097 · criativo 2235844717200125 · ACTIVE · CTA "Ver detalhes" · url_tags `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}` |
| Outros anúncios do conjunto | AD_A_HOOK_SEPARACAO (PAUSED), AD_B_HOOK_EMULSAO (PAUSED; url_tags fixas antigas) |
| Vendas do CONTROL (NORQVA, atribuídas) | **5 vendas / R$ 99,50** — 7d: gasto R$ 246,38, CAC R$ 49,28, ROAS 0,40; 30d: R$ 277,74, CAC R$ 55,55 |
| ⚠️ Rascunho pendente | O Gerenciador mostra **"Edições não publicadas"** na campanha e no conjunto de controle. Não estão no ar; se alguém clicar em "Publicar" com o controle selecionado, elas entram em vigor e alteram o CONTROL. |

## 2. Atribuição NORQVA (comprovada em produção)
Fluxo `?utm_*&ad_id` → `sessionStorage norqva_attribution_ctx` → `POST /api/checkout` → `orders.utm_*`, `orders.fbclid`, `attribution_metadata.ad_id` → PAID não sobrescreve → `creativePerformanceService` casa `ad_id` (prioridade) ou `utm_content` = nome do anúncio (exato, sem caixa).
- **Prova:** as 5 vendas do anúncio de controle aparecem atribuídas por anúncio na tela Meta Ads, com as url_tags dinâmicas acima.
- **Teste real de entrada (2026-10-03):** `trattoria.norqva.com.br/?utm…&fbclid=…` → redireciona para `/p/OFF-000001` **preservando a query**; contexto salvo; telemetria `OFFER_VIEW` registrou fbclid/utm.
- **Divergência 4 × 5 (Meta Ads × Executiva) explicada:** 1 pedido pago de R$ 29,90 sem anúncio identificado (preço do Bolso Blindado, não Trattoria) — Executiva conta todos os PAID; Meta Ads só os atribuídos.

**Limitações conhecidas (não bloqueiam):**
1. Atribuição só em `sessionStorage`: venda em nova aba/retorno posterior fica "não atribuída" (afeta todos os braços igualmente).
2. Nomes de anúncio duplicados: o último vence silenciosamente → usar nomes únicos (verificado: TR_V1_EMO/TR_V2_FOOD/TR_V3_HYB não existem).
3. Anúncio só entra no mapa após o sync Meta → sincronizar antes de ler resultados.
4. **Gasto inflado na tela Meta Ads no período "Tudo"** (ex.: VARIANT_A 30d R$ 429,37 × Tudo R$ 858,74): usar o **gasto do Gerenciador de Anúncios** como fonte de verdade de CAC; NORQVA como fonte das vendas por anúncio.
5. `utm_term` só no JSONB (não usado).

## 3. Pixel / eventos (Gerenciador de Eventos, 28 dias)
| Evento | Implementado | Disparo | Meta recebe | Observação |
|---|---|---|---|---|
| PageView | Sim (navegador) | Observado na landing | 579 · navegador | sem CAPI |
| ViewContent | Sim (navegador) | Observado na landing | 205 · navegador | sem CAPI |
| InitiateCheckout | Sim | navegador após pedido + servidor ao gerar Pix | 45 · navegador+servidor · EMQ 8,4 | dedup `checkout_<orderId>` |
| Purchase | Sim | só após PAID confirmado (webhook + reconsulta Asaas) | 14 · navegador+servidor · EMQ 8,4 · usado por 1 conjunto | dedup `purchase_<orderId>`; nunca antes do pagamento |
CAPI: ativa (token válido), sem alteração. Nenhuma compra fictícia gerada.

## 4. Destino comercial
- Oferta `OFF-000001` "TRATTORIA EM CASA" · R$ 19,90 · `is_demo=false` · status público ativo.
- Pagamentos: Asaas **production**, `production_payments_enabled=true`, token de webhook configurado, autenticado.
- Entrega: download pela página `/pedido/...` com token (até 5 downloads). Não há e-mail automático no PAID.
- Fluxo real comprovado por vendas recentes (último pedido 2026-10-03 00:49 UTC). Nenhum pagamento de teste feito.

## 5–8. Desenho do experimento (proposto, não criado)
**Princípio:** o CONTROL não é tocado (adicionar anúncios ao conjunto de controle seria editá-lo). Desafiantes em campanha nova com as mesmas configurações, variando só o criativo.

| Campo | Especificação |
|---|---|
| CAMPAIGN_NAME | `NORQVA_TRATTORIA_EXP02_CREATIVE` |
| OBJECTIVE | Vendas (OUTCOME_SALES), mesma configuração Advantage+ do controle |
| Estrutura | ABO, 3 conjuntos (1 por criativo) para forçar divisão igual de verba |
| ADSET_NAMES | `TR_EXP02_V1_EMO`, `TR_EXP02_V2_FOOD`, `TR_EXP02_V3_HYB` |
| AD_NAMES | `TR_V1_EMO`, `TR_V2_FOOD`, `TR_V3_HYB` |
| OPTIMIZATION | Conversões no site · Maximizar conversões · evento Comprar · Volume mais alto |
| PIXEL/DATASET | NORQVA WEB DATA 1049452567443586 (o mesmo do controle) |
| ATTRIBUTION | Padrão (igual ao controle) |
| AUDIENCE | BR, 25–65, público Advantage+, sem interesses (igual ao controle) |
| PLACEMENTS | Advantage+ (automáticos); vídeo 9:16 cobre Reels/Stories |
| DESTINATION | `https://trattoria.norqva.com.br/p/OFF-000001` |
| URL PARAMETERS | `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}` (padrão já comprovado no controle) |
| Mapeamento | V1_EMOTIONAL_FINAL.mp4 → TR_V1_EMO · V2_FOOD_DESIRE_FINAL.mp4 → TR_V2_FOOD · V3_HYBRID_FINAL.mp4 → TR_V3_HYB |
| Texto (igual nos 3, para isolar o criativo) | "Massa fresca, molho de verdade e o passo a passo para preparar um jantar italiano em casa. Trattoria em Casa: e-book digital de receitas italianas por R$ 19,90, pagamento único via Pix, com download logo após a confirmação." · Título: "Trattoria em Casa · R$ 19,90" · CTA: Ver detalhes (igual ao controle) |
| BUDGET | R$ 20/dia por conjunto (R$ 60/dia) · 7 dias · ~R$ 420 · controle segue R$ 30/dia |
| Estado ao criar | PAUSED até autorização final |

**Limite metodológico:** campanha separada concorre no mesmo leilão/público do controle (sobreposição) e a fase de aprendizado é nova; a comparação desafiante × desafiante é limpa (mesma campanha, mesma verba); desafiante × controle é indicativa.

**Regras de decisão:** métrica primária compras e CAC (gasto Meta / vendas NORQVA atribuídas). Não decidir antes de 4 dias e R$ 80 de gasto por conjunto. Pausar um desafiante só com gasto ≥ R$ 100 e 0 compras. Vencedor: ≥ 3 compras e menor CAC; CTR/CPC/hook rate são diagnósticos, nunca critério de vitória. Referência econômica: CPA de equilíbrio R$ 16,72; controle atual R$ 49–56.

## 9. Pre-flight
```
META_CONTROL_STATUS=ACTIVE (campanha 120249666098740097 / conjunto 120249666098760097 / anúncio 120249666532700097) — com edições não publicadas pendentes
ATTRIBUTION_GATE=PASS (5 vendas atribuídas por anúncio em produção; query preservada no redirect)
PIXEL_GATE=PASS (Purchase/InitiateCheckout navegador+servidor, EMQ 8,4, dedup por event_id)
CHECKOUT_GATE=PASS (Asaas production habilitado, webhook autenticado, vendas reais recentes)
FULFILLMENT_GATE=PASS (entrega por download com token; sem e-mail automático)
CREATIVE_FILES_GATE=PASS (3 masters aprovados, 1080x1920 H.264/AAC, QA PASS)
TRACKING_GATE=PASS com condições (nomes únicos; ad_id dinâmico; sync antes de ler; CAC com gasto do Gerenciador)
BUDGET_PLAN=R$ 60/dia (3 × R$ 20) por 7 dias ≈ R$ 420; controle inalterado
EXPERIMENT_STRUCTURE=Campanha nova ABO, 3 conjuntos × 1 anúncio, configurações espelhadas do controle
CONTROL_CAMPAIGN_MODIFIED=NO
META_BUDGET_MODIFIED=NO
ADS_PUBLISHED=NO
KIE_CREDITS_USED=0
FINAL_STATE=READY_FOR_META_PUBLICATION_AUTHORIZATION
```
Efeito colateral da auditoria: 1 visita de teste na landing (PageView/ViewContent no pixel e 1 `OFFER_VIEW` com `utm_campaign=AUDIT_NO_ADS`). Nenhum pedido.

---

## EXP02 — Preparação final (2026-10-03, somente leitura)

### Rascunhos pendentes na conta (Gerenciador de Anúncios → "Conferir e publicar (2)")
| Objeto | Alteração em rascunho | Observação |
|---|---|---|
| Conjunto `TRATTORIA_ABO_BROAD_BR_V1` (CONTROL, 120249666098760097) | **Orçamento diário R$ 30 → R$ 20** | não publicado; se publicado, reduz a verba do CONTROL |
| 1 anúncio (nome não carregou no diálogo) | ATUALIZADO: Criativo, com erro "Corrigir erro" | não é nenhum dos 3 anúncios da campanha de controle (verificado um a um) |
O diálogo de publicação é **da conta inteira** e vem com as duas linhas **pré-marcadas**. Publicar o EXP02 pelo Gerenciador sem desmarcar essas linhas publicaria a redução de orçamento do CONTROL. Nada foi publicado nem descartado; contagem de rascunhos conferida antes e depois (2).

### Outro achado
O conjunto de controle exibe a tarefa de **transparência de anúncios (Brasil)**: "anunciante e pagador verificados" serão exigidos "em breve" para veicular no Brasil. Conjuntos novos podem pedir isso na publicação.

### Estrutura recomendada
1 campanha nova → 1 conjunto → 3 anúncios, com o recurso nativo **Teste de criativos** do Gerenciador (2–5 anúncios, divisão igual de verba no teste, cada pessoa vê uma só variação), se disponível na conta no momento da criação. Sem esse recurso, a entrega automática concentra verba em um anúncio e a comparação não é justa → alternativa: 3 conjuntos ABO idênticos (1 anúncio cada, mesma verba). Executar dentro do conjunto de controle está fora de questão (alteraria o CONTROL).

### Especificação
- Campanha `NORQVA_TRATTORIA_EXP02_CREATIVE` · Vendas · Campanha de vendas Advantage+ ativada (igual ao controle) · criada **PAUSADA**.
- Conjunto `TRATTORIA_EXP02_BROAD_BR` · site · Maximizar conversões · Compra · dataset NORQVA WEB DATA 1049452567443586 · lance Volume mais alto · atribuição 7 dias clique / 1 dia visualização / 1 dia engajamento (igual ao controle) · Brasil 25–65, público Advantage+, sem interesses · posicionamentos Advantage+.
- Anúncios (texto, título e CTA idênticos; só o vídeo muda):
  - `TR_V1_EMO` ← CREATIVE_V1_EMOTIONAL_FINAL.mp4 (SHA 52b8a7a4…)
  - `TR_V2_FOOD` ← CREATIVE_V2_FOOD_DESIRE_FINAL.mp4 (SHA 1e70d562…)
  - `TR_V3_HYB` ← CREATIVE_V3_HYBRID_FINAL.mp4 (SHA 83825fa9…)
  - Texto: "Massa fresca, molho de verdade e o passo a passo para preparar um jantar italiano em casa. Trattoria em Casa: e-book digital de receitas italianas por R$ 19,90, pagamento único via Pix, com download logo após a confirmação." · Título: "Trattoria em Casa · R$ 19,90" · CTA: Ver detalhes.
- Destino: `https://trattoria.norqva.com.br/p/OFF-000001`
- Parâmetros de URL (por anúncio): `utm_source=meta&utm_medium=paid_social&utm_campaign=NORQVA_TRATTORIA_EXP02_CREATIVE&utm_content=<TR_Vx>&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}`

### Orçamento e regras de proteção (teto R$ 420, não é meta)
- Fase 1 (dias 1–3): R$ 45/dia no total (≈ R$ 15 por criativo) → até R$ 135.
- Pausar um criativo com ≥ R$ 50 gastos (3× o CAC de equilíbrio) sem nenhuma compra **e** sem InitiateCheckout; ou com ≥ R$ 80 sem compra.
- Encerrar o teste se o gasto acumulado chegar a R$ 250 com ≤ 1 compra no total.
- Fase 2 (dias 4–7, até o teto de R$ 420): só para criativos com trajetória de CAC ≤ R$ 35 (≈ 2× equilíbrio).
- Escala só com ≥ 3 compras e CAC ≤ R$ 16,72. CTR/CPC/retenção são diagnósticos.
- Fonte: gasto do Gerenciador de Anúncios; compras atribuídas pelo NORQVA (sync antes de ler).

### Saída
`PUBLICATION_BLOCKER=CONTROL_UNPUBLISHED_DRAFTS` · `META_OBJECTS_CREATED=0` · `META_OBJECTS_ACTIVE=NO` · **BLOCKED_BEFORE_EXP02_PUBLICATION**
