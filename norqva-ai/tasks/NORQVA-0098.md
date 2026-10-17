# NORQVA-0098: novas edições de campanha (etapa 5 do Centro de Controle)

**Branch:** `ai/NORQVA-0098-novas-edicoes` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** com o "sim" do Ricardo
**Autorização:** Ricardo, 16/10/2026 23h59 ("Aprovado"), contrato no Claude Docs "NORQVA-0098 — Contrato: novas edições de campanha" · **Risco:** MEDIUM (altera anúncios na Meta, sem aumentar gasto)

## O que muda

- **Ver público:** Configurações da campanha lista o público de cada conjunto (só leitura, `AudienceList`).
- **Descrição do anúncio:** novo campo no "Editar anúncio na Meta" (até 255 caracteres, sem preço), enviado como `video_data.link_description` na peça nova.
- **Trocar o vídeo no ar:** no mesmo formulário, escolher outro criativo aprovado da oferta (mesmo crivo da criação: produto da oferta/kit, aprovado com o arquivo igual ao aprovado, vídeo https, sem preço nem promessa de preço). O NORQVA envia o vídeo (`/advideos`), espera a Meta processar e troca a peça no mesmo anúncio. O plano guarda o vídeo novo (`meta_ids.videos`, `spec.ads[i].video_url`).
- **Renomear** campanha, conjunto ou anúncio na Meta: `POST /api/meta-control/:entityType/:id/name` (Administrador). Relê o nome; o código do plano não muda.
- **Data de término do conjunto:** `POST /api/meta-control/adset/:id/end-time` (Administrador), só data futura (pelo menos 1 h). Relê `end_time`. Tirar a data fica pelo Gerenciador.
- Todas: chave geral da Meta, conferência da credencial, registro de decisão antes de agir, escopo da campanha, objetos protegidos recusados, auditoria. Nada muda status nem orçamento.

## Fora do escopo

Editar público, data de início, remover data de término.

## Testes

`backend/src/tests/norqva_0098_novas_edicoes.test.ts` (Meta simulada). Banco sem migration nova.
