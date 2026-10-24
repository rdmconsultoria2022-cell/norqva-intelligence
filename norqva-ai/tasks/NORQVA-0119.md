# NORQVA-0119: Fábrica de Criativos (etapa B): nota de força estimada e resultados reais

**Branch:** `ai/NORQVA-0119-fabrica-analise` (a partir da `main` com a NORQVA-0118)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 23/10/2026 21h46 ("1 pode seguir, 2 aprovado"), contrato no Claude Docs "NORQVA-0118 — Fábrica de Criativos (fluxo único)", etapa B · **Risco:** LOW (só leitura; nada na Meta)

## Decisão

Ninguém de fora vê vendas, cliques ou gasto do anúncio de outra empresa. A Fábrica dá uma nota **estimada**, de 0 a 100, sempre com o motivo de cada ponto, e mostra números **reais** só da nossa campanha.

## Escopo

- Prints: a IA lê, quando aparece na Biblioteca de Anúncios da Meta, a data de "Veiculação iniciada em" e quantos anúncios usam o criativo (`structure.signals`). Os dias no ar são calculados no servidor; data futura, inválida ou anterior a 2010 e quantidade fora de 1 a 10000 são descartadas. Só nos prints (o link não tem esses dados). Não é texto da referência e a geração não usa os sinais.
- Nota (`services/creative/referenceScore.ts`, conta pura): tempo no ar até 40 (60+ dias 40, 30+ 32, 14+ 22, 7+ 12, menos 4), variações até 25 (10+ 25, 4+ 18, 2+ 10, 1 = 4), estrutura até 35 (página: gancho na abertura, dor, produto, prova, oferta, garantia, 2+ botões; anúncio: tipo de gancho, trecho de gancho, benefício/demonstração, prova, chamada, formato). 70+ forte, 40 a 69 média, abaixo fraca. Sem os prints da Biblioteca, vale só a estrutura e o resumo avisa. Vai junto da referência pronta (`score`) na lista e no detalhe.
- Tela: cartão da nota no passo 2 da Fábrica e no detalhe da referência; nota na lista "Em andamento".
- Passo 6: "Resultados reais" da campanha do plano (Investido, Vendas, Faturamento, Custo por venda com o equilíbrio da oferta, ROAS), mesma fonte da tela Campanhas, no período do topo.

## Testes

`backend/src/tests/norqva_0119_reference_score.test.ts`, `frontend/src/tests/norqva_0119_fabrica_analise.test.tsx`.
