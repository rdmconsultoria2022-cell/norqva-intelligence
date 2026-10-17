import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0092 (D-0092): gestão da Equipe. Convidar por e-mail, editar nome e perfil,
// desativar e reativar. Ninguém é apagado. Travas: só ADMIN; ninguém desativa a si
// mesmo nem tira o próprio perfil de ADMIN; nunca fica sem ADMIN ativo.
// Convite: a pessoa nasce ACTIVE e sem auth_user_id; o login dela liga o cadastro pelo
// e-mail (middleware/auth.ts). Enquanto não liga, a tela mostra "Convite enviado".

export const TEAM_ROLES = ['ADMIN', 'OPERATIONS', 'PERFORMANCE', 'CREATIVE', 'PRODUCT', 'INTELLIGENCE'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export class TeamError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Actor {
  id: string;
  role: string;
}

export interface InviteResult {
  sent: boolean;
  simulated?: boolean;
  // e-mail já tem login no Supabase: o cadastro fica e liga no primeiro acesso dela
  alreadyRegistered?: boolean;
  // resposta do Supabase não chegou (rede/tempo): o convite pode ou não ter saído
  uncertain?: boolean;
}

// Envio do convite pelo Supabase Auth (POST /auth/v1/invite). Os testes trocam esta
// função por uma simulada (setInviteSenderForTests): nunca falam com o Supabase.
export type InviteSender = (email: string, name: string) => Promise<InviteResult>;

const defaultInviteSender: InviteSender = async (email, name) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const frontend = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');

  if (!isProduction && (!serviceKey || serviceKey === 'MOCK' || !supabaseUrl)) {
    return { sent: false, simulated: true };
  }
  if (!supabaseUrl || !serviceKey) {
    throw new TeamError(503, 'Envio de convite não configurado (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY).');
  }
  if (!frontend) {
    throw new TeamError(503, 'FRONTEND_URL não configurado: não é possível montar o link do convite.');
  }

  const url = `${supabaseUrl}/auth/v1/invite?redirect_to=${encodeURIComponent(`${frontend}/reset-password`)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ email, data: { name } })
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body: any = await res.json();
      detail = String(body?.msg || body?.message || body?.error_description || body?.error || '');
    } catch {
      // sem corpo
    }
    if (res.status === 429) {
      throw new TeamError(429, 'Limite de e-mails do Supabase atingido. Tente de novo em alguns minutos.');
    }
    if (/already|registered|exists/i.test(detail)) {
      return { sent: false, alreadyRegistered: true };
    }
    throw new TeamError(502, `O Supabase recusou o convite${detail ? `: ${detail}` : ''}.`);
  }
  return { sent: true };
};

let inviteSender: InviteSender = defaultInviteSender;

export function setInviteSenderForTests(fn: InviteSender | null) {
  inviteSender = fn || defaultInviteSender;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 120) throw new TeamError(400, 'Informe o nome (2 a 120 letras).');
  return name;
}

function cleanRole(raw: unknown): TeamRole {
  if (typeof raw !== 'string' || !(TEAM_ROLES as readonly string[]).includes(raw)) {
    throw new TeamError(400, 'Perfil inválido.');
  }
  return raw as TeamRole;
}

function cleanEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) throw new TeamError(400, 'E-mail inválido.');
  return email;
}

const PUBLIC_COLS = `id, name, email, role, status, created_at, last_login_at, invited_at,
  (auth_user_id IS NOT NULL) AS accepted`;

type Queryable = { query: (sql: string, params?: any[]) => Promise<any> };

export class TeamService {
  constructor(private pool: Pool) {}

  private requireAdmin(actor: Actor) {
    if (actor.role !== 'ADMIN') throw new TeamError(403, 'Só administrador gerencia a equipe.');
  }

  private async getMember(id: string, db: Queryable = this.pool as unknown as Queryable, lock = false) {
    if (!UUID_RE.test(String(id || ''))) throw new TeamError(404, 'Pessoa não encontrada.');
    const r = await db.query(
      `SELECT id, name, email, role, status, auth_user_id FROM users WHERE id = $1 AND is_demo = FALSE${lock ? ' FOR UPDATE' : ''}`,
      [id]
    );
    if (r.rows.length === 0) throw new TeamError(404, 'Pessoa não encontrada.');
    return r.rows[0];
  }

  // Trava: depois da mudança, tem que sobrar ao menos um ADMIN ativo (fora o alvo).
  // Roda dentro da transação com os administradores travados (FOR UPDATE), para que
  // dois administradores não se desativem ao mesmo tempo.
  private async ensureAnotherActiveAdmin(db: Queryable, targetId: string) {
    const r = await db.query(
      `SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' AND is_demo = FALSE ORDER BY id FOR UPDATE`
    );
    const others = r.rows.filter((row: any) => String(row.id) !== String(targetId));
    if (others.length < 1) {
      throw new TeamError(409, 'A equipe ficaria sem nenhum administrador ativo.');
    }
  }

  // Executa fn numa transação; os testes podem passar um banco simulado sem connect().
  private async tx<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
    const anyPool = this.pool as any;
    if (typeof anyPool.connect !== 'function') return fn(anyPool as Queryable);
    const client = await anyPool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async list() {
    const r = await this.pool.query(`SELECT ${PUBLIC_COLS} FROM users WHERE is_demo = FALSE ORDER BY name ASC`);
    return r.rows;
  }

  async invite(actor: Actor, body: any) {
    this.requireAdmin(actor);
    const name = cleanName(body?.name);
    const email = cleanEmail(body?.email);
    const role = cleanRole(body?.role);

    const existing = await this.pool.query(`SELECT id, status, is_demo FROM users WHERE LOWER(email) = $1`, [email]);
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.is_demo) throw new TeamError(409, 'Este e-mail é de um usuário de demonstração.');
      throw new TeamError(
        409,
        row.status === 'ACTIVE' ? 'Esta pessoa já está na equipe.' : 'Esta pessoa já esteve na equipe e está desativada: use "Reativar".'
      );
    }

    let id: string;
    try {
      const ins = await this.pool.query(
        `INSERT INTO users (id, name, email, role, status, is_demo, invited_at, invited_by)
         VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', FALSE, NOW(), $4)
         RETURNING id`,
        [name, email, role, actor.id]
      );
      id = ins.rows[0].id;
    } catch (e: any) {
      if (e?.code === '23505') throw new TeamError(409, 'Esta pessoa já está na equipe.');
      throw e;
    }

    let result: InviteResult;
    try {
      result = await inviteSender(email, name);
    } catch (e) {
      if (e instanceof TeamError) {
        // o Supabase recusou de forma clara: desfaz o cadastro recém-criado (ninguém usou)
        await this.pool.query(`DELETE FROM users WHERE id = $1 AND auth_user_id IS NULL`, [id]).catch(() => {});
        throw e;
      }
      // sem resposta (rede/tempo): o convite pode ter saído; o cadastro fica e dá para reenviar
      console.error('[team] convite sem resposta do Supabase:', e);
      result = { sent: false, uncertain: true };
    }

    await writeAuditLog(
      this.pool,
      actor.id,
      'TEAM_MEMBER_INVITED',
      `Convite para ${name} (${email}) como ${role}`,
      null,
      JSON.stringify({ id, name, email, role, ...result })
    );
    return { member: await this.one(id), invite: result };
  }

  async resendInvite(actor: Actor, id: string) {
    this.requireAdmin(actor);
    const m = await this.getMember(id);
    if (m.auth_user_id) throw new TeamError(409, 'Esta pessoa já aceitou o convite.');
    if (m.status !== 'ACTIVE') throw new TeamError(409, 'Reative a pessoa antes de reenviar o convite.');
    const result = await inviteSender(m.email, m.name);
    await this.pool.query(`UPDATE users SET invited_at = NOW(), invited_by = $2 WHERE id = $1`, [m.id, actor.id]);
    await writeAuditLog(this.pool, actor.id, 'TEAM_INVITE_RESENT', `Convite reenviado para ${m.name} (${m.email})`, null, JSON.stringify({ id: m.id, ...result }));
    return { member: await this.one(m.id), invite: result };
  }

  async update(actor: Actor, id: string, body: any) {
    this.requireAdmin(actor);
    const changedId = await this.tx(async (db) => {
      const m = await this.getMember(id, db, true);
      const name = body?.name !== undefined ? cleanName(body.name) : m.name;
      const role = body?.role !== undefined ? cleanRole(body.role) : (m.role as TeamRole);

      if (m.role === 'ADMIN' && role !== 'ADMIN') {
        // m.id é o valor do banco: não depende de maiúsculas no endereço
        if (String(m.id) === String(actor.id)) throw new TeamError(409, 'Você não pode tirar o seu próprio perfil de administrador.');
        if (m.status === 'ACTIVE') await this.ensureAnotherActiveAdmin(db, m.id);
      }
      if (name === m.name && role === m.role) return m.id;

      await db.query(`UPDATE users SET name = $2, role = $3, updated_at = NOW(), updated_by = $4 WHERE id = $1`, [m.id, name, role, actor.id]);
      await writeAuditLog(
        db as any,
        actor.id,
        'TEAM_MEMBER_UPDATED',
        `Equipe: ${m.name} alterado`,
        JSON.stringify({ name: m.name, role: m.role }),
        JSON.stringify({ name, role }),
        false,
        true
      );
      return m.id;
    });
    return { member: await this.one(changedId) };
  }

  async setActive(actor: Actor, id: string, active: boolean) {
    this.requireAdmin(actor);
    const next = active ? 'ACTIVE' : 'INACTIVE';
    const changedId = await this.tx(async (db) => {
      const m = await this.getMember(id, db, true);
      if (!active) {
        if (String(m.id) === String(actor.id)) throw new TeamError(409, 'Você não pode desativar o seu próprio acesso.');
        if (m.role === 'ADMIN' && m.status === 'ACTIVE') await this.ensureAnotherActiveAdmin(db, m.id);
      }
      if (m.status === next) return m.id;

      await db.query(`UPDATE users SET status = $2, updated_at = NOW(), updated_by = $3 WHERE id = $1`, [m.id, next, actor.id]);
      await writeAuditLog(
        db as any,
        actor.id,
        active ? 'TEAM_MEMBER_REACTIVATED' : 'TEAM_MEMBER_DEACTIVATED',
        `Equipe: ${m.name} (${m.email}) ${active ? 'reativado' : 'desativado'}`,
        m.status,
        next,
        false,
        true
      );
      return m.id;
    });
    return { member: await this.one(changedId) };
  }

  private async one(id: string) {
    const r = await this.pool.query(`SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`, [id]);
    return r.rows[0];
  }
}
