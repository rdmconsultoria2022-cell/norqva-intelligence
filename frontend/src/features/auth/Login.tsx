import React from 'react';
import { supabase } from '../../supabase';
import { UserObj } from '../../types';

interface LoginProps {
  authMode: 'demo' | 'real';
  setAuthMode: (mode: 'demo' | 'real') => void;
  usersList: UserObj[];
  handleLogin: (user: UserObj) => void;
  setIsForgotPasswordView: (val: boolean) => void;
  showError: (msg: string) => void;
  isProduction: boolean;
}

export const Login: React.FC<LoginProps> = ({
  authMode,
  setAuthMode,
  usersList,
  handleLogin,
  setIsForgotPasswordView,
  showError,
  isProduction
}) => {
  return (
    <>
      {!isProduction && (
        <div>
          <label className="block text-xs font-mono tracking-wider uppercase text-slate-400">
            Modo de Autenticação
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              onClick={() => setAuthMode('demo')}
              className={`py-2 px-3 border text-sm font-medium rounded-md text-center font-mono ${
                authMode === 'demo'
                  ? 'border-emerald-500 bg-emerald-950/20 text-emerald-400'
                  : 'border-slate-800 hover:border-slate-700 text-slate-400'
              }`}
            >
              AUTH_MODE=demo
            </button>
            <button
              onClick={() => setAuthMode('real')}
              className={`py-2 px-3 border text-sm font-medium rounded-md text-center font-mono ${
                authMode === 'real'
                  ? 'border-emerald-500 bg-emerald-950/20 text-emerald-400'
                  : 'border-slate-800 hover:border-slate-700 text-slate-400'
              }`}
            >
              AUTH_MODE=real
            </button>
          </div>
        </div>
      )}

      {authMode === 'demo' && !isProduction ? (
        <div>
          <label className="block text-xs font-mono tracking-wider uppercase text-slate-400">
            Selecione uma Persona para Acesso Simulado (RBAC)
          </label>
          <div className="mt-3 space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
            {usersList.map((user) => (
              <button
                key={user.id}
                onClick={() => handleLogin(user)}
                className="w-full flex items-center justify-between p-3 rounded-md bg-slate-950/50 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-950/10 text-left transition"
              >
                <div>
                  <div className="text-sm font-bold text-slate-200">{user.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{user.email}</div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 font-bold">
                  {user.role}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={async (e) => {
          e.preventDefault();
          const email = (e.target as any).email.value;
          const password = (e.target as any).password.value;
          try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
              throw error;
            }
          } catch (err: any) {
            showError(err.message || 'Erro ao autenticar.');
          }
        }} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-mono uppercase text-slate-400">
              E-mail Corporativo
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="seuemail@norqva.com"
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="pass" className="block text-xs font-mono uppercase text-slate-400">
              Senha
            </label>
            <input
              id="pass"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-slate-950 bg-emerald-400 hover:bg-emerald-300 font-mono"
          >
            Autenticar
          </button>
          <button
            type="button"
            onClick={() => setIsForgotPasswordView(true)}
            className="w-full text-center mt-2 text-xs font-mono text-slate-400 hover:text-slate-200"
          >
            Esqueci minha senha
          </button>
        </form>
      )}
    </>
  );
};
