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

/** NORQVA-0113: nome que o comprador vê, tirado do nome do arquivo (01_Guia_do_Desafio.pdf → "01 · Guia do Desafio"). */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = base.match(/^(\d{1,3})\s+(.*)$/);
  return (m ? `${m[1]} · ${m[2]}` : base).slice(0, 120);
}
const LINK_TTL_MS = 4.5 * 60 * 1000;

const FilePicker: React.FC<{ id: string; label: string; file: File | null; reset: number; onPick: (f: File | null) => void }> = ({ id, label, file, reset, onPick }) => (
  <label className="flex flex-col gap-0.5">
    <span className="text-[12px] text-nq-muted">{label}</span>
    <input
      key={reset}
      id={id}
      aria-label={label}
      type="file"
      accept="application/pdf,.pdf"
      onChange={e => onPick(e.target.files?.[0] || null)}
      className="text-[12px] text-nq-text file:mr-2 file:rounded-nq file:border file:border-nq-line file:bg-nq-surface file:px-2 file:py-0.5 file:text-nq-text"
    />
    {file && (
      <span className="text-[12px] text-nq-muted" data-testid="picked-file">
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
  // NORQVA-0113: vários PDFs de uma vez (ex.: Seca Barriga entrega 10 arquivos)
  const [many, setMany] = useState<File[]>([]);
  const [manyDone, setManyDone] = useState(0);

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

  if (failed) return <p className="text-[12px] text-nq-critical-text" data-testid="delivery-files-error">Não foi possível ler o arquivo de entrega agora. Nada foi alterado; tente de novo.</p>;
  if (!state) return <p className="text-[12px] text-nq-subtle">Carregando arquivo de entrega…</p>;

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
  const busyNote = busy ? <p className="text-[12px] text-nq-muted">Enviando… arquivos grandes podem levar 1 a 2 minutos. Não feche a página.</p> : null;
  const currentLabel = (a: any) => a.file_original_name || a.name;

  return (
    <div className="space-y-2 rounded-xl bg-nq-surface p-3 text-nq-aux" data-testid="delivery-files">
      <div className="inline-flex items-center gap-1 font-semibold text-nq-text">
        <FileText className="h-3.5 w-3.5 text-nq-positive-text" /> PDF entregue ao comprador
      </div>

      {assets.length === 0 && (() => {
        const f = files[NEW_KEY] || null;
        const problem = pickProblem(f);
        return (
          <div className="space-y-2" data-testid="delivery-new">
            <p className="text-[12px] text-nq-attention">Esta oferta ainda não entrega nenhum arquivo. Sem arquivo, ela não pode ser adicional no Pix.</p>
            <FilePicker id={`new-${off.id}`} label="PDF desta oferta" file={f} reset={reset} onPick={x => pick(NEW_KEY, x)} />
            {f && problem && <p className="text-[12px] text-nq-critical-text">{problem}</p>}
            {!f && <p className="text-[12px] text-nq-subtle">Escolha o PDF acima.</p>}
            <button
              disabled={busy || !!problem}
              onClick={() => f && run(() => sendPdf(apiFetch, `/offers/${off.id}/delivery-files`, 'POST', f), 'Arquivo enviado e ligado à oferta.')}
              data-testid="delivery-create"
              className="w-full rounded-full border border-nq-positive/40 bg-nq-positive/10 px-2 py-1 text-[12px] text-nq-positive-text disabled:opacity-40 min-h-[44px]"
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
          <div key={a.id} className="space-y-2 rounded border border-nq-line p-2" data-testid="delivery-asset">
            <div className="text-nq-text">{currentLabel(a)}</div>
            <div className="text-[12px] text-nq-muted">
              {a.file_size_bytes ? `${fmtSize(a.file_size_bytes)} · enviado em ${fmtDate(a.file_updated_at)}` : 'Enviado antes desta tela (tamanho não registrado). Confira baixando.'}
            </div>
            <details className="text-[12px] text-nq-subtle">
              <summary className="cursor-pointer">Onde está guardado</summary>
              <span className="break-all">
                {a.storage_bucket}/{a.storage_path}
              </span>
            </details>
            {a.also_used_by?.length > 0 && (
              <p className="text-[12px] text-nq-attention" data-testid="delivery-shared">
                Este mesmo arquivo também é entregue por {a.also_used_by.join(', ')}. Trocar aqui muda lá também.
              </p>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => openCheck(a.id)} data-testid="delivery-check" className="rounded-nq bg-nq-surface px-2 py-0.5 text-[12px] text-nq-text min-h-[44px]">
                Baixar para conferir
              </button>
              {checkLink[a.id] && (
                <a href={checkLink[a.id]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-nq-positive-text underline" data-testid="delivery-check-link">
                  Abrir o PDF (vale 5 min) <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <FilePicker id={`swap-${a.id}`} label="Novo PDF para trocar" file={f} reset={reset} onPick={x => pick(a.id, x)} />
            {f && problem && <p className="text-[12px] text-nq-critical-text">{problem}</p>}
            {confirming !== a.id ? (
              <>
                <button
                  disabled={busy || !!problem}
                  onClick={() => setConfirming(a.id)}
                  data-testid="delivery-replace"
                  className="w-full rounded-nq bg-nq-surface px-2 py-1 text-[12px] text-nq-text disabled:opacity-40 min-h-[44px]"
                >
                  Trocar arquivo
                </button>
                {!f && <p className="text-[12px] text-nq-subtle">Para trocar, escolha o novo PDF acima.</p>}
              </>
            ) : (
              <div className="space-y-1 rounded border border-nq-attention/40 bg-nq-attention/10 p-2" data-testid="delivery-confirm">
                <p className="text-[12px] text-nq-text">
                  Sai: {currentLabel(a)}
                  {a.file_size_bytes ? ` (${fmtSize(a.file_size_bytes)})` : ''} → Entra: {f?.name} ({fmtSize(f?.size)})
                </p>
                <p className="text-[12px] text-nq-attention">Quem já comprou passa a receber esta versão. O arquivo atual fica guardado no histórico e pode voltar a qualquer momento.</p>
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => f && run(() => sendPdf(apiFetch, `/digital-assets/${a.id}/file`, 'PUT', f), 'Arquivo trocado. O anterior ficou guardado no histórico.')}
                    data-testid="delivery-confirm-replace"
                    className="flex-1 rounded-full border border-nq-positive/40 bg-nq-positive/10 px-2 py-1 text-[12px] text-nq-positive-text min-h-[44px]"
                  >
                    {busy ? 'Trocando…' : 'Confirmar troca'}
                  </button>
                  <button disabled={busy} onClick={() => setConfirming(null)} className="rounded-full border border-nq-line px-2 py-1 text-[12px] text-nq-text min-h-[44px]">
                    Cancelar
                  </button>
                </div>
                {busyNote}
              </div>
            )}

            {a.versions?.length > 0 && (
              <div className="space-y-1 border-t border-nq-line pt-2" data-testid="delivery-history">
                <div className="inline-flex items-center gap-1 text-[12px] text-nq-muted">
                  <History className="h-3 w-3" /> Versões guardadas
                </div>
                {a.versions.map((v: any) => (
                  <div key={v.id} className="space-y-1 text-[12px] text-nq-muted" data-testid="delivery-version">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {v.original_name || 'arquivo anterior'} · {fmtSize(v.size_bytes)} · saiu em {fmtDate(v.replaced_at)}
                        {v.replaced_by_email ? ` (${v.replaced_by_email})` : ''}
                      </span>
                      {restoring !== v.id && (
                        <button disabled={busy} onClick={() => setRestoring(v.id)} className="shrink-0 rounded-full border border-nq-line px-2 py-0.5 text-nq-text min-h-[44px]" data-testid="delivery-restore">
                          Voltar para esta versão
                        </button>
                      )}
                    </div>
                    {restoring === v.id && (
                      <div className="space-y-1 rounded border border-nq-attention/40 bg-nq-attention/10 p-2" data-testid="delivery-restore-box">
                        <p className="text-nq-text">
                          Sai: {currentLabel(a)} → Entra: {v.original_name || 'arquivo anterior'}. Quem já comprou passa a receber esta versão.
                        </p>
                        <div className="flex gap-2">
                          <button
                            disabled={busy}
                            onClick={() => run(() => apiFetch(`/digital-assets/${a.id}/versions/${v.id}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), 'Versão restaurada. A que saiu ficou guardada.')}
                            className="flex-1 rounded-full border border-nq-positive/40 bg-nq-positive/10 px-2 py-1 text-nq-positive-text min-h-[44px]"
                            data-testid="delivery-restore-confirm"
                          >
                            Confirmar volta
                          </button>
                          <button disabled={busy} onClick={() => setRestoring(null)} className="rounded-full border border-nq-line px-2 py-1 text-nq-text min-h-[44px]">
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


      <div className="space-y-1 border-t border-nq-line pt-2" data-testid="delivery-many">
        <label className="flex flex-col gap-0.5">
          <span className="text-[12px] text-nq-muted">Adicionar mais PDFs a esta oferta (pode escolher vários)</span>
          <input
            key={`many-${reset}`}
            aria-label="Adicionar vários PDFs"
            type="file"
            multiple
            accept="application/pdf,.pdf"
            onChange={e => { setMany(Array.from(e.target.files || []).sort((a, b) => a.name.localeCompare(b.name))); setManyDone(0); }}
            className="text-[12px] text-nq-text file:mr-2 file:rounded-nq file:border file:border-nq-line file:bg-nq-surface file:px-2 file:py-0.5 file:text-nq-text"
          />
        </label>
        {many.length > 0 && (() => {
          const bad =
            many.map(f => pickProblem(f)).find(Boolean) ||
            (assets.length + many.length > 20 ? `A oferta entrega no máximo 20 arquivos (já tem ${assets.length}).` : null);
          return (
            <div className="space-y-1">
              <ul className="text-[12px] text-nq-muted" data-testid="delivery-many-list">
                {many.map((f, k) => <li key={`${k}-${f.name}`}>{titleFromFileName(f.name)} · {fmtSize(f.size)}</li>)}
              </ul>
              {bad && <p className="text-[12px] text-nq-critical-text">{bad}</p>}
              <button
                disabled={busy || !!bad}
                data-testid="delivery-many-send"
                onClick={() =>
                  run(async () => {
                    // Envia um por um. Se parar no meio, os que já foram saem da lista (nada é reenviado) e o
                    // erro diz quantos foram; "Enviar" de novo manda só os que faltam.
                    const total = many.length;
                    let i = 0;
                    try {
                      for (const f of many) {
                        const first = assets.length === 0 && i === 0;
                        const url = first
                          ? `/offers/${off.id}/delivery-files`
                          : `/offers/${off.id}/delivery-files/extra?title=${encodeURIComponent(titleFromFileName(f.name))}`;
                        await sendPdf(apiFetch, url, 'POST', f);
                        i += 1;
                        setManyDone(i);
                      }
                    } catch (e: any) {
                      setMany(many.slice(i));
                      setManyDone(0);
                      await load();
                      throw new Error(
                        `${i} de ${total} PDFs enviados. Parou em "${many[i]?.name}": ${friendlyError(e, 'não deu certo.')} ` +
                          'Clique em "Enviar" de novo para mandar só os que faltam.'
                      );
                    }
                    setMany([]);
                  }, `${many.length} ${many.length === 1 ? 'PDF enviado e ligado' : 'PDFs enviados e ligados'} à oferta.`)
                }
                className="w-full rounded-full border border-nq-positive/40 bg-nq-positive/10 px-2 py-1 text-[12px] text-nq-positive-text disabled:opacity-40 min-h-[44px]"
              >
                <Upload className="mr-1 inline h-3.5 w-3.5" /> {busy ? `Enviando ${manyDone + 1} de ${many.length}…` : `Enviar ${many.length} ${many.length === 1 ? 'PDF' : 'PDFs'}`}
              </button>
            </div>
          );
        })()}
      </div>
      <div className="space-y-1 border-t border-nq-line pt-2" data-testid="delivery-link-existing">
        {library === null ? (
          <button onClick={openLibrary} className="rounded-nq bg-nq-surface px-2 py-0.5 text-[12px] text-nq-text min-h-[44px]" data-testid="delivery-link-open">
            Usar um PDF que já existe
          </button>
        ) : (
          (() => {
            const options = library.filter(x => !linkedIds.has(x.id));
            const picked = options.find(x => x.id === chosen);
            return (
              <div className="space-y-1">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[12px] text-nq-muted">PDF já enviado em outra oferta (para kits)</span>
                  <select
                    aria-label="PDF já enviado em outra oferta"
                    value={chosen}
                    onChange={e => { setChosen(e.target.value); setLinking(false); }}
                    className="rounded-nq bg-nq-surface px-2 py-2 text-[12px] text-nq-text min-h-[44px]"
                  >
                    <option value="">Escolha o PDF…</option>
                    {options.map(x => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                </label>
                {options.length === 0 && <p className="text-[12px] text-nq-subtle">Não há outro PDF para ligar.</p>}
                {picked && !linking && (
                  <button onClick={() => setLinking(true)} className="w-full rounded-nq bg-nq-surface px-2 py-1 text-[12px] text-nq-text min-h-[44px]" data-testid="delivery-link-ask">
                    Ligar a esta oferta
                  </button>
                )}
                {picked && linking && (
                  <div className="space-y-1 rounded border border-nq-attention/40 bg-nq-attention/10 p-2" data-testid="delivery-link-confirm">
                    <p className="text-[12px] text-nq-text">Quem comprar esta oferta passa a receber também: {picked.name}. O arquivo é o mesmo; trocar em um lugar muda nos dois.</p>
                    <div className="flex gap-2">
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => apiFetch(`/offers/${off.id}/digital-assets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset_id: picked.id }) }),
                            'PDF ligado à oferta.'
                          ).then(() => { setChosen(''); setLinking(false); setLibrary(null); })
                        }
                        className="flex-1 rounded-full border border-nq-positive/40 bg-nq-positive/10 px-2 py-1 text-[12px] text-nq-positive-text min-h-[44px]"
                        data-testid="delivery-link-do"
                      >
                        Confirmar
                      </button>
                      <button disabled={busy} onClick={() => setLinking(false)} className="rounded-full border border-nq-line px-2 py-1 text-[12px] text-nq-text min-h-[44px]">
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
