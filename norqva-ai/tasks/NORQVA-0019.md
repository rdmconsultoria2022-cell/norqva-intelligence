# NORQVA-0019: Campanhas preparadas pelo Claude, ativadas pelo operador

**Branch:** `ai/NORQVA-0019-launch-plans` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI · **Merge e deploy:** Claude (autorizado pelo operador)
**Decisão:** D-0010 (operador, 2026-10-04): "total autonomia para criar as campanhas; o vínculo [orçamento/ativação] é uma pergunta que eu aceito" · **Risco:** HIGH (escrita na Meta)

## Objetivo

O Claude cria campanhas completas na Meta (campanha, conjuntos, criativos, anúncios) **sempre pausadas** e sem gasto possível. A ativação e o orçamento só acontecem quando o operador responde "Sim" a uma pergunta no NORQVA, por exemplo: *"Ativar NORQVA_TRATTORIA_EXP02_CREATIVE com R$ 45/dia (teto R$ 420)?"*.

Criar pela API evita o sistema de rascunhos do Gerenciador de Anúncios: nada do CONTROL entra na publicação.

## Modelo

**Migration 038 (aditiva):** `launch_plans`
- `id`, `code` UNIQUE (ex.: `TR-EXP02`), `brand_id`, `offer_human_id`, `status` (`DRAFT` → `CREATING` → `CREATED_PAUSED` → `AWAITING_OPERATOR` → `APPROVED` → `ACTIVE` | `REJECTED` | `FAILED`), `spec JSONB` (campanha, conjuntos, anúncios, UTMs, regras), `meta_ids JSONB` (IDs criados), `daily_budget_brl`, `max_spend_brl`, `question_text`, `decision_id` → `decisions`, `experiment_id` → `experiments`, `answered_by`, `answered_at`, `last_error`, timestamps.

## Backend

1. `POST /api/launch-plans` (ADMIN): grava o plano (`DRAFT`), valida a spec.
2. `POST /api/launch-plans/:id/create` (ADMIN): cria na Meta, tudo `PAUSED`:
   - vídeos: `POST /act_X/advideos` com `file_url` (arquivo público temporário) e espera o processamento;
   - criativo com `object_story_spec.video_data`, `url_tags` e CTA;
   - idempotência por `launch_plans.code` + nome do objeto; reexecução retoma sem duplicar.
   - **Não usa** `decisionId` nem reserva capital: objetos pausados não gastam.
3. Pergunta: ao terminar, status `AWAITING_OPERATOR` com `question_text`.
4. `POST /api/launch-plans/:id/answer` `{answer: YES|NO}` — **somente sessão humana ADMIN** (bloqueado para tokens de serviço/automação):
   - `YES`: cria `decisions` APROVADO pelo operador e `experiments` com `capital_approved = max_spend_brl`; aplica o orçamento e chama `setEntityStatus(ACTIVE)` só nos objetos do plano;
   - `NO`: `REJECTED`, objetos continuam pausados.
5. Guardas novas:
   - destino aceito também em domínios de marca verificados (`https://trattoria.norqva.com.br/p/:humanId`);
   - o plano nunca referencia IDs de campanha/conjunto/anúncio que não criou (protege o CONTROL);
   - teto diário `META_MAX_DAILY_BUDGET_BRL` continua valendo.
6. Tudo atrás de `META_MUTATION_ENABLED=true` + preflight; `audit_logs` em cada passo.

## Frontend

- Card "Aguardando sua decisão" na Visão Executiva e na tela Meta Ads: pergunta, resumo (campanha, conjuntos, anúncios, orçamento/dia, teto, regras de pausa), botões **Sim, ativar** / **Não**.
- Tela do plano: status, IDs criados, link para o Gerenciador.

## Primeiro uso: TR-EXP02

- Campanha `NORQVA_TRATTORIA_EXP02_CREATIVE` (Vendas), 3 conjuntos idênticos `TR_EXP02_V1_EMO|V2_FOOD|V3_HYB` (R$ 15/dia cada) com 1 anúncio cada (`TR_V1_EMO`, `TR_V2_FOOD`, `TR_V3_HYB`), pixel 1049452567443586, evento Compra, Brasil 25–65, público e posicionamentos Advantage+, destino `https://trattoria.norqva.com.br/p/OFF-000001`, UTMs do preflight.
- Pergunta: "Ativar com R$ 45/dia (3 × R$ 15), teto R$ 420?"

## Testes

Criação idempotente (mock Graph), tudo PAUSED, resposta só por ADMIN humano, `NO` não ativa nada, guarda de destino, recusa de IDs fora do plano, falha parcial retomável.

## Fora de escopo

Escalar orçamento automaticamente; editar/pausar o CONTROL; "Teste de criativos" nativo (não exposto na API pública de forma verificada).

## Recuperação após timeout (adicionado na revisão)

Antes de cada `POST` de campanha, conjunto ou anúncio, o NORQVA lista na Meta (somente leitura) os objetos com o **mesmo nome exato** sob o pai (conta → campanhas, campanha → conjuntos, conjunto → anúncios):
- nenhum: cria;
- um, `PAUSED`: adota o ID (um `POST` anterior foi aceito mas a resposta se perdeu) e registra `LAUNCH_PLAN_OBJECT_ADOPTED`;
- um não pausado, ou mais de um: para com 409 — reconciliação manual, nada é criado nem alterado;
- listagem indisponível: para (fail-closed), nada é criado.

Vídeos e criativos sem ID salvo podem ser recriados num retry; não veiculam sozinhos (sem anúncio) e ficam órfãos sem custo.

## Riscos operacionais registrados

- **R-0019-01 — teto não é limite na Meta.** O `max_spend_brl` (R$ 420 no TR-EXP02) é persistido no NORQVA (experimento + reserva de capital), mas **não** é um `spend_cap` na Meta. As regras de pausa reduzem o risco; não equivalem a limite externo. Mitigação pendente: `spend_cap` na campanha ou limite de gastos da conta. Não bloqueia o EXP02 de R$ 45/dia; fica aberto até a proteção adicional existir.
- **R-0019-02 — campos Graph não verificados ao vivo** (`is_adset_budget_sharing_enabled`, `targeting_automation`, `instagram_user_id`): a primeira criação real confirma; falha deixa tudo pausado e retomável.
- **R-0019-03 — espera do vídeo dentro da requisição** pode estourar o timeout do servidor; o retry retoma do vídeo já enviado.

## Anunciante verificado (adicionado após a primeira criação real)

A Meta recusou o primeiro conjunto do TR-EXP02 com `code 100, subcode 3858634` ("O anunciante está ausente", campo `compliance_section`). O "anunciante e pagador padrão" da tela de configurações só é preenchido pelo Gerenciador; a API exige `regional_regulation_identities` no conjunto.

- Render: `META_ADVERTISER_BENEFICIARY_ID` (e opcional `META_ADVERTISER_PAYER_ID`; sem ele, usa o anunciante) com o ID numérico da entidade verificada. Envio: `{universal_beneficiary, universal_payer}`.
- Opcional: `META_REGIONAL_REGULATED_CATEGORIES` (códigos numéricos), só se a Meta pedir a categoria.
- Sem as variáveis, nada muda. Valor não numérico: falha fechada, nada é criado.
