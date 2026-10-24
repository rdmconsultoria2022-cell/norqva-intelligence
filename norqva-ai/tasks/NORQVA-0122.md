# NORQVA-0122: Pausa noturna também nas campanhas criadas fora do NORQVA

**Branch:** `ai/NORQVA-0121-pausa-noturna-externas` (nome mantido: a PR já estava aberta quando a 0121 da Fábrica entrou na main; esta tarefa virou a 0122)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** depois do CI verde e da revisão (não mesclado nesta tarefa)
**Autorização:** mesmo contrato da pausa noturna (Ricardo, 23/10/2026 21h22): "começa ligada nas duas campanhas ativas hoje" · **Risco:** MEDIUM (pausa e reativa campanhas na Meta; nunca cria, nunca muda orçamento nem limite)

## Por quê

O contrato da NORQVA-0120 diz que a pausa noturna começa ligada nas duas campanhas ativas no dia: "NQ – Kit 5 livros – Teste – Vendas" (120250112900200097) e "NQ – Seca Barriga – Teste – Vendas" (120250081197880097). As duas foram criadas direto na Meta, não como planos do NORQVA, e o agendador só olhava `launch_plans`.

## Decisão

D-0122. Lista de campanhas da Meta que não são de um plano, com a mesma pausa noturna e as mesmas travas da D-0120, exceto as que só existem em plano.

## Escopo

- Migration 080 (aditiva): `night_pause_external_campaigns` (ID da campanha único, nome guardado, ligada, início e fim, quem criou, `deleted_at`) e `night_pause_external_runs` (mesmas colunas de `night_pause_runs`, ligada à campanha externa; `plan_code` guarda o nome usado nos textos). As duas campanhas do contrato entram ligadas (INSERT ... ON CONFLICT DO NOTHING numa tabela nova).
- `services/campaigns/nightPauseService.ts`: o ciclo trata planos e externas pelo mesmo caminho (`Src`/`Owner`):
  - pausa só se estiver ACTIVE na Meta no início da janela, nos primeiros 60 minutos; linha SKIPPED quando não está ativa;
  - campanha que também é de um plano fica com o plano (a lista não pausa; não dá para cadastrar; e se virar plano durante a noite, a volta é cancelada);
  - nunca duas noites para a mesma campanha (confere as duas tabelas);
  - reativa só a própria pausa, mesmo que a campanha tenha sido desligada ou tirada da lista durante a noite;
  - conferências da Meta: situação PAUSED, registro de atividades (mesma regra do app do token, D-0120) na campanha e nos conjuntos e anúncios dela (lidos na Meta, só leitura; se a leitura falhar, só a campanha), `updated_time` sem o registro, orçamento diário igual ao da pausa e limite de gastos: com `spend_cap` definido e `amount_spent` ≥ `spend_cap`, não reativa (vale também para planos);
  - fichas, decisões e registros sobre a campanha durante a noite cancelam a volta; não há conferências de plano (pausado pela tela, CAPPED, situação do plano);
  - trava no envio por direção (só status, só no ID da campanha; nunca conjunto ou anúncio), trava no banco pelo ID da campanha (`ext:<id>`), avisos e histórico como nos planos (fichas sem plano, `origin = NIGHT_PAUSE`).
- `MetaMutatingClient`: `readCampaignState` passa a trazer `spend_cap` e `amount_spent`; `readCampaignChildIds` (conjuntos e anúncios) e `readCampaignIdentity` (nome e conta), só leitura.
- Rotas (só ADMIN): `GET /api/night-pause/external` (lista, situação lida na Meta agora, últimas 3 noites), `POST` (adicionar pelo ID: confere na Meta que existe e é da conta `META_AD_ACCOUNT_ID`; recusa campanha de plano e protegida; adicionar de novo volta a mesma linha), `PATCH /:id` (ligada, início, fim; fim até 23:00) e `DELETE /:id` (tira da lista com `deleted_at`; as noites ficam).
- Tela: Campanhas → "Campanhas criadas fora do NORQVA — pausa noturna" (só ADMIN): nome, ID, situação na Meta, chave, horários, últimas 3 noites, "Tirar" com confirmação e "Adicionar pelo ID da campanha" (`frontend/src/features/campaigns/ExternalNightPause.tsx`).

## Testes

- Backend `norqva_0122_night_pause_external.test.ts` (Graph API simulada): migration com as duas campanhas; pausa e reativa só a própria (só status, nunca conjunto/anúncio); dono no Gerenciador (campanha ou conjunto) cancela; ficha ou decisão cancela; limite de gastos atingido não reativa; orçamento mudado não reativa; precedência do plano; desligada ou tirada da lista durante a noite ainda volta (e não pausa na noite seguinte); ciclo duplo e duas instâncias; reativada pelo dono depois de SKIPPED não é pausada; tolerância de 60 minutos; telas (só ADMIN, conta, ID inexistente, fim até 23:00, exclusão suave, adicionar de novo).
- Frontend `norqva_0122_external_night_pause.test.tsx`.

## Variáveis de ambiente

As mesmas da NORQVA-0120 (`NIGHT_PAUSE_ENABLED`, `META_MUTATION_ENABLED`, `META_AD_ACCOUNT_ID`, `META_APP_ID` opcional).

## Regras

Só situação PAUSED/ACTIVE da campanha. Nunca ativa o que não estava ativo no início da janela. Testes nunca falam com a Meta.
