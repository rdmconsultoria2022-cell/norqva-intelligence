import React, { useState, useEffect } from 'react';
import { Package, Plus, Link2, Trash2, X, CheckCircle, AlertTriangle, FileCode } from 'lucide-react';

interface DigitalAsset {
  id: string;
  name: string;
  storage_provider: string;
  storage_bucket: string;
  storage_path: string;
  is_demo: boolean;
  created_at: string;
  linked_at?: string;
}

interface DigitalAssetAdminModalProps {
  offer: {
    id: string;
    human_id: string;
    name: string;
    is_demo: boolean;
  };
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  onClose: () => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

export const DigitalAssetAdminModal: React.FC<DigitalAssetAdminModalProps> = ({
  offer,
  apiFetch,
  onClose,
  showError,
  showSuccess
}) => {
  const [linkedAssets, setLinkedAssets] = useState<DigitalAsset[]>([]);
  const [allAssets, setAllAssets] = useState<DigitalAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // New asset form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBucket, setNewBucket] = useState('');
  const [newPath, setNewPath] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [linkedData, allData] = await Promise.all([
        apiFetch(`/offers/${offer.id}/digital-assets`),
        apiFetch(`/digital-assets?mode=${offer.is_demo ? 'demo' : 'real'}`)
      ]);

      setLinkedAssets(Array.isArray(linkedData) ? linkedData : []);
      setAllAssets(Array.isArray(allData) ? allData : []);
    } catch (err: any) {
      console.error('Failed to load digital assets:', err);
      showError(err.message || 'Falha ao carregar ativos digitais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [offer.id]);

  const handleLinkAsset = async () => {
    if (!selectedAssetId) return;
    try {
      setSubmitting(true);
      await apiFetch(`/offers/${offer.id}/digital-assets`, {
        method: 'POST',
        body: JSON.stringify({ asset_id: selectedAssetId })
      });
      showSuccess('Ativo digital vinculado com sucesso!');
      setSelectedAssetId('');
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Falha ao vincular ativo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlinkAsset = async (assetId: string) => {
    try {
      setSubmitting(true);
      await apiFetch(`/offers/${offer.id}/digital-assets/${assetId}`, {
        method: 'DELETE'
      });
      showSuccess('Ativo desvinculado com sucesso.');
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Falha ao desvincular ativo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newBucket || !newPath) return;

    try {
      setSubmitting(true);
      const createdAsset = await apiFetch('/digital-assets', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          storage_provider: 'SUPABASE',
          storage_bucket: newBucket,
          storage_path: newPath,
          is_demo: offer.is_demo
        })
      });

      // Auto-link to this offer
      if (createdAsset && createdAsset.id) {
        await apiFetch(`/offers/${offer.id}/digital-assets`, {
          method: 'POST',
          body: JSON.stringify({ asset_id: createdAsset.id })
        });
      }

      showSuccess(`Ativo '${createdAsset?.name || newName}' criado e vinculado com sucesso!`);
      setShowCreateForm(false);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Falha ao criar ativo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 text-sm shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-400" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 font-mono">Ativos Digitais da Oferta</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
                  {offer.human_id}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${offer.is_demo ? 'bg-amber-950/60 text-amber-400' : 'bg-cyan-950/60 text-cyan-400'}`}>
                  {offer.is_demo ? 'DEMO' : 'STAGING / TEST'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{offer.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Linked Assets List */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
            Ativos Vinculados ({linkedAssets.length})
          </h4>
          {loading ? (
            <div className="py-4 text-center text-xs text-slate-500 font-mono">Carregando...</div>
          ) : linkedAssets.length === 0 ? (
            <div className="p-3 border border-slate-800/80 rounded bg-slate-950/50 text-center text-xs text-slate-400 font-mono flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Nenhum ativo digital vinculado a esta oferta.
            </div>
          ) : (
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {linkedAssets.map((asset) => (
                <div key={asset.id} className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-200 truncate">{asset.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        {asset.storage_bucket}/{asset.storage_path}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnlinkAsset(asset.id)}
                    disabled={submitting}
                    className="p-1 text-red-400 hover:bg-red-950/40 rounded transition"
                    title="Desvincular ativo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Link Existing Asset */}
        <div className="space-y-2 pt-3 border-t border-slate-800">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
            Vincular Ativo Existente
          </h4>
          <div className="flex gap-2">
            <select
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Selecione um ativo cadastrado...</option>
              {allAssets
                .filter((a) => !linkedAssets.some((la) => la.id === a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.storage_path})
                  </option>
                ))}
            </select>
            <button
              onClick={handleLinkAsset}
              disabled={!selectedAssetId || submitting}
              className="px-3 py-1.5 bg-emerald-500 text-slate-950 text-xs font-bold rounded hover:bg-emerald-400 disabled:opacity-50 transition flex items-center gap-1"
            >
              <Link2 className="h-3.5 w-3.5" />
              Vincular
            </button>
          </div>
        </div>

        {/* Create New Asset Section */}
        <div className="pt-3 border-t border-slate-800">
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full py-2 bg-slate-800 border border-slate-700 hover:bg-slate-750 text-slate-300 text-xs font-mono rounded flex items-center justify-center gap-1.5 transition"
            >
              <Plus className="h-4 w-4 text-emerald-400" />
              Cadastrar Novo Ativo Digital
            </button>
          ) : (
            <form onSubmit={handleCreateAsset} className="space-y-3 p-3 bg-slate-950/70 border border-slate-800 rounded">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold font-mono text-emerald-400">Novo Ativo Digital</h5>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Cancelar
                </button>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-mono text-slate-400">Nome do Ativo</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Trattoria em Casa — PDF Oficial"
                    required
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-mono text-slate-400">Storage Bucket</label>
                    <input
                      type="text"
                      value={newBucket}
                      onChange={(e) => setNewBucket(e.target.value)}
                      placeholder="Ex: digital-products"
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-slate-400">Storage Path</label>
                    <input
                      type="text"
                      value={newPath}
                      onChange={(e) => setNewPath(e.target.value)}
                      placeholder="Ex: TRATTORIA_EM_CASA_FINAL.pdf"
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    />
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded transition flex items-center justify-center gap-1"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Criar e Vincular à Oferta
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
