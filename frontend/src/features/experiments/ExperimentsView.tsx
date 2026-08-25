import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { ExperimentsProps } from './experimentTypes';

export function ExperimentsView({
  experiments,
  products,
  offers,
  creatives,
  currentUser,
  isDemoView,
  onSelectExperiment,
  onRegisterPerformance,
  onAuthorizeCapital,
  showError,
  showSuccess,
  refreshExperiments
}: ExperimentsProps) {
  const [showAddExperiment, setShowAddExperiment] = useState(false);
  const [expForm, setExpForm] = useState({
    name: '',
    hypothesis: '',
    product_id: '',
    offer_id: '',
    creative_ids: [] as string[],
    start_date: '',
    end_date: '',
    capital_requested: 0
  });

  const isAdmin = currentUser ? currentUser.role === 'ADMIN' : false;

  const handleAddExp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const mode = isDemoView ? 'demo' : 'real';
      await apiFetch(
        `/experiments?mode=${mode}`,
        {
          method: 'POST',
          body: JSON.stringify(expForm)
        },
        mode,
        currentUser
      );
      showSuccess('Experimento operacional lançado com sucesso!');
      setShowAddExperiment(false);
      setExpForm({
        name: '',
        hypothesis: '',
        product_id: '',
        offer_id: '',
        creative_ids: [],
        start_date: '',
        end_date: '',
        capital_requested: 0
      });
      await refreshExperiments();
    } catch (err: any) {
      showError(err.message);
    }
  };

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-200 font-mono">Painel de Experimentos</h2>
          <p className="text-xs text-slate-400">Controle rigoroso do Capital at Risk e cruzamento de hipóteses</p>
        </div>
        <button
          onClick={() => setShowAddExperiment(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-slate-950 font-bold rounded hover:bg-emerald-400 transition"
        >
          <Plus className="h-4 w-4" />
          Lançar Experimento
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {experiments.length === 0 ? (
          <div className="p-12 border border-slate-800 rounded bg-slate-900/20 text-center text-slate-500 font-mono">
            Nenhum experimento operacional cadastrado.
          </div>
        ) : (
          experiments.map((exp: any) => {
            const approved = parseFloat(exp.capital_approved);
            const used = parseFloat(exp.capital_used);
            const capPct = approved > 0 ? (used / approved) * 100 : 0;
            const remains = parseFloat((approved - used).toFixed(2));
            const isWarning = capPct >= 80 && capPct < 100;
            const isLimit = capPct >= 100;

            return (
              <div key={exp.id} className="p-5 border border-slate-800 bg-slate-900/30 rounded space-y-4">
                <div className="flex items-start justify-between">
                  <div className="cursor-pointer" onClick={() => onSelectExperiment(exp)}>
                    <span className="font-mono text-emerald-400 font-bold text-xs hover:underline">{exp.human_id}</span>
                    <h3 className="text-md font-bold text-slate-200 mt-0.5 hover:text-emerald-400 transition">{exp.name}</h3>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Prod: {exp.product_name} • Off: {exp.offer_name}
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                    exp.status === 'ATIVO' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {exp.status}
                  </span>
                </div>

                <div className="text-xs text-slate-300 bg-slate-950/40 p-3 rounded font-mono">
                  <span className="text-slate-500 uppercase text-[10px] font-bold">Hipótese Científica</span>
                  <p className="mt-1">"{exp.hypothesis}"</p>
                </div>

                {/* Progress Tracking */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Capital at Risk:</span>
                    <span className="text-slate-300">
                      R${used.toLocaleString('pt-BR')} / R${approved.toLocaleString('pt-BR')} utilizados ({capPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 border border-slate-850 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${isLimit ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(capPct, 100)}%` }}
                    ></div>
                  </div>
                  {isWarning && <div className="text-[10px] text-amber-400 font-mono">Aviso: 80% do capital consumido.</div>}
                  {isLimit && <div className="text-[10px] text-red-400 font-mono">Alerta: Limite estourado. Novos gastos bloqueados.</div>}
                </div>

                {/* Actions panel */}
                <div className="flex justify-between items-center pt-2 border-t border-slate-850 text-xs">
                  <div className="text-[10px] text-slate-500 font-mono">
                    Responsável: {exp.responsible_name || 'N/A'}
                  </div>
                  <div className="space-x-2">
                    <button
                      onClick={() => onRegisterPerformance(exp.id)}
                      className="px-3 py-1.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-semibold transition"
                    >
                      Lançar Performance
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => onAuthorizeCapital(exp)}
                        className="px-3 py-1.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-semibold transition"
                      >
                        Autorizar Orçamento
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Add Experiment */}
      {showAddExperiment && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 text-sm overflow-y-auto max-h-[90vh] custom-scrollbar">
            <h3 className="text-md font-bold tracking-widest font-mono text-emerald-400 mb-4 uppercase">Lançar Experimento operacional</h3>
            <form onSubmit={handleAddExp} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Nome do Experimento</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Target Segment Test A/B"
                  value={expForm.name}
                  onChange={e => setExpForm({ ...expForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Hipótese Principal</label>
                <textarea
                  required
                  placeholder="Se testarmos X, esperamos resultado Y por causa de Z..."
                  value={expForm.hypothesis}
                  onChange={e => setExpForm({ ...expForm, hypothesis: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Produto</label>
                  <select
                    required
                    value={expForm.product_id}
                    onChange={e => setExpForm({ ...expForm, product_id: e.target.value, offer_id: '', creative_ids: [] })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200"
                  >
                    <option value="">Selecione...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.human_id} - {p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Oferta</label>
                  <select
                    required
                    value={expForm.offer_id}
                    onChange={e => setExpForm({ ...expForm, offer_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200"
                  >
                    <option value="">Selecione...</option>
                    {offers.filter(o => o.product_id === expForm.product_id).map(o => (
                      <option key={o.id} value={o.id}>{o.human_id} - {o.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-2">Vincular Criativos do Lab (Selecione Múltiplos)</label>
                <div className="border border-slate-800 bg-slate-950/60 rounded p-3 max-h-40 overflow-y-auto custom-scrollbar space-y-1.5">
                  {creatives.filter(c => c.product_id === expForm.product_id).length === 0 ? (
                    <div className="text-slate-500 text-xs font-mono">Nenhum criativo associado a este produto no Lab.</div>
                  ) : (
                    creatives.filter(c => c.product_id === expForm.product_id).map(c => (
                      <label key={c.id} className="flex items-start gap-2 cursor-pointer p-1 hover:bg-slate-900 rounded">
                        <input
                          type="checkbox"
                          checked={expForm.creative_ids.includes(c.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setExpForm({ ...expForm, creative_ids: [...expForm.creative_ids, c.id] });
                            } else {
                              setExpForm({ ...expForm, creative_ids: expForm.creative_ids.filter(id => id !== c.id) });
                            }
                          }}
                          className="mt-0.5 rounded border-slate-850 text-emerald-500 focus:ring-emerald-500"
                        />
                        <div className="text-xs">
                          <span className="font-mono text-emerald-400 font-bold">{c.human_id}</span> - {c.hook.substring(0, 45)}...
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Data de Início</label>
                  <input
                    type="date"
                    required
                    value={expForm.start_date}
                    onChange={e => setExpForm({ ...expForm, start_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Data Término (Opcional)</label>
                  <input
                    type="date"
                    value={expForm.end_date}
                    onChange={e => setExpForm({ ...expForm, end_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Capital Solicitado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={expForm.capital_requested}
                  onChange={e => setExpForm({ ...expForm, capital_requested: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono text-emerald-400"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddExperiment(false)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
                >
                  Lançar Experimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
