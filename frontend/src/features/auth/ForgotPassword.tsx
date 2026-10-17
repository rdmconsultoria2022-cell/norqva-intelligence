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
      <h3 className="text-[15px] font-semibold text-[#E7EAF0]">
        Recuperar Senha
      </h3>
      <div>
        <label htmlFor="email" className="nq-auth-label block">
          E-mail do Usuário Supabase
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
      <div className="flex flex-col gap-2">
        <button
          type="submit"
          className="nq-auth-btn w-full flex justify-center py-3 px-4 rounded-xl text-[15px] font-semibold"
        >
          Enviar Link de Recuperação
        </button>
        <button
          type="button"
          onClick={() => setIsForgotPasswordView(false)}
          className="nq-auth-link w-full text-center py-2 text-[13px]"
        >
          Voltar ao Login
        </button>
      </div>
    </form>
  );
};
