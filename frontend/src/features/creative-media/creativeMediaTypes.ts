export interface CreativeMediaProps {
  creatives: any[];
  products: any[];
  offers: any[];
  isDemoView: boolean;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  loadData: () => Promise<void>;
}
