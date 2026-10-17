# NORQVA-0097: alterações com confirmação da Meta (etapa 4 do Centro de Controle)

**Branch:** `ai/NORQVA-0097-alteracoes-confirmadas` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** com o "sim" do Ricardo
**Autorização:** Ricardo, 16/10/2026 23h32 ("Aprovado"), contrato no Claude Docs "NORQVA-0097 — Contrato: alterações com confirmação da Meta" · **Risco:** MEDIUM (pausa e orçamento na Meta)

## O que muda

- Pausar, reativar e orçamento diário viram **fichas** (`meta_change_requests`, migration 072, só aditiva): Aguardando aprovação, Enviando à Meta, Confirmado pela Meta, Aguardando conferência, Falhou, Recusado, Cancelado, Expirou.
- **Confirmado pela Meta** só depois de reler o objeto na Meta (`MetaMutatingClient.readEntity`, GET `/{id}?fields=status,effective_status,daily_budget`). Aceito e ainda não visto = Aguardando conferência; a lista confere de novo sozinha (até 3 por vez, a cada 2 min) e há "Conferir agora".
- **O envio reaproveita as rotas de controle existentes** (`setMetaEntityStatus`, `setMetaEntityDailyBudget`) por dentro: mesmas travas (chave geral, credencial, registro de decisão, escopo, teto, Sim, código do plano pausado, limite de orçamento).
- **Sem repetição:** o id da ficha vem da tela; o mesmo pedido de novo devolve a ficha sem enviar.
- **Permissões:** Administrador pede e autoriza no mesmo passo. Performance pausa direto (só reduz gasto); reativar e orçamento de Performance esperam o administrador por 24 h (depois Expirou). Os demais perfis só veem.
- **Revisão de orçamento:** hoje, novo, diferença por dia, exposição em 30 dias e, na campanha, em quantos dias o teto chega; aumento pede a caixa "Aumentar o gasto em R$ X por dia".
- **Tela:** Histórico da campanha mostra as fichas (com Autorizar/Recusar para o administrador e Conferir agora); a lista de Campanhas mostra "Pedidos esperando sua autorização" para o administrador.

## Rotas

`GET /api/meta-changes` (todos), `POST /api/meta-changes` (Administrador, Performance), `POST /api/meta-changes/:id/approve` e `/reject` (Administrador), `/cancel` e `/verify` (Administrador, Performance). `GET /api/meta-control/status` passa a aceitar Performance.
