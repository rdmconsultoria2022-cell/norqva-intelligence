# NORQVA-0086: Inteligência (Resultados e Pesquisa) no Design System NORQVA Premium (fase 4, etapa 5)

**Branch:** `ai/NORQVA-0086-inteligencia-premium` (a partir da `main`, depois da NORQVA-0085)
**Executor:** Claude · **Revisão:** revisão independente (subagente) + CI · **Merge:** só com o "sim" do Ricardo depois das capturas
**Autorização:** Ricardo, 16/10/2026 ("Pode começar"). · **Risco:** LOW (só apresentação)

## Escopo

- Resultados e Pesquisa: título no padrão, abas em botões arredondados (role="tab" mantido).
- Financeiro: novo `dashboard/FinancialResults.tsx` com os MESMOS números que o DashboardView já calculava de `/financial/dashboard` (6 indicadores, conciliação recolhível, por produto, atribuição por campanha/conjunto/anúncio, origem da receita). No celular as tabelas viram listas; no computador continuam tabelas.
- Criativos, Público, Crédito Meta e Decisões: cores e tamanhos nos tokens `nq-*`, listas no celular (criativos e faixas etárias), títulos em caixa normal.
- Pesquisa (Base, Seleção automática, Mercado europeu, Time de IAs, Critérios, Histórico): tokens, listas no celular (Base e Seleção), botões e campos com 44 px.

## Correções de exibição (sem mudar regra)

- Criativos mostrava um nome de campanha fixo ("NORQVA_TRATTORIA_REVENUE_V1") que não vinha do servidor: removido.
- Financeiro mostrava "Conciliado 100%" sempre; agora segue `reconciliation.isReconciled`.
- Campanha/anúncio sem situação aparecia como "ACTIVE"; agora aparece "—".
- Selo "Commerce: Pré-produção" (falso) e "MODO REAL" saíram da aba Financeiro.

## Regras respeitadas

Mesmas chamadas e mesmos parâmetros; nenhuma fórmula nova; ações protegidas (enviar ao Time de IAs, validar critérios, aprovar plano, importar histórico) continuam com os mesmos handlers e o mesmo controle de perfil.

## Testes

`dashboard.test.tsx`: valor negativo no formato brasileiro (-R$ 304,44) e sem os selos removidos.
