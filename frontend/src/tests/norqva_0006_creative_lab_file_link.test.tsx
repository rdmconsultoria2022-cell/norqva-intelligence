import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CreativeMediaView, isOpenableFileUrl } from '../features/creative-media/CreativeMediaView';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));

const user = { id: '1', name: 'Admin', role: 'ADMIN', email: 'a@norqva.test' };

const base = { product_name: 'Bolso', cta: 'Saiba mais', format: 'VIDEO', status: 'DRAFT' };

function renderLab(creatives: any[]) {
  return render(
    <CreativeMediaView
      creatives={creatives}
      products={[]}
      offers={[]}
      isDemoView={false}
      currentUser={user as any}
      showError={vi.fn()}
      showSuccess={vi.fn()}
      refreshCreatives={vi.fn().mockResolvedValue(undefined)}
    />
  );
}

describe('NORQVA-0006 — Creative Lab "Abrir Arquivo"', () => {
  it('accepts only http(s) URLs', () => {
    expect(isOpenableFileUrl('https://cdn.test/v.mp4')).toBe(true);
    expect(isOpenableFileUrl('http://cdn.test/v.mp4')).toBe(true);
    expect(isOpenableFileUrl(null)).toBe(false);
    expect(isOpenableFileUrl('')).toBe(false);
    expect(isOpenableFileUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableFileUrl('arquivo.mp4')).toBe(false);
  });

  it('shows the link for a real file and a label for a Factory creative without file', () => {
    renderLab([
      { ...base, id: 'a', human_id: 'CRT-001', hook: 'Com arquivo', concept: 'c', copy: 'x', file_url: 'https://cdn.test/v.mp4' },
      { ...base, id: 'b', human_id: 'BB-B01-H01-M1-C1', hook: 'Sem arquivo', concept: null, copy: null,
        mechanism: 'Disponível do mês', primary_text: 'Organize seu dinheiro', file_url: null, batch_code: 'BB-B01' }
    ]);

    const links = screen.getAllByRole('link', { name: 'Abrir Arquivo' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://cdn.test/v.mp4');
    expect(screen.getByTestId('creative-no-file')).toHaveTextContent('Sem arquivo (Fábrica)');
    expect(screen.getByText('Disponível do mês')).toBeInTheDocument();
    expect(screen.getByText('Organize seu dinheiro')).toBeInTheDocument();
  });
});
