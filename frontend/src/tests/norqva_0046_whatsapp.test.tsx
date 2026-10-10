// NORQVA-0046 etapa 1: tela WhatsApp (números, QR Code, troca e conversas).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { WhatsAppView } from '../features/whatsapp/WhatsAppView';

const admin = { id: 'u', name: 'A', role: 'ADMIN', email: 'a@x.test' } as any;

const number = {
  id: 'n1', label: 'Trattoria 1', brand_id: null, brand_name: 'Trattoria', phone: '5511988887777',
  status: 'CONNECTED', status_reason: null, bot_enabled: false, conversations: 1, needs_human: 0
};
const conversation = {
  id: 'c1', number_id: 'n1', number_label: 'Trattoria 1', brand_name: 'Trattoria', contact_phone: '5521977776666',
  contact_name: 'Maria', mode: 'BOT', needs_human: false, unread_count: 2, last_message_at: new Date().toISOString(), last_message_preview: 'Oi, quanto custa?'
};

function makeApi(overrides: Record<string, any> = {}) {
  return vi.fn(async (url: string, opts?: RequestInit) => {
    const method = opts?.method || 'GET';
    if (url === '/whatsapp/numbers' && method === 'GET') return overrides.numbers ?? { numbers: [number], max: 100, server_configured: true };
    if (url === '/brands') return { brands: [{ id: 'b1', name: 'Trattoria' }] };
    if (url === '/whatsapp/numbers' && method === 'POST') return { id: 'n2' };
    if (url.endsWith('/connect')) return { number: { ...number, status: 'CONNECTING' }, qr_base64: 'QRDATA' };
    if (url.endsWith('/swap')) return { number: { ...number, status: 'CONNECTING' }, qr_base64: 'QRSWAP' };
    if (url.endsWith('/status')) return { number: { ...number, status: 'CONNECTING' }, qr_base64: 'QRDATA' };
    if (url.startsWith('/whatsapp/conversations?')) return { conversations: [conversation] };
    if (url === '/whatsapp/conversations/c1/messages' && method === 'GET') {
      return { conversation: { ...conversation }, messages: [{ id: 'm1', direction: 'IN', author: 'CUSTOMER', body: 'Oi, quanto custa?', send_status: 'OK', created_at: new Date().toISOString() }] };
    }
    if (url === '/whatsapp/conversations/c1/messages' && method === 'POST') return { ok: true };
    if (url.endsWith('/mode')) return { ok: true };
    return {};
  });
}

describe('NORQVA-0046 — tela WhatsApp', () => {
  it('lista conversas, abre e responde', async () => {
    const api = makeApi();
    render(<WhatsAppView currentUser={admin} apiFetch={api} showError={vi.fn()} showSuccess={vi.fn()} />);
    const item = await screen.findByText('Maria');
    fireEvent.click(item);
    const thread = await screen.findByTestId('wa-thread');
    expect(within(thread).getByText('Oi, quanto custa?')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá!' } });
    fireEvent.click(screen.getByLabelText('Enviar'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/whatsapp/conversations/c1/messages', expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Olá!' }) })));
    fireEvent.click(screen.getByText('Assumir conversa'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/whatsapp/conversations/c1/mode', expect.objectContaining({ body: JSON.stringify({ mode: 'HUMAN' }) })));
  });

  it('cadastra número com marca e mostra o QR Code ao conectar', async () => {
    const api = makeApi({ numbers: { numbers: [{ ...number, status: 'NEW', phone: null }], max: 100, server_configured: true } });
    render(<WhatsAppView currentUser={admin} apiFetch={api} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText('Números'));
    expect(await screen.findByText('Cadastrar número (1 de 100)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nome do número'), { target: { value: 'Dolci 1' } });
    await screen.findByRole('option', { name: 'Trattoria' });
    fireEvent.change(screen.getByLabelText('Marca do número'), { target: { value: 'b1' } });
    fireEvent.click(screen.getByText('Cadastrar'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/whatsapp/numbers', expect.objectContaining({ method: 'POST', body: JSON.stringify({ label: 'Dolci 1', brand_id: 'b1' }) })));
    fireEvent.click(screen.getByText('Conectar'));
    const qr = await screen.findByTestId('wa-qr');
    expect(within(qr).getByAltText('QR Code do WhatsApp')).toHaveAttribute('src', 'data:image/png;base64,QRDATA');
  });

  it('trocar número pede confirmação antes', async () => {
    const api = makeApi();
    render(<WhatsAppView currentUser={admin} apiFetch={api} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText('Números'));
    fireEvent.click(await screen.findByText('Trocar número'));
    expect(screen.getByTestId('wa-confirm')).toHaveTextContent('conversas continuam');
    expect(api).not.toHaveBeenCalledWith('/whatsapp/numbers/n1/swap', expect.anything());
    fireEvent.click(screen.getByText('Sim, trocar'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/whatsapp/numbers/n1/swap', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByTestId('wa-qr')).toBeInTheDocument();
  });

  it('avisa quando o servidor do WhatsApp ainda não está ligado', async () => {
    const api = makeApi({ numbers: { numbers: [], max: 100, server_configured: false } });
    render(<WhatsAppView currentUser={admin} apiFetch={api} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText('Números'));
    expect(await screen.findByTestId('wa-not-configured')).toBeInTheDocument();
  });
});
