# NORQVA-0092: gestão da Equipe (convidar, editar, desativar)

**Branch:** `ai/NORQVA-0092-gestao-equipe` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 16/10/2026 22h06 ("Aprovado"), contrato no Claude Docs "NORQVA-0092 — Contrato: Gestão da Equipe" · **Risco:** MEDIUM (controle de acesso)

## Escopo

- Equipe (só ADMIN na conta real): convidar por e-mail (nome, e-mail, perfil), reenviar ou cancelar convite, editar nome e perfil, desativar e reativar.
- Convite: cadastro ACTIVE sem `auth_user_id` + `POST /auth/v1/invite` do Supabase com volta para `/reset-password` (a pessoa cria a senha na tela "Definir Nova Senha"). O primeiro login liga o cadastro pelo e-mail (middleware já existente). Se o Supabase recusar, o cadastro recém-criado é desfeito.
- Ninguém é apagado: desativar = `status = 'INACTIVE'` (o middleware já bloqueia na próxima chamada).
- Travas no servidor: só ADMIN; ninguém desativa a si mesmo nem tira o próprio ADMIN; nunca fica sem ADMIN ativo. Confirmação na tela para desativar e trocar perfil.
- Histórico: `TEAM_MEMBER_INVITED`, `TEAM_INVITE_RESENT`, `TEAM_MEMBER_UPDATED` (antes e depois), `TEAM_MEMBER_DEACTIVATED`, `TEAM_MEMBER_REACTIVATED`.
- Migration 069 só aditiva: `invited_at`, `invited_by`, `updated_at`, `updated_by` em `users`.

## Rotas

`GET /api/team`, `POST /api/team/invite`, `POST /api/team/:id/resend-invite`, `PATCH /api/team/:id`, `POST /api/team/:id/deactivate`, `POST /api/team/:id/reactivate` (todas `requireRole(['ADMIN'])`).

## Regras

Testes com o convite simulado (`setInviteSenderForTests`): nunca falam com o Supabase. Perfis e permissões de cada perfil não mudam.
