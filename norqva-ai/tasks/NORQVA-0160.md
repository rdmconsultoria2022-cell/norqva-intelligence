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

- B (feita): painel "Vídeo com apresentadora" (`VideoPresenterPanel.tsx`) no passo Geração da Fábrica, abaixo dos anúncios. Escolher personagem (marcada como fictícia), duração e tom; criar roteiro; editar falas; pendências (preço e alertas do motor); "Aprovar gasto e gerar" com confirmação e valor (só ADMIN); tomadas de cada cena com "Usar esta"; "Gerar de novo (gasta)" só ADMIN; montar em 9:16, 4:5 ou 1:1; assistir e baixar. Atualiza sozinho enquanto gera ou monta. Desligado ou motor fora do ar: o painel não aparece. Testes: `frontend/src/tests/norqva_0160_video_presenter.test.tsx`.
- C, parte 1 (feita, aprovada pelo Ricardo em 01/11/2026 22h19): "Usar este vídeo num anúncio da campanha" no painel. O vídeo pronto entra num anúncio da página como **versão nova** (mesmo texto, formato VIDEO, arquivo = link de 400 dias do motor, `video_final_anuncio`), que precisa ser aprovada de novo (`POST /api/video-factory/productions/:id/use-in-ad`, `reviseCreative` com `format`). A campanha gerada monta esse anúncio como anúncio de **vídeo** (a Meta baixa pelo link; miniatura da própria Meta; descrição junto), sempre PAUSADO: `advideos` entrou na lista fechada da trava "só PAUSED" (sem situação no payload), e a conferência antes de criar exige que o link do plano seja o mesmo do criativo aprovado. Cartão do anúncio mostra o vídeo. Painel: aviso "Vídeo indisponível" com "Tentar de novo" (não some mais) e "Carregando o vídeo…" no lugar do formulário enquanto abre.
- C, parte 2 (feita): campanha da página que **já está na Meta** ganha o anúncio de vídeo aprovado como anúncio **PAUSADO** no primeiro conjunto dela (`POST /api/generated-pages/:id/campaign/video-ads`, só ADMIN, registro de decisão antes, `GeneratedCampaignService.addVideoAd`). Mesma trava "só PAUSED" (cliente com `pausedOnlyClient`), um de cada vez por plano (trava no banco), retomável (IDs gravados na hora) e o anúncio só entra no plano quando existe na Meta (pausas e ativação continuam enxergando tudo). Nada é ativado: ativar continua com o dono. Painel: botão "Adicionar à campanha na Meta (pausado)" para ADMIN quando o anúncio com o vídeo está aprovado.

## Configuração no Render (depois do merge)

Grupo de variáveis "fabrica-video" com `FABRICA_VIDEO_TOKEN` (gerada pelo Render), ligado ao motor e ao backend do NORQVA; no NORQVA, `FABRICA_VIDEO_URL=https://fabrica-de-criativos-rv35.onrender.com` e `VIDEO_FACTORY_ENABLED=true` (só quando a etapa B estiver no ar).

## Testes

`norqva_0160_video_factory.test.ts` (motor simulado): dados sem preço, trava, perfis, motor fora do ar, criar e auditar, validação, roteiro com preço barrado, aprovação só ADMIN e barrada com preço, cena/tomada de outro vídeo, montagem.
