import React from 'react';
import { supabase } from '../../supabase';

interface ForgotPasswordProps {
  setIsForgotPasswordView: (val: boolean) => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({
  setIsForgotPasswordView,
  showError,
  showSuccess
}) => {
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      const email = (e.target as any).email.value;
      try {
        const redirectToUrl = `${window.location.origin}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectToUrl
        });
        if (error) throw error;
        showSuccess('E-mail de recuperação enviado com sucesso!');
        setIsForgotPasswordView(false);
      } catch (err: any) {
        showError(err.message || 'Erro ao enviar e-mail de recuperação.');
      }
    }} className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
        Recuperar Senha
      </h3>
      <div>
        <label htmlFor="email" className="block text-xs font-mono uppercase text-slate-400">
          E-mail do Usuário Supabase
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
      <div className="flex flex-col gap-2">
        <button
          type="submit"
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-slate-950 bg-emerald-400 hover:bg-emerald-300 font-mono"
        >
          Enviar Link de Recuperação
        </button>
        <button
          type="button"
          onClick={() => setIsForgotPasswordView(false)}
          className="w-full text-center py-2 text-xs font-mono text-slate-400 hover:text-slate-200"
        >
          Voltar ao Login
        </button>
      </div>
    </form>
  );
};
