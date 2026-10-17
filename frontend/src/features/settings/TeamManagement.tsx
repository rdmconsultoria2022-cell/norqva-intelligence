import { useEffect, useState, type FormEvent } from 'react';
import { Mail, Plus, X } from 'lucide-react';
import { StatusPill } from '../../components/ui/premium';

// NORQVA-0092 (D-0092): gestão da Equipe para administrador. Convidar por e-mail,
// editar nome e perfil, desativar e reativar (ninguém é apagado). As travas valem no
// servidor (services/team/teamService.ts); a tela só evita os botões que ele recusaria.

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  OPERATIONS: 'Operações',
  PERFORMANCE: 'Performance',
  CREATIVE: 'Criativo',
  PRODUCT: 'Produto',
  INTELLIGENCE: 'Inteligência'
};
const ROLE_ORDER = ['ADMIN', 'OPERATIONS', 'PERFORMANCE', 'CREATIVE', 'PRODUCT', 'INTELLIGENCE'];

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  accepted: boolean;
  invited_at?: string | null;
  last_login_at?: string | null;
}

interface InviteInfo {
  sent?: boolean;
  simulated?: boolean;
  alreadyRegistered?: boolean;
  uncertain?: boolean;
}

function inviteMessage(m: { name: string; email: string }, inv: InviteInfo): string {
  if (inv.simulated) return `${m.name} cadastrado (ambiente de teste: e-mail não enviado).`;
  if (inv.alreadyRegistered) return `${m.name} já tinha login: está na equipe e entra com a senha que já usa (ou "Esqueci a senha").`;
  if (inv.uncertain) return `${m.name} cadastrado, mas o envio do e-mail não foi confirmado. Se não chegar, use "Reenviar convite".`;
  return `Convite enviado para ${m.email}.`;
}

interface Props {
  currentUser: { id: string; role: string };
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  onChanged?: () => void;
}

const fieldCls =
  'w-full min-h-[44px] rounded-xl bg-nq-raised px-3 text-nq-body text-nq-text placeholder:text-nq-subtle border border-nq-line focus:outline-none focus:ring-2 focus:ring-nq-info';
const btnPrimary =
  'min-h-[44px] px-5 rounded-full bg-nq-positive text-nq-on-positive text-nq-aux font-semibold hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-1.5';
const btnSecondary =
  'min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux font-semibold hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-1.5';
const btnDanger =
  'min-h-[44px] px-4 rounded-full bg-nq-critical/15 text-nq-critical-text hover:bg-nq-critical/25 text-nq-aux font-semibold transition disabled:opacity-50';

function initials(name: string) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function fmtDate(v?: string | null) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return '';
  }
}

export function TeamManagement({ currentUser, apiFetch, showError, showSuccess, onChanged }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await apiFetch('/team?mode=real');
      setMembers(Array.isArray(r?.users) ? r.users : []);
    } catch (e: any) {
      showError(e?.message || 'Não foi possível carregar a equipe.');
      setMembers([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changed = (m?: Member) => {
    if (m) setMembers((list) => (list || []).map((x) => (x.id === m.id ? m : x)));
    onChanged?.();
  };

  const isOn = (m: Member) => (m.status || 'ACTIVE') === 'ACTIVE';
  const active = (members || []).filter(isOn);
  const inactive = (members || []).filter((m) => !isOn(m));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight text-nq-text">Equipe e permissões</h1>
          <p className="mt-1 text-nq-aux text-nq-muted">Quem acessa o NORQVA e o perfil de cada pessoa. O perfil define o que cada um pode ver e alterar.</p>
        </div>
        {!inviteOpen && (
          <button type="button" className={btnPrimary} onClick={() => setInviteOpen(true)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Convidar pessoa
          </button>
        )}
      </div>

      {inviteOpen && (
        <InviteForm
          apiFetch={apiFetch}
          showError={showError}
          onCancel={() => setInviteOpen(false)}
          onDone={(m, invite) => {
            setMembers((list) => [...(list || []), m].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
            setInviteOpen(false);
            showSuccess(inviteMessage(m, invite));
            onChanged?.();
          }}
        />
      )}

      {members === null ? (
        <div className="rounded-nq bg-nq-surface p-8 text-center text-nq-aux text-nq-muted">Carregando equipe…</div>
      ) : (
        <>
          <MemberList
            title={`Ativos (${active.length})`}
            members={active}
            openId={openId}
            setOpenId={setOpenId}
            currentUser={currentUser}
            apiFetch={apiFetch}
            showError={showError}
            showSuccess={showSuccess}
            onChanged={changed}
          />
          {inactive.length > 0 && (
            <MemberList
              title={`Desativados (${inactive.length})`}
              members={inactive}
              openId={openId}
              setOpenId={setOpenId}
              currentUser={currentUser}
              apiFetch={apiFetch}
              showError={showError}
              showSuccess={showSuccess}
              onChanged={changed}
            />
          )}
        </>
      )}
    </div>
  );
}

function RoleSelect({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select id={id} className={fieldCls} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {ROLE_ORDER.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}

function InviteForm({
  apiFetch,
  showError,
  onCancel,
  onDone
}: {
  apiFetch: Props['apiFetch'];
  showError: Props['showError'];
  onCancel: () => void;
  onDone: (m: Member, invite: InviteInfo) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OPERATIONS');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiFetch('/team/invite?mode=real', { method: 'POST', body: JSON.stringify({ name, email, role }) });
      onDone(r.member, r.invite || {});
    } catch (err: any) {
      showError(err?.message || 'Não foi possível enviar o convite.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-nq bg-nq-surface p-4 space-y-4" aria-label="Convidar pessoa">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-nq-section font-semibold text-nq-text">Convidar pessoa</h2>
        <button type="button" onClick={onCancel} aria-label="Fechar convite" className="h-11 w-11 rounded-full flex items-center justify-center text-nq-muted hover:bg-nq-raised">
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block space-y-1.5">
          <span className="text-nq-caption text-nq-muted">Nome</span>
          <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required minLength={2} maxLength={120} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-nq-caption text-nq-muted">E-mail</span>
          <input className={fieldCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
        </label>
        <div className="space-y-1.5">
          <label htmlFor="team-invite-role" className="block text-nq-caption text-nq-muted">Perfil</label>
          <RoleSelect id="team-invite-role" value={role} onChange={setRole} />
        </div>
      </div>
      <p className="text-nq-caption text-nq-muted">A pessoa recebe um e-mail para criar a senha e entra já com este perfil.</p>
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className={btnSecondary} onClick={onCancel}>Cancelar</button>
        <button type="submit" className={btnPrimary} disabled={busy}>
          <Mail aria-hidden="true" className="h-4 w-4" />
          {busy ? 'Enviando…' : 'Enviar convite'}
        </button>
      </div>
    </form>
  );
}

function MemberList(props: {
  title: string;
  members: Member[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  currentUser: Props['currentUser'];
  apiFetch: Props['apiFetch'];
  showError: Props['showError'];
  showSuccess: Props['showSuccess'];
  onChanged: (m?: Member) => void;
}) {
  const { title, members, openId, setOpenId } = props;
  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className="text-nq-aux font-semibold text-nq-muted">{title}</h2>
      {members.length === 0 ? (
        <div className="rounded-nq bg-nq-surface p-6 text-center text-nq-aux text-nq-muted">Ninguém aqui.</div>
      ) : (
        <ul className="rounded-nq bg-nq-surface divide-y divide-nq-line/70 overflow-hidden">
          {members.map((m) => (
            <MemberRow key={m.id} {...props} member={m} open={openId === m.id} toggle={() => setOpenId(openId === m.id ? null : m.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MemberRow({
  member: m,
  open,
  toggle,
  currentUser,
  apiFetch,
  showError,
  showSuccess,
  onChanged
}: {
  member: Member;
  open: boolean;
  toggle: () => void;
  currentUser: Props['currentUser'];
  apiFetch: Props['apiFetch'];
  showError: Props['showError'];
  showSuccess: Props['showSuccess'];
  onChanged: (m?: Member) => void;
}) {
  const isSelf = m.id === currentUser.id;
  const isActive = (m.status || 'ACTIVE') === 'ACTIVE';
  const pending = isActive && m.accepted === false;
  const [name, setName] = useState(m.name);
  const [role, setRole] = useState(m.role);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'none' | 'role' | 'deactivate'>('none');

  useEffect(() => {
    if (open) {
      setName(m.name);
      setRole(m.role);
      setConfirm('none');
    }
  }, [open, m.name, m.role]);

  const run = async (url: string, init: RequestInit, ok: string | ((r: any) => string)) => {
    setBusy(true);
    try {
      const r = await apiFetch(url, init);
      if (r?.member) onChanged(r.member);
      showSuccess(typeof ok === 'function' ? ok(r) : ok);
      setConfirm('none');
      return true;
    } catch (err: any) {
      showError(err?.message || 'Não foi possível salvar.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const dirty = name.trim() !== m.name || role !== m.role;
  const save = async () => {
    if (role !== m.role && confirm !== 'role') {
      setConfirm('role');
      return;
    }
    const done = await run(`/team/${m.id}?mode=real`, { method: 'PATCH', body: JSON.stringify({ name, role }) }, 'Alterações salvas.');
    if (done) toggle();
  };

  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3.5 min-h-[64px]">
        <div className="h-10 w-10 rounded-full bg-nq-raised flex items-center justify-center shrink-0 text-nq-aux font-semibold text-nq-text" aria-hidden="true">
          {initials(m.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-nq-body font-medium text-nq-text break-words">
            {m.name}
            {isSelf && <span className="text-nq-caption text-nq-muted font-normal"> (você)</span>}
          </div>
          <div className="text-nq-caption text-nq-muted break-all">{m.email}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-nq-caption font-medium text-nq-muted">{ROLE_LABEL[m.role] || m.role}</span>
            {pending && <StatusPill tone="attention">Convite enviado{m.invited_at ? ` em ${fmtDate(m.invited_at)}` : ''}</StatusPill>}
            {!isActive && <StatusPill tone="neutral">Desativado</StatusPill>}
          </div>
        </div>
        <button type="button" className={btnSecondary} onClick={toggle} aria-expanded={open}>
          {open ? 'Fechar' : 'Gerenciar'}
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {isActive && (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-nq-caption text-nq-muted">Nome</span>
                <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </label>
              <div className="space-y-1.5">
                <label htmlFor={`team-role-${m.id}`} className="block text-nq-caption text-nq-muted">Perfil</label>
                <RoleSelect
                  id={`team-role-${m.id}`}
                  value={role}
                  onChange={(v) => {
                    setRole(v);
                    setConfirm('none');
                  }}
                  disabled={isSelf && m.role === 'ADMIN'}
                />
                {isSelf && m.role === 'ADMIN' && (
                  <p className="text-nq-caption text-nq-muted">Você não pode tirar o seu próprio perfil de administrador.</p>
                )}
              </div>
            </div>
          )}

          {confirm === 'role' && (
            <p className="rounded-xl bg-nq-attention/10 p-3 text-nq-aux text-nq-text" role="alert">
              Trocar o perfil de {m.name} de {ROLE_LABEL[m.role]} para {ROLE_LABEL[role]}? Vale na hora. Toque em "Confirmar" para salvar.
            </p>
          )}
          {confirm === 'deactivate' && (
            <p className="rounded-xl bg-nq-critical/10 p-3 text-nq-aux text-nq-text" role="alert">
              {m.name} perde o acesso ao NORQVA na hora. Nada é apagado e dá para reativar depois.
            </p>
          )}

          <div className="flex flex-wrap gap-2 justify-end">
            {pending && (
              <button
                type="button"
                className={btnSecondary}
                disabled={busy}
                onClick={() => run(`/team/${m.id}/resend-invite?mode=real`, { method: 'POST' }, (r) => inviteMessage(m, r?.invite || {}).replace('Convite enviado', 'Convite reenviado'))}
              >
                <Mail aria-hidden="true" className="h-4 w-4" />
                Reenviar convite
              </button>
            )}
            {isActive && !isSelf && (
              confirm === 'deactivate' ? (
                <>
                  <button type="button" className={btnSecondary} disabled={busy} onClick={() => setConfirm('none')}>Voltar</button>
                  <button
                    type="button"
                    className={btnDanger}
                    disabled={busy}
                    onClick={() => run(`/team/${m.id}/deactivate?mode=real`, { method: 'POST' }, `${m.name} desativado.`)}
                  >
                    Confirmar desativação
                  </button>
                </>
              ) : (
                <button type="button" className={btnDanger} disabled={busy} onClick={() => setConfirm('deactivate')}>
                  {pending ? 'Cancelar convite' : 'Desativar acesso'}
                </button>
              )
            )}
            {!isActive && (
              <button
                type="button"
                className={btnPrimary}
                disabled={busy}
                onClick={() => run(`/team/${m.id}/reactivate?mode=real`, { method: 'POST' }, `${m.name} reativado.`)}
              >
                Reativar acesso
              </button>
            )}
            {isActive && confirm !== 'deactivate' && (
              <button type="button" className={btnPrimary} disabled={busy || !dirty || name.trim().length < 2} onClick={save}>
                {confirm === 'role' ? 'Confirmar' : busy ? 'Salvando…' : 'Salvar'}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
