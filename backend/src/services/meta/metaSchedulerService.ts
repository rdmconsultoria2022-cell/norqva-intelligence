import { Pool } from 'pg';
import { MetaSyncService, MetaSyncResult } from './metaSyncService';
import { writeAuditLog } from '../../db/audit';

export interface MetaSchedulerStatus {
  enabled: boolean;
  intervalMinutes: number;
  isRunning: boolean;
  lastMetaSync: string | null;
  lastMetaSyncStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'IDLE';
  lastMetaSyncDurationMs: number | null;
  nextMetaSync: string | null;
  lastCounts?: {
    adAccounts: number;
    campaigns: number;
    adSets: number;
    ads: number;
    insights: number;
  } | null;
  lastErrorCode?: string | null;
}

export interface SyncCycleExecutionOptions {
  trigger: 'AUTOMATIC' | 'MANUAL';
  userId?: string | null;
  isDemo?: boolean;
}

export class MetaSyncLock {
  private static isLocked = false;
  private static currentTrigger: 'AUTOMATIC' | 'MANUAL' | null = null;
  private static lockedAt: number | null = null;

  public static tryAcquire(trigger: 'AUTOMATIC' | 'MANUAL'): boolean {
    // If locked for over 10 minutes (safety fallback), force release stale lock
    if (this.isLocked && this.lockedAt && Date.now() - this.lockedAt > 10 * 60 * 1000) {
      console.warn('[MetaSyncLock]: Stale lock detected (>10m). Force releasing lock.');
      this.release();
    }

    if (this.isLocked) {
      return false;
    }
    this.isLocked = true;
    this.currentTrigger = trigger;
    this.lockedAt = Date.now();
    return true;
  }

  public static release(): void {
    this.isLocked = false;
    this.currentTrigger = null;
    this.lockedAt = null;
  }

  public static getStatus(): { isLocked: boolean; currentTrigger: 'AUTOMATIC' | 'MANUAL' | null; lockedAt: number | null } {
    return {
      isLocked: this.isLocked,
      currentTrigger: this.currentTrigger,
      lockedAt: this.lockedAt
    };
  }
}

export class MetaSchedulerService {
  private static instance: MetaSchedulerService | null = null;
  private timer: NodeJS.Timeout | null = null;
  private pool: Pool | null = null;
  private syncService: MetaSyncService;

  private status: MetaSchedulerStatus = {
    enabled: false,
    intervalMinutes: 60,
    isRunning: false,
    lastMetaSync: null,
    lastMetaSyncStatus: 'IDLE',
    lastMetaSyncDurationMs: null,
    nextMetaSync: null,
    lastCounts: null,
    lastErrorCode: null
  };

  constructor(syncService?: MetaSyncService) {
    this.syncService = syncService || new MetaSyncService();
  }

  public static getInstance(syncService?: MetaSyncService): MetaSchedulerService {
    if (!MetaSchedulerService.instance) {
      MetaSchedulerService.instance = new MetaSchedulerService(syncService);
    }
    return MetaSchedulerService.instance;
  }

  public static resetInstance(): void {
    if (MetaSchedulerService.instance) {
      MetaSchedulerService.instance.stop();
      MetaSchedulerService.instance = null;
    }
    MetaSyncLock.release();
  }

  public getIntervalMinutes(): number {
    const raw = process.env.META_AUTO_SYNC_INTERVAL_MINUTES;
    const parsed = raw ? parseInt(raw, 10) : 60;
    // Enforce safe minimum of 60 minutes for this gate
    if (isNaN(parsed) || parsed < 60) {
      return 60;
    }
    return parsed;
  }

  public isEnabled(): boolean {
    return process.env.META_AUTO_SYNC_ENABLED === 'true';
  }

  public getStatus(): MetaSchedulerStatus {
    return {
      ...this.status,
      enabled: this.isEnabled(),
      intervalMinutes: this.getIntervalMinutes(),
      isRunning: MetaSyncLock.getStatus().isLocked
    };
  }

  public start(pool: Pool): void {
    this.pool = pool;
    const enabled = this.isEnabled();
    const intervalMinutes = this.getIntervalMinutes();

    this.status.enabled = enabled;
    this.status.intervalMinutes = intervalMinutes;

    if (!enabled) {
      console.log('[MetaSchedulerService]: META_AUTO_SYNC_ENABLED is not "true". Scheduler remains disabled.');
      return;
    }

    console.log(`[MetaSchedulerService]: Starting automated Meta analytics sync scheduler (Interval: ${intervalMinutes}m)...`);

    // Schedule next run
    this.scheduleNext(intervalMinutes);
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.status.nextMetaSync = null;
    console.log('[MetaSchedulerService]: Scheduler stopped.');
  }

  private scheduleNext(minutes: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const delayMs = minutes * 60 * 1000;
    const nextDate = new Date(Date.now() + delayMs);
    this.status.nextMetaSync = nextDate.toISOString();

    this.timer = setTimeout(async () => {
      try {
        await this.executeSyncCycle({ trigger: 'AUTOMATIC', isDemo: false });
      } catch (err: any) {
        console.error('[MetaSchedulerService]: Unhandled error during scheduled cycle (isolated):', err.message);
      } finally {
        if (this.isEnabled()) {
          this.scheduleNext(this.getIntervalMinutes());
        }
      }
    }, delayMs);

    // Unref timer so it does not block Node process exit in tests/shutdown
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  public async executeSyncCycle(options: SyncCycleExecutionOptions): Promise<MetaSyncResult | { skipped: boolean; reason: string }> {
    const { trigger, userId = null, isDemo = false } = options;
    const startTime = Date.now();
    const startedAt = new Date(startTime).toISOString();

    if (!this.pool) {
      const err = new Error('Database pool is not initialized in MetaSchedulerService.');
      this.recordFailure(startedAt, startTime, 'DB_POOL_NOT_INITIALIZED', err.message);
      throw err;
    }

    // Single Execution Guard
    const acquired = MetaSyncLock.tryAcquire(trigger);
    if (!acquired) {
      const lockState = MetaSyncLock.getStatus();
      const reason = `SYNC_SKIPPED_ALREADY_RUNNING (Active lock held by ${lockState.currentTrigger || 'ANOTHER_PROCESS'})`;
      console.warn(`[MetaSchedulerService]: ${reason}`);
      this.status.lastMetaSyncStatus = 'SKIPPED';
      
      if (this.pool) {
        await writeAuditLog(
          this.pool,
          userId,
          'SYNC_SKIPPED_ALREADY_RUNNING',
          `Sync triggered by ${trigger} skipped because a sync cycle is already active.`,
          null,
          null,
          isDemo,
          false
        ).catch(() => {});
      }

      return { skipped: true, reason };
    }

    try {
      // Execute sync with bounded retry
      const result = await this.executeWithRetry(this.pool, userId, isDemo);
      
      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;

      this.status.lastMetaSync = finishedAt;
      this.status.lastMetaSyncStatus = 'SUCCESS';
      this.status.lastMetaSyncDurationMs = durationMs;
      this.status.lastErrorCode = null;
      this.status.lastCounts = {
        adAccounts: result.adAccountsCount,
        campaigns: result.campaignsCount,
        adSets: result.adSetsCount,
        ads: result.adsCount,
        insights: result.insightsCount
      };

      console.log(`[MetaSchedulerService]: Sync cycle (${trigger}) completed successfully in ${durationMs}ms.`);
      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const sanitizedError = this.sanitizeErrorMessage(err.message || 'Unknown sync error');
      const errorCode = this.classifyErrorCode(err);

      this.recordFailure(startedAt, startTime, errorCode, sanitizedError);

      console.error(`[MetaSchedulerService]: Sync cycle (${trigger}) failed after ${durationMs}ms [${errorCode}]: ${sanitizedError}`);

      if (this.pool) {
        await writeAuditLog(
          this.pool,
          userId,
          'META_SYNC_FAILED',
          `Scheduler cycle failed: ${sanitizedError}`,
          errorCode,
          JSON.stringify({ durationMs, trigger }),
          isDemo,
          false
        ).catch(() => {});
      }

      // If manual trigger, propagate error so controller can return HTTP 500
      if (trigger === 'MANUAL') {
        throw new Error(sanitizedError);
      }

      // If automatic, isolate failure so worker and server stay alive
      return { skipped: false, reason: `FAILED: ${sanitizedError}` };
    } finally {
      MetaSyncLock.release();
    }
  }

  private async executeWithRetry(pool: Pool, userId: string | null, isDemo: boolean, maxRetries: number = 2): Promise<MetaSyncResult> {
    let attempt = 0;
    let lastErr: any = null;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        return await this.syncService.syncAll(pool, userId, isDemo);
      } catch (err: any) {
        lastErr = err;
        const isTransient = this.isTransientError(err);
        
        if (!isTransient || attempt > maxRetries) {
          throw err;
        }

        const backoffMs = attempt * 1000; // 1s, 2s bounded linear backoff
        console.warn(`[MetaSchedulerService]: Transient error on attempt ${attempt}/${maxRetries + 1}. Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    throw lastErr;
  }

  private isTransientError(err: any): boolean {
    const msg = String(err?.message || '').toLowerCase();
    // Transient status codes or network timeouts
    if (msg.includes('429') || msg.includes('rate limit')) return true;
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('aborterror')) return true;
    return false;
  }

  private classifyErrorCode(err: any): string {
    const msg = String(err?.message || '').toUpperCase();
    if (msg.includes('429') || msg.includes('RATE LIMIT')) return 'META_RATE_LIMIT';
    if (msg.includes('TIMEOUT') || msg.includes('ABORT')) return 'META_TIMEOUT';
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return 'META_SERVER_ERROR';
    if (msg.includes('AUTH') || msg.includes('TOKEN') || msg.includes('190')) return 'META_AUTH_ERROR';
    if (msg.includes('DB') || msg.includes('TRANSACTION')) return 'DATABASE_ERROR';
    return 'META_API_ERROR';
  }

  private sanitizeErrorMessage(msg: string): string {
    // Redact any possible token patterns or sensitive keys
    return msg
      .replace(/access_token=[^&\s]+/gi, 'access_token=[REDACTED]')
      .replace(/EA[A-Za-z0-9]+/g, '[REDACTED_TOKEN]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  }

  private recordFailure(startedAt: string, startTime: number, errorCode: string, sanitizedError: string): void {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    this.status.lastMetaSync = finishedAt;
    this.status.lastMetaSyncStatus = 'FAILED';
    this.status.lastMetaSyncDurationMs = durationMs;
    this.status.lastErrorCode = errorCode;
  }
}
