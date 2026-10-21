# NORQVA-0106 — Auditoria de performance, conversão e recuperação de vendas

**Data:** 21/10/2026, 20h (São Paulo) · **Modo:** somente leitura (nenhuma alteração na Meta, no NORQVA, na Kiwify ou nas páginas) · **Executor:** Claude

**Fontes:**
- API da Meta (conta `act_2887010388338951`): insights por campanha, anúncio e dia; quebras por idade, sexo e posicionamento; histórico de atividades.
- API do NORQVA: `/api/sales/orders`, `/api/financial/dashboard`, `/api/offers`, `/api/meta-changes`, `/api/meta-control/audit`.
- Kiwify: tela Vendas.
- Repositório: DECISIONS, tarefas e migrations.
- Medição de carregamento das páginas no celular (Chromium com rede 4G simulada).

Nenhum dado pessoal de comprador foi copiado para este relatório.

**Legenda:**
- **VERIFICADO:** conferido na fonte.
- **NÃO VERIFICADO:** sem acesso à fonte.
- **Pixel:** Purchase contado pelo pixel da Meta.
- **Real:** pedido PAGO no banco do NORQVA (Asaas) ou na Kiwify.

---

## 0. Correção da premissa (leia primeiro)

A missão parte de "campanha experimental há ~48 h sem nenhuma venda". Os dados mostram outra situação:

1. **Todas as campanhas de receitas estão pausadas desde 20/10/2026 às 00h19** (VERIFICADO: histórico da Meta, aplicação "NORQVA"). São elas: REVENUE_V1, EXP02, OFF_000006 e OFF_000010. Quem pausou: NÃO VERIFICADO, porque o NORQVA não registrou a ação nas fichas de alteração (`/api/meta-changes` vai só até 19/10).
   - Desde então elas gastaram R$ 0,00 e não houve venda de livro.
   - A última venda real de livro foi em **19/10 às 23h12**.
   - **A falta de vendas dos livros nas últimas ~48 h vem das campanhas desligadas, não de um anúncio que parou de funcionar.**
2. A única campanha ligada é a **"NQ – Seca Barriga – Teste – Vendas"** (Kiwify), no ar desde 20/10 às 00h50. **Ela já vendeu:** 1 venda real em 21/10 às 06h54, no cartão, R$ 37,00 bruto e R$ 31,18 líquido na Kiwify. VERIFICADO na Kiwify e na Meta (1 Purchase de R$ 31,18).

Por isso a Fase 3 avalia as duas: a de receitas, pausada, e a do Seca Barriga, ativa.

---

## 1. Diagnóstico geral

| Item | Receitas (24/09 a 21/10) | Fonte |
|---|---|---|
| Investimento | **R$ 2.056,56** | Meta |
| Vendas reais pagas | **36** (37 menos 1 compra do operador de R$ 27,90 em 10/10) | NORQVA |
| Receita bruta real | **R$ 921,92** | NORQVA |
| Ticket médio | R$ 25,61 | cálculo |
| Receita líquida estimada (6% de imposto + R$ 1,99 de taxa por venda) | R$ 794,96 | cálculo (custos cadastrados nas ofertas) |
| **Resultado depois da mídia** | **R$ −1.261,60** | cálculo |
| ROAS real | **0,45** | cálculo |
| Custo por venda (CPA) real | **R$ 57,13** | cálculo |
| CPA de equilíbrio no ticket médio | **R$ 22,08** | cálculo |

**Resumo:**
- O funil de receitas converte bem quem chega à página: 6,3% das visitas viram compra.
- O problema é econômico. Cada visita custa R$ 3,72 e cada venda deixa só ~R$ 22 líquidos.
- Para empatar, o CPA precisa cair de R$ 57 para ~R$ 22. Isso pede **ticket maior (kit)** e **visita mais barata** juntos. Melhorar só o criativo não resolve.

**Medição:** o pixel bate com a realidade. A Meta contou 35 Purchases nas campanhas de receitas; o NORQVA atribuiu 33 pedidos a campanhas, e há 36 vendas reais no total. Não há duplicação relevante nem compra perdida (detalhes na seção 6, Etapa F).

---

## 2. Resultado financeiro histórico consolidado (conta inteira)

| Campanha | Produto | Período com gasto | Gasto | Cliques no link | Visitas (LPV) | IC | Purchase (pixel) | Vendas reais atribuídas (NORQVA) | Receita atribuída | ROAS |
|---|---|---|---|---|---|---|---|---|---|---|
| NORQVA_TRATTORIA_REVENUE_V1 | Trattoria R$ 19,90 | 24/09–19/10 (25 dias) | 1.194,54 | 402 | 267 | 26 | 18 | 18 | 432,80 | 0,36 |
| NORQVA_TRATTORIA_EXP02_CREATIVE | Trattoria R$ 19,90 | 04/10–19/10 (15 dias) | 522,74 | 238 | 169 | 11 | 10 | 9 | 199,00 | 0,38 |
| NORQVA_OFF_000006 (…71982) | Kit Cozinha Italiana (Trattoria + Dolci) | 12/10–20/10 | 166,01 | 65 | 45 | 3 | 3 | 3 | 80,70 | 0,49 |
| NORQVA_OFF_000006 (…511C) | Kit Cozinha Italiana | 12/10–15/10 | 57,69 | 25 | 23 | 0 | 0 | 0 | 0 | 0 |
| NORQVA_OFF_000010 | Kit 5 livros (R$ 79,92 → R$ 29,90) | 15/10–20/10 | 115,58 | 60 | 49 | 9 | 4 | 3 | 139,72 | **1,21** |
| NQ – Seca Barriga – Teste – Vendas | Seca Barriga (Kiwify) | 20/10–21/10 | 275,96 | 115 | 77 | 6 | 1 | 1 (Kiwify) | 37,00 | 0,13 |
| BB-B01 \| Rodada 1 | Bolso Blindado (não é receita) | 28/09–01/10 | 187,58 | 57 | 40 | 2 | 0 | 0 | 0 | 0 |
| NORQVA \| EXP-2026-001 \| TRATTORIA | Trattoria (fase de testes) | 04/09–11/09 | 473,35 | 243 | 5 | 6 | 0 | NÃO VERIFICADO | — | — |
| NORQVA E2E META TESTE 01 | Plataforma NORQVA (teste técnico) | 01/09–22/09 | 939,35 | 683 | 0 | 3 | 2 | teste | — | — |

- **Total gasto na conta desde a criação:** R$ 3.932,80 (Meta, `amount_spent`).
- **A EXP-2026-001 registrou só 5 visitas para 243 cliques.** O rastreamento daquela fase não funcionava; os números dela não servem de comparação.
- **Entre os períodos:**
  - 24/09–12/10: R$ ~1.194 de gasto, 20 vendas, R$ 442,70, ROAS 0,37, CPA R$ 59,7.
  - 13/10–19/10: R$ ~863 de gasto, 16 vendas, R$ 479,22, ROAS 0,56, CPA R$ 53,9.
  - A melhora veio **principalmente** do ticket, que subiu ~36% (R$ 22,1 → R$ 30,0) com kits e o Dolci como adicional. O CPA caiu só ~10%.

---

## 3. Ranking do que efetivamente vendeu

Vendas reais atribuídas pelo NORQVA. **Nenhum anúncio tem amostra para ser declarado vencedor.** Pelo preço de tabela da oferta, todos têm CPA acima do equilíbrio. A exceção aparente é o CR-000007: o ticket real dele (R$ 46,6) dá equilíbrio de ~R$ 41,8, acima do CPA de R$ 30,6, mas só por causa de uma venda de R$ 79,92 feita antes de o kit cair para R$ 29,90.

| # | Anúncio | Oferta / destino | Gasto | Vendas | CPA | Ticket | CPA de equilíbrio da oferta | Leitura |
|---|---|---|---|---|---|---|---|---|
| 1 | TRATTORIA_V1_AD_C_HOOK_MASSA_CASEIRA (vídeo) | /p/OFF-000001 | 985,92 | 18 | 54,8 | 24,0 | 16,72 | Maior volume, **comprovado** como gerador de vendas; não é lucrativo |
| 2 | TR_V1_EMO (vídeo) | /p/OFF-000001 | 410,47 | 7 | 58,6 | 22,7 | 16,72 | Consistente com o nº 1 |
| 3 | EXT-TR_V1_EMO-V2 (mesmo vídeo, texto de kit) | /kit/OFF-000006 | 166,01 | 3 | 55,3 | 26,9 | 21,42 | Indício |
| 4 | **CR-000007 "Sobremesas italianas de família"** | /kit/OFF-000010 | 91,68 | 3 | **30,6** | **46,6** | 26,12 | **Melhor relação, mas só 3 vendas** (uma de R$ 79,92). Indício positivo, não prova |
| 5 | TR_V2_FOOD | /p/OFF-000001 | 76,69 | 2 | 38,3 | 19,9 | 16,72 | Indício fraco |

Criativos de receitas que gastaram e não venderam:
- TRATTORIA_V1_AD_B_HOOK_EMULSAO: R$ 105 (o pixel contou 1 compra, o NORQVA 0).
- CR-000004: R$ 36,82.
- TRATTORIA_V1_AD_A_HOOK_SEPARACAO: R$ 35,59.
- TR_V3_HYB: R$ 35,58 (o pixel contou 1 compra, o NORQVA 0).
- Outros com menos de R$ 13 cada.

**Argumentos que venderam:**
- Comida de verdade feita em casa ("massa fresca, molho de verdade", "massa caseira").
- Sobremesa de família.
- Promessa de passo a passo.

O ângulo "erro na cozinha" (molho que separa, emulsão) gastou e não vendeu.

**Produto com maior aceitação:** Trattoria (29 vendas reais: 20 só o livro e 9 com o Dolci como adicional). O adicional apareceu em 10/10:
- De 10/10 a 14/10, a R$ 14,90: 5 de 11 pedidos pagos levaram o Dolci (45%).
- Desde 15/10, a R$ 5,00: 4 de 5 (80%).

Isso é **indício** de que o adicional barato aumenta o ticket, mas a amostra ainda é pequena.

---

## 4. Diagnóstico da campanha atual

### 4a. Receitas (pausadas desde 20/10 00h19)

| Etapa | Evidência | Classificação |
|---|---|---|
| **A — Entrega** | Gasto zero desde 20/10 00h19 (pausa pelo app NORQVA). Antes disso: frequência 2,35 e alcance de 10.757 pessoas em 4 semanas; nenhuma restrição de conta (status 1) | **Causa principal da falta de vendas nas últimas 48 h** |
| **B — Criativos** | CTR no link 3,13% e CPC no link R$ 2,60. O CTR é bom, mas o **CPM de R$ 81** é alto. Nenhuma queda de CTR por cansaço no fim do período | Não é o gargalo principal |
| **C — Página** | 70% dos cliques viram visita, dentro do normal. No 4G simulado, a página do Trattoria aparece em 2,9 s (651 KB) e a do kit em 1,8 s, mas pesa 2,7 MB. **A primeira tela do kit diz "Ofertas a partir de R$ 14,90"** e não mostra o kit de R$ 29,90 | Ponto de melhoria (kit) |
| **D — Oferta** | De visita para compra: 6,3%, bom para e-book. Ticket médio R$ 25,61. O "+4 livros por R$ 9,90" depois da compra vendeu **0** (exibição NÃO VERIFICADA) | **Gargalo econômico: ticket baixo** |
| **E — Checkout** | De IC (pixel) para compra: 71%. Desde 25/09 ficaram 5 pedidos reais não pagos (3 com pagamento expirado e 2 pendentes), incluindo um de R$ 74,60 com 4 livros | Saudável; há pedidos para recuperar |
| **F — Mensuração** | Pixel (35) ≈ real atribuído (33) ≈ real total (36). Purchase do navegador e do servidor deduplicados pelo mesmo `eventID` | Saudável |

### 4b. Seca Barriga (ativa)

| Etapa | Evidência | Classificação |
|---|---|---|
| A — Entrega | Ativa e entregando: R$ 275,96 em ~44 h, frequência 1,48. Dois anúncios foram reprovados e já voltaram a ser aprovados (21/10 às 01h25 e 09h19) | OK |
| B — Criativos | CTR no link 4,73% (melhor que o das receitas); CPC no link R$ 2,40; CPM R$ 113 | OK |
| C — Página (quiz) | 67% dos cliques viram visita. O quiz carrega em 0,7 s. Ontem só 1 em cada 6 visitantes começava; a primeira tela foi refeita em 20/10 às 21h | Em observação |
| D — Oferta | O preço mudou de R$ 97 para R$ 37 em 20/10 às 21h12. Antes: 7 viram a oferta e ninguém comprou. Depois: 1 venda com ~R$ 129 de gasto | **Cedo demais para julgar** |
| E — Checkout | 6 IC e 1 compra | Amostra pequena |
| F — Mensuração | Meta (1 Purchase de R$ 31,18) = Kiwify (1 venda de R$ 31,18 líquido) | OK |

**Conclusão:** a falta de vendas recentes dos livros se explica pela pausa das campanhas. O que falta para dar lucro é economia: ticket e custo por visita. O Seca Barriga não está "sem vendas" e ainda não tem dados para veredito.

---

## 5. Comparativo entre os criativos anteriores e os atuais

| Métrica | Receitas (24/09–19/10) | Seca Barriga (20–21/10) |
|---|---|---|
| Gasto | R$ 2.056,56 | R$ 275,96 |
| CPM | R$ 81,46 | R$ 113,52 |
| CTR no link | 3,13% | 4,73% |
| CPC no link | R$ 2,60 | R$ 2,40 |
| Custo por visita | R$ 3,72 | R$ 3,58 |
| Visita → início do pagamento | 8,9% | 7,8% |
| Visita → compra | 6,3% | 1,3% (1 de 77; preço mudou no meio) |
| Vendas reais | 36 | 1 |
| CPA real | R$ 57,13 | R$ 275,96 (n = 1) |
| Ticket | R$ 25,61 | R$ 37,00 |

---

## 6. Principais gargalos do funil (receitas)

Impressão 25.247 → clique no link 790 (3,1%) → visita 553 (70%) → visualização da oferta (VC) 699 → início do pagamento 49 (8,9% das visitas) → compra pelo pixel 35 (71% dos IC) → **36 vendas reais** → produto entregue: **21 de 36 baixaram o PDF**.

1. **Economia (maior perda):** custo por visita R$ 3,72 contra ticket de R$ 25,61. Mesmo convertendo 6,3%, o CPA fica em R$ 57.
2. **Entrega (risco escondido):** **15 dos 36 compradores pagos nunca baixaram o arquivo** (`download_count = 0`; conferido pedido a pedido, sem o Bolso Blindado e sem o pedido do operador). Nos pedidos mais antigos, o e-mail de acesso saiu horas ou dias depois do pagamento (de 89 min a ~20 dias), o que sugere reenvio manual depois de falhas (ver NORQVA-0023). Isso gera risco de reembolso e de contestação no cartão e impede depoimentos reais. Corrigir mexe em entrega, então **depende de aprovação**.
3. **Ticket:** há indício de que o adicional de R$ 5,00 do Dolci funciona (4 de 5 pedidos pagos desde 15/10). O "+4 livros por R$ 9,90" depois da compra não vendeu.
4. **Recuperação:** 5 pedidos reais ficaram sem pagar (3 expirados e 2 pendentes). Não existe lembrete automático.

---

## 7. Produtos e ofertas (preços reais cadastrados)

| Oferta | Preço | Situação | Vendas reais | CPA de equilíbrio (6% + R$ 1,99) | Leitura |
|---|---|---|---|---|---|
| OFF-000001 Trattoria | R$ 19,90 (+ Dolci R$ 5,00 = R$ 24,90) | ATIVA | 29 | R$ 16,72 (R$ 21,42 com o adicional) | Bom produto de entrada; sozinho, não paga a mídia |
| OFF-000005 Dolci | R$ 14,90 | ATIVA | 0 sozinho (9 como adicional) | R$ 12,02 | Melhor como adicional |
| OFF-000006 Kit Cozinha Italiana (2 livros) | R$ 24,90 | ATIVA | 3 (o painel mostra 4: inclui a compra do operador) | R$ 21,42 | Quase o mesmo que o combo |
| **OFF-000010 Kit 5 livros** | **R$ 29,90** (vendeu 1 a R$ 79,92 antes da mudança) | ATIVA | 4 | **R$ 26,12** | **Maior potencial de lucro por venda** |
| OFF-000007/8/9 Pães, Antipasti, Risotos | R$ 19,90 | ATIVAS | 0 (nunca anunciadas sozinhas) | R$ 16,72 | Melhores dentro do kit |
| OFF-000013 +4 livros (depois da compra) | R$ 9,90 | ATIVA | 0 | R$ 7,32 | Exibição NÃO VERIFICADA |
| OFF-000011/12 saídas do kit | R$ 39,90 / R$ 49,90 | PAUSADAS | 0 | — | — |

**Kit progressivo de R$ 79,90 / R$ 59,90 / R$ 29,90:** não está implementado, e o repositório não registra essa proposta. O que existiu foi kit a R$ 79,92, depois saídas a R$ 49,90 e R$ 39,90 (pausadas), depois R$ 29,90. **Não recomendo** criar degraus de desconto agora: com o kit já a R$ 29,90, um "de R$ 79,90" escalonado seria desconto artificial e canibalizaria a oferta.

**Kit ou livro avulso como produto de entrada:**
- O kit de 5 tem o maior CPA de equilíbrio (R$ 26,12, contra R$ 16,72 do livro).
- O melhor indício de CPA (CR-000007, R$ 30,6) é do kit.
- Recomendo **testar o kit como oferta principal de aquisição**, com o Trattoria e o adicional do Dolci como alternativa para quem não quer o kit.

---

## 8. Cinco ações prioritárias (por impacto e confiança)

| # | Problema | Evidência | Alteração proposta | Impacto / confiança | Custo | Métrica de sucesso | Critério de parada | Aprovação |
|---|---|---|---|---|---|---|---|---|
| 1 | Livros sem anúncio no ar | Pausa em 20/10 00h19; gasto R$ 0 | Decidir se volta, e com qual teste (ação 3) | Alto / alta | — | — | — | **Ricardo (gasto na Meta)** |
| 2 | Compradores sem receber ou sem baixar | 15 de 36 pagos com 0 downloads; e-mails atrasados | Investigar o envio (estado do provedor de e-mail, caixa de spam), reenviar acesso e acompanhar 7 dias | Alto (reembolso, contestação, reputação) / alta | ~0 | Downloads de pagos ≥ 90% | — | **Ricardo (entrega)** |
| 3 | Ticket baixo | CPA de equilíbrio R$ 22 contra CPA real R$ 57; kit com CPA de equilíbrio R$ 26 | Uma campanha só: kit 5 livros (OFF-000010), criativo CR-000007 + MASSA_CASEIRA com texto de kit, R$ 30/dia, 1 conjunto amplo de 25 a 65+ anos | Médio-alto / média | R$ 420 em 14 dias | CPA ≤ R$ 26 com 5 vendas ou mais | Parar com R$ 80 de gasto sem venda, ou CPA > R$ 52 depois de R$ 200 | **Ricardo** |
| 4 | Primeira tela do kit não mostra o kit | "Ofertas a partir de R$ 14,90" no topo | Mostrar "5 livros · 74 receitas · R$ 29,90" e as 5 capas na primeira tela | Médio / média | ~0 | Visita → IC do kit ≥ 10% | Voltar se cair abaixo de 7% | Sem aprovação (tela e texto, D-0037); só depois de definir a ação 3 |
| 5 | Pedidos não pagos e interessados sem lembrete | 5 pedidos não pagos (um de R$ 74,60) | Lembrete por e-mail 1 h e 24 h depois para pedidos não pagos (dado já consentido no checkout) | Médio / média | ~0 | ≥ 20% dos pendentes pagos | — | **Ricardo (e-mail a cliente)** |

**Seca Barriga:**
- Não mexer até ter dados.
- Regra proposta: avaliar com **R$ 300 gastos depois da troca de preço** (20/10 21h12).
  - Manter se tiver 7 vendas ou mais (CPA ≤ ~R$ 43). Esse é o limite aceito durante o aprendizado; a meta continua sendo o equilíbrio de ~R$ 29.
  - Pausar o anúncio que gastar R$ 60 (2× o equilíbrio) sem venda.
- CPA de equilíbrio: ~R$ 29 (R$ 31,18 líquido Kiwify menos 6% de imposto sobre R$ 37).

---

## 9. Plano de execução

**Próximas 24 horas**, só diagnóstico, sem gasto novo:
1. Ricardo confirma se a pausa de 20/10 00h19 foi intencional.
2. Investigar a entrega: os 15 pedidos sem download e o provedor de e-mail. Corrigir só com aprovação.
3. Conferir se o "+4 livros por R$ 9,90" aparece depois da compra.

**Próximos 7 dias**, uma mudança por vez:
1. Dia 1: ajuste da primeira tela do kit (ação 4).
2. Dias 1 a 7: campanha única do kit a R$ 30/dia (ação 3), com as regras de parada.
3. Seca Barriga segue a regra acima.

**Próximos 30 dias:**
- Processo fixo com os critérios que o NORQVA já tem:
  - vencedor = 3 vendas ou mais com CPA ≤ 0,66× o equilíbrio;
  - promissor = CPA ≤ 1×;
  - perdedor = 2× o equilíbrio sem venda.
- Pixel separado por marca (Trattoria e Seca Barriga), hoje compartilhado com o painel do NORQVA (pendência já existente).
- Lembrete automático de pedido não pago.
- Depoimentos reais de compradores, com autorização.
- Escalar só se o CPA ficar ≤ R$ 26 por 7 dias seguidos com 10 vendas ou mais.

---

## 10. Projeções por cenário (30 dias, receitas)

Premissas: imposto de 6% e taxa de R$ 1,99 por venda (custos cadastrados nas ofertas); custo do produto zero (digital); sem reembolsos (histórico: 0).

| Cenário | Gasto | CPA suposto | Ticket suposto | Vendas | Receita | Resultado depois da mídia | ROAS |
|---|---|---|---|---|---|---|---|
| Se repetir o histórico | R$ 1.800 | R$ 57 | R$ 25,6 | ~32 | R$ 807 | **R$ −1.104** | 0,45 |
| **Conservador** (só o teste do kit, R$ 30/dia por 14 dias) | R$ 420 | R$ 45 | R$ 30 | ~9 | R$ 280 | **R$ −175** (custo do aprendizado) | 0,67 |
| **Otimizado** (kit + página + recuperação, R$ 60/dia) | R$ 1.800 | R$ 30 a R$ 40 | R$ 30 | 45 a 60 | R$ 1.350 a R$ 1.800 | **R$ −621 a R$ −227** | 0,75 a 1,0 |
| **Expansão controlada** (só depois de 7 dias com CPA ≤ R$ 26; R$ 150/dia) | R$ 4.500 | R$ 24 | R$ 30 | ~188 | R$ 5.625 | **R$ +414** | 1,25 |

Ticket de R$ 30 = preço do kit; o "+4 livros" ainda não vendeu, então não entra na conta. No ticket de R$ 30, o CPA de equilíbrio é R$ 26,21. Nenhum cenário de lucro existe sem levar o CPA para perto de R$ 24–26. Hoje não há evidência de que isso aconteça; só o indício do CR-000007, com n = 3.

---

## 11. Recursos do NORQVA

- **Em uso:** sincronização Meta, painel financeiro com conciliação (bate R$ 979,72 = produtos + atribuído + não atribuído), custos por oferta, vigia de teto e fichas de alteração.
  - O painel começa em 25/09 e inclui o Bolso Blindado, o pedido do operador e o Seca Barriga. Por isso mostra gasto de R$ 2.449,01 e 38 pagos, contra os R$ 2.056,56 e 36 vendas reais de receitas deste relatório.
  - A migration 048 funcionou: o pedido de teste de 10/10 08h18 está marcado como teste (pendência do CLAUDE.md resolvida).
- **Pouco usados:**
  - Classificação vencedor/promissor/perdedor: depende do CPA de equilíbrio, que agora está cadastrado nas ofertas. Dá para usá-la como regra do teste do kit.
  - Central de alertas: "gasto sem venda = 2× CPA de equilíbrio".
- **Lacunas encontradas** (proponho software só para a primeira):
  1. A pausa de 20/10 00h19 feita pelo app não aparece nas fichas de alteração. Recomendo registrar toda pausa feita pelo NORQVA.
  2. O Seca Barriga aparece no NORQVA sem produto (vendas na Kiwify não entram no Financeiro).
  3. A seleção "N = 30" não existe.

---

## 12. Respostas objetivas

**O que já conseguimos fazer funcionar?**
- O funil de receitas converte quem chega: 6,3% das visitas compram.
- A medição é confiável: o pixel bate com o banco.
- O vídeo "massa caseira" vende de forma repetida (18 vendas).
- O Dolci como adicional de R$ 5,00 dá indício de aumentar o ticket (4 de 5 desde 15/10).
- O kit de 5 livros mostra o melhor indício de CPA (R$ 30,6, n = 3).

**Por que a campanha atual não está convertendo?**
- **Livros:** as campanhas estão pausadas desde 20/10 às 00h19. Antes disso vendiam, com prejuízo, porque o ticket (R$ 25,61) não cobre o custo por venda (R$ 57).
- **Seca Barriga:** está convertendo (1 venda real em 21/10) e ainda não tem amostra para veredito.

**Qual é a primeira mudança a testar para recuperar vendas?**
Uma campanha única do **kit de 5 livros a R$ 29,90** (CPA de equilíbrio R$ 26), com o criativo de sobremesas (CR-000007) e o de massa caseira adaptado ao kit, a R$ 30/dia. Junto com ela, a primeira tela do kit mostrando o kit e o preço. Depende do "sim" do Ricardo.

**Qual estratégia tem a melhor relação entre potencial de lucro e risco?**
O teste do kit no cenário conservador: perda máxima prevista de ~R$ 175–420 em 14 dias, com regras de parada. É o único caminho com ticket suficiente para um CPA alcançável. Reativar a campanha antiga do Trattoria avulso repetiria o ROAS de 0,45.

---

**Pendências NÃO VERIFICADAS:**
- Quem pausou as campanhas em 20/10.
- Se o "+4 livros" aparece depois da compra.
- Taxas reais do Asaas no cartão (usada a estimativa cadastrada).
- Dados por aparelho: a Meta não devolveu a quebra.
- Números da EXP-2026-001: rastreamento quebrado na época.
