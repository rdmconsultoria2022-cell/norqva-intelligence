# NORQVA-0147: atendente apresenta a opção recomendada primeiro e negrito do WhatsApp

**Branch:** `ai/NORQVA-0147-ordem-atendente` · **Tipo:** correção de erro (D-0037, sem aprovação) · **Risco:** LOW (só texto do prompt e formatação; pagamento e entrega intactos)

## Problema (29/10/2026 00h38)

No teste do Ricardo, com a Coleção Trattoria Completa (OFF-000016, `attendant_featured = TRUE`) e o kit OFF-000010 ATIVOS,
o atendente listou o kit de R$ 29,90 antes da coleção de R$ 47,00. O catálogo já vinha na ordem certa e marcado
[RECOMENDADO], mas a IA seguiu o nome que o cliente citou e as condições antigas ("kit primeiro"). Também mandou `**negrito**`,
que o WhatsApp mostra com os asteriscos.

## Correção

- `systemPrompt`: regra fixa 6b (ordem do catálogo: recomendado primeiro, alternativa depois, mesmo se o cliente citar a
  alternativa ou se as condições disserem outra ordem) e 6c (negrito com um asterisco). A regra não usa o texto "[RECOMENDADO]",
  para não aparecer no prompt quando não há destaque.
- `whatsappBold` em `splitReply`: troca `**x**` por `*x*` antes de enviar.

## Testes

`norqva_0147_ordem_atendente.test.ts`: regra presente antes das condições; conversão do negrito; `splitReply` converte.
Suíte local: mesmas falhas de ambiente de antes da mudança (nenhuma nova).

## Revisão independente

Subagente (29/10): nada bloqueante; aplicado `***x***` → `*x*`. Pix e arquivos saem pela fila, sem passar pela conversão.

## Execução

PR #196 mesclado em 29/10/2026 (CI verde). Deploy automático no Render.
