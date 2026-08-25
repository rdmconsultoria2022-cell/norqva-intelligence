import React from 'react';
import { CheckCircle } from 'lucide-react';
import { supabase } from '../../supabase';

interface PasswordRecoveryProps {
  recoveryState: 'NONE' | 'RECOVERY_INITIALIZING' | 'RECOVERY_READY' | 'RECOVERY_INVALID' | 'PASSWORD_UPDATING' | 'PASSWORD_UPDATED';
  setRecoveryState: (state: 'NONE' | 'RECOVERY_INITIALIZING' | 'RECOVERY_READY' | 'RECOVERY_INVALID' | 'PASSWORD_UPDATING' | 'PASSWORD_UPDATED') => void;
  setAuthMode: (mode: 'demo' | 'real') => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  onNavigateToLogin?: () => void;
}

export const PasswordRecovery: React.FC<PasswordRecoveryProps> = ({
  recoveryState,
  setRecoveryState,
  setAuthMode,
  showError,
  showSuccess,
  onNavigateToLogin
}) => {
  return (
    <div>
      {recoveryState === 'RECOVERY_INITIALIZING' && (
        <div className="flex flex-col items-center py-6 space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          <p className="text-sm font-mono text-slate-400 text-center">
            Validando link de recuperação...
          </p>
        </div>
      )}

      {recoveryState === 'RECOVERY_INVALID' && (
        <div className="space-y-4 text-center py-4">
          <p className="text-sm text-red-400 font-medium">
            Link de recuperação inválido ou expirado.
          </p>
          <button
            type="button"
            onClick={() => {
              setRecoveryState('NONE');
              setAuthMode('real');
              if (onNavigateToLogin) {
                onNavigateToLogin();
              } else {
                window.history.replaceState({}, document.title, '/');
              }
            }}
            className="w-full py-2 px-4 border border-slate-800 hover:border-slate-700 rounded-md text-sm font-medium text-slate-300 font-mono"
          >
            Voltar ao Login
          </button>
        </div>
      )}

      {recoveryState === 'PASSWORD_UPDATED' && (
        <div className="flex flex-col items-center py-6 space-y-4 text-center">
          <div className="h-12 w-12 rounded-full bg-emerald-950/50 border border-emerald-500 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-200">Senha atualizada!</h4>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Redirecionando para tela de login...
            </p>
          </div>
        </div>
      )}

      {(recoveryState === 'RECOVERY_READY' || recoveryState === 'PASSWORD_UPDATING') && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const password = (form.elements.namedItem('password') as HTMLInputElement)?.value || '';
          const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement)?.value || '';
          if (password !== confirmPassword) {
            showError('As senhas não coincidem.');
            return;
          }
          if (password.length < 6) {
            showError('A senha deve conter no mínimo 6 caracteres.');
            return;
          }
          
          setRecoveryState('PASSWORD_UPDATING');
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
              showError('Sessão de recuperação inválida ou expirada.');
              setRecoveryState('RECOVERY_INVALID');
              return;
            }
            
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            
            showSuccess('Senha atualizada com sucesso!');
            setRecoveryState('PASSWORD_UPDATED');
            await supabase.auth.signOut();
            
            setTimeout(() => {
              setRecoveryState('NONE');
              setAuthMode('real');
              if (onNavigateToLogin) {
                onNavigateToLogin();
              } else {
                window.history.replaceState({}, document.title, '/');
              }
            }, 2000);
          } catch (err: any) {
            showError(err.message || 'Erro ao atualizar a senha.');
            setRecoveryState('RECOVERY_READY');
          }
        }} className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Definir Nova Senha
          </h3>
          <div>
            <label htmlFor="pass" className="block text-xs font-mono uppercase text-slate-400">
              Nova Senha
            </label>
            <input
              id="pass"
              name="password"
              type="password"
              required
              disabled={recoveryState === 'PASSWORD_UPDATING'}
              placeholder="••••••••"
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="confirmPass" className="block text-xs font-mono uppercase text-slate-400">
              Confirmar Nova Senha
            </label>
            <input
              id="confirmPass"
              name="confirmPassword"
              type="password"
              required
              disabled={recoveryState === 'PASSWORD_UPDATING'}
              placeholder="••••••••"
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={recoveryState === 'PASSWORD_UPDATING'}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-slate-950 bg-emerald-400 hover:bg-emerald-300 font-mono disabled:opacity-50"
          >
            {recoveryState === 'PASSWORD_UPDATING' ? 'Atualizando...' : 'Salvar Nova Senha'}
          </button>
        </form>
      )}
    </div>
  );
};
