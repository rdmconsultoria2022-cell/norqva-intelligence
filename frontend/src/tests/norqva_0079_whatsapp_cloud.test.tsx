// NORQVA-0079: painel "WhatsApp oficial (Meta)" na aba Números e conversa com a janela de 24h fechada.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { WhatsAppView } from '../features/whatsapp/WhatsAppView';

const admin = { id: 'u', name: 'A', role: 'ADMIN', email: 'a@x.test' } as any;

const account = {
  id: 'acc1', label: 'Trattoria — teste', brand_id: 'b1', brand_name: 'Trattoria', environment: 'TEST', waba_id: '111222333',
  app_id: '444555666', token_last4: 'TKA1', test_recipients: ['+55 •••• 6969'], status: 'VERIFIED',
  webhook_url: 'https://api.norqva.test/api/whatsapp/cloud/webhook/acc1', webhook_verified_at: null, last_check_at: null, last_error: null, numbers: 1
};
const official = {
  id: 'n9', label: 'Trattoria oficial', brand_id: 'b1', brand_name: 'Trattoria', phone: '15550100001', status: 'CONNECTED', status_reason: null,
  bot_enabled: false, conversations: 0, needs_human: 0, provider: 'META_CLOUD', cloud_environment: 'TEST', quality_rating: 'GREEN'
};
const conversation = {
  id: 'c9', number_id: 'n9', number_label: 'Trattoria oficial', brand_name: 'Trattoria', contact_phone: '5531988887777',
  contact_name: 'Ricardo', mode: 'HUMAN', needs_human: false, unread_count: 0, last_message_at: new Date().toISOString(), last_message_preview: 'oi'
};

function makeApi() {
  return vi.fn(async (url: string, opts?: RequestInit) => {
    const method = opts?.method || 'GET';
    if (url === '/whatsapp/numbers' && method === 'GET') return { numbers: [official], max: 100, server_configured: false };
    if (url === '/brands') return { brands: [{ id: 'b1', name: 'Trattoria' }] };
    if (url === '/whatsapp/cloud/accounts' && method === 'GET') {
      return { accounts: [account], locks: { send_enabled: false, environments: ['TEST'], evolution_enabled: false, secrets_key_configured: true } };
    }
    if (url === '/whatsapp/cloud/accounts' && method === 'POST') return { account: { ...account, id: 'acc2' }, verify_token: 'abc123verify' };
    if (url === '/whatsapp/cloud/accounts/acc1/check') return { ok: true, phone_numbers: [{ phone_number_id: '999', display_phone_number: '+1 555-010-0001', verified_name: 'Trattoria Teste', quality_rating: 'GREEN' }], subscribed: false };
    if (url === '/whatsapp/cloud/numbers' && method === 'POST') return { id: 'n10' };
    if (url === '/whatsapp/cloud/numbers/n9/register' && method === 'POST') return { ok: true, status: 'CONNECTED', status_reason: null };
    if (url.startsWith('/whatsapp/conversations?')) return { conversations: [conversation] };
    if (url === '/whatsapp/conversations/c9/messages' && method === 'GET') {
      return {
        conversation: { ...conversation, number_provider: 'META_CLOUD', window_open: false },
        messages: [
          { id: 'm1', direction: 'IN', author: 'CUSTOMER', body: 'oi', send_status: 'OK', delivery_status: null, created_at: new Date().toISOString() },
          { id: 'm2', direction: 'OUT', author: 'OPERATOR', body: 'Olá!', send_status: 'FAILED', delivery_status: 'BLOCKED', created_at: new Date().toISOString() }
        ]
      };
    }
    return {};
  });
}

describe('NORQVA-0079 — WhatsApp oficial na tela', () => {
  it('mostra travas, conta Meta sem segredos e número oficial sem QR Code', async () => {
    const api = makeApi();
    render(<WhatsAppView currentUser={admin} apiFetch={api} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText('Números'));
    const locks = await screen.findByTestId('wa-cloud-locks');
    expect(locks.textContent).toContain('bloqueado até a homologação');
    expect(locks.textContent).toContain('desligada');
    const acc = await screen.findByTestId('wa-cloud-account');
    expect(acc.textContent).toContain('TESTE');
    expect(acc.textContent).toContain('••••TKA1');
    expect(acc.textContent).toContain('/api/whatsapp/cloud/webhook/acc1');
    const card = await screen.findByTestId('wa-number');
    expect(within(card).getByTestId('wa-number-official').textContent).toContain('teste');
    expect(within(card).queryByText('Trocar número')).toBeNull();
    expect(within(card).getByText('Conferir na Meta')).toBeInTheDocument();
    // conexão não oficial desligada: sem o cadastro por QR Code
    expect(screen.queryByTestId('wa-new-number')).toBeNull();
  });

  it('cadastra conta e mostra o verify token uma vez; conferir lista os números para usar', async () => {
    const api = makeApi();
    render(<WhatsAppView currentUser={admin} apiFetch={api} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText('Números'));
    fireEvent.click(await screen.findByText('Nova conta Meta'));
    fireEvent.change(screen.getByLabelText('Nome da conta'), { target: { value: 'Trattoria — teste 2' } });
    fireEvent.change(screen.getByLabelText('ID da conta do WhatsApp Business'), { target: { value: '111222334' } });
    fireEvent.change(screen.getByLabelText('ID do app'), { target: { value: '444555666' } });
    fireEvent.change(screen.getByLabelText('Token de acesso'), { target: { value: 'EAAG-token' } });
    fireEvent.change(screen.getByLabelText('Chave secreta do app'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByText('Salvar conta Meta'));
    expect((await screen.findByTestId('wa-cloud-verify-token')).textContent).toContain('abc123verify');
    const post = api.mock.calls.find(c => c[0] === '/whatsapp/cloud/accounts' && (c[1] as RequestInit)?.method === 'POST');
    expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({ environment: 'TEST', waba_id: '111222334' });

    fireEvent.click(screen.getAllByText('Conferir')[0]);
    const phones = await screen.findByTestId('wa-cloud-phones');
    fireEvent.click(within(phones).getByText('Usar este número'));
    await waitFor(() => expect(api.mock.calls.some(c => c[0] === '/whatsapp/cloud/numbers')).toBe(true));
  });

  it('NORQVA-0102: "Ativar número" pede o PIN de 6 números e envia para a ativação', async () => {
    const api = makeApi();
    const ok = vi.fn();
    render(<WhatsAppView currentUser={admin} apiFetch={api} showError={vi.fn()} showSuccess={ok} />);
    fireEvent.click(screen.getByText('Números'));
    const card = await screen.findByTestId('wa-number');
    fireEvent.click(within(card).getByText('Ativar número'));
    const box = await screen.findByTestId('wa-register');
    const input = within(box).getByLabelText('PIN de 6 números') as HTMLInputElement;
    const btn = within(box).getByText('Ativar') as HTMLButtonElement;
    fireEvent.change(input, { target: { value: '12a34' } });
    expect(input.value).toBe('1234');
    expect(btn.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(btn);
    await waitFor(() => expect(ok).toHaveBeenCalledWith('Número ativado na API da Meta.'));
    const call = api.mock.calls.find(c => c[0] === '/whatsapp/cloud/numbers/n9/register');
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ pin: '123456' });
  });

  it('conversa com a janela de 24h fechada não deixa digitar e mostra mensagem bloqueada', async () => {
    const api = makeApi();
    render(<WhatsAppView currentUser={admin} apiFetch={api} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByText('Ricardo'));
    expect(await screen.findByTestId('wa-window-closed')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mensagem')).toBeNull();
    const thread = screen.getByTestId('wa-thread');
    expect(within(thread).getByText(/bloqueada/)).toBeInTheDocument();
  });
});
