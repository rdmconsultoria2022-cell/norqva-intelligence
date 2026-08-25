import { useState, useRef, useEffect } from 'react';
import { Plus, Film, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { UserObj } from '../../types';

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {creatives.length === 0 ? (
          <div className="col-span-2 p-12 border border-slate-800 rounded bg-slate-900/20 text-center text-slate-500 font-mono">
            Nenhum criativo no laboratório.
          </div>
        ) : (
          creatives.map((cr: any) => (
            <div key={cr.id} className="p-4 border border-slate-800 bg-slate-900/30 rounded flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-emerald-400 font-bold text-xs">{cr.human_id}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400 font-bold">
                      {cr.format}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                    {cr.status}
                  </span>
                </div>
                
                <div className="mt-3 text-xs">
                  <span className="text-slate-500 font-mono uppercase">Gancho (Hook)</span>
                  <p className="text-slate-200 font-semibold italic">"{cr.hook}"</p>
                </div>
                
                <div className="mt-2 text-xs">
                  <span className="text-slate-500 font-mono uppercase">Conceito</span>
                  <p className="text-slate-300">{cr.concept}</p>
                </div>

                <div className="mt-2 text-xs">
                  <span className="text-slate-500 font-mono uppercase">Copy</span>
                  <p className="text-slate-300 line-clamp-2">{cr.copy}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-850 text-xs font-mono">
                <span className="text-slate-500">CTA: {cr.cta}</span>
                <a href={cr.file_url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                  Abrir Arquivo
                </a>
              </div>
            </div>
          ))
        )}
      </div>

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
