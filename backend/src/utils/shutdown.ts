import { Server } from 'http';
import { Pool } from 'pg';

export interface ShutdownOptions {
  timeoutMs?: number;
}

let isShuttingDown = false;

export function getIsShuttingDown(): boolean {
  return isShuttingDown;
}

export async function gracefulShutdown(
  server?: Server,
  pool?: Pool,
  options: ShutdownOptions = {}
): Promise<{ closedServer: boolean; closedPool: boolean; timedOut: boolean }> {
  const timeoutMs = options.timeoutMs || 10000;
  isShuttingDown = true;

  let closedServer = false;
  let closedPool = false;
  let timedOut = false;

  const shutdownWork = async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close((err) => {
          if (err) {
            console.error('[Shutdown] Error closing HTTP server:', err);
          } else {
            closedServer = true;
          }
          resolve();
        });
      });
    }

    if (pool) {
      try {
        await pool.end();
        closedPool = true;
      } catch (err) {
        console.error('[Shutdown] Error draining PostgreSQL pool:', err);
      }
    }
  };

  let timeoutHandle: any;
  const timeoutPromise = new Promise<void>((resolve) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      console.error(`[Shutdown] Force shutdown timeout exceeded (${timeoutMs}ms). Exiting.`);
      resolve();
    }, timeoutMs);
  });

  try {
    await Promise.race([shutdownWork(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
    isShuttingDown = false;
  }

  return { closedServer, closedPool, timedOut };
}

export function setupGracefulShutdown(server: Server, pool: Pool): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const handleSignal = async (signal: string) => {
    console.log(`[Shutdown] Received ${signal}. Starting graceful shutdown...`);
    await gracefulShutdown(server, pool);
    process.exit(0);
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));
}
