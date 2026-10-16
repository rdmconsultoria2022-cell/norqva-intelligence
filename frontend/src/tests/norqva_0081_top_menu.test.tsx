// NORQVA-0081: menu fixo no topo com a logo, perfil só com o nome (abre dados e Sair),
// sem AUTH_MODE e sem botão Sincronizar; telas no topo (computador) e áreas embaixo (celular).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GlobalPeriodProvider } from '../lib/globalPeriod';
import { AppShell } from '../components/layout/AppShell';
import { initialsOf, firstNameOf, roleLabel } from '../components/layout/UserMenu';

const user = { id: 'u', name: 'Ricardo Andrade Lucas', role: 'ADMIN', email: 'ricardo@x.test' } as any;

function renderShell(over: Record<string, unknown> = {}) {
  const nav = { currentUser: user, activeTab: 'campaigns', setActiveTab: vi.fn(), handleSignOut: vi.fn(), badges: { campaigns: 2 }, ...over };
  render(
    <GlobalPeriodProvider>
      <AppShell globalError={null} globalSuccess={null} isDemoView={false} setIsDemoView={vi.fn()} nav={nav as any} showPeriodFilter>
        <p>conteúdo</p>
      </AppShell>
    </GlobalPeriodProvider>
  );
  return nav;
}

describe('NORQVA-0081 — menu do topo', () => {
  it('mostra a logo e o primeiro nome; sem AUTH_MODE e sem Sincronizar', () => {
    renderShell();
    const header = screen.getByTestId('app-header');
    expect(within(header).getByText('NORQVA')).toBeInTheDocument();
    expect(within(header).getByText('Ricardo')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/AUTH_MODE/i);
    expect(screen.queryByText('Sincronizar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recarregar dados' })).toBeNull();
    expect(screen.getByTestId('global-period-selector')).toBeInTheDocument();
  });

  it('o perfil abre nome completo, e-mail, perfil e Sair; fecha com Esc', () => {
    const nav = renderShell();
    expect(screen.queryByTestId('user-menu-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Perfil: Ricardo Andrade Lucas' }));
    const panel = screen.getByTestId('user-menu-panel');
    expect(within(panel).getByText('Ricardo Andrade Lucas')).toBeInTheDocument();
    expect(within(panel).getByText('ricardo@x.test')).toBeInTheDocument();
    expect(within(panel).getByText('Perfil: Administrador')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('user-menu-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Perfil: Ricardo Andrade Lucas' }));
    fireEvent.click(screen.getByRole('button', { name: /Sair/ }));
    expect(nav.handleSignOut).toHaveBeenCalledTimes(1);
  });

  it('telas no topo e áreas embaixo, com o alerta de Campanhas nos dois', () => {
    const nav = renderShell();
    expect(screen.getByTestId('screen-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('area-tabbar')).toBeInTheDocument();
    expect(screen.getByTestId('badge-campaigns')).toHaveTextContent('2');
    expect(screen.getByTestId('area-operation').textContent).toContain('2');
    fireEvent.click(screen.getByTestId('area-sales'));
    expect(nav.setActiveTab).toHaveBeenCalledWith('sales');
  });

  it('iniciais, primeiro nome e nome do perfil', () => {
    expect(initialsOf('Ricardo Andrade Lucas')).toBe('RL');
    expect(initialsOf('Ana')).toBe('A');
    expect(initialsOf('')).toBe('?');
    expect(firstNameOf('Ricardo Andrade Lucas')).toBe('Ricardo');
    expect(roleLabel('OPERATIONS')).toBe('Operações');
  });
});
