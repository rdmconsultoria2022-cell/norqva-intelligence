# NORQVA-0017: Base de dados de campanhas Meta, ranking de nichos e time de IAs

**Executor:** Claude · **Revisão:** CI · **Merge e deploy:** Claude (autorizado pelo operador)
**Decisão:** D-0008 · **Pedido do operador (2026-09-28):** "estruture a base de dados das campanhas da Meta: trazer os dados, métricas para selecionar os melhores nichos e campanhas; depois trabalho em time, avaliação, construção da campanha e preparação dos criativos para a Fábrica".

## Escolhas do operador

- **Fontes de dados:**
  - nossa conta Meta, com histórico completo;
  - mercado europeu pela API oficial da Biblioteca de Anúncios.
- **O que ficou fora, e por quê:**
  - a Meta não entrega anúncios comerciais do Brasil pela API;
  - raspar o site da Biblioteca de Anúncios viola os termos da Meta.
- **Time:** só as IAs.
  - Claude executa pela rotina, e o GPT dá a segunda opinião quando `OPENAI_API_KEY` estiver configurada.
  - O Antigravity continua como agente de código manual e não entra no fluxo automático.
  - O operador aprova no final. Nada é publicado na Meta sem clique humano (D-0007).

## Fases (um PR por fase)

### Fase 1: base de dados da nossa conta e pontuação (`ai/NORQVA-0017-meta-data-foundation`)

**Migration 033 (aditiva)**
- `meta_insights` ganha colunas de funil e vídeo, extraídas de `actions` e `action_values`: `purchases`, `purchase_value`, `landing_page_views`, `initiate_checkouts`, `add_to_carts`, `outbound_clicks`, `video_3s_views`, `thruplays`, `video_p25` … `video_p100`.
- `meta_ads` ganha o conteúdo do criativo: `creative_title`, `creative_body`, `creative_cta`, `thumbnail_url`, `image_url`, `video_id`, `url_tags` e `meta_created_time`.
- `meta_ad_sets` ganha `targeting_summary` (JSONB com idade, gênero, países e se o Advantage+ audience está ligado).

**Coleta**
- `metaClient` pede action_values, retenção de vídeo e outbound_clicks.
- Parser único `extractActionMetrics` para as compras: usa `omni_purchase`, senão `purchase`, senão `offsite_conversion.fb_pixel_purchase`, para não contar duas vezes.

**Histórico**
- `POST /api/meta/backfill` com `{days}` (até 730) sincroniza em janelas de 30 dias. Só ADMIN.

**Inteligência (`campaignIntelligenceService`)**
- **Níveis:** nicho (categoria do produto), produto, campanha, conjunto e anúncio, no período escolhido.
- **Métricas:**
  - investido, impressões, alcance, frequência, cliques no link, CTR de link, CPC, CPM;
  - hook rate (visualizações de 3 s ÷ impressões) e hold rate (ThruPlays ÷ visualizações de 3 s);
  - visitas e taxa de visita;
  - checkouts;
  - vendas NORQVA (verdade) e compras Meta (referência);
  - receita, CPA, ROAS e CVR.
- **Pontuação 0–100:**
  - **CPA esperado com prior bayesiano:** `(investido + CPA_equilíbrio) ÷ (vendas + 1)`, comparado ao CPA de equilíbrio do produto, com peso de 70%.
  - **Qualidade do topo de funil:** percentil do CTR de link e do hook rate dentro da conta, com peso de 30%.
  - **Confiança:** `min(1, investido ÷ (3 × CPA_equilíbrio))`.
- **Classificação:** VENCEDOR, PROMISSOR, TESTANDO, PERDEDOR ou SEM_DADOS, com as mesmas regras do plano de teste do BB-B01 (seção 7).

**API e tela**
- `GET /api/intelligence/campaign-base?level=niche|product|campaign|adset|ad&from&to`
- Tela "Base de campanhas" com abas por nível, ranking, métricas, selo da classificação e botões "Atualizar dados" e "Importar histórico".

### Fase 2: mercado europeu (`ai/NORQVA-0017-eu-market`)

**Entregue:**
- **Migration 034:**
  - `market_niches`, com dois nichos iniciais: Finanças pessoais e Culinária italiana;
  - `market_eu_ads`, único por anúncio e nicho;
  - `market_eu_ad_snapshots`, com o alcance por dia;
  - `market_eu_runs`.
- **Serviço `MarketEuService`:**
  - `probe`;
  - `collect`: até 3 páginas de 100 anúncios por termo; para na primeira recusa de acesso e marca a coleta como BLOCKED;
  - `listNiches`, com a pontuação;
  - `topAds`.
- **Pontuação do nicho:**
  - 40%: anúncios ativos há 30 dias ou mais;
  - 25%: número de anunciantes;
  - 20%: alcance na UE;
  - 15%: anúncios novos em 7 dias (escala logarítmica).
  - Classe: VALIDADO a partir de 70, PROMISSOR a partir de 45, FRACO abaixo disso, SEM_DADOS com menos de 5 anúncios.
- **Rotas `/api/market/eu/*`:**
  - probe, niches (GET, POST e PATCH), `niches/:id/ads` e collect;
  - coleta diária com `MARKET_EU_AUTO_ENABLED=true`.
- **Token:** `META_AD_LIBRARY_TOKEN`, que tem prioridade sobre o `META_ACCESS_TOKEN`.
  - A API exige que um usuário tenha confirmado identidade e aceitado os termos da Biblioteca de Anúncios.
  - Se o acesso for recusado, a tela mostra os passos.
- **Tela:** a "Base de campanhas" ganha a opção "Mercado europeu", com os nichos, a classe, os anúncios que se sustentam e um formulário de novo nicho.

- **Acesso:** probe real de `ads_archive` com `ad_reached_countries` na UE.
  - Se o token não tiver acesso, a tela explica o passo de verificação de identidade que o operador precisa fazer.
- **Nichos:** lista de nichos monitorados (termos de busca por nicho e idioma).
- **Coleta:** diária, gravando em `market_ads` com página, início, fim, dias no ar, `eu_total_reach`, plataformas e textos.
- **Pontuação de validação do nicho:**
  - anúncios com 30 dias ou mais no ar;
  - anunciantes distintos;
  - alcance total;
  - crescimento semana a semana.
- **Referências:** ranking de "ofertas que se sustentam" como referência criativa.

### Fase 3: time de IAs (`ai/NORQVA-0017-ai-team`)

**Entregue:**
- **Migration 035:** `creative_batches` (lotes das IAs no banco, importados pela Fábrica) e `campaign_opportunities`, com a sequência OPP-0001.
- **`OpportunityService`:**
  - cria a oportunidade a partir da Base de campanhas (guarda um retrato da linha e do ranking), do Mercado UE (nicho e melhores anúncios) ou de um briefing;
  - dispara a rotina do Claude com o payload `NORQVA_OPPORTUNITY_TASK` (tarefa EVALUATE ou PLAN), e o GPT dá a segunda opinião em segundo plano (`gptSecondOpinion`, opcional sem `OPENAI_API_KEY`);
  - valida o plano: produto, oferta do produto, de 1 a 20 criativos, e só claims VERIFIED do produto;
  - vira lote `OPP-XXXX-B01` com criativos DRAFT na Fábrica;
  - só ADMIN aprova ou descarta.
- **API de automação** (`X-Norqva-Automation-Token`):
  - `GET /api/automation/opportunities/:id` devolve a oportunidade e o contexto (produtos, ofertas, claims VERIFIED, CPA de equilíbrio, top anúncios da conta e nichos UE);
  - `POST …/status`, `…/evaluation` e `…/plan`.
- **Tela "Time de IAs":**
  - quadro por etapa, com as avaliações do Claude e do GPT lado a lado, o plano e o lote;
  - ações: pedir avaliação, montar plano, aprovar e descartar;
  - botões "Criar oportunidade" na Base de campanhas e no Mercado europeu.
- **Rotina:** a rotina "NORQVA — executar ajuste de criativo" ganha a seção do formato `NORQVA_OPPORTUNITY_TASK`.

- **Oportunidades:** criadas a partir do ranking (fases 1 e 2) ou manualmente, e seguem o fluxo CAPTADA → AVALIADA → PLANO → PRONTA_PARA_FÁBRICA → APROVADA ou DESCARTADA.
- **Avaliação:** a rotina do Claude avalia com os dados, e o GPT dá uma segunda opinião estruturada. O parecer, a nota e os riscos ficam gravados.
- **Plano de campanha:**
  - objetivo e evento, estrutura e orçamento de teste;
  - público;
  - hooks × mecanismos × CTAs, só com claims VERIFIED.
- **Lote de criativos:** vira uma nova tabela `creative_batches`. O lote deixa de existir só no código, e os criativos são importados como DRAFT na Fábrica.
- **Aprovação:** o operador aprova o plano e os criativos. Publicar continua manual ou pelo controle da D-0007.

## Critérios de aceite (fase 1)

- **CI verde, com testes de:**
  - parser de ações sem dupla contagem;
  - migration aditiva;
  - backfill em janelas;
  - pontuação e classificação nos limites;
  - agregação por nível;
  - acesso só de ADMIN e INTELLIGENCE.
- **Produção:**
  - após "Importar histórico", a tela lista os anúncios BB-B01 e Trattoria com investido igual ao Gerenciador (tolerância de arredondamento);
  - as vendas NORQVA batem com os pedidos pagos atribuídos.
