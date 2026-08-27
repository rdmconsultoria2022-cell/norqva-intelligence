import { supabase } from '../supabase';
import { UserObj } from '../types';

export const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api';

export async function apiFetch(
  url: string,
  options: RequestInit = {},
  authMode: 'demo' | 'real',
  currentUser: UserObj | null,
  onSessionExpired?: () => void
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (authMode === 'real') {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } else {
    if (currentUser) {
      headers['x-user-id'] = currentUser.id;
      headers['x-user-role'] = currentUser.role;
    }
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401 && authMode === 'real') {
      const { data: refreshData } = await supabase.auth.refreshSession();
      if (refreshData.session) {
        const retryHeaders = {
          ...headers,
          'Authorization': `Bearer ${refreshData.session.access_token}`
        };
        const retryRes = await fetch(`${API_BASE}${url}`, { ...options, headers: retryHeaders });
        const retryData = await retryRes.json();
        if (retryRes.ok) {
          return retryData;
        }
      }
      if (onSessionExpired) {
        onSessionExpired();
      }
      await supabase.auth.signOut();
      throw new Error('Sua sessão expirou. Por favor, realize o login novamente.');
    }
    throw new Error(data.error || 'API Request failed');
  }

  return data;
}
