import { MetaSchedulerService } from './metaSchedulerService';
import { getCommercialTimeBoundaries } from '../../utils/commercialTimezone';

// NORQVA-0017: import the account history in 30-day windows (daily rows), newest first.
// Runs in the background; the UI polls the status. One backfill at a time.

export interface BackfillWindow {
  since: string;
  until: string;
}

export interface BackfillState {
  running: boolean;
  days: number;
  windows: number;
  done: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  current: BackfillWindow | null;
}

export const MAX_BACKFILL_DAYS = 730;
export const WINDOW_DAYS = 30;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Windows covering [today - days + 1, today], newest first, each at most WINDOW_DAYS long. */
export function backfillWindows(days: number, today: string): BackfillWindow[] {
  const n = Math.max(1, Math.min(MAX_BACKFILL_DAYS, Math.floor(days)));
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (n - 1));
  const out: BackfillWindow[] = [];
  let until = new Date(end);
  while (until >= start) {
    const since = new Date(until);
    since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1));
    const s = since < start ? start : since;
    out.push({ since: iso(s), until: iso(until) });
    until = new Date(s);
    until.setUTCDate(until.getUTCDate() - 1);
  }
  return out;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/** Graph throttling: 17 (user limit), 4 (app limit), 32 (page limit), 613, 80000-80014 (ads insights / business use case). */
export function isRateLimit(msg: string): boolean {
  return /request limit|too many calls|rate limit|error 17\b|error 4\b|error 32\b|error 613\b|error 800\d\d|ERROR (17|4|32|613)\]/i.test(msg);
}

type SyncRunner = (w: BackfillWindow) => Promise<{ skipped?: boolean; success?: boolean; error?: string } | any>;

export class MetaBackfillService {
  private static state: BackfillState = {
    running: false, days: 0, windows: 0, done: 0, failed: 0, startedAt: null, finishedAt: null, lastError: null, current: null
  };

  static status(): BackfillState {
    return { ...this.state };
  }

  static resetForTesting() {
    this.state = { running: false, days: 0, windows: 0, done: 0, failed: 0, startedAt: null, finishedAt: null, lastError: null, current: null };
  }

  /** Starts the backfill; returns false when one is already running. The promise resolves when it ends. */
  static start(
    days: number,
    userId: string | null,
    runner?: SyncRunner,
    opts: { paceMs?: number; rateLimitWaitMs?: number } = {}
  ): { started: boolean; done: Promise<void> } {
    const paceMs = opts.paceMs ?? 5000;
    const rateWait = opts.rateLimitWaitMs ?? 90000;
    if (this.state.running) return { started: false, done: Promise.resolve() };
    const today = getCommercialTimeBoundaries('today').dateStopMeta;
    const windows = backfillWindows(days, today);
    const run: SyncRunner =
      runner ||
      (w =>
        MetaSchedulerService.getInstance().executeSyncCycle({
          trigger: 'MANUAL',
          userId,
          isDemo: false,
          syncOptions: { timeRange: { since: w.since, until: w.until } }
        }));
    this.state = {
      running: true, days: Math.min(MAX_BACKFILL_DAYS, Math.floor(days)), windows: windows.length, done: 0, failed: 0,
      startedAt: new Date().toISOString(), finishedAt: null, lastError: null, current: null
    };
    const done = (async () => {
      for (const w of windows) {
        this.state.current = w;
        let attempts = 0;
        // A regular sync may hold the lock; Meta may throttle (error 17/4/613). Wait and retry.
        while (true) {
          attempts++;
          let r: any;
          let errMsg: string | null = null;
          try {
            r = await run(w);
          } catch (err: any) {
            errMsg = String(err?.message || err).slice(0, 300);
          }
          if (!errMsg && r && r.skipped && attempts < 6) {
            await sleep(20000);
            continue;
          }
          const msg = errMsg || (r && (r.skipped || r.success === false) ? String(r.error || r.reason || 'janela ignorada') : null);
          if (msg && isRateLimit(msg) && attempts < 5) {
            this.state.lastError = `Limite da Meta atingido; aguardando para tentar de novo (${attempts}/4).`;
            await sleep(rateWait * attempts);
            continue;
          }
          if (msg) {
            this.state.failed++;
            this.state.lastError = msg.slice(0, 300);
          } else {
            this.state.done++;
          }
          break;
        }
        if (paceMs > 0) await sleep(paceMs);
      }
      this.state.running = false;
      this.state.current = null;
      this.state.finishedAt = new Date().toISOString();
    })();
    return { started: true, done };
  }
}
