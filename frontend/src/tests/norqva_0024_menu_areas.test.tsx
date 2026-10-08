// NORQVA-0024: menu agrupado em áreas, na ordem do fluxo; nenhuma tela some.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { Sidebar, navigationGroups, navigationItems } from '../components/layout/Sidebar';

const admin = { id: 'u', name: 'A', role: 'ADMIN', email: 'a@x.test' } as any;

// NORQVA-0025: Creative Lab ('creatives') e Fábrica viraram a tela Criativos
// NORQVA-0028: Meta Ads, Método NORQVA e Experimentos passaram para dentro de Campanhas
const ALL_TABS = [
  'dashboard', 'opportunities', 'products', 'offers', 'creative-factory',
  'meta-credit', 'campaign-base', 'ai-team', 'brands', 'creative-performance',
  'demographics', 'decisions', 'team', 'config', 'sales', 'campaigns'
];

describe('NORQVA-0024 — menu em áreas', () => {
  it('mantém as telas, sem repetição', () => {
    const ids = navigationItems.map(i => i.id);
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
    expect([...ids].sort()).toEqual([...ALL_TABS].sort());
  });

  it('agrupa nas áreas e na ordem aprovadas', () => {
    expect(navigationGroups.map(g => g.label)).toEqual(['Visão Geral', 'Inteligência', 'Operação', 'Vendas', 'Configurações']);
    expect(navigationGroups[1].items.map(i => i.id)).toEqual([
      'campaign-base', 'ai-team', 'opportunities', 'creative-performance', 'demographics', 'decisions'
    ]);
    expect(navigationItems.find(i => i.id === 'dashboard')?.label).toBe('Visão Geral');
    expect(navigationItems.find(i => i.id === 'opportunities')?.label).toBe('Oportunidades');
  });

  it('mostra os títulos, navega e recolhe a área', () => {
    const setActiveTab = vi.fn();
    render(<Sidebar currentUser={admin} activeTab="dashboard" setActiveTab={setActiveTab} handleSignOut={vi.fn()} />);
    const operation = screen.getByTestId('nav-group-operation');
    fireEvent.click(within(operation).getByText('Criativos'));
    expect(setActiveTab).toHaveBeenCalledWith('creative-factory');

    fireEvent.click(within(operation).getByText('Operação'));
    expect(within(operation).queryByText('Criativos')).not.toBeInTheDocument();
    fireEvent.click(within(operation).getByText('Operação'));
    expect(within(operation).getByText('Criativos')).toBeInTheDocument();
  });

  it('a área da tela aberta não recolhe', () => {
    render(<Sidebar currentUser={admin} activeTab="campaigns" setActiveTab={vi.fn()} handleSignOut={vi.fn()} badges={{ campaigns: 3 }} />);
    const operation = screen.getByTestId('nav-group-operation');
    fireEvent.click(within(operation).getByText('Operação'));
    expect(within(operation).getByText('Campanhas')).toBeInTheDocument();
    expect(screen.getByTestId('badge-campaigns')).toHaveTextContent('3');
  });
});
