# NORQVA-0041: o comprador escolhe as parcelas no cartão, e a tela de pagamento no visual do produto

**Branch:** `ai/NORQVA-0041-parcelas-cliente` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** Ricardo, 10/10/2026 18h10 ("Aprovado"), contrato NORQVA-0041 no Claude Docs · **Risco:** MEDIUM (pagamento)

## Motivo

O cartão saía sempre em 4x. O Ricardo quer que o comprador escolha: até 4x sem juros (o vendedor paga), acima disso com juros repassados ao comprador. A tela de pagamento (escura, "tecnológica") deve ter o visual do produto.

## Escopo

- Oferta ganha `card_free_installments` (parcelas sem juros) e `card_interest_monthly` (% ao mês acima delas). Juros pela Tabela Price, parcela mínima R$ 5,00, parcela arredondada para cima e total = parcela × N.
- O servidor recalcula as parcelas e o total; nunca aceita valor do navegador. Parcela inválida: 400 `INVALID_INSTALLMENTS`.
- `payments.card_interest_applied` registra se a cobrança teve juros.
- Migration 055 (aditiva): colunas novas; kit OFF-000006 fica com até 12x, 4x sem juros, 2,99% a.m. (só se houver exatamente uma oferta OFF-000006 real com cartão; registra OFFER_CARD_PLAN ou OFFER_CARD_PLAN_SKIPPED).
- Checkout: lista de parcelas ("5x de R$ 6,11 com juros (total R$ 30,55)") e aviso dos juros.
- Tela de pagamento: visual creme/terracota com títulos serifados no kit e no Trattoria (o Bolso Blindado continua escuro); mostra "sem juros" ou "com juros".
- Editor da oferta: máximo de parcelas, sem juros até, juros ao mês e prévia das opções.
- Página do kit: "ou em até 6x com juros".

## Kit (R$ 27,96 no cartão)

1x a 4x: total R$ 27,96 (4x de R$ 6,99) · 5x de R$ 6,11 (R$ 30,55) · 6x de R$ 5,16 (R$ 30,96) · 7x ou mais: parcela abaixo de R$ 5,00, não aparece.

## Testes

`backend/src/tests/norqva_0041_installments.test.ts` e `frontend/src/tests/norqva_0041_installments.test.tsx`.
