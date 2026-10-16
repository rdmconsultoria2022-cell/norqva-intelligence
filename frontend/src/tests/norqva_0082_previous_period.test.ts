import { describe, it, expect } from 'vitest';
import { previousPeriodOf, changePct, addDays, OPERATION_START } from '../features/dashboard/previousPeriod';

// NORQVA-0082: período anterior da Visão Geral segue a regra de datas do servidor (7d = hoje + 6 dias antes, fuso SP)
const NOW = new Date('2026-10-16T15:00:00-03:00');

describe('NORQVA-0082 período anterior', () => {
  it('usa a data de início da operação do D-0073', () => {
    expect(OPERATION_START).toBe('2026-09-25');
  });

  it('7 dias: compara com os 7 dias imediatamente antes', () => {
    const p = previousPeriodOf({ period: '7d' }, NOW);
    expect(p.query).toEqual({ period: 'custom', startDate: '2026-10-03', endDate: '2026-10-09' });
    expect(p.label).toBe('vs 03/10 a 09/10');
  });

  it('ontem: compara com anteontem', () => {
    const p = previousPeriodOf({ period: 'yesterday' }, NOW);
    expect(p.query).toEqual({ period: 'custom', startDate: '2026-10-14', endDate: '2026-10-14' });
  });

  it('30 dias antes do início das vendas: sem comparação', () => {
    const p = previousPeriodOf({ period: '30d' }, NOW);
    expect(p.query).toBeNull();
    expect(p.unavailableReason).toMatch(/25\/09/);
  });

  it('anterior cortado pelo início das vendas: sem comparação (tamanhos diferentes)', () => {
    const p = previousPeriodOf({ period: '7d' }, new Date('2026-10-05T12:00:00-03:00'));
    expect(p.query).toBeNull();
    expect(p.partial).toBe(true);
  });

  it('hoje e tudo: sem comparação', () => {
    expect(previousPeriodOf({ period: 'today' }, NOW).query).toBeNull();
    expect(previousPeriodOf({ period: 'all' }, NOW).query).toBeNull();
  });

  it('personalizado: mesmo número de dias, logo antes', () => {
    const p = previousPeriodOf({ period: 'custom', startDate: '2026-10-10', endDate: '2026-10-12' }, NOW);
    expect(p.query).toEqual({ period: 'custom', startDate: '2026-10-07', endDate: '2026-10-09' });
  });

  it('virada do dia em São Paulo (02h UTC ainda é o dia anterior)', () => {
    const p = previousPeriodOf({ period: 'yesterday' }, new Date('2026-10-17T02:00:00Z'));
    expect(p.query?.startDate).toBe('2026-10-14');
  });

  it('variação percentual sem base volta null', () => {
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(10, 0)).toBeNull();
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
  });
});
