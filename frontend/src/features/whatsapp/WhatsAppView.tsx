import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, QrCode, RefreshCw, Trash2, Repeat, Send, X, UserCheck, Bot, Search, History } from 'lucide-react';
import { UserObj } from '../../types';

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
  created_at: string;
}

const STATUS: Record<string, { text: string; cls: string }> = {
  NEW: { text: 'NÃO CONECTADO', cls: 'bg-slate-800 text-slate-300' },
  CONNECTING: { text: 'AGUARDANDO QR CODE', cls: 'bg-amber-950/40 text-amber-300 border border-amber-500/20' },
  CONNECTED: { text: 'CONECTADO', cls: 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/20' },
  DISCONNECTED: { text: 'DESCONECTADO', cls: 'bg-slate-800 text-slate-300' },
  BANNED: { text: 'BLOQUEADO PELO WHATSAPP', cls: 'bg-red-950/40 text-red-300 border border-red-500/20' }
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
  const [tab, setTab] = useState<'numbers' | 'conversations' | 'conditions'>('conversations');
  const api = useRef(apiFetch);
  api.current = apiFetch;

  return (
    <div className="space-y-4" data-testid="whatsapp-view">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-slate-100">WhatsApp</h2>
        </div>
        <div className="flex gap-1 rounded border border-slate-800 p-0.5 text-xs">
          {(['conversations', 'numbers', 'conditions'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`rounded px-3 py-1 ${tab === t ? 'bg-emerald-950/50 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {t === 'conversations' ? 'Conversas' : t === 'numbers' ? 'Números' : 'Condições de atendimento'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'numbers'
        ? <NumbersPanel isAdmin={isAdmin} api={api} showError={showError} showSuccess={showSuccess} />
        : tab === 'conditions'
          ? <ConditionsPanel isAdmin={isAdmin} api={api} showError={showError} showSuccess={showSuccess} />
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
        <div className="rounded border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200" data-testid="wa-not-configured">
          O servidor do WhatsApp ainda não está ligado ao NORQVA. Você já pode cadastrar os números; para conectar, falta configurar o servidor.
        </div>
      )}

      {!aiReady && (
        <div className="rounded border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200" data-testid="wa-ai-missing">
          A inteligência do atendente ainda não está configurada (falta a chave OPENAI_API_KEY no servidor). Sem ela, as mensagens chegam aqui e uma pessoa responde.
        </div>
      )}

      {isAdmin && (
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3 space-y-2" data-testid="wa-new-number">
          <div className="text-xs font-semibold text-slate-200">Cadastrar número ({numbers.length} de {max})</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              aria-label="Nome do número"
              placeholder='Nome (ex.: "Trattoria 1")'
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            />
            <select
              aria-label="Marca do número"
              value={brandId}
              onChange={e => setBrandId(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="">Sem marca</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button
              onClick={create}
              disabled={!label.trim() || busy === 'create' || numbers.length >= max}
              className="rounded border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-40"
            >
              Cadastrar
            </button>
          </div>
          <p className="text-[11px] text-slate-500">Cada número fica ligado a uma marca e só oferece os produtos dela. O atendente automático nasce desligado.</p>
        </div>
      )}

      {numbers.length === 0 ? (
        <div className="rounded border border-slate-800 p-6 text-center text-xs text-slate-500">Nenhum número cadastrado ainda.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="wa-numbers">
          {numbers.map(n => {
            const st = STATUS[n.status] || STATUS.NEW;
            return (
              <div key={n.id} className="rounded border border-slate-800 bg-slate-900/60 p-3 space-y-2" data-testid="wa-number">
                {editing?.id === n.id ? (
                  <div className="space-y-2">
                    <input aria-label="Novo nome" value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" />
                    <select aria-label="Nova marca" value={editing.brand_id} onChange={e => setEditing({ ...editing, brand_id: e.target.value })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100">
                      <option value="">Sem marca</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} disabled={!editing.label.trim()} className="rounded border border-emerald-500/30 px-2 py-1 text-[11px] text-emerald-300 disabled:opacity-40">Salvar</button>
                      <button onClick={() => setEditing(null)} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{n.label}</div>
                      <div className="text-[11px] text-slate-400">{n.brand_name || 'Sem marca'} · {fmtPhone(n.phone)}</div>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-mono font-bold ${st.cls}`} data-testid="wa-number-status">{st.text}</span>
                  </div>
                )}
                {n.status_reason && n.status !== 'CONNECTED' && <p className="text-[11px] text-amber-300">{n.status_reason}</p>}
                <div className="text-[11px] text-slate-500">
                  {n.conversations ?? 0} conversa(s){n.needs_human ? ` · ${n.needs_human} precisando de pessoa` : ''}
                </div>
                <div className="flex items-center justify-between gap-2 rounded border border-slate-800 px-2 py-1.5">
                  <span className="text-[11px] text-slate-300">
                    Atendente automático: <b className={n.bot_enabled ? 'text-emerald-300' : 'text-slate-400'} data-testid="wa-bot-state">{n.bot_enabled ? 'ligado' : 'pausado'}</b>
                  </span>
                  {isAdmin && (
                    <button onClick={() => toggleBot(n)} disabled={!!busy} className={`rounded border px-2 py-0.5 text-[11px] disabled:opacity-40 ${n.bot_enabled ? 'border-amber-500/30 text-amber-300' : 'border-emerald-500/30 text-emerald-300'}`}>
                      {n.bot_enabled ? 'Pausar' : 'Ligar'}
                    </button>
                  )}
                </div>
                {isAdmin && editing?.id !== n.id && (
                  <div className="flex flex-wrap gap-1.5">
                    {n.status !== 'CONNECTED' && (
                      <button onClick={() => connect(n)} disabled={!!busy || !configured} className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] text-emerald-300 disabled:opacity-40">
                        <QrCode className="h-3.5 w-3.5" /> Conectar
                      </button>
                    )}
                    <button onClick={() => refresh(n)} disabled={!!busy || !configured} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 disabled:opacity-40">
                      <RefreshCw className="h-3.5 w-3.5" /> Atualizar
                    </button>
                    <button onClick={() => setConfirm({ id: n.id, kind: 'swap' })} disabled={!!busy || !configured} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 disabled:opacity-40">
                      <Repeat className="h-3.5 w-3.5" /> Trocar número
                    </button>
                    <button onClick={() => setEditing({ id: n.id, label: n.label, brand_id: n.brand_id || '' })} disabled={!!busy} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 disabled:opacity-40">
                      Editar
                    </button>
                    <button onClick={() => setConfirm({ id: n.id, kind: 'delete' })} disabled={!!busy} className="inline-flex items-center gap-1 rounded border border-red-500/30 px-2 py-1 text-[11px] text-red-300 disabled:opacity-40">
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  </div>
                )}
                {confirm?.id === n.id && (
                  <div className="rounded border border-amber-500/30 bg-amber-950/20 p-2 text-[11px] text-amber-200 space-y-2" data-testid="wa-confirm">
                    <p>
                      {confirm.kind === 'swap'
                        ? 'O celular atual será desconectado e aparece um QR Code para o número novo. Marca, condições de atendimento e conversas continuam.'
                        : 'O número sai do NORQVA e é desconectado. As conversas ficam guardadas até completar 180 dias.'}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => (confirm.kind === 'swap' ? swap(n) : remove(n))} className="rounded border border-amber-500/40 px-2 py-1 text-amber-200">
                        {confirm.kind === 'swap' ? 'Sim, trocar' : 'Sim, excluir'}
                      </button>
                      <button onClick={() => setConfirm(null)} className="rounded border border-slate-700 px-2 py-1 text-slate-300">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" data-testid="wa-qr">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-100">Conectar "{qr.label}"</div>
              <button onClick={() => setQr(null)} aria-label="Fechar" className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            {qr.base64 ? (
              <img src={`data:image/png;base64,${qr.base64}`} alt="QR Code do WhatsApp" className="mx-auto h-64 w-64 rounded bg-white p-2" />
            ) : (
              <div className="py-10 text-center text-xs text-slate-400">Gerando o QR Code...</div>
            )}
            <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-300">
              <li>No celular do número, abra o <b>WhatsApp Business</b>.</li>
              <li>Toque em <b>⋮</b> (ou Configurações) → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>.</li>
              <li>Aponte a câmera para este QR Code.</li>
            </ol>
            <p className="text-[11px] text-slate-500">Esta janela fecha sozinha quando o número conectar. O QR Code muda a cada poucos segundos; isso é normal.</p>
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

  const loadThread = useCallback(async (id: string) => {
    try {
      const r = await api.current(`/whatsapp/conversations/${id}/messages`);
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
      <div className="space-y-2 min-w-0">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded border px-2 py-0.5 text-[11px] ${filter === f.id ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300' : 'border-slate-800 text-slate-400'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select aria-label="Filtrar por número" value={numberId} onChange={e => setNumberId(e.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100">
            <option value="">Todos os números</option>
            {numbers.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-500" />
            <input aria-label="Buscar conversa" placeholder="Nome ou telefone" value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 py-1 pl-7 pr-2 text-xs text-slate-100" />
          </div>
        </div>
        <div className="max-h-[65vh] overflow-y-auto rounded border border-slate-800 divide-y divide-slate-800" data-testid="wa-conversations">
          {convs.length === 0 && <div className="p-4 text-center text-xs text-slate-500">Nenhuma conversa.</div>}
          {convs.map(c => (
            <button
              key={c.id}
              onClick={() => setOpenId(c.id)}
              className={`block w-full p-2.5 text-left hover:bg-slate-800/40 ${openId === c.id ? 'bg-slate-800/60' : ''}`}
              data-testid="wa-conversation"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-slate-100">{c.contact_name || fmtPhone(c.contact_phone)}</span>
                <span className="shrink-0 text-[10px] text-slate-500">{fmtTime(c.last_message_at)}</span>
              </div>
              <div className="truncate text-[11px] text-slate-400">{c.last_message_preview}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                <span className="rounded bg-slate-800 px-1.5 text-slate-300">{c.number_label}</span>
                <span className="rounded bg-slate-800 px-1.5 text-slate-400">{MODE[c.mode]}</span>
                {c.needs_human && <span className="rounded bg-amber-950/50 px-1.5 text-amber-300">precisa de pessoa</span>}
                {c.unread_count > 0 && <span className="rounded bg-emerald-600 px-1.5 font-bold text-slate-950">{c.unread_count}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0 rounded border border-slate-800 bg-slate-900/40 flex flex-col min-h-[50vh]">
        {!conv ? (
          <div className="m-auto p-6 text-xs text-slate-500">Escolha uma conversa.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">{conv.contact_name || fmtPhone(conv.contact_phone)}</div>
                <div className="text-[11px] text-slate-400">{fmtPhone(conv.contact_phone)} · {conv.number_label} · {MODE[conv.mode]}</div>
              </div>
              {conv.mode !== 'OPTED_OUT' && (
                conv.mode === 'BOT' ? (
                  <button onClick={() => setMode('HUMAN')} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200">
                    <UserCheck className="h-3.5 w-3.5" /> Assumir conversa
                  </button>
                ) : (
                  <button onClick={() => setMode('BOT')} className="inline-flex items-center gap-1 rounded border border-emerald-500/30 px-2 py-1 text-[11px] text-emerald-300">
                    <Bot className="h-3.5 w-3.5" /> Devolver ao atendente
                  </button>
                )
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3 max-h-[55vh]" data-testid="wa-thread">
              {thread!.messages.map(m => (
                <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.direction === 'OUT' ? 'bg-emerald-900/50 text-emerald-50' : 'bg-slate-800 text-slate-100'}`}>
                    {m.body}
                    <div className="mt-1 text-[10px] opacity-60">
                      {AUTHOR[m.author]} · {fmtTime(m.created_at)}{m.send_status === 'FAILED' ? ' · não enviada' : ''}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {conv.mode === 'OPTED_OUT' ? (
              <div className="border-t border-slate-800 p-3 text-[11px] text-slate-400">O cliente pediu para não receber mais mensagens. Se ele voltar a escrever, a conversa reabre para você.</div>
            ) : (
              <div className="flex gap-2 border-t border-slate-800 p-3">
                <textarea
                  aria-label="Mensagem"
                  rows={2}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder="Escreva a resposta (Enter envia; ao responder, você assume a conversa)"
                  className="flex-1 resize-none rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                />
                <button onClick={() => void send()} disabled={sending || !text.trim()} aria-label="Enviar" className="self-end rounded border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-emerald-300 disabled:opacity-40">
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
      <p className="text-xs text-slate-400">
        Escreva aqui como o atendente deve atender: tom de voz, o que oferecer primeiro, respostas para as dúvidas comuns. O texto geral vale para todos os números; cada número pode ter um texto a mais.
        Preço, parcelas, entrega só com pagamento confirmado e o "parar" do cliente são regras fixas: o texto não muda isso.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Condições de" value={target} onChange={e => setTarget(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100">
          <option value="">Geral (todos os números)</option>
          {(data?.numbers || []).map(n => <option key={n.id} value={n.id}>Só o número: {n.label}</option>)}
        </select>
        <button onClick={() => void openHistory()} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
          <History className="h-3.5 w-3.5" /> Versões anteriores
        </button>
        {isAdmin && !target && (
          <button onClick={() => setText(SUGGESTED_CONDITIONS)} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
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
        className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
        placeholder="Ex.: Atenda com simpatia. Ofereça primeiro o kit. Se perguntarem sobre versão impressa, explique que é PDF e pode ser impresso."
      />
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{text.length} de 8.000 letras</span>
        {isAdmin && (
          <button onClick={() => void save()} disabled={saving || text === original} className="rounded border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-40">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        )}
      </div>
      {history && (
        <div className="space-y-2 rounded border border-slate-800 p-2" data-testid="wa-conditions-history">
          {history.length === 0 && <div className="text-[11px] text-slate-500">Nenhuma versão salva ainda.</div>}
          {history.map(v => (
            <div key={v.id} className="rounded border border-slate-800 p-2 text-[11px] text-slate-300">
              <div className="mb-1 flex items-center justify-between text-slate-500">
                <span>{new Date(v.created_at).toLocaleString('pt-BR')}{v.changed_by_name ? ` · ${v.changed_by_name}` : ''}</span>
                {isAdmin && <button onClick={() => setText(v.conditions)} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300">Voltar para esta versão</button>}
              </div>
              <div className="max-h-24 overflow-y-auto whitespace-pre-wrap">{v.conditions || '(vazio)'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
