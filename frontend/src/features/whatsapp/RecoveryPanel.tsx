import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';

// NORQVA-0125: Vendas → WhatsApp → "Pagamentos não concluídos" (só ADMIN).
// Lista quem gerou um pagamento e não pagou (calculada no servidor), deixa tirar qualquer pessoa,
// mostra a mensagem exata e põe na fila. A fila manda uma pessoa a cada 2 a 4 minutos, das 09h às 20h.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

interface Person {
  id: string;
  phone_masked: string;
  first_name: string | null;
  product_name: string;
  order_created_at: string;
  pending_orders: number;
  selectable: boolean;
  note: string | null;
  last_attempt: { status: string; reason: string | null } | null;
  preview: string;
}

interface HistoryRow {
  id: string;
  phone_masked: string;
  first_name: string | null;
  product_name: string | null;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  reason: string | null;
  queued_at: string;
  sent_at: string | null;
}

interface Overview {
  enabled: boolean;
  number: { label: string; ready: boolean } | null;
  number_problem: string | null;
  window: { start: string; end: string; open: boolean };
  people: Person[];
  excluded: Record<string, number>;
  history: HistoryRow[];
}

export const RECOVERY_STATUS: Record<string, string> = {
  QUEUED: 'Na fila',
  SENDING: 'Enviando',
  SENT: 'Enviada',
  FAILED: 'Falhou',
  SKIPPED: 'Pulada'
};

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export function RecoveryPanel({ api, showError, showSuccess }: { api: React.MutableRefObject<ApiFetch>; showError: (m: string) => void; showSuccess: (m: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api.current('/whatsapp/recovery')
      .then((r: Overview) => setData(r))
      .catch((e: any) => showError(e?.message || 'Falha ao carregar os pagamentos não concluídos.'));
  }, [api, showError]);

  useEffect(() => { load(); }, [load]);

  const people = data?.people || [];
  const selectable = useMemo(() => people.filter(p => p.selectable), [people]);
  const selected = useMemo(() => selectable.filter(p => !excluded.has(p.id)), [selectable, excluded]);
  const preview = people.find(p => p.id === previewKey) || selected[0] || people[0] || null;

  const toggle = (key: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const send = async () => {
    setSending(true);
    try {
      const r = await api.current('/whatsapp/recovery/send', { method: 'POST', body: JSON.stringify({ ids: selected.map(p => p.id) }) });
      showSuccess(`${r?.queued ?? 0} pessoa(s) na fila. Uma mensagem a cada 2 a 4 minutos, das 09h às 20h.`);
      setConfirming(false);
      setExcluded(new Set());
      load();
    } catch (e: any) {
      showError(e?.message || 'Falha ao colocar as mensagens na fila.');
    } finally {
      setSending(false);
    }
  };

  if (!data) return <div className="text-sm text-nq-muted" data-testid="wa-recovery">Carregando…</div>;

  const blocked = !data.enabled ? 'O envio está desligado no servidor (WHATSAPP_RECOVERY_ENABLED). A lista aparece, mas nada é enviado.'
    : data.number_problem ? `Nada será enviado: ${data.number_problem}` : null;
  const ex = data.excluded || {};

  return (
    <div className="space-y-4" data-testid="wa-recovery">
      <div className="rounded-nq bg-nq-surface p-4 space-y-1 text-sm text-nq-text">
        <p>Uma única mensagem pelo WhatsApp para quem gerou um pagamento nos últimos 30 dias e não pagou. Cada pessoa recebe no máximo uma vez, para sempre.</p>
        <p className="text-[12px] text-nq-muted">
          Ficam de fora: quem já pagou ({ex.PAID || 0}), quem pediu para não receber ({ex.OPTED_OUT || 0}) e pedidos de oferta fora do ar ({ex.OFFER_INACTIVE || 0}).
          Envio das {data.window.start} às {data.window.end} (Brasília){data.window.open ? '' : ', agora fora do horário: a fila espera'}.
          {data.number ? ` Número: ${data.number.label}.` : ''}
        </p>
        {blocked && <p className="text-[13px] text-nq-attention" data-testid="wa-recovery-blocked">{blocked}</p>}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-nq-text">Prontos para receber ({selectable.length})</h2>
          <button onClick={load} className="min-h-[44px] rounded-full px-3 text-nq-aux text-nq-muted hover:text-nq-text inline-flex items-center gap-1" aria-label="Atualizar">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
        {people.length === 0 ? (
          <p className="text-sm text-nq-subtle">Ninguém na lista agora.</p>
        ) : (
          <ul className="divide-y divide-nq-line/60 rounded border border-nq-line">
            {people.map(p => (
              <li key={p.id} className={`flex items-center gap-3 p-2 text-sm text-nq-text ${p.selectable ? '' : 'opacity-60'}`}>
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0"
                  checked={p.selectable && !excluded.has(p.id)}
                  disabled={!p.selectable}
                  onChange={() => toggle(p.id)}
                  aria-label={`Incluir ${p.first_name || p.phone_masked}`}
                />
                <button className="min-w-0 flex-1 text-left" onClick={() => setPreviewKey(p.id)} data-testid={`wa-recovery-person-${p.id}`}>
                  <div className="break-words">
                    <span className="font-medium">{p.first_name || 'Sem nome'}</span>
                    <span className="text-nq-muted"> · {p.product_name}</span>
                  </div>
                  <div className="text-[12px] text-nq-subtle">
                    Pedido em {fmtDate(p.order_created_at)} · {p.phone_masked}
                    {p.pending_orders > 1 ? ` · ${p.pending_orders} pedidos (mensagem sobre o mais recente)` : ''}
                    {p.note ? ` · ${p.note}` : p.last_attempt ? ` · Última tentativa: ${RECOVERY_STATUS[p.last_attempt.status] || p.last_attempt.status}${p.last_attempt.reason ? ` (${p.last_attempt.reason})` : ''}` : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {preview && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-nq-text">Mensagem{preview.first_name ? ` para ${preview.first_name}` : ''}</h2>
          <div className="rounded-nq bg-nq-surface p-3 text-sm text-nq-text whitespace-pre-wrap break-words" data-testid="wa-recovery-preview">{preview.preview}</div>
          <p className="text-[12px] text-nq-subtle">Texto fixo, sem IA. O código de origem (••••••) é criado na hora do envio. Se a pessoa responder, o atendente continua a conversa.</p>
        </section>
      )}

      <div className="space-y-2">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={!!blocked || selected.length === 0}
            className="min-h-[44px] rounded-full bg-nq-text px-5 text-nq-aux font-medium text-nq-bg disabled:opacity-40 inline-flex items-center gap-2"
          >
            <Send size={14} /> Enviar
          </button>
        ) : (
          <div className="rounded-nq border border-nq-attention/40 p-3 space-y-2 text-sm text-nq-text" data-testid="wa-recovery-confirm">
            <p>Enviar para {selected.length} pessoa(s)? Cada uma recebe uma mensagem só, a cada 2 a 4 minutos, das 09h às 20h.</p>
            <div className="flex gap-2">
              <button onClick={send} disabled={sending} className="min-h-[44px] rounded-full bg-nq-text px-4 text-nq-bg disabled:opacity-40">Confirmar envio</button>
              <button onClick={() => setConfirming(false)} disabled={sending} className="min-h-[44px] rounded-full bg-nq-surface px-4 text-nq-muted">Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-nq-text">Envios</h2>
        {(data.history || []).length === 0 ? (
          <p className="text-sm text-nq-subtle">Nenhum envio ainda.</p>
        ) : (
          <ul className="divide-y divide-nq-line/60 rounded border border-nq-line" data-testid="wa-recovery-history">
            {data.history.map(h => (
              <li key={h.id} className="p-2 text-sm text-nq-text">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words">{h.first_name || 'Sem nome'}<span className="text-nq-muted"> · {h.product_name || '—'}</span></span>
                  <span className="shrink-0 text-[12px] font-medium">{RECOVERY_STATUS[h.status] || h.status}</span>
                </div>
                <div className="text-[12px] text-nq-subtle">
                  {h.phone_masked} · {h.sent_at ? `enviada em ${fmtDate(h.sent_at)}` : `na fila desde ${fmtDate(h.queued_at)}`}
                  {h.reason ? ` · ${h.reason}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
