# NORQVA-0096: Gerenciar campanha (etapa 3 do Centro de Controle)

**Branch:** `ai/NORQVA-0096-gerenciar-campanha` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** com o "sim" do Ricardo
**Autorização:** Ricardo, 16/10/2026 23h12 ("Sim" à etapa 3 do diagnóstico NORQVA-0093 no Claude Docs) · **Risco:** LOW (reorganiza a tela; só leituras novas no servidor; nenhuma ação nova na Meta)

## O que muda

- A campanha abre na **Visão geral** e tem cinco abas: Visão geral, Configurações, Criativos, Resultados, Histórico (antes: Configuração, Resultado e controle, Teto e vigia, Método, Experimento). Qualquer configuração fica a dois toques da lista.
- **Pausar campanha** sempre no topo (só administrador), com a mesma confirmação e as mesmas travas de Resultados (reativar plano pausado pela tela pede o código, NORQVA-0094).
- **Visão geral:** situação na Meta, orçamento, teto, última leitura do gasto, Investido, Receita, Vendas, CPA, ROAS; **rentabilidade** (líquido por venda, CPA máximo, ROAS de equilíbrio, margem estimada) e as pendências desta campanha. O ROAS fica verde só acima do ROAS de equilíbrio.
- **Configurações:** orçamento por conjunto, teto, hipótese, Preencher/Zerar/Voltar ao automático, Criar na Meta (pausada), Teto e vigia, Método e Experimento (recolhidos).
- **Criativos:** os anúncios (criativo, texto, título, botão, link) e "Editar anúncio na Meta".
- **Resultados:** o antigo Resultado e controle (pausar e orçamento por conjunto).
- **Histórico:** alterações, decisões e falhas da campanha, do mais novo ao mais antigo. Decisões (registro forense) só para administrador, sem IP nem navegador.

## Servidor (só leitura)

- `GET /api/campaigns/:id/economics`: oferta do plano, preço, líquido por venda, CPA máximo e ROAS de equilíbrio pelos custos cadastrados na oferta (`offer_unit_economics`); sem cadastro, estimativa do vigia (6% + R$ 1,99) marcada como estimada.
- `GET /api/campaigns/:id/history`: `audit_logs` que citam o código do plano ou os IDs da Meta dele; para ADMIN também `decision_events` do plano (sem a fase REQUESTED).
- `services/campaigns/campaignInsightService.ts`. Sem migration.
