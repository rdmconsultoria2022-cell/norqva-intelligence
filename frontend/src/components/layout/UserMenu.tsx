import React, { useEffect, useRef, useState } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
import { UserObj } from '../../types';

// NORQVA-0081: perfil no canto superior esquerdo, só com o nome. Ao tocar, abre os dados do perfil e "Sair".

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  INTELLIGENCE: 'Inteligência',
  PRODUCT: 'Produto',
  CREATIVE: 'Criativos',
  PERFORMANCE: 'Performance',
  OPERATIONS: 'Operações'
};

export function roleLabel(role: string | undefined | null): string {
  const r = String(role || '').toUpperCase();
  return ROLE_LABELS[r] || r || '—';
}

export function initialsOf(name: string | undefined | null): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return (first + last).toUpperCase();
}

/** Primeiro nome, para caber no topo (o nome completo fica no menu do perfil). */
export function firstNameOf(name: string | undefined | null): string {
  return String(name || '').trim().split(/\s+/)[0] || 'Perfil';
}

interface Props {
  user: UserObj;
  onSignOut: () => void;
}

export function UserMenu({ user, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative min-w-0" data-testid="user-menu">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`Perfil: ${user.name}`}
        className="flex items-center gap-2 min-w-0 max-w-full rounded-full pr-2 hover:bg-slate-800/60 transition"
      >
        <span className="h-8 w-8 shrink-0 rounded-full bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center">
          {initialsOf(user.name)}
        </span>
        <span className="text-sm font-semibold text-slate-100 truncate max-w-[9rem] sm:max-w-[14rem]">{firstNameOf(user.name)}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          data-testid="user-menu-panel"
          className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-slate-800 bg-slate-900 shadow-2xl z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
            <span className="h-10 w-10 shrink-0 rounded-full bg-slate-800 border border-slate-700 text-slate-200 text-sm font-bold flex items-center justify-center">
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100 truncate">{user.name}</div>
              {user.email && <div className="text-xs text-slate-400 truncate">{user.email}</div>}
              <div className="text-[11px] text-slate-500 mt-0.5">Perfil: {roleLabel(user.role)}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-red-300 transition"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
