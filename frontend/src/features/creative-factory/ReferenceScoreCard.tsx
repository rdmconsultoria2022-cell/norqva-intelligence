import React from 'react';
import { Surface, StatusPill, Tone } from '../../components/ui/premium';

// NORQVA-0119: nota de força ESTIMADA da referência (servidor: services/creative/referenceScore.ts).
// Sempre marcada como estimativa, com o motivo de cada ponto.

const LEVEL_TONE: Record<string, Tone> = { FORTE: 'positive', MEDIA: 'info', FRACA: 'attention' };

export function ReferenceScoreCard({ score }: { score: any }) {
  if (!score || typeof score.score !== 'number') return null;
  const tone = LEVEL_TONE[score.level] || 'neutral';
  const signals = (score.items || []).filter((i: any) => i.key === 'time' || i.key === 'variants');
  const structure = (score.items || []).filter((i: any) => i.key !== 'time' && i.key !== 'variants');
  const sum = (list: any[], k: 'points' | 'max') => list.reduce((a, i) => a + (Number(i[k]) || 0), 0);
  return (
    <Surface className="p-4 space-y-4" as="div">
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="reference-score">
        <div className="flex items-baseline gap-2">
          <span className="text-[34px] leading-none font-semibold tabular-nums text-nq-text" data-testid="reference-score-value">
            {score.score}
          </span>
          <span className="text-nq-aux text-nq-muted">de 100</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={tone}>{score.level_label}</StatusPill>
          <StatusPill tone="neutral">Estimativa</StatusPill>
        </div>
      </div>
      <div className="h-2 rounded-full bg-nq-raised overflow-hidden" aria-hidden="true">
        <div className={`h-full rounded-full ${tone === 'positive' ? 'bg-nq-positive' : tone === 'info' ? 'bg-nq-info' : 'bg-nq-attention'}`} style={{ width: `${Math.max(2, score.score)}%` }} />
      </div>
      <p className="text-nq-aux text-nq-text">{score.summary}</p>
      <ScoreGroup title={`Sinais de força (${sum(signals, 'points')} de ${sum(signals, 'max')})`} items={signals} />
      <ScoreGroup title={`Estrutura (${sum(structure, 'points')} de ${sum(structure, 'max')})`} items={structure} />
      <p className="text-nq-caption text-nq-subtle">
        Ninguém de fora vê as vendas de um anúncio de outra empresa. A nota usa só o que aparece: tempo no ar, variações e como a peça é montada.
      </p>
    </Surface>
  );
}

function ScoreGroup({ title, items }: { title: string; items: any[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-nq-caption text-nq-subtle">{title}</div>
      <ul className="space-y-1.5">
        {items.map((i: any) => (
          <li key={i.key} className="flex items-start gap-3 text-nq-aux">
            <span className={`shrink-0 w-12 text-right tabular-nums font-semibold ${i.points > 0 ? 'text-nq-positive-text' : 'text-nq-subtle'}`}>
              +{i.points}
            </span>
            <span className="min-w-0 flex-1 text-nq-text break-words">{i.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
