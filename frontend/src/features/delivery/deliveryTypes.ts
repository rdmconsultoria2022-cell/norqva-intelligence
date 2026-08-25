export interface DeliveryTokenItem {
  assetId: string;
  rawToken: string;
  assetTitle?: string;
}

export interface DeliveryTokenResponse {
  orderId: string;
  deliveries: DeliveryTokenItem[];
}

export interface DownloadResult {
  success: boolean;
  download_url?: string;
  asset_title?: string;
  downloads_remaining?: number;
  error?: string;
}

export interface DigitalDeliveryProps {
  orderId: string;
  checkoutToken: string;
  isDemo: boolean;
  onClose?: () => void;
  showError: (msg: string) => void;
  showSuccess?: (msg: string) => void;
}
