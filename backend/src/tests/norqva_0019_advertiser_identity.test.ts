import { describe, it, expect } from 'vitest';
import { advertiserIdentityParams } from '../services/meta/metaMutatingClient';

describe('NORQVA-0019 — anunciante/pagador verificados no conjunto', () => {
  it('não adiciona nada sem as variáveis', () => {
    expect(advertiserIdentityParams({})).toEqual({});
  });

  it('envia universal_beneficiary/payer; pagador cai no anunciante se ausente', () => {
    expect(advertiserIdentityParams({ META_ADVERTISER_BENEFICIARY_ID: '123456789012' })).toEqual({
      regional_regulation_identities: { universal_beneficiary: '123456789012', universal_payer: '123456789012' }
    });
    expect(
      advertiserIdentityParams({ META_ADVERTISER_BENEFICIARY_ID: '111111', META_ADVERTISER_PAYER_ID: '222222', META_REGIONAL_REGULATED_CATEGORIES: '7, 9' })
    ).toEqual({
      regional_regulation_identities: { universal_beneficiary: '111111', universal_payer: '222222' },
      regional_regulated_categories: ['7', '9']
    });
  });

  it('recusa valores não numéricos (fail-closed)', () => {
    expect(() => advertiserIdentityParams({ META_ADVERTISER_BENEFICIARY_ID: 'RDMCONSULTORIA' })).toThrow('META CONFIG EXCEPTION');
    expect(() => advertiserIdentityParams({ META_ADVERTISER_BENEFICIARY_ID: '123456', META_REGIONAL_REGULATED_CATEGORIES: 'BRAZIL' })).toThrow('META CONFIG EXCEPTION');
  });
});
