import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { getDB, resetPool } from '../db/db';
import { runMigrations } from '../db/migrations';
import {
  calculateContentHash,
  calculateContentFingerprint,
  RawAdLibraryPayload
} from '../services/marketIntelligence/marketDiscoveryProvider';
import { MetaAdLibraryProvider } from '../services/marketIntelligence/metaAdLibraryProvider';
import { MarketIngestionService } from '../services/marketIntelligence/marketIngestionService';

describe('NORQVA — Meta Ad Library Discovery & Ingestion Test Suite', () => {
  let pool: Pool;
  let provider: MetaAdLibraryProvider;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    pool = await getDB();
    await runMigrations(pool);
    provider = new MetaAdLibraryProvider('test_access_token');
  });

  afterAll(async () => {
    resetPool();
  });

  // 1. Content Hash & Determinism
  it('1. should compute deterministic SHA-256 evidence content_hash invariant to key insertion order', () => {
    const payloadA = { id: 'AD_1001', page_name: 'Trattoria Competitor', primary_text: 'Receitas italianas exclusivas' };
    const payloadB = { primary_text: 'Receitas italianas exclusivas', page_name: 'Trattoria Competitor', id: 'AD_1001' };

    const hashA = calculateContentHash(payloadA);
    const hashB = calculateContentHash(payloadB);

    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64);
  });

  // 2. Content Fingerprint Calculation
  it('2. should compute deterministic content fingerprint to detect copy and URL alterations', () => {
    const fp1 = calculateContentFingerprint({
      primary_text: 'Aprenda massas artesanais do zero',
      headline: 'Curso de Culinária Italiana',
      description: 'Acesso vitalício com certificado',
      cta: 'Saiba mais',
      destination_url: 'https://exemplo.com/curso-massas'
    });

    const fp2 = calculateContentFingerprint({
      primary_text: 'Aprenda massas artesanais do zero',
      headline: 'Curso de Culinária Italiana',
      description: 'Acesso vitalício com certificado',
      cta: 'SAIBA MAIS',
      destination_url: 'https://exemplo.com/curso-massas'
    });

    const fp3Changed = calculateContentFingerprint({
      primary_text: 'NOVA COPY: Aprenda massas italianas hoje',
      headline: 'Curso de Culinária Italiana',
      description: 'Acesso vitalício com certificado',
      cta: 'SAIBA MAIS',
      destination_url: 'https://exemplo.com/curso-massas'
    });

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3Changed);
  });

  // 3. Normalization of Complete Ad Payload
  it('3. should normalize raw Meta Ad Library payload preserving raw data and assigning correct types', () => {
    const rawPayload: RawAdLibraryPayload = {
      id: 'META_AD_998877',
      page_id: 'PAGE_123456',
      page_name: 'Culinária Em Casa BR',
      ad_creation_time: '2026-09-20T10:00:00Z',
      ad_delivery_start_time: '2026-09-20T10:00:00Z',
      ad_snapshot_url: 'https://www.facebook.com/ads/archive/render_ad/?id=META_AD_998877',
      ad_creative_bodies: ['Descubra o segredo do molho perfeito e da massa fresca.'],
      ad_creative_link_titles: ['Ebook de Massas Italianas'],
      ad_creative_link_descriptions: ['Guia passo a passo com fotos ilustradas.'],
      publisher_platforms: ['FACEBOOK', 'INSTAGRAM'],
      destination_url: 'https://culinariaemcasa.com.br/ebook-massas',
      cta_text: 'COMPRAR_AGORA',
      media_type: 'VIDEO',
      observed_price: '29.90'
    };

    const item = provider.normalizeItem(rawPayload, 'OPERATOR_ASSISTED');

    expect(item.evidence.source_type).toBe('META_AD_LIBRARY_WEB');
    expect(item.evidence.capture_method).toBe('OPERATOR_ASSISTED');
    expect(item.evidence.content_hash).toHaveLength(64);
    expect(item.evidence.captured_payload).toEqual(rawPayload);

    expect(item.advertiser.page_id).toBe('PAGE_123456');
    expect(item.advertiser.page_name).toBe('Culinária Em Casa BR');
    expect(item.advertiser.country).toBe('BR');

    expect(item.ad.ad_library_id).toBe('META_AD_998877');
    expect(item.ad.primary_text).toBe('Descubra o segredo do molho perfeito e da massa fresca.');
    expect(item.ad.headline).toBe('Ebook de Massas Italianas');
    expect(item.ad.active_status).toBe('ACTIVE');
    expect(item.ad.ad_start_date).toBe('2026-09-20');

    expect(item.observation.observed_status).toBe('ACTIVE');
    expect(item.observation.content_fingerprint).toHaveLength(64);

    expect(item.creative?.creative_type).toBe('VIDEO');
    expect(item.creative?.hook_text).toBeNull();
    expect(item.creative?.angle).toBeNull();

    expect(item.offer).not.toBeNull();
    expect(item.offer?.destination_url).toBe('https://culinariaemcasa.com.br/ebook-massas');
    expect(item.offer?.observed_price).toBe(29.90);
  });

  // 4. Missing Fields & Zero Inventions
  it('4. should handle missing fields cleanly with NULLs and zero invented metrics', () => {
    const sparsePayload: RawAdLibraryPayload = {
      id: 'META_AD_SPARSE_001',
      page_id: 'PAGE_SPARSE_001',
      page_name: 'Anunciante Sem Destino'
    };

    const item = provider.normalizeItem(sparsePayload, 'MANUAL_AUDIT');

    expect(item.ad.primary_text).toBeNull();
    expect(item.ad.headline).toBeNull();
    expect(item.ad.description).toBeNull();
    expect(item.ad.cta).toBeNull();
    expect(item.ad.destination_url).toBeNull();
    expect(item.ad.ad_start_date).toBeNull();
    expect(item.offer).toBeNull();
  });

  // 5. Fail-Closed on Official API Blocking
  it('5. should fail-closed and report OFFICIAL_AD_LIBRARY_ACCESS_BLOCKED on unauthorized API access', async () => {
    const health = await provider.healthCheck();
    expect(health.status).toBe('OFFICIAL_AD_LIBRARY_ACCESS_BLOCKED');
    expect(health.message).toContain('bloqueado');
  });

  // 6. Transactional Ingestion into Real PostgreSQL Tables
  it('6. should ingest normalized discovery items into the 7 market_* tables', async () => {
    const rawPayload: RawAdLibraryPayload = {
      id: 'META_AD_REAL_001',
      page_id: 'PAGE_BR_001',
      page_name: 'Gastronomia Nobre',
      ad_creation_time: '2026-09-24T00:00:00Z',
      ad_snapshot_url: 'https://facebook.com/ads/archive/render_ad/?id=META_AD_REAL_001',
      ad_creative_bodies: ['Massa artesanal em casa com ingredientes simples.'],
      ad_creative_link_titles: ['Masterclass Massas'],
      publisher_platforms: ['INSTAGRAM'],
      destination_url: 'https://gastronomianobre.com/masterclass',
      cta_text: 'SAIBA_MAIS',
      media_type: 'IMAGE',
      observed_price: '47.00'
    };

    const item = provider.normalizeItem(rawPayload, 'OPERATOR_ASSISTED');
    const ingestionResult = await MarketIngestionService.ingestItems(pool, [item]);

    expect(ingestionResult.evidenceCreated).toBe(1);
    expect(ingestionResult.advertisersCreated).toBe(1);
    expect(ingestionResult.adsCreated).toBe(1);
    expect(ingestionResult.observationsCreated).toBe(1);
    expect(ingestionResult.offersCreated).toBe(1);
    expect(ingestionResult.creativesCreated).toBe(1);

    const evRows = await pool.query('SELECT * FROM market_evidence WHERE content_hash = $1', [item.evidence.content_hash]);
    expect(evRows.rows).toHaveLength(1);
    expect(evRows.rows[0].content_hash).toBe(item.evidence.content_hash);

    const advRows = await pool.query('SELECT * FROM market_advertisers WHERE page_id = $1', ['PAGE_BR_001']);
    expect(advRows.rows).toHaveLength(1);
    expect(advRows.rows[0].page_id).toBe('PAGE_BR_001');

    const adRows = await pool.query('SELECT * FROM market_ads WHERE ad_library_id = $1', ['META_AD_REAL_001']);
    expect(adRows.rows).toHaveLength(1);
    expect(adRows.rows[0].ad_library_id).toBe('META_AD_REAL_001');

    const obsRows = await pool.query('SELECT * FROM market_observations WHERE ad_id = $1', [adRows.rows[0].id]);
    expect(obsRows.rows).toHaveLength(1);
    expect(obsRows.rows[0].observed_status).toBe('ACTIVE');

    const offRows = await pool.query('SELECT * FROM market_offers WHERE advertiser_id = $1', [advRows.rows[0].id]);
    expect(offRows.rows).toHaveLength(1);
    expect(offRows.rows[0].destination_url).toBe('https://gastronomianobre.com/masterclass');

    const crRows = await pool.query('SELECT * FROM market_creatives WHERE ad_id = $1', [adRows.rows[0].id]);
    expect(crRows.rows).toHaveLength(1);
    expect(crRows.rows[0].creative_type).toBe('IMAGE');
  });

  // 7. Double-Run Idempotency (Zero Duplicates)
  it('7. should achieve 100% idempotency on repeated ingestion of the same sample', async () => {
    const rawPayload: RawAdLibraryPayload = {
      id: 'META_AD_IDEMP_001',
      page_id: 'PAGE_IDEMP_001',
      page_name: 'Pizzaiolo Express',
      ad_creation_time: '2026-09-24T00:00:00Z',
      ad_creative_bodies: ['Aprenda pizza napolitana em casa.'],
      ad_creative_link_titles: ['Curso Pizza Napolitana'],
      destination_url: 'https://pizzaioloexpress.com.br/curso',
      cta_text: 'COMPRAR',
      media_type: 'VIDEO'
    };

    const item1 = provider.normalizeItem(rawPayload, 'OPERATOR_ASSISTED');

    // Run 1
    const res1 = await MarketIngestionService.ingestItems(pool, [item1]);
    expect(res1.evidenceCreated).toBe(1);
    expect(res1.adsCreated).toBe(1);
    expect(res1.observationsCreated).toBe(1);

    // Run 2 (Identical payload)
    const item2 = provider.normalizeItem(rawPayload, 'OPERATOR_ASSISTED');
    const res2 = await MarketIngestionService.ingestItems(pool, [item2]);

    expect(res2.evidenceCreated).toBe(0);
    expect(res2.adsCreated).toBe(0);
    expect(res2.observationsCreated).toBe(0);
    expect(res2.duplicatesSkipped.evidence).toBe(1);
    expect(res2.duplicatesSkipped.ads).toBe(1);
    expect(res2.duplicatesSkipped.observations).toBe(1);

    const evCount = await pool.query('SELECT COUNT(*)::int as c FROM market_evidence WHERE content_hash = $1', [item1.evidence.content_hash]);
    const adCount = await pool.query('SELECT COUNT(*)::int as c FROM market_ads WHERE ad_library_id = $1', ['META_AD_IDEMP_001']);

    expect(evCount.rows[0].c).toBe(1);
    expect(adCount.rows[0].c).toBe(1);
  });

  // 8. Controlled Sample Batch (20 Ads)
  it('8. should process a controlled sample batch of up to 20 ads with individual evidence hashes', async () => {
    const sampleItems = Array.from({ length: 20 }, (_, i) => {
      const id = 'SAMPLE_BATCH_AD_' + String(i + 1).padStart(3, '0');
      const raw: RawAdLibraryPayload = {
        id,
        page_id: 'PAGE_BATCH_' + (Math.floor(i / 5) + 1),
        page_name: 'Anunciante Batch ' + (Math.floor(i / 5) + 1),
        ad_creation_time: '2026-09-24T00:00:00Z',
        ad_creative_bodies: ['Copy do anuncio ' + (i + 1) + ' de culinaria e receitas'],
        ad_creative_link_titles: ['Oferta de Receitas ' + (i + 1)],
        destination_url: 'https://exemplo-culinaria.com/oferta-' + (i + 1),
        cta_text: 'SAIBA_MAIS',
        media_type: i % 2 === 0 ? 'VIDEO' : 'IMAGE'
      };
      return provider.normalizeItem(raw, 'OPERATOR_ASSISTED');
    });

    expect(sampleItems).toHaveLength(20);

    const result = await MarketIngestionService.ingestItems(pool, sampleItems);

    expect(result.evidenceCreated).toBe(20);
    expect(result.adsCreated).toBe(20);
    expect(result.observationsCreated).toBe(20);
    expect(result.offersCreated).toBe(20);
    expect(result.advertisersCreated).toBe(4);

    const totalAds = await pool.query("SELECT COUNT(*)::int as c FROM market_ads WHERE ad_library_id LIKE 'SAMPLE_BATCH_AD_%'");
    expect(totalAds.rows[0].c).toBe(20);
  });
});
