// NORQVA-0033: PDF entregue ao comprador, trocado pela tela (só ADMIN), com confirmação e histórico.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeliveryFiles, pickProblem, fmtSize, friendlyError, titleFromFileName } from '../features/products/DeliveryFiles';
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
    expect(screen.getByTestId('delivery-confirm')).toHaveTextContent('Entra: TRATTORIA_EM_CASA_PREMIUM_FINAL_4.pdf');
    fireEvent.click(screen.getByTestId('delivery-confirm-replace'));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    const put = apiFetch.mock.calls.find((c: any[]) => c[1]?.method === 'PUT') as any;
    expect(put[0]).toBe('/digital-assets/a1/file');
    expect(put[1].headers['Content-Type']).toBe('application/pdf');
    expect(decodeURIComponent(put[1].headers['x-file-name'])).toBe('TRATTORIA_EM_CASA_PREMIUM_FINAL_4.pdf');
    expect(put[1].body).toBe(f);
  });

  it('cada arquivo tem a sua escolha: o PDF escolhido num não vale para o outro', async () => {
    const a2 = { ...asset, id: 'a2', name: 'Bônus PDF', versions: [] };
    const apiFetch = vi.fn(async () => ({ assets: [asset, a2] }));
    render(<DeliveryFiles off={off} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findAllByTestId('delivery-asset');
    const pickers = screen.getAllByLabelText('Novo PDF para trocar');
    fireEvent.change(pickers[0], { target: { files: [pdfFile()] } });
    const buttons = screen.getAllByTestId('delivery-replace');
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).toBeDisabled();
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
    expect(friendlyError(new SyntaxError("Unexpected token '<'"), 'x')).toMatch(/Baixar para conferir/);
    expect(friendlyError(new Error('Esse é exatamente o arquivo'), 'x')).toBe('Esse é exatamente o arquivo');
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

// NORQVA-0113: vários PDFs de uma vez
describe('NORQVA-0113 — vários PDFs de uma vez', () => {
  it('título vem do nome do arquivo', () => {
    expect(titleFromFileName('01_Guia_do_Desafio.pdf')).toBe('01 · Guia do Desafio');
    expect(titleFromFileName('03_Cardapio_Lento_Padrao.pdf')).toBe('03 · Cardapio Lento Padrao');
    expect(titleFromFileName('Bonus.pdf')).toBe('Bonus');
  });

  it('envia em ordem: o primeiro como arquivo principal (oferta vazia) e os outros como extras com título', async () => {
    const apiFetch = vi.fn(async (url: string, opts?: any) => (opts?.method ? { ok: true } : { assets: [] }));
    const showSuccess = vi.fn();
    render(<DeliveryFiles off={off} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={showSuccess} />);
    await screen.findByTestId('delivery-many');
    const files = [pdfFile('02_Livro_de_Receitas.pdf'), pdfFile('01_Guia_do_Desafio.pdf')];
    fireEvent.change(screen.getByLabelText('Adicionar vários PDFs'), { target: { files } });
    expect(screen.getByTestId('delivery-many-list')).toHaveTextContent('01 · Guia do Desafio');
    fireEvent.click(screen.getByTestId('delivery-many-send'));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    const posts = apiFetch.mock.calls.filter((c: any[]) => c[1]?.method === 'POST') as any[];
    expect(posts).toHaveLength(2);
    expect(posts[0][0]).toBe('/offers/off-1/delivery-files');
    expect(decodeURIComponent(posts[0][1].headers['x-file-name'])).toBe('01_Guia_do_Desafio.pdf');
    expect(posts[1][0]).toBe('/offers/off-1/delivery-files/extra?title=' + encodeURIComponent('02 · Livro de Receitas'));
  });

  it('com arquivo já ligado, todos vão como extras', async () => {
    const apiFetch = vi.fn(async (url: string, opts?: any) => (opts?.method ? { ok: true } : { assets: [asset] }));
    render(<DeliveryFiles off={off} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByTestId('delivery-many');
    fireEvent.change(screen.getByLabelText('Adicionar vários PDFs'), { target: { files: [pdfFile('05_Bonus.pdf')] } });
    fireEvent.click(screen.getByTestId('delivery-many-send'));
    await waitFor(() => expect(apiFetch.mock.calls.some((c: any[]) => String(c[0]).includes('/extra?title='))).toBe(true));
    expect(apiFetch.mock.calls.some((c: any[]) => c[0] === '/offers/off-1/delivery-files' && c[1]?.method === 'POST')).toBe(false);
  });

  it('falha no meio: diz quantos foram, recarrega e o reenvio manda só os que faltam', async () => {
    let linked: any[] = [];
    let failOnce = true;
    const apiFetch = vi.fn(async (url: string, opts?: any) => {
      if (!opts?.method) return { assets: linked };
      if (url.includes('/extra') && failOnce) {
        failOnce = false;
        throw new Error('Arquivo maior que 50 MB.');
      }
      linked = [...linked, { ...asset, id: 'a' + linked.length }];
      return { ok: true };
    });
    const showError = vi.fn();
    const showSuccess = vi.fn();
    render(<DeliveryFiles off={off} apiFetch={apiFetch as any} showError={showError} showSuccess={showSuccess} />);
    await screen.findByTestId('delivery-many');
    const files = [pdfFile('01_A.pdf'), pdfFile('02_B.pdf'), pdfFile('03_C.pdf')];
    fireEvent.change(screen.getByLabelText('Adicionar vários PDFs'), { target: { files } });
    fireEvent.click(screen.getByTestId('delivery-many-send'));
    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(showError.mock.calls[0][0]).toContain('1 de 3 PDFs enviados');
    expect(showError.mock.calls[0][0]).toContain('02_B.pdf');
    await waitFor(() => expect(screen.getByTestId('delivery-many-list')).not.toHaveTextContent('01 · A'));
    fireEvent.click(screen.getByTestId('delivery-many-send'));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    const posts = apiFetch.mock.calls.filter((c: any[]) => c[1]?.method === 'POST').map((c: any[]) => c[0]);
    expect(posts.filter((u: string) => u === '/offers/off-1/delivery-files')).toHaveLength(1);
    expect(posts.slice(2)).toEqual([
      '/offers/off-1/delivery-files/extra?title=' + encodeURIComponent('02 · B'),
      '/offers/off-1/delivery-files/extra?title=' + encodeURIComponent('03 · C')
    ]);
  });
});
