// NORQVA-0024: menu agrupado em áreas, na ordem do fluxo; nenhuma tela some.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { navigationGroups, navigationItems, visibleGroups } from '../components/layout/navigation';
import { ScreenTabs, AreaTabBar, AreaSubTabs } from '../components/layout/AppNavigation';

const admin = { id: 'u', name: 'A', role: 'ADMIN', email: 'a@x.test' } as any;

// NORQVA-0025: Creative Lab ('creatives') e Fábrica viraram a tela Criativos
// NORQVA-0028: Meta Ads, Método NORQVA e Experimentos passaram para dentro de Campanhas
// NORQVA-0029: Base de campanhas, Time de IAs e Oportunidades passaram para dentro de Pesquisa
// NORQVA-0030: Ofertas dentro de Produtos; Financeiro, Criativos, Demografia, Créditos Meta e Decisões em Resultados
const ALL_TABS = [
  'dashboard', 'research', 'results', 'products', 'creative-factory', 'campaigns', 'sales', 'whatsapp', 'brands', 'team', 'config'
];

describe('NORQVA-0024 — menu em áreas', () => {
  it('mantém as telas, sem repetição', () => {
    const ids = navigationItems.map(i => i.id);
    expect(ids).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
    expect([...ids].sort()).toEqual([...ALL_TABS].sort());
  });

  it('agrupa nas áreas e na ordem aprovadas', () => {
    expect(navigationGroups.map(g => g.label)).toEqual(['Visão Geral', 'Inteligência', 'Operação', 'Vendas', 'Configurações']);
    expect(navigationGroups[1].items.map(i => i.id)).toEqual([
      'research', 'results'
    ]);
    expect(navigationItems.find(i => i.id === 'dashboard')?.label).toBe('Visão Geral');
    expect(navigationItems.find(i => i.id === 'research')?.label).toBe('Pesquisa');
  });

  // NORQVA-0081: sem menu lateral; telas numa faixa no topo (computador) e áreas embaixo (celular)
  it('a faixa do topo mostra as telas por área e navega', () => {
    const setActiveTab = vi.fn();
    render(<ScreenTabs groups={visibleGroups('ADMIN')} activeTab="dashboard" setActiveTab={setActiveTab} />);
    const operation = screen.getByTestId('nav-group-operation');
    fireEvent.click(within(operation).getByText('Criativos'));
    expect(setActiveTab).toHaveBeenCalledWith('creative-factory');
    expect(within(screen.getByTestId('screen-tabs')).getByText('Visão Geral').closest('button')).toHaveAttribute('aria-current', 'page');
  });

  it('a barra de baixo tem as 5 áreas; tocar numa área abre a primeira tela dela', () => {
    const setActiveTab = vi.fn();
    render(<AreaTabBar groups={visibleGroups('ADMIN')} activeTab="dashboard" setActiveTab={setActiveTab} badges={{ campaigns: 3 }} />);
    const bar = screen.getByTestId('area-tabbar');
    // NORQVA-0082 (D-0082): nomes curtos na barra do celular; no computador continuam os nomes completos
    expect(within(bar).getAllByRole('button').map(b => b.textContent?.replace(/\d+/g, ''))).toEqual(['Início', 'Inteligência', 'Operação', 'Vendas', 'Ajustes']);
    fireEvent.click(screen.getByTestId('area-operation'));
    expect(setActiveTab).toHaveBeenCalledWith('products');
    expect(screen.getByTestId('area-operation').textContent).toContain('3');
  });

  it('no celular, as telas da área aberta aparecem embaixo do topo', () => {
    const setActiveTab = vi.fn();
    render(<AreaSubTabs groups={visibleGroups('ADMIN')} activeTab="campaigns" setActiveTab={setActiveTab} badges={{ campaigns: 3 }} />);
    const sub = screen.getByTestId('area-subtabs');
    expect(within(sub).getAllByRole('button').map(b => b.textContent?.replace(/\d+/g, ''))).toEqual(['Produtos', 'Criativos', 'Campanhas']);
    fireEvent.click(within(sub).getByText('Criativos'));
    expect(setActiveTab).toHaveBeenCalledWith('creative-factory');
    expect(screen.getByTestId('badge-sub-campaigns')).toHaveTextContent('3');
  });

  it('área com uma tela só não mostra a faixa; perfis sem acesso não veem Vendas', () => {
    const { container } = render(<AreaSubTabs groups={visibleGroups('ADMIN')} activeTab="dashboard" setActiveTab={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    expect(visibleGroups('CREATIVE').map(g => g.id)).toEqual(['overview', 'intelligence', 'operation', 'settings']);
  });
});
