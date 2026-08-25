import { UserObj } from '../../types';

export interface ExperimentsProps {
  experiments: any[];
  products: any[];
  offers: any[];
  creatives: any[];
  currentUser: UserObj | null;
  isDemoView: boolean;
  onSelectExperiment: (exp: any) => void;
  onRegisterPerformance: (id: string) => void;
  onAuthorizeCapital: (exp: any) => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  refreshExperiments: () => Promise<void>;
}
