/**
 * NORQVA-0023: limita consultas ao Asaas por pagamento (tela do comprador e varredura).
 * Em memória: o backend roda em uma instância; numa reinicialização o pior caso é uma consulta a mais.
 */

const lastCheck = new Map<string, number>();

export function shouldCheckProvider(paymentId: string, minIntervalMs: number, now = Date.now()): boolean {
  const last = lastCheck.get(paymentId);
  if (last !== undefined && now - last < minIntervalMs) return false;
  lastCheck.set(paymentId, now);
  if (lastCheck.size > 5000) {
    for (const [id, t] of lastCheck) {
      if (now - t > 60 * 60 * 1000) lastCheck.delete(id);
    }
  }
  return true;
}

export function resetProviderCheckThrottle(): void {
  lastCheck.clear();
}

/** Corre a promessa com teto de tempo; no estouro, devolve undefined (quem chama segue sem esperar). */
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: any;
  const timeout = new Promise<undefined>(resolve => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
