import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { MetaSchedulerService, MetaSyncLock } from '../services/meta/metaSchedulerService';
import { MetaSyncService, MetaSyncResult } from '../services/meta/metaSyncService';
import { MetaClient } from '../services/meta/metaClient';

describe('GATE: META_AUTOMATED_SYNC_V1 — Automated Analytics Sync Suite', () => {
  let mockPool: any;
  let mockSyncService: any;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    MetaSchedulerService.resetInstance();

    // Mock Pool
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'mock-id' }] }),
      release: vi.fn()
    };
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(mockClient)
    };

    // Mock SyncService
    mockSyncService = {
      syncAll: vi.fn().mockResolvedValue({
        success: true,
        isDemo: false,
        adAccountsCount: 1,
        campaignsCount: 1,
        adSetsCount: 1,
        adsCount: 3,
        insightsCount: 4,
        syncedAt: new Date().toISOString()
      } as MetaSyncResult)
    };
  });

  afterEach(() => {
    MetaSchedulerService.resetInstance();
    process.env = { ...originalEnv };
  });

  it('1. Scheduler is disabled by default when META_AUTO_SYNC_ENABLED is absent or false', () => {
    delete process.env.META_AUTO_SYNC_ENABLED;
    const scheduler = new MetaSchedulerService(mockSyncService);
    scheduler.start(mockPool);

    const status = scheduler.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.nextMetaSync).toBeNull();
  });

  it('2. Scheduler enables when META_AUTO_SYNC_ENABLED=true and schedules next run with >= 60m interval', () => {
    process.env.META_AUTO_SYNC_ENABLED = 'true';
    process.env.META_AUTO_SYNC_INTERVAL_MINUTES = '60';

    const scheduler = new MetaSchedulerService(mockSyncService);
    scheduler.start(mockPool);

    const status = scheduler.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.intervalMinutes).toBe(60);
    expect(status.nextMetaSync).not.toBeNull();
    scheduler.stop();
  });

  it('3. Enforces minimum 60-minute interval when lower value is provided', () => {
    process.env.META_AUTO_SYNC_ENABLED = 'true';
    process.env.META_AUTO_SYNC_INTERVAL_MINUTES = '15'; // Attempted lower interval

    const scheduler = new MetaSchedulerService(mockSyncService);
    expect(scheduler.getIntervalMinutes()).toBe(60); // Clamped to 60
  });

  it('4. Single Execution Guard: skips second execution when sync is already active and logs SYNC_SKIPPED_ALREADY_RUNNING', async () => {
    const scheduler = new MetaSchedulerService(mockSyncService);
    (scheduler as any).pool = mockPool;

    // Simulate lock acquired by manual trigger
    const acquired = MetaSyncLock.tryAcquire('MANUAL');
    expect(acquired).toBe(true);
    expect(MetaSyncLock.getStatus().isLocked).toBe(true);

    // Try automatic execution while locked
    const result = await scheduler.executeSyncCycle({ trigger: 'AUTOMATIC' });

    expect('skipped' in result && result.skipped).toBe(true);
    expect('reason' in result && result.reason).toContain('SYNC_SKIPPED_ALREADY_RUNNING');

    // Verify audit log call for skipped execution
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['SYNC_SKIPPED_ALREADY_RUNNING'])
    );

    MetaSyncLock.release();
  });

  it('5. Failure Isolation: Graph API failure does not crash automatic scheduler cycle and records failure status', async () => {
    mockSyncService.syncAll.mockRejectedValue(new Error('Meta Graph API 500: Internal Server Error'));

    const scheduler = new MetaSchedulerService(mockSyncService);
    (scheduler as any).pool = mockPool;

    // Automatic execution should not throw unhandled exception
    const res = await scheduler.executeSyncCycle({ trigger: 'AUTOMATIC' });

    expect('skipped' in res && res.skipped).toBe(false);
    expect('reason' in res && res.reason).toContain('FAILED');

    const status = scheduler.getStatus();
    expect(status.lastMetaSyncStatus).toBe('FAILED');
    expect(status.lastErrorCode).toBe('META_SERVER_ERROR');
    expect(MetaSyncLock.getStatus().isLocked).toBe(false); // Lock released cleanly
  });

  it('6. Manual sync throws error on failure so API controller can return HTTP 500', async () => {
    mockSyncService.syncAll.mockRejectedValue(new Error('Authentication failed (code 190)'));

    const scheduler = new MetaSchedulerService(mockSyncService);
    (scheduler as any).pool = mockPool;

    await expect(scheduler.executeSyncCycle({ trigger: 'MANUAL' })).rejects.toThrow('Authentication failed');
    expect(MetaSyncLock.getStatus().isLocked).toBe(false);
  });

  it('7. Bounded Retry: Retries transient 429 rate-limit error and succeeds on subsequent attempt', async () => {
    let callCount = 0;
    mockSyncService.syncAll.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('[META API ERROR 429]: Rate limit reached');
      }
      return {
        success: true,
        isDemo: false,
        adAccountsCount: 1,
        campaignsCount: 1,
        adSetsCount: 1,
        adsCount: 3,
        insightsCount: 4,
        syncedAt: new Date().toISOString()
      };
    });

    const scheduler = new MetaSchedulerService(mockSyncService);
    (scheduler as any).pool = mockPool;

    const result = await scheduler.executeSyncCycle({ trigger: 'AUTOMATIC' });

    expect(callCount).toBe(2);
    expect('success' in result && result.success).toBe(true);
    expect(scheduler.getStatus().lastMetaSyncStatus).toBe('SUCCESS');
  });

  it('8. Bounded Retry: Stops retrying after maxRetries (2 retries / 3 total attempts) on persistent failure', async () => {
    let callCount = 0;
    mockSyncService.syncAll.mockImplementation(async () => {
      callCount++;
      throw new Error('[META API ERROR 503]: Service Unavailable');
    });

    const scheduler = new MetaSchedulerService(mockSyncService);
    (scheduler as any).pool = mockPool;

    const result = await scheduler.executeSyncCycle({ trigger: 'AUTOMATIC' });

    expect(callCount).toBe(3); // 1 initial + 2 retries
    expect(scheduler.getStatus().lastMetaSyncStatus).toBe('FAILED');
  });

  it('9. Observability & Secrets Protection: Sensitive tokens are scrubbed from error logs', async () => {
    mockSyncService.syncAll.mockRejectedValue(new Error('Meta error with access_token=EAAB123456789 and raw token EAAC987654321 in string'));

    const scheduler = new MetaSchedulerService(mockSyncService);
    (scheduler as any).pool = mockPool;

    await scheduler.executeSyncCycle({ trigger: 'AUTOMATIC' });

    const status = scheduler.getStatus();
    expect(status.lastMetaSyncStatus).toBe('FAILED');

    // Inspect the audit log query parameters
    const auditCalls = mockPool.query.mock.calls.filter((c: any) =>
      c[0] && typeof c[0] === 'string' && c[0].includes('INSERT INTO audit_logs')
    );

    expect(auditCalls.length).toBeGreaterThan(0);
    const auditParams = JSON.stringify(auditCalls);
    expect(auditParams).not.toContain('EAAB123456789');
    expect(auditParams).not.toContain('EAAC987654321');
    expect(auditParams).toContain('access_token=[REDACTED]');
    expect(auditParams).toContain('[REDACTED_TOKEN]');
  });

  it('10. Idempotency: Repeated successful executions update metrics without duplicating entity locks', async () => {
    const scheduler = new MetaSchedulerService(mockSyncService);
    (scheduler as any).pool = mockPool;

    // Run 1
    const res1 = await scheduler.executeSyncCycle({ trigger: 'AUTOMATIC' });
    expect('success' in res1 && res1.success).toBe(true);

    // Run 2
    const res2 = await scheduler.executeSyncCycle({ trigger: 'AUTOMATIC' });
    expect('success' in res2 && res2.success).toBe(true);

    const status = scheduler.getStatus();
    expect(status.lastMetaSyncStatus).toBe('SUCCESS');
    expect(status.lastCounts?.ads).toBe(3);
    expect(MetaSyncLock.getStatus().isLocked).toBe(false);
  });

  it('11. GATE: META_AD_INSIGHTS_INGESTION_FIX_V1 — syncAll requests both campaign and ad level insights', async () => {
    const mockClient = new MetaClient();
    const getInsightsSpy = vi.spyOn(mockClient, 'getInsights');

    const syncService = new MetaSyncService(mockClient);
    const result = await syncService.syncAll(mockPool, null, true);

    expect(result.success).toBe(true);
    expect(result.syncStatusSummary).toBe('SUCCESS_WITH_DATA');
    expect(getInsightsSpy).toHaveBeenCalledWith(
      expect.any(String),
      'campaign',
      undefined,
      true,
      expect.objectContaining({ since: expect.any(String), until: expect.any(String) }),
      1
    );
    expect(getInsightsSpy).toHaveBeenCalledWith(
      expect.any(String),
      'ad',
      undefined,
      true,
      expect.objectContaining({ since: expect.any(String), until: expect.any(String) }),
      1
    );
  });

  it('12. GATE: META_AD_INSIGHTS_INGESTION_FIX_V1 — syncAll distinguishes SUCCESS_WITH_DATA vs SUCCESS_EMPTY', async () => {
    const mockClient = new MetaClient();
    vi.spyOn(mockClient, 'getInsights').mockResolvedValue([]);

    const syncService = new MetaSyncService(mockClient);
    const result = await syncService.syncAll(mockPool, null, true);

    expect(result.success).toBe(true);
    expect(result.insightsCount).toBe(0);
    expect(result.syncStatusSummary).toBe('SUCCESS_EMPTY');
  });
});
