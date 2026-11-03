import { describe, expect, it } from 'vitest';
import { pausedOnMeta } from '../features/campaigns/CampaignsView';

describe('NORQVA-0162: selo da campanha segue a Meta quando ela está parada', () => {
  it('plano ativo com campanha pausada na Meta usa a situação da Meta', () => {
    const mc = { status: 'PAUSED', effective_status: 'PAUSED' };
    expect(pausedOnMeta({ status: 'ACTIVE' }, mc)).toBe(mc);
    expect(pausedOnMeta({ status: 'APPROVED', activation_complete: true }, mc)).toBe(mc);
  });

  it('plano ativo com campanha ativa na Meta mantém o selo do plano', () => {
    expect(pausedOnMeta({ status: 'ACTIVE' }, { status: 'ACTIVE', effective_status: 'WITH_ISSUES' })).toBeNull();
  });

  it('sem leitura da Meta, mantém o selo do plano', () => {
    expect(pausedOnMeta({ status: 'ACTIVE' }, undefined)).toBeNull();
    expect(pausedOnMeta({ status: 'ACTIVE' }, { status: null })).toBeNull();
  });

  it('outros estados do plano não mudam', () => {
    expect(pausedOnMeta({ status: 'DRAFT' }, { status: 'PAUSED' })).toBeNull();
    expect(pausedOnMeta({ status: 'APPROVED' }, { status: 'PAUSED' })).toBeNull();
  });
});
