import { afterEach, beforeAll, afterAll } from 'vitest';

declare global {
  // eslint-disable-next-line no-var
  var __NORQVA_ENV_SNAPSHOT__: NodeJS.ProcessEnv | undefined;
}

if (!globalThis.__NORQVA_ENV_SNAPSHOT__) {
  globalThis.__NORQVA_ENV_SNAPSHOT__ = { ...process.env };
}

function restoreEnv() {
  const snapshot = globalThis.__NORQVA_ENV_SNAPSHOT__;
  if (!snapshot) return;

  // Delete any keys added that were not in original snapshot
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  // Restore original snapshot values
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeAll(() => {
  restoreEnv();
});

afterAll(() => {
  restoreEnv();
});

afterEach(() => {
  restoreEnv();
});
