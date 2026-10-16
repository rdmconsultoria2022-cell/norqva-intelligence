import {
  LayoutDashboard,
  Search,
  Package,
  Users,
  Settings,
  BarChart3,
  Factory,
  Store,
  ShoppingCart,
  Megaphone,
  MessageCircle,
  Lightbulb,
  LucideIcon
} from 'lucide-react';

// NORQVA-0081: dados do menu (antes em Sidebar.tsx). O menu lateral saiu: no computador as telas ficam
// numa faixa abaixo do menu fixo do topo; no celular, as áreas ficam numa barra fixa embaixo.

export interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Perfis que veem o item (ausente = todos) */
  roles?: string[];
}


// NORQVA-0024 (fase 1 da consolidação): telas agrupadas em áreas, na ordem do fluxo.
// Os ids não mudam (App, atalhos, badges e período global continuam iguais).
export interface NavigationGroup {
  id: string;
  label: string;
  /** NORQVA-0082: nome curto na barra de baixo do celular (cabe em 320 px sem cortar) */
  shortLabel?: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    id: 'overview',
    label: 'Visão Geral',
    shortLabel: 'Início',
    items: [
      // NORQVA-0030: Créditos Meta virou aba de Resultados (o resumo fica na própria Visão Geral)
      { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard }
    ]
  },
  {
    id: 'intelligence',
    label: 'Inteligência',
    items: [
      // NORQVA-0029: Base de campanhas, Time de IAs e Oportunidades viraram a tela Pesquisa
      // ('campaign-base', 'ai-team' e 'opportunities' abrem esta tela)
      { id: 'research', label: 'Pesquisa', icon: Search },
      // NORQVA-0030: Financeiro, Performance de Criativos, Demografia, Créditos Meta e Decisões viraram a tela
      // Resultados ('creative-performance', 'demographics', 'meta-credit' e 'decisions' abrem esta tela)
      { id: 'results', label: 'Resultados', icon: BarChart3 }
    ]
  },
  {
    id: 'operation',
    label: 'Operação',
    items: [
      // NORQVA-0030: as ofertas ficam dentro de cada produto ('offers' abre esta tela)
      { id: 'products', label: 'Produtos', icon: Package },
      // NORQVA-0025: Creative Lab e Fábrica viraram uma tela só ('creatives' abre a mesma tela)
      { id: 'creative-factory', label: 'Criativos', icon: Factory },
      // NORQVA-0027/0028: Campanhas reúne planos, resultado e controle da Meta, teto, Método e
      // Experimentos ('meta-ads', 'method' e 'experiments' abrem esta tela). Só ADMIN altera.
      { id: 'campaigns', label: 'Campanhas', icon: Megaphone }
    ]
  },
  {
    // NORQVA-0026
    id: 'sales',
    label: 'Vendas',
    items: [
      { id: 'sales', label: 'Vendas', icon: ShoppingCart, roles: ['ADMIN', 'OPERATIONS', 'PERFORMANCE', 'INTELLIGENCE'] },
      // NORQVA-0046: números, conversas e atendente do WhatsApp
      { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, roles: ['ADMIN', 'OPERATIONS'] }
    ]
  },
  {
    id: 'settings',
    label: 'Configurações',
    shortLabel: 'Ajustes',
    items: [
      { id: 'brands', label: 'Marcas', icon: Store },
      { id: 'team', label: 'Equipe', icon: Users },
      { id: 'config', label: 'Configurações', icon: Settings }
    ]
  }
];

export const navigationItems: NavigationItem[] = navigationGroups.flatMap(g => g.items);

/** Ícone de cada área na barra de baixo do celular. */
export const areaIcons: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  intelligence: Lightbulb,
  operation: Package,
  sales: ShoppingCart,
  settings: Settings
};

/** Áreas com só as telas que o perfil pode ver (áreas vazias saem). */
export function visibleGroups(role: string | undefined | null): NavigationGroup[] {
  const r = String(role || '');
  return navigationGroups
    .map(g => ({ ...g, items: g.items.filter(i => !i.roles || i.roles.includes(r)) }))
    .filter(g => g.items.length > 0);
}

/** Área da tela aberta (null quando a tela não está no menu). */
export function groupOfTab(groups: NavigationGroup[], tab: string): NavigationGroup | null {
  return groups.find(g => g.items.some(i => i.id === tab)) || null;
}
