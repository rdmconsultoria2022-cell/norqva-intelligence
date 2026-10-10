export type PaymentStatusEnum =
  | 'CREATED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'RECEIVED'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'REFUNDED';

export interface PaymentInfo {
  human_id: string;
  status: PaymentStatusEnum;
  amount: number | string;
  pix_copy_paste?: string;
  /** NORQVA-0023: QR Code do Pix (PNG em base64) devolvido pelo Asaas. */
  pix_qr_image?: string | null;
  expires_at?: string;
  /** NORQVA-0038: meio de pagamento e, no cartão, a página segura do Asaas e as parcelas. */
  payment_method?: 'PIX' | 'CREDIT_CARD';
  invoice_url?: string | null;
  installments?: number;
  /** null quando as parcelas não são iguais (o Asaas ajusta a última). */
  installment_value?: number | null;
}

export interface PaymentStatusProps {
  orderId: string;
  checkoutToken: string;
  amount: number | string;
  isDemo: boolean;
  initialPayment?: PaymentInfo | null;
  /** NORQVA-0038: meio escolhido no checkout (padrão Pix). */
  paymentMethod?: 'PIX' | 'CREDIT_CARD';
  onPaymentConfirmed?: () => void;
  onClose?: () => void;
  onBackToCheckout?: () => void;
  showError: (msg: string) => void;
  showSuccess?: (msg: string) => void;
}

