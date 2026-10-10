-- Migration 049 (NORQVA-0038): cartão de crédito no Asaas, por oferta. Só aditiva, nenhum dado existente muda.
-- offers.card_enabled: a oferta aceita cartão. Desligado em todas as ofertas existentes.
-- offers.card_max_installments: número máximo de parcelas sem juros (1 a 12).
-- offers.card_total_price: total cobrado no cartão (pode ser um pouco maior que o Pix, para fechar as parcelas).
-- payments.provider_installment_id: id do parcelamento no Asaas (cada parcela é uma cobrança própria lá).
-- payments.invoice_url: página segura do Asaas onde o comprador digita o cartão. O NORQVA nunca vê o cartão.
-- payments.installment_count: parcelas desta cobrança (nulo no Pix).
-- commercial_funnel_events: novo tipo CARD_CHARGE_CREATED, mesmo padrão da migration 026.

ALTER TABLE offers ADD COLUMN IF NOT EXISTS card_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS card_max_installments INTEGER NOT NULL DEFAULT 1;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS card_total_price NUMERIC(10,2);

ALTER TABLE offers DROP CONSTRAINT IF EXISTS chk_offers_card_installments;
ALTER TABLE offers ADD CONSTRAINT chk_offers_card_installments CHECK (card_max_installments BETWEEN 1 AND 12);

ALTER TABLE offers DROP CONSTRAINT IF EXISTS chk_offers_card_total_price;
ALTER TABLE offers ADD CONSTRAINT chk_offers_card_total_price CHECK (card_total_price IS NULL OR card_total_price > 0);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_installment_id VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS installment_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_payments_provider_installment ON payments (provider_installment_id);

ALTER TABLE commercial_funnel_events
  DROP CONSTRAINT IF EXISTS chk_commercial_funnel_events_event_type;

ALTER TABLE commercial_funnel_events
  ADD CONSTRAINT chk_commercial_funnel_events_event_type
  CHECK (event_type IN (
    'LANDING_PAGE_VIEW',
    'OFFER_VIEW',
    'CHECKOUT_MODAL_OPENED',
    'CHECKOUT_STARTED',
    'PIX_GENERATED',
    'PIX_EXPIRED',
    'PAID',
    'CARD_CHARGE_CREATED'
  ));
