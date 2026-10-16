import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { DEMO_MODE_ENABLED } from '../../lib/demoMode';

// NORQVA-0088: Equipe e Configurações saíram do App.tsx para cá, no padrão NORQVA Premium.
// Mesmas chamadas (/meta/connection/status, /meta/connection/validate, /meta/sync) e mesmas condições (só ADMIN).

// 8. Team (Equipe) Subcomponent
export function TeamView({ users }: any) {
  // NORQVA-0088: lista no padrão NORQVA Premium. Só apresentação; perfil vem do cadastro.
  const ROLE: Record<string, string> = { ADMIN: 'Administrador', OPERATIONS: 'Operações', PERFORMANCE: 'Performance', INTELLIGENCE: 'Inteligência', PRODUCT: 'Produto' };
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight text-nq-text">Equipe e permissões</h1>
        <p className="mt-1 text-nq-aux text-nq-muted">Quem acessa o NORQVA e o perfil de cada pessoa. O perfil define o que cada um pode ver e alterar.</p>
      </div>
      {users.length === 0 ? (
        <div className="rounded-nq bg-nq-surface p-8 text-center text-nq-aux text-nq-muted">Nenhum usuário cadastrado.</div>
      ) : (
        <ul className="rounded-nq bg-nq-surface divide-y divide-nq-line/70 overflow-hidden">
          {users.map((user: any) => (
            <li key={user.id} className="flex items-center gap-3 px-4 py-3.5 min-h-[64px]">
              <div className="h-10 w-10 rounded-full bg-nq-raised flex items-center justify-center shrink-0 text-nq-aux font-semibold text-nq-text" aria-hidden="true">
                {String(user.name || '?').trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-nq-body font-medium text-nq-text break-words">{user.name}</div>
                <div className="text-nq-caption text-nq-muted break-all">{user.email}</div>
              </div>
              <span className="shrink-0 text-right">
                <span className="block text-nq-caption font-medium text-nq-muted">{ROLE[user.role] || user.role}</span>
                {user.status && user.status !== 'ACTIVE' && (
                  <span className="block text-nq-caption text-nq-attention">{user.status === 'INACTIVE' ? 'Inativo' : String(user.status).toLowerCase()}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 9. Config (Configurações) Subcomponent
export function ConfigView({ isDemoView, currentUser, auditLogs, apiFetch, showError, showSuccess, onClearDemo }: any) {
  const isAdmin = currentUser.role === 'ADMIN';
  const [metaStatus, setMetaStatus] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchMetaStatus = async () => {
    if (!isAdmin) return;
    try {
      const mode = isDemoView ? 'demo' : 'real';
      const res = await apiFetch(`/meta/connection/status?mode=${mode}`, {}, mode, currentUser);
      setMetaStatus(res);
    } catch (e) {
      console.error('Meta status fetch error:', e);
    }
  };

  useEffect(() => {
    fetchMetaStatus();
  }, [isDemoView]);

  const handleValidateConnection = async () => {
    setIsValidating(true);
    try {
      const mode = isDemoView ? 'demo' : 'real';
      const res = await apiFetch(`/meta/connection/validate?mode=${mode}`, { method: 'POST' }, mode, currentUser);
      if (res.success) {
        showSuccess('Conexão com a Meta validada com sucesso!');
      } else {
        showError(res.error || 'Falha ao validar conexão com a Meta.');
      }
      await fetchMetaStatus();
    } catch (err: any) {
      showError(err.message || 'Erro ao validar conexão com a Meta.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSyncMeta = async () => {
    setIsSyncing(true);
    try {
      const mode = isDemoView ? 'demo' : 'real';
      const res = await apiFetch(`/meta/sync?mode=${mode}`, { method: 'POST' }, mode, currentUser);
      showSuccess(res.message || 'Sincronização de aquisição concluída!');
      await fetchMetaStatus();
    } catch (err: any) {
      showError(err.message || 'Erro durante a sincronização Meta.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight text-nq-text">Configurações</h1>
        <p className="mt-1 text-nq-aux text-nq-muted">Conexão com a Meta e o registro de auditoria do sistema.</p>
      </div>

      {!isAdmin && (
        <div className="rounded-nq bg-nq-surface p-6 text-nq-aux text-nq-muted">Somente administradores alteram as configurações.</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Meta Integration (ADMIN only) */}
        {isAdmin && (
          <section className="space-y-3" aria-labelledby="cfg-meta">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 id="cfg-meta" className="text-nq-section font-semibold text-nq-text">Meta Ads</h2>
              <span className={`inline-flex items-center gap-1.5 text-nq-caption font-medium ${metaStatus?.connected ? 'text-nq-positive-text' : 'text-nq-muted'}`}>
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${metaStatus?.connected ? 'bg-nq-positive' : 'bg-nq-subtle'}`} />
                {metaStatus?.connected ? 'Conectado' : 'Não conectado'}
              </span>
            </div>
            <div className="rounded-nq bg-nq-surface overflow-hidden">
              <dl className="divide-y divide-nq-line/70 text-nq-aux">
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <dt className="text-nq-muted">Conta de anúncios</dt>
                  <dd className="text-nq-text text-right break-all">{metaStatus?.adAccountIdMasked || 'Não configurada'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <dt className="text-nq-muted">Moeda e fuso</dt>
                  <dd className="text-nq-text text-right">{metaStatus ? `${metaStatus.currency || '—'} · ${metaStatus.timezone || '—'}` : '—'}</dd>
                </div>
                {metaStatus?.apiVersion && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <dt className="text-nq-muted">Versão da API</dt>
                    <dd className="text-nq-text text-right">Graph API {metaStatus.apiVersion}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <dt className="text-nq-muted">Última validação</dt>
                  <dd className="text-nq-text text-right">
                    {metaStatus?.lastValidatedAt ? new Date(metaStatus.lastValidatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Nunca'}
                  </dd>
                </div>
              </dl>
              <div className="flex gap-2 p-4 pt-1">
                <button
                  onClick={handleValidateConnection}
                  disabled={isValidating}
                  className="flex-1 min-h-[44px] px-4 rounded-full bg-nq-raised text-nq-text text-nq-aux font-semibold hover:brightness-110 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
                  {isValidating ? 'Validando...' : 'Validar conexão'}
                </button>
                <button
                  onClick={handleSyncMeta}
                  disabled={isSyncing}
                  className="flex-1 min-h-[44px] px-4 rounded-full bg-nq-positive text-nq-on-positive text-nq-aux font-semibold hover:brightness-110 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Atualizando...' : 'Atualizar dados da Meta'}
                </button>
              </div>
            </div>

            {DEMO_MODE_ENABLED && (
              <div className="rounded-nq bg-nq-critical/10 p-4 space-y-3">
                <h3 className="text-nq-aux font-semibold text-nq-critical-text">Zona de perigo</h3>
                <button
                  onClick={onClearDemo}
                  className="w-full min-h-[44px] px-4 rounded-full bg-nq-critical/15 text-nq-critical-text hover:bg-nq-critical/25 text-nq-aux font-semibold flex items-center justify-center gap-1.5"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  Limpar toda a base de demonstração
                </button>
                <p className="text-nq-caption text-nq-muted text-center">
                  Exclui apenas registros com is_demo = true. Dados reais de produção são preservados.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Audit Log (ADMIN only) */}
        {isAdmin && (
          <section className="space-y-3" aria-labelledby="cfg-audit">
            <h2 id="cfg-audit" className="px-1 text-nq-section font-semibold text-nq-text">Registro de auditoria</h2>
            <div className="rounded-nq bg-nq-surface max-h-[28rem] overflow-y-auto custom-scrollbar">
              {auditLogs.length === 0 ? (
                <div className="text-nq-aux text-nq-muted text-center py-8">Nenhum evento auditado.</div>
              ) : (
                <ul className="divide-y divide-nq-line/70">
                  {auditLogs.map((log: any) => (
                    <li key={log.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-nq-caption font-semibold text-nq-text break-all">{log.event_type}</span>
                        <span className="shrink-0 text-nq-caption text-nq-subtle">
                          {new Date(log.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-nq-aux text-nq-muted break-words">{log.description}</p>
                      {log.previous_value && log.new_value && (
                        <div className="text-nq-caption text-nq-subtle truncate">
                          Antes: {log.previous_value.substring(0, 45)}… · Depois: {log.new_value.substring(0, 45)}…
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
