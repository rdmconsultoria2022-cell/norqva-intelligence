import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreativeMediaView } from '../features/creative-media/CreativeMediaView';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe('NORQVA-0012 — list view media fills the card height', () => {
  it('list view uses the filling preview; grid view keeps the fixed thumbnail', () => {
    render(
      <CreativeMediaView
        creatives={[{ id: 'a', human_id: 'BB-B01-H01-M1-C1', hook: 'h', concept: 'c', copy: 'x', cta: 'c', format: 'VIDEO', status: 'IDEIA', file_url: 'https://cdn.test/h01.mp4', campaigns: [] }]}
        products={[]}
        offers={[]}
        isDemoView={false}
        currentUser={{ id: 'u', name: 'A', role: 'ADMIN', email: 'a@x.test' } as any}
        showError={vi.fn()}
        showSuccess={vi.fn()}
        refreshCreatives={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByTestId('creative-preview-fill')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Grade' }));
    expect(screen.queryByTestId('creative-preview-fill')).toBeNull();
    expect(screen.getByTestId('creative-preview-video')).toBeInTheDocument();
  });
});
