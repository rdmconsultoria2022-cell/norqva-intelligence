import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

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

const mockUsers: any[] = [];

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

describe('SPA Router Rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated user from root / to /login', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Should load login form immediately because of redirect in useEffect
    expect(await screen.findByText('INTELLIGENCE & PERFORMANCE')).toBeInTheDocument();
  });

  it('allows forgot-password route when unauthenticated', async () => {
    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <App />
      </MemoryRouter>
    );

    // Should render the forgot password form (it contains text explaining recovery)
    expect(await screen.findByText(/Recuperar Senha/i)).toBeInTheDocument();
  });

  it('allows reset-password route when unauthenticated', async () => {
    const originalLocation = window.location;
    delete (window as any).location;
    window.location = new URL('http://localhost/reset-password') as any;

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Validando link de recuperação/i)).toBeInTheDocument();

    (window as any).location = originalLocation;
  });
});
