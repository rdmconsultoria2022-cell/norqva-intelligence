// NORQVA-0120 (contrato NORQVA-0118, etapa C): ajustes de publicação da campanha da Fábrica — conta pura, sem banco.
import { describe, it, expect, vi } from 'vitest';
import { toMetaTargeting, validateEndDate, endTimeFor, validateLaunchPlanInput, BR_STATES, LaunchPlanError } from '../services/launchPlans/launchPlanService';
import { audienceSummary, isCookbook } from '../services/launchPlans/generatedCampaignService';
import { MetaMutatingClient, OFFICIAL_NORQVA_PIXEL_ID } from '../services/meta/metaMutatingClient';

const base = { countries: ['BR'], age_min: 25, age_max: 65, advantage_audience: true };

describe('NORQVA-0120 — público para a Meta', () => {
  it('padrão de sempre não muda (Brasil, 25–65, Advantage)', () => {
    expect(toMetaTargeting(base)).toEqual({ geo_locations: { countries: ['BR'] }, age_min: 25, age_max: 65, targeting_automation: { advantage_audience: 1 } });
  });

  it('Advantage ligado: idade mínima de controle no máximo 25, máxima 65 e a faixa vai como sugestão', () => {
    expect(toMetaTargeting({ ...base, age_min: 45 })).toMatchObject({ age_min: 25, age_max: 65, age_range: [45, 65] });
    expect(toMetaTargeting({ ...base, age_min: 18, age_max: 40 })).toMatchObject({ age_min: 18, age_max: 65, age_range: [18, 40] });
  });

  it('Advantage desligado: idade travada, sem sugestão', () => {
    const t = toMetaTargeting({ ...base, age_min: 45, age_max: 60, advantage_audience: false });
    expect(t).toMatchObject({ age_min: 45, age_max: 60, targeting_automation: { advantage_audience: 0 } });
    expect(t.age_range).toBeUndefined();
  });

  it('estados, sexo e posicionamentos', () => {
    const t = toMetaTargeting({ ...base, regions: ['MG'], genders: 'MALE', placements: 'FACEBOOK_INSTAGRAM' }, { MG: '460' });
    expect(t).toMatchObject({ geo_locations: { regions: [{ key: '460' }] }, genders: [1], publisher_platforms: ['facebook', 'instagram'] });
    expect(t.geo_locations.countries).toBeUndefined();
    expect(() => toMetaTargeting({ ...base, regions: ['MG'] }, {})).toThrow(/Minas Gerais/);
  });

  it('27 estados com nome', () => {
    expect(Object.keys(BR_STATES)).toHaveLength(27);
    expect(BR_STATES.DF).toBe('Distrito Federal');
  });

  it('resumo do público', () => {
    expect(audienceSummary(base)).toBe('Brasil, 25–65, público Advantage');
    expect(audienceSummary({ ...base, age_min: 45, regions: ['MG'], genders: 'FEMALE' })).toBe('MG, 45–65 (sugestão), mulheres, público Advantage');
    expect(audienceSummary({ ...base, age_min: 45, advantage_audience: false, placements: 'FACEBOOK_INSTAGRAM' })).toBe('Brasil, 45–65, público fechado, só Facebook e Instagram');
    expect(isCookbook({ collection_key: 'trattoria' })).toBe(true);
    expect(isCookbook({ collection_key: null })).toBe(false);
  });
});

describe('NORQVA-0120 — data de término', () => {
  const now = new Date('2026-10-24T01:30:00Z'); // 23/10 22h30 em Brasília
  it('de amanhã até 1 ano, pelo dia de Brasília', () => {
    expect(validateEndDate('', 'x', now)).toBeNull();
    expect(validateEndDate('2026-10-24', 'x', now)).toBe('2026-10-24');
    expect(() => validateEndDate('2026-10-23', 'x', now)).toThrow(/depois de hoje/);
    expect(validateEndDate('2027-10-23', 'x', now)).toBe('2027-10-23');
    expect(() => validateEndDate('2027-10-24', 'x', now)).toThrow(/1 ano/);
    expect(() => validateEndDate('2026-02-30', 'x', now)).toThrow(LaunchPlanError);
    expect(endTimeFor('2026-11-30')).toBe('2026-11-30T23:59:00-0300');
  });

  it('conjunto do plano aceita end_date e os campos novos do público; estado fora do Brasil é recusado', () => {
    const plan = (adset: any) => ({
      code: 'T120-X',
      offer_human_id: 'OFF-000001',
      max_spend_brl: 300,
      question_text: 'Ativar a campanha T120?',
      spec: {
        campaign: { name: 'T120', objective: 'OUTCOME_SALES' },
        pixel_id: OFFICIAL_NORQVA_PIXEL_ID,
        adsets: [{ name: 'S1', daily_budget_brl: 30, ...adset }],
        ads: [{ name: 'A1', adset_name: 'S1', video_url: 'https://cdn.exemplo.com/v.mp4', primary_text: 'x', headline: 'y', cta: 'LEARN_MORE', destination_url: 'https://norqva-intelligence-frontend.vercel.app/p/OFF-000001', url_tags: 'utm_source=meta' }]
      }
    });
    const end = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const ok = validateLaunchPlanInput(plan({ end_date: end, targeting: { countries: ['BR'], age_min: 30, age_max: 65, regions: ['sp'], genders: 'ALL' } }));
    expect(ok.spec.adsets[0]).toMatchObject({ end_date: end, targeting: { regions: ['SP'] } });
    expect(ok.spec.adsets[0].targeting.genders).toBeUndefined();
    expect(() => validateLaunchPlanInput(plan({ targeting: { countries: ['PT'], age_min: 30, age_max: 65, regions: ['SP'] } }))).toThrow(/só valem para o Brasil/);
  });
});

describe('NORQVA-0120 — chaves dos estados na Meta (só leitura)', () => {
  it('confere nome e país exatos; sem estados, não pergunta nada', async () => {
    const get = vi.fn(async (endpoint: string, params: Record<string, string>) => {
      expect(endpoint).toBe('/search');
      expect(params).toMatchObject({ type: 'adgeolocation', country_code: 'BR' });
      if (params.q === 'São Paulo') return { data: [{ key: '1', name: 'São Paulo (cidade)', type: 'city', country_code: 'BR' }, { key: '472', name: 'Sao Paulo', type: 'region', country_code: 'BR' }] };
      return { data: [{ key: '99', name: 'Minas Gerais', type: 'region', country_code: 'PT' }] };
    });
    const client = new MetaMutatingClient(vi.fn() as any, undefined, get as any);
    expect(await client.resolveBrazilRegionKeys([], BR_STATES)).toEqual({});
    expect(get).not.toHaveBeenCalled();
    expect(await client.resolveBrazilRegionKeys(['SP', 'MG'], BR_STATES)).toEqual({ SP: '472' });
  });
});
