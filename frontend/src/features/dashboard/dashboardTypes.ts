import { UserObj } from '../../types';

export interface DashboardProps {
  currentUser: UserObj | null;
  isDemoView: boolean;
  experiments: any[];
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  onSelectExperiment: (exp: any) => void;
  onRegisterPerformance: (id: string) => void;
  onAuthorizeCapital: (exp: any) => void;
  refreshTrigger: number;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}
