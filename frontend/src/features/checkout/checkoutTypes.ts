import { UserObj } from '../../types';

export interface CheckoutOffer {
  id: string;
  human_id?: string;
  name: string;
  price: number | string;
  promotional_price?: number | string | null;
  product_id?: string;
  product_name?: string;
  description?: string;
  bonus?: string;
  is_demo?: boolean;
  /** NORQVA-0032: adicional na hora do Pix (o preço cobrado é sempre o do servidor) */
  bump?: { offer_human_id: string; name: string; headline: string | null; price: number } | null;
  /** NORQVA-0038: cartão de crédito (null = só Pix). Valores exatos vêm do servidor. */
  card?: {
    max_installments: number;
    total: number;
    installment_value: number;
    interest_monthly?: number;
    plan?: { max: number; free: number; rate: number };
    options?: { n: number; installment_value: number | null; total: number; interest: boolean }[];
  } | null;
}

export interface CheckoutCustomer {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  cpf_cnpj?: string;
  is_demo?: boolean;
}

export interface CreateOrderPayload {
  offer_id: string;
  customer_id: string;
  idempotency_key: string;
  quantity?: number;
}

export interface CheckoutOrderResult {
  id: string;
  customer_id: string;
  total_amount: number | string;
  status: string;
  checkout_token?: string;
  is_demo: boolean;
  /** NORQVA-0038: meio escolhido no checkout (só no navegador; o servidor decide valor e parcelas). */
  payment_method?: 'PIX' | 'CREDIT_CARD';
  /** NORQVA-0041: parcelas escolhidas pelo comprador (o servidor recalcula o valor). */
  installments?: number;
  created_at: string;
  items?: Array<{
    id: string;
    offer_id: string;
    product_id: string;
    product_name_snapshot: string;
    offer_name_snapshot: string;
    unit_price: number | string;
    quantity: number;
    total_price: number | string;
  }>;
}

export interface CheckoutViewProps {
  offer: CheckoutOffer;
  isDemo: boolean;
  currentUser?: UserObj | null;
  initialCustomer?: Partial<CheckoutCustomer> | null;
  onCustomerChange?: (customer: Partial<CheckoutCustomer>) => void;
  onOrderCreated: (order: CheckoutOrderResult) => void;
  onCancel: () => void;
  showError: (msg: string) => void;
  showSuccess?: (msg: string) => void;
}


