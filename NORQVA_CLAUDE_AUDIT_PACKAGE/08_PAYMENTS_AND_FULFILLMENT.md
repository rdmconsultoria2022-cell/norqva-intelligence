# 08 — PAYMENTS AND FULFILLMENT

## 1. Motor de Pagamentos (Payment Core - Asaas Pix)

O fluxo de liquidação financeira é 100% determinístico e auditável:

```mermaid
sequenceDiagram
    autonumber
    actor C as Comprador
    participant UI as CheckoutView
    participant API as Backend API
    participant AS as Asaas Gateway
    participant DB as PostgreSQL
    participant E as Resend / Email

    C->>UI: Submete Nome, Email e CPF
    UI->>API: POST /api/public/orders
    API->>AS: Cria Cobrança Pix (Valor, Vencimento, Descrição)
    AS-->>API: Retorna QR Code (Base64) + Payload Pix Copia-e-Cola + ID
    API->>DB: Cria registro em orders (PENDING) e payments (PENDING)
    API-->>UI: Exibe QR Code e código Copia-e-Cola
    C->>AS: Efetua pagamento no app do banco
    AS->>API: Webhook POST /api/webhooks/asaas (PAYMENT_RECEIVED)
    API->>DB: Inicia transação: SELECT ... FOR UPDATE em payments
    API->>DB: Atualiza status para PAID e emite digital_delivery
    API->>E: Dispara e-mail com link seguro de entrega
    API-->>AS: Retorna HTTP 200 OK
```

---

## 2. Garantias de Idempotência e Segurança Financeira
1. **Idempotência de Webhook:** Se o Asaas reenviar o webhook de confirmação, a transação valida se o pedido já está `PAID` e encerra sem reprocessamento redundante.
2. **Lock Transacional:** Uso explícito de bloqueio de linha em banco de dados para evitar condições de corrida em confirmações simultâneas.
3. **Validação de Assinatura:** O webhook rejeita qualquer requisição cujo token de acesso do cabeçalho não confira com `ASAAS_WEBHOOK_AUTH_TOKEN`.

---

## 3. Entrega Digital & Recuperação Durável (Fulfillment)
* **Tokens de Entrega:** Cada pedido pago gera um token aleatório criptográfico com tempo de expiração configurável (`DELIVERY_TOKEN_TTL_HOURS`).
* **Recuperação de Acessos:** O cliente pode informar seu e-mail em `/recuperar-acesso` e receber um link novo com token temporário para acessar seus produtos comprados sem necessidade de login.
