import { Pool } from 'pg';
import crypto from 'crypto';

export async function seedDemoData(pool: Pool) {
  // First, check if demo data already exists to avoid duplicate seeding
  const check = await pool.query('SELECT 1 FROM users WHERE email = $1', ['admin@norqva.com']);
  if (check.rows.length > 0) {
    console.log('Database already seeded. Skipping seed.');
    return;
  }

  console.log('Seeding Demo Data...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert Users
    const roles = ['ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS'];
    const users: Record<string, string> = {};
    
    for (const role of roles) {
      const id = crypto.randomUUID();
      const email = `${role.toLowerCase()}@norqva.com`;
      const name = `${role.charAt(0) + role.slice(1).toLowerCase()} User`;
      await client.query(
        `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo) 
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', TRUE)`,
        [id, id, name, email, role]
      );
      users[role] = id;
    }

    // 2. Insert Opportunities (3 opportunities)
    const opps = [
      {
        id: crypto.randomUUID(),
        human_id: 'OPP-000001',
        title: 'Geolocalized Retail Target Optimization',
        category: 'Geomarketing',
        subcategory: 'Foot-traffic Analysis',
        description: 'Analyze physical store traffic to deploy localized Meta Ads to audiences near premium shopping hubs.',
        target_audience: 'Retail Managers & Brand Partners',
        problem_desire: 'Inefficient spend on broad geo-targeting; desire for precision proximity targeting.',
        format: 'Meta Ads Campaign + Geo Tracker Dashboard',
        source: 'Internal Research & Competitor Benchmarks',
        reference_url: 'https://reference.norqva.com/foot-traffic',
        notes: 'High potential for clothing and luxury segments.',
        status: 'DESCOBERTA',
        responsible_id: users['INTELLIGENCE']
      },
      {
        id: crypto.randomUUID(),
        human_id: 'OPP-000002',
        title: 'Predictive Agro-Logistics Planning',
        category: 'Agribusiness',
        subcategory: 'Harvest Transportation',
        description: 'Provide predictive dashboard mapping harvest delays to transport companies.',
        target_audience: 'Grain Producers and Transport Cooperatives',
        problem_desire: 'High storage costs due to truck allocation delays; desire for automated load booking.',
        format: 'SaaS Dashboard + WhatsApp Automated Booking',
        source: 'Industry Report 2026',
        reference_url: 'https://reference.norqva.com/agro-logistics',
        notes: 'Highly seasonal, requires partnership with logistics providers.',
        status: 'EM_ANALISE',
        responsible_id: users['INTELLIGENCE']
      },
      {
        id: crypto.randomUUID(),
        human_id: 'OPP-000003',
        title: 'Real Estate Land Valuation Engine',
        category: 'Real Estate',
        subcategory: 'Automated Valuation Model',
        description: 'Develop scoring engine for urban land plots using public building permit data.',
        target_audience: 'Property Developers',
        problem_desire: 'Manual appraisal takes weeks; developers want instant land acquisition score.',
        format: 'Web App + REST API',
        source: 'Public Real Estate Records',
        reference_url: 'https://reference.norqva.com/valuation-engine',
        notes: 'Starting pilot in São Paulo.',
        status: 'APROVADA_PARA_TESTE',
        responsible_id: users['ADMIN']
      }
    ];

    const oppIds: string[] = [];
    for (const opp of opps) {
      await client.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, reference_url, notes, status, responsible_id, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)`,
        [opp.id, opp.human_id, opp.title, opp.category, opp.subcategory, opp.description, opp.target_audience, opp.problem_desire, opp.format, opp.source, opp.reference_url, opp.notes, opp.status, opp.responsible_id]
      );
      oppIds.push(opp.id);
    }

    // 2.1 Insert Evidences (at least 1 per opportunity)
    const evidences = [
      {
        id: crypto.randomUUID(),
        opportunity_id: oppIds[0],
        type: 'FATO',
        source: 'Local government mobility index',
        url: 'https://mobility-index.gov.br',
        description: 'Mobility index shows 30% increase in pedestrian counts around retail zones during lunch hours.',
        responsible_id: users['INTELLIGENCE'],
        reliability: 'HIGH',
        observations: 'Data is updated monthly.'
      },
      {
        id: crypto.randomUUID(),
        opportunity_id: oppIds[1],
        type: 'INFERENCIA',
        source: 'Freight broker interview',
        url: null,
        description: 'Brokers estimate 15-20% loss in efficiency due to scheduling mismatch.',
        responsible_id: users['INTELLIGENCE'],
        reliability: 'MEDIUM',
        observations: 'Conversations with 5 leading brokers in Paranaguá.'
      },
      {
        id: crypto.randomUUID(),
        opportunity_id: oppIds[2],
        type: 'HIPOTESE',
        source: 'Real Estate Developer Survey',
        url: null,
        description: 'If valuation can be automated to 10 seconds, conversion rate from acquisition to bid will double.',
        responsible_id: users['INTELLIGENCE'],
        reliability: 'LOW',
        observations: 'Needs experiment to validate conversion rate improvement.'
      }
    ];

    for (const ev of evidences) {
      await client.query(
        `INSERT INTO evidences (id, opportunity_id, type, source, url, description, responsible_id, reliability, observations, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`,
        [ev.id, ev.opportunity_id, ev.type, ev.source, ev.url, ev.description, ev.responsible_id, ev.reliability, ev.observations]
      );
    }

    // 3. Insert Products (2 products)
    const products = [
      {
        id: crypto.randomUUID(),
        human_id: 'PRD-000001',
        name: 'GEO-LITE Proximity Engine',
        category: 'Geomarketing API',
        description: 'Developer toolkit to track and deploy campaigns to active geo-fences.',
        responsible_id: users['PRODUCT'],
        status: 'EM_DESENVOLVIMENTO',
        opportunity_id: oppIds[0],
        estimated_cost: 15000.00,
        observations: 'Draft version. Development ongoing.',
        origin_provenance: null,
        origin_responsible_id: null,
        origin_evidence: null,
        origin_notes: null
      },
      {
        id: crypto.randomUUID(),
        human_id: 'PRD-000002',
        name: 'AVM Paulínia Hub',
        category: 'Real Estate Tools',
        description: 'Automated valuation backend model specifically tuned for Paulínia city area.',
        responsible_id: users['PRODUCT'],
        status: 'PRONTO',
        opportunity_id: oppIds[2],
        estimated_cost: 8500.00,
        observations: 'Fully certified and audited algorithm.',
        origin_provenance: 'ORIGINAL',
        origin_responsible_id: users['PRODUCT'],
        origin_evidence: 'Patent document & algorithm audit log #9812-B',
        origin_notes: 'Verified code integrity.'
      }
    ];

    const prdIds: string[] = [];
    for (const prd of products) {
      await client.query(
        `INSERT INTO products (id, human_id, name, category, description, responsible_id, status, opportunity_id, estimated_cost, observations, origin_provenance, origin_responsible_id, origin_evidence, origin_notes, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)`,
        [prd.id, prd.human_id, prd.name, prd.category, prd.description, prd.responsible_id, prd.status, prd.opportunity_id, prd.estimated_cost, prd.observations, prd.origin_provenance, prd.origin_responsible_id, prd.origin_evidence, prd.origin_notes]
      );
      prdIds.push(prd.id);
    }

    // 4. Insert Offers (3 offers)
    const offers = [
      {
        id: crypto.randomUUID(),
        human_id: 'OFF-000001',
        product_id: prdIds[0],
        name: 'GEO-LITE Enterprise Starter',
        price: 990.00,
        promotional_price: 790.00,
        bonus: '10,000 requests/month',
        description: 'Starter tier package with basic geo-fence lookups.',
        upsell: 'OFF-000002 Upgrade Pack',
        cross_sell: 'Creative optimization toolkit',
        status: 'ATIVA'
      },
      {
        id: crypto.randomUUID(),
        human_id: 'OFF-000002',
        product_id: prdIds[0],
        name: 'GEO-LITE Unlimited Analytics Suite',
        price: 3490.00,
        promotional_price: 2990.00,
        bonus: 'Dedicated support channel + WhatsApp webhook setup',
        description: 'Unlimited queries, detailed foot-traffic dashboard integration.',
        upsell: null,
        cross_sell: 'Offline audit package',
        status: 'ATIVA'
      },
      {
        id: crypto.randomUUID(),
        human_id: 'OFF-000003',
        product_id: prdIds[1],
        name: 'Paulínia Hub API Access Key',
        price: 199.00,
        promotional_price: 149.00,
        bonus: '50 free appraisals per month',
        description: 'Key to make automated requests to Paulínia model.',
        upsell: 'Enterprise custom regional hub',
        cross_sell: null,
        status: 'RASCUNHO'
      }
    ];

    const offIds: string[] = [];
    for (const off of offers) {
      await client.query(
        `INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, bonus, description, upsell, cross_sell, status, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)`,
        [off.id, off.human_id, off.product_id, off.name, off.price, off.promotional_price, off.bonus, off.description, off.upsell, off.cross_sell, off.status]
      );
      offIds.push(off.id);
    }

    // 5. Insert Creatives (6 creatives)
    const creatives = [
      {
        id: crypto.randomUUID(),
        human_id: 'CR-000001',
        product_id: prdIds[0],
        offer_id: offIds[0],
        hook: 'Are you wasting money targeting broad regions? Target exact retail zones.',
        concept: 'Map of city with dynamic circles shrinking to target specific buildings.',
        copy: 'Deploy mobile ads only to customers stepping inside your competitor stores.',
        cta: 'Book Proximity Demo',
        format: 'VIDEO',
        file_url: 'https://creatives.norqva.com/geomarketing-map.mp4',
        responsible_id: users['CREATIVE'],
        status: 'ATIVO'
      },
      {
        id: crypto.randomUUID(),
        human_id: 'CR-000002',
        product_id: prdIds[0],
        offer_id: offIds[0],
        hook: 'The future of retail targeting is micro-geofencing.',
        concept: 'High-density metrics table vs empty store comparison.',
        copy: 'Learn how to boost store footfall by 30% with precise local ads.',
        cta: 'Read Case Study',
        format: 'IMAGE',
        file_url: 'https://creatives.norqva.com/foot-traffic-comparison.png',
        responsible_id: users['CREATIVE'],
        status: 'ATIVO'
      },
      {
        id: crypto.randomUUID(),
        human_id: 'CR-000003',
        product_id: prdIds[0],
        offer_id: offIds[1],
        hook: 'Unlock unlimited geo-spatial query performance.',
        concept: 'Fast loading charts and stats animation.',
        copy: 'Get full API access to target up to 100 location-fences simultaneously.',
        cta: 'Generate Access Token',
        format: 'CAROUSEL',
        file_url: 'https://creatives.norqva.com/unlimited-charts-carousel.png',
        responsible_id: users['CREATIVE'],
        status: 'PRONTO'
      },
      {
        id: crypto.randomUUID(),
        human_id: 'CR-000004',
        product_id: prdIds[1],
        offer_id: offIds[2],
        hook: 'Appraise Paulínia urban plots in under 10 seconds.',
        concept: 'Developer typing plot coordinates, map outputting instant price.',
        copy: 'Integrate the premier Paulínia automated valuation engine inside your CRM.',
        cta: 'Try API Free',
        format: 'VIDEO',
        file_url: 'https://creatives.norqva.com/paulinia-api-test.mp4',
        responsible_id: users['CREATIVE'],
        status: 'IDEIA'
      },
      {
        id: crypto.randomUUID(),
        human_id: 'CR-000005',
        product_id: prdIds[1],
        offer_id: offIds[2],
        hook: 'Stop guessing plot prices. Use real building permit data.',
        concept: 'Line charts with property price trend analysis.',
        copy: 'Highly accurate real estate valuations using real city records.',
        cta: 'View Dashboard',
        format: 'IMAGE',
        file_url: 'https://creatives.norqva.com/plot-trends.png',
        responsible_id: users['CREATIVE'],
        status: 'IDEIA'
      },
      {
        id: crypto.randomUUID(),
        human_id: 'CR-000006',
        product_id: prdIds[0],
        offer_id: offIds[1],
        hook: 'Geolocalized mobile alerts for enterprise brands.',
        concept: 'Smartphone showing pop-up notification when passing a store.',
        copy: 'Engage customers on their way to buy. Instant ROI boost.',
        cta: 'Request Invite',
        format: 'VIDEO',
        file_url: 'https://creatives.norqva.com/mobile-alert-mockup.mp4',
        responsible_id: users['CREATIVE'],
        status: 'REVISAO'
      }
    ];

    const crIds: string[] = [];
    for (const cr of creatives) {
      await client.query(
        `INSERT INTO creatives (id, human_id, product_id, offer_id, hook, concept, copy, cta, format, file_url, responsible_id, status, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE)`,
        [cr.id, cr.human_id, cr.product_id, cr.offer_id, cr.hook, cr.concept, cr.copy, cr.cta, cr.format, cr.file_url, cr.responsible_id, cr.status]
      );
      crIds.push(cr.id);
    }

    // 6. Insert Experiments (3 experiments)
    const experiments = [
      {
        id: crypto.randomUUID(),
        human_id: 'EXP-000001',
        name: 'Geo-fence Optimization Test 1',
        hypothesis: 'Precise competitor geofences (rather than 1km circles) will increase CTR from 1.5% to 3.5%.',
        product_id: prdIds[0],
        offer_id: offIds[0],
        responsible_id: users['PERFORMANCE'],
        start_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: null,
        status: 'ATIVO',
        capital_requested: 500.00,
        capital_approved: 300.00,
        capital_used: 241.00,
        creatives: [crIds[0], crIds[1]]
      },
      {
        id: crypto.randomUUID(),
        human_id: 'EXP-000002',
        name: 'Agro-Scheduling Target Check',
        hypothesis: 'Targeting cooperatives rather than individual truck drivers will yield high value conversions.',
        product_id: prdIds[0],
        offer_id: offIds[1],
        responsible_id: users['PERFORMANCE'],
        start_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: null,
        status: 'ATIVO',
        capital_requested: 1000.00,
        capital_approved: 1000.00,
        capital_used: 980.00,
        creatives: [crIds[2]]
      },
      {
        id: crypto.randomUUID(),
        human_id: 'EXP-000003',
        name: 'Paulínia Hub API Key Launch Check',
        hypothesis: 'Promoting the 50 free appraisal bonus will double trial signups.',
        product_id: prdIds[1],
        offer_id: offIds[2],
        responsible_id: users['PERFORMANCE'],
        start_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: null,
        status: 'PLANEJADO',
        capital_requested: 200.00,
        capital_approved: 0.00,
        capital_used: 0.00,
        creatives: [crIds[3], crIds[4]]
      }
    ];

    const expIds: string[] = [];
    for (const exp of experiments) {
      await client.query(
        `INSERT INTO experiments (id, human_id, name, hypothesis, product_id, offer_id, responsible_id, start_date, end_date, status, capital_requested, capital_approved, capital_used, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE)`,
        [exp.id, exp.human_id, exp.name, exp.hypothesis, exp.product_id, exp.offer_id, exp.responsible_id, exp.start_date, exp.end_date, exp.status, exp.capital_requested, exp.capital_approved, exp.capital_used]
      );
      expIds.push(exp.id);

      // Link creatives
      for (const crId of exp.creatives) {
        await client.query(
          `INSERT INTO experiment_creatives (experiment_id, creative_id) VALUES ($1, $2)`,
          [exp.id, crId]
        );
      }
    }

    // 7. Insert performance entries for Experiments
    const performance = [
      {
        id: crypto.randomUUID(),
        experiment_id: expIds[0],
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        source: 'MANUAL',
        investment: 141.00,
        impressions: 5000,
        cliques: 180,
        conversas: 45,
        pedidos: 10,
        vendas: 8,
        receita: 1200.00,
        reembolsos: 0.00,
        taxas: 60.00,
        outros_custos: 20.00
      },
      {
        id: crypto.randomUUID(),
        experiment_id: expIds[0],
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        source: 'MANUAL',
        investment: 100.00,
        impressions: 4000,
        cliques: 150,
        conversas: 35,
        pedidos: 8,
        vendas: 6,
        receita: 900.00,
        reembolsos: 100.00,
        taxas: 45.00,
        outros_custos: 15.00
      },
      {
        id: crypto.randomUUID(),
        experiment_id: expIds[1],
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        source: 'MANUAL',
        investment: 980.00,
        impressions: 25000,
        cliques: 820,
        conversas: 120,
        pedidos: 20,
        vendas: 18,
        receita: 53820.00,
        reembolsos: 3490.00,
        taxas: 2691.00,
        outros_custos: 350.00
      }
    ];

    for (const p of performance) {
      await client.query(
        `INSERT INTO performance_entries (id, experiment_id, date, source, investment, impressions, cliques, conversas, pedidos, vendas, receita, reembolsos, taxas, outros_custos, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)`,
        [p.id, p.experiment_id, p.date, p.source, p.investment, p.impressions, p.cliques, p.conversas, p.pedidos, p.vendas, p.receita, p.reembolsos, p.taxas, p.outros_custos]
      );
    }

    // 8. Insert Capital Authorizations (historical logs)
    const authorizations = [
      {
        id: crypto.randomUUID(),
        experiment_id: expIds[0],
        user_id: users['ADMIN'],
        previous_amount: 0.00,
        new_amount: 300.00,
        justification: 'Approved initial capital testing budget for micro geo-fences.'
      },
      {
        id: crypto.randomUUID(),
        experiment_id: expIds[1],
        user_id: users['ADMIN'],
        previous_amount: 0.00,
        new_amount: 1000.00,
        justification: 'High-intent target B2B testing budget approved.'
      }
    ];

    for (const auth of authorizations) {
      await client.query(
        `INSERT INTO capital_authorizations (id, experiment_id, user_id, previous_amount, new_amount, justification, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [auth.id, auth.experiment_id, auth.user_id, auth.previous_amount, auth.new_amount, auth.justification]
      );
    }

    // 9. Decisions (polymorphic)
    const decisions = [
      {
        id: crypto.randomUUID(),
        human_id: 'DEC-000001',
        related_entity_id: expIds[0],
        related_entity_type: 'EXPERIMENT',
        type: 'APROVAR_CAPITAL',
        decision_text: 'Approved capital of R$300 for EXP-000001.',
        responsible_id: users['ADMIN'],
        justification: 'Opportunity valuation scores match internal targets.',
        available_data: JSON.stringify({ opp_score: 8.5 }),
        future_result: 'Wait for CTR metrics review after R$200 spent.'
      },
      {
        id: crypto.randomUUID(),
        human_id: 'DEC-000002',
        related_entity_id: prdIds[1],
        related_entity_type: 'PRODUCT',
        type: 'APROVAR_PRODUTO',
        decision_text: 'Marked AVM Paulínia Hub as PRONTO.',
        responsible_id: users['PRODUCT'],
        justification: 'Provenance checked: Original development with clean algorithm audit.',
        available_data: JSON.stringify({ provenance: 'ORIGINAL' }),
        future_result: 'Prepare pricing package OFF-000003.'
      }
    ];

    for (const dec of decisions) {
      await client.query(
        `INSERT INTO decisions (id, human_id, related_entity_id, related_entity_type, type, decision_text, responsible_id, justification, available_data, future_result, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)`,
        [dec.id, dec.human_id, dec.related_entity_id, dec.related_entity_type, dec.type, dec.decision_text, dec.responsible_id, dec.justification, dec.available_data, dec.future_result]
      );
    }

    // 10. Insert Score Models & components
    const modelId = '11111111-2222-3333-4444-555555555555';
    await client.query(
      `INSERT INTO score_models (id, name, version, status, formula_config, max_total_critical_penalty)
       VALUES ($1, 'PSM-V1', 1, 'ACTIVE', '{"description": "Standard Score Model"}'::jsonb, 25.00)
       ON CONFLICT (name, version) DO NOTHING`,
      [modelId]
    );

    const components = [
      { key: 'demand_evidence', name: 'Demand Evidence', weight: 20.00, display: 1, max_penalty: 5.00 },
      { key: 'commercial_persistence', name: 'Commercial Persistence', weight: 10.00, display: 2, max_penalty: 3.00 },
      { key: 'visual_demonstrability', name: 'Visual Demonstrability', weight: 10.00, display: 3, max_penalty: 3.00 },
      { key: 'benefit_clarity', name: 'Benefit Clarity', weight: 10.00, display: 4, max_penalty: 3.00 },
      { key: 'differentiation_potential', name: 'Differentiation Potential', weight: 10.00, display: 5, max_penalty: 3.00 },
      { key: 'unit_economics_potential', name: 'Unit Economics Potential', weight: 15.00, display: 6, max_penalty: 5.00 },
      { key: 'upsell_ltv_potential', name: 'Upsell/LTV Potential', weight: 10.00, display: 7, max_penalty: 3.00 },
      { key: 'production_ease', name: 'Production Ease', weight: 5.00, display: 8, max_penalty: 2.00 },
      { key: 'scalability', name: 'Scalability', weight: 5.00, display: 9, max_penalty: 2.00 },
      { key: 'risk', name: 'Risk Safety', weight: 5.00, display: 10, max_penalty: 5.00 }
    ];

    const calculationRule = JSON.stringify({
      penalties: { CRITICAL: -5.00, HIGH: -3.00, MEDIUM: -1.50, LOW: -0.50 }
    });

    for (const comp of components) {
      const compId = crypto.randomUUID();
      await client.query(
        `INSERT INTO score_model_components (id, score_model_id, component_key, name, weight, calculation_rule, max_penalty_per_component, display_order)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (score_model_id, component_key) DO NOTHING`,
        [compId, modelId, comp.key, comp.name, comp.weight, calculationRule, comp.max_penalty, comp.display]
      );
    }

    // 11. Insert Prompts
    const promptsData = [
      { name: 'PRODUCT_ANALYST', version: 'V1', content: 'You are a Product Analyst...' },
      { name: 'CRITICAL_ANALYST', version: 'V1', content: 'You are a Critical Analyst...' },
      { name: 'RECOMMENDATION', version: 'V1', content: 'You are a Recommendation Engine...' }
    ];

    for (const p of promptsData) {
      const promptId = crypto.randomUUID();
      await client.query(
        `INSERT INTO prompts (id, name, version, content)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name, version) DO NOTHING`,
        [promptId, p.name, p.version, p.content]
      );
    }

    await client.query('COMMIT');
    console.log('Seeding Demo Data finished successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to seed Demo Data:', err);
    throw err;
  } finally {
    client.release();
  }
}
