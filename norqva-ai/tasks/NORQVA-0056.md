# NORQVA-0056: editar anúncio que já está na Meta (link, texto, título e botão)

**Branch:** `ai/NORQVA-0056-editar-anuncio-meta` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** contrato "NORQVA-0055 editar anúncio" (Claude Docs), aprovado pelo Ricardo em 13/10/2026 16h46. O número 0055 ficou com o livro de Pães (PR #96), por isso o código usa 0056. · **Risco:** MEDIUM (mexe em anúncio que está rodando na Meta)

## Pedido

"Na tela não é possível editar as informações, eu gostaria de alterar o link de destino da campanha" (NORQVA_TRATTORIA_EXP02_CREATIVE). Destino: página do kit (`/kit/OFF-000006`). Textos sem preço.

## Escopo

- `MetaMutatingClient.updateAdCreative(adId, creativeId)`: `POST /{adId} {creative:{creative_id}}`; ids numéricos; anúncio protegido (controle) recusado; trava `META_MUTATION_ENABLED` + preflight.
- `services/launchPlans/adCreativeSwap.ts`: a Meta não edita a peça de um anúncio existente. O NORQVA lê a peça atual (vídeo, miniatura, página, Instagram e `url_tags`), cria uma peça nova com o link, texto, título e botão novos e troca dentro do MESMO anúncio. Status, orçamento e público não mudam; o anúncio passa de novo pela revisão da Meta.
- Travas: só ADMIN; código da campanha digitado; texto sem preço (D-0053); destino só na lista de domínios e numa oferta `/p/` ou `/kit/` que existe; registro de decisão (`CAMPAIGN_AD_CREATIVE_SWAP`) e auditoria (`CAMPAIGN_AD_CREATIVE_SWAPPED`, com antes e depois).
- O plano passa a refletir a Meta (spec do anúncio, `meta_ids.creatives`, campos marcados como manuais). A oferta do plano só muda quando todos os anúncios apontam para a mesma oferta.
- Rota `POST /api/campaigns/:id/ads/:index/replace-on-meta` (ADMIN).
- Tela Campanhas → Configuração: botão "Editar anúncio na Meta" em cada anúncio que já existe na Meta.
- Testes: `norqva_0056_ad_swap.test.ts` (Meta simulada), `norqva_0056_ad_meta_swap.test.tsx`.

## Continua igual

Nada é ativado nem pausado pela troca; ativar e gastar continuam com o "sim" do Ricardo. As etiquetas de origem (`utm_campaign` = código do plano) seguem iguais, então as vendas continuam contando para a campanha.
