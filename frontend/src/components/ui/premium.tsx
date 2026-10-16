import React, { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// NORQVA-0082 (proposta): peças compartilhadas do Design System NORQVA Premium.
// Regras: separação por contraste (sem caixa com borda em tudo), texto mínimo de 12 px,
// verde só para resultado positivo e ação principal, vermelho de texto = nq-critical-text.

export type Tone = 'positive' | 'info' | 'attention' | 'critical' | 'neutral';

const TONE_TEXT: Record<Tone, string> = {
  positive: 'text-nq-positive-text',
  info: 'text-nq-info',
  attention: 'text-nq-attention',
  critical: 'text-nq-critical-text',
  neutral: 'text-nq-muted'
};

const TONE_DOT: Record<Tone, string> = {
  positive: 'bg-nq-positive',
  info: 'bg-nq-info',
  attention: 'bg-nq-attention',
  critical: 'bg-nq-critical',
  neutral: 'bg-nq-subtle'
};

export function toneText(t: Tone) {
  return TONE_TEXT[t];
}

/** Bloco da página: título discreto + ação opcional à direita. Sem borda; o fundo separa. */
export function Section({
  title,
  action,
  children,
  className = '',
  testId
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid={testId} className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-3 px-1 min-h-[40px]">
        <h2 id={id} className="text-nq-section font-semibold text-nq-text">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Superfície agrupadora: fundo levemente mais claro, cantos arredondados, sem sombra. */
export function Surface({ children, className = '', as: Tag = 'div' }: { children: React.ReactNode; className?: string; as?: any }) {
  return <Tag className={`rounded-nq bg-nq-surface ${className}`}>{children}</Tag>;
}

/** Linha de lista com divisória discreta (estilo extrato). */
export function Row({
  left,
  right,
  sub,
  subRight,
  onClick,
  ariaLabel,
  chevron = false,
  testId
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  sub?: React.ReactNode;
  subRight?: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  chevron?: boolean;
  testId?: string;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-nq-body text-nq-text break-words">{left}</div>
        {sub && <div className="text-nq-aux text-nq-muted break-words mt-0.5">{sub}</div>}
      </div>
      {(right !== undefined || subRight !== undefined) && (
        <div className="text-right shrink-0">
          {right !== undefined && <div className="text-nq-body font-semibold text-nq-text tabular-nums">{right}</div>}
          {subRight !== undefined && <div className="text-nq-aux text-nq-muted mt-0.5">{subRight}</div>}
        </div>
      )}
      {chevron && <ChevronRight aria-hidden="true" className="h-4 w-4 text-nq-subtle shrink-0" />}
    </>
  );
  const cls = 'w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] text-left';
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={ariaLabel} data-testid={testId} className={`${cls} active:bg-nq-raised transition-colors`}>
      {body}
    </button>
  ) : (
    <div data-testid={testId} className={cls}>
      {body}
    </div>
  );
}

/** Lista agrupada: linhas separadas por divisória fina, dentro de uma superfície. */
export function RowGroup({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <Surface className={`divide-y divide-nq-line/70 overflow-hidden ${className}`}>{children}</Surface>;
}

/** Selo de situação: ponto colorido + texto curto em caixa normal. */
export function StatusPill({ tone, children, testId }: { tone: Tone; children: React.ReactNode; testId?: string }) {
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1.5 text-nq-caption font-medium ${TONE_TEXT[tone]}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
      {children}
    </span>
  );
}

/** Barra de progresso; acima do limite a barra fica cheia e muda de cor. */
export function ProgressBar({ value, max, tone, label }: { value: number; max: number; tone: Tone; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-1.5 w-full rounded-full bg-nq-raised overflow-hidden"
    >
      <div className={`h-full rounded-full ${TONE_DOT[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Área expansível acessível (detalhes técnicos, regras, IDs). */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  testId,
  className = ''
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  testId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div data-testid={testId} className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 min-h-[48px] text-left text-nq-aux text-nq-muted"
      >
        <span className="min-w-0">{summary}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={id} hidden={!open} className="px-4 pb-4">
        {open && children}
      </div>
    </div>
  );
}

/** Rótulo + valor pequeno, para grades de 2 colunas. */
export function Stat({ label, value, hint, tone = 'neutral', testId }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone; testId?: string }) {
  return (
    <div data-testid={testId} className="min-w-0">
      <div className="text-nq-aux text-nq-muted">{label}</div>
      <div className={`mt-1 text-[22px] leading-7 font-semibold tracking-tight tabular-nums truncate ${tone === 'neutral' ? 'text-nq-text' : TONE_TEXT[tone]}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-nq-caption text-nq-muted">{hint}</div>}
    </div>
  );
}

// ---------- formatação (pt-BR) ----------

export function brl(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (opts.compact && Math.abs(v) >= 10_000) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
  }
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function int(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('pt-BR');
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function multiple(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}
