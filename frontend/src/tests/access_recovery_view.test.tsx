import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccessRecoveryView } from '../features/delivery/AccessRecoveryView';
import App from '../App';
import { supabase } from '../supabase';
import { getPurchaseSession } from '../services/purchaseSession';

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
    }
  }
}));

describe('NORQVA — AccessRecoveryView & Magic Link Route Contract (A - F)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null }, error: null });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  // A & B: URL /acesso/test-token-123 resolves token and calls GET /api/checkout/recovery/test-token-123
  it('A & B: URL /acesso/test-token-123 extracts token and invokes GET /api/checkout/recovery/:recoveryToken', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          orderId: 'ord-abc-789',
          checkoutToken: 'session-xyz-456',
          offerHumanId: 'OFF-000001',
          offerName: 'Trattoria em Casa',
          status: 'PAID'
        })
      });
    });

    render(
      <MemoryRouter initialEntries={['/acesso/test-token-123']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(capturedUrl).toContain('/checkout/recovery/test-token-123');
    });
  });

  // C: Missing token shows "Chave de acesso não fornecida."
  it('C: URL /acesso/ without token renders "Chave de acesso não fornecida."', async () => {
    const recoveryFetchSpy = vi.fn();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/checkout/recovery')) {
        return recoveryFetchSpy(url);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ users: [] })
      });
    });

    render(
      <MemoryRouter initialEntries={['/acesso/']}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText('Chave de Acesso Inválida ou Expirada')).toBeInTheDocument();
    expect(await screen.findByText('Chave de acesso não fornecida.')).toBeInTheDocument();
    expect(recoveryFetchSpy).not.toHaveBeenCalled();
  });

  // D: Claim success persists customer session and navigates to /pedido/:orderId/entrega#token=...
  it('D: Claim success persists customer session in localStorage and completes flow', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        orderId: 'ord-persisted-999',
        checkoutToken: 'session-fresh-token-111',
        offerHumanId: 'OFF-000001',
        offerName: 'Trattoria em Casa — Edição Digital',
        status: 'PAID'
      })
    });

    const showSuccessSpy = vi.fn();

    render(
      <MemoryRouter initialEntries={['/acesso/tok-success-claim-001']}>
        <AccessRecoveryView showSuccess={showSuccessSpy} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(showSuccessSpy).toHaveBeenCalledWith('Acesso restaurado com sucesso!');
    });

    // Check localStorage session persistence
    const saved = getPurchaseSession('ord-persisted-999');
    expect(saved).toBeDefined();
    expect(saved?.orderId).toBe('ord-persisted-999');
    expect(saved?.checkoutToken).toBe('session-fresh-token-111');
    expect(saved?.status).toBe('PAID');
  });

  // E: Claim 410 returns link invalid/expired error presentation
  it('E: Claim 410 returns and presents friendly invalid or expired message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 410,
      json: async () => ({
        error: 'Este link de acesso não é mais válido. Solicite um novo link.'
      })
    });

    const showErrorSpy = vi.fn();

    render(
      <MemoryRouter initialEntries={['/acesso/tok-expired-410']}>
        <AccessRecoveryView showError={showErrorSpy} />
      </MemoryRouter>
    );

    expect(await screen.findByText('Chave de Acesso Inválida ou Expirada')).toBeInTheDocument();
    expect(await screen.findByText('Este link de acesso não é mais válido. Solicite um novo link.')).toBeInTheDocument();
    expect(showErrorSpy).toHaveBeenCalledWith('Este link de acesso não é mais válido. Solicite um novo link.');
  });

  // F: Zero token leakage in logs
  it('F: Raw recovery token and credentials are never logged to console on failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const rawSecretToken = 'secret-raw-recovery-token-xyz999';

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error during recovery'));

    render(
      <MemoryRouter initialEntries={[`/acesso/${rawSecretToken}`]}>
        <AccessRecoveryView />
      </MemoryRouter>
    );

    await screen.findByText('Chave de Acesso Inválida ou Expirada');

    const allConsoleCalls = [...errorSpy.mock.calls, ...logSpy.mock.calls].map(c => c.join(' ')).join(' ');
    expect(allConsoleCalls).not.toContain(rawSecretToken);

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
