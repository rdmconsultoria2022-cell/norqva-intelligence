# NORQVA-0095: central de pendências (etapa 2 do Centro de Controle)

**Branch:** `ai/NORQVA-0095-central-pendencias` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** com o "sim" do Ricardo
**Autorização:** Ricardo, 16/10/2026 22h29 ("Sim" às etapas 1 e 2 do diagnóstico NORQVA-0093 no Claude Docs) · **Risco:** LOW (não altera nada na Meta)

## O que muda

- **Cada aviso explica o problema:** título, gravidade (Informativo, Atenção, Crítico), campanha e anúncio, data, ação recomendada e botão "Abrir campanha" (abre na aba que resolve: Resultado e controle ou Teto e vigia). Regras em `services/alerts/alertCenterService.ts` (`describeRule`), a partir do código de cada alerta já gravado: nenhum dado antigo é reclassificado.
- **Sino ≠ pendências:** o sino conta os avisos que a pessoa ainda não leu (tabela `ad_alert_reads`, por pessoa) e abre a central; o número em Campanhas e Operação conta só problemas abertos (Atenção ou Crítico, não resolvidos nem descartados). "Teto ampliado por lucro" e "80% do teto" são informativos e não contam como pendência.
- **Estados:** Novo, Visto (por pessoa), Em tratamento, Resolvido, Descartado. Ler não resolve. Resolver só com evidência; descartar é de propósito (crítico pede motivo) e fica no histórico.
- **Alertas do vigia agora se resolvem sozinhos com evidência:** leitura voltou, campanha pausada, teto subiu, plano encerrado (`guardResolution`, roda ao abrir a central).
- **Duplicados:** o mesmo problema aberto (regra + objeto) aparece uma vez.
- **Campanhas:** lista "Pendências" no topo com a ação e o atalho; o cartão mostra "N pendências".

## Rotas

`GET /api/alerts/center` (todos os perfis), `POST /api/alerts/read` e `/api/alerts/:id/read` (todos), `POST /api/alerts/:id/progress` e `/api/alerts/:id/dismiss` (Administrador e Performance). As rotas antigas (`/api/alerts`, `/ack`, `/evaluate`) continuam.

## Banco

Migration 071 (só aditiva): colunas `in_progress_*`, `dismissed_*`, `dismiss_reason` em `ad_alerts`; tabela `ad_alert_reads`.

## Fora

Novos tipos de aviso (crédito da Meta, falha de sincronização) entram depois, no mesmo formato.
