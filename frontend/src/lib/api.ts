import { supabase } from '../supabase';
import { UserObj } from '../types';

const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
const envBase = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL
  ? String((import.meta as any).env.VITE_API_BASE_URL).trim()
  : undefined;

export function resolveApiBase(customUrl?: string, isTestEnv: boolean = isTest): string {
  const url = (customUrl !== undefined ? customUrl : envBase)?.trim();
  if (isTestEnv) {
    return url || '/api';
  }
  if (!url) {
    throw new Error('[API CONFIGURATION ERROR]: VITE_API_BASE_URL is not configured. Direct fallback to legacy backends is prohibited.');
  }
  return url.replace(/\/+$/, '');
}

export const API_BASE = isTest
  ? (envBase || '/api')
  : (envBase ? envBase.replace(/\/+$/, '') : '');

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

if (typeof window !== 'undefined' && supabase?.auth) {
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token || null;
    tokenExpiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
  });
}

async function getValidAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedAccessToken && tokenExpiresAt > now + 30000) {
    return cachedAccessToken;
  }
  const { data: { session } } = await supabase.auth.getSession();
  cachedAccessToken = session?.access_token || null;
  tokenExpiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
  return cachedAccessToken;
}

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
    const token = await getValidAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } else {
    if (currentUser) {
      headers['x-user-id'] = currentUser.id;
      headers['x-user-role'] = currentUser.role;
    }
  }

  const base = isTest ? (API_BASE || '/api') : resolveApiBase();
  const res = await fetch(`${base}${url}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401 && authMode === 'real') {
      const { data: refreshData } = await supabase.auth.refreshSession();
      if (refreshData.session) {
        cachedAccessToken = refreshData.session.access_token;
        tokenExpiresAt = refreshData.session.expires_at ? refreshData.session.expires_at * 1000 : 0;
        const retryHeaders = {
          ...headers,
          'Authorization': `Bearer ${refreshData.session.access_token}`
        };
        const retryRes = await fetch(`${base}${url}`, { ...options, headers: retryHeaders });
        const retryData = await retryRes.json();
        if (retryRes.ok) {
          return retryData;
        }
      }
      cachedAccessToken = null;
      tokenExpiresAt = 0;
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
