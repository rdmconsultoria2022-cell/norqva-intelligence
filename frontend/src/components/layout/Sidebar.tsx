import React, { useState } from 'react';
import {
  LayoutDashboard,
  Lightbulb,
  Package,
  Tag,
  FlaskConical,
  Scale,
  Users,
  Settings,
  User,
  LogOut,
  TrendingUp,
  BarChart3,
  PieChart,
  Factory,
  Database,
  Bot,
  Store,
  Wallet,
  Compass,
  ChevronDown,
  LucideIcon
} from 'lucide-react';
import { UserObj } from '../../types';

interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface SidebarProps {
  currentUser: UserObj;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  handleSignOut: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
  // NORQVA-0009: counters shown next to menu items (e.g. open ad alerts on "Meta Ads")
  badges?: Record<string, number>;
}

// NORQVA-0024 (fase 1 da consolidação): telas agrupadas em áreas, na ordem do fluxo.
// Os ids não mudam (App, atalhos, badges e período global continuam iguais).
export interface NavigationGroup {
  id: string;
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    id: 'overview',
    label: 'Visão Geral',
    items: [
      { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
      { id: 'meta-credit', label: 'Créditos Meta', icon: Wallet }
    ]
  },
  {
    id: 'intelligence',
    label: 'Inteligência',
    items: [
      { id: 'campaign-base', label: 'Base de campanhas', icon: Database },
      { id: 'ai-team', label: 'Time de IAs', icon: Bot },
      { id: 'opportunities', label: 'Oportunidades', icon: Lightbulb },
      { id: 'creative-performance', label: 'Performance de Criativos', icon: BarChart3 },
      { id: 'demographics', label: 'Demografia', icon: PieChart },
      { id: 'decisions', label: 'Decisões', icon: Scale }
    ]
  },
  {
    id: 'operation',
    label: 'Operação',
    items: [
      { id: 'products', label: 'Produtos', icon: Package },
      { id: 'offers', label: 'Ofertas', icon: Tag },
      // NORQVA-0025: Creative Lab e Fábrica viraram uma tela só ('creatives' abre a mesma tela)
      { id: 'creative-factory', label: 'Criativos', icon: Factory },
      { id: 'method', label: 'Método NORQVA', icon: Compass },
      { id: 'meta-ads', label: 'Meta Ads', icon: TrendingUp },
      { id: 'experiments', label: 'Experimentos', icon: FlaskConical }
    ]
  },
  {
    id: 'settings',
    label: 'Configurações',
    items: [
      { id: 'brands', label: 'Marcas', icon: Store },
      { id: 'team', label: 'Equipe', icon: Users },
      { id: 'config', label: 'Configurações', icon: Settings }
    ]
  }
];

export const navigationItems: NavigationItem[] = navigationGroups.flatMap(g => g.items);

export function Sidebar({
  currentUser,
  activeTab,
  setActiveTab,
  handleSignOut,
  onNavigate,
  onClose,
  badges
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <aside className="w-64 h-full bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
      <div className="flex flex-col min-h-0">
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 100 100" className="h-6 w-6">
              <polygon points="50,15 90,85 10,85" className="fill-emerald-500" />
            </svg>
            <div>
              <span className="text-lg font-black tracking-widest text-emerald-400 font-mono">NORQVA</span>
              <div className="text-[9px] uppercase tracking-widest font-mono text-slate-500">Intelligence V1</div>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Fechar menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Navigation Links — NORQVA-0024: agrupadas por área, títulos recolhíveis */}
        <nav className="p-4 space-y-3 overflow-y-auto">
          {navigationGroups.map((group) => {
            const containsActive = group.items.some(i => i.id === activeTab);
            const isOpen = containsActive || !collapsed[group.id];
            return (
              <div key={group.id} data-testid={`nav-group-${group.id}`}>
                <button
                  type="button"
                  onClick={() => setCollapsed(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between px-3 pb-1 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition"
                >
                  <span>{group.label}</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                </button>
                {isOpen && (
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            onNavigate?.();
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-semibold uppercase tracking-wider transition ${
                            activeTab === item.id
                              ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/30'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                          {badges && badges[item.id] > 0 && (
                            <span
                              data-testid={`badge-${item.id}`}
                              title="Alertas abertos"
                              className="ml-auto min-w-[1.25rem] px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold text-center normal-case tracking-normal"
                            >
                              {badges[item.id]}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* User Card & Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <User className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold truncate text-slate-200">{currentUser.name}</div>
            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400 font-bold uppercase">
              {currentUser.role}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="p-1 rounded text-slate-400 hover:text-red-400 transition"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
