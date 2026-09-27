import React from 'react';
import {
  LayoutDashboard,
  Lightbulb,
  Package,
  Tag,
  Film,
  FlaskConical,
  Scale,
  Users,
  Settings,
  User,
  LogOut,
  TrendingUp,
  BarChart3,
  PieChart,
  LucideIcon,
  ChevronRight
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
}

const navigationItems: NavigationItem[] = [
  { id: 'dashboard', label: 'Visão Executiva', icon: LayoutDashboard },
  { id: 'opportunities', label: 'Intelligence', icon: Lightbulb },
  { id: 'products', label: 'Produtos', icon: Package },
  { id: 'offers', label: 'Ofertas', icon: Tag },
  { id: 'creatives', label: 'Creative Lab', icon: Film },
  { id: 'experiments', label: 'Experimentos', icon: FlaskConical },
  { id: 'meta-ads', label: 'Meta Ads', icon: TrendingUp },
  { id: 'creative-performance', label: 'Performance Criativos', icon: BarChart3 },
  { id: 'demographics', label: 'Demografia', icon: PieChart },
  { id: 'decisions', label: 'Decisões', icon: Scale },
  { id: 'team', label: 'Equipe', icon: Users },
  { id: 'config', label: 'Configurações', icon: Settings }
];

export function Sidebar({
  currentUser,
  activeTab,
  setActiveTab,
  handleSignOut,
  onNavigate,
  onClose
}: SidebarProps) {
  return (
    <aside className="w-64 h-full bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 select-none">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-sm shadow-emerald-500/20 text-white font-black text-sm">
              N
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-slate-900 block leading-tight">NORQVA</span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Intelligence OS</span>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              aria-label="Fechar menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <div className="p-3">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Navegação Principal
          </div>
          <nav className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    onNavigate?.();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="h-3 w-3 text-slate-400" />}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* User Card & Logout */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className="p-2.5 rounded-xl bg-white border border-slate-200/70 shadow-xs flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-slate-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate text-slate-900 leading-tight">{currentUser.name}</div>
              <span className="text-[10px] text-slate-400 font-medium capitalize">
                {currentUser.role?.toLowerCase()}
              </span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
            title="Encerrar Sessão"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
