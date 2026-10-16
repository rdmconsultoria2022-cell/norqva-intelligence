import React from 'react';

// Registro das decisões estratégicas (movido do App na NORQVA-0030; agora é a aba Decisões de Resultados).
// NORQVA-0086: lista no padrão NORQVA Premium. Só apresentação.
export function DecisionsView({ decisions }: { decisions: any[] }) {
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h2 className="text-nq-section font-semibold text-nq-text">Registro de decisões</h2>
        <p className="mt-1 text-nq-aux text-nq-muted">Todas as decisões estratégicas, com data, autor e justificativa.</p>
      </div>

      {decisions.length === 0 ? (
        <div className="rounded-nq bg-nq-surface p-10 text-center text-nq-aux text-nq-muted">Nenhuma decisão registrada.</div>
      ) : (
        <ul className="rounded-nq bg-nq-surface divide-y divide-nq-line/70 overflow-hidden">
          {decisions.map((dec: any) => (
            <li key={dec.id} className="px-4 py-4 space-y-2" data-testid="decision-item">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-nq-body font-semibold text-nq-text break-words">{dec.decision_text}</span>
                <span className="text-nq-caption text-nq-subtle">{dec.human_id}</span>
              </div>
              <div className="text-nq-caption text-nq-muted">
                {dec.type ? `${String(dec.type).charAt(0).toUpperCase()}${String(dec.type).slice(1).toLowerCase().replace(/_/g, ' ')} · ` : ''}
                {new Date(dec.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                {dec.responsible_name ? ` · ${dec.responsible_name}` : ''}
              </div>
              {dec.justification && (
                <p className="text-nq-aux text-nq-text/90 border-l-2 border-nq-line pl-3">{dec.justification}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
