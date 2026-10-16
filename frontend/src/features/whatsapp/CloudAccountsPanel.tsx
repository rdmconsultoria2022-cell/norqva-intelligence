import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, KeyRound, Copy, Plus, Power } from 'lucide-react';

// NORQVA-0079 (D-0079): WhatsApp oficial (Cloud API da Meta), dentro da aba Números.
// Contas Meta por marca e ambiente (TESTE / PRODUÇÃO), travas de envio visíveis e cadastro do número oficial.
// O token e a chave secreta nunca voltam para a tela (só os 4 últimos caracteres do token).

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

interface CloudAccount {
  id: string;
  label: string;
  brand_id: string | null;
  brand_name: string | null;
  environment: 'TEST' | 'PRODUCTION';
  waba_id: string;
  app_id: string;
  token_last4: string;
  test_recipients: string[];
  status: 'NEW' | 'VERIFIED' | 'INVALID' | 'DISABLED';
  webhook_url?: string;
  webhook_verified_at: string | null;
  last_check_at: string | null;
  last_error: string | null;
  numbers?: number;
}

interface Locks {
  send_enabled: boolean;
  environments: string[];
  evolution_enabled: boolean;
  secrets_key_configured: boolean;
}

interface PhoneOption {
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
}

const ENV: Record<string, { text: string; cls: string }> = {
  TEST: { text: 'TESTE', cls: 'bg-sky-950/40 text-sky-300 border border-sky-500/20' },
  PRODUCTION: { text: 'PRODUÇÃO', cls: 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/20' }
};

const ACC_STATUS: Record<string, { text: string; cls: string }> = {
  NEW: { text: 'NÃO CONFERIDA', cls: 'text-slate-300' },
  VERIFIED: { text: 'CONFERIDA', cls: 'text-emerald-300' },
  INVALID: { text: 'COM PROBLEMA', cls: 'text-red-300' },
  DISABLED: { text: 'DESATIVADA', cls: 'text-slate-500' }
};

const emptyForm = { label: '', brand_id: '', environment: 'TEST', waba_id: '', app_id: '', access_token: '', app_secret: '', test_recipients: '' };

const input = 'w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100';

export function CloudAccountsPanel({
  isAdmin,
  api,
  brands,
  showError,
  showSuccess,
  onNumbersChanged
}: {
  isAdmin: boolean;
  api: React.MutableRefObject<ApiFetch>;
  brands: { id: string; name: string }[];
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onNumbersChanged: () => void;
}) {
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [locks, setLocks] = useState<Locks | null>(null);
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState<{ accountId: string; token: string } | null>(null);
  const [phones, setPhones] = useState<{ accountId: string; list: PhoneOption[]; problem: string | null } | null>(null);
  const [numberLabel, setNumberLabel] = useState('');
  const [edit, setEdit] = useState<{ id: string; access_token: string; app_secret: string; test_recipients: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.current('/whatsapp/cloud/accounts');
      setAccounts(r?.accounts || []);
      setLocks(r?.locks || null);
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar as contas Meta.');
    }
  }, [api, showError]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const create = () => form && run('create-account', async () => {
    const r = await api.current('/whatsapp/cloud/accounts', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        brand_id: form.brand_id || null,
        test_recipients: form.environment === 'TEST' ? form.test_recipients : ''
      })
    });
    setForm(null);
    if (r?.verify_token && r?.account?.id) setVerifyToken({ accountId: r.account.id, token: r.verify_token });
    showSuccess('Conta Meta cadastrada. Copie o verify token abaixo e clique em "Conferir".');
    await load();
  });

  const check = (a: CloudAccount, subscribe: boolean) => run(`check-${a.id}`, async () => {
    const r = await api.current(`/whatsapp/cloud/accounts/${a.id}/check`, { method: 'POST', body: JSON.stringify({ subscribe }) });
    setPhones({ accountId: a.id, list: r?.phone_numbers || [], problem: r?.ok ? null : r?.problem || 'Não deu certo.' });
    if (r?.ok) showSuccess(subscribe ? (r.subscribed ? 'Conta conferida e webhook assinado na Meta.' : 'Conta conferida, mas a assinatura do webhook não foi confirmada.') : 'Conta conferida.');
    await load();
  });

  const toggle = (a: CloudAccount) => run(`toggle-${a.id}`, async () => {
    await api.current(`/whatsapp/cloud/accounts/${a.id}`, { method: 'PATCH', body: JSON.stringify({ active: a.status === 'DISABLED' }) });
    showSuccess(a.status === 'DISABLED' ? 'Conta reativada. Confira de novo antes de usar.' : 'Conta desativada: o atendente parou nos números dela.');
    await load();
    onNumbersChanged();
  });

  const saveEdit = () => edit && run(`edit-${edit.id}`, async () => {
    const body: Record<string, any> = {};
    // campo vazio = mantém a lista atual
    if (edit.test_recipients.trim()) body.test_recipients = edit.test_recipients;
    if (edit.access_token.trim()) body.access_token = edit.access_token.trim();
    if (edit.app_secret.trim()) body.app_secret = edit.app_secret.trim();
    await api.current(`/whatsapp/cloud/accounts/${edit.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setEdit(null);
    showSuccess('Conta atualizada.');
    await load();
  });

  const rotateToken = (a: CloudAccount) => run(`rotate-${a.id}`, async () => {
    const r = await api.current(`/whatsapp/cloud/accounts/${a.id}`, { method: 'PATCH', body: JSON.stringify({ rotate_verify_token: true }) });
    if (r?.verify_token) setVerifyToken({ accountId: a.id, token: r.verify_token });
    await load();
  });

  const addNumber = (accountId: string, p: PhoneOption) => run(`number-${p.phone_number_id}`, async () => {
    await api.current('/whatsapp/cloud/numbers', {
      method: 'POST',
      body: JSON.stringify({ cloud_account_id: accountId, phone_number_id: p.phone_number_id, label: numberLabel.trim() || p.verified_name || 'Número oficial' })
    });
    setNumberLabel('');
    setPhones(null);
    showSuccess('Número oficial cadastrado com o atendente desligado.');
    await load();
    onNumbersChanged();
  });

  const copy = (text: string) => {
    try {
      void navigator.clipboard?.writeText(text);
      showSuccess('Copiado.');
    } catch {
      // sem área de transferência: o texto continua visível para copiar à mão
    }
  };

  return (
    <div className="rounded border border-sky-500/20 bg-slate-900/60 p-3 space-y-3" data-testid="wa-cloud">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <ShieldCheck className="h-4 w-4 text-sky-300" /> WhatsApp oficial (Meta)
        </div>
        {isAdmin && !form && (
          <button onClick={() => setForm({ ...emptyForm })} className="inline-flex items-center gap-1 rounded border border-sky-500/30 px-2 py-1 text-[11px] text-sky-300">
            <Plus className="h-3.5 w-3.5" /> Nova conta Meta
          </button>
        )}
      </div>

      {locks && (
        <div className="flex flex-wrap gap-1.5 text-[10px]" data-testid="wa-cloud-locks">
          <span className={`rounded px-1.5 py-0.5 ${locks.send_enabled ? 'bg-emerald-950/50 text-emerald-300' : 'bg-amber-950/50 text-amber-300'}`}>
            Envio real: {locks.send_enabled ? 'liberado' : 'bloqueado até a homologação'}
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
            Ambientes liberados: {locks.environments.length ? locks.environments.map(e => (e === 'TEST' ? 'teste' : 'produção')).join(' e ') : 'nenhum'}
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">API não oficial (Evolution): {locks.evolution_enabled ? 'ligada' : 'desligada'}</span>
        </div>
      )}
      {locks && !locks.secrets_key_configured && (
        <div className="rounded border border-amber-500/30 bg-amber-950/20 p-2 text-[11px] text-amber-200" data-testid="wa-cloud-key-missing">
          Falta a chave WHATSAPP_SECRETS_KEY no servidor. Sem ela, o token da Meta não pode ser guardado com segurança e o cadastro fica bloqueado.
        </div>
      )}

      {verifyToken && (
        <div className="rounded border border-sky-500/30 bg-sky-950/20 p-2 text-[11px] text-sky-100 space-y-1" data-testid="wa-cloud-verify-token">
          <div className="font-semibold">Verify token do webhook (aparece só agora — copie e cole na Meta):</div>
          <div className="flex items-center gap-2">
            <code className="break-all rounded bg-slate-950 px-1.5 py-0.5">{verifyToken.token}</code>
            <button onClick={() => copy(verifyToken.token)} aria-label="Copiar verify token" className="shrink-0 text-sky-300"><Copy className="h-3.5 w-3.5" /></button>
          </div>
          <button onClick={() => setVerifyToken(null)} className="text-[10px] text-slate-400 underline">Já copiei</button>
        </div>
      )}

      {form && (
        <div className="space-y-2 rounded border border-slate-800 p-2" data-testid="wa-cloud-form">
          <div className="grid gap-2 sm:grid-cols-2">
            <input aria-label="Nome da conta" placeholder='Nome (ex.: "Trattoria — teste")' value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} className={input} />
            <select aria-label="Marca da conta" value={form.brand_id} onChange={e => setForm({ ...form, brand_id: e.target.value })} className={input}>
              <option value="">Sem marca</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select aria-label="Ambiente" value={form.environment} onChange={e => setForm({ ...form, environment: e.target.value })} className={input}>
              <option value="TEST">Teste (número de teste da Meta)</option>
              <option value="PRODUCTION">Produção (número definitivo)</option>
            </select>
            <input aria-label="ID da conta do WhatsApp Business" placeholder="ID da conta do WhatsApp Business (WABA)" value={form.waba_id} onChange={e => setForm({ ...form, waba_id: e.target.value })} className={input} />
            <input aria-label="ID do app" placeholder="ID do app na Meta" value={form.app_id} onChange={e => setForm({ ...form, app_id: e.target.value })} className={input} />
            <input aria-label="Token de acesso" type="password" autoComplete="off" placeholder="Token do usuário do sistema" value={form.access_token} onChange={e => setForm({ ...form, access_token: e.target.value })} className={input} />
            <input aria-label="Chave secreta do app" type="password" autoComplete="off" placeholder="Chave secreta do app" value={form.app_secret} onChange={e => setForm({ ...form, app_secret: e.target.value })} className={input} />
            {form.environment === 'TEST' && (
              <input aria-label="Destinatários de teste" placeholder="Destinatários de teste (ex.: +55 31 99999-8888)" value={form.test_recipients} onChange={e => setForm({ ...form, test_recipients: e.target.value })} className={input} />
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy === 'create-account' || !form.label.trim() || !form.waba_id.trim() || !form.app_id.trim() || !form.access_token.trim() || !form.app_secret.trim()}
              className="rounded border border-sky-500/30 bg-sky-950/40 px-3 py-1.5 text-xs font-semibold text-sky-300 disabled:opacity-40"
            >
              Salvar conta Meta
            </button>
            <button onClick={() => setForm(null)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300">Cancelar</button>
          </div>
          <p className="text-[11px] text-slate-500">Para ir de teste para produção, cadastre outra conta: os IDs de uma conta não mudam.</p>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="text-[11px] text-slate-500">Nenhuma conta Meta cadastrada ainda.</div>
      ) : (
        <div className="space-y-2" data-testid="wa-cloud-accounts">
          {accounts.map(a => {
            const st = ACC_STATUS[a.status] || ACC_STATUS.NEW;
            const env = ENV[a.environment] || ENV.TEST;
            return (
              <div key={a.id} className="rounded border border-slate-800 p-2 space-y-1.5" data-testid="wa-cloud-account">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-100">{a.label}</div>
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${env.cls}`}>{env.text}</span>
                    <span className={`text-[10px] font-mono font-bold ${st.cls}`} data-testid="wa-cloud-account-status">{st.text}</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400">
                  {a.brand_name || 'Sem marca'} · WABA {a.waba_id} · token ••••{a.token_last4} · {a.numbers ?? 0} número(s)
                  {a.environment === 'TEST' && ` · destinatários de teste: ${a.test_recipients.length ? a.test_recipients.join(', ') : 'nenhum'}`}
                </div>
                {a.webhook_url && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    Webhook: <code className="truncate rounded bg-slate-950 px-1">{a.webhook_url}</code>
                    <button onClick={() => copy(a.webhook_url!)} aria-label="Copiar endereço do webhook" className="text-slate-300"><Copy className="h-3.5 w-3.5" /></button>
                    <span className={a.webhook_verified_at ? 'text-emerald-300' : 'text-amber-300'}>{a.webhook_verified_at ? 'verificado' : 'ainda não verificado'}</span>
                  </div>
                )}
                {a.last_error && a.status === 'INVALID' && <p className="text-[11px] text-red-300">{a.last_error}</p>}
                {isAdmin && (
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => check(a, false)} disabled={!!busy || a.status === 'DISABLED'} className="inline-flex items-center gap-1 rounded border border-sky-500/30 px-2 py-1 text-[11px] text-sky-300 disabled:opacity-40">
                      <RefreshCw className={`h-3.5 w-3.5 ${busy === `check-${a.id}` ? 'animate-spin' : ''}`} /> Conferir
                    </button>
                    <button onClick={() => check(a, true)} disabled={!!busy || a.status === 'DISABLED'} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 disabled:opacity-40">
                      Conferir e assinar webhook
                    </button>
                    <button
                      onClick={() => setEdit({ id: a.id, access_token: '', app_secret: '', test_recipients: '' })}
                      disabled={!!busy}
                      className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 disabled:opacity-40"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Trocar token / destinatários
                    </button>
                    <button onClick={() => rotateToken(a)} disabled={!!busy} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 disabled:opacity-40">
                      Novo verify token
                    </button>
                    <button onClick={() => toggle(a)} disabled={!!busy} className="inline-flex items-center gap-1 rounded border border-amber-500/30 px-2 py-1 text-[11px] text-amber-300 disabled:opacity-40">
                      <Power className="h-3.5 w-3.5" /> {a.status === 'DISABLED' ? 'Reativar' : 'Desativar'}
                    </button>
                  </div>
                )}
                {edit?.id === a.id && (
                  <div className="space-y-2 rounded border border-slate-800 p-2">
                    <input aria-label="Novo token" type="password" autoComplete="off" placeholder="Novo token (deixe vazio para manter)" value={edit.access_token} onChange={e => setEdit({ ...edit, access_token: e.target.value })} className={input} />
                    <input aria-label="Nova chave secreta" type="password" autoComplete="off" placeholder="Nova chave secreta do app (deixe vazio para manter)" value={edit.app_secret} onChange={e => setEdit({ ...edit, app_secret: e.target.value })} className={input} />
                    {a.environment === 'TEST' && (
                      <input aria-label="Novos destinatários de teste" placeholder="Destinatários de teste, separados por vírgula (substitui a lista)" value={edit.test_recipients} onChange={e => setEdit({ ...edit, test_recipients: e.target.value })} className={input} />
                    )}
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="rounded border border-sky-500/30 px-2 py-1 text-[11px] text-sky-300">Salvar alterações</button>
                      <button onClick={() => setEdit(null)} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">Cancelar</button>
                    </div>
                  </div>
                )}
                {phones?.accountId === a.id && (
                  <div className="space-y-1.5 rounded border border-slate-800 p-2 text-[11px]" data-testid="wa-cloud-phones">
                    {phones.problem ? (
                      <p className="text-red-300">{phones.problem}</p>
                    ) : phones.list.length === 0 ? (
                      <p className="text-slate-400">A conta não tem números na Meta.</p>
                    ) : (
                      <>
                        <input aria-label="Nome do número oficial" placeholder='Nome do número no NORQVA (ex.: "Trattoria oficial")' value={numberLabel} onChange={e => setNumberLabel(e.target.value)} className={input} />
                        {phones.list.map(p => (
                          <div key={p.phone_number_id} className="flex items-center justify-between gap-2">
                            <span className="text-slate-300">{p.display_phone_number || p.phone_number_id} · {p.verified_name || 'sem nome'}{p.quality_rating ? ` · qualidade ${p.quality_rating}` : ''}</span>
                            {isAdmin && (
                              <button onClick={() => addNumber(a.id, p)} disabled={!!busy} className="rounded border border-sky-500/30 px-2 py-0.5 text-sky-300 disabled:opacity-40">
                                Usar este número
                              </button>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
