// Executado pelo Vitest antes de CADA arquivo de teste ser importado.
// Define o ambiente canônico de teste explicitamente, sem depender da ordem dos arquivos.

declare global {
  // eslint-disable-next-line no-var
  var __NORQVA_ENV_SNAPSHOT__: Record<string, string> | undefined;
}

if (!globalThis.__NORQVA_ENV_SNAPSHOT__) {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined)
  ) as Record<string, string>;
  // As suítes usam tokens HS256 de teste, válidos somente fora do modo real.
  // Suítes que testam o modo real (auth, auth_security_remediation, gate16_6g)
  // já definem AUTH_MODE='real' explicitamente dentro dos próprios testes.
  base.AUTH_MODE = 'demo';
  base.NODE_ENV = 'test';
  globalThis.__NORQVA_ENV_SNAPSHOT__ = base;
}

// Restaura no TOPO do módulo (antes do import do arquivo de teste), não em hooks.
{
  const snapshot = globalThis.__NORQVA_ENV_SNAPSHOT__!;
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value;
  }
}

export {};
