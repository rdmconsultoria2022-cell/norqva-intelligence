import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { BrandsView, Brand } from '../features/brands/BrandsView';

// NORQVA-0018: tela Marcas — checklist, conferência, criação de pixel e roteamento com confirmação.

const trattoria = (pixel: any = null): Brand => ({
  id: 'b1',
  code: 'TRATTORIA',
  name: 'Trattoria em Casa',
  status: 'PILOT',
  niche_name: 'Culinária italiana',
  spokesperson_type: 'BRAND_ONLY',
  products_count: 1,
  assets_done: 3,
  assets_total: 5,
  assets: [
    { asset_type: 'FACEBOOK_PAGE', external_id: '1287452237795325', handle: 'Trattoria em Casa', status: 'VERIFIED' },
    { asset_type: 'INSTAGRAM', external_id: '17841424315618975', handle: 'trattoriaemcasa.oficial', status: 'LINKED' },
    pixel || { asset_type: 'PIXEL', external_id: null, handle: null, status: 'PENDING_API' },
    { asset_type: 'WHATSAPP', external_id: null, handle: null, status: 'PENDING_OPERATOR' },
    { asset_type: 'AD_ACCOUNT', external_id: null, handle: null, status: 'NOT_NEEDED' }
  ]
});

const setup = (brand: Brand, role = 'ADMIN') => {
  const apiFetch = vi.fn(async (url: string, _opts?: any) => {
    if (url === '/brands') return { brands: [brand] };
    if (url.endsWith('/verify')) return { results: [{ asset_type: 'INSTAGRAM', ok: true }] };
    if (url.endsWith('/provision/pixel')) return { pixel_id: '5566' };
    return {};
  });
  const ok = vi.fn();
  render(<BrandsView currentUser={{ id: 'u', role }} apiFetch={apiFetch} showError={vi.fn()} showSuccess={ok} />);
  return { apiFetch, ok };
};

describe('NORQVA-0018 — tela Marcas', () => {
  it('mostra o checklist da marca com status e orientação do que falta', async () => {
    setup(trattoria());
    await screen.findByText('Trattoria em Casa');
    expect(within(screen.getByTestId('asset-FACEBOOK_PAGE')).getByText('Conferido na Meta')).toBeInTheDocument();
    expect(within(screen.getByTestId('asset-INSTAGRAM')).getByText('@trattoriaemcasa.oficial · 17841424315618975')).toBeInTheDocument();
    expect(within(screen.getByTestId('asset-WHATSAPP')).getByText(/número exclusivo da marca/)).toBeInTheDocument();
    expect(screen.getByText('3/5 prontos')).toBeInTheDocument();
  });

  it('confere na Meta e cria o pixel só depois de confirmar', async () => {
    const { apiFetch, ok } = setup(trattoria());
    await screen.findByText('Trattoria em Casa');
    fireEvent.click(screen.getByText('Conferir na Meta'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/brands/b1/verify', { method: 'POST' }));

    fireEvent.click(await screen.findByText('Criar pixel na Meta'));
    expect(apiFetch.mock.calls.some(c => c[0].endsWith('/provision/pixel'))).toBe(false);
    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/brands/b1/provision/pixel', { method: 'POST' }));
    await waitFor(() => expect(ok).toHaveBeenCalledWith(expect.stringContaining('pixel padrão até você ativar')));
  });

  it('pixel verificado: ativar envio de vendas pede confirmação e manda enabled=true', async () => {
    const { apiFetch } = setup(trattoria({ asset_type: 'PIXEL', external_id: '5566', handle: null, status: 'VERIFIED', routing_enabled: false }));
    await screen.findByText('vendas ainda no pixel padrão');
    fireEvent.click(screen.getByText('Enviar vendas para este pixel'));
    expect(screen.getByText(/deixam de receber as compras/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/brands/b1/pixel-routing', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ enabled: true }) }))
    );
  });

  it('quem não é ADMIN só visualiza', async () => {
    setup(trattoria(), 'CREATIVE');
    await screen.findByText('Trattoria em Casa');
    expect(screen.queryByText('Conferir na Meta')).toBeNull();
    expect(screen.queryByText('Criar pixel na Meta')).toBeNull();
    expect(screen.queryByText('Registrar')).toBeNull();
  });
});
