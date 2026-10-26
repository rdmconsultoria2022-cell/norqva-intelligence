import { useEffect, useState, type ReactNode } from 'react';
import { ProgressBar, Stat, StatusPill, Tone, brl } from '../../components/ui/premium';

// NORQVA-0137 (D-0137): mandato de operação das campanhas (só ADMIN). O Claude opera as campanhas da lista
// dentro dos limites que o servidor confere (capital, teto diário, freio, prazo). Aqui o dono vê como está,
// ativa um mandato novo, muda a lista de campanhas e encerra (encerrar pausa as campanhas do mandato).

type Api = (url: string, options?: RequestInit) => Promise<any>;

const STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Em operação', tone: 'positive' },
  BRAKED: { label: 'Freio acionado', tone: 'critical' },
  ENDED: { label: 'Encerrado', tone: 'neutral' }
};

/** "ID" ou "ID:OFERTA" por linha → lista para a API. */
export function parseCampaignLines(text: string): Array<{ meta_campaign_id: string; offer_human_id?: string }> {
  return text
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [id, offer] = l.split(/[:\s]+/);
      return offer ? { meta_campaign_id: id, offer_human_id: offer } : { meta_campaign_id: id };
    });
}

const linesOf = (campaigns: any[]) => campaigns.map((c) => (c.offer_source === 'CONFIGURED' && c.offer_human_id ? `${c.meta_campaign_id}:${c.offer_human_id}` : c.meta_campaign_id)).join('\n');

const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export function OperatorMandate({ apiFetch, showError, showSuccess }: { apiFetch: Api; showError: (m: string) => void; showSuccess: (m: string) => void }) {
  const [data, setData] = useState<any | null>(null);
  const [reload, setReload] = useState(0);
  const [lines, setLines] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState('');
  const [askEnd, setAskEnd] = useState(false);
  const [askCreate, setAskCreate] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let off = false;
    apiFetch('/mandate?mode=real')
      .then((d) => {
        if (!off) setData(d && typeof d === 'object' ? d : { mandate: null });
      })
      .catch(() => {
        if (!off) setData({ error: true });
      });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const m = data?.mandate || null;
  const live = m && (m.status === 'ACTIVE' || m.status === 'BRAKED');

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r && typeof r === 'object' && r.mandate !== undefined) setData(r);
      showSuccess(ok);
      setReload((n) => n + 1);
      return true;
    } catch (e: any) {
      showError(e?.message || 'Não foi possível concluir.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(() => apiFetch('/mandate?mode=real', { method: 'POST', body: JSON.stringify({ campaigns: parseCampaignLines(lines) }) }), 'Mandato ativado.').then((ok) => {
      if (ok) {
        setAskCreate(false);
        setLines('');
      }
    });
  const saveCampaigns = () =>
    run(() => apiFetch('/mandate/campaigns?mode=real', { method: 'PUT', body: JSON.stringify({ campaigns: parseCampaignLines(lines) }) }), 'Campanhas do mandato salvas.').then((ok) => {
      if (ok) setEditing(false);
    });
  const end = () =>
    run(() => apiFetch('/mandate/end?mode=real', { method: 'POST', body: JSON.stringify({ confirm: confirmEnd }) }), 'Mandato encerrado. As campanhas do mandato foram mandadas pausar.').then((ok) => {
      if (ok) {
        setAskEnd(false);
        setConfirmEnd('');
      }
    });
  const checkNow = () => run(() => apiFetch('/mandate/check?mode=real', { method: 'POST' }), 'Mandato conferido agora.');

  const campaignsEditor = (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="block text-[12px] text-nq-muted">Campanhas (ID da Meta, uma por linha; opcional ":oferta", ex.: 120250112900200097:OFF-000012)</span>
        <textarea
          aria-label="Campanhas do mandato"
          value={lines}
          onChange={(e) => setLines(e.target.value)}
          rows={3}
          className="w-full rounded-xl bg-nq-raised px-3 py-2 text-[14px] text-nq-text tabular-nums placeholder:text-nq-subtle"
        />
      </label>
    </div>
  );

  let body: ReactNode;
  if (data === null) body = <p className="px-4 py-3.5 text-[13px] text-nq-muted">Carregando…</p>;
  else if (data.error) body = <p className="px-4 py-3.5 text-[13px] text-nq-critical-text">Não foi possível carregar o mandato.</p>;
  else if (!live) {
    body = (
      <div className="px-4 py-3.5 space-y-3">
        {m ? (
          <p className="text-[13px] text-nq-muted" data-testid="mandate-last">
            Último mandato encerrado em {date(m.brake?.at)}: gasto {brl(m.spent_brl)}, resultado {brl(m.result_brl)}. {m.brake?.reason || ''}
          </p>
        ) : (
          <p className="text-[13px] text-nq-muted" data-testid="mandate-empty">Nenhum mandato em vigor.</p>
        )}
        <p className="text-[13px] text-nq-muted">
          Novo mandato: capital R$ 1.500 em até 21 dias, teto de R$ 100/dia somando as campanhas, freio em R$ 750 de gasto sem tração ou R$ 750 de prejuízo. Tudo conferido no servidor.
        </p>
        {campaignsEditor}
        {!askCreate ? (
          <button type="button" disabled={busy || !lines.trim()} onClick={() => setAskCreate(true)} className="min-h-[44px] px-4 rounded-full bg-nq-text text-nq-bg text-[13px] font-semibold disabled:opacity-50">
            Ativar mandato
          </button>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2 text-[12px] text-nq-muted">
            O operador passa a poder pausar, ativar e mudar orçamento dessas campanhas dentro dos limites. Confirmar?
            <button type="button" onClick={create} disabled={busy} className="min-h-[44px] px-3 rounded-full bg-nq-text text-nq-bg text-[13px] font-semibold">
              Confirmar ativação
            </button>
            <button type="button" onClick={() => setAskCreate(false)} className="min-h-[44px] px-3 rounded-full bg-nq-raised text-nq-text text-[13px]">
              Cancelar
            </button>
          </span>
        )}
      </div>
    );
  } else {
    const st = STATUS[m.status] || { label: m.status, tone: 'neutral' as Tone };
    const spent = m.spent_brl;
    const resultTone: Tone = m.result_brl === null ? 'neutral' : m.result_brl >= 0 ? 'positive' : 'critical';
    body = (
      <div className="px-4 py-3.5 space-y-4" data-testid="mandate-live">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={st.tone} testId="mandate-status">{st.label}</StatusPill>
          <span className="text-[12px] text-nq-muted">
            {m.status === 'ACTIVE' ? `${m.days_left} dia(s) restantes · termina ${date(m.ends_at)}` : m.brake?.reason}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Capital usado" value={spent === null ? '—' : brl(spent)} hint={`de ${brl(m.capital_brl)}`} testId="mandate-spent" />
          <Stat label="Resultado" value={m.result_brl === null ? '—' : brl(m.result_brl)} tone={resultTone} hint={`${m.paid_sales ?? 0} venda(s) paga(s)`} testId="mandate-result" />
          <Stat label="Orçamento/dia" value={m.daily_budget_sum_brl === null ? '—' : brl(m.daily_budget_sum_brl)} hint={`teto ${brl(m.daily_cap_brl)}`} />
          <Stat
            label="Freio"
            value={m.brake?.state === 'LIVRE' ? 'Livre' : 'Acionado'}
            tone={m.brake?.state === 'LIVRE' ? 'positive' : 'critical'}
            hint={`R$ 750 sem tração ou −R$ 750`}
            testId="mandate-brake"
          />
        </div>
        {spent !== null && <ProgressBar value={spent} max={m.capital_brl} tone={spent >= m.rules?.brake_spend_brl ? 'attention' : 'info'} label="Capital usado" />}
        {m.brake?.pause_pending && <p className="text-[12px] text-nq-critical-text">Ainda há campanha do mandato que o NORQVA não conseguiu pausar. Confira e pause pela tela.</p>}
        {m.last_check_error && <p className="text-[12px] text-nq-attention break-words">Última leitura do gasto na Meta falhou: {m.last_check_error}. Enquanto isso o operador só pode pausar.</p>}
        <p className="text-[12px] text-nq-muted">
          Gasto da Meta; vendas e resultado só de pedidos pagos confirmados pelo Asaas. Conferido em {date(m.last_check_at)}.{' '}
          <button type="button" onClick={checkNow} disabled={busy} className="underline text-nq-text disabled:opacity-50">
            Conferir agora
          </button>
        </p>

        <ul className="divide-y divide-nq-line/70 rounded-xl bg-nq-raised/40" aria-label="Campanhas do mandato">
          {(Array.isArray(m.campaigns) ? m.campaigns : []).map((c: any) => (
            <li key={c.meta_campaign_id} className="px-3 py-2.5 text-[13px]" data-testid={`mandate-campaign-${c.meta_campaign_id}`}>
              <div className="text-nq-text break-words">{c.name || c.meta_campaign_id}</div>
              <div className="text-[12px] text-nq-muted break-all">
                ID {c.meta_campaign_id} · {c.status === 'ACTIVE' ? 'Ativa' : c.status === 'PAUSED' ? 'Pausada' : c.status || '—'} · oferta {c.offer_human_id || 'a definir'}
                {c.max_cpa !== null && c.max_cpa !== undefined ? ` (CPA máx. ${brl(c.max_cpa)})` : ''} · gasto {c.spend === null ? '—' : brl(c.spend)} · {c.paid_sales ?? 0} venda(s)
                {c.cpa !== null && c.cpa !== undefined ? ` · CPA ${brl(c.cpa)}` : ''}
              </div>
            </li>
          ))}
        </ul>

        {editing ? (
          <div className="space-y-2">
            {campaignsEditor}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={saveCampaigns} disabled={busy || !lines.trim()} className="min-h-[44px] px-4 rounded-full bg-nq-text text-nq-bg text-[13px] font-semibold disabled:opacity-50">
                Salvar campanhas
              </button>
              <button type="button" onClick={() => setEditing(false)} className="min-h-[44px] px-3 rounded-full bg-nq-raised text-nq-text text-[13px]">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setLines(linesOf(Array.isArray(m.campaigns) ? m.campaigns : []));
                setEditing(true);
              }}
              className="min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-[13px]"
            >
              Editar campanhas
            </button>
            {!askEnd ? (
              <button type="button" onClick={() => setAskEnd(true)} className="min-h-[44px] px-4 rounded-full bg-nq-critical/15 text-nq-critical-text text-[13px] font-semibold">
                Encerrar mandato
              </button>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-2 text-[12px] text-nq-muted">
                Encerrar pausa todas as campanhas do mandato. Digite ENCERRAR:
                <input
                  aria-label="Confirmação para encerrar"
                  value={confirmEnd}
                  onChange={(e) => setConfirmEnd(e.target.value)}
                  className="min-h-[44px] w-[130px] rounded-xl bg-nq-raised px-3 text-[14px] text-nq-text"
                />
                <button
                  type="button"
                  onClick={end}
                  disabled={busy || confirmEnd.trim().toUpperCase() !== 'ENCERRAR'}
                  className="min-h-[44px] px-3 rounded-full bg-nq-critical/15 text-nq-critical-text text-[13px] font-semibold disabled:opacity-50"
                >
                  Confirmar encerramento
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAskEnd(false);
                    setConfirmEnd('');
                  }}
                  className="min-h-[44px] px-3 rounded-full bg-nq-raised text-nq-text text-[13px]"
                >
                  Cancelar
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-2" aria-label="Mandato de operação" data-testid="operator-mandate">
      <h2 className="text-[13px] leading-[18px] font-semibold text-nq-muted">Mandato de operação (Claude)</h2>
      <div className="rounded-2xl bg-nq-surface overflow-hidden">{body}</div>
    </section>
  );
}
