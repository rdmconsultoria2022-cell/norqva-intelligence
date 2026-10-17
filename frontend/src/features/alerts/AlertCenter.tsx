import { useEffect, useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { StatusPill, Tone } from '../../components/ui/premium';

// NORQVA-0095 (D-0095): central de pendências. O sino abre esta janela.
// Cada aviso diz o que aconteceu, a gravidade, a campanha, a ação recomendada e leva à campanha.
// Abrir a janela marca os avisos como lidos (só para quem abriu); isso não resolve nenhum problema.

export interface AlertNotification {
  id: string;
  rule_code: string;
  title: string;
  description: string;
  severity: 'INFO' | 'ATTENTION' | 'CRITICAL';
  recommended_action: string;
  state: 'NOVA' | 'VISUALIZADA' | 'EM_TRATAMENTO' | 'RESOLVIDA' | 'DESCARTADA';
  read: boolean;
  is_problem: boolean;
  is_open: boolean;
  entity: { type: 'AD' | 'CAMPAIGN'; meta_campaign_id: string | null; campaign_name: string | null; ad_name: string | null; plan_code: string | null };
  link: { tab: 'results' | 'cap'; meta_campaign_id: string | null; plan_code: string | null };
  resolution: string | null;
  dismiss_reason: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AlertCenterData {
  notifications: AlertNotification[];
  unread_count: number;
  open_problems_count: number;
}

export interface CampaignFocus {
  metaCampaignId: string | null;
  planCode: string | null;
  tab: 'results' | 'cap';
  nonce: number;
}

const SEVERITY: Record<AlertNotification['severity'], { label: string; tone: Tone }> = {
  CRITICAL: { label: 'Crítico', tone: 'critical' },
  ATTENTION: { label: 'Atenção', tone: 'attention' },
  INFO: { label: 'Informativo', tone: 'info' }
};

const STATE_LABEL: Record<AlertNotification['state'], string> = {
  NOVA: 'Novo',
  VISUALIZADA: 'Visto',
  EM_TRATAMENTO: 'Em tratamento',
  RESOLVIDA: 'Resolvido',
  DESCARTADA: 'Descartado'
};

const RESOLUTION_LABEL: Record<string, string> = {
  SALE_ARRIVED: 'chegou venda',
  AD_NOT_ACTIVE: 'o anúncio parou',
  READ_RECOVERED: 'o vigia voltou a ler o gasto',
  CAMPAIGN_PAUSED: 'a campanha está pausada',
  CAP_RAISED: 'o teto subiu',
  SUPERSEDED_BY_CAP: 'a campanha chegou ao teto',
  PLAN_CLOSED: 'a campanha foi encerrada'
};

function when(v: string) {
  try {
    return new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Busca a central (contadores do sino e das pendências). Falha silenciosa: mantém o último valor. */
export async function fetchAlertCenter(apiFetch: (url: string, options?: RequestInit) => Promise<any>, isDemoView: boolean): Promise<AlertCenterData | null> {
  try {
    const r = await apiFetch(`/alerts/center?mode=${isDemoView ? 'demo' : 'real'}`);
    return r && Array.isArray(r.notifications) ? (r as AlertCenterData) : null;
  } catch {
    return null;
  }
}

export function focusOf(n: AlertNotification): CampaignFocus {
  return { metaCampaignId: n.link.meta_campaign_id, planCode: n.link.plan_code, tab: n.link.tab, nonce: Date.now() };
}

/** Um aviso: usado no sino e na lista de pendências de Campanhas. */
export function AlertCard({
  n,
  canAct,
  apiFetch,
  isDemoView,
  onOpenCampaign,
  onChanged,
  showError
}: {
  n: AlertNotification;
  canAct: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  isDemoView: boolean;
  onOpenCampaign?: (n: AlertNotification) => void;
  onChanged: (n: AlertNotification) => void;
  showError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');
  const sev = SEVERITY[n.severity];
  const mode = isDemoView ? 'demo' : 'real';
  const where = n.entity.ad_name ? `${n.entity.campaign_name || 'Campanha'} · ${n.entity.ad_name}` : n.entity.campaign_name || n.entity.plan_code || '';

  const act = async (path: string, body?: any) => {
    setBusy(true);
    try {
      const r = await apiFetch(`/alerts/${n.id}/${path}?mode=${mode}`, { method: 'POST', body: JSON.stringify(body || {}) });
      if (r?.notification) onChanged(r.notification);
      setDismissing(false);
    } catch (err: any) {
      showError(err?.message || 'Não foi possível atualizar o aviso.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="px-4 py-4 space-y-2" data-testid={`alert-${n.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusPill tone={n.is_open ? sev.tone : 'neutral'}>{sev.label}</StatusPill>
        <span className="text-nq-caption text-nq-muted">{STATE_LABEL[n.state]}</span>
        <span className="text-nq-caption text-nq-subtle ml-auto">{when(n.created_at)}</span>
      </div>
      <div>
        <div className={`text-nq-body font-medium ${n.is_open ? 'text-nq-text' : 'text-nq-muted'}`}>{n.title}</div>
        {where && <div className="text-nq-caption text-nq-muted break-words">{where}</div>}
      </div>
      <p className="text-nq-aux text-nq-muted break-words">{n.description}</p>
      {n.is_open ? (
        <p className="text-nq-aux text-nq-text">
          <span className="font-semibold">O que fazer: </span>
          {n.recommended_action}
        </p>
      ) : (
        <p className="text-nq-caption text-nq-muted">
          {n.state === 'RESOLVIDA'
            ? `Resolvido sozinho${n.resolution && RESOLUTION_LABEL[n.resolution] ? `: ${RESOLUTION_LABEL[n.resolution]}` : ''}.`
            : `Descartado${n.dismiss_reason ? `: ${n.dismiss_reason}` : ''}.`}
        </p>
      )}

      {dismissing && (
        <div className="space-y-2">
          <label htmlFor={`dismiss-${n.id}`} className="block text-nq-caption text-nq-muted">
            Por que descartar?{n.severity === 'CRITICAL' ? ' (obrigatório)' : ' (opcional)'}
          </label>
          <input
            id={`dismiss-${n.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            className="w-full min-h-[44px] rounded-xl bg-nq-raised px-3 text-nq-body text-nq-text border border-nq-line focus:outline-none focus:ring-2 focus:ring-nq-info"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {onOpenCampaign && n.link.meta_campaign_id && (
          <button
            type="button"
            onClick={() => onOpenCampaign(n)}
            className="min-h-[44px] px-4 rounded-full bg-nq-text text-nq-bg text-nq-aux font-semibold flex items-center gap-1.5"
          >
            Abrir campanha
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
        {canAct && n.is_open && n.is_problem && n.state !== 'EM_TRATAMENTO' && !dismissing && (
          <button type="button" disabled={busy} onClick={() => act('progress')} className="min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux font-semibold disabled:opacity-50">
            Estou tratando
          </button>
        )}
        {canAct && n.is_open && (
          dismissing ? (
            <>
              <button type="button" disabled={busy} onClick={() => setDismissing(false)} className="min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux font-semibold">
                Voltar
              </button>
              <button
                type="button"
                disabled={busy || (n.severity === 'CRITICAL' && reason.trim().length < 5)}
                onClick={() => act('dismiss', { reason })}
                className="min-h-[44px] px-4 rounded-full bg-nq-critical/15 text-nq-critical-text text-nq-aux font-semibold disabled:opacity-50"
              >
                Confirmar descarte
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => setDismissing(true)} className="min-h-[44px] px-4 rounded-full text-nq-muted text-nq-aux font-semibold hover:bg-nq-raised">
              Descartar
            </button>
          )
        )}
      </div>
    </li>
  );
}

/** Janela do sino: pendências primeiro, depois os demais avisos. */
export function AlertCenterSheet({
  open,
  data,
  canAct,
  apiFetch,
  isDemoView,
  onClose,
  onOpenCampaign,
  onChanged,
  showError
}: {
  open: boolean;
  data: AlertCenterData | null;
  canAct: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  isDemoView: boolean;
  onClose: () => void;
  onOpenCampaign: (n: AlertNotification) => void;
  onChanged: () => void;
  showError: (msg: string) => void;
}) {
  const [items, setItems] = useState<AlertNotification[]>([]);

  useEffect(() => {
    if (open) setItems(data?.notifications || []);
  }, [open, data]);

  // ao abrir, marca como lidos (só para esta pessoa) e atualiza o sino
  useEffect(() => {
    if (!open || !data || data.unread_count === 0) return;
    apiFetch(`/alerts/read?mode=${isDemoView ? 'demo' : 'real'}`, { method: 'POST', body: JSON.stringify({ ids: data.notifications.filter((x) => !x.read).map((x) => x.id) }) })
      .then(() => onChanged())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const problems = items.filter((n) => n.is_open && n.is_problem);
  const others = items.filter((n) => !(n.is_open && n.is_problem));
  const update = (m: AlertNotification) => {
    setItems((list) => list.map((x) => (x.id === m.id ? m : x)));
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" role="dialog" aria-modal="true" aria-label="Avisos" onClick={onClose}>
      <div className="h-full w-full max-w-md bg-nq-bg border-l border-nq-line flex flex-col pt-[env(safe-area-inset-top)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 h-14 border-b border-nq-line/60 shrink-0">
          <h2 className="text-nq-section font-semibold text-nq-text">Avisos</h2>
          <button type="button" onClick={onClose} aria-label="Fechar avisos" className="h-11 w-11 rounded-full flex items-center justify-center text-nq-muted hover:bg-nq-surface">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <section aria-label="Pendências" className="pt-4">
            <h3 className="px-4 text-nq-aux font-semibold text-nq-muted">
              {problems.length === 0 ? 'Nenhuma pendência aberta' : problems.length === 1 ? '1 pendência precisa de ação' : `${problems.length} pendências precisam de ação`}
            </h3>
            {problems.length > 0 && (
              <ul className="mt-2 mx-4 rounded-nq bg-nq-surface divide-y divide-nq-line/70 overflow-hidden">
                {problems.map((n) => (
                  <AlertCard key={n.id} n={n} canAct={canAct} apiFetch={apiFetch} isDemoView={isDemoView} onOpenCampaign={onOpenCampaign} onChanged={update} showError={showError} />
                ))}
              </ul>
            )}
          </section>
          {others.length > 0 && (
            <section aria-label="Outros avisos" className="pt-6 pb-6">
              <h3 className="px-4 text-nq-aux font-semibold text-nq-muted">Informativos e encerrados (30 dias)</h3>
              <ul className="mt-2 mx-4 rounded-nq bg-nq-surface divide-y divide-nq-line/70 overflow-hidden">
                {others.map((n) => (
                  <AlertCard key={n.id} n={n} canAct={canAct} apiFetch={apiFetch} isDemoView={isDemoView} onOpenCampaign={onOpenCampaign} onChanged={update} showError={showError} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
