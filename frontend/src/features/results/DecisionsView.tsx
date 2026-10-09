import React from 'react';

// Registro das decisões estratégicas (movido do App na NORQVA-0030; agora é a aba Decisões de Resultados).
export function DecisionsView({ decisions }: { decisions: any[] }) {
  return (
    <div className="space-y-6 text-sm">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-200 font-mono">Log de Decisões Estratégicas</h2>
        <p className="text-xs text-slate-400">Rastreabilidade completa de todas as alterações estratégicas do CORE</p>
      </div>

      <div className="space-y-4">
        {decisions.length === 0 ? (
          <div className="p-12 border border-slate-800 rounded bg-slate-900/20 text-center text-slate-500 font-mono">
            Nenhuma decisão registrada.
          </div>
        ) : (
          decisions.map((dec: any) => (
            <div key={dec.id} className="p-4 border border-slate-800 bg-slate-900/40 rounded flex items-start gap-4">
              <div className="p-2 rounded bg-slate-950 border border-slate-800 text-emerald-400 mt-1 shrink-0 font-mono text-xs font-bold">
                {dec.human_id}
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{dec.decision_text}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400 font-bold uppercase">
                      {dec.type}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Data: {new Date(dec.created_at).toLocaleString('pt-BR')} • Autor: {dec.responsible_name}
                  </div>
                </div>
                <div className="text-xs text-slate-350 bg-slate-950/30 p-2.5 rounded border border-slate-850">
                  <span className="text-[9px] font-mono text-slate-500 uppercase block">Justificativa estratégica</span>
                  <p className="mt-0.5 italic">"{dec.justification}"</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
