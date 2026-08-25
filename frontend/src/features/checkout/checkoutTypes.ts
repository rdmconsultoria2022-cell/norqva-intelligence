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
  onOrderCreated: (order: CheckoutOrderResult) => void;
  onCancel: () => void;
  showError: (msg: string) => void;
  showSuccess?: (msg: string) => void;
}
