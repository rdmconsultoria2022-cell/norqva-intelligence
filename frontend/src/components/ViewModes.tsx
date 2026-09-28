import React, { useState } from 'react';
import { List, LayoutGrid, LayoutDashboard, Columns, Square, Grip } from 'lucide-react';
import { isHttpUrl, previewKind } from './CreativePreview';

// NORQVA-0011: display modes for creative lists, like a file explorer.

export type ViewMode = 'list' | 'grid' | 'xl' | 'lg' | 'md' | 'sm';

export const VIEW_MODES: { id: ViewMode; label: string; icon: any }[] = [
  { id: 'xl', label: 'Ícones extra grandes', icon: Square },
  { id: 'lg', label: 'Ícones grandes', icon: Columns },
  { id: 'md', label: 'Ícones médios', icon: LayoutGrid },
  { id: 'sm', label: 'Ícones pequenos', icon: Grip },
  { id: 'grid', label: 'Grade', icon: LayoutDashboard },
  { id: 'list', label: 'Lista', icon: List }
];

export const isIconMode = (m: ViewMode) => m === 'xl' || m === 'lg' || m === 'md' || m === 'sm';

export function useViewMode(storageKey: string, fallback: ViewMode = 'list'): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const v = window.localStorage.getItem(storageKey) as ViewMode | null;
      return v && VIEW_MODES.some((x) => x.id === v) ? v : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (m: ViewMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(storageKey, m);
    } catch {
      /* per-viewer convenience only */
    }
  };
  return [mode, set];
}

export const ViewModeSelector: React.FC<{ value: ViewMode; onChange: (m: ViewMode) => void }> = ({ value, onChange }) => (
  <div role="radiogroup" aria-label="Modo de exibição" className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
    {VIEW_MODES.map((m) => {
      const Icon = m.icon;
      const active = value === m.id;
      return (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={m.label}
          title={m.label}
          onClick={() => onChange(m.id)}
          className={`p-1.5 ${active ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Icon className="h-4 w-4" />
        </button>
      );
    })}
  </div>
);

/** Container classes for each mode. */
export function containerClass(mode: ViewMode): string {
  switch (mode) {
    case 'list':
      return 'space-y-3';
    case 'grid':
      return 'grid grid-cols-1 lg:grid-cols-2 gap-4';
    case 'xl':
      return 'grid grid-cols-1 sm:grid-cols-2 gap-4';
    case 'lg':
      return 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3';
    case 'md':
      return 'grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2';
    case 'sm':
      return 'grid grid-cols-4 md:grid-cols-8 lg:grid-cols-10 gap-2';
  }
}

/** Thumbnail tile used by the icon modes. Clicking opens the creative in list mode. */
export const IconTile: React.FC<{
  mode: ViewMode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  url?: string | null;
  format?: string | null;
  onOpen: () => void;
}> = ({ mode, title, subtitle, badge, url, format, onOpen }) => {
  const small = mode === 'sm' || mode === 'md';
  const kind = isHttpUrl(url) ? previewKind(url, format) : 'unknown';
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="icon-tile"
      title={subtitle ? `${title} — ${subtitle}` : title}
      className="text-left rounded-lg border border-slate-800 bg-slate-900/60 hover:border-emerald-500/50 overflow-hidden"
    >
      <div className="aspect-[4/5] bg-black flex items-center justify-center">
        {kind === 'video' ? (
          <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-contain" />
        ) : kind === 'image' ? (
          <img src={url as string} alt={title} loading="lazy" className="w-full h-full object-contain" />
        ) : (
          <span className="text-[10px] text-slate-600 px-1 text-center">sem arquivo</span>
        )}
      </div>
      <div className={small ? 'p-1' : 'p-2 space-y-0.5'}>
        <div className={`font-mono text-emerald-300 truncate ${small ? 'text-[9px]' : 'text-[11px]'}`}>{title}</div>
        {!small && subtitle && <div className="text-[10px] text-slate-500 truncate">{subtitle}</div>}
        {!small && badge}
      </div>
    </button>
  );
};

/** Group creatives by the campaign they run in (active first); unpublished ones last. */
export function groupByCampaign<T extends { campaigns?: { meta_campaign_id: string; name: string; status: string | null }[] }>(
  items: T[]
): { key: string; name: string; status: string | null; items: T[] }[] {
  const groups = new Map<string, { key: string; name: string; status: string | null; items: T[] }>();
  for (const it of items) {
    const cp = (it.campaigns || [])[0];
    const key = cp ? cp.meta_campaign_id : '__none__';
    if (!groups.has(key)) {
      groups.set(key, { key, name: cp ? cp.name : 'Sem campanha (não publicados)', status: cp ? cp.status : null, items: [] });
    }
    groups.get(key)!.items.push(it);
  }
  const rank = (g: { key: string; status: string | null }) => (g.key === '__none__' ? 2 : g.status === 'ACTIVE' ? 0 : 1);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
