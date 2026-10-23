# NORQVA-0117: Campanha (etapa 3): campanha PAUSADA na Meta a partir da página gerada

**Branch:** `ai/NORQVA-0117-campanha` (a partir da `main`, que já tem a NORQVA-0116)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** depois do CI verde e da revisão
**Autorização:** contrato aprovado pelo Ricardo (Claude Docs, recurso "Referências", etapa 3) · **Risco:** MEDIUM (cria objetos na Meta, sempre PAUSADOS; nada ativa nem gasta)

## Decisão

D-0117. De uma página gerada PUBLICADA e dos anúncios dela APROVADOS, o NORQVA monta o plano de lançamento de sempre (rascunho) e cria campanha, conjunto e anúncios de imagem na Meta, tudo PAUSADO. Ativar e gastar continua só com o dono, pelo "Sim" do plano em Campanhas, com o código (NORQVA-0094). Esta etapa nunca ativa nada.

## Escopo

- Migration 078 (aditiva): `launch_plans.generated_page_id` (liga o plano à página) com índice único: um plano só por página.
- Reaproveitamento do plano de lançamento (`services/launchPlans/launchPlanService.ts`), sem caminho paralelo:
  - anúncio de imagem: `image_url` (https) no lugar do vídeo, e `description`; na criação, a imagem é enviada em `/act_X/adimages` (hash guardado em `meta_ids.images`, para retomar sem reenviar) e a peça vai com `link_data.image_hash` e `link_data.description`;
  - destino aceito: a página gerada `https://acesso.norqva.com.br/v/<slug>` (`META_GENERATED_PAGE_HOSTS`), com a oferta informada no plano.
- `MetaMutatingClient`: `uploadImageFromUrl` (só baixa do site do comprador ou do Supabase do NORQVA, https, PNG/JPEG até 8 MB), `addPayloadGuard` (trava em cada POST) e `isGeneratedPageUrl`.
- `services/launchPlans/generatedCampaignService.ts`:
  - `assertOnlyPausedPayload`: lança se qualquer POST levar `status`/`configured_status`/`effective_status` diferente de PAUSED, se criar campanha/conjunto/anúncio sem PAUSED explícito ou se tentar mudar um objeto existente (POST em `/<id>`). Ligada em toda criação de plano de página gerada (também pela rota genérica `/api/launch-plans/:id/create`).
  - Plano: nome "NQ – <produto> – Ref <REF> – Vendas" (com o código da página no fim se o nome já existir), R$ 30/dia (dentro do mínimo e do máximo de sempre), teto de 7 dias (como as campanhas da oferta; o teto segue editável pela D-0052), Brasil, 25–65, público Advantage, pixel oficial, Compra; um conjunto com os anúncios aprovados (até 10); imagem de cada anúncio = imagens da página (as do site viram endereço completo; as novas, link assinado), em rodízio; sem imagem, bloqueia. UTMs: as de todo plano (`urlTagsFor`), com `utm_campaign=<código do plano>` e `utm_content=<código do criativo>`. Botão do anúncio: Saiba mais.
  - Conferência logo antes de criar (`assertGeneratedPlanReady`, chamada pelo `assertAdsReadyForMeta` de sempre): página no ar, oferta à venda com preço, cada anúncio aprovado e igual ao aprovado, checagem da 0116 refeita na hora (função registrada), sem preço no texto, texto do plano igual ao do criativo, destino = a página.
  - Depois de criar: cada criativo ligado ao anúncio da Meta (`creative_meta_ads`, `API_PUBLISH`) e registro no histórico.
  - Telas de troca de criativo da Campanhas não mexem em anúncio de página gerada (só orçamento e teto).
- Rotas (só ADMIN, trava `CREATIVE_REFERENCES_ENABLED`): `GET /api/generated-pages/:id/campaign` (plano, sugestões, anúncios prontos) e `POST` (monta e cria). Segundo clique devolve o plano que já existe. `META_MUTATION_ENABLED` desligada: só o rascunho, com "Cadastro na Meta desligado".
- Criação na Meta pela mesma rotina com registro de decisão (`createPlanOnMetaAudited`, extraída do `launchPlanController`).
- Tela: na geração (Criativos → Referências → uma geração), seção "Campanha na Meta" (só ADMIN): "Criar campanha pausada" (ligado só com a página no ar e ao menos um anúncio aprovado sem bloqueio), formulário com as sugestões, resultado com o código e "Abrir em Gerenciar campanha" (abre a campanha na tela Campanhas).

## Revisão independente (aplicada)

- Imagem nova fica no plano como `storage:` e é assinada de novo na hora de enviar (o link do rascunho podia vencer); o cache de links respeita o tempo pedido.
- "Montar de novo": rascunho, falha ou recusa sem nada na Meta são montados na mesma linha (mesmo código, hashes de imagem mantidos); com objetos na Meta, o plano fica como está.
- UTMs de todo plano (`urlTagsFor`); a página gerada repassa `campaign_id`, `adset_id` e `ad_id` ao pagamento.
- Plano comum não aceita destino `/v/` (validação, edição de campos e conferência antes de criar).
- Download da imagem: 15 s, sem redirecionamento, tamanho conferido antes e durante; envio à Meta com prazo de 60 s.
- Criativo de cada anúncio gravado no plano (`factory_creative`) e ligado exatamente esse; falha de ligação vai para o histórico.
- Trava em lista fechada de endereços; trava numa cópia do cliente; promessa de preço barrada; imagens só da abertura/produto; cada imagem enviada uma vez; hashes fora da lista de objetos da Meta; tela de campanha só lê (não grava a checagem); nome único entre planos; painel usa a resposta do servidor.

## Variáveis de ambiente

- As de sempre da criação de plano: `META_MUTATION_ENABLED`, `META_AD_ACCOUNT_ID`, `META_ACCESS_TOKEN`, `META_MAX_DAILY_BUDGET_BRL`, identidades do Brasil (`META_ADVERTISER_BENEFICIARY_ID`/`META_ADVERTISER_PAYER_ID`), Página do Facebook da marca do produto.
- `META_GENERATED_PAGE_HOSTS` (opcional, padrão `acesso.norqva.com.br`) e `PUBLIC_SITE_URL` (opcional, https num desses hosts).

## Fica para depois

- Anúncio de vídeo para a página gerada (o vídeo não é gerado).
- Público por produto (idade/gênero guardados no produto): hoje vem do formulário.

## Regras

Tudo PAUSADO, sempre. Nada é ativado nesta etapa. Testes nunca falam com a Meta (Graph simulada).
