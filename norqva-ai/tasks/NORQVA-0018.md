# NORQVA-0018: Estrutura Meta por nicho — piloto Trattoria

**Branch:** `ai/NORQVA-0018-multi-niche-pilot` (a partir da `main` em `87554c1`)
**Executor:** Claude · **Revisão:** CI · **Merge e deploy:** Claude (autorizado pelo operador)
**Decisão:** D-0009 · **Risco:** HIGH (toca CAPI e pixel da landing)

## Objetivo

Uma marca por nicho, com seus próprios ativos Meta, e cada venda indo para o pixel da marca certa. Piloto: Culinária italiana (Trattoria). Bolso Blindado continua no pixel atual até fechar o BB-B01.

## Fase A: marca como dado (sem escrita na Meta)

**Migration 036 (aditiva)**
- `brands`: `id`, `code` UNIQUE, `name`, `niche_id` → `market_niches` (nulo permitido), `positioning`, `audience`, `tone`, `visual_identity JSONB`, `spokesperson_type` (`BRAND_ONLY` | `REAL_CREATOR` | `ILLUSTRATED_CHARACTER`, padrão `BRAND_ONLY`), `real_person_consent_ref`, `status` (`DRAFT` | `PROVISIONING` | `PILOT` | `CERTIFIED` | `PAUSED`), timestamps.
- `brand_meta_assets`: `brand_id`, `asset_type` (`FACEBOOK_PAGE` | `INSTAGRAM` | `AD_ACCOUNT` | `PIXEL` | `WHATSAPP`), `external_id`, `status` (`PENDING_OPERATOR` | `PENDING_API` | `LINKED` | `VERIFIED` | `FAILED`), `created_by` (`API` | `OPERATOR`), `verified_at`, `last_error`, `metadata JSONB`; única por `(brand_id, asset_type)`.
- `products.brand_id` (nulo permitido).

**Regras**
- Marca `BRAND_ONLY` não aceita `real_person_consent_ref`; `REAL_CREATOR` exige.
- Só ADMIN cria ou altera marca.

## Fase B: pixel por marca (roteamento)

- `metaCapiService.sendEvent`: se o pedido tiver produto com marca e a marca tiver `PIXEL` `VERIFIED`, usa esse pixel; senão, o pixel atual (`META_PIXEL_ID`). O `pixel_id` gravado em `capi_events` passa a ser o usado de fato.
- Landing `/p/:human_id`: a resposta pública da oferta inclui `meta_pixel_id` da marca; `initMetaPixel(customPixelId)` usa esse valor, com o pixel atual como padrão.
- **Nenhuma mudança** em pagamento, webhook, entrega ou atribuição.

## Fase C: provisionamento

- `POST /api/brands/:id/provision/pixel` (ADMIN): cria o Dataset/Pixel no Business Manager pela API e grava em `brand_meta_assets`.
- `POST /api/brands/:id/provision/ad-account` (ADMIN, exige campo `justification`): cria conta de anúncios pela API. Se o limite do BM for atingido, grava `FAILED` com a mensagem da Meta, sem nova tentativa.
- `POST /api/brands/:id/assets/:type/link` (ADMIN): operador informa o ID da Página, do Instagram ou do número de WhatsApp criados à mão; o backend confere pela API que o ativo existe e pertence ao BM antes de marcar `VERIFIED`.
- Tudo atrás de `META_MUTATION_ENABLED=true` e do preflight da D-0007; registro em `audit_logs`.
- **Fora de escopo:** criar Página, Instagram ou número de WhatsApp por API; criar campanhas ou anúncios (continua manual ou D-0007).

## Fase D: tela "Marcas"

- Lista de marcas com status e checklist de ativos (o que o Claude já fez, o que falta o operador fazer, com o passo a passo).
- Formulário de marca e botões de provisionamento, com diálogo de confirmação.

## Certificação do piloto (pré-requisito da criação em massa)

1. Página, Instagram, Pixel e WhatsApp da Trattoria `VERIFIED`.
2. Purchase chega ao pixel da marca pelo navegador e pela CAPI, com o mesmo `event_id` (deduplicação), e `capi_events` sem `FAILED` definitivo.
3. Uma rodada de teste com ao menos uma venda atribuída de forma determinística (D-0006) ao criativo certo.
4. 14 dias sem restrição na conta de anúncios, na Página ou no BM.
5. Relatório em `norqva-ai/reports/NORQVA-0018/certificacao.md` com a evidência bruta.

## Critérios de aceite (código)

- CI verde, com testes de:
  - migration aditiva (guarda do CI);
  - regra `BRAND_ONLY` × consentimento;
  - CAPI usando o pixel da marca, e o pixel atual como padrão;
  - landing recebendo o pixel da marca;
  - provisionamento bloqueado sem flag, sem ADMIN e sem justificativa;
  - erro de limite de conta gravado como `FAILED` sem retentativa;
  - vínculo manual recusado quando o ativo não pertence ao BM.
- Nenhuma chamada real à Meta nos testes.

## Ações do operador

1. Criar a Página "Trattoria" (ou o nome definido) no Business Manager.
2. Criar o Instagram da marca no app e conectar à Página.
3. Definir o número de WhatsApp da marca e confirmar o código.
4. Informar os IDs na tela "Marcas" (o NORQVA confere).
