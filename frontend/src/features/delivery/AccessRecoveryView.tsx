import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import { Loader2, AlertTriangle, ArrowLeft, Mail } from "lucide-react";
import { API_BASE } from "../../lib/api";
import { savePurchaseSession } from "../../services/purchaseSession";

interface AccessRecoveryViewProps {
  recoveryToken?: string;
  showError?: (msg: string) => void;
  showSuccess?: (msg: string) => void;
}

export const AccessRecoveryView: React.FC<AccessRecoveryViewProps> = ({
  recoveryToken: propToken,
  showError,
  showSuccess
}) => {
  const params = useParams<{ recoveryToken?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract recoveryToken from prop, route params, or URL pathname (/acesso/:recoveryToken)
  const pathParts = location.pathname.split('/').filter(Boolean);
  const rawPathToken = pathParts[0] === 'acesso' ? pathParts[1] : '';
  const rawToken = propToken || params.recoveryToken || rawPathToken;
  const recoveryToken = rawToken ? decodeURIComponent(rawToken).trim() : '';

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recoveryToken) {
      setLoading(false);
      setError("Chave de acesso não fornecida.");
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const claimRecovery = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE}/checkout/recovery/${encodeURIComponent(recoveryToken)}`, {
          signal: controller.signal,
          headers: { "Content-Type": "application/json" }
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Não foi possível validar esta chave de recuperação.");
        }

        if (isMounted) {
          // Persist validated session
          savePurchaseSession({
            orderId: data.orderId,
            checkoutToken: data.checkoutToken,
            offerHumanId: data.offerHumanId || "OFF-000001",
            status: "PAID",
            offerName: data.offerName || "Trattoria em Casa"
          });

          if (showSuccess) {
            showSuccess("Acesso restaurado com sucesso!");
          }

          // Direct navigation to durable order delivery view with hash token
          navigate(`/pedido/${data.orderId}/entrega#token=${data.checkoutToken}`, { replace: true });
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("Claim recovery error:", err?.message || "Failed to claim recovery link");
        if (isMounted) {
          setError(err.message || "Erro ao validar chave de recuperação.");
          if (showError) {
            showError(err.message || "Erro ao recuperar acesso ao pedido.");
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    claimRecovery();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [recoveryToken, navigate, showError, showSuccess]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-4 text-stone-800 font-sans antialiased">
        <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-8 shadow-xl text-center space-y-4">
          <div className="h-12 w-12 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <h2 className="text-xl font-serif font-bold text-stone-900">
            Validando seu Acesso Seguro
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            Estamos autenticando sua chave exclusiva e localizando sua compra digital...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-4 text-stone-800 font-sans antialiased">
        <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-8 shadow-xl text-center space-y-4">
          <div className="h-12 w-12 mx-auto rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-serif font-bold text-stone-900">
            Chave de Acesso Inválida ou Expirada
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            {error}
          </p>
          <p className="text-[11px] text-stone-400">
            Se você efetuou uma compra, você pode solicitar um novo link de acesso na página do produto.
          </p>
          <div className="pt-3 flex flex-col sm:flex-row gap-2">
            <Link
              to="/p/OFF-000001"
              className="flex-1 py-2.5 px-4 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-bold transition flex items-center justify-center gap-1.5 no-underline"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar para Oferta</span>
            </Link>
            <a
              href="mailto:suporte@norqva.com"
              className="flex-1 py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 no-underline"
            >
              <Mail className="h-4 w-4" />
              <span>Suporte</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
