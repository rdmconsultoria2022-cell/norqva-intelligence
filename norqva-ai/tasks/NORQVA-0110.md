# NORQVA-0110: vendas da Kiwify em Vendas e Financeiro

**Branch:** `ai/NORQVA-0110-kiwify-vendas` (a partir da `main`)
**Autorização:** Ricardo, "Aprovado" em 21/10/2026 20h52 (Claude Docs "NORQVA-0107 a 0109 — Contrato", seção "Proposta pendente — vendas da Kiwify no NORQVA"). **Risco:** MEDIUM (dados de venda e de clientes; não mexe em Asaas, entrega nem Meta).

## Problema

O "Desafio Seca Barriga" é vendido na Kiwify, não no Asaas. A campanha "NQ – Seca Barriga – Teste – Vendas" já aparece no NORQVA, mas as vendas não: Vendas e Financeiro só conheciam pedidos do Asaas, então a campanha aparecia com gasto e sem receita.

## Como funciona

- **Webhook:** `POST /api/webhooks/kiwify?signature=<hex>` (público). A Kiwify assina o corpo original com HMAC-SHA1 usando o token do webhook; o NORQVA confere em tempo constante antes de ler qualquer coisa. Sem `KIWIFY_WEBHOOK_TOKEN` no Render: 503 e nada gravado. Assinatura ausente ou errada: 401. JSON quebrado: 400.
- **Eventos:** compra aprovada → venda `PAID` (bruto = `Commissions.charge_amount`/100, líquido = `my_commission`/100, tarifa = `kiwify_fee`/100 ou bruto − líquido). Reembolso → `REFUNDED`; chargeback → `CHARGEBACK`. Pix/boleto gerado, recusada e outros: 200 "ignorado". Repetir o evento não duplica, e venda estornada nunca volta para paga.
- **Tabela nova `external_sales`** (migration 074, só aditiva): uma linha por pedido da Kiwify, com UTMs, nome e e-mail do comprador. Sem CPF, telefone, endereço, IP ou cartão (também tirados do evento guardado em `raw_event`).
- **Financeiro:** venda paga conta como pedido pago e receita bruta; reembolsada/contestada entra em estornos, fora da receita. Tarifa da Kiwify entra em "tarifas". Campanha: `utm_campaign` igual ao nome da campanha da Meta; criativo: `utm_content` igual ao nome do anúncio nessa campanha. Sem campanha com esse nome: "sem atribuição". Mesmo período (data da aprovação) e mesmo início da operação dos outros pedidos. Quebra por produto: soma no produto de mesmo nome ou ganha linha própria. Gráfico por dia da Visão Geral também soma.
- **Vendas:** a venda aparece na lista com a etiqueta "Kiwify", produto, valor, data e situação (Pago, Estornado, Contestado). Sem "Reenviar acesso", "Copiar link" ou "Conferir pagamento": a entrega é da Kiwify.
- Auditoria: `KIWIFY_SALE_RECORDED` e `KIWIFY_SALE_REFUNDED` (sem e-mail no texto).

## Configurar (Ricardo)

1. Na Kiwify: Apps → Webhooks → criar webhook com a URL `https://norqva-staging-api.onrender.com/api/webhooks/kiwify`, produto "Desafio Seca Barriga" e gatilhos **Compra aprovada** (compra_aprovada), **Compra reembolsada** (compra_reembolsada) e **Chargeback**. Copiar o token que a Kiwify mostra.
2. No Render (API): variável `KIWIFY_WEBHOOK_TOKEN` = esse token.
3. Opcional: `KIWIFY_PRODUCT_IDS` = código(s) do produto na Kiwify, separados por vírgula, para aceitar só esses produtos (o botão de teste da Kiwify manda um produto de exemplo).

## Arquivos

`services/commerce/kiwifySales.ts`, `controllers/kiwifyController.ts`, `services/finance/externalSalesFinance.ts` (novos); `index.ts` (rota e corpo original), `controllers/api.ts` (Financeiro e série diária), `services/salesService.ts`, migration 074, `frontend/src/features/sales/SalesView.tsx`. Testes: `norqva_0110_kiwify_sales.test.ts`, `norqva_0110_kiwify_sales_view.test.tsx`.

**Conferir depois do deploy:** uma compra real do Seca Barriga aparece em Vendas com "Kiwify" e na campanha certa no Financeiro; `audit_logs` com `KIWIFY_SALE_RECORDED`.
