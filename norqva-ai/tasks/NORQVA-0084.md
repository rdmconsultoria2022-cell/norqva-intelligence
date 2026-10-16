# NORQVA-0084: Teto dos Experimentos no Design System NORQVA Premium (fase 4, etapa 3) + fonte Inter

**Branch:** `ai/NORQVA-0084-teto-premium` (a partir da `main`, depois da NORQVA-0083)
**Executor:** Claude · **Revisão:** revisão independente (subagente) + CI · **Merge:** só com o "sim" do Ricardo depois das capturas
**Autorização:** Ricardo, 16/10/2026 17h59 ("Sim", para começar o Teto e a fonte Inter). · **Risco:** LOW (só apresentação)

## Escopo

- `ExperimentGuardCard`: para cada experimento, gasto em destaque ("R$ X de R$ Y"), porcentagem, barra de consumo, saldo até o teto, hora da última leitura na Meta, situação do vigia; o **teto do NORQVA** (onde o vigia pausa) separado do **limite aplicado na Meta**; vendas e lucro da campanha; regras do vigia numa área que abre ao tocar; edição com campos de 44 px.
- Visão Geral: o quadro do teto passa a ser o próprio cartão (antes havia uma lista própria + o cartão recolhido).
- Aba "Teto e vigia" da campanha: texto curto; as regras ficam no cartão.
- Fonte Inter carregada só no painel (`AppShell`), não nas páginas de venda.
- Atalhos da área no celular com 40 px de altura.

## Regras respeitadas

Cálculos, chamadas, validações e confirmações do teto iguais (baixar salva na hora; subir depois do Sim pede código e motivo; teto máximo e lucro iguais). Nenhuma rota, regra ou permissão mudou.
