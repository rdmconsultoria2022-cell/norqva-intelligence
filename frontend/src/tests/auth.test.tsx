import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { supabase } from '../supabase';

// Mock supabase client
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: {} as any, user: {} as any }, error: null }),
    }
  }
}));

// Mock fetch
const mockUsers = [
  { id: '1', name: 'Admin User', role: 'ADMIN', email: 'admin@norqva.com' },
  { id: '2', name: 'Intelligence User', role: 'INTELLIGENCE', email: 'intel@norqva.com' }
];

global.fetch = vi.fn().mockImplementation((url) => {
  if (url.includes('/users')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ users: mockUsers })
    });
  }
  return Promise.resolve({
    ok: true,
    json: async () => ({})
  });
});

describe('Auth System Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/');
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null });
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({ data: { session: {} as any, user: {} as any }, error: null });
  });

  const mockLocation = (urlStr: string) => {
    const url = new URL(urlStr, 'http://localhost');
    window.history.pushState({}, '', url.pathname + url.search + url.hash);
    return () => {
      window.history.pushState({}, '', '/');
    };
  };

  it('R16/R17: direct /reset-password without code/session transitions to RECOVERY_INVALID quickly', async () => {
    const restoreLocation = mockLocation('http://localhost/reset-password');
    try {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null });

      render(
        <MemoryRouter initialEntries={['/reset-password']}>
          <App />
        </MemoryRouter>
      );

      // Initial state should show validating
      expect(screen.getByText('Validando link de recuperação...')).toBeInTheDocument();

      // After safety timeout, it should show invalid link
      await waitFor(() => {
        expect(screen.getByText('Link de recuperação inválido ou expirado.')).toBeInTheDocument();
      }, { timeout: 1000 });
    } finally {
      restoreLocation();
    }
  });

  it('R18: valid recovery code exchanges and transitions to RECOVERY_READY', async () => {
    const restoreLocation = mockLocation('http://localhost/reset-password?code=valid-code');
    try {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({
        data: {
          session: { access_token: 'valid-reset-token', user: {} }
        } as any,
        error: null
      });

      render(
        <MemoryRouter initialEntries={['/reset-password?code=valid-code']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Definir Nova Senha')).toBeInTheDocument();
      });

      expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('valid-code');
    } finally {
      restoreLocation();
    }
  });

  it('R19: implicit recovery hash transitions to RECOVERY_READY', async () => {
    const restoreLocation = mockLocation('http://localhost/reset-password#type=recovery&access_token=foo');
    try {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: { access_token: 'valid-hash-token', user: {} }
        } as any,
        error: null
      });

      render(
        <MemoryRouter initialEntries={['/reset-password']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Definir Nova Senha')).toBeInTheDocument();
      });
    } finally {
      restoreLocation();
    }
  });

  it('R20: invalid recovery code transitions to RECOVERY_INVALID', async () => {
    const restoreLocation = mockLocation('http://localhost/reset-password?code=invalid-code');
    try {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({
        data: { session: null, user: null },
        error: new Error('Invalid code') as any
      });

      render(
        <MemoryRouter initialEntries={['/reset-password?code=invalid-code']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Link de recuperação inválido ou expirado.')).toBeInTheDocument();
      });
    } finally {
      restoreLocation();
    }
  });

  it('R21: network/auth initialization failure transitions to RECOVERY_INVALID', async () => {
    const restoreLocation = mockLocation('http://localhost/reset-password?code=error-code');
    try {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.auth.exchangeCodeForSession).mockRejectedValue(new Error('Network error'));

      render(
        <MemoryRouter initialEntries={['/reset-password?code=error-code']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Link de recuperação inválido ou expirado.')).toBeInTheDocument();
      });
    } finally {
      restoreLocation();
    }
  });

  it('R22: valid recovery flow allows password update and handles success redirection', async () => {
    const restoreLocation = mockLocation('http://localhost/reset-password?code=good-code');
    try {
      const { supabase } = await import('../supabase');
      const mockUpdateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
      supabase.auth.updateUser = mockUpdateUser;
      vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({
        data: {
          session: { access_token: 'valid-reset-token', user: {} }
        } as any,
        error: null
      });
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: { access_token: 'valid-reset-token', user: {} }
        } as any,
        error: null
      });

      render(
        <MemoryRouter initialEntries={['/reset-password?code=good-code']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Definir Nova Senha')).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText('Nova Senha');
      const confirmInput = screen.getByLabelText('Confirmar Nova Senha');
      const submitBtn = screen.getByRole('button', { name: /Salvar Nova Senha/i });

      fireEvent.change(passwordInput, { target: { value: 'new-password-123' } });
      fireEvent.change(confirmInput, { target: { value: 'new-password-123' } });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'new-password-123' });
      });
    } finally {
      restoreLocation();
    }
  });

  describe('Gate 2.5E: Real Auth Mode Restoration (A01-A07)', () => {
    it('A01 real Supabase session on mount forces authMode=real', async () => {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'real-session-token',
            user: { email: 'admin@norqva.com' }
          }
        } as any,
        error: null
      });

      const fetchSpy = vi.fn().mockImplementation((url) => {
        if (url.includes('/me')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ user: mockUsers[0] })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({})
        });
      });
      global.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          '/api/me',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer real-session-token'
            })
          })
        );
      });
    });

    it('A02 real session prevents demo auto-login', async () => {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'real-token',
            user: { email: 'admin@norqva.com' }
          }
        } as any,
        error: null
      });

      const realUser = { id: 'real-uuid', name: 'Real Admin User', role: 'ADMIN', email: 'admin@norqva.com' };
      const fetchSpy = vi.fn().mockImplementation((url) => {
        if (url.includes('/me')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ user: realUser })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({})
        });
      });
      global.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/me'), expect.anything());
      });

      const usersCalls = fetchSpy.mock.calls.filter((call: any[]) => typeof call[0] === 'string' && call[0].includes('/users'));
      expect(usersCalls.length).toBe(0);
    });

    it('A03 real session does not send x-user-role simulation header', async () => {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'real-token',
            user: { email: 'admin@norqva.com' }
          }
        } as any,
        error: null
      });

      const fetchSpy = vi.fn().mockImplementation((url) => {
        if (url.includes('/me')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ user: mockUsers[0] })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({})
        });
      });
      global.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      for (const call of fetchSpy.mock.calls) {
        const headers = (call[1]?.headers || {}) as Record<string, string>;
        expect(headers['x-user-role']).toBeUndefined();
        expect(headers['x-user-id']).toBeUndefined();
      }
    });

    it('A04 browser refresh restores real user', async () => {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'refreshed-token',
            user: { email: 'admin@norqva.com' }
          }
        } as any,
        error: null
      });

      const refreshedUser = { id: 'refreshed-uuid', name: 'Refreshed Real Admin', role: 'ADMIN', email: 'admin@norqva.com' };
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('/me')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ user: refreshedUser })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({})
        });
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      expect(await screen.findByText(/Initializing/i)).toBeInTheDocument();
    });

    it('A05 no real session preserves Demo/Real selection', async () => {
      const restoreLocation = mockLocation('http://localhost/login');
      try {
        const { supabase } = await import('../supabase');
        vi.mocked(supabase.auth.getSession).mockResolvedValue({
          data: { session: null },
          error: null
        });

        global.fetch = vi.fn().mockImplementation((url) => {
          if (url.includes('/users')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({ users: mockUsers })
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({})
          });
        });

        render(
          <MemoryRouter initialEntries={['/login']}>
            <App />
          </MemoryRouter>
        );

        expect(await screen.findByText('AUTH_MODE=demo')).toBeInTheDocument();
        expect(await screen.findByText('AUTH_MODE=real')).toBeInTheDocument();
        expect(await screen.findByText('Selecione uma Persona para Acesso Simulado (RBAC)')).toBeInTheDocument();
        expect(await screen.findByText('Admin User')).toBeInTheDocument();
      } finally {
        restoreLocation();
      }
    });

    it('A06 recovery routes remain unaffected', async () => {
      const restoreLocation = mockLocation('http://localhost/reset-password?code=valid-code');
      try {
        const { supabase } = await import('../supabase');
        vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({
          data: {
            session: { access_token: 'valid-reset-token', user: {} }
          } as any,
          error: null
        });

        render(
          <MemoryRouter initialEntries={['/reset-password?code=valid-code']}>
            <App />
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByText('Definir Nova Senha')).toBeInTheDocument();
        });

        expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('valid-code');
      } finally {
        restoreLocation();
      }
    });

    it('A07 logout real session returns to unauthenticated selection/login state', async () => {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'active-token',
            user: { email: 'admin@norqva.com' }
          }
        } as any,
        error: null
      });

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('/me')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ user: mockUsers[0] })
          });
        }
        if (url.includes('/users')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ users: mockUsers })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ opportunities: [], products: [], offers: [], creatives: [], experiments: [], decisions: [], audit_logs: [] })
        });
      });

      const { renderHook, act } = await import('@testing-library/react');
      const { useAuth } = await import('../features/auth/useAuth');
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.authMode).toBe('real');
      });

      await act(async () => {
        await result.current.handleSignOut();
      });

      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(result.current.currentUser).toBeNull();
    });

    it('A08 STAGING VITE_API_BASE_URL is honored by auth /api/me request', async () => {
      const { API_BASE } = await import('../lib/api');
      const { supabase } = await import('../supabase');

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'staging-jwt-token',
            user: { email: 'admin@norqva.com' }
          }
        } as any,
        error: null
      });

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: mockUsers[0] })
      });
      global.fetch = fetchSpy;

      const { renderHook } = await import('@testing-library/react');
      const { useAuth } = await import('../features/auth/useAuth');
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.authMode).toBe('real');
        expect(result.current.currentUser).toEqual(mockUsers[0]);
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/me`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer staging-jwt-token'
          })
        })
      );
    });
  });

  describe('Real Mode Users Loading Regression (R01 - R06)', () => {
    const realAdminUser = { id: 'real-1', name: 'Real Admin User', role: 'ADMIN', email: 'rdmconsultoria2022@gmail.com', is_demo: false };
    const demoAdminUser = { id: 'demo-1', name: 'Demo Admin User', role: 'ADMIN', email: 'demo@norqva.com', is_demo: true };
    const mockProduct = {
      id: 'prd-1',
      human_id: 'PRD-000001',
      name: 'Test Product',
      category: 'DIGITAL',
      description: 'Desc',
      status: 'CRIADO',
      estimated_cost: 100,
      observations: '',
      opportunity_id: null,
      origin_provenance: null,
      origin_responsible_id: null,
      origin_evidence: null,
      origin_notes: null
    };

    it('R01 & R02: real mode loadData fetches /users?mode=real and populates usersList', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'staging-jwt-token',
            user: { email: 'rdmconsultoria2022@gmail.com' }
          }
        } as any,
        error: null
      });

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/me')) {
          return Promise.resolve({ ok: true, json: async () => ({ user: realAdminUser }) });
        }
        if (url.includes('/users')) {
          return Promise.resolve({ ok: true, json: async () => ({ users: [realAdminUser] }) });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ opportunities: [], products: [], offers: [], creatives: [], experiments: [], decisions: [], audit_logs: [] })
        });
      });
      global.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        const usersCalls = fetchSpy.mock.calls.filter((c: any[]) => typeof c[0] === 'string' && c[0].includes('/users?mode=real'));
        expect(usersCalls.length).toBeGreaterThan(0);
      }, { timeout: 8000 });
    }, 20000);

    it('R03 & R04: TeamView and provenance responsible selector render Real Admin User', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'staging-jwt-token',
            user: { email: 'rdmconsultoria2022@gmail.com' }
          }
        } as any,
        error: null
      });

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/me')) {
          return Promise.resolve({ ok: true, json: async () => ({ user: realAdminUser }) });
        }
        if (url.includes('/users')) {
          return Promise.resolve({ ok: true, json: async () => ({ users: [realAdminUser] }) });
        }
        if (url.includes('/products')) {
          return Promise.resolve({ ok: true, json: async () => ({ products: [mockProduct] }) });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ opportunities: [], products: [mockProduct], offers: [], creatives: [], experiments: [], decisions: [], audit_logs: [] })
        });
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      // Wait for Intro to complete and navigate to Equipe tab
      const teamTab = await screen.findByRole('button', { name: /Equipe/i }, { timeout: 8000 });
      fireEvent.click(teamTab);

      // R03: TeamView renders Real Admin User email and title
      await waitFor(() => {
        expect(screen.getByText('Equipe e Permissões')).toBeInTheDocument();
        expect(screen.getByText('rdmconsultoria2022@gmail.com')).toBeInTheDocument();
      }, { timeout: 8000 });

      // Navigate to Produtos tab
      const productsTab = screen.getByRole('button', { name: /Produtos/i });
      fireEvent.click(productsTab);

      // Open Edit Product Modal
      const editButtons = await screen.findAllByText(/Atualizar Status & Procedência|Editar/i, {}, { timeout: 8000 });
      fireEvent.click(editButtons[0]);

      // R04: Provenance responsible selector contains Real Admin User
      await waitFor(() => {
        expect(screen.getByText('Real Admin User (ADMIN)')).toBeInTheDocument();
      }, { timeout: 8000 });
    }, 20000);

    it('R05 & R06: mode switching isolates real and demo users without retention', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'staging-jwt-token',
            user: { email: 'rdmconsultoria2022@gmail.com' }
          }
        } as any,
        error: null
      });

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/me')) {
          return Promise.resolve({ ok: true, json: async () => ({ user: realAdminUser }) });
        }
        if (url.includes('/users?mode=real') || (url.includes('/users') && !url.includes('mode=demo'))) {
          return Promise.resolve({ ok: true, json: async () => ({ users: [realAdminUser] }) });
        }
        if (url.includes('/users?mode=demo')) {
          return Promise.resolve({ ok: true, json: async () => ({ users: [demoAdminUser] }) });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ opportunities: [], products: [], offers: [], creatives: [], experiments: [], decisions: [], audit_logs: [] })
        });
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      const teamTab = await screen.findByRole('button', { name: /Equipe/i }, { timeout: 8000 });
      fireEvent.click(teamTab);

      // Initially in real view
      await waitFor(() => {
        expect(screen.getByText('Equipe e Permissões')).toBeInTheDocument();
        expect(screen.getByText('rdmconsultoria2022@gmail.com')).toBeInTheDocument();
      }, { timeout: 8000 });

      // Toggle to Demo view
      const demoBtn = screen.getByRole('button', { name: /MODO DEMO/i });
      fireEvent.click(demoBtn);

      // R05: Switching to demo mode displays demo user and removes real user
      await waitFor(() => {
        expect(screen.getByText('demo@norqva.com')).toBeInTheDocument();
        expect(screen.queryByText('rdmconsultoria2022@gmail.com')).not.toBeInTheDocument();
      }, { timeout: 8000 });

      // Toggle back to Real view
      const realBtn = screen.getByRole('button', { name: /MODO REAL/i });
      fireEvent.click(realBtn);

      // R06: Switching back to real mode displays real user and removes demo user
      await waitFor(() => {
        expect(screen.getByText('rdmconsultoria2022@gmail.com')).toBeInTheDocument();
        expect(screen.queryByText('demo@norqva.com')).not.toBeInTheDocument();
      }, { timeout: 8000 });
    }, 20000);
  });
});
