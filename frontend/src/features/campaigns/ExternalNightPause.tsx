import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { StatusPill } from '../../components/ui/premium';
import { hourLabel, nightWindowError } from './CampaignManage';

// NORQVA-0122 (D-0122): pausa noturna das campanhas criadas direto na Meta (fora do NORQVA). Só ADMIN.
// Mesma regra das campanhas de plano: pausa no início da janela só se estiver ativa e reativa no fim só o que
// ela mesma pausou e ninguém mexeu. Salvar aqui só muda a configuração; nada vai para a Meta.

type Api = (url: string, options?: RequestInit) => Promise<any>;

const RUN_STATE: Record<string, { label: string; tone: 'positive' | 'attention' | 'critical' | 'neutral' | 'info' }> = {
  SKIPPED: { label: 'Não estava ativa', tone: 'neutral' },
  PAUSING: { label: 'Pausando', tone: 'info' },
  PAUSE_UNCONFIRMED: { label: 'Pausada, conferindo', tone: 'attention' },
  PAUSED: { label: 'Pausada à noite', tone: 'info' },
  PAUSE_FAILED: { label: 'Não conseguiu pausar', tone: 'attention' },
  REACTIVATING: { label: 'Reativando', tone: 'info' },
  RESUME_UNCONFIRMED: { label: 'Reativada, conferindo', tone: 'attention' },
  REACTIVATED: { label: 'Reativada de manhã', tone: 'positive' },
  RESUME_FAILED: { label: 'Não conseguiu reativar', tone: 'critical' },
  CANCELLED: { label: 'Reativação cancelada', tone: 'attention' },
  EXPIRED: { label: 'Ficou pausada', tone: 'critical' }
};

const META_STATUS: Record<string, string> = { ACTIVE: 'Ativa', PAUSED: 'Pausada', DELETED: 'Excluída', ARCHIVED: 'Arquivada' };

const timeInput = 'min-h-[44px] w-[112px] rounded-xl bg-nq-raised px-3 text-[15px] text-nq-text tabular-nums [color-scheme:dark] disabled:opacity-60';

function Row({ c, apiFetch, showError, showSuccess, onChanged }: { c: any; apiFetch: Api; showError: (m: string) => void; showSuccess: (m: string) => void; onChanged: () => void }) {
  const [enabled, setEnabled] = useState<boolean>(c.enabled);
  const [start, setStart] = useState<string>(c.start);
  const [end, setEnd] = useState<string>(c.end);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const error = nightWindowError(start, end);
  const changed = enabled !== c.enabled || start !== c.start || end !== c.end;
  const metaStatus = c.meta?.status ? META_STATUS[String(c.meta.status).toUpperCase()] || c.meta.status : c.meta?.error ? 'não lida agora' : '—';

  const save = async () => {
    if (error) return;
    setBusy(true);
    try {
      await apiFetch(`/night-pause/external/${c.id}?mode=real`, { method: 'PATCH', body: JSON.stringify({ enabled, start, end }) });
      showSuccess(enabled ? `Pausa noturna de "${c.name}": das ${start} às ${end}.` : `Pausa noturna de "${c.name}" desligada.`);
      onChanged();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await apiFetch(`/night-pause/external/${c.id}?mode=real`, { method: 'DELETE' });
      showSuccess(`"${c.name}" saiu da pausa noturna.`);
      onChanged();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível tirar da lista.');
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <li className="px-4 py-3.5 space-y-2" data-testid={`external-${c.meta_campaign_id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] text-nq-text break-words">{c.name || c.meta_campaign_id}</div>
          <div className="text-[12px] text-nq-muted break-all">
            ID {c.meta_campaign_id} · Na Meta: <span className="text-nq-text">{metaStatus}</span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Pausa noturna de ${c.name || c.meta_campaign_id} (${hourLabel(c.start)}–${hourLabel(c.end)})`}
          disabled={busy}
          onClick={() => setEnabled(!enabled)}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${enabled ? 'bg-nq-positive' : 'bg-nq-raised'}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-nq-text transition-all ${enabled ? 'left-7' : 'left-1'}`} />
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-[12px] text-nq-muted">Pausa às</span>
          <input type="time" aria-label={`Início da pausa de ${c.meta_campaign_id}`} value={start} disabled={busy} onChange={(e) => setStart(e.target.value)} className={timeInput} />
        </label>
        <label className="space-y-1">
          <span className="block text-[12px] text-nq-muted">Volta às</span>
          <input type="time" max="23:00" aria-label={`Fim da pausa de ${c.meta_campaign_id}`} value={end} disabled={busy} onChange={(e) => setEnd(e.target.value)} className={timeInput} />
        </label>
        <button type="button" onClick={save} disabled={!changed || !!error || busy} className="min-h-[44px] px-4 rounded-full bg-nq-text text-nq-bg text-[13px] font-semibold disabled:opacity-50">
          Salvar
        </button>
        {!confirmRemove ? (
          <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy} aria-label={`Tirar ${c.name || c.meta_campaign_id} da lista`} className="min-h-[44px] px-3 rounded-full bg-nq-raised text-nq-muted text-[13px] inline-flex items-center gap-1.5">
            <Trash2 aria-hidden="true" className="h-4 w-4" /> Tirar
          </button>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2 text-[12px] text-nq-muted">
            Tirar da pausa noturna? (a noite em curso termina normalmente)
            <button type="button" onClick={remove} disabled={busy} className="min-h-[44px] px-3 rounded-full bg-nq-critical/15 text-nq-critical-text text-[13px] font-semibold">
              Confirmar
            </button>
            <button type="button" onClick={() => setConfirmRemove(false)} className="min-h-[44px] px-3 rounded-full bg-nq-raised text-nq-text text-[13px]">
              Cancelar
            </button>
          </span>
        )}
      </div>
      {error && <p className="text-[12px] text-nq-critical-text">{error}</p>}
      {c.belongs_to_plan && <p className="text-[12px] text-nq-attention">Esta campanha agora é de um plano do NORQVA: vale a pausa noturna do plano.</p>}
      {Array.isArray(c.runs) && c.runs.length > 0 && (
        <ul className="space-y-1 text-[12px]" aria-label="Últimas noites">
          {c.runs.slice(0, 3).map((r: any) => {
            const st = RUN_STATE[r.state] || { label: r.state, tone: 'neutral' as const };
            const d = String(r.night_date || '').slice(0, 10).split('-');
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-nq-muted">
                <span className="tabular-nums">{d.length === 3 ? `${d[2]}/${d[1]}` : r.night_date}</span>
                <StatusPill tone={st.tone}>{st.label}</StatusPill>
                {r.reason && r.state !== 'SKIPPED' && <span className="break-words">{r.reason}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function ExternalNightPause({ apiFetch, showError, showSuccess }: { apiFetch: Api; showError: (m: string) => void; showSuccess: (m: string) => void }) {
  const [data, setData] = useState<any | null>(null);
  const [newId, setNewId] = useState('');
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let off = false;
    apiFetch('/night-pause/external?mode=real')
      .then((d) => {
        if (!off) setData(d);
      })
      .catch(() => {
        if (!off) setData({ error: true });
      });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const add = async () => {
    const id = newId.trim();
    if (!/^\d{5,25}$/.test(id)) {
      showError('Informe o ID da campanha na Meta (só números).');
      return;
    }
    setAdding(true);
    try {
      const r = await apiFetch('/night-pause/external?mode=real', { method: 'POST', body: JSON.stringify({ meta_campaign_id: id }) });
      showSuccess(`"${r?.name || id}" entrou na pausa noturna (00:00 às 06:00).`);
      setNewId('');
      setReload((n) => n + 1);
    } catch (e: any) {
      showError(e?.message || 'Não foi possível adicionar.');
    } finally {
      setAdding(false);
    }
  };

  const campaigns: any[] = Array.isArray(data?.campaigns) ? data.campaigns : [];
  return (
    <section className="space-y-2" aria-label="Campanhas criadas fora do NORQVA — pausa noturna" data-testid="external-night-pause">
      <h2 className="text-[13px] leading-[18px] font-semibold text-nq-muted">Campanhas criadas fora do NORQVA — pausa noturna</h2>
      <div className="rounded-2xl bg-nq-surface overflow-hidden">
        <p className="px-4 pt-3.5 text-[13px] leading-[18px] text-nq-muted">
          Campanhas feitas direto na Meta também podem pausar à noite (horário de Brasília): o NORQVA pausa no início, se estiverem ativas, e reativa no fim só o que ele pausou e ninguém mexeu. Orçamento e limite de gastos não mudam.
        </p>
        {data?.master_enabled === false && (
          <p className="px-4 pt-2 text-[12px] text-nq-attention">A chave geral da pausa noturna está desligada no servidor: nada é pausado por enquanto.</p>
        )}
        {data === null ? (
          <p className="px-4 py-3.5 text-[13px] text-nq-muted">Carregando…</p>
        ) : data.error ? (
          <p className="px-4 py-3.5 text-[13px] text-nq-critical-text">Não foi possível carregar a lista.</p>
        ) : campaigns.length === 0 ? (
          <p className="px-4 py-3.5 text-[13px] text-nq-muted" data-testid="external-empty">Nenhuma campanha externa na pausa noturna.</p>
        ) : (
          <ul className="divide-y divide-nq-line/70">
            {campaigns.map((c) => (
              <Row key={`${c.id}:${c.enabled}:${c.start}:${c.end}`} c={c} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} onChanged={() => setReload((n) => n + 1)} />
            ))}
          </ul>
        )}
        <div className="px-4 py-3.5 flex flex-wrap items-end gap-2 border-t border-nq-line/70">
          <label className="space-y-1 min-w-0 flex-1">
            <span className="block text-[12px] text-nq-muted">Adicionar pelo ID da campanha</span>
            <input
              inputMode="numeric"
              aria-label="ID da campanha na Meta"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="ex.: 120250112900200097"
              className="w-full min-h-[44px] rounded-xl bg-nq-raised px-3 text-[15px] text-nq-text placeholder:text-nq-subtle"
            />
          </label>
          <button type="button" onClick={add} disabled={adding || !newId.trim()} className="min-h-[44px] px-4 rounded-full bg-nq-text text-nq-bg text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            <Plus aria-hidden="true" className="h-4 w-4" /> Adicionar
          </button>
        </div>
      </div>
    </section>
  );
}
