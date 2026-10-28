import { describe, it, expect, vi } from 'vitest';
import { aggregateSales } from '../services/salesAggregateService';

// Contract tests: query must aggregate without a visual LIMIT and retain
// eligibility, filters, and source separation. Integration tests with real
// PostgreSQL are still mandatory before approval.
describe('P1 sales aggregate query contract', () => {
  it('uses a full-history aggregate for 1001 paid orders', async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).not.toMatch(/LIMIT\s+500/i);
      expect(sql).toContain("data_provenance = 'COMMERCIAL_PRODUCTION'");
      expect(sql).toContain('UNION ALL');
      expect(params[2]).toBe(true);
      return { rows: [{ total:'1001',paid:'1001',pending:'0',problem:'0',revenue:'19919.90' }] };
    });
    const summary = await aggregateSales({query} as any, {
      isDemo:false,includeTests:false,filter:'ALL',startIso:null,endIso:null
    });
    expect(summary).toEqual({total:1001,paid:1001,pending:0,problem:0,revenue:19919.9});
  });

  it('preserves provider inclusion and PAID filter for mixed 600+600', async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("AND o.status = 'PAID'");
      expect(sql).toContain("AND e.status = 'PAID'");
      expect(sql).not.toMatch(/LIMIT\s+500/i);
      expect(params[2]).toBe(true);
      return { rows: [{total:'1200',paid:'1200',pending:'0',problem:'0',revenue:'23880.00'}] };
    });
    const summary = await aggregateSales({query} as any, {
      isDemo:false,includeTests:false,filter:'PAID',startIso:null,endIso:null
    });
    expect(summary.total).toBe(1200);
    expect(summary.revenue).toBe(23880);
  });

  it('excludes external records for pending and problem views', async () => {
    for (const filter of ['PENDING','PROBLEM'] as const) {
      const query = vi.fn(async (_sql: string, params: unknown[]) => {
        expect(params[2]).toBe(false);
        return {rows:[{total:'0',paid:'0',pending:'0',problem:'0',revenue:'0'}]};
      });
      await aggregateSales({query} as any,{
        isDemo:false,includeTests:false,filter,startIso:null,endIso:null
      });
    }
  });

  it('keeps DEMO isolated from commercial production', async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain("is_demo = TRUE");
      expect(sql).toContain("DEMO_SEED");
      return {rows:[{total:'0',paid:'0',pending:'0',problem:'0',revenue:'0'}]};
    });
    await aggregateSales({query} as any,{
      isDemo:true,includeTests:false,filter:'ALL',startIso:null,endIso:null
    });
  });
});
