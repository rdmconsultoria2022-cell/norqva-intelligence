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
