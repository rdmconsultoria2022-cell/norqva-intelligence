# NORQVA-0120: Pausa noturna (00h–06h, horário de Brasília)

**Branch:** `ai/NORQVA-0118-pausa-noturna` (nome mantido: a PR já estava aberta antes da renumeração para 0120)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** só depois do CI verde e da revisão (não mesclado nesta tarefa)
**Autorização:** contrato aprovado pelo Ricardo em 23/10/2026 21h22 ("Pausa noturna") · **Risco:** MEDIUM (pausa e reativa campanhas na Meta; nunca cria, nunca muda orçamento nem teto)

## Decisão

D-0120. Todo dia, no horário de Brasília, o NORQVA pausa na Meta, no início da janela (padrão 00:00), cada campanha ATIVA de plano com a pausa noturna ligada e grava que foi ele quem pausou. No fim da janela (padrão 06:00) reativa só o que ele mesmo pausou e que continuou pausado, sem ninguém mexer. Servidor fora às 06:00: reativa quando voltar, até 23:59 do mesmo dia.

## Escopo

- Migration 079 (aditiva):
  - `launch_plans.night_pause_enabled` (padrão ligado: vale para as duas campanhas ativas hoje e para as novas), `night_pause_start` ('00:00') e `night_pause_end` ('06:00');
  - `meta_change_requests.origin` ('NIGHT_PAUSE' nas fichas da pausa noturna);
  - `night_pause_runs`: uma linha por campanha e por noite (chave única `meta_campaign_id` + `night_date`), com a situação (SKIPPED, PAUSING, PAUSED, PAUSE_UNCONFIRMED, PAUSE_FAILED, REACTIVATING, REACTIVATED, RESUME_UNCONFIRMED, RESUME_FAILED, CANCELLED, EXPIRED), o retrato do momento da pausa (orçamento na Meta, `updated_time` da Meta, orçamento e teto do plano) e as fichas de pausa e reativação.
- `services/campaigns/nightPauseService.ts`:
  - hora de Brasília calculada com `Intl` e `America/Sao_Paulo` (`spClock`), sem depender do fuso do servidor;
  - **pausar** (com `NIGHT_PAUSE_ENABLED=true` e `META_MUTATION_ENABLED=true`): planos ACTIVE/APPROVED, pausa noturna ligada, fora do teto (não CAPPED), não pausados pela tela, campanha fora da lista protegida (CONTROL), dentro da janela e sem linha nesta noite. Relê a Meta: só pausa se estiver ACTIVE; senão grava SKIPPED (e de manhã nada volta). Pausa com registro de decisão `NIGHT_PAUSE` (reduz exposição), ficha "Pausa noturna" (`meta_change_requests`, origem NIGHT_PAUSE) e releitura: PAUSED = "Confirmado pela Meta";
  - **reativar** (sempre, mesmo com a chave desligada, para nada ficar pausado sem volta): só linhas PAUSED/PAUSE_UNCONFIRMED da data de hoje com a hora do fim já passada. Cancela e registra (com aviso) se: plano saiu de ACTIVE/APPROVED; pausado pela tela; vigia parou no teto (CAPPED); teto ou orçamento do plano mudou; outra ficha de alteração, outra decisão ou registro de alteração (status, orçamento, teto, troca de peça, término) no plano ou nos objetos dele depois da pausa; na Meta não está PAUSED; `updated_time` ou orçamento da campanha mudou na Meta (mexeram no Gerenciador); gasto chegou ao teto do plano ou ao limite de gastos da campanha na Meta. Reativar usa registro de decisão `NIGHT_PAUSE_RESUME` (sem registro, não reativa e tenta de novo), ficha "Fim da pausa noturna" e releitura;
  - leitura da Meta falhou de manhã: tenta de novo nos ciclos seguintes (aviso na 3.ª falha); passou de 23:59: EXPIRED, registro e aviso crítico;
  - envio interrompido (servidor caiu no meio, mais de 5 min em PAUSING/REACTIVATING): a releitura decide;
  - trava no envio (`statusOnlyGuard`, numa cópia do cliente): cada POST só pode ter um campo, `status` = PAUSED ou ACTIVE, e só no ID da campanha;
  - nunca cria campanha, nunca muda orçamento nem teto.
- `MetaMutatingClient.readCampaignState` (só leitura): status, orçamento diário e `updated_time` da campanha.
- Agendador no próprio servidor (`startNightPauseScheduler` em `index.ts`): ciclo a cada 2 minutos (primeiro 30 s depois de subir), um ciclo por vez. Duas instâncias ou reinício não repetem nada: a linha da noite é criada com `ON CONFLICT DO NOTHING` (só uma instância pausa) e a reativação é tomada com `UPDATE ... WHERE state = ...` (só uma reativa).
- Central de pendências: avisos `NIGHT_PAUSE_PAUSE_FAILED`, `NIGHT_PAUSE_RESUME_FAILED`, `NIGHT_PAUSE_RESUME_CANCELLED` e `NIGHT_PAUSE_EXPIRED` (de campanha, como os do vigia); os três últimos se resolvem sozinhos quando a campanha volta a ficar ativa.
- Histórico da campanha: "Pausa noturna" e "Fim da pausa noturna" nas fichas (com "Confirmado pela Meta") e nos registros (`NIGHT_PAUSE_DONE`, `NIGHT_PAUSE_RESUMED`, cancelamentos e falhas).
- Rotas: `GET /api/campaigns/:id/night-pause` (leitura, mesmos perfis de Campanhas) e `POST` (só ADMIN; `enabled`, `start`, `end`; janela no mesmo dia, início antes do fim). Salvar não fala com a Meta e vale a partir da próxima janela (a noite em curso usa o horário gravado na pausa).
- Tela: Gerenciar campanha → Configurações → "Pausa noturna (00h–06h)": chave, horários (HH:MM), aviso quando a chave geral está desligada e as últimas noites.

## Revisão independente (aplicada)

- Pausa com resposta perdida (tempo esgotado, 5xx, rede, limite de chamadas): relê a Meta. PAUSED = pausa nossa normal; ACTIVE = falhou (aviso "segue ativa"); sem leitura = aguardando conferência, o próximo ciclo relê. Falha antes do envio ou recusa clara da Meta = falhou.
- Reativar tenta de novo: falha antes do envio (credencial, trava, objeto não sincronizado) e resposta perdida com a Meta ainda PAUSED voltam para a fila; resposta perdida com ACTIVE = reativada (confirmada); recusa clara (permissão, parâmetro) = definitivo com aviso. Até 5 tentativas, com no mínimo 4 minutos entre elas, até 23:59, refazendo todas as conferências; aviso na 3.ª falha.
- Os registros genéricos do cliente da Meta (`META_*_STATUS_CHANGED`, `META_MUTATION_FAILED`) não contam como "alguém mexeu" (a própria pausa noturna também os escreve): mudanças de outras pessoas e rotinas do NORQVA aparecem como decisão ou ficha, que são conferidas.
- Trava do plano no banco (`pg_advisory_lock`, `services/campaigns/planLock.ts`) em volta da decisão e do envio da reativação; o vigia (pausar e marcar CAPPED) e o registro da pausa pela tela usam a mesma trava. O plano é relido logo antes do envio. Depois do envio, se o plano mudou ou apareceu decisão/ficha/registro desde o início da tentativa, pausa de novo na hora e abre aviso crítico `NIGHT_PAUSE_RACE`.
- Vigia: campanha parada pela pausa noturna (pausando, pausada, reativando) não vira CAPPED pelo atalho "já não está ativa"; de manhã a pausa noturna não reativa com o teto atingido e, reativada, o próximo ciclo do vigia decide como sempre.
- Fim da janela no máximo às 23:00 (servidor e tela). Pausa só nos primeiros 60 minutos da janela; planos pausados pela tela, parados no teto ou inativos ganham a linha SKIPPED no início, então reativar no meio da noite não é pausado.
- Gerenciador: lê o registro de atividades da conta (`GET /act_X/activities`, campos `event_type,event_time,object_id,object_type,actor_id,application_id`, `since`/`until`) e cancela se houver evento na campanha, nos conjuntos (inclusive orçamento ABO) ou nos anúncios que não seja do NORQVA. O token pode ser do próprio dono, então o usuário (`actor_id`) não identifica o NORQVA: "nosso" é só evento do app a que o token pertence (`GET /app`, guardado 12 h; `META_APP_ID` tem prioridade) ou, em evento sem app (ou com o app desconhecido), a própria mudança de situação da campanha até 2 minutos antes/depois do nosso envio. Todo o resto conta como mexido. Sem o registro, compara os instantes de `updated_time`. Antes e depois ficam na linha (`meta_updated_time_at_pause`/`_at_resume`, `activity_check`: CLEAN, CLEAN_NO_APP, TOUCHED, UNAVAILABLE).
- `quiet_since` nunca é sobrescrito; cada etapa e cada linha do ciclo têm o próprio tratamento de erro; o cliente de pausar só aceita PAUSED e o de reativar só ACTIVE; conferências pendentes de dias anteriores são fechadas.

## Variáveis de ambiente

- `NIGHT_PAUSE_ENABLED` (nova): `true` liga as pausas novas. Qualquer outro valor (ou ausente) = nenhuma pausa nova; o que já foi pausado volta de manhã normalmente.
- `META_MUTATION_ENABLED`: desligada, não pausa e não reativa (a reativação fica esperando até 23:59; depois vira EXPIRED com aviso).
- `PROTECTED_META_IDS`: campanhas protegidas nunca são tocadas.
- `META_APP_ID` (opcional): app do NORQVA no registro de atividades; sem ela, o app é lido do próprio token (`GET /app`).

## Para ligar em produção (com o Ricardo)

1. Mesclar (deploy no Render; a migration 079 liga a pausa noturna em todos os planos, mas nada acontece sem a chave).
2. Definir `NIGHT_PAUSE_ENABLED=true` no Render.
3. Na primeira noite, conferir no Histórico das duas campanhas "Pausa noturna — Confirmado pela Meta" e, de manhã, "Fim da pausa noturna — Confirmado pela Meta".

## Fica para depois (contrato futuro)

- Orçamento por hora (mudar orçamento ao longo do dia).
- Reanálise da janela quando a campanha passar de 100 vendas (comparar vendas e custo por hora antes de manter 00h–06h).

## Regras

Só situação PAUSED/ACTIVE da campanha. Nunca ativa o que não estava ativo à meia-noite. Testes com a Graph API simulada (`norqva_0120_night_pause.test.ts`, servidor em UTC) e a tela (`frontend/src/tests/norqva_0120_night_pause.test.tsx`).
