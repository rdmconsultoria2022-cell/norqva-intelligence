import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// NORQVA-0004: Supabase re-emits SIGNED_IN when the browser tab regains focus.
// That must not replay the intro nor send the user back to the dashboard.

// vi.mock is hoisted above plain declarations, so the captured callback lives in vi.hoisted.
const authState = vi.hoisted(() => ({ cb: null as null | ((event: string, session: any) => void) }));

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'tok', user: { id: 'auth-1' } } },
        error: null
      }),
      onAuthStateChange: vi.fn().mockImplementation((cb: any) => {
        authState.cb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn()
    }
  }
}));

const realUser = { id: 'user-1', name: 'Ricardo', role: 'ADMIN', email: 'r@norqva.test' };

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/me')) {
    return Promise.resolve({ ok: true, json: async () => ({ user: realUser }) });
  }
  return Promise.resolve({ ok: true, json: async () => ({}) });
}) as any;

import { useAuth } from '../features/auth/useAuth';

describe('NORQVA-0004 — intro plays once per browser tab session', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    authState.cb = null;
    vi.mocked(global.fetch).mockClear();
  });

  it('does not replay the intro or reset the tab when SIGNED_IN is re-emitted on tab focus', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.currentUser?.id).toBe('user-1'));
    expect(result.current.introFinished).toBe(false);

    act(() => result.current.setIntroFinished(true));
    act(() => result.current.setActiveTab('financeiro'));
    expect(result.current.introFinished).toBe(true);

    const meCallsBefore = vi.mocked(global.fetch).mock.calls.length;
    await act(async () => {
      authState.cb!('SIGNED_IN', { access_token: 'tok2', user: { id: 'auth-1' } });
    });

    expect(result.current.introFinished).toBe(true);
    expect(result.current.activeTab).toBe('financeiro');
    expect(result.current.globalSuccess).toBeNull();
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(meCallsBefore);
  });

  it('does not replay the intro after a page reload in the same tab (same user)', async () => {
    const first = renderHook(() => useAuth());
    await waitFor(() => expect(first.result.current.currentUser?.id).toBe('user-1'));
    act(() => first.result.current.setIntroFinished(true));
    act(() => first.result.current.setActiveTab('experimentos'));
    first.unmount();

    const second = renderHook(() => useAuth());
    await waitFor(() => expect(second.result.current.currentUser?.id).toBe('user-1'));
    expect(second.result.current.introFinished).toBe(true);
    expect(second.result.current.activeTab).toBe('experimentos');
  });

  it('plays the intro again after sign-out and a new login', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.currentUser?.id).toBe('user-1'));
    act(() => result.current.setIntroFinished(true));

    await act(async () => {
      await result.current.handleSignOut();
    });
    expect(result.current.currentUser).toBeNull();
    expect(result.current.activeTab).toBe('dashboard');

    act(() => result.current.handleLogin(realUser));
    expect(result.current.introFinished).toBe(false);
  });
});
