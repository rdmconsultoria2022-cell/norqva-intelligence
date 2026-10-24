import { Pool } from 'pg';
import { isDbInMemory } from '../../db/db';

// NORQVA-0118: trava por plano no banco (pg_advisory_lock). Quem mexe na situação da campanha de um plano
// pela automação (pausa noturna reativando, vigia do teto pausando/marcando CAPPED, registro de pausa pela
// tela) passa por aqui, para uma decisão não atropelar a outra. Vale entre instâncias do servidor.
// No pg-mem (testes locais sem Postgres) não há advisory lock: roda sem a trava.

const LOCK_NAMESPACE = 118;

export async function withPlanLock<T>(pool: Pool, planId: string, fn: () => Promise<T>): Promise<T> {
  if (isDbInMemory()) return fn();
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock($1, hashtext($2))', [LOCK_NAMESPACE, String(planId)]);
    locked = true;
    return await fn();
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1, hashtext($2))', [LOCK_NAMESPACE, String(planId)]).catch(() => {});
    }
    client.release();
  }
}
