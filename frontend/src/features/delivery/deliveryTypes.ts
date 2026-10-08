export interface DeliveryTokenItem {
  assetId: string;
  rawToken?: string;
  assetTitle?: string;
  status?: string;
  downloadCount?: number;
  maxDownloads?: number;
  expiresAt?: string;
}

export interface DeliveryTokenResponse {
  orderId: string;
  deliveries: DeliveryTokenItem[];
  /** NORQVA-0023: true só quando o e-mail de acesso foi de fato enviado. */
  accessEmailSent?: boolean;
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
