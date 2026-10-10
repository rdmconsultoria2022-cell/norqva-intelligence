import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Upload, History, ExternalLink } from 'lucide-react';

// NORQVA-0033: o PDF que o comprador recebe, por oferta (só ADMIN). Trocar sobe o novo num endereço novo e o
// cadastro passa a apontar para ele; o anterior fica guardado no histórico. Quem já comprou recebe a versão nova.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;
const MAX_BYTES = 50 * 1024 * 1024;

export const fmtSize = (n: any) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v < 1024 * 1024) return `${Math.max(1, Math.round(v / 1024))} KB`;
  return `${(v / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
};
const fmtDate = (d: any) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Motivo para recusar o arquivo antes de enviar (null = ok). */
export function pickProblem(f: File | null): string | null {
  if (!f) return 'Escolha o PDF.';
  const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (!isPdf) return 'Escolha um arquivo PDF.';
  if (f.size === 0) return 'O arquivo está vazio.';
  if (f.size > MAX_BYTES) return 'Arquivo maior que 50 MB.';
  return null;
}

const sendPdf = (apiFetch: ApiFetch, url: string, method: 'PUT' | 'POST', f: File) =>
  apiFetch(url, { method, headers: { 'Content-Type': 'application/pdf', 'x-file-name': encodeURIComponent(f.name) }, body: f });

/** Erro para o operador: resposta que não veio do nosso servidor (proxy, queda) não diz se algo mudou. */
export const friendlyError = (e: any, fallback: string) => {
  const m = String(e?.message || '');
  if (!m || e instanceof SyntaxError || /Unexpected token|JSON|Failed to fetch|NetworkError/i.test(m)) {
    return 'A resposta não chegou. Clique em "Baixar para conferir" antes de tentar de novo.';
  }
  return m || fallback;
};

const NEW_KEY = '__new__';
const LINK_TTL_MS = 4.5 * 60 * 1000;

const FilePicker: React.FC<{ id: string; label: string; file: File | null; reset: number; onPick: (f: File | null) => void }> = ({ id, label, file, reset, onPick }) => (
  <label className="flex flex-col gap-0.5">
    <span className="text-[10px] text-slate-400">{label}</span>
    <input
      key={reset}
      id={id}
      aria-label={label}
      type="file"
      accept="application/pdf,.pdf"
      onChange={e => onPick(e.target.files?.[0] || null)}
      className="text-[11px] text-slate-300 file:mr-2 file:rounded file:border file:border-slate-700 file:bg-slate-900 file:px-2 file:py-0.5 file:text-slate-200"
    />
    {file && (
      <span className="text-[10px] text-slate-400" data-testid="picked-file">
        {file.name} · {fmtSize(file.size)}
      </span>
    )}
  </label>
);

export const DeliveryFiles: React.FC<{
  off: any;
  apiFetch: ApiFetch;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
}> = ({ off, apiFetch, showError, showSuccess }) => {
  const [state, setState] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const [files, setFiles] = useState<Record<string, File | null>>({}); // um PDF escolhido por arquivo (ou NEW_KEY)
  const [reset, setReset] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null); // id do arquivo em troca
  const [restoring, setRestoring] = useState<string | null>(null); // id da versão a voltar
  const [busy, setBusy] = useState(false);
  const [checkLink, setCheckLink] = useState<Record<string, string>>({});
  // NORQVA-0038: ligar um PDF que já existe (ex.: o kit entrega os PDFs do Trattoria e do Dolci)
  const [library, setLibrary] = useState<any[] | null>(null);
  const [chosen, setChosen] = useState('');
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await apiFetch(`/offers/${off.id}/delivery-files`));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [apiFetch, off.id]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = (key: string, f: File | null) => {
    setFiles(prev => ({ ...prev, [key]: f }));
    setConfirming(null);
  };

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      showSuccess(ok);
      setFiles({});
      setReset(n => n + 1);
      setConfirming(null);
      setRestoring(null);
      setCheckLink({});
      await load();
    } catch (e: any) {
      showError(friendlyError(e, 'Não deu certo. Nada foi trocado.'));
    } finally {
      setBusy(false);
    }
  };

  const openCheck = async (assetId: string) => {
    try {
      const r = await apiFetch(`/digital-assets/${assetId}/check-link`);
      setCheckLink(prev => ({ ...prev, [assetId]: r.url }));
      setTimeout(() => setCheckLink(prev => (prev[assetId] === r.url ? { ...prev, [assetId]: '' } : prev)), LINK_TTL_MS);
    } catch (e: any) {
      showError(friendlyError(e, 'Não foi possível gerar o link de conferência.'));
    }
  };

  if (failed) return <p className="text-[11px] text-red-300" data-testid="delivery-files-error">Não foi possível ler o arquivo de entrega agora. Nada foi alterado; tente de novo.</p>;
  if (!state) return <p className="text-[11px] text-slate-500">Carregando arquivo de entrega…</p>;

  const assets: any[] = state.assets || [];
  const linkedIds = new Set(assets.map(a => a.id));
  const openLibrary = async () => {
    try {
      const rows = await apiFetch('/digital-assets?mode=real');
      setLibrary(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      showError(friendlyError(e, 'Não foi possível listar os PDFs.'));
    }
  };
  const busyNote = busy ? <p className="text-[11px] text-slate-400">Enviando… arquivos grandes podem levar 1 a 2 minutos. Não feche a página.</p> : null;
  const currentLabel = (a: any) => a.file_original_name || a.name;

  return (
    <div className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2 text-xs" data-testid="delivery-files">
      <div className="inline-flex items-center gap-1 font-semibold text-slate-200">
        <FileText className="h-3.5 w-3.5 text-emerald-400" /> PDF entregue ao comprador
      </div>

      {assets.length === 0 && (() => {
        const f = files[NEW_KEY] || null;
        const problem = pickProblem(f);
        return (
          <div className="space-y-2" data-testid="delivery-new">
            <p className="text-[11px] text-amber-300">Esta oferta ainda não entrega nenhum arquivo. Sem arquivo, ela não pode ser adicional no Pix.</p>
            <FilePicker id={`new-${off.id}`} label="PDF desta oferta" file={f} reset={reset} onPick={x => pick(NEW_KEY, x)} />
            {f && problem && <p className="text-[11px] text-red-300">{problem}</p>}
            {!f && <p className="text-[11px] text-slate-500">Escolha o PDF acima.</p>}
            <button
              disabled={busy || !!problem}
              onClick={() => f && run(() => sendPdf(apiFetch, `/offers/${off.id}/delivery-files`, 'POST', f), 'Arquivo enviado e ligado à oferta.')}
              data-testid="delivery-create"
              className="w-full rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] font-mono text-emerald-300 disabled:opacity-40"
            >
              <Upload className="mr-1 inline h-3.5 w-3.5" /> {busy ? 'Enviando…' : 'Enviar arquivo'}
            </button>
            {busyNote}
          </div>
        );
      })()}

      {assets.map(a => {
        const f = files[a.id] || null;
        const problem = pickProblem(f);
        return (
          <div key={a.id} className="space-y-2 rounded border border-slate-800 p-2" data-testid="delivery-asset">
            <div className="text-slate-200">{currentLabel(a)}</div>
            <div className="text-[11px] text-slate-400">
              {a.file_size_bytes ? `${fmtSize(a.file_size_bytes)} · enviado em ${fmtDate(a.file_updated_at)}` : 'Enviado antes desta tela (tamanho não registrado). Confira baixando.'}
            </div>
            <details className="text-[10px] text-slate-500">
              <summary className="cursor-pointer">Onde está guardado</summary>
              <span className="font-mono break-all">
                {a.storage_bucket}/{a.storage_path}
              </span>
            </details>
            {a.also_used_by?.length > 0 && (
              <p className="text-[11px] text-amber-300" data-testid="delivery-shared">
                Este mesmo arquivo também é entregue por {a.also_used_by.join(', ')}. Trocar aqui muda lá também.
              </p>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => openCheck(a.id)} data-testid="delivery-check" className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                Baixar para conferir
              </button>
              {checkLink[a.id] && (
                <a href={checkLink[a.id]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-emerald-300 underline" data-testid="delivery-check-link">
                  Abrir o PDF (vale 5 min) <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <FilePicker id={`swap-${a.id}`} label="Novo PDF para trocar" file={f} reset={reset} onPick={x => pick(a.id, x)} />
            {f && problem && <p className="text-[11px] text-red-300">{problem}</p>}
            {confirming !== a.id ? (
              <>
                <button
                  disabled={busy || !!problem}
                  onClick={() => setConfirming(a.id)}
                  data-testid="delivery-replace"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-200 disabled:opacity-40"
                >
                  Trocar arquivo
                </button>
                {!f && <p className="text-[11px] text-slate-500">Para trocar, escolha o novo PDF acima.</p>}
              </>
            ) : (
              <div className="space-y-1 rounded border border-amber-500/30 bg-amber-950/20 p-2" data-testid="delivery-confirm">
                <p className="text-[11px] text-slate-200">
                  Sai: {currentLabel(a)}
                  {a.file_size_bytes ? ` (${fmtSize(a.file_size_bytes)})` : ''} → Entra: {f?.name} ({fmtSize(f?.size)})
                </p>
                <p className="text-[11px] text-amber-200">Quem já comprou passa a receber esta versão. O arquivo atual fica guardado no histórico e pode voltar a qualquer momento.</p>
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => f && run(() => sendPdf(apiFetch, `/digital-assets/${a.id}/file`, 'PUT', f), 'Arquivo trocado. O anterior ficou guardado no histórico.')}
                    data-testid="delivery-confirm-replace"
                    className="flex-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] font-mono text-emerald-300"
                  >
                    {busy ? 'Trocando…' : 'Confirmar troca'}
                  </button>
                  <button disabled={busy} onClick={() => setConfirming(null)} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
                    Cancelar
                  </button>
                </div>
                {busyNote}
              </div>
            )}

            {a.versions?.length > 0 && (
              <div className="space-y-1 border-t border-slate-800 pt-2" data-testid="delivery-history">
                <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
                  <History className="h-3 w-3" /> Versões guardadas
                </div>
                {a.versions.map((v: any) => (
                  <div key={v.id} className="space-y-1 text-[11px] text-slate-400" data-testid="delivery-version">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {v.original_name || 'arquivo anterior'} · {fmtSize(v.size_bytes)} · saiu em {fmtDate(v.replaced_at)}
                        {v.replaced_by_email ? ` (${v.replaced_by_email})` : ''}
                      </span>
                      {restoring !== v.id && (
                        <button disabled={busy} onClick={() => setRestoring(v.id)} className="shrink-0 rounded border border-slate-700 px-2 py-0.5 text-slate-300" data-testid="delivery-restore">
                          Voltar para esta versão
                        </button>
                      )}
                    </div>
                    {restoring === v.id && (
                      <div className="space-y-1 rounded border border-amber-500/30 bg-amber-950/20 p-2" data-testid="delivery-restore-box">
                        <p className="text-slate-200">
                          Sai: {currentLabel(a)} → Entra: {v.original_name || 'arquivo anterior'}. Quem já comprou passa a receber esta versão.
                        </p>
                        <div className="flex gap-2">
                          <button
                            disabled={busy}
                            onClick={() => run(() => apiFetch(`/digital-assets/${a.id}/versions/${v.id}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), 'Versão restaurada. A que saiu ficou guardada.')}
                            className="flex-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 font-mono text-emerald-300"
                            data-testid="delivery-restore-confirm"
                          >
                            Confirmar volta
                          </button>
                          <button disabled={busy} onClick={() => setRestoring(null)} className="rounded border border-slate-700 px-2 py-1 text-slate-300">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="space-y-1 border-t border-slate-800 pt-2" data-testid="delivery-link-existing">
        {library === null ? (
          <button onClick={openLibrary} className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300" data-testid="delivery-link-open">
            Usar um PDF que já existe
          </button>
        ) : (
          (() => {
            const options = library.filter(x => !linkedIds.has(x.id));
            const picked = options.find(x => x.id === chosen);
            return (
              <div className="space-y-1">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-400">PDF já enviado em outra oferta (para kits)</span>
                  <select
                    aria-label="PDF já enviado em outra oferta"
                    value={chosen}
                    onChange={e => { setChosen(e.target.value); setLinking(false); }}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                  >
                    <option value="">Escolha o PDF…</option>
                    {options.map(x => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                </label>
                {options.length === 0 && <p className="text-[11px] text-slate-500">Não há outro PDF para ligar.</p>}
                {picked && !linking && (
                  <button onClick={() => setLinking(true)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-200" data-testid="delivery-link-ask">
                    Ligar a esta oferta
                  </button>
                )}
                {picked && linking && (
                  <div className="space-y-1 rounded border border-amber-500/30 bg-amber-950/20 p-2" data-testid="delivery-link-confirm">
                    <p className="text-[11px] text-slate-200">Quem comprar esta oferta passa a receber também: {picked.name}. O arquivo é o mesmo; trocar em um lugar muda nos dois.</p>
                    <div className="flex gap-2">
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => apiFetch(`/offers/${off.id}/digital-assets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset_id: picked.id }) }),
                            'PDF ligado à oferta.'
                          ).then(() => { setChosen(''); setLinking(false); setLibrary(null); })
                        }
                        className="flex-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] font-mono text-emerald-300"
                        data-testid="delivery-link-do"
                      >
                        Confirmar
                      </button>
                      <button disabled={busy} onClick={() => setLinking(false)} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
};
