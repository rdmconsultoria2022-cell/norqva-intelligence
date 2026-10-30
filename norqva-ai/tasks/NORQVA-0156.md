# NORQVA-0156: ajustar os números do mandato em vigor (escala 10x do CR-000012)

**Branch:** `ai/NORQVA-0156-escala-mandato` · **Decisão:** D-0156 · **Autorização:** Ricardo, "Aprovado (Recomendado)", 30/10/2026 14h1x · **Risco:** MEDIUM (mexe no limite de gasto; não pausa, não ativa e não muda orçamento por si)

## Escopo

- `MandateService.updateLimits` + `PUT /api/mandate/limits` (ADMIN, `confirm: "AJUSTAR"`): capital, teto diário, término (`ends_at`, depois de agora e até 90 dias da ativação) e freio (gasto e prejuízo) do mandato ATIVO, sem encerrar (encerrar pausa as campanhas). Campo ausente mantém o valor. Mandato BRAKED ou ENDED: 409.
- Registro em `audit_logs` (`OPERATOR_MANDATE_LIMITS`, de/para) e em `operator_mandate_actions` (`LIMITS`).
- Regras de subida (+20%, 48 h, vendas, noite) intactas.

## Testes

`norqva_0137_operator_mandate.test.ts`: sem confirmação 400; token do operador não ajusta; fora do limite 400; ajuste para R$ 5.000 / R$ 500 / 14 dias; nada pausado; ativar conjunto que antes estourava o teto passa; histórico LIMITS gravado.

## Revisão independente

(preencher)

## Execução

(preencher)
