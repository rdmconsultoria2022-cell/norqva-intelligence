# DECISIONS — NORQVA

Registro de decisões técnicas relevantes. Uma decisão encerrada não é rediscutida sem fato novo.

## D-0001 — Migration 025 com `NOT VALID` (2026-09-27)

- **Problema:** a suíte de testes apaga `schema_migrations` e reexecuta todas as migrations num banco que já contém eventos `PIX_GENERATED`, `PIX_EXPIRED` e `PAID` (criados pela 026 e pelo NORQVA-0001). A 025 recria uma constraint mais estreita e falha nessas linhas.
- **Decisão:** a constraint da 025 passa a ser `NOT VALID`. Exceção explícita à regra "não editar migration aplicada", **aprovada pelo operador em 2026-09-27**.
- **Por que é seguro:** em produção a 025 já foi aplicada e não roda de novo. O estado final do schema é idêntico, porque a 026 remove essa constraint e cria outra, validada. `migrations.ts` remove `NOT VALID` só no pg-mem, que não o suporta.
- **Alternativa rejeitada:** limpar eventos em cada teste. Frágil, porque qualquer teste de pagamento agora gera `PAID`.
- **Correção de fundo:** NORQVA-0002. Os testes não devem apagar `schema_migrations`; cada arquivo deve usar um banco ou schema isolado.

## D-0002 — Pedidos de teste reclassificados, não apagados (2026-09-27)

- **Decisão:** 8 pedidos internos de teste (Ricardo licas ×4, Ricardo Andrade ×1, QA User A ×1, Qa Sandbox Buyer Test ×2) saem de `COMMERCIAL_PRODUCTION` para `STAGING_SANDBOX_QA` na migration 028. **Aprovado pelo operador.**
- **Por quê:** 3 desses pedidos têm Pix real pago no Asaas. Apagar quebraria a conciliação com o extrato. Reclassificar tira os pedidos dos painéis de produção e mantém o histórico.
- **Efeito:** vendas reais passam de 8 pedidos pagos / R$ 169,20 para 4 / R$ 79,60.

## D-0003 — Modo DEMO removido da produção (2026-09-27)

- **Decisão:** o frontend de produção sempre opera em modo REAL. O seletor DEMO/REAL, o aviso de ambiente demo e o botão "limpar base demo" só existem em testes automatizados ou com `VITE_ENABLE_DEMO_MODE=true` no desenvolvimento local. **Aprovado pelo operador.**
- **Mantido:** o suporte a `mode=demo` no backend e o seed de demonstração, que a suíte de testes usa.

## D-0004 — Aprovação de criativos em `creative_reviews`, não em `decisions` (2026-09-27)

- **Decisão:** a aprovação de criativos da Fábrica (NORQVA-0005) fica numa tabela própria, `creative_reviews`, com decisão, motivo, revisor e `content_hash` da versão revisada.
- **Por quê:** estender `decisions.type` exigiria trocar o CHECK de uma tabela já aplicada. `creative_reviews` é aditiva e guarda o hash, o que `decisions` não faz.
- **Consequência:** quando a publicação automática existir (G4), ela vai gerar um `decisions` APROVADO a partir da revisão aprovada, porque é isso que o `metaMutatingClient` exige.
- **Diverge de:** `NORQVA_COMMERCE_FACTORY_ARCHITECTURE_REVIEW_V1`, seção D (migration 031).

## D-0005 — "Acesso vitalício" removido (2026-09-27)

- **Decisão:** o dono do produto não garante acesso vitalício. A claim BB-CL-08 entra como REJECTED, e as landings do Bolso Blindado e da Trattoria deixam de prometer acesso vitalício.
- **Contexto:** a entrega da Trattoria já limita os downloads (máximo de 5 por pedido), o que contradizia a promessa.

## D-0006 — Atribuição por criativo só determinística (2026-09-27)

- **Decisão:** o painel de performance de criativos só liga um evento ou pedido a um anúncio por `ad_id`, pelo nome exato do anúncio ou pelo `meta_ad_id` no `utm_content`. A correspondência por substring e o atalho `variant_x → ad_x` foram removidos.
- **Efeito:** o que não casar aparece como "não atribuído", em vez de ir para o anúncio errado.
- **Convenção:** nome do anúncio na Meta = chave do criativo (ex.: `BB-B01-H02-M1-C1`) = `utm_content`.
