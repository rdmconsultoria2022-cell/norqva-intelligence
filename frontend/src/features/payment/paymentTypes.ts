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
  expires_at?: string;
}

export interface PaymentStatusProps {
  orderId: string;
  checkoutToken: string;
  amount: number | string;
  isDemo: boolean;
  initialPayment?: PaymentInfo | null;
  onPaymentConfirmed?: () => void;
  onClose?: () => void;
  showError: (msg: string) => void;
  showSuccess?: (msg: string) => void;
}
