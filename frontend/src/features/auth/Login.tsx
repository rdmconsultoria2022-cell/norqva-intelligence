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
                  ? 'border-[#C9CFD9] bg-[#C9CFD9]/10 text-[#E7EAF0]'
                  : 'border-slate-800 hover:border-slate-700 text-slate-400'
              }`}
            >
              Demonstração
            </button>
            <button
              onClick={() => setAuthMode('real')}
              className={`py-2 px-3 border text-sm font-medium rounded-md text-center font-mono ${
                authMode === 'real'
                  ? 'border-[#C9CFD9] bg-[#C9CFD9]/10 text-[#E7EAF0]'
                  : 'border-slate-800 hover:border-slate-700 text-slate-400'
              }`}
            >
              Conta real
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
                className="w-full flex items-center justify-between p-3 rounded-md bg-slate-950/50 border border-slate-800 hover:border-[#C9CFD9]/50 hover:bg-[#C9CFD9]/5 text-left transition"
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
            <label htmlFor="email" className="nq-auth-label block">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="seu e-mail"
              className="mt-1 block w-full nq-auth-input px-3.5 py-3 rounded-xl text-[15px]"
            />
          </div>
          <div>
            <label htmlFor="pass" className="nq-auth-label block">
              Senha
            </label>
            <input
              id="pass"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="mt-1 block w-full nq-auth-input px-3.5 py-3 rounded-xl text-[15px]"
            />
          </div>
          <button
            type="submit"
            className="nq-auth-btn w-full flex justify-center py-3 px-4 rounded-xl text-[15px] font-semibold"
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setIsForgotPasswordView(true)}
            className="nq-auth-link w-full text-center mt-1 py-2 text-[13px]"
          >
            Esqueci minha senha
          </button>
        </form>
      )}
    </>
  );
};
