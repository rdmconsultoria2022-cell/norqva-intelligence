# NORQVA-0088: Configurações (Marcas, Equipe, Configurações) e WhatsApp no Design System NORQVA Premium (fase 4, etapa 7)

**Branch:** `ai/NORQVA-0088-configuracoes-premium` (a partir da `main`, depois da NORQVA-0087)
**Executor:** Claude · **Revisão:** revisão independente (subagente) + CI · **Merge:** só com o "sim" do Ricardo depois das capturas
**Autorização:** Ricardo, 16/10/2026 19h43 ("Pode"). · **Risco:** LOW (só apresentação)

## Escopo

- Equipe e Configurações saíram do `App.tsx` para `features/settings/SettingsViews.tsx` (mesmas chamadas: `/meta/connection/status`, `/meta/connection/validate`, `/meta/sync`; mesmas condições, só ADMIN).
- Equipe: lista com iniciais, nome, e-mail e perfil em português.
- Configurações: Meta Ads como lista (conta, moeda e fuso, versão da API, última validação) e registro de auditoria em lista com hora de São Paulo.
- Marcas: título no padrão; campo de nova marca maior.
- WhatsApp: título e abas em botões; filtros de conversa que deslizam; no celular, a lista some quando uma conversa está aberta (botão Voltar); bolhas e botões no padrão.

## Correções de exibição

- Equipe mostrava "Status: ACTIVE" fixo para todos: removido.
- Configurações mostrava "NODE_ENV development" e "PostgreSQL" fixos (não vinham do servidor): removidos.
- Moeda e fuso apareciam como "BRL (America/Sao_Paulo)" mesmo sem resposta da Meta: agora "—".

## Testes

`auth.test.tsx`: título "Equipe e permissões" em letras normais.
