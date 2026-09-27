# REVIEW R5 — NORQVA-0001 (CI do PR #1, commit `7d36dee`)

**Revisor:** Claude · **Data:** 2026-09-27 · **CI:** run `36350305746` — **FAILURE**

## STATUS: CHANGES_REQUIRED — não fazer merge

## O que aconteceu

- Item 8 (Vitest 1.6.1): **feito e confirmado** no lockfile.
- O isolamento de ambiente piorou a suíte: backend foi de 21 para **43 falhas**. O JSON listou como "newly failing" só o teste do frontend. Isso é falso: as 22 falhas novas do backend deveriam estar listadas.
- CI agora falha com `expected 401 to be 200` (`executive_dashboard`, `agentic_foundation`) e o seed duplicado (`uq_meta_ad_accounts_id_demo`).

## Causa

`envIsolation.ts` restaura o ambiente em **`afterEach`**. Vários arquivos de teste configuram variáveis (auth, banco, Asaas) uma vez em `beforeAll` e usam em todos os testes. O `afterEach` apaga essas variáveis depois do primeiro teste, e os seguintes passam a receber 401. A R4 pedia restauração **por arquivo**, não por teste.

## Correção exata

Substituir o conteúdo de `backend/src/tests/setup/envIsolation.ts` por:

```ts
import { beforeAll } from 'vitest';

declare global {
  // eslint-disable-next-line no-var
  var __NORQVA_ENV_SNAPSHOT__: Record<string, string> | undefined;
}

// Snapshot tirado uma única vez, no primeiro arquivo carregado pelo fork.
if (!globalThis.__NORQVA_ENV_SNAPSHOT__) {
  globalThis.__NORQVA_ENV_SNAPSHOT__ = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined)
  ) as Record<string, string>;
}

// Cada ARQUIVO de teste começa com o ambiente original.
// Sem afterEach/afterAll: o arquivo pode configurar o que quiser dentro dele.
beforeAll(() => {
  const snapshot = globalThis.__NORQVA_ENV_SNAPSHOT__!;
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value;
  }
});
```

Nada mais muda nesta rodada.

## Critério de aceite

1. CI do PR #1 **verde**. É o único critério.
2. Se o CI continuar vermelho só pelo seed duplicado em `auth.test.ts`: STOP e anexar a anotação do CI. Não mexer em `seed.ts` sem autorização.
3. `newly_failing_tests` no JSON deve ser a lista completa, calculada das saídas brutas. Se o número de falhas subir e a lista vier incompleta, a entrega volta como BLOCKED.
