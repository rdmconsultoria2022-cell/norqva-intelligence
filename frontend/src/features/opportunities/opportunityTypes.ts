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
  /** NORQVA-0029: Histórico só para consulta dentro da tela Pesquisa */
  readOnly?: boolean;
}
