import React, { useState, useRef, useEffect } from 'react';
import { Plus, Film, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { UserObj } from '../../types';
import { CreativePreview } from '../../components/CreativePreview';
import { ViewModeSelector, useViewMode, containerClass, isIconMode, IconTile, groupByCampaign } from '../../components/ViewModes';

const Field: React.FC<{ label: string; testId?: string; children: React.ReactNode }> = ({ label, testId, children }) => (
  <div data-testid={testId}>
    <span className="text-slate-500 font-mono uppercase text-[10px] mr-1.5">{label}:</span>
    <span className="text-slate-300">{children}</span>
  </div>
);

export function isOpenableFileUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface CreativeMediaProps {
  creatives: any[];
  products: any[];
  offers: any[];
  isDemoView: boolean;
  currentUser: UserObj | null;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  refreshCreatives: () => Promise<void>;
}

export function CreativeMediaView({
  creatives,
  products,
  offers,
  isDemoView,
  currentUser,
  showError,
  showSuccess,
  refreshCreatives
}: CreativeMediaProps) {
  const [showAddCreative, setShowAddCreative] = useState(false);
  const [creativeForm, setCreativeForm] = useState({
    product_id: '',
    offer_id: '',
    hook: '',
    concept: '',
    copy: '',
    cta: '',
    format: 'VIDEO',
    file_url: ''
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleAddCreative = async (e: React.FormEvent) => {
    e.preventDefault();

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const mode = isDemoView ? 'demo' : 'real';
      await apiFetch(
        `/creatives?mode=${mode}`,
        {
          method: 'POST',
          body: JSON.stringify(creativeForm),
          signal: controller.signal
        },
        mode,
        currentUser
      );

      if (!controller.signal.aborted) {
        showSuccess('Criativo adicionado ao Creative Lab!');
        setShowAddCreative(false);
        setCreativeForm({
          product_id: '',
          offer_id: '',
          hook: '',
          concept: '',
          copy: '',
          cta: '',
          format: 'VIDEO',
          file_url: ''
        });
        await refreshCreatives();
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || (err.message && err.message.includes('aborted'))) {
        return;
      }
      if (!controller.signal.aborted) {
        showError(err.message || 'Erro ao cadastrar criativo.');
      }
    }
  };

  // NORQVA-0011: display mode + grouping by campaign
  const [viewMode, setViewMode] = useViewMode('norqva.lab.viewMode');
  const [focusId, setFocusId] = useState<string | null>(null);
  const openInList = (id: string) => {
    setViewMode('list');
    setFocusId(id);
    setTimeout(() => {
      try {
        document.getElementById(`lab-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        /* ignore */
      }
    }, 50);
  };

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-200 font-mono">Creative Lab</h2>
          <p className="text-xs text-slate-400">Fábrica de criativos de alta conversão estruturados por gancho e conceito</p>
        </div>
        <button
          onClick={() => setShowAddCreative(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-slate-950 font-bold rounded hover:bg-emerald-400 transition"
        >
          <Plus className="h-4 w-4" />
          Cadastrar Criativo
        </button>
      </div>

      <div className="flex justify-end">
        <ViewModeSelector value={viewMode} onChange={setViewMode} />
      </div>

      {creatives.length === 0 ? (
        <div className="p-12 border border-slate-800 rounded bg-slate-900/20 text-center text-slate-500 font-mono">
          Nenhum criativo no laboratório.
        </div>
      ) : (
        groupByCampaign(creatives).map(g => (
          <section key={g.key} className="space-y-3" data-testid="campaign-group">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-1.5">
              {g.name}
              {g.status && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${g.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                  {g.status === 'ACTIVE' ? 'ativa' : g.status === 'PAUSED' ? 'pausada' : g.status}
                </span>
              )}
              <span className="text-[11px] font-normal text-slate-500">{g.items.length} criativo(s)</span>
            </h3>
            <div className={containerClass(viewMode)}>
              {g.items.map((cr: any) =>
                isIconMode(viewMode) ? (
                  <IconTile
                    key={cr.id}
                    mode={viewMode}
                    title={cr.human_id}
                    subtitle={cr.product_name || cr.format}
                    url={isOpenableFileUrl(cr.file_url) ? cr.file_url : null}
                    format={cr.format}
                    onOpen={() => openInList(cr.id)}
                  />
                ) : (
                  <div
                    key={cr.id}
                    id={`lab-card-${cr.id}`}
                    className={`p-4 border border-slate-800 bg-slate-900/30 rounded ${viewMode === 'list' ? 'flex flex-col-reverse md:flex-row gap-4' : 'flex flex-col space-y-3'} ${focusId === cr.id ? 'ring-2 ring-emerald-500' : ''}`}
                  >
                    {viewMode === 'grid' && isOpenableFileUrl(cr.file_url) && (
                      <CreativePreview url={cr.file_url} format={cr.format} title={cr.human_id} />
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-emerald-400 font-bold">{cr.human_id}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">{cr.status}</span>
                      </div>
                      <Field label="Campanha" testId="creative-campaign">
                        {(cr.campaigns || []).length > 0
                          ? cr.campaigns.map((cp: any) => `${cp.name}${cp.status && cp.status !== 'ACTIVE' ? ` (${cp.status === 'PAUSED' ? 'pausada' : cp.status})` : ''}`).join(' · ')
                          : <span className="text-slate-500">não publicado</span>}
                      </Field>
                      <Field label="Produto">{cr.product_name || '—'}{cr.offer_name ? ` · ${cr.offer_name}` : ''}</Field>
                      <Field label="Formato">{cr.format}{cr.duration_seconds ? ` · ${cr.duration_seconds}s` : ''}</Field>
                      <Field label="Gancho"><span className="italic text-slate-200">“{cr.hook}”</span></Field>
                      <Field label="Conceito">{cr.concept || cr.mechanism || '—'}</Field>
                      {cr.headline && <Field label="Título">{cr.headline}</Field>}
                      <Field label="Copy"><span className={viewMode === 'grid' ? 'line-clamp-2' : ''}>{cr.copy || cr.primary_text || '—'}</span></Field>
                      <Field label="CTA">{cr.cta}</Field>
                      {!isOpenableFileUrl(cr.file_url) && (
                        <span
                          className="block text-slate-500 font-mono"
                          data-testid="creative-no-file"
                          title={cr.batch_code ? `Criativo do lote ${cr.batch_code}: anexe o arquivo na Fábrica de Criativos (botão "Anexar arquivo").` : 'Nenhum arquivo anexado a este criativo.'}
                        >
                          {cr.batch_code ? 'Sem arquivo · anexe na Fábrica' : 'Sem arquivo'}
                        </span>
                      )}
                    </div>
                    {viewMode === 'list' && (
                      <div className="md:w-60 shrink-0">
                        {isOpenableFileUrl(cr.file_url) ? (
                          <CreativePreview url={cr.file_url} format={cr.format} title={cr.human_id} />
                        ) : (
                          <div className="aspect-[4/5] rounded border border-dashed border-slate-700 flex items-center justify-center text-[11px] text-slate-500">
                            sem arquivo
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </section>
        ))
      )}

      {/* Modal Add Creative */}
      {showAddCreative && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 text-sm">
            <h3 className="text-md font-bold tracking-widest font-mono text-emerald-400 mb-4 uppercase">Cadastrar Criativo no Lab</h3>
            <form onSubmit={handleAddCreative} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Produto</label>
                  <select
                    required
                    value={creativeForm.product_id}
                    onChange={e => setCreativeForm({ ...creativeForm, product_id: e.target.value, offer_id: '' })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200"
                  >
                    <option value="">Selecione...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.human_id} - {p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Oferta (Opcional)</label>
                  <select
                    value={creativeForm.offer_id}
                    onChange={e => setCreativeForm({ ...creativeForm, offer_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200"
                  >
                    <option value="">Selecione...</option>
                    {offers.filter(o => o.product_id === creativeForm.product_id).map(o => (
                      <option key={o.id} value={o.id}>{o.human_id} - {o.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Formato</label>
                  <select
                    value={creativeForm.format}
                    onChange={e => setCreativeForm({ ...creativeForm, format: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200"
                  >
                    <option value="VIDEO">VÍDEO</option>
                    <option value="IMAGE">IMAGEM</option>
                    <option value="CAROUSEL">CARROSSEL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">CTA (Call To Action)</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Saiba Mais, Ver Vídeo, Comprar"
                    value={creativeForm.cta}
                    onChange={e => setCreativeForm({ ...creativeForm, cta: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Hook (Gancho de Atenção)</label>
                <input
                  type="text"
                  required
                  placeholder="Primeiros 3 segundos..."
                  value={creativeForm.hook}
                  onChange={e => setCreativeForm({ ...creativeForm, hook: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Conceito Visual</label>
                <textarea
                  required
                  placeholder="Direção de arte do criativo..."
                  value={creativeForm.concept}
                  onChange={e => setCreativeForm({ ...creativeForm, concept: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Copywriting</label>
                <textarea
                  required
                  placeholder="Roteiro de copy..."
                  value={creativeForm.copy}
                  onChange={e => setCreativeForm({ ...creativeForm, copy: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Link do Arquivo / URL do Grid</label>
                <input
                  type="url"
                  required
                  placeholder="https://bucket.supabase.co/..."
                  value={creativeForm.file_url}
                  onChange={e => setCreativeForm({ ...creativeForm, file_url: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCreative(false)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
                >
                  Cadastrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
