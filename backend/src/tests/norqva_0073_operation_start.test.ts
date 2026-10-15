// NORQVA-0073: os períodos começam no início da operação de vendas (OPERATION_START_DATE).
import { describe, it, expect, afterEach } from 'vitest';
import { resolvePeriodFilter, operationStartDate, DEFAULT_OPERATION_START_DATE } from '../utils/commercialTimezone';

const ORIGINAL = process.env.OPERATION_START_DATE;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.OPERATION_START_DATE;
  else process.env.OPERATION_START_DATE = ORIGINAL;
});

describe('NORQVA-0073: início da operação', () => {
  it('nos testes automáticos fica desligado sem a variável; "all" continua sem filtro', () => {
    delete process.env.OPERATION_START_DATE;
    expect(operationStartDate()).toBeNull();
    expect(resolvePeriodFilter('all')).toBeNull();
  });

  it('padrão de produção é 25/09/2026', () => {
    expect(DEFAULT_OPERATION_START_DATE).toBe('2026-09-25');
  });

  it('"Tudo" começa na data de início', () => {
    process.env.OPERATION_START_DATE = '2026-09-25';
    const all = resolvePeriodFilter('all')!;
    expect(all).not.toBeNull();
    expect(all.period).toBe('all');
    expect(all.metaStart).toBe('2026-09-25');
    // 25/09 00h00 em São Paulo = 03h00 UTC
    expect(all.startIso).toBe('2026-09-25T03:00:00.000Z');
  });

  it('período personalizado que começa antes é cortado no início', () => {
    process.env.OPERATION_START_DATE = '2026-09-25';
    const r = resolvePeriodFilter('custom', '2026-09-01', '2026-09-30')!;
    expect(r.metaStart).toBe('2026-09-25');
    expect(r.metaStop).toBe('2026-09-30');
  });

  it('período inteiro antes do início não conta nada (começo depois do fim)', () => {
    process.env.OPERATION_START_DATE = '2026-09-25';
    const r = resolvePeriodFilter('custom', '2026-09-01', '2026-09-10')!;
    expect(r.metaStart > r.metaStop).toBe(true);
    expect(new Date(r.startIso).getTime()).toBeGreaterThan(new Date(r.endIso).getTime());
  });

  it('período depois do início não muda', () => {
    process.env.OPERATION_START_DATE = '2026-09-25';
    const r = resolvePeriodFilter('custom', '2026-10-01', '2026-10-10')!;
    expect(r.metaStart).toBe('2026-10-01');
  });

  it('"off" desliga', () => {
    process.env.OPERATION_START_DATE = 'off';
    expect(operationStartDate()).toBeNull();
    expect(resolvePeriodFilter('all')).toBeNull();
  });
});
