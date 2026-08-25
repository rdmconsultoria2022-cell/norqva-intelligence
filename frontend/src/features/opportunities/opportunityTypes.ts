import { UserObj } from '../../types';

export interface OpportunitiesProps {
  opportunities: any[];
  users: UserObj[];
  currentUser: UserObj | null;
  isDemoView: boolean;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  refreshOpportunities: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  refreshDecisions: () => Promise<void>;
}
