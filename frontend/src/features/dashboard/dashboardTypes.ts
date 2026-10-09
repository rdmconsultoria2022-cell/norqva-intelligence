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
  /** NORQVA-0026: atalho para a tela Vendas */
  onViewSales?: () => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  /**
   * NORQVA-0030: 'overview' = Visão Geral (só a visão executiva); 'financial' = aba Financeiro da tela
   * Resultados. Sem valor, mantém as três sub-telas antigas.
   */
  section?: 'overview' | 'financial';
}
