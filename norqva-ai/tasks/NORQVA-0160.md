# NORQVA-0160 — Vídeo com apresentadora (Fábrica de Criativos dentro do NORQVA)

**Pedido (Ricardo, 01/11/2026):** colocar a Fábrica de Criativos (motor de vídeo com apresentadora fictícia, serviço separado no Render) dentro do NORQVA, em Criativos → Fábrica. "Aprovado" em 01/11/2026 20h06. Contrato: Claude Docs "NORQVA-0160".

**Tipo:** função nova, com gasto (os clipes custam na fal.ai). Por isso: trava desligada por padrão, aprovar gasto só ADMIN, e o motor tem trava de orçamento mensal própria (US$ 150).

## Etapa A (este PR): ligação no backend

- Migration 091 `video_productions` (só aditiva): produto, oferta, página gerada (opcional), número da produção no motor, apresentadora, modelo, duração, estado, custo estimado, criativo (etapa C), quem criou e quem aprovou.
- `services/creative/videoFactoryClient.ts`: fala com a API interna do motor (`/api/v1`, `Authorization: Bearer FABRICA_VIDEO_TOKEN`, endereço `FABRICA_VIDEO_URL`). Manda os fatos do produto (`loadFacts`) **sem preço** (D-0053), com as promessas aprovadas e a lista do que é proibido. Fala com preço é barrada ao editar, ao gerar cena de novo, ao aprovar e ao montar. Em teste, sem simulação, nunca chama o motor (`setVideoFactoryForTests`).
- Rotas `/api/video-factory/*` (trava `VIDEO_FACTORY_ENABLED=true`; desligada = 404):
  - `GET catalog` (apresentadoras, modelos, orçamento do mês), `GET/POST productions`, `GET productions/:id`, `PUT productions/:id/script`, `POST .../scenes/:sceneId/choose`, `POST .../assemble`: ADMIN e CREATIVE.
  - `POST productions/:id/approve` (gasta) e `POST .../scenes/:sceneId/regenerate` (gasta): só ADMIN.
  - Cena e tomada são conferidas contra a produção (não dá para mexer em cena de outro vídeo).
- Auditoria: VIDEO_PRODUCTION_CREATED, VIDEO_SCRIPT_EDITED, VIDEO_PRODUCTION_APPROVED (crítico), VIDEO_SCENE_REGENERATED, VIDEO_TAKE_CHOSEN, VIDEO_ASSEMBLY_REQUESTED.

## Etapas seguintes

- B: painel "Vídeo com apresentadora" na etapa Geração da Fábrica (`FactoryWizard.tsx`).
- C: vídeo final vira criativo do NORQVA (armazenamento, aprovação pela fábrica) e campanha gerada aceita anúncio de vídeo, sempre PAUSADA.

## Configuração no Render (depois do merge)

Grupo de variáveis "fabrica-video" com `FABRICA_VIDEO_TOKEN` (gerada pelo Render), ligado ao motor e ao backend do NORQVA; no NORQVA, `FABRICA_VIDEO_URL=https://fabrica-de-criativos-rv35.onrender.com` e `VIDEO_FACTORY_ENABLED=true` (só quando a etapa B estiver no ar).

## Testes

`norqva_0160_video_factory.test.ts` (motor simulado): dados sem preço, trava, perfis, motor fora do ar, criar e auditar, validação, roteiro com preço barrado, aprovação só ADMIN e barrada com preço, cena/tomada de outro vídeo, montagem.
