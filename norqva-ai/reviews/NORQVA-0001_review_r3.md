# REVIEW R3 — NORQVA-0001 (Gate F, rodada 3)

**Revisor:** Claude · **Data:** 2026-09-27 · **Commit revisado:** `0a711a4` (`origin/ai/NORQVA-0001`, verificado no GitHub)

## STATUS: APPROVED_WITH_OBSERVATIONS — merge condicionado ao CI verde no PR

## Verificado no GitHub

- **Escopo limpo.** `git diff --name-only origin/main...origin/ai/NORQVA-0001` contém apenas arquivos autorizados e `norqva-ai/**`. UI/UX e pacote de auditoria saíram; o UI/UX está preservado localmente em `wip/uiux-1.0A`.
- **Números honestos.** O JSON bate com as saídas brutas: backend `21 failed | 622 passed | 1 skipped (644)`, frontend `1 failed | 198 passed (199)`. A falha nova do frontend foi declarada.
- **Código.** Itens 1–7 e as correções R1 estão corretos. O CAPI usa a versão da API do `MetaClient`, com fallback, então não derruba o Purchase.

## Por que as falhas locais não bloqueiam

As 21 falhas do backend e a do frontend não aparecem no CI do GitHub para a `main` (execução #107, verde). As causas vistas nas saídas brutas são de ambiente local: variáveis vazando entre arquivos de teste (`NODE_ENV=production`, `META_API_VERSION` exigido em "staging/production") e um `.env.production` local no frontend. **A prova oficial passa a ser o CI do PR.**

## Condições para o merge

1. **Abrir o PR** (o `gh` não está instalado; o operador abre pelo link de comparação) e **o CI precisa passar**.
2. **Item 8 não foi feito e não foi mencionado no JSON:** o backend ainda resolve `vitest 1.6.0` (`backend/node_modules/vitest` no lockfile). Subir `backend/package.json` para `"vitest": "^1.6.1"` e `"@vitest/coverage-v8": "^1.6.1"`, regenerar o lockfile e commitar no mesmo branch.
3. **Antes do deploy, na Render (operador):**
   - `CPF_CNPJ_HASH_SECRET` precisa existir. Desde o SEC-03, a API **não sobe** em produção sem ela; merge sem essa variável derruba o checkout.
   - `META_ACCESS_TOKEN` com permissão no pixel, e `META_PIXEL_ID`.
   - `META_API_VERSION` já deve existir, porque o sync atual depende dela. Confirmar.
4. As migrations 026 e 027 rodam no `preDeployCommand`. São só aditivas; mesmo assim, fazer backup do banco antes.

## Follow-up (tarefa separada, NORQVA-0002)

- Suíte local reproduzindo o CI: isolar `process.env` por arquivo (`vi.stubEnv` + `unstubAllEnvs`) e rodar contra Postgres de teste como o CI, não pg-mem. Meta: 0 falhas localmente.
- Checagem automática de escopo no CI (arquivos do PR × contrato).

## Nota de processo

Rodada 3 foi a primeira com evidência bruta e números reproduzíveis. Manter o padrão: nenhum número no JSON que não esteja num arquivo bruto do branch.
