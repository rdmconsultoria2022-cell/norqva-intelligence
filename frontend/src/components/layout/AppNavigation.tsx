import React from 'react';
import { NavigationGroup, areaIcons, groupOfTab } from './navigation';

// NORQVA-0081: navegação sem menu lateral.
// - Computador: faixa discreta com as telas, logo abaixo do menu fixo do topo (ScreenTabs).
// - Celular: barra fixa embaixo com as 5 áreas, como no app da XP (AreaTabBar). Quando a área tem
//   mais de uma tela, as telas dela aparecem numa faixa curta abaixo do topo (AreaSubTabs).

interface NavProps {
  groups: NavigationGroup[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  badges?: Record<string, number>;
}

function Badge({ n, id }: { n?: number; id: string }) {
  if (!n || n <= 0) return null;
  return (
    <span
      data-testid={id}
      title="Alertas abertos"
      className="min-w-[1.1rem] px-1 py-px rounded-full bg-red-500 text-white text-[10px] font-bold leading-4 text-center"
    >
      {n}
    </span>
  );
}

/** Computador: todas as telas numa linha, separadas por área. */
export function ScreenTabs({ groups, activeTab, setActiveTab, badges }: NavProps) {
  return (
    <nav aria-label="Telas" data-testid="screen-tabs" className="flex items-center gap-1 overflow-x-auto no-scrollbar">
      {groups.map((g, gi) => (
        <div key={g.id} data-testid={`nav-group-${g.id}`} className="flex items-center gap-1 shrink-0">
          {gi > 0 && <span aria-hidden="true" className="mx-2 h-4 w-px bg-slate-800" />}
          {g.items.map(item => {
            const active = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-1.5 px-3 h-10 text-[13px] font-medium whitespace-nowrap transition ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
                <Badge n={badges?.[item.id]} id={`badge-${item.id}`} />
                {active && <span aria-hidden="true" className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-emerald-400" />}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Celular: as telas da área aberta, quando ela tem mais de uma. */
export function AreaSubTabs({ groups, activeTab, setActiveTab, badges }: NavProps) {
  const group = groupOfTab(groups, activeTab);
  if (!group || group.items.length < 2) return null;
  return (
    <nav aria-label={`Telas de ${group.label}`} data-testid="area-subtabs" className="md:hidden flex gap-2 px-3 py-2 overflow-x-auto no-scrollbar border-b border-slate-800 bg-slate-950 shrink-0">
      {group.items.map(item => {
        const active = item.id === activeTab;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
              active ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            {item.label}
            <Badge n={badges?.[item.id]} id={`badge-sub-${item.id}`} />
          </button>
        );
      })}
    </nav>
  );
}

/** Celular: barra fixa embaixo com as áreas. Tocar numa área abre a primeira tela dela. */
export function AreaTabBar({ groups, activeTab, setActiveTab, badges }: NavProps) {
  const current = groupOfTab(groups, activeTab);
  return (
    <nav
      aria-label="Áreas"
      data-testid="area-tabbar"
      className="md:hidden shrink-0 border-t border-slate-800 bg-slate-950 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex">
        {groups.map(g => {
          const Icon = areaIcons[g.id] || g.items[0].icon;
          const active = current?.id === g.id;
          const count = g.items.reduce((acc, i) => acc + (badges?.[i.id] || 0), 0);
          return (
            <button
              key={g.id}
              type="button"
              data-testid={`area-${g.id}`}
              onClick={() => {
                if (!active) setActiveTab(g.items[0].id);
              }}
              aria-current={active ? 'page' : undefined}
              aria-label={count > 0 ? `${g.label}, ${count} alerta(s)` : g.label}
              className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 h-16 transition ${
                active ? 'text-white' : 'text-slate-500'
              }`}
            >
              <span className="relative">
                <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.6} />
                {count > 0 && (
                  <span aria-hidden="true" className="absolute -top-1.5 -right-2.5 min-w-[1rem] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-4 text-center">
                    {count}
                  </span>
                )}
              </span>
              <span className="text-[11px] leading-none truncate max-w-full px-1">{g.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
