import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Upload, History, ExternalLink } from 'lucide-react';

// NORQVA-0033: o PDF que o comprador recebe, por oferta (só ADMIN). Trocar guarda antes uma cópia do arquivo
// atual; o novo entra no mesmo endereço, então quem já comprou passa a receber a versão nova.

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

const FilePicker: React.FC<{ id: string; label: string; file: File | null; onPick: (f: File | null) => void }> = ({ id, label, file, onPick }) => (
  <label className="flex flex-col gap-0.5">
    <span className="text-[10px] text-slate-400">{label}</span>
    <input
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
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null); // id do arquivo em troca, ou 'new'
  const [restoring, setRestoring] = useState<string | null>(null); // id da versão a voltar
  const [busy, setBusy] = useState(false);
  const [checkLink, setCheckLink] = useState<Record<string, string>>({});

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

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      showSuccess(ok);
      setFile(null);
      setConfirming(null);
      setRestoring(null);
      setCheckLink({});
      await load();
    } catch (e: any) {
      showError(e?.message || 'Não deu certo. Nada foi trocado.');
    } finally {
      setBusy(false);
    }
  };

  const openCheck = async (assetId: string) => {
    try {
      const r = await apiFetch(`/digital-assets/${assetId}/check-link`);
      setCheckLink(prev => ({ ...prev, [assetId]: r.url }));
    } catch (e: any) {
      showError(e?.message || 'Não foi possível gerar o link de conferência.');
    }
  };

  if (failed) return <p className="text-[11px] text-red-300" data-testid="delivery-files-error">Não foi possível ler o arquivo de entrega agora. Nada foi alterado; tente de novo.</p>;
  if (!state) return <p className="text-[11px] text-slate-500">Carregando arquivo de entrega…</p>;

  const problem = pickProblem(file);
  const assets: any[] = state.assets || [];

  return (
    <div className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2 text-xs" data-testid="delivery-files">
      <div className="inline-flex items-center gap-1 font-semibold text-slate-200">
        <FileText className="h-3.5 w-3.5 text-emerald-400" /> PDF entregue ao comprador
      </div>

      {assets.length === 0 && (
        <div className="space-y-2" data-testid="delivery-new">
          <p className="text-[11px] text-amber-300">Esta oferta ainda não entrega nenhum arquivo. Sem arquivo, ela não pode ser adicional no Pix.</p>
          <FilePicker id={`new-${off.id}`} label="PDF desta oferta" file={file} onPick={f => { setFile(f); setConfirming(null); }} />
          {file && problem && <p className="text-[11px] text-red-300">{problem}</p>}
          <button
            disabled={busy || !!problem}
            onClick={() => file && run(() => sendPdf(apiFetch, `/offers/${off.id}/delivery-files`, 'POST', file), 'Arquivo enviado e ligado à oferta.')}
            data-testid="delivery-create"
            className="w-full rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] font-mono text-emerald-300 disabled:opacity-40"
          >
            <Upload className="mr-1 inline h-3.5 w-3.5" /> {busy ? 'Enviando…' : 'Enviar arquivo'}
          </button>
        </div>
      )}

      {assets.map(a => (
        <div key={a.id} className="space-y-2 rounded border border-slate-800 p-2" data-testid="delivery-asset">
          <div className="text-slate-200">{a.file_original_name || a.name}</div>
          <div className="font-mono text-[10px] text-slate-500 break-all">
            {a.storage_bucket}/{a.storage_path}
          </div>
          <div className="text-[11px] text-slate-400">
            {a.file_size_bytes ? `${fmtSize(a.file_size_bytes)} · trocado em ${fmtDate(a.file_updated_at)}` : 'Enviado antes desta tela (tamanho não registrado). Confira baixando.'}
          </div>
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

          <FilePicker id={`swap-${a.id}`} label="Novo PDF para trocar" file={file} onPick={f => { setFile(f); setConfirming(null); }} />
          {file && problem && <p className="text-[11px] text-red-300">{problem}</p>}
          {confirming !== a.id ? (
            <button
              disabled={busy || !!problem}
              onClick={() => setConfirming(a.id)}
              data-testid="delivery-replace"
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-200 disabled:opacity-40"
            >
              Trocar arquivo
            </button>
          ) : (
            <div className="space-y-1 rounded border border-amber-500/30 bg-amber-950/20 p-2" data-testid="delivery-confirm">
              <p className="text-[11px] text-amber-200">
                Quem já comprou passa a receber esta versão. O arquivo atual fica guardado no histórico e pode voltar a qualquer momento.
              </p>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => file && run(() => sendPdf(apiFetch, `/digital-assets/${a.id}/file`, 'PUT', file), 'Arquivo trocado. O anterior ficou guardado no histórico.')}
                  data-testid="delivery-confirm-replace"
                  className="flex-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] font-mono text-emerald-300"
                >
                  {busy ? 'Trocando…' : 'Confirmar troca'}
                </button>
                <button disabled={busy} onClick={() => setConfirming(null)} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {a.versions?.length > 0 && (
            <div className="space-y-1 border-t border-slate-800 pt-2" data-testid="delivery-history">
              <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
                <History className="h-3 w-3" /> Versões guardadas
              </div>
              {a.versions.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-400" data-testid="delivery-version">
                  <span>
                    {v.original_name || 'arquivo anterior'} · {fmtSize(v.size_bytes)} · saiu em {fmtDate(v.replaced_at)}
                    {v.replaced_by_email ? ` (${v.replaced_by_email})` : ''}
                  </span>
                  {restoring !== v.id ? (
                    <button disabled={busy} onClick={() => setRestoring(v.id)} className="shrink-0 rounded border border-slate-700 px-2 py-0.5 text-slate-300" data-testid="delivery-restore">
                      Voltar para esta versão
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => run(() => apiFetch(`/digital-assets/${a.id}/versions/${v.id}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), 'Versão restaurada. A que saiu ficou guardada.')}
                      className="shrink-0 rounded border border-amber-500/40 bg-amber-950/30 px-2 py-0.5 text-amber-200"
                      data-testid="delivery-restore-confirm"
                    >
                      Confirmar: compradores recebem esta
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
