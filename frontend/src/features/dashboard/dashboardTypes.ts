import type { ReactNode } from 'react';
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
  /** NORQVA-0082: atalhos da Visão Geral para outras telas (ex.: 'campaigns') */
  onOpenTab?: (tab: string) => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  /**
   * NORQVA-0030: 'overview' = Visão Geral (só a visão executiva); 'financial' = aba Financeiro da tela
   * Resultados. Sem valor, mantém as três sub-telas antigas.
   */
  section?: 'overview' | 'financial';
  /** NORQVA-0071: resumo do crédito Meta, mostrado logo depois do tráfego Meta Ads na Visão Geral. */
  metaCreditSlot?: ReactNode;
}
