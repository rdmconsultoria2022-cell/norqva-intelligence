import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, QrCode, RefreshCw, Trash2, Repeat, Send, X, UserCheck, Bot, Search, History, ChevronLeft } from 'lucide-react';
import { UserObj } from '../../types';
import { CloudAccountsPanel } from './CloudAccountsPanel';

// NORQVA-0046: área WhatsApp — números (até 100), conexão por QR Code, troca de número e conversas.
// Tudo operado aqui dentro; o servidor do WhatsApp fica escondido atrás do NORQVA.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

export interface WhatsAppViewProps {
  currentUser: UserObj | null;
  apiFetch: ApiFetch;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

interface WaNumber {
  id: string;
  label: string;
  brand_id: string | null;
  brand_name: string | null;
  phone: string | null;
  status: 'NEW' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'BANNED';
  status_reason: string | null;
  bot_enabled: boolean;
  conversations?: number;
  needs_human?: number;
  // NORQVA-0079: motor do número
  provider?: 'EVOLUTION' | 'META_CLOUD';
  cloud_environment?: 'TEST' | 'PRODUCTION' | null;
  display_phone_number?: string | null;
  quality_rating?: string | null;
}

interface WaConversation {
  id: string;
  number_id: string;
  number_label: string;
  brand_name: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  mode: 'BOT' | 'HUMAN' | 'OPTED_OUT';
  needs_human: boolean;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
}

interface WaMessage {
  id: string;
  direction: 'IN' | 'OUT';
  author: 'CUSTOMER' | 'BOT' | 'OPERATOR' | 'PHONE' | 'SYSTEM';
  body: string;
  send_status: 'OK' | 'FAILED';
  delivery_status?: 'BLOCKED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'OUTSIDE_WINDOW' | null;
  created_at: string;
}

// NORQVA-0079: situação da mensagem enviada pelo WhatsApp oficial
const DELIVERY: Record<string, string> = {
  BLOCKED: ' · bloqueada (envio real ainda desligado)',
  SENT: ' · enviada',
  DELIVERED: ' · entregue',
  READ: ' · lida',
  FAILED: ' · não chegou',
  OUTSIDE_WINDOW: ' · fora da janela de 24h'
};

const STATUS: Record<string, { text: string; cls: string }> = {
  NEW: { text: 'NÃO CONECTADO', cls: 'bg-nq-raised text-nq-text' },
  CONNECTING: { text: 'AGUARDANDO QR CODE', cls: 'bg-nq-attention/10 text-nq-attention border border-nq-attention/40' },
  CONNECTED: { text: 'CONECTADO', cls: 'bg-nq-positive/10 text-nq-positive-text border border-nq-positive/40' },
  DISCONNECTED: { text: 'DESCONECTADO', cls: 'bg-nq-raised text-nq-text' },
  BANNED: { text: 'BLOQUEADO PELO WHATSAPP', cls: 'bg-nq-critical/10 text-nq-critical-text border border-nq-critical/40' }
};

const MODE: Record<string, string> = { BOT: 'Atendente', HUMAN: 'Com pessoa', OPTED_OUT: 'Pediu para parar' };
const AUTHOR: Record<string, string> = { CUSTOMER: 'Cliente', BOT: 'Atendente', OPERATOR: 'Você (NORQVA)', PHONE: 'Pelo celular', SYSTEM: 'Sistema' };

const FILTERS = [
  { id: 'ALL', label: 'Todas' },
  { id: 'NEEDS_HUMAN', label: 'Precisam de pessoa' },
  { id: 'UNREAD', label: 'Não lidas' },
  { id: 'HUMAN', label: 'Com pessoa' },
  { id: 'OPTED_OUT', label: 'Pediram para parar' }
];

const fmtPhone = (p: string | null) => {
  if (!p) return '—';
  const m = p.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${p}`;
};
const fmtTime = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

export function WhatsAppView({ currentUser, apiFetch, showError, showSuccess }: WhatsAppViewProps) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [tab, setTab] = useState<'numbers' | 'conversations' | 'conditions' | 'results'>('conversations');
  const api = useRef(apiFetch);
  api.current = apiFetch;

  return (
    <div className="space-y-4" data-testid="whatsapp-view">
      <div className="space-y-4">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight text-nq-text">WhatsApp</h1>
        <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto no-scrollbar">
          {(['conversations', 'numbers', 'conditions', 'results'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`shrink-0 h-10 rounded-full px-4 text-nq-aux font-medium transition-colors ${tab === t ? 'bg-nq-text text-nq-bg' : 'bg-nq-surface text-nq-muted hover:text-nq-text'}`}
            >
              {t === 'conversations' ? 'Conversas' : t === 'numbers' ? 'Números' : t === 'conditions' ? 'Condições de atendimento' : 'Resultados'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'numbers'
        ? <NumbersPanel isAdmin={isAdmin} api={api} showError={showError} showSuccess={showSuccess} />
        : tab === 'conditions'
          ? <ConditionsPanel isAdmin={isAdmin} api={api} showError={showError} showSuccess={showSuccess} />
          : tab === 'results'
            ? <ResultsPanel api={api} showError={showError} />
            : <ConversationsPanel api={api} showError={showError} />}
    </div>
  );
}

function NumbersPanel({ isAdmin, api, showError, showSuccess }: { isAdmin: boolean; api: React.MutableRefObject<ApiFetch>; showError: (m: string) => void; showSuccess: (m: string) => void }) {
  const [numbers, setNumbers] = useState<WaNumber[]>([]);
  const [max, setMax] = useState(100);
  const [configured, setConfigured] = useState(true);
  const [aiReady, setAiReady] = useState(true);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [label, setLabel] = useState('');
  const [brandId, setBrandId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [qr, setQr] = useState<{ id: string; label: string; base64: string | null } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'swap' | 'delete' } | null>(null);
  const [editing, setEditing] = useState<{ id: string; label: string; brand_id: string } | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; problem: string | null; version: string | null; host: string | null } | null>(null);
  // NORQVA-0102: ativar número oficial na API (PIN de 6 números, não fica salvo)
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  const testServer = () => run('check', async () => {
    const r = await api.current('/whatsapp/server-check');
    setCheck(r);
  });

  const load = useCallback(async () => {
    try {
      const r = await api.current('/whatsapp/numbers');
      setNumbers(r?.numbers || []);
      setMax(r?.max || 100);
      setConfigured(r?.server_configured !== false);
      setAiReady(r?.ai_configured !== false);
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar os números.');
    }
  }, [api, showError]);

  useEffect(() => {
    void load();
    if (isAdmin) {
      api.current('/brands').then(r => setBrands((r?.brands || []).map((b: any) => ({ id: b.id, name: b.name })))).catch(() => {});
    }
  }, [load, isAdmin, api]);

  // Enquanto o QR Code está aberto, confere a cada 3 s se o celular já conectou
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(async () => {
      try {
        const r = await api.current(`/whatsapp/numbers/${qr.id}/status`);
        if (r?.number?.status === 'CONNECTED') {
          setQr(null);
          showSuccess(`Número conectado${r.number.phone ? `: ${fmtPhone(r.number.phone)}` : ''}.`);
          void load();
        } else if (r?.qr_base64 && r.qr_base64 !== qr.base64) {
          setQr(q => (q ? { ...q, base64: r.qr_base64 } : q));
        }
      } catch {
        // tenta de novo no próximo ciclo
      }
    }, 3000);
    return () => clearInterval(t);
  }, [qr, api, load, showSuccess]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      showError(e?.message || 'Não deu certo. Tente de novo.');
    } finally {
      setBusy(null);
    }
  };

  const create = () => run('create', async () => {
    await api.current('/whatsapp/numbers', { method: 'POST', body: JSON.stringify({ label: label.trim(), brand_id: brandId || null }) });
    setLabel('');
    setBrandId('');
    showSuccess('Número cadastrado. Agora clique em "Conectar" e leia o QR Code com o celular.');
    await load();
  });

  const connect = (n: WaNumber) => run(`connect-${n.id}`, async () => {
    const r = await api.current(`/whatsapp/numbers/${n.id}/connect`, { method: 'POST' });
    if (r?.number?.status === 'CONNECTED') {
      showSuccess('Este número já está conectado.');
      await load();
    } else {
      setQr({ id: n.id, label: n.label, base64: r?.qr_base64 || null });
    }
  });

  const swap = (n: WaNumber) => run(`swap-${n.id}`, async () => {
    setConfirm(null);
    const r = await api.current(`/whatsapp/numbers/${n.id}/swap`, { method: 'POST' });
    setQr({ id: n.id, label: n.label, base64: r?.qr_base64 || null });
    await load();
  });

  const remove = (n: WaNumber) => run(`delete-${n.id}`, async () => {
    setConfirm(null);
    await api.current(`/whatsapp/numbers/${n.id}`, { method: 'DELETE' });
    showSuccess('Número excluído. As conversas continuam guardadas até completar 180 dias.');
    await load();
  });

  const toggleBot = (n: WaNumber) => run(`bot-${n.id}`, async () => {
    await api.current(`/whatsapp/numbers/${n.id}`, { method: 'PATCH', body: JSON.stringify({ bot_enabled: !n.bot_enabled }) });
    showSuccess(n.bot_enabled ? 'Atendente automático pausado neste número.' : 'Atendente automático ligado neste número.');
    await load();
  });

  // NORQVA-0079: número oficial não tem QR Code; "conferir" atualiza nome, qualidade e situação na Meta
  const checkOfficial = (n: WaNumber) => run(`connect-${n.id}`, async () => {
    const r = await api.current(`/whatsapp/numbers/${n.id}/connect`, { method: 'POST' });
    if (r?.number?.status === 'CONNECTED') showSuccess('Número oficial conferido na Meta.');
    else showError(r?.number?.status_reason || 'A Meta não confirmou o número. Veja o aviso no cartão.');
    await load();
  });

  const registerOfficial = (n: WaNumber) => run(`register-${n.id}`, async () => {
    const r = await api.current(`/whatsapp/cloud/numbers/${n.id}/register`, { method: 'POST', body: JSON.stringify({ pin }) });
    setPin('');
    setPinFor(null);
    if (r?.status === 'CONNECTED') showSuccess('Número ativado na API da Meta.');
    else showError(r?.status_reason || 'A Meta ainda não confirmou o número. Use "Conferir na Meta" em instantes.');
    await load();
  });

  const refresh = (n: WaNumber) => run(`refresh-${n.id}`, async () => {
    await api.current(`/whatsapp/numbers/${n.id}/status`);
    await load();
  });

  const saveEdit = () => editing && run(`edit-${editing.id}`, async () => {
    await api.current(`/whatsapp/numbers/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ label: editing.label.trim(), brand_id: editing.brand_id || null }) });
    setEditing(null);
    await load();
  });

  return (
    <div className="space-y-4">
      {!configured && (
        <div className="rounded border border-nq-attention/40 bg-nq-attention/10 p-3 text-xs text-nq-attention" data-testid="wa-not-configured">
          A conexão não oficial (QR Code) está desligada. Use o WhatsApp oficial da Meta, logo abaixo.
        </div>
      )}

      {!aiReady && (
        <div className="rounded border border-nq-attention/40 bg-nq-attention/10 p-3 text-xs text-nq-attention" data-testid="wa-ai-missing">
          A inteligência do atendente ainda não está configurada (falta a chave OPENAI_API_KEY no servidor). Sem ela, as mensagens chegam aqui e uma pessoa responde.
        </div>
      )}

      <CloudAccountsPanel isAdmin={isAdmin} api={api} brands={brands} showError={showError} showSuccess={showSuccess} onNumbersChanged={() => void load()} />

      {isAdmin && configured && (
        <div className="flex flex-wrap items-start gap-2">
          <button onClick={testServer} disabled={busy === 'check'} className="inline-flex items-center gap-1 rounded-full bg-nq-raised px-2 py-1 text-[12px] text-nq-text disabled:opacity-40 min-h-[44px]">
            <RefreshCw className={`h-3.5 w-3.5 ${busy === 'check' ? 'animate-spin' : ''}`} /> Testar servidor
          </button>
          {check && (
            <div className={`flex-1 rounded border p-2 text-[12px] ${check.ok ? 'border-nq-positive/40 bg-nq-positive/10 text-nq-positive-text' : 'border-nq-critical/40 bg-nq-critical/10 text-nq-critical-text'}`} data-testid="wa-server-check">
              {check.ok ? `Servidor do WhatsApp funcionando${check.version ? ` (versão ${check.version})` : ''}. Pode conectar os números.` : check.problem}
            </div>
          )}
        </div>
      )}

      {isAdmin && configured && (
        <div className="rounded-nq bg-nq-surface p-3 space-y-2" data-testid="wa-new-number">
          <div className="text-xs font-semibold text-nq-text">Cadastrar número ({numbers.length} de {max})</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              aria-label="Nome do número"
              placeholder='Nome (ex.: "Trattoria 1")'
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="flex-1 rounded-xl bg-nq-bg px-2 py-2.5 text-sm text-nq-text min-h-[44px]"
            />
            <select
              aria-label="Marca do número"
              value={brandId}
              onChange={e => setBrandId(e.target.value)}
              className="rounded-xl bg-nq-bg px-2 py-2.5 text-sm text-nq-text min-h-[44px]"
            >
              <option value="">Sem marca</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button
              onClick={create}
              disabled={!label.trim() || busy === 'create' || numbers.length >= max}
              className="rounded-full border border-nq-positive/40 bg-nq-positive/10 px-3 py-1.5 text-nq-aux font-semibold text-nq-positive-text disabled:opacity-40 min-h-[44px]"
            >
              Cadastrar
            </button>
          </div>
          <p className="text-[12px] text-nq-subtle">Cada número fica ligado a uma marca e só oferece os produtos dela (sem marca, oferece todos os produtos à venda). O atendente automático nasce desligado.</p>
        </div>
      )}

      {numbers.length === 0 ? (
        <div className="rounded border border-nq-line p-6 text-center text-xs text-nq-subtle">Nenhum número cadastrado ainda.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="wa-numbers">
          {numbers.map(n => {
            const st = STATUS[n.status] || STATUS.NEW;
            const official = n.provider === 'META_CLOUD';
            return (
              <div key={n.id} className="rounded-nq bg-nq-surface p-3 space-y-2" data-testid="wa-number">
                {editing?.id === n.id ? (
                  <div className="space-y-2">
                    <input aria-label="Novo nome" value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} className="w-full rounded-xl bg-nq-bg px-2 py-2 text-sm text-nq-text min-h-[44px]" />
                    <select aria-label="Nova marca" value={editing.brand_id} onChange={e => setEditing({ ...editing, brand_id: e.target.value })} className="w-full rounded-xl bg-nq-bg px-2 py-2 text-sm text-nq-text min-h-[44px]">
                      <option value="">Sem marca</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} disabled={!editing.label.trim()} className="rounded-full bg-nq-positive/15 px-2 py-1 text-[12px] text-nq-positive-text disabled:opacity-40 min-h-[44px]">Salvar</button>
                      <button onClick={() => setEditing(null)} className="rounded-full border border-nq-line px-2 py-1 text-[12px] text-nq-text min-h-[44px]">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-nq-text">{n.label}</div>
                      <div className="text-[12px] text-nq-muted">{n.brand_name || 'Sem marca'} · {fmtPhone(n.phone)}</div>
                      {official && (
                        <div className="mt-0.5 text-[12px] text-nq-info" data-testid="wa-number-official">
                          Oficial (Meta) · {n.cloud_environment === 'PRODUCTION' ? 'produção' : 'teste'}{n.quality_rating ? ` · qualidade ${n.quality_rating}` : ''}
                        </div>
                      )}
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[12px] font-bold ${st.cls}`} data-testid="wa-number-status">{st.text}</span>
                  </div>
                )}
                {n.status_reason && n.status !== 'CONNECTED' && <p className="text-[12px] text-nq-attention">{n.status_reason}</p>}
                <div className="text-[12px] text-nq-subtle">
                  {n.conversations ?? 0} conversa(s){n.needs_human ? ` · ${n.needs_human} precisando de pessoa` : ''}
                </div>
                <div className="flex items-center justify-between gap-2 rounded border border-nq-line px-2 py-1.5">
                  <span className="text-[12px] text-nq-text">
                    Atendente automático: <b className={n.bot_enabled ? 'text-nq-positive-text' : 'text-nq-muted'} data-testid="wa-bot-state">{n.bot_enabled ? 'ligado' : 'pausado'}</b>
                  </span>
                  {isAdmin && (
                    <button onClick={() => toggleBot(n)} disabled={!!busy} className={`rounded-full border px-2 py-0.5 text-[12px] disabled:opacity-40 ${n.bot_enabled ? 'border-nq-attention/40 text-nq-attention' : 'border-nq-positive/40 text-nq-positive-text'} min-h-[44px]`}>
                      {n.bot_enabled ? 'Pausar' : 'Ligar'}
                    </button>
                  )}
                </div>
                {isAdmin && editing?.id !== n.id && (
                  <div className="flex flex-wrap gap-1.5">
                    {official ? (
                      <>
                      <button onClick={() => checkOfficial(n)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-full border border-nq-info/40 px-2 py-1 text-[12px] text-nq-info disabled:opacity-40 min-h-[44px]">
                        <RefreshCw className="h-3.5 w-3.5" /> Conferir na Meta
                      </button>
                      {n.status !== 'CONNECTED' && n.status !== 'BANNED' && (
                        <button onClick={() => { setPin(''); setPinFor(pinFor === n.id ? null : n.id); }} disabled={!!busy} className="inline-flex items-center gap-1 rounded-full border border-nq-positive/40 px-2 py-1 text-[12px] text-nq-positive-text disabled:opacity-40 min-h-[44px]">
                          Ativar número
                        </button>
                      )}
                      </>
                    ) : (
                      <>
                        {n.status !== 'CONNECTED' && (
                          <button onClick={() => connect(n)} disabled={!!busy || !configured} className="inline-flex items-center gap-1 rounded-full border border-nq-positive/40 bg-nq-positive/10 px-2 py-1 text-[12px] text-nq-positive-text disabled:opacity-40 min-h-[44px]">
                            <QrCode className="h-3.5 w-3.5" /> Conectar
                          </button>
                        )}
                        <button onClick={() => refresh(n)} disabled={!!busy || !configured} className="inline-flex items-center gap-1 rounded-full border border-nq-line px-2 py-1 text-[12px] text-nq-text disabled:opacity-40 min-h-[44px]">
                          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
                        </button>
                        <button onClick={() => setConfirm({ id: n.id, kind: 'swap' })} disabled={!!busy || !configured} className="inline-flex items-center gap-1 rounded-full border border-nq-line px-2 py-1 text-[12px] text-nq-text disabled:opacity-40 min-h-[44px]">
                          <Repeat className="h-3.5 w-3.5" /> Trocar número
                        </button>
                      </>
                    )}
                    <button onClick={() => setEditing({ id: n.id, label: n.label, brand_id: n.brand_id || '' })} disabled={!!busy} className="rounded-full border border-nq-line px-2 py-1 text-[12px] text-nq-text disabled:opacity-40 min-h-[44px]">
                      Editar
                    </button>
                    <button onClick={() => setConfirm({ id: n.id, kind: 'delete' })} disabled={!!busy} className="inline-flex items-center gap-1 rounded-full border border-nq-critical/40 px-2 py-1 text-[12px] text-nq-critical-text disabled:opacity-40 min-h-[44px]">
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  </div>
                )}
                {pinFor === n.id && (
                  <div className="rounded border border-nq-line p-2 text-[12px] text-nq-text space-y-2" data-testid="wa-register">
                    <p>Crie um PIN de 6 números para este número (verificação em duas etapas da Meta). Anote: ele é pedido se o número for levado para outro lugar. O NORQVA não guarda o PIN. Evite PIN fácil (123456, 111111). A Meta aceita poucas tentativas por número a cada 3 dias: se der erro, leia o aviso antes de tentar de novo.</p>
                    <div className="flex gap-2">
                      <input
                        aria-label="PIN de 6 números"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={6}
                        value={pin}
                        onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-32 rounded-xl bg-nq-bg px-2 py-2 text-sm tracking-widest text-nq-text min-h-[44px]"
                      />
                      <button onClick={() => registerOfficial(n)} disabled={pin.length !== 6 || !!busy} className="rounded-full border border-nq-positive/40 bg-nq-positive/10 px-3 py-1 text-nq-positive-text disabled:opacity-40 min-h-[44px]">
                        Ativar
                      </button>
                      <button onClick={() => { setPin(''); setPinFor(null); }} className="rounded-full border border-nq-line px-2 py-1 text-nq-text min-h-[44px]">Cancelar</button>
                    </div>
                  </div>
                )}
                {confirm?.id === n.id && (
                  <div className="rounded border border-nq-attention/40 bg-nq-attention/10 p-2 text-[12px] text-nq-attention space-y-2" data-testid="wa-confirm">
                    <p>
                      {confirm.kind === 'swap'
                        ? 'O celular atual será desconectado e aparece um QR Code para o número novo. Marca, condições de atendimento e conversas continuam.'
                        : n.provider === 'META_CLOUD'
                          ? 'O número sai do NORQVA (continua na Meta). As conversas ficam guardadas até completar 180 dias.'
                          : 'O número sai do NORQVA e é desconectado. As conversas ficam guardadas até completar 180 dias.'}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => (confirm.kind === 'swap' ? swap(n) : remove(n))} className="rounded-full border border-nq-attention/40 px-2 py-1 text-nq-attention min-h-[44px]">
                        {confirm.kind === 'swap' ? 'Sim, trocar' : 'Sim, excluir'}
                      </button>
                      <button onClick={() => setConfirm(null)} className="rounded-full border border-nq-line px-2 py-1 text-nq-text min-h-[44px]">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="wa-qr">
          <div className="w-full max-w-sm rounded-nq bg-nq-surface p-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-nq-text">Conectar "{qr.label}"</div>
              <button onClick={() => setQr(null)} aria-label="Fechar" className="text-nq-muted hover:text-nq-text min-h-[44px]"><X className="h-5 w-5" /></button>
            </div>
            {qr.base64 ? (
              <img src={`data:image/png;base64,${qr.base64}`} alt="QR Code do WhatsApp" className="mx-auto h-64 w-64 rounded bg-white p-2" />
            ) : (
              <div className="py-10 text-center text-xs text-nq-muted">Gerando o QR Code...</div>
            )}
            <ol className="list-decimal space-y-1 pl-5 text-xs text-nq-text">
              <li>No celular do número, abra o <b>WhatsApp Business</b>.</li>
              <li>Toque em <b>⋮</b> (ou Configurações) → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>.</li>
              <li>Aponte a câmera para este QR Code.</li>
            </ol>
            <p className="text-[12px] text-nq-subtle">Esta janela fecha sozinha quando o número conectar. O QR Code muda a cada poucos segundos; isso é normal.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationsPanel({ api, showError }: { api: React.MutableRefObject<ApiFetch>; showError: (m: string) => void }) {
  const [convs, setConvs] = useState<WaConversation[]>([]);
  const [numbers, setNumbers] = useState<WaNumber[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [numberId, setNumberId] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ conversation: any; messages: WaMessage[] } | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ filter, ...(numberId ? { number_id: numberId } : {}), ...(search.trim() ? { search: search.trim() } : {}) });
      const r = await api.current(`/whatsapp/conversations?${qs.toString()}`);
      setConvs(r?.conversations || []);
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar as conversas.');
    }
  }, [api, filter, numberId, search, showError]);

  // NORQVA-0088: resposta que chega depois de trocar ou fechar a conversa é descartada
  const openRef = useRef<string | null>(null);
  openRef.current = openId;
  const loadThread = useCallback(async (id: string) => {
    try {
      const r = await api.current(`/whatsapp/conversations/${id}/messages`);
      if (openRef.current !== id) return;
      setThread(r);
    } catch (e: any) {
      showError(e?.message || 'Falha ao abrir a conversa.');
    }
  }, [api, showError]);

  useEffect(() => {
    api.current('/whatsapp/numbers').then(r => setNumbers(r?.numbers || [])).catch(() => {});
  }, [api]);

  useEffect(() => {
    void loadList();
    const t = setInterval(() => void loadList(), 10000);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!openId) return;
    void loadThread(openId);
    const t = setInterval(() => void loadThread(openId), 5000);
    return () => clearInterval(t);
  }, [openId, loadThread]);

  const lastCount = thread?.messages.length || 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lastCount, openId]);

  const send = async () => {
    if (!openId || !text.trim()) return;
    setSending(true);
    try {
      await api.current(`/whatsapp/conversations/${openId}/messages`, { method: 'POST', body: JSON.stringify({ text: text.trim() }) });
      setText('');
      await loadThread(openId);
      void loadList();
    } catch (e: any) {
      showError(e?.message || 'Falha ao enviar.');
      // NORQVA-0079: mensagem barrada pela trava fica registrada na conversa
      void loadThread(openId).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  const setMode = async (mode: 'BOT' | 'HUMAN') => {
    if (!openId) return;
    try {
      await api.current(`/whatsapp/conversations/${openId}/mode`, { method: 'POST', body: JSON.stringify({ mode }) });
      await loadThread(openId);
      void loadList();
    } catch (e: any) {
      showError(e?.message || 'Falha ao mudar a conversa.');
    }
  };

  const conv = thread?.conversation;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,340px)_1fr]">
      {/* NORQVA-0088: no celular, a lista some quando uma conversa está aberta (botão Voltar na conversa) */}
      <div className={`space-y-3 min-w-0 ${conv ? 'hidden lg:block' : ''}`}>
        <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto no-scrollbar lg:flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`shrink-0 h-10 rounded-full px-4 text-nq-aux font-medium transition-colors ${filter === f.id ? 'bg-nq-raised text-nq-text ring-1 ring-nq-line' : 'text-nq-muted hover:text-nq-text'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select aria-label="Filtrar por número" value={numberId} onChange={e => setNumberId(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-nq-surface px-3 py-2 text-nq-body text-nq-text min-h-[44px]">
            <option value="">Todos os números</option>
            {numbers.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-0">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-nq-subtle" />
            <input aria-label="Buscar conversa" placeholder="Nome ou telefone" value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-xl bg-nq-surface py-2 pl-9 pr-3 text-nq-body text-nq-text min-h-[44px]" />
          </div>
        </div>
        <div className="max-h-[65vh] overflow-y-auto rounded-nq bg-nq-surface divide-y divide-nq-line/60" data-testid="wa-conversations">
          {convs.length === 0 && <div className="p-4 text-center text-nq-aux text-nq-subtle">Nenhuma conversa.</div>}
          {convs.map(c => (
            <button
              key={c.id}
              onClick={() => setOpenId(c.id)}
              className={`block w-full px-4 py-3 text-left hover:bg-nq-raised ${openId === c.id ? 'bg-nq-raised' : ''} min-h-[64px]`}
              data-testid="wa-conversation"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-nq-body font-medium text-nq-text">{c.contact_name || fmtPhone(c.contact_phone)}</span>
                <span className="shrink-0 text-[12px] text-nq-subtle">{fmtTime(c.last_message_at)}</span>
              </div>
              <div className="truncate text-nq-aux text-nq-muted">{c.last_message_preview}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="rounded bg-nq-raised px-1.5 text-nq-text">{c.number_label}</span>
                <span className="rounded bg-nq-raised px-1.5 text-nq-muted">{MODE[c.mode]}</span>
                {c.needs_human && <span className="rounded bg-nq-attention/10 px-1.5 text-nq-attention">precisa de pessoa</span>}
                {c.unread_count > 0 && <span className="rounded-full bg-nq-positive min-w-[20px] px-1.5 text-center font-bold text-nq-on-positive">{c.unread_count}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={`min-w-0 rounded-nq bg-nq-surface flex-col min-h-[50vh] ${conv ? 'flex' : 'hidden lg:flex'}`}>
        {!conv ? (
          <div className="m-auto p-6 text-nq-aux text-nq-subtle">Escolha uma conversa.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-nq-line/70 p-3">
              <button type="button" onClick={() => { openRef.current = null; setOpenId(null); setThread(null); }} className="lg:hidden -ml-1 inline-flex min-h-[44px] items-center gap-1 rounded-full px-2 text-nq-aux text-nq-muted" aria-label="Voltar para a lista de conversas">
                <ChevronLeft aria-hidden="true" className="h-5 w-5" /> Voltar
              </button>
              <div className="min-w-0">
                <div className="text-nq-body font-semibold text-nq-text">{conv.contact_name || fmtPhone(conv.contact_phone)}</div>
                <div className="text-[12px] text-nq-muted">{fmtPhone(conv.contact_phone)} · {conv.number_label} · {MODE[conv.mode]}</div>
              </div>
              {conv.mode !== 'OPTED_OUT' && (
                conv.mode === 'BOT' ? (
                  <button onClick={() => setMode('HUMAN')} className="inline-flex items-center gap-1.5 rounded-full bg-nq-raised px-4 text-nq-aux font-medium text-nq-text min-h-[44px]">
                    <UserCheck className="h-3.5 w-3.5" /> Assumir conversa
                  </button>
                ) : (
                  <button onClick={() => setMode('BOT')} className="inline-flex items-center gap-1.5 rounded-full bg-nq-positive/15 px-4 text-nq-aux font-medium text-nq-positive-text min-h-[44px]">
                    <Bot className="h-3.5 w-3.5" /> Devolver ao atendente
                  </button>
                )
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3 max-h-[55vh]" data-testid="wa-thread">
              {thread!.messages.map(m => (
                <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-nq-body whitespace-pre-wrap break-words ${m.direction === 'OUT' ? 'bg-nq-positive/15 text-nq-text' : 'bg-nq-raised text-nq-text'}`}>
                    {m.body}
                    <div className="mt-1 text-[12px] text-nq-muted">
                      {AUTHOR[m.author]} · {fmtTime(m.created_at)}{m.delivery_status ? DELIVERY[m.delivery_status] || '' : m.send_status === 'FAILED' ? ' · não enviada' : ''}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {conv.mode === 'OPTED_OUT' ? (
              <div className="border-t border-nq-line p-3 text-[12px] text-nq-muted">O cliente pediu para não receber mais mensagens. Se ele voltar a escrever, a conversa reabre para você.</div>
            ) : conv.window_open === false ? (
              <div className="border-t border-nq-line p-3 text-[12px] text-nq-attention" data-testid="wa-window-closed">
                Passaram mais de 24 horas desde a última mensagem do cliente. Pelo WhatsApp oficial, só dá para responder com um modelo aprovado pela Meta (em breve). Se o cliente escrever de novo, a conversa reabre.
              </div>
            ) : (
              <div className="flex gap-2 border-t border-nq-line p-3">
                <textarea
                  aria-label="Mensagem"
                  rows={2}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder="Escreva a resposta (Enter envia; ao responder, você assume a conversa)"
                  className="flex-1 resize-none rounded-xl bg-nq-bg px-3 py-2.5 text-nq-body text-nq-text min-h-[44px]"
                />
                <button onClick={() => void send()} disabled={sending || !text.trim()} aria-label="Enviar" className="self-end h-11 w-11 flex items-center justify-center rounded-full bg-nq-positive text-nq-on-positive disabled:opacity-40">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Modelo sugerido de condições (o Ricardo ajusta à vontade). As regras fixas de segurança ficam no servidor.
export const SUGGESTED_CONDITIONS = `Quem somos: uma editora de livros digitais de cozinha italiana caseira, com receitas testadas, medidas em gramas e xícaras, tempo e nível de dificuldade em cada receita.

Como atender:
- Cumprimente pelo nome quando souber e pergunte o que a pessoa gosta de cozinhar.
- Recomende primeiro o Kit Cozinha Italiana (os dois livros juntos sai mais em conta). Se a pessoa quiser só massas e molhos, ofereça o Trattoria em Casa; se quiser só sobremesas, o Dolci della Nonna.
- Deixe claro que são livros digitais (PDF), para ler no celular, tablet ou computador, e que podem ser impressos. Não existe versão física.
- A entrega é automática, aqui no WhatsApp e no e-mail, assim que o pagamento é confirmado (Pix confirma em segundos).
- Formas de pagamento: Pix (mais barato) ou cartão de crédito (até 4x sem juros; acima disso com juros, sempre conforme o catálogo).
- Se a pessoa disser que não recebeu o livro ou teve problema no pagamento, chame uma pessoa da equipe.

O que tem nos livros:
- Trattoria em Casa (28 receitas): massa clássica aos ovos, massa de sêmola e água, massa verde de espinafre, tagliatelle e fettuccine na faca, pappardelle rústico, nhoque de batata, pomodoro e basilico, ragù alla bolognese, cacio e pepe, carbonara, amatriciana, pesto alla genovese, burro e salvia, aglio olio e peperoncino, ravioli de ricota e espinafre, tortellini de queijo e ervas, lasanha alla bolognese, cannelloni de frango com ervas, nhoque gratinado aos quatro queijos, rondelli de queijos ao molho rosé, sugo rápido de tomate-cereja, molho de gorgonzola e nozes, molho alla puttanesca, molho de cogumelos com manteiga e tomilho, molho bechamel, massa de pizza de fermentação lenta, focaccia genovese com alecrim e bruschetta de tomate e manjericão.
- Dolci della Nonna (10 doces): tiramisù, panna cotta, torta della nonna, torta caprese, cantucci, affogato al caffè, zabaione com frutas, crostata di marmellata, budino al cioccolato e cannoli em taça.

Horário: o atendimento automático responde a qualquer hora.`;

function ConditionsPanel({ isAdmin, api, showError, showSuccess }: { isAdmin: boolean; api: React.MutableRefObject<ApiFetch>; showError: (m: string) => void; showSuccess: (m: string) => void }) {
  const [data, setData] = useState<{ global: string; numbers: { id: string; label: string; conditions: string }[] } | null>(null);
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ id: string; conditions: string; created_at: string; changed_by_name: string | null }[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.current('/whatsapp/conditions');
      setData({ global: r?.global || '', numbers: r?.numbers || [] });
      return r;
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar as condições.');
      return null;
    }
  }, [api, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    setText(target ? (data.numbers.find(n => n.id === target)?.conditions || '') : data.global);
    setHistory(null);
  }, [target, data]);

  const save = async () => {
    setSaving(true);
    try {
      await api.current('/whatsapp/conditions', { method: 'PUT', body: JSON.stringify({ number_id: target || null, conditions: text }) });
      showSuccess('Condições salvas. O atendente já usa a versão nova.');
      await load();
    } catch (e: any) {
      showError(e?.message || 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async () => {
    try {
      const r = await api.current(`/whatsapp/conditions/history${target ? `?number_id=${target}` : ''}`);
      setHistory(r?.versions || []);
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar o histórico.');
    }
  };

  const original = data ? (target ? data.numbers.find(n => n.id === target)?.conditions || '' : data.global) : '';

  return (
    <div className="space-y-3" data-testid="wa-conditions">
      <p className="text-xs text-nq-muted">
        Escreva aqui como o atendente deve atender: tom de voz, o que oferecer primeiro, respostas para as dúvidas comuns. O texto geral vale para todos os números; cada número pode ter um texto a mais.
        Preço, parcelas, entrega só com pagamento confirmado e o "parar" do cliente são regras fixas: o texto não muda isso.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Condições de" value={target} onChange={e => setTarget(e.target.value)} className="rounded-xl bg-nq-surface px-3 py-2 text-nq-body text-nq-text min-h-[44px]">
          <option value="">Geral (todos os números)</option>
          {(data?.numbers || []).map(n => <option key={n.id} value={n.id}>Só o número: {n.label}</option>)}
        </select>
        <button onClick={() => void openHistory()} className="inline-flex items-center gap-1 rounded-full border border-nq-line px-2 py-1 text-[12px] text-nq-text min-h-[44px]">
          <History className="h-3.5 w-3.5" /> Versões anteriores
        </button>
        {isAdmin && !target && (
          <button onClick={() => setText(SUGGESTED_CONDITIONS)} className="rounded-full border border-nq-line px-2 py-1 text-[12px] text-nq-text min-h-[44px]">
            Usar modelo sugerido
          </button>
        )}
      </div>
      <textarea
        aria-label="Texto das condições"
        value={text}
        onChange={e => setText(e.target.value)}
        readOnly={!isAdmin}
        rows={16}
        maxLength={8000}
        className="w-full rounded-xl bg-nq-surface p-3 text-nq-body text-nq-text min-h-[44px]"
        placeholder="Ex.: Atenda com simpatia. Ofereça primeiro o kit. Se perguntarem sobre versão impressa, explique que é PDF e pode ser impresso."
      />
      <div className="flex items-center justify-between text-[12px] text-nq-subtle">
        <span>{text.length} de 8.000 letras</span>
        {isAdmin && (
          <button onClick={() => void save()} disabled={saving || text === original} className="rounded-full border border-nq-positive/40 bg-nq-positive/10 px-3 py-1.5 text-nq-aux font-semibold text-nq-positive-text disabled:opacity-40 min-h-[44px]">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        )}
      </div>
      {history && (
        <div className="space-y-2 rounded border border-nq-line p-2" data-testid="wa-conditions-history">
          {history.length === 0 && <div className="text-[12px] text-nq-subtle">Nenhuma versão salva ainda.</div>}
          {history.map(v => (
            <div key={v.id} className="rounded border border-nq-line p-2 text-[12px] text-nq-text">
              <div className="mb-1 flex items-center justify-between text-nq-subtle">
                <span>{new Date(v.created_at).toLocaleString('pt-BR')}{v.changed_by_name ? ` · ${v.changed_by_name}` : ''}</span>
                {isAdmin && <button onClick={() => setText(v.conditions)} className="rounded-full border border-nq-line px-2 py-0.5 text-nq-text min-h-[44px]">Voltar para esta versão</button>}
              </div>
              <div className="max-h-24 overflow-y-auto whitespace-pre-wrap">{v.conditions || '(vazio)'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const brlNum = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function ResultsPanel({ api, showError }: { api: React.MutableRefObject<ApiFetch>; showError: (m: string) => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    api.current(`/whatsapp/results?days=${days}`)
      .then(r => { if (alive) setData(r); })
      .catch((e: any) => showError(e?.message || 'Falha ao carregar os resultados.'));
    return () => { alive = false; };
  }, [api, days, showError]);

  const t = data?.total;
  return (
    <div className="space-y-3" data-testid="wa-results">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-nq-muted">Período:</span>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={`rounded-full border px-2 py-0.5 ${days === d ? 'border-nq-positive/40 bg-nq-positive/10 text-nq-positive-text' : 'border-nq-line text-nq-muted'} min-h-[44px]`}>
            {d} dias
          </button>
        ))}
      </div>
      {t && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            ['Conversas novas', String(t.new_conversations)],
            ['Pedidos gerados', String(t.orders_created)],
            ['Vendas pagas', String(t.orders_paid)],
            ['Valor vendido', brlNum(t.revenue)],
            ['Precisam de pessoa', String(t.needs_human_now)]
          ].map(([label, value]) => (
            <div key={label} className="rounded-nq bg-nq-surface p-3">
              <div className="text-[12px] text-nq-subtle">{label}</div>
              <div className="text-lg font-bold text-nq-text" data-testid={`wa-total-${label}`}>{value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded border border-nq-line">
        <table className="w-full text-left text-xs">
          <thead className="bg-nq-surface text-[12px] text-nq-muted">
            <tr>
              <th className="p-2">Número</th>
              <th className="p-2">Conversas</th>
              <th className="p-2">Mensagens recebidas</th>
              <th className="p-2">Respostas do atendente</th>
              <th className="p-2">Pedidos</th>
              <th className="p-2">Pagos</th>
              <th className="p-2">Conversão</th>
              <th className="p-2">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nq-line/60">
            {(data?.numbers || []).length === 0 && (
              <tr><td colSpan={8} className="p-4 text-center text-nq-subtle">Nenhum número cadastrado.</td></tr>
            )}
            {(data?.numbers || []).map((n: any) => (
              <tr key={n.id} className="text-nq-text">
                <td className="p-2">
                  <div>{n.label}</div>
                  <div className="text-[12px] text-nq-subtle">{n.brand_name || 'Sem marca'} · {fmtPhone(n.phone)}</div>
                </td>
                <td className="p-2">{n.new_conversations}</td>
                <td className="p-2">{n.messages_in}</td>
                <td className="p-2">{n.bot_messages}</td>
                <td className="p-2">{n.orders_created}</td>
                <td className="p-2">{n.orders_paid}</td>
                <td className="p-2">{n.conversion === null ? '—' : `${String(n.conversion).replace('.', ',')}%`}</td>
                <td className="p-2">{brlNum(Number(n.revenue) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-nq-subtle">Conversão = vendas pagas ÷ conversas novas no período. Só conta como venda o pedido com pagamento confirmado pelo Asaas.</p>
    </div>
  );
}
