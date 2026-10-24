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
  - conferências da Meta: situação PAUSED, registro de atividades (mesma regra do app do token, D-0120) na campanha e nos conjuntos e anúncios dela (lidos na Meta, só leitura; se a leitura falhar, não reativa naquele ciclo e tenta de novo), `updated_time` sem o registro, orçamento diário igual ao da pausa e limite de gastos: com `spend_cap` definido e o gasto da campanha nos insights (em reais) ≥ `spend_cap`, não reativa (vale também para planos; o objeto Campaign não tem `amount_spent`);
  - conta de anúncios: campanha que não é da conta `META_AD_ACCOUNT_ID` (lida em `account_id`) não é pausada (SKIPPED) nem reativada (planos e externas);
  - sem conseguir ler os conjuntos e anúncios da campanha externa, não reativa naquele ciclo e tenta de novo;
  - fichas, decisões e registros sobre a campanha durante a noite cancelam a volta; não há conferências de plano (pausado pela tela, CAPPED, situação do plano);
  - trava no envio por direção (só status, só no ID da campanha; nunca conjunto ou anúncio), trava no banco pelo ID da campanha (`ext:<id>`), avisos e histórico como nos planos (fichas sem plano, `origin = NIGHT_PAUSE`).
- Campanha ainda fora de `meta_campaigns` (a sincronização não trouxe): ao adicionar pela tela e a cada ciclo (antes de pausar, para as externas ligadas sem linha) o NORQVA grava uma cópia mínima lida na Meta (`MetaMutatingClient.ensureCampaignMirror`: id, nome, objetivo, situação, orçamentos em reais, conta configurada, `COMMERCIAL_PRODUCTION`), como a sincronização grava, sem nunca alterar linha existente (`ON CONFLICT DO NOTHING`); a sincronização não muda. Se não der (outra conta, campanha inexistente), grava o erro na linha (`mirror_error`), abre o aviso `NIGHT_PAUSE_MIRROR_FAILED` uma vez (na hora de adicionar ou no primeiro ciclo) e tenta de novo a cada hora.
- `MetaMutatingClient`: `readCampaignState` passa a trazer `spend_cap` e `account_id` (só campos que existem no objeto Campaign); `readCampaignChildIds` (conjuntos e anúncios) e `readCampaignIdentity` (nome e conta), só leitura.
- Rotas (só ADMIN): `GET /api/night-pause/external` (lista, situação lida na Meta agora, últimas 3 noites), `POST` (adicionar pelo ID: confere na Meta que existe e é da conta `META_AD_ACCOUNT_ID`; recusa campanha de plano e protegida; adicionar de novo volta a mesma linha), `PATCH /:id` (ligada, início, fim; fim até 23:00) e `DELETE /:id` (tira da lista com `deleted_at`; as noites ficam).
- Tela: Campanhas → "Campanhas criadas fora do NORQVA — pausa noturna" (só ADMIN): nome, ID, situação na Meta, chave, horários, últimas 3 noites, "Tirar" com confirmação e "Adicionar pelo ID da campanha" (`frontend/src/features/campaigns/ExternalNightPause.tsx`).

## Revisão independente (aplicada)

- `amount_spent` não existe no objeto Campaign (confirmado na Meta: erro #100): saiu da leitura; o limite usa o gasto dos insights. Os simulados da Graph API dos testes 0120 e 0122 recusam campo inexistente no objeto Campaign com o mesmo erro #100.
- Conta de anúncios conferida em todas as campanhas (planos e externas), na pausa e na volta.
- Sem conjuntos/anúncios lidos, não reativa naquele ciclo (tenta de novo).
- Adicionar de novo: volta ligada, com o horário pedido ou o padrão; registro e mensagens a partir da linha gravada.
- Avisos das externas sem código de plano (abrem a seção "Campanhas criadas fora do NORQVA"); `NIGHT_PAUSE_MIRROR_FAILED` se resolve sozinho quando a linha em `meta_campaigns` existe.
- Tela explica que desligar ou tirar da lista à noite não impede a volta daquela noite; situação na Meta guardada por 60 s na tela.

## Testes

- Backend `norqva_0122_night_pause_external.test.ts` (Graph API simulada): migration com as duas campanhas; pausa e reativa só a própria (só status, nunca conjunto/anúncio); dono no Gerenciador (campanha ou conjunto) cancela; ficha ou decisão cancela; limite de gastos atingido não reativa; orçamento mudado não reativa; precedência do plano; desligada ou tirada da lista durante a noite ainda volta (e não pausa na noite seguinte); ciclo duplo e duas instâncias; campanha fora de `meta_campaigns` antes do primeiro ciclo é copiada e pausada; cópia impossível avisa uma vez e não pausa; reativada pelo dono depois de SKIPPED não é pausada; tolerância de 60 minutos; telas (só ADMIN, conta, ID inexistente, fim até 23:00, exclusão suave, adicionar de novo).
- Frontend `norqva_0122_external_night_pause.test.tsx`.

## Variáveis de ambiente

As mesmas da NORQVA-0120 (`NIGHT_PAUSE_ENABLED`, `META_MUTATION_ENABLED`, `META_AD_ACCOUNT_ID`, `META_APP_ID` opcional).

## Regras

Só situação PAUSED/ACTIVE da campanha. Nunca ativa o que não estava ativo no início da janela. Testes nunca falam com a Meta.
