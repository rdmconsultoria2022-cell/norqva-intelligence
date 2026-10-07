import React, { useState } from 'react';

/**
 * TEMPORÁRIO — H1.1. REMOVER APÓS A CERTIFICAÇÃO DO H1.1 (junto com GET /api/diagnostics/proxy-chain).
 *
 * Diagnóstico da cadeia de proxies, visível só para ADMIN. Faz exclusivamente um GET em
 * /diagnostics/proxy-chain pelo mesmo cliente HTTP do NORQVA (apiFetch), que já cuida da sessão e da
 * autenticação. Este componente não lê, copia, exibe, registra nem guarda o token: só mostra o JSON
 * devolvido pela API. Não faz mutação, não chama a Meta, não altera campanha, banco nem TRUST_PROXY.
 */
export const PROXY_DIAGNOSTICS_PATH = '/diagnostics/proxy-chain';

interface Props {
  currentUser: { role?: string } | null;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
}

export const ProxyChainDiagnosticsPanel: React.FC<Props> = ({ currentUser, apiFetch }) => {
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (currentUser?.role !== 'ADMIN') return null;

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Somente leitura: GET explícito, sem corpo, sem cabeçalhos próprios (a autenticação é do apiFetch).
      setResult(await apiFetch(PROXY_DIAGNOSTICS_PATH, { method: 'GET' }));
    } catch (e: any) {
      setError(e?.message || 'Falha ao consultar o diagnóstico.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded border border-amber-600/40 bg-amber-950/10 p-4" data-testid="proxy-diagnostics-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
            H1.1 · Diagnóstico da cadeia de proxies <span className="ml-1 rounded border border-amber-500/50 px-1.5 py-0.5 text-[10px]">TEMPORÁRIO</span>
          </h3>
          <p className="mt-1 text-[11px] text-slate-400">
            Somente leitura (GET /api/diagnostics/proxy-chain). Será removido após a certificação do H1.1.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="rounded border border-amber-600/60 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/30 disabled:opacity-50"
        >
          {loading ? 'Consultando…' : 'Executar diagnóstico'}
        </button>
      </div>
      {error && <p className="text-xs text-rose-300" data-testid="proxy-diagnostics-error">{error}</p>}
      {result !== null && (
        <pre className="max-h-96 overflow-auto rounded bg-slate-950 p-3 text-[11px] text-slate-200" data-testid="proxy-diagnostics-json">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
};
