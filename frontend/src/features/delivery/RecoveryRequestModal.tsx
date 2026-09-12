import React, { useState } from "react";
import { Mail, X, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { API_BASE } from "../../lib/api";

interface RecoveryRequestModalProps {
  offerHumanId: string;
  onClose: () => void;
  showError?: (msg: string) => void;
  showSuccess?: (msg: string) => void;
}

export const RecoveryRequestModal: React.FC<RecoveryRequestModalProps> = ({
  offerHumanId,
  onClose,
  showError,
  showSuccess
}) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [responseMessage, setResponseMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      const msg = "Por favor, informe um e-mail válido.";
      setErrorMessage(msg);
      if (showError) showError(msg);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/checkout/recovery/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          offerHumanId
        })
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // ignore json parse error
      }

      if (res.status === 200) {
        setSubmitted(true);
        setResponseMessage(
          data?.message ||
            "Se encontrarmos uma compra válida para este e-mail, enviaremos as instruções de acesso."
        );
        if (showSuccess) {
          showSuccess("Solicitação recebida com sucesso!");
        }
      } else if (res.status === 429) {
        const msg = "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
        setSubmitted(false);
        setErrorMessage(msg);
        if (showError) showError(msg);
      } else if (res.status === 400) {
        const msg = data?.error || "Por favor, informe um e-mail válido.";
        setSubmitted(false);
        setErrorMessage(msg);
        if (showError) showError(msg);
      } else {
        const msg = "Não foi possível solicitar o acesso agora. Tente novamente em alguns minutos.";
        setSubmitted(false);
        setErrorMessage(msg);
        if (showError) showError(msg);
      }
    } catch (err: any) {
      const msg = "Não foi possível solicitar o acesso agora. Tente novamente em alguns minutos.";
      setSubmitted(false);
      setErrorMessage(msg);
      if (showError) showError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-4 antialiased">
      <div className="bg-[#FAF7F2] border border-stone-200 rounded-2xl max-w-md w-full p-6 sm:p-8 text-sm shadow-2xl text-stone-800 font-sans relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-5 pb-3 border-b border-stone-200">
          <div className="p-2.5 rounded-full bg-[#B83B1E] text-white shadow-md">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-serif font-bold text-stone-900">
              Recuperar Acesso ao Guia
            </h3>
            <p className="text-xs text-stone-500">
              Reenvio de link direto para compradores
            </p>
          </div>
        </div>

        {submitted ? (
          <div className="py-4 space-y-4 text-center">
            <div className="h-12 w-12 mx-auto rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-600">
              <CheckCircle className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-stone-900">
              Verifique sua Caixa de Entrada
            </h4>
            <p className="text-xs text-stone-600 leading-relaxed">
              {responseMessage}
            </p>
            <div className="p-3 bg-stone-100 rounded-xl text-[11px] text-stone-500">
              Não se esqueça de checar a pasta de <strong>Spam</strong> ou <strong>Promoções</strong>.
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold transition shadow-sm"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-stone-600 leading-relaxed">
              Informe o mesmo e-mail que você utilizou no momento do pagamento para receber seu link de acesso exclusivo:
            </p>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1.5">
                Seu e-mail cadastrado
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="seu.email@exemplo.com"
                className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#B83B1E] text-xs font-medium"
              />
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#B83B1E] hover:bg-[#8F2810] text-white text-xs font-bold transition shadow flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <span>Reenviar Acesso</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
