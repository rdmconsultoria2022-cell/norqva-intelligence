# NORQVA-0005: Creative Factory (G0 + G1)

**Branch:** `ai/NORQVA-0005-creative-factory` (a partir da `main` em `e22ad66`)
**Executor:** Claude · **Revisão:** agente independente + CI · **Merge e deploy:** usuário
**Base:** `norqva-ai/reviews/NORQVA_COMMERCE_FACTORY_ARCHITECTURE_REVIEW_V1.md` (seções D, G, H, I, K)

## Objetivo

Permitir criar, aprovar e medir **vários criativos para a mesma campanha** com rastreio determinístico por criativo. O primeiro uso é o lote `BB-B01` do Método Bolso Blindado (`norqva-ai/creative-batches/BB-B01.md`).

## Escopo

### G0: verdade de mensuração por anúncio
1. `creativePerformanceService` lê `commercial_funnel_events`, e não mais a inexistente `telemetry_events`. Conta OFFER_VIEW/LANDING_PAGE_VIEW, CHECKOUT_MODAL_OPENED e CHECKOUT_STARTED.
2. Vínculo evento/pedido → anúncio, somente determinístico:
   - `metadata.ad_id`/`attribution_metadata.ad_id` = `meta_ad_id`;
   - `utm_content` = nome do anúncio (sem diferenciar maiúsculas);
   - `utm_content` = `meta_ad_id`.
   A correspondência por substring e o atalho `variant_x → ad_x` são removidos. O que não casar vai para "não atribuído".
3. Novo campo `checkout_modal_opened` por anúncio.

### G1: fábrica de criativos com aprovação
1. **Migration 029 (aditiva):**
   - `creatives`: metadados da matriz (hook_family, angle, pain, desire, mechanism, proof_type, audience, duration_seconds, primary_text, headline, script, batch_code, generation_source), versionamento (parent_creative_id, root_creative_id, version, lineage_code, content_hash), `utm_content_key` UNIQUE e `approval_status`;
   - `file_url` passa a aceitar nulo (proposta antes da produção);
   - tabelas novas `claims_registry`, `creative_claims`, `creative_reviews` e `creative_meta_ads`.
2. **Aprovação** em `creative_reviews`, e não em `decisions`. Motivo: evita alterar o CHECK de uma tabela aplicada; ver D-0004. A publicação automática (G4) vai criar um `decisions` APROVADO a partir da revisão.
3. **Regras:**
   - aprovar exige todas as claims do criativo `VERIFIED` e dentro da validade;
   - rejeitar exige `reason_code`;
   - toda revisão grava o `content_hash` da versão revisada;
   - um criativo já revisado não é editado: a edição cria uma nova versão (`parent_creative_id`, `version + 1`, nova chave `…-V2`);
   - claims são importadas como `UNVERIFIED`; só um ADMIN verifica.
4. **Importação de lote** (`POST /api/creative-factory/batches/:code/import`, ADMIN), idempotente. O lote fica embutido no código (`backend/src/data/creativeBatches.ts`). Nada é gravado em produção sem o clique de um ADMIN.
5. **Scorecard por criativo:** o anúncio da Meta é ligado pelo nome exato = `utm_content_key`, ou por vínculo manual. A recomendação usa o CPA de equilíbrio e o CPA-alvo de `offer_unit_economics`, com as regras da seção 7 do lote. É só recomendação: nenhuma ação automática.
6. **UI:** nova tela "Fábrica de Criativos" (claims, cards com aprovar/pedir ajuste/rejeitar, métricas e recomendação), sujeita ao período global.

## Fora de escopo
Publicação automática na Meta (G4), geração por IA (G3), landing como dado (G2), marcas (G5). Nada de Payment Core, Asaas, webhooks, fulfillment, DRE, Auth ou RBAC.

## Critérios de aceite
- CI verde, com testes novos cobrindo:
  - leitura de `commercial_funnel_events`;
  - ausência de correspondência por substring;
  - importação idempotente;
  - aprovação bloqueada por claim não verificada;
  - rejeição sem motivo recusada;
  - versão nova com parent;
  - scorecard ligado por nome exato;
  - regras de recomendação.
- Migration 029 não altera nenhuma migration aplicada (guarda do CI).
- Após o merge: importar o BB-B01 em produção (clique do usuário), verificar as claims e ver os 20 cards.
