// NORQVA-0125: tela "Pagamentos não concluídos" (Vendas → WhatsApp), só ADMIN.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { WhatsAppView } from '../features/whatsapp/WhatsAppView';

const admin = { id: 'u', name: 'A', role: 'ADMIN', email: 'a@x.test' } as any;
const ops = { id: 'o', name: 'O', role: 'OPERATIONS', email: 'o@x.test' } as any;

const overview = (over: any = {}) => ({
  enabled: true,
  number: { label: 'Trattoria 5642', phone: '5531985855642', ready: true },
  number_problem: null,
  window: { start: '09:00', end: '20:00', open: true },
  people: [
    { phone_key: '553199990001', phone_masked: '(31) •••••-0001', first_name: 'Maria', product_name: 'Kit Trattoria Completo', order_created_at: '2026-10-23T15:00:00Z', pending_orders: 2, last_attempt: null, preview: 'Oi, Maria! Aqui é da NORQVA. Vi que você começou a compra do Kit Trattoria Completo' },
    { phone_key: '553199990002', phone_masked: '(31) •••••-0002', first_name: 'Ana', product_name: 'Dolci della Nonna', order_created_at: '2026-10-22T15:00:00Z', pending_orders: 1, last_attempt: { status: 'FAILED', reason: 'O WhatsApp não aceitou a mensagem' }, preview: 'Oi, Ana! Aqui é da NORQVA. Vi que você começou a compra do Dolci della Nonna' }
  ],
  excluded: { PAID: 3, OPTED_OUT: 1, OFFER_INACTIVE: 2 },
  history: [
    { id: 'h1', phone_masked: '(31) •••••-0009', first_name: 'Gabi', product_name: 'Kit', status: 'SKIPPED', reason: 'Já pagou', queued_at: '2026-10-24T12:00:00Z', sent_at: null },
    { id: 'h2', phone_masked: '(31) •••••-0010', first_name: 'Igor', product_name: 'Kit', status: 'SENT', reason: null, queued_at: '2026-10-24T12:00:00Z', sent_at: '2026-10-24T12:02:00Z' }
  ],
  ...over
});

function makeApi(data: any) {
  return vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === '/whatsapp/recovery') return data;
    if (url === '/whatsapp/recovery/send') return { queued: 1, selected: 1 };
    if (url.startsWith('/whatsapp/conversations')) return { conversations: [] };
    if (url === '/whatsapp/numbers') return { numbers: [], max: 100, server_configured: true };
    return {};
  });
}

describe('NORQVA-0125 — pagamentos não concluídos', () => {
  it('só ADMIN vê a aba', () => {
    render(<WhatsAppView currentUser={ops} apiFetch={makeApi(overview())} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(screen.queryByText('Pagamentos não concluídos')).toBeNull();
  });

  it('lista, tira uma pessoa, mostra a mensagem e envia com confirmação', async () => {
    const api = makeApi(overview());
    const ok = vi.fn();
    render(<WhatsAppView currentUser={admin} apiFetch={api} showError={vi.fn()} showSuccess={ok} />);
    fireEvent.click(screen.getByText('Pagamentos não concluídos'));
    await screen.findByText('Maria');
    expect(screen.getByText(/Prontos para receber \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Última tentativa: Falhou/)).toBeInTheDocument();
    expect(screen.getByTestId('wa-recovery-preview').textContent).toContain('Oi, Maria!');

    fireEvent.click(screen.getByTestId('wa-recovery-person-553199990002'));
    expect(screen.getByTestId('wa-recovery-preview').textContent).toContain('Oi, Ana!');

    fireEvent.click(screen.getByLabelText('Incluir Ana'));
    fireEvent.click(screen.getByText('Enviar'));
    const confirm = screen.getByTestId('wa-recovery-confirm');
    expect(within(confirm).getByText(/Enviar para 1 pessoa/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByText('Confirmar envio'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/whatsapp/recovery/send', expect.objectContaining({ method: 'POST', body: JSON.stringify({ phone_keys: ['553199990001'] }) })));
    await waitFor(() => expect(ok).toHaveBeenCalled());

    const hist = screen.getByTestId('wa-recovery-history');
    expect(within(hist).getByText('Pulada')).toBeInTheDocument();
    expect(within(hist).getByText('Enviada')).toBeInTheDocument();
    expect(within(hist).getByText(/Já pagou/)).toBeInTheDocument();
  });

  it('chave desligada: lista aparece e Enviar fica desligado com aviso', async () => {
    render(<WhatsAppView currentUser={admin} apiFetch={makeApi(overview({ enabled: false }))} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText('Pagamentos não concluídos'));
    await screen.findByText('Maria');
    expect(screen.getByTestId('wa-recovery-blocked').textContent).toMatch(/desligado/);
    expect((screen.getByText('Enviar').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('número desconectado: Enviar desligado e o motivo aparece', async () => {
    render(<WhatsAppView currentUser={admin} apiFetch={makeApi(overview({ number_problem: 'O número "Trattoria 5642" não está conectado.' }))} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText('Pagamentos não concluídos'));
    await screen.findByText('Maria');
    expect(screen.getByTestId('wa-recovery-blocked').textContent).toMatch(/não está conectado/);
    expect((screen.getByText('Enviar').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
