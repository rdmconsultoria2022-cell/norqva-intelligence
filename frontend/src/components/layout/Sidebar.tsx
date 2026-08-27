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
}

const navigationItems: NavigationItem[] = [
  { id: 'dashboard', label: 'Visão Executiva', icon: LayoutDashboard },
  { id: 'opportunities', label: 'Intelligence', icon: Lightbulb },
  { id: 'products', label: 'Produtos', icon: Package },
  { id: 'offers', label: 'Ofertas', icon: Tag },
  { id: 'creatives', label: 'Creative Lab', icon: Film },
  { id: 'experiments', label: 'Experimentos', icon: FlaskConical },
  { id: 'meta-ads', label: 'Meta Ads', icon: TrendingUp },
  { id: 'decisions', label: 'Decisões', icon: Scale },
  { id: 'team', label: 'Equipe', icon: Users },
  { id: 'config', label: 'Configurações', icon: Settings }
];

export function Sidebar({
  currentUser,
  activeTab,
  setActiveTab,
  handleSignOut
}: SidebarProps) {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <svg viewBox="0 0 100 100" className="h-6 w-6">
            <polygon points="50,15 90,85 10,85" className="fill-emerald-500" />
          </svg>
          <div>
            <span className="text-lg font-black tracking-widest text-emerald-400 font-mono">NORQVA</span>
            <div className="text-[9px] uppercase tracking-widest font-mono text-slate-500">Intelligence V1</div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-semibold uppercase tracking-wider transition ${
                  activeTab === item.id
                    ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
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
