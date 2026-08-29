import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabase';
import { UserObj } from '../../types';

import { API_BASE } from '../../lib/api';

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<UserObj | null>(null);
  const [authMode, setAuthModeState] = useState<'demo' | 'real'>('demo');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDemoView, setIsDemoView] = useState(true);
  const [introFinished, setIntroFinished] = useState(false);
  const [usersList, setUsersList] = useState<UserObj[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);
  const [recoveryState, setRecoveryState] = useState<'NONE' | 'RECOVERY_INITIALIZING' | 'RECOVERY_READY' | 'RECOVERY_INVALID' | 'PASSWORD_UPDATING' | 'PASSWORD_UPDATED'>('NONE');
  const [isForgotPasswordView, setIsForgotPasswordView] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const showError = (msg: string) => {
    setGlobalError(msg);
    setTimeout(() => setGlobalError(null), 5000);
  };

  const showSuccess = (msg: string) => {
    setGlobalSuccess(msg);
    setTimeout(() => setGlobalSuccess(null), 4000);
  };

  const handleLogin = (user: UserObj) => {
    setCurrentUser(user);
    setIntroFinished(false);
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    setCurrentUser(null);
    setIntroFinished(false);
  };

  const authModeRef = useRef(authMode);
  authModeRef.current = authMode;

  const setAuthMode = (mode: 'demo' | 'real') => {
    setAuthModeState(mode);
    authModeRef.current = mode;
    const isProduction = (import.meta as any).env.PROD;
    if (mode === 'demo' && !isProduction && usersList.length === 0) {
      fetch(`${API_BASE}/users?mode=demo`, {
        headers: { 'x-user-role': 'ADMIN' }
      })
        .then(res => res.json())
        .then(data => {
          if (data?.users) {
            setUsersList(data.users);
          }
        })
        .catch(err => console.error('Failed to load demo personas on toggle:', err));
    }
  };
  const recoveryStateRef = useRef(recoveryState);
  recoveryStateRef.current = recoveryState;

  useEffect(() => {
    let timeoutId: any = null;

    const bootstrapAuth = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const hasError = url.searchParams.has('error') || url.searchParams.has('error_code');
        const hasRecoveryHash = window.location.hash.includes('type=recovery');
        const isRecovery = window.location.pathname === '/reset-password' || hasRecoveryHash || !!code;
        
        // A. If route is password recovery: preserve recovery flow
        if (isRecovery) {
          setRecoveryState('RECOVERY_INITIALIZING');
          setAuthMode('real');
          authModeRef.current = 'real';
          
          if (hasError) {
            setRecoveryState('RECOVERY_INVALID');
            setIsAuthReady(true);
            return;
          }

          if (code) {
            try {
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);
              if (error || !data.session) {
                setRecoveryState('RECOVERY_INVALID');
                return;
              }
              window.history.replaceState({}, document.title, window.location.pathname);
              setRecoveryState('RECOVERY_READY');
            } catch (err) {
              console.error('PKCE exchange error:', err);
              setRecoveryState('RECOVERY_INVALID');
            } finally {
              setIsAuthReady(true);
            }
          } else if (hasRecoveryHash) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              setRecoveryState('RECOVERY_READY');
              setIsAuthReady(true);
            } else {
              timeoutId = setTimeout(async () => {
                const { data: { session: s } } = await supabase.auth.getSession();
                if (s) {
                  setRecoveryState('RECOVERY_READY');
                } else {
                  setRecoveryState('RECOVERY_INVALID');
                }
                setIsAuthReady(true);
              }, 1000);
            }
          } else {
            // Direct route without code/hash - check session with a brief safety timeout
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              setRecoveryState('RECOVERY_READY');
              setIsAuthReady(true);
            } else {
              timeoutId = setTimeout(async () => {
                const { data: { session: s } } = await supabase.auth.getSession();
                if (s) {
                  setRecoveryState('RECOVERY_READY');
                } else {
                  setRecoveryState('RECOVERY_INVALID');
                }
                setIsAuthReady(true);
              }, 500);
            }
          }
          return;
        }

        // B. Else check Supabase session
        let session: any = null;
        try {
          const sessionRes = await supabase.auth.getSession();
          session = sessionRes.data?.session;
        } catch (err) {
          console.error('Error checking initial session:', err);
        }

        // C. If a valid Supabase session exists:
        if (session) {
          setAuthMode('real');
          setIsDemoView(false);
          authModeRef.current = 'real';
          try {
            const meRes = await fetch(`${API_BASE}/me`, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
              }
            });
            if (meRes.ok) {
              const meData = await meRes.json();
              setCurrentUser(meData.user);
            } else {
              setCurrentUser(null);
              await supabase.auth.signOut();
            }
          } catch (err) {
            console.error('Failed to get me profile on mount:', err);
            setCurrentUser(null);
          } finally {
            setIsAuthReady(true);
          }
          // Do NOT auto-login demo persona or send x-user-role simulation headers
          return;
        }

        // D. If no real Supabase session exists:
        // Normal Demo/Real selection behavior may continue.
        try {
          const isProduction = (import.meta as any).env.PROD;
          const res = await fetch(`${API_BASE}/users?mode=demo`, {
            headers: { 'x-user-role': 'ADMIN' }
          });
          const data = await res.json();
          if (data.users) {
            setUsersList(data.users);
            const isForgot = window.location.pathname === '/forgot-password';
            const isLogin = window.location.pathname === '/login';
            const isAuthRoute = isRecovery || isForgot || isLogin;

            if (!isProduction && authModeRef.current === 'demo' && !isAuthRoute) {
              const adminUser = data.users.find((u: any) => u.role === 'ADMIN');
              if (adminUser) {
                setCurrentUser(adminUser);
              }
            }
          }
        } catch (err) {
          console.error('Failed to init demo users:', err);
        } finally {
          setIsAuthReady(true);
        }
      } catch (err) {
        console.error('Unexpected auth bootstrap error:', err);
        setIsAuthReady(true);
      }
    };
    
    bootstrapAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryState('RECOVERY_READY');
        setAuthMode('real');
        authModeRef.current = 'real';
        return;
      }

      const url = new URL(window.location.href);
      const isRecovery = window.location.pathname === '/reset-password' || window.location.hash.includes('type=recovery') || url.searchParams.has('code');
      if (isRecovery || recoveryStateRef.current !== 'NONE') {
        if (event === 'SIGNED_IN' && session) {
          setRecoveryState('RECOVERY_READY');
          setAuthMode('real');
          authModeRef.current = 'real';
        }
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        setAuthMode('real');
        authModeRef.current = 'real';
        try {
          const meRes = await fetch(`${API_BASE}/me`, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            }
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            setCurrentUser(meData.user);
            setIntroFinished(false);
            showSuccess('Autenticado com sucesso!');
          } else {
            const errData = await meRes.json();
            showError(errData.error || 'Usuário inválido ou inativo no NORQVA.');
            setCurrentUser(null);
            await supabase.auth.signOut();
          }
        } catch (err: any) {
          showError('Erro ao obter perfil de usuário.');
          setCurrentUser(null);
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setIntroFinished(false);
      } else if (event === 'TOKEN_REFRESHED' && session) {
        console.log('Supabase token auto-refreshed successfully.');
      }
    });

    return () => {
      subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return {
    currentUser,
    setCurrentUser,
    authMode,
    setAuthMode,
    activeTab,
    setActiveTab,
    isDemoView,
    setIsDemoView,
    introFinished,
    setIntroFinished,
    usersList,
    setUsersList,
    globalError,
    setGlobalError,
    globalSuccess,
    setGlobalSuccess,
    recoveryState,
    setRecoveryState,
    isForgotPasswordView,
    setIsForgotPasswordView,
    isAuthReady,
    showError,
    showSuccess,
    handleLogin,
    handleSignOut
  };
}
