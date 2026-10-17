// NORQVA-0092: tela de gestão da Equipe (administrador). Servidor simulado.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TeamManagement } from '../features/settings/TeamManagement';
import { TeamView } from '../features/settings/SettingsViews';

const me = { id: 'u-admin', name: 'Ricardo', email: 'ricardo@norqva.test', role: 'ADMIN', status: 'ACTIVE', accepted: true };
const ana = { id: 'u-ana', name: 'Ana', email: 'ana@norqva.test', role: 'CREATIVE', status: 'ACTIVE', accepted: false, invited_at: '2026-10-16T12:00:00Z' };

function server() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const apiFetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.startsWith('/team?')) return { users: [ana, me] };
    if (url.startsWith('/team/invite')) {
      const b = JSON.parse(String(init?.body));
      return { member: { id: 'u-novo', name: b.name, email: b.email, role: b.role, status: 'ACTIVE', accepted: false }, invite: { sent: true } };
    }
    if (url.includes('/deactivate')) return { member: { ...ana, status: 'INACTIVE' } };
    if (url.startsWith('/team/u-ana?')) return { member: { ...ana, ...JSON.parse(String(init?.body)) } };
    return {};
  });
  return { apiFetch, calls };
}

describe('NORQVA-0092 — tela Equipe', () => {
  it('lista ativos, mostra convite pendente e quem é você', async () => {
    const { apiFetch } = server();
    render(<TeamManagement currentUser={me} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByText('ana@norqva.test')).toBeInTheDocument();
    expect(screen.getByText(/Convite enviado/)).toBeInTheDocument();
    expect(screen.getByText('(você)')).toBeInTheDocument();
  });

  it('convida com nome, e-mail e perfil', async () => {
    const { apiFetch, calls } = server();
    const ok = vi.fn();
    render(<TeamManagement currentUser={me} apiFetch={apiFetch} showError={vi.fn()} showSuccess={ok} />);
    await screen.findByText('ana@norqva.test');
    fireEvent.click(screen.getByRole('button', { name: /Convidar pessoa/i }));
    const form = screen.getByRole('form', { name: 'Convidar pessoa' });
    fireEvent.change(within(form).getByLabelText('Nome'), { target: { value: 'Bruno' } });
    fireEvent.change(within(form).getByLabelText('E-mail'), { target: { value: 'bruno@norqva.test' } });
    fireEvent.change(within(form).getByLabelText('Perfil'), { target: { value: 'PERFORMANCE' } });
    fireEvent.click(within(form).getByRole('button', { name: /Enviar convite/i }));
    await waitFor(() => expect(ok).toHaveBeenCalledWith('Convite enviado para bruno@norqva.test.'));
    const inv = calls.find((c) => c.url.startsWith('/team/invite'));
    expect(JSON.parse(String(inv?.init?.body))).toEqual({ name: 'Bruno', email: 'bruno@norqva.test', role: 'PERFORMANCE' });
    expect(await screen.findByText('bruno@norqva.test')).toBeInTheDocument();
  });

  it('desativar pede confirmação antes de chamar o servidor', async () => {
    const { apiFetch, calls } = server();
    render(<TeamManagement currentUser={me} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByText('ana@norqva.test');
    const rows = screen.getAllByRole('button', { name: 'Gerenciar' });
    fireEvent.click(rows[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar convite' }));
    expect(calls.some((c) => c.url.includes('/deactivate'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desativação' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/team/u-ana/deactivate?mode=real')).toBe(true));
    expect(await screen.findByText('Desativado')).toBeInTheDocument();
  });

  it('troca de perfil pede confirmação', async () => {
    const { apiFetch, calls } = server();
    render(<TeamManagement currentUser={me} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByText('ana@norqva.test');
    fireEvent.click(screen.getAllByRole('button', { name: 'Gerenciar' })[0]);
    fireEvent.change(screen.getByLabelText('Perfil'), { target: { value: 'PRODUCT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/team/u-ana?mode=real' && c.init?.method === 'PATCH')).toBe(true));
  });

  it('você não se desativa nem tira o próprio perfil de administrador', async () => {
    const { apiFetch } = server();
    render(<TeamManagement currentUser={me} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByText('ana@norqva.test');
    fireEvent.click(screen.getAllByRole('button', { name: 'Gerenciar' })[1]);
    expect(screen.queryByRole('button', { name: /Desativar acesso/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Perfil')).toBeDisabled();
  });

  it('quem não é administrador só vê a lista', () => {
    render(<TeamView users={[ana]} currentUser={{ id: 'x', role: 'PERFORMANCE' }} isDemoView={false} apiFetch={vi.fn()} />);
    expect(screen.getByText('ana@norqva.test')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Convidar pessoa/i })).not.toBeInTheDocument();
  });
});
