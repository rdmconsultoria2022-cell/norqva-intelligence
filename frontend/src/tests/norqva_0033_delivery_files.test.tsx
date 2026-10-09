// NORQVA-0033: PDF entregue ao comprador, trocado pela tela (só ADMIN), com confirmação e histórico.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeliveryFiles, pickProblem, fmtSize } from '../features/products/DeliveryFiles';
import { OfferCard } from '../features/products/ProductsView';

const off = { id: 'off-1', human_id: 'OFF-000001', name: 'Trattoria', status: 'ATIVA', price: '19.90', is_demo: false };
const asset = {
  id: 'a1',
  name: 'Trattoria PDF',
  storage_bucket: 'digital-products',
  storage_path: 'TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf',
  file_size_bytes: null,
  file_original_name: null,
  file_updated_at: null,
  also_used_by: [],
  versions: [{ id: 'v1', original_name: 'TRATTORIA_V3.pdf', size_bytes: 4400814, replaced_at: '2026-10-09T04:00:00Z', replaced_by_email: 'r@x' }]
};
const pdfFile = (name = 'TRATTORIA_EM_CASA_PREMIUM_FINAL_4.pdf', size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

describe('NORQVA-0033 — PDF entregue ao comprador', () => {
  it('troca só depois de confirmar o aviso e manda o PDF bruto com o nome', async () => {
    const apiFetch = vi.fn(async (url: string, opts?: any) => (opts?.method ? { ok: true } : { assets: [asset] }));
    const showSuccess = vi.fn();
    render(<DeliveryFiles off={off} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={showSuccess} />);
    expect(await screen.findByTestId('delivery-asset')).toHaveTextContent('digital-products/TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf');
    expect(screen.getByTestId('delivery-asset')).toHaveTextContent('Confira baixando');
    expect(screen.getByTestId('delivery-replace')).toBeDisabled();
    const f = pdfFile();
    fireEvent.change(screen.getByLabelText('Novo PDF para trocar'), { target: { files: [f] } });
    fireEvent.click(screen.getByTestId('delivery-replace'));
    expect(apiFetch.mock.calls.some((c: any[]) => c[1]?.method === 'PUT')).toBe(false);
    expect(screen.getByTestId('delivery-confirm')).toHaveTextContent('Quem já comprou passa a receber esta versão');
    fireEvent.click(screen.getByTestId('delivery-confirm-replace'));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    const put = apiFetch.mock.calls.find((c: any[]) => c[1]?.method === 'PUT') as any;
    expect(put[0]).toBe('/digital-assets/a1/file');
    expect(put[1].headers['Content-Type']).toBe('application/pdf');
    expect(decodeURIComponent(put[1].headers['x-file-name'])).toBe('TRATTORIA_EM_CASA_PREMIUM_FINAL_4.pdf');
    expect(put[1].body).toBe(f);
  });

  it('volta versão com dois cliques', async () => {
    const apiFetch = vi.fn(async (url: string, opts?: any) => (opts?.method ? {} : { assets: [asset] }));
    render(<DeliveryFiles off={off} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('delivery-restore'));
    expect(apiFetch.mock.calls.some((c: any[]) => String(c[0]).includes('/restore'))).toBe(false);
    fireEvent.click(screen.getByTestId('delivery-restore-confirm'));
    await waitFor(() => expect(apiFetch.mock.calls.some((c: any[]) => c[0] === '/digital-assets/a1/versions/v1/restore' && c[1]?.method === 'POST')).toBe(true));
  });

  it('oferta sem arquivo: envia e liga', async () => {
    const apiFetch = vi.fn(async (url: string, opts?: any) => (opts?.method ? {} : { assets: [] }));
    render(<DeliveryFiles off={{ ...off, id: 'off-9' }} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('delivery-new')).toHaveTextContent('ainda não entrega nenhum arquivo');
    fireEvent.change(screen.getByLabelText('PDF desta oferta'), { target: { files: [pdfFile('DOLCI_DELLA_NONNA.pdf')] } });
    fireEvent.click(screen.getByTestId('delivery-create'));
    await waitFor(() => expect(apiFetch.mock.calls.some((c: any[]) => c[0] === '/offers/off-9/delivery-files' && c[1]?.method === 'POST')).toBe(true));
  });

  it('avisa quando o arquivo é de outra oferta também, e recusa não-PDF antes de enviar', async () => {
    const apiFetch = vi.fn(async () => ({ assets: [{ ...asset, also_used_by: ['OFF-000005'] }] }));
    render(<DeliveryFiles off={off} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('delivery-shared')).toHaveTextContent('OFF-000005');
    fireEvent.change(screen.getByLabelText('Novo PDF para trocar'), { target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] } });
    expect(screen.getByText('Escolha um arquivo PDF.')).toBeInTheDocument();
    expect(screen.getByTestId('delivery-replace')).toBeDisabled();
  });

  it('regras e formatação', () => {
    expect(pickProblem(null)).toBe('Escolha o PDF.');
    expect(pickProblem(pdfFile('a.pdf', 0))).toBe('O arquivo está vazio.');
    expect(pickProblem({ name: 'a.pdf', type: 'application/pdf', size: 51 * 1024 * 1024 } as any)).toBe('Arquivo maior que 50 MB.');
    expect(pickProblem(pdfFile())).toBeNull();
    expect(fmtSize(4343496)).toBe('4,1 MB');
    expect(fmtSize(301000)).toBe('294 KB');
  });

  it('o botão só aparece para ADMIN no cartão da oferta', () => {
    const base = { off, canEdit: true, onCheckout: vi.fn(), onUpdateOfferStatus: vi.fn(), onManageAssets: vi.fn(), deliveryFiles: <div>painel</div> };
    const { rerender } = render(<OfferCard {...base} isAdmin={false} />);
    expect(screen.queryByTestId('toggle-delivery-files')).not.toBeInTheDocument();
    rerender(<OfferCard {...base} isAdmin={true} />);
    fireEvent.click(screen.getByTestId('toggle-delivery-files'));
    expect(screen.getByText('painel')).toBeInTheDocument();
  });
});
