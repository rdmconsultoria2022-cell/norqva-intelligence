# NORQVA-0137: Mandato de operação das campanhas Trattoria (Claude como operador)

**Branch:** `ai/NORQVA-0137-mandato-operacao` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** depois do CI verde e da revisão
**Autorização:** contrato "NORQVA-0136 — Operação autônoma das campanhas Trattoria", aprovado pelo Ricardo em 26/10/2026 14h21 · **Risco:** HIGH (mexe em gasto na Meta)

## Contexto

O Claude vai operar as campanhas da Trattoria em sessões agendadas (9h, 15h e 21h de Brasília). Os limites do contrato precisam valer no servidor: mesmo que o agente erre, o NORQVA não deixa passar.

## O que foi feito

### Regras do mandato (servidor, `services/operator/mandateService.ts`)

- **Capital:** R$ 1.500 em até 21 dias a partir da ativação.
- **Teto diário:** a soma dos orçamentos diários que podem gastar (campanha ativa; orçamento da campanha ou dos conjuntos ativos) fica em até R$ 100. Vale para ativar e para subir orçamento.
- **CPA máximo por oferta:** preço (promocional, se houver) − 6% de imposto − R$ 1,99 de tarifa. Ex.: R$ 29,90 → R$ 26,12; R$ 47 → R$ 42,19; R$ 19,90 → R$ 16,72. Imposto e tarifa mudam por `OPERATOR_TAX_PCT` e `OPERATOR_FIXED_FEE_BRL`.
- **Freio** (pausa todas as campanhas do mandato, mandato fica "Freio acionado", aviso crítico na central):
  - gasto desde a ativação ≥ R$ 750 sem nenhuma oferta com 5 vendas pagas e CPA dentro do máximo; ou
  - resultado acumulado (receita líquida das vendas pagas atribuídas − gasto) ≤ −R$ 750; ou
  - capital esgotado (gasto ≥ R$ 1.500).
  - No fim do prazo: pausa tudo e encerra.
  - Roda a cada 15 min no servidor e antes de toda escrita do operador.
- **Subir orçamento:** só com 48 h desde a última subida no mesmo objeto, no máximo +20% e com a campanha tendo 5 vendas pagas nos últimos 3 dias com CPA até 80% do CPA máximo da oferta. **Baixar:** sempre (de dia).
- **Das 22h às 8h (Brasília):** só pausar.
- **Pausar:** sempre, nas campanhas do mandato (mesmo com freio ou mandato encerrado). **Ativar:** só objetos das campanhas do mandato, com o mandato ativo e sem freio.
- **Só a lista:** o operador só toca campanhas (e conjuntos e anúncios delas) cadastradas no mandato.
- **Sem leitura da Meta, só pausar:** se o gasto não pode ser lido, ativar e mudar orçamento são recusados.

### Como as alterações vão para a Meta

- Pela ficha de alteração de sempre (`meta_change_requests`, origem `OPERATOR` ou `MANDATE_BRAKE`), que usa as rotas de controle existentes (chave geral, credencial, registro de decisão, escopo, teto, Sim do plano, código do plano pausado) e só confirma relendo a Meta. A pausa noturna enxerga essas fichas e não reativa por cima.
- Toda ação (feita, recusada ou com falha) fica em `operator_mandate_actions`.

### Números (honestos)

- Gasto, impressões, cliques e conversas: Meta, ao vivo.
- Vendas e receita: só pedidos PAID com pagamento confirmado pelo Asaas, atribuídos à campanha (código do plano no `utm_campaign`, ID do anúncio ou ID/nome da campanha pelo resolvedor de atribuição). Receita líquida = valor − 6% − tarifa real do Asaas (ou R$ 1,99 se ainda não veio).
- A oferta de cada campanha é a definida no mandato; sem ela, a mais vendida pela campanha.

### Rotas

Operador (só com `NORQVA_OPERATOR_TOKEN`, cabeçalho `Authorization: Bearer <token>` ou `x-norqva-operator: <token>`; só em `/api/operator/*`; 30 chamadas por minuto; sem a chave no servidor responde 503 "Operador desligado"):

- `GET /api/operator/mandate`: situação, capital, gasto, quanto falta, resultado, freio, dias restantes, campanhas e ofertas.
- `GET /api/operator/report?days=N`: por campanha, conjunto e anúncio, por dia e por hora do dia: gasto, impressões, cliques, conversas (Meta), vendas pagas e receita líquida (Asaas), CPA contra o CPA máximo.
- `POST /api/operator/:tipo/:id/status` `{status}` e `POST /api/operator/:tipo/:id/budget` `{daily_budget_brl}`, com as regras acima e recusa em português.

Administrador (login normal, só ADMIN): `GET/POST /api/mandate`, `PUT /api/mandate/campaigns`, `POST /api/mandate/end` (`{confirm: "ENCERRAR"}`), `POST /api/mandate/check`, `GET /api/mandate/actions`.

### Tela

Campanhas → cartão "Mandato de operação (Claude)" (só ADMIN): situação, capital usado, resultado, orçamento do dia, freio, lista de campanhas, "Conferir agora", "Editar campanhas", "Ativar mandato" e "Encerrar mandato" (pede ENCERRAR; pausa as campanhas do mandato). Avisos do mandato abrem esse cartão.

### Banco

Migration 085 (só aditiva): `operator_mandates`, `operator_mandate_campaigns`, `operator_mandate_actions`.

## Variáveis de ambiente

- `NORQVA_OPERATOR_TOKEN` (obrigatória para ligar o operador; mínimo 32 caracteres; sem ela, 503).
- `OPERATOR_TAX_PCT` (padrão 0.06) e `OPERATOR_FIXED_FEE_BRL` (padrão 1.99), opcionais.
- Continua valendo `META_MUTATION_ENABLED` e o teto por objeto `META_MAX_DAILY_BUDGET_BRL`.

## Testes

`backend/src/tests/norqva_0137_operator_mandate.test.ts` (Meta simulada): token (sem chave, sem token, token errado, token não abre outras rotas), CPA máximo, teto diário, +20%/48 h, critério de lucro, janela da noite, campanha fora do mandato, freio pausando e recusando ativar, prejuízo pelo agendador, leitura da Meta falhando, encerrar, editar lista. `frontend/src/tests/norqva_0137_operator_mandate.test.tsx`: cartão.

## Revisão independente (aplicada)

- **Orçamento total ou desconhecido:** se uma campanha ativa (ou um conjunto ativo) do mandato usa orçamento total ou está sem orçamento diário no NORQVA, a soma do teto diário não pode ser conferida: ativar e subir orçamento são recusados com o motivo (antes contava como zero).
- **Corrida:** com a trava do mandato, o servidor relê a situação do mandato e a lista antes de ativar ou mudar orçamento. Freio, prazo ou administrador que mudaram algo no meio barram a escrita.
- **Tirar da lista não devolve capital:** o gasto conta para todas as campanhas que já estiveram no mandato, de quando entraram até quando saíram (ou até agora). Campanha tirada e posta de volta conta desde a primeira entrada (mais conservador).
- **Campanha de plano pausada pelo operador:** a pausa marca o plano como "pausado pela tela" e reativar pedia o código do plano. Agora o operador reativa sem o código **só** quando a campanha está num mandato ativo (o mandato aprovado pelo Ricardo é a autorização). Pela tela continua pedindo o código.
- **Aviso de leitura falhando:** abre a partir da 3.ª falha seguida (antes só exatamente na 3.ª).

## Limites conhecidos

- O gasto "desde a ativação" conta o dia inteiro da ativação (a Meta soma por dia).
- Campanha precisa estar sincronizada no NORQVA (`meta_campaigns`) para entrar no mandato e ser pausada.
- Pedido sem origem ou com origem ambígua não conta como venda da campanha (mais conservador).
- Ativar um conjunto pausado com orçamento alto só é limitado pelo teto diário de R$ 100 (a regra de +20% vale para subir orçamento, não para ativar).
- A Meta pode gastar até cerca de 75% acima do orçamento diário num dia. O teto diário limita orçamento, não o gasto do dia: a trava firme é o freio, conferido a cada 15 min.
- Das 22h às 8h também baixar orçamento é recusado (só pausar). Mantido de propósito: pausar já reduz o gasto.
