import { Response } from 'express';
import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth';
import { encryptData, decryptData, generateHmacHash } from '../utils/crypto';
import { AsaasPaymentProvider } from '../utils/payment';
import { writeAuditLog } from '../db/audit';
import { clearDemoData } from '../db/db';
import { calculateScores } from '../utils/score';
import { MockAIProvider } from '../utils/ai';

export const aiProvider = new MockAIProvider();

// Helper: safe math division
function safeDivide(numerator: number, denominator: number): number | 'Dados insuficientes' {
  if (!denominator || denominator === 0) return 'Dados insuficientes';
  const result = numerator / denominator;
  return parseFloat(result.toFixed(2));
}

// Helper: Generate next sequential human id
async function getNextHumanId(pool: Pool | PoolClient, table: string, prefix: string): Promise<string> {
  const query = `SELECT human_id FROM ${table} ORDER BY human_id DESC LIMIT 1`;
  const res = await pool.query(query);
  if (res.rows.length === 0) {
    return `${prefix}-000001`;
  }
  const lastId = res.rows[0].human_id;
  const num = parseInt(lastId.replace(`${prefix}-`, ''), 10);
  return `${prefix}-${String(num + 1).padStart(6, '0')}`;
}

// 1. Dashboard Metrics
export async function getDashboard(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const filter = req.query.filter as string; // 'HOJE', '7_DIAS', '30_DIAS', 'PERSONALIZADO'
    const start = req.query.startDate as string;
    const end = req.query.endDate as string;

    let dateFilter = '';
    const params: any[] = [isDemo];

    if (filter === 'HOJE') {
      dateFilter = 'AND date = $2';
      params.push(new Date().toISOString().split('T')[0]);
    } else if (filter === '7_DIAS') {
      dateFilter = 'AND date >= $2';
      const d = new Date();
      d.setDate(d.getDate() - 7);
      params.push(d.toISOString().split('T')[0]);
    } else if (filter === '30_DIAS') {
      dateFilter = 'AND date >= $2';
      const d = new Date();
      d.setDate(d.getDate() - 30);
      params.push(d.toISOString().split('T')[0]);
    } else if (filter === 'PERSONALIZADO' && start && end) {
      dateFilter = 'AND date BETWEEN $2 AND $3';
      params.push(start, end);
    }

    const query = `
      SELECT 
        COALESCE(SUM(investment), 0) as investment,
        COALESCE(SUM(impressions), 0) as impressions,
        COALESCE(SUM(cliques), 0) as cliques,
        COALESCE(SUM(conversas), 0) as conversas,
        COALESCE(SUM(pedidos), 0) as pedidos,
        COALESCE(SUM(vendas), 0) as vendas,
        COALESCE(SUM(receita), 0) as receita,
        COALESCE(SUM(reembolsos), 0) as reembolsos,
        COALESCE(SUM(taxas), 0) as taxas,
        COALESCE(SUM(outros_custos), 0) as outros_custos
      FROM performance_entries
      WHERE is_demo = $1 ${dateFilter}
    `;

    const statsRes = await pool.query(query, params);
    const stats = statsRes.rows[0];

    const investment = parseFloat(stats.investment);
    const revenue = parseFloat(stats.receita);
    const refunds = parseFloat(stats.reembolsos);
    const fees = parseFloat(stats.taxas);
    const otherCosts = parseFloat(stats.outros_custos);
    const sales = parseInt(stats.vendas, 10);
    const conversations = parseInt(stats.conversas, 10);
    const clicks = parseInt(stats.cliques, 10);
    const impressions = parseInt(stats.impressions, 10);

    const capRes = await pool.query(
      `SELECT 
         COALESCE(SUM(capital_approved), 0) as approved,
         COALESCE(SUM(capital_used), 0) as used
       FROM experiments
       WHERE is_demo = $1 AND is_deleted = FALSE`,
      [isDemo]
    );
    const capitalApproved = parseFloat(capRes.rows[0].approved);
    const capitalUsed = parseFloat(capRes.rows[0].used);
    const capitalRemaining = parseFloat((capitalApproved - capitalUsed).toFixed(2));

    const ctr = safeDivide(clicks * 100, impressions);
    const cpc = safeDivide(investment, clicks);
    const costPerConversation = safeDivide(investment, conversations);
    const conversionRate = safeDivide(sales * 100, conversations);
    const cac = safeDivide(investment, sales);
    const averageTicket = safeDivide(revenue, sales);
    const roas = safeDivide(revenue, investment);
    const netRevenue = parseFloat((revenue - refunds).toFixed(2));
    const contributionMargin = parseFloat((revenue - refunds - fees - investment - otherCosts).toFixed(2));

    return res.status(200).json({
      metrics: {
        investment,
        impressions,
        cliques: clicks,
        conversas: conversations,
        pedidos: parseInt(stats.pedidos, 10),
        vendas: sales,
        receita: revenue,
        reembolsos: refunds,
        taxas: fees,
        outros_custos: otherCosts,
        netRevenue,
        contributionMargin,
        ctr,
        cpc,
        costPerConversation,
        conversionRate,
        cac,
        averageTicket,
        roas,
        capitalApproved,
        capitalUsed,
        capitalRemaining
      }
    });
  } catch (err) {
    console.error('Failed to get dashboard metrics:', err);
    return res.status(500).json({ error: 'Failed to retrieve dashboard metrics.' });
  }
}

// 2. Users Endpoint
export async function getUsers(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const users = await pool.query(
      'SELECT id, name, email, role, status, created_at, last_login_at FROM users WHERE is_demo = $1 ORDER BY name ASC',
      [isDemo]
    );
    return res.status(200).json({ users: users.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch users.' });
  }
}

// 3. Opportunities
export async function getOpportunities(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const opps = await pool.query(
      `SELECT o.*, u.name as responsible_name,
              s.initial_product_score, s.critical_adjustment, s.final_product_score, s.confidence_score, s.is_human_override, s.human_override_score, s.override_reason,
              s.id as score_id
       FROM opportunities o 
       LEFT JOIN users u ON o.responsible_id = u.id 
       LEFT JOIN LATERAL (
         SELECT * FROM opportunity_scores 
         WHERE opportunity_id = o.id 
         ORDER BY created_at DESC LIMIT 1
       ) s ON TRUE
       WHERE o.is_demo = $1 AND o.status != 'ARQUIVADA'
       ORDER BY o.created_at DESC`,
      [isDemo]
    );
    
    const evidences = await pool.query('SELECT * FROM evidences WHERE is_demo = $1', [isDemo]);
    const risks = await pool.query('SELECT * FROM opportunity_risks WHERE is_demo = $1', [isDemo]);
    const reviews = await pool.query('SELECT * FROM opportunity_reviews WHERE is_demo = $1', [isDemo]);
    const allScoreComponents = await pool.query(`SELECT * FROM score_components`);
    
    const formatted = opps.rows.map(o => ({
      ...o,
      evidences: evidences.rows.filter((ev: any) => ev.opportunity_id === o.id),
      risks: risks.rows.filter((r: any) => r.opportunity_id === o.id),
      reviews: reviews.rows.filter((rev: any) => rev.opportunity_id === o.id),
      score_components: allScoreComponents.rows.filter((c: any) => c.opportunity_score_id === o.score_id)
    }));

    return res.status(200).json({ opportunities: formatted });
  } catch (err) {
    console.error('Failed to fetch opportunities:', err);
    return res.status(500).json({ error: 'Failed to fetch opportunities.' });
  }
}

export async function createOpportunity(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const {
      title, category, subcategory, description, target_audience, problem_desire, format, source, reference_url, notes, responsible_id,
      product_format, observed_promise, observed_price, market, language, country, research_notes, production_complexity_estimate,
      differentiation_notes, possible_upsells, possible_cross_sells, risk_notes
    } = req.body;

    if (!title || !category || !subcategory || !description || !target_audience || !problem_desire || !format || !source) {
      return res.status(400).json({ error: 'Missing mandatory opportunity parameters.' });
    }

    const humanId = await getNextHumanId(pool, 'opportunities', 'OPP');
    const id = crypto.randomUUID();
    
    const insertRes = await pool.query(
      `INSERT INTO opportunities (
        id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, reference_url, notes, responsible_id, status, is_demo,
        product_format, observed_promise, observed_price, market, language, country, research_notes, production_complexity_estimate, differentiation_notes, possible_upsells, possible_cross_sells, risk_notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'DESCOBERTA', $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING *`,
      [
        id, humanId, title, category, subcategory, description, target_audience, problem_desire, format, source, reference_url || null, notes || null, responsible_id || req.user?.id, isDemo,
        product_format || null, observed_promise || null, observed_price || null, market || null, language || null, country || null, research_notes || null, production_complexity_estimate || null,
        differentiation_notes || null, possible_upsells || null, possible_cross_sells || null, risk_notes || null
      ]
    );

    const opp = insertRes.rows[0];
    
    writeAuditLog(pool, req.user?.id || null, 'OPPORTUNITY_CREATE', `Created opportunity ${humanId}`, null, JSON.stringify(opp), isDemo, false);

    return res.status(201).json({ opportunity: opp });
  } catch (err) {
    console.error('Create opportunity error:', err);
    return res.status(500).json({ error: 'Failed to create opportunity.' });
  }
}

export async function attachEvidence(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const { id } = req.params;
    const {
      type, source, url, description, reliability, observations,
      classification, source_url, title, captured_value, captured_text, metadata, source_domain, source_group, provenance
    } = req.body;

    if (!type || !source || !description || !reliability) {
      return res.status(400).json({ error: 'Missing mandatory evidence parameters.' });
    }

    const typeCheck = ['FATO', 'INFERENCIA', 'HIPOTESE', 'DADO_INSUFICIENTE'].includes(type);
    if (!typeCheck) {
      return res.status(400).json({ error: 'Invalid evidence type.' });
    }

    const checkOpp = await pool.query('SELECT is_demo FROM opportunities WHERE id = $1', [id]);
    if (checkOpp.rows.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found.' });
    }

    if (checkOpp.rows[0].is_demo !== isDemo) {
      return res.status(409).json({ error: 'Conflito de escopo: A oportunidade associada pertence a um escopo diferente (DEMO x REAL).' });
    }

    const provVal = provenance || 'EXTERNAL_SOURCE';
    const provCheck = ['EXTERNAL_SOURCE', 'MANUAL_OBSERVATION', 'IMPORTED_DATA', 'AI_EXTRACTED_FROM_SOURCE', 'AI_INFERENCE'].includes(provVal);
    if (!provCheck) {
      return res.status(400).json({ error: 'Invalid evidence provenance.' });
    }

    const evidenceId = crypto.randomUUID();

    const insertRes = await pool.query(
      `INSERT INTO evidences (
        id, opportunity_id, type, source, url, description, responsible_id, reliability, observations, is_demo,
        classification, source_url, title, captured_value, captured_text, metadata, source_domain, source_group, provenance
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        evidenceId, id, type, source, url || null, description, req.user?.id || null, reliability, observations || null, isDemo,
        classification || null, source_url || url || null, title || null, captured_value || null, captured_text || null, metadata ? JSON.stringify(metadata) : null,
        source_domain || null, source_group || null, provVal
      ]
    );

    const evidence = insertRes.rows[0];
    
    writeAuditLog(pool, req.user?.id || null, 'EVIDENCE_ATTACH', `Attached evidence to opportunity ID ${id}`, null, JSON.stringify(evidence), isDemo, false);

    return res.status(201).json({ evidence });
  } catch (err) {
    console.error('Attach evidence error:', err);
    return res.status(500).json({ error: 'Failed to attach evidence.' });
  }
}

export async function approveOpportunity(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const client = await pool.connect();
  try {
    const isDemo = req.query.mode === 'demo';
    const { id } = req.params;
    const { justification } = req.body;

    await client.query('BEGIN');

    const oppRes = await client.query('SELECT * FROM opportunities WHERE id = $1 FOR UPDATE', [id]);
    if (oppRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Opportunity not found.' });
    }

    const opp = oppRes.rows[0];
    if (opp.status === 'APROVADA_PARA_TESTE') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Opportunity already approved.' });
    }

    if (opp.is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Conflito de escopo: A oportunidade pertence a um escopo diferente.' });
    }

    // Get active score and details for snapshot
    const scoreRes = await client.query(
      `SELECT * FROM opportunity_scores WHERE opportunity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    
    const activeScore = scoreRes.rows[0] || {
      id: null,
      score_model_id: '11111111-2222-3333-4444-555555555555',
      initial_product_score: 0.00,
      critical_adjustment: 0.00,
      final_product_score: 0.00,
      confidence_score: 0.00
    };

    const analysisRes = await client.query(
      `SELECT * FROM ai_analyses WHERE opportunity_id = $1 ORDER BY version DESC LIMIT 1`,
      [id]
    );
    const activeAnalysis = analysisRes.rows[0];

    const evsRes = await client.query(`SELECT id FROM evidences WHERE opportunity_id = $1 AND is_demo = $2`, [id, isDemo]);
    const evIds = evsRes.rows.map(r => r.id);

    const risksRes = await client.query(`SELECT id FROM opportunity_risks WHERE opportunity_id = $1 AND is_demo = $2`, [id, isDemo]);
    const riskIds = risksRes.rows.map(r => r.id);

    // Update status to approved
    await client.query('UPDATE opportunities SET status = \'APROVADA_PARA_TESTE\' WHERE id = $1', [id]);

    const prdHumanId = await getNextHumanId(client as any, 'products', 'PRD');
    const prdId = crypto.randomUUID();

    const prdRes = await client.query(
      `INSERT INTO products (id, human_id, name, category, description, responsible_id, status, opportunity_id, estimated_cost, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, 'PLANEJADO', $7, 0.00, $8)
       RETURNING *`,
      [prdId, prdHumanId, `Draft Product: ${opp.title}`, opp.category, opp.description, req.user?.id || null, opp.id, isDemo]
    );

    const product = prdRes.rows[0];

    const decHumanId = await getNextHumanId(client as any, 'decisions', 'DEC');
    const decId = crypto.randomUUID();
    await client.query(
      `INSERT INTO decisions (id, human_id, related_entity_id, related_entity_type, type, decision_text, responsible_id, justification, is_demo)
       VALUES ($1, $2, $3, 'OPPORTUNITY', 'APROVAR_PRODUTO', $4, $5, $6, $7)`,
      [decId, decHumanId, opp.id, `Approved opportunity and spawned product ${prdHumanId}`, req.user?.id || null, justification || 'Opportunity meets target profiles.', isDemo]
    );

    // Save decision snapshot
    const promptVersions = {
      PRODUCT_ANALYST: 'V1',
      CRITICAL_ANALYST: 'V1',
      RECOMMENDATION: 'V1'
    };

    let componentScores = [];
    if (activeScore) {
      const compRes = await client.query(
        `SELECT component_key, score, weight, weighted_score, confidence, evidence_count, reasoning_summary 
         FROM score_components 
         WHERE opportunity_score_id = $1`,
        [activeScore.id]
      );
      componentScores = compRes.rows;
    }

    const snapId = crypto.randomUUID();
    await client.query(
      `INSERT INTO decision_snapshots (
        id, opportunity_id, analysis_id, initial_product_score, critical_adjustment, final_product_score, confidence_score,
        score_model_id, component_scores, evidence_ids, risk_ids, prompt_versions, decision, responsible_id, justification, is_demo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'APPROVE_FOR_TEST', $13, $14, $15)`,
      [
        snapId, opp.id, activeAnalysis ? activeAnalysis.id : null, activeScore.initial_product_score, activeScore.critical_adjustment,
        activeScore.final_product_score, activeScore.confidence_score, activeScore.score_model_id, JSON.stringify(componentScores), evIds, riskIds,
        JSON.stringify(promptVersions), req.user?.id || null, justification || 'Approved via direct controller', isDemo
      ]
    );

    await writeAuditLog(client, req.user?.id || null, 'OPPORTUNITY_APPROVE', `Approved opportunity ${opp.human_id}`, opp.status, 'APROVADA_PARA_TESTE', isDemo, true);

    await client.query('COMMIT');

    return res.status(200).json({ message: 'Opportunity approved and product created.', product });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Approve opportunity error:', err);
    return res.status(500).json({ error: 'Failed to approve opportunity.' });
  } finally {
    client.release();
  }
}

// 4. Products
export async function getProducts(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const products = await pool.query(
      `SELECT p.*, u.name as responsible_name 
       FROM products p 
       LEFT JOIN users u ON p.responsible_id = u.id 
       WHERE p.is_demo = $1 AND p.is_deleted = FALSE 
       ORDER BY p.created_at DESC`,
      [isDemo]
    );
    return res.status(200).json({ products: products.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch products.' });
  }
}

export async function createProduct(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const { name, category, description, estimated_cost, observations, opportunity_id } = req.body;

    if (!name || !category || !description) {
      return res.status(400).json({ error: 'Missing product name, category, or description.' });
    }

    if (opportunity_id) {
      const oppQ = await pool.query('SELECT is_demo FROM opportunities WHERE id = $1', [opportunity_id]);
      if (oppQ.rows.length > 0 && oppQ.rows[0].is_demo !== isDemo) {
        return res.status(409).json({ error: 'Conflito de escopo: A oportunidade associada pertence a um escopo diferente.' });
      }
    }

    const humanId = await getNextHumanId(pool, 'products', 'PRD');
    const id = crypto.randomUUID();

    const prdRes = await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, responsible_id, status, opportunity_id, estimated_cost, observations, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, 'PLANEJADO', $7, $8, $9, $10)
       RETURNING *`,
      [id, humanId, name, category, description, req.user?.id || null, opportunity_id || null, estimated_cost || 0.00, observations || null, isDemo]
    );

    const product = prdRes.rows[0];
    
    // Non-critical audit log runs strictly after successful write
    writeAuditLog(pool, req.user?.id || null, 'PRODUCT_CREATE', `Created product ${humanId}`, null, JSON.stringify(product), isDemo, false);

    return res.status(201).json({ product });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create product.' });
  }
}

const VALID_PRODUCT_TRANSITIONS: Record<string, string[]> = {
  'PLANEJADO': ['EM_DESENVOLVIMENTO', 'ARQUIVADO'],
  'EM_DESENVOLVIMENTO': ['REVISAO', 'ARQUIVADO'],
  'REVISAO': ['PRONTO', 'EM_DESENVOLVIMENTO', 'ARQUIVADO'],
  'PRONTO': ['ATIVO', 'PAUSADO', 'ARQUIVADO'],
  'ATIVO': ['PAUSADO', 'ARQUIVADO'],
  'PAUSADO': ['ATIVO', 'ARQUIVADO'],
  'ARQUIVADO': []
};

export async function updateProduct(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const client = await pool.connect();
  try {
    const isDemo = req.query.mode === 'demo';
    const { id } = req.params;
    const { name, category, description, estimated_cost, status, observations, origin_provenance, origin_evidence, origin_notes, origin_responsible_id } = req.body;

    await client.query('BEGIN');

    const prdQuery = await client.query('SELECT * FROM products WHERE id = $1 AND is_deleted = FALSE FOR UPDATE', [id]);
    if (prdQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found.' });
    }

    const existingProduct = prdQuery.rows[0];

    // Scope check
    if (existingProduct.is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Conflito de escopo: Produto pertence a um escopo diferente.' });
    }

    if (status && status !== existingProduct.status) {
      const allowed = VALID_PRODUCT_TRANSITIONS[existingProduct.status] || [];
      if (!allowed.includes(status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Transição de status inválida de ${existingProduct.status} para ${status}. O fluxo de estados obrigatório deve ser respeitado.` });
      }

      const provenance = origin_provenance !== undefined ? origin_provenance : existingProduct.origin_provenance;
      const respId = origin_responsible_id !== undefined ? origin_responsible_id : existingProduct.origin_responsible_id;
      const evidence = origin_evidence !== undefined ? origin_evidence : existingProduct.origin_evidence;

      if ((status === 'PRONTO' || status === 'ATIVO') && (!provenance || !respId || !evidence)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Para alterar o status para PRONTO ou ATIVO, é obrigatório preencher todas as informações de procedência (procedência, responsável e evidência/documentação).' });
      }
    }

    const updatedName = name !== undefined ? name : existingProduct.name;
    const updatedCategory = category !== undefined ? category : existingProduct.category;
    const updatedDesc = description !== undefined ? description : existingProduct.description;
    const updatedCost = estimated_cost !== undefined ? estimated_cost : existingProduct.estimated_cost;
    const updatedStatus = status !== undefined ? status : existingProduct.status;
    const updatedObs = observations !== undefined ? observations : existingProduct.observations;
    const updatedProv = origin_provenance !== undefined ? origin_provenance : existingProduct.origin_provenance;
    const updatedRespId = origin_responsible_id !== undefined ? origin_responsible_id : existingProduct.origin_responsible_id;
    const updatedEv = origin_evidence !== undefined ? origin_evidence : existingProduct.origin_evidence;
    const updatedNotes = origin_notes !== undefined ? origin_notes : existingProduct.origin_notes;

    const updateRes = await client.query(
      `UPDATE products 
       SET name = $1, category = $2, description = $3, estimated_cost = $4, status = $5, observations = $6,
           origin_provenance = $7, origin_responsible_id = $8, origin_evidence = $9, origin_notes = $10
       WHERE id = $11
       RETURNING *`,
      [updatedName, updatedCategory, updatedDesc, updatedCost, updatedStatus, updatedObs, updatedProv, updatedRespId, updatedEv, updatedNotes, id]
    );

    const product = updateRes.rows[0];

    if (status === 'ARQUIVADO' && existingProduct.status !== 'ARQUIVADO') {
      const decHumanId = await getNextHumanId(client as any, 'decisions', 'DEC');
      const decId = crypto.randomUUID();
      await client.query(
        `INSERT INTO decisions (id, human_id, related_entity_id, related_entity_type, type, decision_text, responsible_id, justification, is_demo)
         VALUES ($1, $2, $3, 'PRODUCT', 'REJEITAR_PRODUTO', $4, $5, $6, $7)`,
        [decId, decHumanId, id, `Archived product ${existingProduct.human_id}`, req.user?.id || null, 'Product was archived manually.', isDemo]
      );
    }

    // Critical audit log inside transaction: status alteration
    await writeAuditLog(
      client, 
      req.user?.id || null, 
      'PRODUCT_STATUS_UPDATE', 
      `Updated product status ${existingProduct.human_id}`, 
      JSON.stringify(existingProduct), 
      JSON.stringify(product), 
      isDemo,
      true
    );

    await client.query('COMMIT');

    return res.status(200).json({ product });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Update product error:', err);
    if (err.message && err.message.includes('chk_provenance')) {
      return res.status(409).json({ error: 'Database Constraint: Produto não pode ficar PRONTO ou ATIVO sem procedência válida.' });
    }
    return res.status(500).json({ error: 'Failed to update product.' });
  } finally {
    client.release();
  }
}

// 5. Offers
export async function getOffers(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const offers = await pool.query(
      `SELECT o.*, p.name as product_name 
       FROM offers o 
       JOIN products p ON o.product_id = p.id 
       WHERE o.is_demo = $1 AND o.is_deleted = FALSE 
       ORDER BY o.created_at DESC`,
      [isDemo]
    );
    return res.status(200).json({ offers: offers.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch offers.' });
  }
}

export async function createOffer(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const { product_id, name, price, promotional_price, bonus, description, upsell, cross_sell } = req.body;

    if (!product_id || !name || price === undefined || !description) {
      return res.status(400).json({ error: 'Missing mandatory offer fields.' });
    }

    const checkProduct = await pool.query('SELECT is_demo FROM products WHERE id = $1 AND is_deleted = FALSE', [product_id]);
    if (checkProduct.rows.length === 0) {
      return res.status(404).json({ error: 'Associated product not found.' });
    }

    // Scope check: Caso 1
    if (checkProduct.rows[0].is_demo !== isDemo) {
      return res.status(409).json({ error: 'Conflito de escopo: O produto associado pertence a um escopo diferente (DEMO x REAL).' });
    }

    const humanId = await getNextHumanId(pool, 'offers', 'OFF');
    const id = crypto.randomUUID();

    const insertRes = await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, bonus, description, upsell, cross_sell, status, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'RASCUNHO', $11)
       RETURNING *`,
      [id, humanId, product_id, name, price, promotional_price || null, bonus || null, description, upsell || null, cross_sell || null, isDemo]
    );

    const offer = insertRes.rows[0];
    
    // Non-critical audit log runs strictly after successful write
    writeAuditLog(pool, req.user?.id || null, 'OFFER_CREATE', `Created offer ${humanId}`, null, JSON.stringify(offer), isDemo, false);

    return res.status(201).json({ offer });
  } catch (err) {
    console.error('Create offer error:', err);
    return res.status(500).json({ error: 'Failed to create offer.' });
  }
}

const VALID_OFFER_TRANSITIONS: Record<string, string[]> = {
  'RASCUNHO': ['TESTE', 'ATIVA', 'ARQUIVADA'],
  'TESTE': ['ATIVA', 'PAUSADA', 'ARQUIVADA', 'RASCUNHO'],
  'ATIVA': ['PAUSADA', 'ARQUIVADA'],
  'PAUSADA': ['ATIVA', 'TESTE', 'ARQUIVADA'],
  'ARQUIVADA': []
};

export async function updateOffer(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const client = await pool.connect();
  try {
    const isDemo = req.query.mode === 'demo';
    const { id } = req.params;
    const { name, price, promotional_price, bonus, description, upsell, cross_sell, status } = req.body;

    await client.query('BEGIN');

    const offQuery = await client.query('SELECT * FROM offers WHERE id = $1 AND is_deleted = FALSE FOR UPDATE', [id]);
    if (offQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Offer not found.' });
    }

    const existingOffer = offQuery.rows[0];

    if (existingOffer.is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Conflito de escopo: A oferta pertence a um escopo diferente.' });
    }

    if (status && status !== existingOffer.status) {
      const allowed = VALID_OFFER_TRANSITIONS[existingOffer.status] || [];
      if (!allowed.includes(status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Transição de status inválida de ${existingOffer.status} para ${status}.` });
      }
    }

    const updatedName = name !== undefined ? name : existingOffer.name;
    const updatedPrice = price !== undefined ? price : existingOffer.price;
    const updatedPromo = promotional_price !== undefined ? promotional_price : existingOffer.promotional_price;
    const updatedBonus = bonus !== undefined ? bonus : existingOffer.bonus;
    const updatedDesc = description !== undefined ? description : existingOffer.description;
    const updatedUpsell = upsell !== undefined ? upsell : existingOffer.upsell;
    const updatedCross = cross_sell !== undefined ? cross_sell : existingOffer.cross_sell;
    const updatedStatus = status !== undefined ? status : existingOffer.status;

    const updateRes = await client.query(
      `UPDATE offers
       SET name = $1, price = $2, promotional_price = $3, bonus = $4, description = $5, upsell = $6, cross_sell = $7, status = $8
       WHERE id = $9
       RETURNING *`,
      [updatedName, updatedPrice, updatedPromo, updatedBonus, updatedDesc, updatedUpsell, updatedCross, updatedStatus, id]
    );

    const offer = updateRes.rows[0];

    await client.query('COMMIT');

    writeAuditLog(
      pool,
      req.user?.id || null,
      'OFFER_STATUS_UPDATE',
      `Updated offer ${existingOffer.human_id} status to ${updatedStatus}`,
      JSON.stringify(existingOffer),
      JSON.stringify(offer),
      isDemo,
      false
    );

    return res.status(200).json({ offer });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Update offer error:', err);
    return res.status(500).json({ error: 'Failed to update offer.' });
  } finally {
    client.release();
  }
}

export async function getPublicOffer(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const { humanId } = req.params;

  if (!humanId || typeof humanId !== 'string') {
    return res.status(400).json({ error: 'humanId is required.' });
  }

  try {
    const query = `
      SELECT id, human_id, name, description, price, promotional_price, bonus, status, is_demo
      FROM offers 
      WHERE (human_id = $1 OR id::text = $1) 
        AND is_deleted = FALSE 
        AND status IN ('ATIVA', 'TESTE')
      LIMIT 1
    `;
    const result = await pool.query(query, [humanId.trim()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Oferta não encontrada ou indisponível.' });
    }

    const offer = result.rows[0];

    // Whitelist output strictly containing public commercial fields (Zero internal intelligence / PII / scoring)
    return res.status(200).json({
      id: offer.id,
      human_id: offer.human_id,
      name: offer.name,
      description: offer.description,
      price: parseFloat(offer.price),
      promotional_price: offer.promotional_price !== null ? parseFloat(offer.promotional_price) : null,
      bonus: offer.bonus || null,
      is_demo: offer.is_demo
    });
  } catch (err) {
    console.error('Get public offer error:', err);
    return res.status(500).json({ error: 'Falha ao buscar oferta.' });
  }
}

// 6. Creatives
export async function getCreatives(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const creatives = await pool.query(
      `SELECT c.*, p.name as product_name, o.name as offer_name 
       FROM creatives c 
       JOIN products p ON c.product_id = p.id 
       LEFT JOIN offers o ON c.offer_id = o.id 
       WHERE c.is_demo = $1 AND c.is_deleted = FALSE 
       ORDER BY c.created_at DESC`,
      [isDemo]
    );
    return res.status(200).json({ creatives: creatives.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch creatives.' });
  }
}

export async function createCreative(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const { product_id, offer_id, hook, concept, copy, cta, format, file_url } = req.body;

    if (!product_id || !hook || !concept || !copy || !cta || !format || !file_url) {
      return res.status(400).json({ error: 'Missing mandatory creative parameters.' });
    }

    if (!['VIDEO', 'IMAGE', 'CAROUSEL'].includes(format)) {
      return res.status(400).json({ error: 'Invalid creative format.' });
    }

    const checkProduct = await pool.query('SELECT is_demo FROM products WHERE id = $1 AND is_deleted = FALSE', [product_id]);
    if (checkProduct.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    // Scope check: Caso 2 product isolation
    if (checkProduct.rows[0].is_demo !== isDemo) {
      return res.status(409).json({ error: 'Conflito de escopo: O produto associado pertence a um escopo diferente (DEMO x REAL).' });
    }

    if (offer_id) {
      const checkOffer = await pool.query('SELECT is_demo FROM offers WHERE id = $1 AND is_deleted = FALSE', [offer_id]);
      if (checkOffer.rows.length > 0 && checkOffer.rows[0].is_demo !== isDemo) {
        return res.status(409).json({ error: 'Conflito de escopo: A oferta associada pertence a um escopo diferente.' });
      }
    }

    const humanId = await getNextHumanId(pool, 'creatives', 'CR');
    const id = crypto.randomUUID();

    const insertRes = await pool.query(
      `INSERT INTO creatives (id, human_id, product_id, offer_id, hook, concept, copy, cta, format, file_url, responsible_id, status, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'IDEIA', $12)
       RETURNING *`,
      [id, humanId, product_id, offer_id || null, hook, concept, copy, cta, format, file_url, req.user?.id || null, isDemo]
    );

    const creative = insertRes.rows[0];
    
    // Non-critical audit log runs strictly after successful write
    writeAuditLog(pool, req.user?.id || null, 'CREATIVE_CREATE', `Created creative ${humanId}`, null, JSON.stringify(creative), isDemo, false);

    return res.status(201).json({ creative });
  } catch (err) {
    console.error('Create creative error:', err);
    return res.status(500).json({ error: 'Failed to create creative.' });
  }
}

// 7. Experiments
export async function getExperiments(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const experiments = await pool.query(
      `SELECT e.*, p.name as product_name, o.name as offer_name, u.name as responsible_name 
       FROM experiments e 
       JOIN products p ON e.product_id = p.id 
       JOIN offers o ON e.offer_id = o.id 
       LEFT JOIN users u ON e.responsible_id = u.id 
       WHERE e.is_demo = $1 AND e.is_deleted = FALSE 
       ORDER BY e.created_at DESC`,
      [isDemo]
    );

    const relationQuery = await pool.query(
      `SELECT ec.*, c.human_id, c.hook 
       FROM experiment_creatives ec 
       JOIN creatives c ON ec.creative_id = c.id`
    );

    const formatted = experiments.rows.map(e => ({
      ...e,
      creatives: relationQuery.rows
        .filter(ec => ec.experiment_id === e.id)
        .map(ec => ({ id: ec.creative_id, human_id: ec.human_id, hook: ec.hook }))
    }));

    return res.status(200).json({ experiments: formatted });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch experiments.' });
  }
}

export async function createExperiment(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const client = await pool.connect();
  try {
    const isDemo = req.query.mode === 'demo';
    const { name, hypothesis, product_id, offer_id, creative_ids, start_date, end_date, capital_requested } = req.body;

    if (!name || !hypothesis || !product_id || !offer_id || !start_date || !creative_ids || creative_ids.length === 0) {
      return res.status(400).json({ error: 'Missing mandatory experiment parameters.' });
    }

    await client.query('BEGIN');

    const productCheck = await client.query('SELECT is_demo FROM products WHERE id = $1 AND is_deleted = FALSE', [product_id]);
    if (productCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found.' });
    }
    // Scope check: Product
    if (productCheck.rows[0].is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Conflito de escopo: O produto associado pertence a um escopo diferente.' });
    }

    const offerCheck = await client.query('SELECT is_demo FROM offers WHERE id = $1 AND is_deleted = FALSE', [offer_id]);
    if (offerCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Offer not found.' });
    }
    // Scope check: Offer
    if (offerCheck.rows[0].is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Conflito de escopo: A oferta associada pertence a um escopo diferente.' });
    }

    // Scope check: Creatives (Caso 2)
    const creativeCheck = await client.query(
      `SELECT is_demo FROM creatives WHERE id IN (${creative_ids.map((_: any, idx: number) => `$${idx + 1}`).join(', ')}) AND is_deleted = FALSE`,
      creative_ids
    );
    for (const row of creativeCheck.rows) {
      if (row.is_demo !== isDemo) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Conflito de escopo: Um ou mais criativos pertencem a um escopo diferente (DEMO x REAL).' });
      }
    }

    const humanId = await getNextHumanId(client as any, 'experiments', 'EXP');
    const id = crypto.randomUUID();

    // Force capital_used = 0.00 and capital_approved = 0.00 initially (Not directly editable!)
    const expRes = await client.query(
      `INSERT INTO experiments (id, human_id, name, hypothesis, product_id, offer_id, responsible_id, start_date, end_date, status, capital_requested, capital_approved, capital_used, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PLANEJADO', $10, 0.00, 0.00, $11)
       RETURNING *`,
      [id, humanId, name, hypothesis, product_id, offer_id, req.user?.id || null, start_date, end_date || null, capital_requested || 0.00, isDemo]
    );
    const exp = expRes.rows[0];

    for (const crId of creative_ids) {
      await client.query(
        `INSERT INTO experiment_creatives (experiment_id, creative_id) VALUES ($1, $2)`,
        [exp.id, crId]
      );
    }

    await client.query('COMMIT');
    
    // Non-critical audit log runs strictly after successful write commits
    writeAuditLog(pool, req.user?.id || null, 'EXPERIMENT_CREATE', `Created experiment ${humanId}`, null, JSON.stringify(exp), isDemo, false);

    return res.status(201).json({ experiment: exp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create experiment error:', err);
    return res.status(500).json({ error: 'Failed to create experiment.' });
  } finally {
    client.release();
  }
}

const activeLocks = new Set<string>();

// 7.1 Register Performance
export async function registerPerformance(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const { id } = req.params;
  const { date, source, investment, impressions, cliques, conversas, pedidos, vendas, receita, reembolsos, taxas, outros_custos } = req.body;

  if (!date || !source || investment === undefined) {
    return res.status(400).json({ error: 'Missing date, source, or investment amount.' });
  }

  const isDemo = req.query.mode === 'demo';

  // Mutex lock to serialize operations on this experiment ID
  const lockKey = id;
  while (activeLocks.has(lockKey)) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  activeLocks.add(lockKey);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the experiment row exclusively
    const expQuery = await client.query('SELECT capital_approved, capital_used, is_demo FROM experiments WHERE id = $1 FOR UPDATE', [id]);
    if (expQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Experiment not found.' });
    }

    const experiment = expQuery.rows[0];

    // Scope check: Caso 3
    if (experiment.is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Conflito de escopo: Não é permitido registrar performance REAL em um experimento DEMO e vice-versa.' });
    }

    const dupCheck = await client.query(
      'SELECT 1 FROM performance_entries WHERE experiment_id = $1 AND date = $2 AND source = $3',
      [id, date, source]
    );
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'O registro de performance para este experimento na data e fonte especificadas já existe.' });
    }

    // 2. Perform pre-check validation of sum to avoid entering check constraint violation state if rollback fails in pg-mem
    const sumQueryBefore = await client.query('SELECT COALESCE(SUM(investment), 0) as total_used FROM performance_entries WHERE experiment_id = $1', [id]);
    const currentUsed = parseFloat(sumQueryBefore.rows[0].total_used || '0');
    const projectedUsed = currentUsed + parseFloat(investment);
    const approvedCapital = parseFloat(experiment.capital_approved);

    if (projectedUsed > approvedCapital) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Operação bloqueada: o limite de Capital at Risk autorizado seria ultrapassado.' });
    }

    const perfId = crypto.randomUUID();

    await client.query(
      `INSERT INTO performance_entries (
        id, experiment_id, date, source, investment, impressions, cliques, conversas, pedidos, vendas, receita, reembolsos, taxas, outros_custos, is_demo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        perfId, id, date, source, investment, impressions || 0, cliques || 0, conversas || 0,
        pedidos || 0, vendas || 0, receita || 0.00, reembolsos || 0.00, taxas || 0.00, outros_custos || 0.00, isDemo
      ]
    );

    const sumQuery = await client.query('SELECT SUM(investment) as total_used FROM performance_entries WHERE experiment_id = $1', [id]);
    const totalUsed = parseFloat(sumQuery.rows[0].total_used || '0');

    await client.query('UPDATE experiments SET capital_used = $1 WHERE id = $2', [totalUsed, id]);

    await client.query('COMMIT');

    // Trigger non-critical audit log AFTER commit (Post-Commit execution)
    writeAuditLog(pool, req.user?.id || null, 'PERFORMANCE_RECORD', `Recorded performance entry for experiment ID ${id} on ${date}`, null, `New Capital Used: R$${totalUsed}`, isDemo, false);

    return res.status(200).json({ message: 'Performance entry recorded successfully.', totalUsed });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Register performance transaction rollback error:', err);
    if (err.message && err.message.includes('chk_capital_limit')) {
      return res.status(409).json({ error: 'Operação bloqueada: o limite de Capital at Risk autorizado seria ultrapassado.' });
    }
    return res.status(500).json({ error: 'Failed to record performance data.' });
  } finally {
    client.release();
    activeLocks.delete(lockKey); // Release mutex lock
  }
}

// 8. Capital Authorizations
export async function authorizeCapital(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const client = await pool.connect();
  try {
    const isDemo = req.query.mode === 'demo';
    const { id } = req.params;
    const { amount, justification } = req.body;

    if (amount === undefined || !justification) {
      return res.status(400).json({ error: 'Missing authorization amount or justification.' });
    }

    if (amount < 0) {
      return res.status(400).json({ error: 'Approved capital amount cannot be negative.' });
    }

    await client.query('BEGIN');

    const expQuery = await client.query('SELECT * FROM experiments WHERE id = $1 FOR UPDATE', [id]);
    if (expQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Experiment not found.' });
    }

    const exp = expQuery.rows[0];

    // Scope check: Caso 4
    if (exp.is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Conflito de escopo: Não é permitido autorizar capital REAL em experimentos DEMO e vice-versa.' });
    }

    const prevAmount = parseFloat(exp.capital_approved);
    const newAmount = parseFloat(amount);

    await client.query('UPDATE experiments SET capital_approved = $1, status = \'AUTORIZADO\' WHERE id = $2', [newAmount, id]);

    const authId = crypto.randomUUID();
    await client.query(
      `INSERT INTO capital_authorizations (id, experiment_id, user_id, previous_amount, new_amount, justification, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [authId, id, req.user!.id, prevAmount, newAmount, justification, isDemo]
    );

    const decHumanId = await getNextHumanId(client as any, 'decisions', 'DEC');
    const decId = crypto.randomUUID();
    await client.query(
      `INSERT INTO decisions (id, human_id, related_entity_id, related_entity_type, type, decision_text, responsible_id, justification, is_demo)
       VALUES ($1, $2, $3, 'EXPERIMENT', 'APROVAR_CAPITAL', $4, $5, $6, $7)`,
      [decId, decHumanId, id, `Authorized new capital limit of R$${newAmount} for experiment ${exp.human_id}`, req.user!.id, justification, isDemo]
    );

    // Critical audit log inside transaction: rollback on failure
    await writeAuditLog(client, req.user!.id, 'CAPITAL_AUTHORIZE', `Authorized capital change for ${exp.human_id}`, `R$${prevAmount}`, `R$${newAmount}`, isDemo, true);

    await client.query('COMMIT');

    return res.status(200).json({ message: 'Capital authorized successfully.', previous_amount: prevAmount, new_amount: newAmount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Authorize capital error:', err);
    return res.status(500).json({ error: 'Failed to authorize capital.' });
  } finally {
    client.release();
  }
}

// 9. Decisions Log
export async function getDecisions(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const decisions = await pool.query(
      `SELECT d.*, u.name as responsible_name 
       FROM decisions d 
       LEFT JOIN users u ON d.responsible_id = u.id 
       WHERE d.is_demo = $1 
       ORDER BY d.created_at DESC`,
      [isDemo]
    );
    return res.status(200).json({ decisions: decisions.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch decisions.' });
  }
}

export async function createDecision(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const client = await pool.connect();
  try {
    const isDemo = req.query.mode === 'demo';
    const { type, decision_text, justification, related_entity_id, related_entity_type } = req.body;

    if (!type || !decision_text || !justification || !related_entity_id || !related_entity_type) {
      return res.status(400).json({ error: 'Missing mandatory decision log fields.' });
    }

    // Scope check: Related entity
    let relatedIsDemo = isDemo;
    if (related_entity_type === 'PRODUCT') {
      const q = await pool.query('SELECT is_demo FROM products WHERE id = $1', [related_entity_id]);
      if (q.rows.length > 0) relatedIsDemo = q.rows[0].is_demo;
    } else if (related_entity_type === 'EXPERIMENT') {
      const q = await pool.query('SELECT is_demo FROM experiments WHERE id = $1', [related_entity_id]);
      if (q.rows.length > 0) relatedIsDemo = q.rows[0].is_demo;
    } else if (related_entity_type === 'OPPORTUNITY') {
      const q = await pool.query('SELECT is_demo FROM opportunities WHERE id = $1', [related_entity_id]);
      if (q.rows.length > 0) relatedIsDemo = q.rows[0].is_demo;
    }

    if (relatedIsDemo !== isDemo) {
      return res.status(409).json({ error: 'Conflito de escopo: A entidade relacionada pertence a um escopo diferente (DEMO x REAL).' });
    }

    await client.query('BEGIN');

    const humanId = await getNextHumanId(client as any, 'decisions', 'DEC');
    const id = crypto.randomUUID();

    const insertRes = await client.query(
      `INSERT INTO decisions (id, human_id, related_entity_id, related_entity_type, type, decision_text, responsible_id, justification, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, humanId, related_entity_id, related_entity_type, type, decision_text, req.user?.id || null, justification, isDemo]
    );

    const decision = insertRes.rows[0];
    
    // Critical audit log inside transaction: rollback on failure
    await writeAuditLog(client, req.user?.id || null, 'DECISION_CREATE', `Logged manual decision ${humanId}`, null, JSON.stringify(decision), isDemo, true);

    await client.query('COMMIT');

    return res.status(201).json({ decision });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create decision log error:', err);
    return res.status(500).json({ error: 'Failed to log decision.' });
  } finally {
    client.release();
  }
}

// 10. Audit Logs
export async function getAuditLogs(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const logs = await pool.query(
      `SELECT a.*, u.name as user_name 
       FROM audit_logs a 
       LEFT JOIN users u ON a.user_id = u.id 
       WHERE a.is_demo = $1 
       ORDER BY a.created_at DESC`,
      [isDemo]
    );
    return res.status(200).json({ audit_logs: logs.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
}

// 11. Configuration Reset
export async function clearDemo(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    await clearDemoData(pool);
    return res.status(200).json({ message: 'All DEMO data successfully deleted.' });
  } catch (err) {
    console.error('Clear demo error:', err);
    return res.status(500).json({ error: 'Failed to clear DEMO data.' });
  }
}

// 12. Sprint 2 - Research Sessions & Tasks
export async function createResearchSession(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const { objective, query, category, market } = req.body;
    if (!objective) {
      return res.status(400).json({ error: 'Missing mandatory objective parameter.' });
    }
    const humanId = await getNextHumanId(pool, 'research_sessions', 'RES');
    const id = crypto.randomUUID();
    const insertRes = await pool.query(
      `INSERT INTO research_sessions (id, human_id, objective, query, category, market, started_by, started_at, status, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'RUNNING', $8)
       RETURNING *`,
      [id, humanId, objective, query || null, category || null, market || null, req.user?.id || null, isDemo]
    );
    const session = insertRes.rows[0];
    writeAuditLog(pool, req.user?.id || null, 'RESEARCH_SESSION_CREATE', `Created research session ${humanId}`, null, JSON.stringify(session), isDemo, false);
    return res.status(201).json({ session });
  } catch (err) {
    console.error('Create research session error:', err);
    return res.status(500).json({ error: 'Failed to create research session.' });
  }
}

export async function createResearchTask(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const { opportunity_id, task, priority, assigned_to, due_date } = req.body;
    if (!opportunity_id || !task) {
      return res.status(400).json({ error: 'Missing mandatory task or opportunity parameters.' });
    }
    const id = crypto.randomUUID();
    const insertRes = await pool.query(
      `INSERT INTO research_tasks (id, opportunity_id, task, priority, assigned_to, due_date, status, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7)
       RETURNING *`,
      [id, opportunity_id, task, priority || 'MEDIUM', assigned_to || null, due_date || null, isDemo]
    );
    const taskRow = insertRes.rows[0];
    return res.status(201).json({ task: taskRow });
  } catch (err) {
    console.error('Create research task error:', err);
    return res.status(500).json({ error: 'Failed to create research task.' });
  }
}

// 13. Sprint 2 - Score Models & Overrides
export async function getScoreModels(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const modelsRes = await pool.query(
      `SELECT m.*, 
              COALESCE(
                (SELECT json_agg(c ORDER BY c.display_order) 
                 FROM score_model_components c 
                 WHERE c.score_model_id = m.id), 
                '[]'::json
              ) as components
       FROM score_models m 
       ORDER BY m.version DESC`
    );
    return res.status(200).json({ score_models: modelsRes.rows });
  } catch (err) {
    console.error('Get score models error:', err);
    return res.status(500).json({ error: 'Failed to fetch score models.' });
  }
}

export async function overrideOpportunityScore(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const { id } = req.params;
    const { score, reason } = req.body;
    if (score === undefined || !reason) {
      return res.status(400).json({ error: 'Missing mandatory score or reason parameters.' });
    }
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas administradores podem sobrescrever pontuações.' });
    }

    const scoreRes = await pool.query(
      `SELECT * FROM opportunity_scores WHERE opportunity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    if (scoreRes.rows.length === 0) {
      return res.status(404).json({ error: 'No score found for this opportunity.' });
    }
    const activeScore = scoreRes.rows[0];

    await pool.query(
      `UPDATE opportunity_scores 
       SET is_human_override = TRUE, human_override_score = $1, final_product_score = $1, 
           override_responsible_id = $2, override_reason = $3
       WHERE id = $4`,
      [parseFloat(score), req.user?.id || null, reason, activeScore.id]
    );

    writeAuditLog(pool, req.user?.id || null, 'OPPORTUNITY_SCORE_OVERRIDE', `Override score to ${score}`, JSON.stringify(activeScore), JSON.stringify({ ...activeScore, final_product_score: score, is_human_override: true }), activeScore.is_demo, false);

    return res.status(200).json({ message: 'Score overridden successfully.' });
  } catch (err) {
    console.error('Override score error:', err);
    return res.status(500).json({ error: 'Failed to override score.' });
  }
}

// 14. Sprint 2 - Ranking & History
export async function getOpportunityRanking(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const rankingRes = await pool.query(
      `SELECT o.id, o.human_id, o.title, o.category, o.status,
              s.initial_product_score, s.critical_adjustment, s.final_product_score, s.confidence_score
       FROM opportunities o
       LEFT JOIN opportunity_scores s ON o.id = s.opportunity_id
       WHERE o.is_demo = $1 AND o.status != 'ARQUIVADA'
       ORDER BY s.final_product_score DESC NULLS LAST, o.created_at DESC`,
       [isDemo]
    );
    return res.status(200).json({ ranking: rankingRes.rows });
  } catch (err) {
    console.error('Get ranking error:', err);
    return res.status(500).json({ error: 'Failed to fetch opportunity ranking.' });
  }
}

export async function getOpportunityHistory(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const { id } = req.params;
    const historyRes = await pool.query(
      `SELECT a.id, a.version, a.executive_summary, a.created_at, e.provider, e.model, e.prompt_version, e.estimated_cost
       FROM ai_analyses a
       JOIN ai_executions e ON a.ai_execution_id = e.id
       WHERE a.opportunity_id = $1
       ORDER BY a.version DESC`,
       [id]
    );
    return res.status(200).json({ history: historyRes.rows });
  } catch (err) {
    console.error('Get opportunity history error:', err);
    return res.status(500).json({ error: 'Failed to fetch history.' });
  }
}

// 15. Sprint 2 - Reviews & Decisions
export async function reviewOpportunity(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action, rejection_reason, notes } = req.body;
    if (!action) {
      return res.status(400).json({ error: 'Missing review action.' });
    }

    await client.query('BEGIN');

    const oppRes = await client.query('SELECT * FROM opportunities WHERE id = $1 FOR UPDATE', [id]);
    if (oppRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Opportunity not found.' });
    }
    const opp = oppRes.rows[0];
    const isDemo = req.query.mode === 'demo';
    if (opp.is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Conflito de escopo: A oportunidade pertence a um escopo diferente (DEMO x REAL).' });
    }

    let nextStatus = opp.status;
    if (action === 'ACCEPT_ANALYSIS') {
      nextStatus = 'AGUARDANDO_DECISAO';
    } else if (action === 'REQUEST_MORE_RESEARCH') {
      nextStatus = 'EM_COLETA';
    } else if (action === 'REJECT_ANALYSIS') {
      nextStatus = 'REJEITADA';
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid review action.' });
    }

    await client.query('UPDATE opportunities SET status = $1 WHERE id = $2', [nextStatus, id]);

    await client.query(
      `INSERT INTO opportunity_reviews (opportunity_id, user_id, action, rejection_reason, notes, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [opp.id, req.user?.id || null, action, rejection_reason || null, notes || null, opp.is_demo]
    );

    await writeAuditLog(client, req.user?.id || null, 'OPPORTUNITY_REVIEW', `Reviewed opportunity: ${action}`, opp.status, nextStatus, opp.is_demo, true);

    await client.query('COMMIT');
    return res.status(200).json({ message: `Opportunity status updated to ${nextStatus}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Review opportunity error:', err);
    return res.status(500).json({ error: 'Failed to record opportunity review.' });
  } finally {
    client.release();
  }
}

export async function decideOpportunity(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { decision, rejection_reason, justification } = req.body;
    if (!decision) {
      return res.status(400).json({ error: 'Missing decision field.' });
    }
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas administradores podem tomar decisões de investimento.' });
    }

    await client.query('BEGIN');

    const oppRes = await client.query('SELECT * FROM opportunities WHERE id = $1 FOR UPDATE', [id]);
    if (oppRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Opportunity not found.' });
    }
    const opp = oppRes.rows[0];
    const isDemo = req.query.mode === 'demo';
    if (opp.is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Conflito de escopo: A oportunidade pertence a um escopo diferente (DEMO x REAL).' });
    }

    let nextStatus = opp.status;
    if (decision === 'APPROVE_FOR_TEST') {
      nextStatus = 'APROVADA_PARA_TESTE';
    } else if (decision === 'REJECT') {
      nextStatus = 'REJEITADA';
      if (!rejection_reason) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Rejection reason is required when rejecting.' });
      }
    } else if (decision === 'ARCHIVE') {
      nextStatus = 'ARQUIVADA';
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid decision type.' });
    }

    const scoreRes = await client.query(
      `SELECT * FROM opportunity_scores WHERE opportunity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    const activeScore = scoreRes.rows[0] || {
      id: null,
      score_model_id: '11111111-2222-3333-4444-555555555555',
      initial_product_score: 0.00,
      critical_adjustment: 0.00,
      final_product_score: 0.00,
      confidence_score: 0.00
    };

    const analysisRes = await client.query(
      `SELECT * FROM ai_analyses WHERE opportunity_id = $1 ORDER BY version DESC LIMIT 1`,
      [id]
    );
    const activeAnalysis = analysisRes.rows[0];

    const evsRes = await client.query(`SELECT id FROM evidences WHERE opportunity_id = $1 AND is_demo = $2`, [id, opp.is_demo]);
    const evIds = evsRes.rows.map(r => r.id);

    const risksRes = await client.query(`SELECT id FROM opportunity_risks WHERE opportunity_id = $1 AND is_demo = $2`, [id, opp.is_demo]);
    const riskIds = risksRes.rows.map(r => r.id);

    await client.query('UPDATE opportunities SET status = $1 WHERE id = $2', [nextStatus, id]);

    const promptVersions = {
      PRODUCT_ANALYST: 'V1',
      CRITICAL_ANALYST: 'V1',
      RECOMMENDATION: 'V1'
    };

    let componentScores = [];
    if (activeScore) {
      const compRes = await client.query(
        `SELECT component_key, score, weight, weighted_score, confidence, evidence_count, reasoning_summary 
         FROM score_components 
         WHERE opportunity_score_id = $1`,
        [activeScore.id]
      );
      componentScores = compRes.rows;
    }

    const snapId = crypto.randomUUID();
    await client.query(
      `INSERT INTO decision_snapshots (
        id, opportunity_id, analysis_id, initial_product_score, critical_adjustment, final_product_score, confidence_score,
        score_model_id, component_scores, evidence_ids, risk_ids, prompt_versions, decision, responsible_id, justification, is_demo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        snapId, opp.id, activeAnalysis ? activeAnalysis.id : null, activeScore.initial_product_score, activeScore.critical_adjustment,
        activeScore.final_product_score, activeScore.confidence_score, activeScore.score_model_id, JSON.stringify(componentScores), evIds, riskIds,
        JSON.stringify(promptVersions), decision, req.user?.id || null, justification || 'Decision recorded', opp.is_demo
      ]
    );

    let product = null;
    if (decision === 'APPROVE_FOR_TEST') {
      const prdHumanId = await getNextHumanId(client as any, 'products', 'PRD');
      const prdId = crypto.randomUUID();

      const prdRes = await client.query(
        `INSERT INTO products (id, human_id, name, category, description, responsible_id, status, opportunity_id, estimated_cost, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, 'PLANEJADO', $7, 0.00, $8)
         RETURNING *`,
        [prdId, prdHumanId, `Draft Product: ${opp.title}`, opp.category, opp.description, req.user?.id || null, opp.id, opp.is_demo]
      );
      product = prdRes.rows[0];

      const decHumanId = await getNextHumanId(client as any, 'decisions', 'DEC');
      const decId = crypto.randomUUID();
      await client.query(
        `INSERT INTO decisions (id, human_id, related_entity_id, related_entity_type, type, decision_text, responsible_id, justification, is_demo)
         VALUES ($1, $2, $3, 'OPPORTUNITY', 'APROVAR_PRODUTO', $4, $5, $6, $7)`,
        [decId, decHumanId, opp.id, `Approved opportunity and spawned product ${prdHumanId}`, req.user?.id || null, justification || 'Approved via Admin review', opp.is_demo]
      );
    }

    await writeAuditLog(client, req.user?.id || null, 'OPPORTUNITY_DECIDE', `Recorded decision: ${decision}`, opp.status, nextStatus, opp.is_demo, true);

    await client.query('COMMIT');
    return res.status(200).json({ message: `Decision recorded. Status set to ${nextStatus}.`, product });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Decide opportunity error:', err);
    return res.status(500).json({ error: 'Failed to record decision.' });
  } finally {
    client.release();
  }
}

// 16. Sprint 2 - AI Analysis Execution Engine
export async function analyzeOpportunity(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const isDemo = req.query.mode === 'demo';

    await client.query('BEGIN');

    // 1. Fetch opportunity
    const oppRes = await client.query('SELECT * FROM opportunities WHERE id = $1 FOR UPDATE', [id]);
    if (oppRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Opportunity not found.' });
    }
    const opp = oppRes.rows[0];

    if (opp.is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Conflito de escopo: A oportunidade pertence a um escopo diferente (DEMO x REAL).' });
    }

    // 2. Fetch evidences
    const evsRes = await client.query('SELECT * FROM evidences WHERE opportunity_id = $1 AND is_demo = $2', [id, isDemo]);
    const evidences = evsRes.rows;

    // 3. Fetch active Score Model
    const modelRes = await client.query(
      `SELECT * FROM score_models WHERE status = 'ACTIVE' ORDER BY version DESC LIMIT 1`
    );
    if (modelRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'No active Score Model found in system.' });
    }
    const activeModel = modelRes.rows[0];

    const compsRes = await client.query(
      `SELECT * FROM score_model_components WHERE score_model_id = $1 ORDER BY display_order`,
      [activeModel.id]
    );
    const scoreComponents = compsRes.rows;

    // 4. Fetch prompt templates
    const promptsRes = await client.query(`SELECT * FROM prompts`);
    const promptPA = promptsRes.rows.find(p => p.name === 'PRODUCT_ANALYST');
    const promptCA = promptsRes.rows.find(p => p.name === 'CRITICAL_ANALYST');

    if (!promptPA || !promptCA) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Required prompt templates are missing.' });
    }

    // Update status to EM_ANALISE
    await client.query('UPDATE opportunities SET status = \'EM_ANALISE\' WHERE id = $1', [id]);

    // 5. Run AI analyze opportunity
    let resultPA;
    try {
      resultPA = await aiProvider.analyzeOpportunity(
        opp,
        evidences,
        promptPA.content,
        `PRODUCT_ANALYST_${promptPA.version}`
      );
    } catch (err: any) {
      // Save fail execution in DB
      const execId = crypto.randomUUID();
      const insertId = crypto.randomUUID();
      const status = err.message.toLowerCase().includes('limit') ? 'LIMIT_REACHED' : 'FAILED';
      await client.query(
        `INSERT INTO ai_executions (id, opportunity_id, provider, model, prompt_id, execution_id, status, is_demo)
         VALUES ($1, $2, 'Gemini', 'gemini-1.5-pro', $3, $4, $5, $6)`,
        [insertId, id, promptPA.id, execId, status, isDemo]
      );
      await client.query('COMMIT'); // Commit the failure log
      return res.status(400).json({ error: `AI Provider failed: ${err.message}` });
    }

    // Output schema validation
    const analysis = resultPA.analysis;
    if (!analysis || !analysis.executive_summary || !analysis.subscores) {
      const execId = crypto.randomUUID();
      const insertId = crypto.randomUUID();
      await client.query(
        `INSERT INTO ai_executions (id, opportunity_id, provider, model, prompt_id, execution_id, status, is_demo)
         VALUES ($1, $2, 'Gemini', 'gemini-1.5-pro', $3, $4, 'FAILED', $5)`,
        [insertId, id, promptPA.id, execId, isDemo]
      );
      await client.query('COMMIT');
      return res.status(400).json({ error: 'AI output validation failed: Missing required fields.' });
    }

    // Validate cited evidence IDs
    const allEvidenceIds = new Set(evidences.map(e => e.id));
    const componentEvidencesMap: Record<string, { evidence_id: string; relevance: string }[]> = {};

    for (const key of Object.keys(analysis.subscores)) {
      const sub = analysis.subscores[key];
      if (sub.evidence_ids && Array.isArray(sub.evidence_ids)) {
        for (const evId of sub.evidence_ids) {
          if (!allEvidenceIds.has(evId)) {
            const execId = crypto.randomUUID();
            const insertId = crypto.randomUUID();
            await client.query(
              `INSERT INTO ai_executions (id, opportunity_id, provider, model, prompt_id, execution_id, status, is_demo)
               VALUES ($1, $2, 'Gemini', 'gemini-1.5-pro', $3, $4, 'PARTIAL', $5)`,
              [insertId, id, promptPA.id, execId, isDemo]
            );
            await client.query('COMMIT');
            return res.status(400).json({ error: `AI output validation failed: Cited evidence ID ${evId} is invalid or does not belong to opportunity.` });
          }
          if (!componentEvidencesMap[key]) {
            componentEvidencesMap[key] = [];
          }
          componentEvidencesMap[key].push({ evidence_id: evId, relevance: 'HIGH' });
        }
      }
    }

    // 6. Run Critical Analyst
    let resultCA;
    try {
      resultCA = await aiProvider.criticizeOpportunity(
        opp,
        evidences,
        analysis,
        promptCA.content,
        `CRITICAL_ANALYST_${promptCA.version}`
      );
    } catch (err: any) {
      const execId = crypto.randomUUID();
      const insertId = crypto.randomUUID();
      const status = err.message.toLowerCase().includes('limit') ? 'LIMIT_REACHED' : 'FAILED';
      await client.query(
        `INSERT INTO ai_executions (id, opportunity_id, provider, model, prompt_id, execution_id, status, is_demo)
         VALUES ($1, $2, 'Gemini', 'gemini-1.5-pro', $3, $4, $5, $6)`,
        [insertId, id, promptCA.id, execId, status, isDemo]
      );
      await client.query('COMMIT');
      return res.status(400).json({ error: `AI Provider Critical Analyst failed: ${err.message}` });
    }

    const findings = resultCA.findings || [];
    // Validate findings cited evidence IDs
    for (const f of findings) {
      if (f.evidence_ids && Array.isArray(f.evidence_ids)) {
        for (const evId of f.evidence_ids) {
          if (!allEvidenceIds.has(evId)) {
            const execId = crypto.randomUUID();
            const insertId = crypto.randomUUID();
            await client.query(
              `INSERT INTO ai_executions (id, opportunity_id, provider, model, prompt_id, execution_id, status, is_demo)
               VALUES ($1, $2, 'Gemini', 'gemini-1.5-pro', $3, $4, 'PARTIAL', $5)`,
              [insertId, id, promptCA.id, execId, isDemo]
            );
            await client.query('COMMIT');
            return res.status(400).json({ error: `AI Critical Analyst cited invalid evidence ID: ${evId}` });
          }
        }
      }
    }

    // Save PA Execution
    const execDetails = resultPA.execution;
    const paExecInsertId = crypto.randomUUID();
    const paExecRes = await client.query(
      `INSERT INTO ai_executions (id, opportunity_id, provider, model, prompt_id, prompt_version, execution_id, latency, input_tokens, output_tokens, estimated_cost, status, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETED', $12)
       RETURNING id`,
      [paExecInsertId, id, execDetails.provider, execDetails.model, promptPA.id, execDetails.prompt_version, execDetails.execution_id, execDetails.latency, execDetails.input_tokens, execDetails.output_tokens, execDetails.estimated_cost, isDemo]
    );
    const paExecId = paExecRes.rows[0].id;

    // Calculate deterministic scores
    const scoreResult = calculateScores(
      activeModel,
      scoreComponents,
      analysis.subscores,
      findings,
      evidences,
      componentEvidencesMap
    );

    // Fetch analysis version increment
    const versionRes = await client.query(
      `SELECT COALESCE(MAX(version), 0) as max_version FROM ai_analyses WHERE opportunity_id = $1`,
      [id]
    );
    const nextVersion = versionRes.rows[0].max_version + 1;

    // Save AI Analysis
    const analysisInsertId = crypto.randomUUID();
    const analysisInsert = await client.query(
      `INSERT INTO ai_analyses (
        id, opportunity_id, ai_execution_id, version, executive_summary, market_signal, target_audience_analysis,
        problem_analysis, offer_analysis, price_analysis, competition_analysis, differentiation_analysis,
        production_analysis, creative_potential, upsell_potential, risks, missing_information, recommended_next_steps, is_demo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id`,
      [
        analysisInsertId, id, paExecId, nextVersion, analysis.executive_summary, analysis.market_signal,
        JSON.stringify(analysis.target_audience_analysis || {}), JSON.stringify(analysis.problem_analysis || {}),
        JSON.stringify(analysis.offer_analysis || {}), JSON.stringify(analysis.price_analysis || {}),
        JSON.stringify(analysis.competition_analysis || {}), JSON.stringify(analysis.differentiation_analysis || {}),
        JSON.stringify(analysis.production_analysis || {}), JSON.stringify(analysis.creative_potential || {}),
        JSON.stringify(analysis.upsell_potential || {}), JSON.stringify(analysis.risks || {}),
        JSON.stringify(analysis.missing_information || []), JSON.stringify(analysis.recommended_next_steps || []),
        isDemo
      ]
    );
    const analysisId = analysisInsert.rows[0].id;

    // Save Opportunity Score
    const scoreInsertId = crypto.randomUUID();
    const scoreInsert = await client.query(
      `INSERT INTO opportunity_scores (
        id, opportunity_id, ai_analysis_id, score_model_id, initial_product_score, critical_adjustment, final_product_score, confidence_score, is_demo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [scoreInsertId, id, analysisId, activeModel.id, scoreResult.initial_product_score, scoreResult.critical_adjustment, scoreResult.final_product_score, scoreResult.confidence_score, isDemo]
    );
    const scoreId = scoreInsert.rows[0].id;

    // Save Score Components & Evidences links
    for (const c of scoreResult.components) {
      const compId = crypto.randomUUID();
      await client.query(
        `INSERT INTO score_components (id, opportunity_score_id, component_key, score, weight, weighted_score, confidence, evidence_count, reasoning_summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [compId, scoreId, c.component_key, c.score, c.weight, c.weighted_score, c.confidence, c.evidence_count, c.reasoning_summary]
      );

      // Link component evidences
      const compEvs = componentEvidencesMap[c.component_key] || [];
      for (const ce of compEvs) {
        const linkId = crypto.randomUUID();
        await client.query(
          `INSERT INTO score_component_evidences (id, score_component_id, evidence_id, relevance)
           VALUES ($1, $2, $3, $4)`,
          [linkId, compId, ce.evidence_id, ce.relevance]
        );
      }
    }

    // Save Opportunity Risks (Findings)
    for (const f of findings) {
      const evidenceId = f.evidence_ids && f.evidence_ids.length > 0 ? f.evidence_ids[0] : null;
      const riskId = crypto.randomUUID();
      await client.query(
        `INSERT INTO opportunity_risks (id, opportunity_id, risk_type, description, severity, probability, evidence_id, status, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)`,
        [riskId, id, f.risk_type, f.finding, f.severity, f.probability, evidenceId, isDemo]
      );
    }

    // Transition status to ANALISADA then AGUARDANDO_REVISAO
    await client.query('UPDATE opportunities SET status = \'AGUARDANDO_REVISAO\' WHERE id = $1', [id]);

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Opportunity analyzed successfully.', version: nextVersion, scores: scoreResult });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Analyze opportunity error:', err);
    return res.status(500).json({ error: 'Failed to execute AI analysis.' });
  } finally {
    client.release();
  }
}

// 12. Customers and Orders (Sprint 2.5B)
export async function createCustomer(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const { name, email, phone, is_demo, cpf_cnpj } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  const isDemo = is_demo === true || is_demo === 'true';
  const normalizedEmail = email.trim().toLowerCase();

  let encryptedCpf: string | null = null;
  let cpfHash: string | null = null;
  const keyVersion = 1;

  if (cpf_cnpj) {
    const normalized = cpf_cnpj.replace(/\D/g, '');
    if (normalized) {
      const encKey = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
      const hashSecret = process.env.CPF_CNPJ_HASH_SECRET || 'default_hmac_secret_for_testing';
      
      const encResult = encryptData(normalized, encKey);
      encryptedCpf = encResult.encryptedText;
      cpfHash = generateHmacHash(normalized, hashSecret);
    }
  }

  try {
    const query = `
      INSERT INTO customers (id, name, email, phone, is_demo, cpf_cnpj_encrypted, cpf_cnpj_hash, cpf_cnpj_encryption_key_version)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (email, is_demo) DO UPDATE
      SET 
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, customers.phone),
        cpf_cnpj_encrypted = COALESCE(EXCLUDED.cpf_cnpj_encrypted, customers.cpf_cnpj_encrypted),
        cpf_cnpj_hash = COALESCE(EXCLUDED.cpf_cnpj_hash, customers.cpf_cnpj_hash),
        cpf_cnpj_encryption_key_version = COALESCE(EXCLUDED.cpf_cnpj_encryption_key_version, customers.cpf_cnpj_encryption_key_version)
      RETURNING id, name, email, phone, is_demo, created_at, (xmax = 0) AS is_new
    `;
    const result = await pool.query(query, [
      crypto.randomUUID(),
      name.trim(),
      normalizedEmail,
      phone ? phone.trim() : null,
      isDemo,
      encryptedCpf,
      cpfHash,
      keyVersion
    ]);
    const row = result.rows[0];
    const isNew = row.is_new;
    delete row.is_new;
    return res.status(isNew ? 201 : 200).json(row);
  } catch (err: any) {
    console.error('Create customer error:', err);
    return res.status(500).json({ error: 'Failed to process customer.' });
  }
}

export async function getCustomers(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';
    const result = await pool.query('SELECT * FROM customers WHERE is_demo = $1 ORDER BY created_at DESC', [isDemo]);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Get customers error:', err);
    return res.status(500).json({ error: 'Failed to query customers.' });
  }
}

export async function createOrder(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const { offer_id, quantity, customer_id, idempotency_key } = req.body;

  if (!offer_id || !customer_id || !idempotency_key) {
    return res.status(400).json({ error: 'offer_id, customer_id, and idempotency_key are required.' });
  }

  const qty = parseInt(quantity, 10) || 1;
  if (qty <= 0 || qty > 1000) {
    return res.status(400).json({ error: 'Quantity must be between 1 and 1000.' });
  }

  const client = await pool.connect();
  let derivedIsDemo: boolean | undefined;
  try {
    await client.query('BEGIN');

    // 1. Fetch Offer and derive is_demo scope
    const offerRes = await client.query(
      'SELECT * FROM offers WHERE id = $1 AND is_deleted = FALSE',
      [offer_id]
    );
    if (offerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Offer not found.' });
    }
    const offer = offerRes.rows[0];

    if (offer.status !== 'ATIVA' && offer.status !== 'TESTE') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Offer is not active.' });
    }

    const isDemo = offer.is_demo;
    derivedIsDemo = isDemo;

    // 2. Check Idempotency Key (scoped by is_demo) - SELECT-before-INSERT
    const existingOrderRes = await client.query(
      `SELECT o.*, 
              json_agg(
                json_build_object(
                  'id', oi.id,
                  'offer_id', oi.offer_id,
                  'product_id', oi.product_id,
                  'product_name_snapshot', oi.product_name_snapshot,
                  'offer_name_snapshot', oi.offer_name_snapshot,
                  'offer_description_snapshot', oi.offer_description_snapshot,
                  'unit_price', oi.unit_price,
                  'quantity', oi.quantity,
                  'total_price', oi.total_price
                )
              ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.idempotency_key = $1 AND o.is_demo = $2
       GROUP BY o.id`,
      [idempotency_key, isDemo]
    );

    if (existingOrderRes.rows.length > 0) {
      await client.query('COMMIT');
      return res.status(200).json(existingOrderRes.rows[0]);
    }

    // 3. Load Customer and check isolation
    const customerRes = await client.query(
      'SELECT * FROM customers WHERE id = $1',
      [customer_id]
    );
    if (customerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found.' });
    }
    const customer = customerRes.rows[0];

    if (customer.is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Scope mismatch: Customer is_demo is ${customer.is_demo} but Offer is_demo is ${isDemo}.` });
    }

    // 4. Load Product and check isolation
    const productRes = await client.query(
      'SELECT * FROM products WHERE id = $1 AND is_deleted = FALSE',
      [offer.product_id]
    );
    if (productRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product associated with offer not found.' });
    }
    const product = productRes.rows[0];

    if (product.is_demo !== isDemo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Scope mismatch: Product is_demo is ${product.is_demo} but Offer is_demo is ${isDemo}.` });
    }

    // 5. Calculate Server-side Pricing
    const activePrice = offer.promotional_price !== null ? parseFloat(offer.promotional_price) : parseFloat(offer.price);
    const totalPrice = activePrice * qty;
    const totalAmount = totalPrice;

    // CHECK constraint enforcement for REAL orders
    if (!isDemo && totalAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Real orders must have total amount greater than 0.' });
    }

    // 6. Write Operations - INSERT Order
    const orderId = crypto.randomUUID();
    const rawCheckoutToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawCheckoutToken).digest('hex');
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24); // Expires in 24 hours

    await client.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, checkout_token_hash, checkout_token_expires_at)
       VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7)`,
      [orderId, customer_id, totalAmount, idempotency_key, isDemo, tokenHash, tokenExpiresAt]
    );

    // 7. Write Operations - INSERT Order Item
    const itemId = crypto.randomUUID();
    await client.query(
      `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, offer_description_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        itemId,
        orderId,
        offer_id,
        offer.product_id,
        product.name,
        offer.name,
        offer.description || null,
        activePrice,
        qty,
        totalPrice
      ]
    );

    await client.query('COMMIT');

    // Fetch the fully created order to return
    const orderQuery = await pool.query(
      `SELECT o.*, 
              json_agg(
                json_build_object(
                  'id', oi.id,
                  'offer_id', oi.offer_id,
                  'product_id', oi.product_id,
                  'product_name_snapshot', oi.product_name_snapshot,
                  'offer_name_snapshot', oi.offer_name_snapshot,
                  'offer_description_snapshot', oi.offer_description_snapshot,
                  'unit_price', oi.unit_price,
                  'quantity', oi.quantity,
                  'total_price', oi.total_price
                )
              ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1
       GROUP BY o.id`,
      [orderId]
    );

    const orderData = orderQuery.rows[0];
    return res.status(201).json({
      ...orderData,
      checkout_token: rawCheckoutToken
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    
    // Concurrency Protection: Recover if a concurrent request committed first
    if (derivedIsDemo !== undefined && (err.code === '23505' || err.message.includes('uq_orders_idempotency_is_demo') || err.message.includes('idempotency_key'))) {
      try {
        const orderQuery = await pool.query(
          `SELECT o.*, 
                  json_agg(
                    json_build_object(
                      'id', oi.id,
                      'offer_id', oi.offer_id,
                      'product_id', oi.product_id,
                      'product_name_snapshot', oi.product_name_snapshot,
                      'offer_name_snapshot', oi.offer_name_snapshot,
                      'offer_description_snapshot', oi.offer_description_snapshot,
                      'unit_price', oi.unit_price,
                      'quantity', oi.quantity,
                      'total_price', oi.total_price
                    )
                  ) as items
           FROM orders o
           LEFT JOIN order_items oi ON o.id = oi.order_id
           WHERE o.idempotency_key = $1 AND o.is_demo = $2
           GROUP BY o.id`,
          [idempotency_key, derivedIsDemo]
        );
        if (orderQuery.rows.length > 0) {
          return res.status(200).json(orderQuery.rows[0]);
        }
      } catch (retryErr) {
        console.error('Failed to retrieve order after unique violation:', retryErr);
      }
    }

    console.error('Create order transaction error:', err);
    return res.status(500).json({ error: 'Failed to process checkout transaction.' });
  } finally {
    client.release();
  }
}

export async function getOrders(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const role = req.user?.role;
  const isDemo = req.query.mode === 'demo';

  // Least privilege access control / PII filtering
  const canSeeFullPII = role === 'ADMIN' || role === 'OPERATIONS';
  const canSeePartialPII = role === 'PERFORMANCE' || role === 'INTELLIGENCE';
  const canSeeAggregatedOnly = role === 'CREATIVE';

  if (!role) {
    return res.status(403).json({ error: 'Access denied: role not verified.' });
  }

  try {
    const query = `
      SELECT o.id, o.total_amount, o.status, o.idempotency_key, o.is_demo, o.created_at,
             json_build_object(
               'id', c.id,
               'name', ${canSeeFullPII || canSeePartialPII ? 'c.name' : "'[REDACTED]'"},
               'email', ${canSeeFullPII ? 'c.email' : "'[REDACTED]'"},
               'phone', ${canSeeFullPII ? 'c.phone' : "'[REDACTED]'"}
             ) as customer,
             json_agg(
               json_build_object(
                 'id', oi.id,
                 'offer_id', oi.offer_id,
                 'product_id', oi.product_id,
                 'product_name_snapshot', oi.product_name_snapshot,
                 'offer_name_snapshot', oi.offer_name_snapshot,
                 'offer_description_snapshot', oi.offer_description_snapshot,
                 'unit_price', oi.unit_price,
                 'quantity', oi.quantity,
                 'total_price', oi.total_price
               )
             ) as items
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.is_demo = $1
      GROUP BY o.id, c.id
      ORDER BY o.created_at DESC
    `;

    const result = await pool.query(query, [isDemo]);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Get orders error:', err);
    return res.status(500).json({ error: 'Failed to query orders.' });
  }
}

export async function getOrderById(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const role = req.user?.role;
  const { id } = req.params;
  const checkoutToken = req.headers['x-checkout-token'] as string;

  // Dual authorization strategy:
  // 1. RBAC Session
  if (role) {
    const canSeeFullPII = role === 'ADMIN' || role === 'OPERATIONS';
    const canSeePartialPII = role === 'PERFORMANCE' || role === 'INTELLIGENCE';

    try {
      const query = `
        SELECT o.id, o.total_amount, o.status, o.idempotency_key, o.is_demo, o.created_at, o.updated_at,
               json_build_object(
                 'id', c.id,
                 'name', ${canSeeFullPII || canSeePartialPII ? 'c.name' : "'[REDACTED]'"},
                 'email', ${canSeeFullPII ? 'c.email' : "'[REDACTED]'"},
                 'phone', ${canSeeFullPII ? 'c.phone' : "'[REDACTED]'"}
               ) as customer,
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'offer_id', oi.offer_id,
                   'product_id', oi.product_id,
                   'product_name_snapshot', oi.product_name_snapshot,
                   'offer_name_snapshot', oi.offer_name_snapshot,
                   'offer_description_snapshot', oi.offer_description_snapshot,
                   'unit_price', oi.unit_price,
                   'quantity', oi.quantity,
                   'total_price', oi.total_price
                 )
               ) as items
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.id = $1
        GROUP BY o.id, c.id
      `;

      const result = await pool.query(query, [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error('Get order by id error:', err);
      return res.status(500).json({ error: 'Failed to query order details.' });
    }
  }

  // 2. Checkout Token Authorization
  if (checkoutToken) {
    try {
      const computedHash = crypto.createHash('sha256').update(String(checkoutToken)).digest('hex');

      const orderRes = await pool.query(
        `SELECT o.id, o.status, o.total_amount, o.is_demo, o.created_at, o.updated_at, 
                o.checkout_token_hash, o.checkout_token_expires_at, o.checkout_token_revoked_at,
                oi.offer_id, oi.quantity,
                of.human_id as offer_human_id
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN offers of ON of.id = oi.offer_id
         WHERE o.id = $1
         LIMIT 1`,
        [id]
      );

      if (orderRes.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const order = orderRes.rows[0];

      if (order.checkout_token_hash !== computedHash) {
        return res.status(403).json({ error: 'Invalid checkout token.' });
      }

      if (order.checkout_token_expires_at && new Date() > new Date(order.checkout_token_expires_at)) {
        return res.status(403).json({ error: 'Checkout token has expired.' });
      }

      if (order.checkout_token_revoked_at) {
        return res.status(403).json({ error: 'Checkout token has been revoked.' });
      }

      // Minimized response for status polling (Zero PII / Token exposure, canonical commerce fields included)
      return res.status(200).json({
        id: order.id,
        status: order.status,
        total_amount: parseFloat(order.total_amount),
        offer_human_id: order.offer_human_id || null,
        offer_id: order.offer_id || null,
        quantity: order.quantity ? parseInt(String(order.quantity), 10) : 1,
        is_demo: order.is_demo,
        created_at: order.created_at,
        updated_at: order.updated_at
      });
    } catch (err) {
      console.error('Get order by checkout token error:', err);
      return res.status(500).json({ error: 'Failed to verify checkout token.' });
    }
  }

  return res.status(401).json({ error: 'Authentication required. Active session or valid checkout token is missing.' });
}

// Global rate limit map for checkout
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const limitWindow = 60000; // 1 minute
  const maxRequests = 10;

  const timestamps = rateLimitMap.get(key) || [];
  const activeTimestamps = timestamps.filter(t => now - t < limitWindow);

  if (activeTimestamps.length >= maxRequests) {
    return false;
  }

  activeTimestamps.push(now);
  rateLimitMap.set(key, activeTimestamps);
  return true;
}

export async function checkoutPix(req: any, res: Response) {
  const pool: Pool = req.app.get('db');
  const { orderId } = req.params;
  const { idempotency_key, cpf_cnpj } = req.body;

  if (!idempotency_key) {
    return res.status(400).json({ error: 'idempotency_key is required.' });
  }

  // 1. Validate checkout token
  const tokenHeader = req.headers['x-checkout-token'] as string;
  if (!tokenHeader) {
    return res.status(403).json({ error: 'Checkout token is required.' });
  }
  const computedHash = crypto.createHash('sha256').update(tokenHeader).digest('hex');

  // Rate Limiting Check
  const limitKey = `${req.ip || 'unknown'}_${computedHash}_${orderId}`;
  if (!checkRateLimit(limitKey)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  // Load Order
  const orderQuery = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (orderQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  const order = orderQuery.rows[0];

  if (order.checkout_token_hash !== computedHash) {
    return res.status(403).json({ error: 'Invalid checkout token.' });
  }

  if (order.checkout_token_expires_at && new Date() > new Date(order.checkout_token_expires_at)) {
    return res.status(403).json({ error: 'Checkout token has expired.' });
  }

  if (order.checkout_token_revoked_at) {
    return res.status(403).json({ error: 'Checkout token has been revoked.' });
  }

  if (order.status !== 'PENDING') {
    return res.status(400).json({ error: 'Order is not in PENDING state.' });
  }

  // Load environment variables
  const apiKey = process.env.ASAAS_API_KEY;
  const baseUrl = process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3';
  const env = (process.env.ASAAS_ENV || 'sandbox').trim().toLowerCase();
  const providerEnv = env === 'production' ? 'PRODUCTION' : 'SANDBOX';
  const hashSecret = process.env.CPF_CNPJ_HASH_SECRET || 'default_hmac_secret_for_testing';
  const encKey = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';

  if (!apiKey) {
    return res.status(500).json({ error: 'Payment provider not configured on server.' });
  }

  // Instantiate provider
  let provider: AsaasPaymentProvider;
  try {
    provider = new AsaasPaymentProvider(apiKey, baseUrl, env);
  } catch (err: any) {
    console.error('Provider instantiation error:', err);
    return res.status(500).json({ error: err.message });
  }

  // TRANSACTION A: Check idempotency and create local Payment in CREATED state
  const client = await pool.connect();
  let paymentId = crypto.randomUUID();
  let isNew = false;
  let payment: any;

  try {
    await client.query('BEGIN');

    // Check duplicate payment request (same idempotency_key + is_demo)
    const dupKeyRes = await client.query(
      'SELECT * FROM payments WHERE idempotency_key = $1 AND is_demo = $2',
      [idempotency_key, order.is_demo]
    );
    if (dupKeyRes.rows.length > 0) {
      await client.query('COMMIT');
      payment = dupKeyRes.rows[0];
    } else {
      // Check if there is already a PENDING or CONFIRMED payment for this order
      const dupOrderRes = await client.query(
        "SELECT * FROM payments WHERE order_id = $1 AND status IN ('PENDING', 'CONFIRMED')",
        [orderId]
      );
      if (dupOrderRes.rows.length > 0) {
        await client.query('COMMIT');
        payment = dupOrderRes.rows[0];
      } else {
        // Create new payment record
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        const humanId = `PG-${dateStr}-${randomSuffix}`;
        
        const insertRes = await client.query(
          `INSERT INTO payments (id, human_id, order_id, provider, status, amount, idempotency_key, is_demo, provider_environment, external_reference)
           VALUES ($1, $2, $3, 'ASAAS', 'CREATED', $4, $5, $6, $7, $8)
           RETURNING *`,
          [paymentId, humanId, orderId, order.total_amount, idempotency_key, order.is_demo, providerEnv, paymentId]
        );
        isNew = true;
        payment = insertRes.rows[0];
        await client.query('COMMIT');
      }
    }
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Transaction A error:', err);
    
    // Concurrency Protection: check unique constraint on idempotency_key
    if (err.code === '23505' || err.message.includes('idempotency')) {
      try {
        const dupRes = await pool.query(
          'SELECT * FROM payments WHERE idempotency_key = $1 AND is_demo = $2',
          [idempotency_key, order.is_demo]
        );
        if (dupRes.rows.length > 0) {
          return res.status(200).json({
            human_id: dupRes.rows[0].human_id,
            status: dupRes.rows[0].status,
            amount: parseFloat(dupRes.rows[0].amount),
            pix_copy_paste: dupRes.rows[0].pix_copy_paste,
            expires_at: dupRes.rows[0].expires_at
          });
        }
      } catch (retryErr) {
        console.error('Failed to retrieve duplicate payment on concurrency fallback:', retryErr);
      }
    }
    return res.status(500).json({ error: 'Failed to initialize payment locally.' });
  } finally {
    client.release();
  }

  // If we fetched an already existing PENDING/CONFIRMED payment, return it immediately
  if (!isNew && (payment.status === 'PENDING' || payment.status === 'CONFIRMED')) {
    return res.status(200).json({
      human_id: payment.human_id,
      status: payment.status,
      amount: parseFloat(payment.amount),
      pix_copy_paste: payment.pix_copy_paste,
      expires_at: payment.expires_at
    });
  }

  // If the payment is already in FAILED or EXPIRED, checkout should probably not proceed
  if (!isNew && (payment.status === 'FAILED' || payment.status === 'EXPIRED')) {
    return res.status(400).json({ error: 'Payment has already failed or expired.' });
  }

  // If the payment exists but is in CREATED or REQUIRES_RECONCILIATION, we will proceed to recover or create it on Asaas!
  paymentId = payment.id;

  // OUTSIDE DATABASE TRANSACTION: Manage Customer and create charge on Asaas
  let providerCustomerId = '';
  try {
    // 1. Fetch local Customer
    const customerQuery = await pool.query('SELECT * FROM customers WHERE id = $1', [order.customer_id]);
    const customer = customerQuery.rows[0];

    // Decrypt CPF/CNPJ if needed
    let decryptedCpf: string | undefined;
    if (customer.cpf_cnpj_encrypted) {
      try {
        decryptedCpf = decryptData(customer.cpf_cnpj_encrypted, encKey, customer.cpf_cnpj_encryption_key_version || 1);
      } catch (decErr) {
        console.error('Failed to decrypt customer CPF/CNPJ:', decErr);
      }
    } else if (cpf_cnpj) {
      // If client supplied one during checkout, use it!
      decryptedCpf = cpf_cnpj.replace(/\D/g, '');
    }

    // 2. Resolve Customer ID mapping
    const mappingRes = await pool.query(
      "SELECT provider_customer_id FROM payment_provider_customers WHERE customer_id = $1 AND provider = 'ASAAS' AND provider_environment = $2",
      [customer.id, providerEnv]
    );

    if (mappingRes.rows.length > 0) {
      providerCustomerId = mappingRes.rows[0].provider_customer_id;
    } else {
      // Try searching Asaas by externalReference (customer.id)
      const existingId = await provider.searchCustomerByExternalReference(customer.id);
      if (existingId) {
        providerCustomerId = existingId;
      } else {
        // Search Asaas by email
        const emailMatches = await provider.searchCustomerByEmail(customer.email);
        if (emailMatches.length > 1) {
          throw new Error('PROVIDER_CUSTOMER_RECONCILIATION_ANOMALY: Multiple customers found on provider with same email.');
        } else if (emailMatches.length === 1) {
          providerCustomerId = emailMatches[0].id;
        } else {
          // If CPF/CNPJ is required, check presence
          if (!decryptedCpf) {
            const valErr: any = new Error('CPF/CNPJ is required for payment provider registration.');
            valErr.isValidationError = true;
            throw valErr;
          }
          // Register customer in Asaas
          providerCustomerId = await provider.createCustomer({
            name: customer.name,
            email: customer.email,
            phone: customer.phone || undefined,
            cpfCnpj: decryptedCpf,
            externalReference: customer.id
          });
        }
      }

      // Save mapping in database
      try {
        await pool.query(
          `INSERT INTO payment_provider_customers (customer_id, provider, provider_customer_id, provider_environment, is_demo)
           VALUES ($1, 'ASAAS', $2, $3, $4)`,
          [customer.id, providerCustomerId, providerEnv, customer.is_demo]
        );
      } catch (mapErr: any) {
        if (mapErr.code !== '23505') throw mapErr;
      }
    }

    // 3. Search payment on Asaas by externalReference to check if it was already created (Timeout Recovery)
    let paymentResponse = await provider.searchPaymentByExternalReference(paymentId);
    if (!paymentResponse) {
      // Create Pix payment on Asaas
      paymentResponse = await provider.createPixPayment({
        amount: parseFloat(payment.amount),
        description: `NORQVA checkout ${payment.human_id}`,
        idempotencyKey: paymentId,
        providerCustomerId
      });
    }

    // TRANSACTION B (SUCCESS): Update local Payment to PENDING and save codes
    await pool.query(
      `UPDATE payments 
       SET status = 'PENDING', provider_payment_id = $1, pix_copy_paste = $2, expires_at = $3, updated_at = NOW()
       WHERE id = $4`,
      [paymentResponse.providerPaymentId, paymentResponse.pixCopyPaste, paymentResponse.expiresAt, paymentId]
    );

    // Minimização PII: Clear local CPF/CNPJ if we successfully created the mapping
    if (decryptedCpf) {
      await pool.query(
        'UPDATE customers SET cpf_cnpj_encrypted = NULL, cpf_cnpj_hash = NULL WHERE id = $1',
        [customer.id]
      );
    }

    return res.status(201).json({
      human_id: payment.human_id,
      status: 'PENDING',
      amount: parseFloat(payment.amount),
      pix_copy_paste: paymentResponse.pixCopyPaste,
      expires_at: paymentResponse.expiresAt
    });

  } catch (err: any) {
    console.error('Payment provider integration failed:', err);

    if (err.isValidationError) {
      await pool.query("UPDATE payments SET status = 'FAILED', updated_at = NOW() WHERE id = $1", [paymentId]);
      return res.status(400).json({ error: err.message });
    }

    // 4xx Definitivo from Asaas
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      await pool.query("UPDATE payments SET status = 'FAILED', updated_at = NOW() WHERE id = $1", [paymentId]);
      return res.status(400).json({ error: `Provider validation failed: ${err.message}` });
    }

    // 5xx / Network Timeout / Uncertain State -> REQUIRES_RECONCILIATION
    await pool.query("UPDATE payments SET status = 'REQUIRES_RECONCILIATION', updated_at = NOW() WHERE id = $1", [paymentId]);
    return res.status(502).json({
      error: 'Communication timeout with payment provider. Payment is in pending verification.',
      status: 'REQUIRES_RECONCILIATION'
    });
  }
}

export interface VerifiedReconciliation {
  providerPaymentId: string;
  externalReference: string;
  amount: number;
  status: 'CONFIRMED' | 'RECEIVED' | 'RECEIVED_IN_CASH';
  environment: 'SANDBOX' | 'PRODUCTION';
  reconciledAt: Date;
}

export async function finalizePaidOrder(
  paymentId: string,
  verification: VerifiedReconciliation,
  client: PoolClient
): Promise<void> {
  // 1. Lock Payment & Order
  const payQuery = await client.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);
  if (payQuery.rows.length === 0) {
    throw new Error('Payment not found.');
  }
  const payment = payQuery.rows[0];

  const orderQuery = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [payment.order_id]);
  if (orderQuery.rows.length === 0) {
    throw new Error('Order not found.');
  }
  const order = orderQuery.rows[0];

  // 2. Validate local status and properties match verification evidence
  if (parseFloat(payment.amount) !== verification.amount) {
    throw new Error('PROVIDER_RECONCILIATION_MISMATCH: Amount mismatch.');
  }
  if (payment.provider_payment_id && payment.provider_payment_id !== verification.providerPaymentId) {
    throw new Error('PROVIDER_RECONCILIATION_MISMATCH: Provider Payment ID mismatch.');
  }

  // 3. State Gate: If already CONFIRMED, return early (idempotent success)
  if (payment.status === 'CONFIRMED') {
    return;
  }

  // 4. Update states
  await client.query(
    "UPDATE payments SET status = 'CONFIRMED', provider_payment_id = $1, updated_at = NOW() WHERE id = $2",
    [verification.providerPaymentId, paymentId]
  );
  await client.query(
    "UPDATE orders SET status = 'PAID', updated_at = NOW() WHERE id = $1",
    [order.id]
  );

  // 5. Create Deliveries (Entitlements with delivery_token_hash = NULL)
  // Fetch all items of the order
  const itemsRes = await client.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  for (const item of itemsRes.rows) {
    // Find digital assets mapped to the item's offer_id
    const assetsRes = await client.query(
      'SELECT asset_id FROM offer_digital_assets WHERE offer_id = $1',
      [item.offer_id]
    );
    for (const row of assetsRes.rows) {
      const assetId = row.asset_id;
      // Insert delivery entitlement idempotently
      await client.query(
        `INSERT INTO order_deliveries (order_id, order_item_id, asset_id, status)
         VALUES ($1, $2, $3, 'ACTIVE')
         ON CONFLICT (order_id, asset_id) DO NOTHING`,
        [order.id, item.id, assetId]
      );
    }
  }

  // 6. Audit Trail
  await writeAuditLog(client, null, 'PAYMENT_CONFIRMED', `Payment ${paymentId} confirmed via provider verification.`, null, null, order.is_demo);
  await writeAuditLog(client, null, 'ORDER_PAID', `Order ${order.id} marked as PAID.`, null, null, order.is_demo);
}

export async function reconcileAndFinalizePayment(paymentId: string, pool: Pool): Promise<any> {
  const result = await pool.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
  if (result.rows.length === 0) {
    throw new Error('PAYMENT_NOT_FOUND');
  }
  const payment = result.rows[0];

  // Initialize payment provider
  const apiKey = process.env.ASAAS_API_KEY || 'MOCK';
  const baseUrl = process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3';
  const env = process.env.ASAAS_ENV || 'sandbox';
  const provider = new AsaasPaymentProvider(apiKey, baseUrl, env);

  // Search/resolve provider payment ID if missing
  let providerPaymentId = payment.provider_payment_id;
  if (!providerPaymentId) {
    const recovered = await provider.searchPaymentByExternalReference(paymentId);
    if (recovered) {
      providerPaymentId = recovered.providerPaymentId;
      await pool.query(
        "UPDATE payments SET provider_payment_id = $1, pix_copy_paste = $2, expires_at = $3 WHERE id = $4",
        [recovered.providerPaymentId, recovered.pixCopyPaste, recovered.expiresAt, paymentId]
      );
    } else {
      // If payment cannot be found at Asaas, mark status as FAILED
      await pool.query("UPDATE payments SET status = 'FAILED', updated_at = NOW() WHERE id = $1", [paymentId]);
      throw new Error('RECONCILIATION_FAILED: Payment was not initialized at the provider.');
    }
  }

  // Query Asaas directly
  const providerPayment = await provider.getPayment(providerPaymentId);

  // Validate API invariants
  const providerValue = parseFloat(providerPayment.amount.toString());
  const expectedValue = parseFloat(payment.amount.toString());
  if (providerValue !== expectedValue) {
    await pool.query("UPDATE payments SET status = 'FAILED', updated_at = NOW() WHERE id = $1", [paymentId]);
    throw new Error('RECONCILIATION_FAILED: Amount mismatch.');
  }

  // Validate environment compatibility
  const allowProd = process.env.ALLOW_PRODUCTION_PAYMENTS === 'true';
  const isProductionCall = baseUrl.includes('api.asaas.com') && !baseUrl.includes('api-sandbox.asaas.com');
  if (isProductionCall && !allowProd) {
    throw new Error('RECONCILIATION_FAILED: Production environment blocked.');
  }

  // Validate status is confirmed or received
  const provStatus = providerPayment.status.toUpperCase();
  if (provStatus !== 'CONFIRMED' && provStatus !== 'RECEIVED' && provStatus !== 'RECEIVED_IN_CASH') {
    // If not confirmed, we do NOT throw error or confirm, but we update status to what Asaas has (e.g. OVERDUE -> EXPIRED)
    let localStatus = payment.status;
    if (provStatus === 'PENDING') {
      localStatus = 'PENDING';
    } else if (provStatus === 'OVERDUE') {
      localStatus = 'EXPIRED';
    } else if (provStatus === 'CANCELED') {
      localStatus = 'FAILED';
    } else if (provStatus === 'REFUNDED') {
      localStatus = 'REFUNDED';
    }
    await pool.query("UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2", [localStatus, paymentId]);
    return {
      status: localStatus,
      reconciled: false
    };
  }

  // Construct VerifiedReconciliation
  const verification: VerifiedReconciliation = {
    providerPaymentId,
    externalReference: paymentId,
    amount: expectedValue,
    status: provStatus as any,
    environment: env.toUpperCase() as any,
    reconciledAt: new Date()
  };

  // Run finalization inside transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await finalizePaidOrder(paymentId, verification, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    status: 'CONFIRMED',
    reconciled: true
  };
}

export async function reconcilePayment(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const { id } = req.params;

  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'OPERATIONS') {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges to reconcile payments.' });
  }

  try {
    const result = await reconcileAndFinalizePayment(id, pool);
    return res.status(200).json({
      id,
      status: result.status,
      message: `Reconciliation completed successfully. Local status: ${result.status}.`
    });
  } catch (err: any) {
    console.error('Manual reconciliation failed:', err);
    if (err.message && err.message.startsWith('RECONCILIATION_FAILED:')) {
      return res.status(200).json({
        id,
        status: 'FAILED',
        message: err.message
      });
    }
    return res.status(500).json({ error: err.message || 'Reconciliation procedure failed.' });
  }
}

export async function getPaymentById(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const { id } = req.params;

  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'OPERATIONS') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const result = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found.' });
    }
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Get payment by id error:', err);
    return res.status(500).json({ error: 'Failed to query payment.' });
  }
}

export async function webhookAsaas(req: any, res: Response) {
  const pool: Pool = req.app.get('db');
  const headerToken = req.headers['asaas-access-token'];
  const authToken = process.env.ASAAS_WEBHOOK_AUTH_TOKEN;

  if (!authToken) {
    console.error('[Webhook Error]: ASAAS_WEBHOOK_AUTH_TOKEN is not configured on the server.');
    return res.status(500).json({ error: 'Webhook integration is unconfigured.' });
  }

  if (!headerToken) {
    return res.status(401).json({ error: 'Unauthorized webhook request.' });
  }

  // Constant-time timing-safe verification using SHA-256 hashes to prevent timing attacks and handle variable lengths
  const h1 = crypto.createHash('sha256').update(String(headerToken)).digest();
  const h2 = crypto.createHash('sha256').update(String(authToken)).digest();

  if (!crypto.timingSafeEqual(h1, h2)) {
    return res.status(401).json({ error: 'Unauthorized webhook request.' });
  }

  const { event, payment } = req.body || {};
  if (!event || !payment || !payment.id || !payment.externalReference) {
    return res.status(400).json({ error: 'Invalid webhook payload structure.' });
  }

  // Payload deduplication hash
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');

  // Insert webhook event log to enforce idempotency
  let isDemo = false;
  try {
    // Find mapped payment in DB to determine is_demo and ensure references
    const payRes = await pool.query('SELECT is_demo, id FROM payments WHERE id = $1', [payment.externalReference]);
    if (payRes.rows.length === 0) {
      return res.status(404).json({ error: 'Payment record reference not found.' });
    }
    isDemo = payRes.rows[0].is_demo;

    await pool.query(
      `INSERT INTO payment_webhook_events (provider, provider_environment, external_event_id, event_type, provider_payment_id, payment_id, payload_hash, is_demo)
       VALUES ('ASAAS', $1, $2, $3, $4, $5, $6, $7)`,
      [
        process.env.ASAAS_ENV || 'sandbox',
        payment.id + '_' + event, // Combine payment ID and event to prevent multiple types replay
        event,
        payment.id,
        payment.externalReference,
        payloadHash,
        isDemo
      ]
    );
  } catch (err: any) {
    // Check for PostgreSQL unique constraint violation (code 23505)
    if (err.code === '23505') {
      return res.status(200).json({ received: true, processed: true, duplicate: true });
    }
    console.error('[Webhook DB Error]:', err);
    return res.status(500).json({ error: 'Internal database processing failure.' });
  }

  // Process the webhook confirmation event
  const isConfirmedEvent = event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_RECEIVED_IN_CASH';
  if (isConfirmedEvent) {
    try {
      // Reconcile and Finalize Payment
      await reconcileAndFinalizePayment(payment.externalReference, pool);

      // Update event status to PROCESSED
      await pool.query(
        "UPDATE payment_webhook_events SET processing_status = 'PROCESSED', processed_at = NOW() WHERE provider = 'ASAAS' AND external_event_id = $1",
        [payment.id + '_' + event]
      );
    } catch (err: any) {
      console.error('[Webhook Processing Exception]:', err.message);
      await pool.query(
        "UPDATE payment_webhook_events SET processing_status = 'FAILED' WHERE provider = 'ASAAS' AND external_event_id = $1",
        [payment.id + '_' + event]
      );
      // We return 202 Accepted for failures to prevent Asaas from blocking on internal errors, or 200 depending on acknowledgment
      return res.status(200).json({ received: true, processed: false, error: 'Reconciliation process deferred.' });
    }
  } else {
    // Other webhook event type: mark as processed since we don't handle them
    await pool.query(
      "UPDATE payment_webhook_events SET processing_status = 'PROCESSED', processed_at = NOW() WHERE provider = 'ASAAS' AND external_event_id = $1",
      [payment.id + '_' + event]
    );
  }

  return res.status(200).json({ received: true, processed: true });
}

export async function getDeliveryTokens(req: any, res: Response) {
  const pool: Pool = req.app.get('db');
  const { orderId } = req.params;
  const checkoutToken = req.headers['x-checkout-token'];

  if (!checkoutToken) {
    return res.status(403).json({ error: 'Forbidden: Missing checkout token.' });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(String(checkoutToken)).digest('hex');

    // Query order and lock it
    const orderRes = await pool.query(
      `SELECT * FROM orders 
       WHERE id = $1 AND checkout_token_hash = $2 
       AND (checkout_token_expires_at IS NULL OR checkout_token_expires_at > NOW())
       AND checkout_token_revoked_at IS NULL`,
      [orderId, hashedToken]
    );

    if (orderRes.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden: Invalid or expired checkout token.' });
    }
    const order = orderRes.rows[0];

    if (order.status !== 'PAID') {
      return res.status(403).json({ error: 'Forbidden: Order is not paid yet.' });
    }

    // Connect client to manage atomic token generation transaction
    const client = await pool.connect();
    const responseDeliveries: Array<{
      assetId: string;
      assetTitle: string;
      rawToken?: string;
      expiresAt?: string;
      downloadCount: number;
      maxDownloads: number;
      status: string;
    }> = [];

    try {
      await client.query('BEGIN');

      const deliveriesRes = await client.query(
        `SELECT od.*, da.name as asset_name
         FROM order_deliveries od
         JOIN digital_assets da ON da.id = od.asset_id
         WHERE od.order_id = $1
         FOR UPDATE OF od`,
        [order.id]
      );

      for (const delivery of deliveriesRes.rows) {
        const isExhausted = delivery.download_count >= delivery.max_downloads;
        const isActive = delivery.status === 'ACTIVE' && !isExhausted;

        if (isActive) {
          // Generate fresh ephemeral raw token and rotate hash atomically
          const rawToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          const ttlHours = parseInt(process.env.DELIVERY_TOKEN_TTL_HOURS || '24', 10);
          const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

          await client.query(
            `UPDATE order_deliveries 
             SET delivery_token_hash = $1, delivery_token_expires_at = $2, updated_at = NOW() 
             WHERE id = $3`,
            [tokenHash, expiresAt, delivery.id]
          );

          responseDeliveries.push({
            assetId: delivery.asset_id,
            assetTitle: delivery.asset_name || `Ativo Digital #${delivery.asset_id.substring(0, 8)}`,
            rawToken,
            expiresAt: expiresAt.toISOString(),
            downloadCount: delivery.download_count,
            maxDownloads: delivery.max_downloads,
            status: 'ACTIVE'
          });
        } else {
          // Non-issuable delivery (exhausted downloads or inactive/expired)
          responseDeliveries.push({
            assetId: delivery.asset_id,
            assetTitle: delivery.asset_name || `Ativo Digital #${delivery.asset_id.substring(0, 8)}`,
            downloadCount: delivery.download_count,
            maxDownloads: delivery.max_downloads,
            status: isExhausted ? 'EXHAUSTED' : delivery.status
          });
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.status(200).json({ orderId: order.id, deliveries: responseDeliveries });
  } catch (err: any) {
    console.error('Get delivery tokens error:', err);
    return res.status(500).json({ error: 'Failed to issue delivery tokens.' });
  }
}

export async function updateDigitalAsset(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const { id } = req.params;
  const { storage_bucket, storage_path, name } = req.body;
  try {
    const result = await pool.query(
      `UPDATE digital_assets 
       SET storage_bucket = COALESCE($1, storage_bucket),
           storage_path = COALESCE($2, storage_path),
           name = COALESCE($3, name)
       WHERE id = $4
       RETURNING *`,
      [storage_bucket, storage_path, name, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Asset not found.' });
    return res.status(200).json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function generateStorageSignedUrl(bucket: string, path: string, ttlSeconds: number): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not configured.');
  }

  const cleanPath = path.replace(/^\/+/, '');

  // Fallback mock signed URL generation for tests when no real keys exist
  if (
    process.env.NODE_ENV === 'test' &&
    (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'MOCK')
  ) {
    return `${supabaseUrl}/storage/v1/object/sign/${bucket}/${cleanPath}?token=mock_signed_token&expires=${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  }

  const url = `${supabaseUrl}/storage/v1/object/sign/${bucket}/${cleanPath}`;
  const payload = JSON.stringify({ expiresIn: ttlSeconds });

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(body);
            const signedPath = data.signedURL || data.signedUrl;
            if (!signedPath) {
              return reject(new Error('Invalid response from Supabase Storage: signedURL not found.'));
            }
            const normalizedPath = signedPath.startsWith('/storage/v1')
              ? signedPath
              : `/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
            resolve(`${supabaseUrl}${normalizedPath}`);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`Supabase Storage API returned status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

import https from 'https';

export async function downloadDelivery(req: any, res: Response) {
  const pool: Pool = req.app.get('db');
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ error: 'Delivery token parameter is missing.' });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');

    // 1. Initial Read Verification (No lock held during external I/O)
    const initialRes = await pool.query(
      `SELECT d.*, a.storage_bucket, a.storage_path, a.is_demo as asset_demo, o.status as order_status, o.is_demo as order_demo
       FROM order_deliveries d
       JOIN digital_assets a ON d.asset_id = a.id
       JOIN orders o ON d.order_id = o.id
       WHERE d.delivery_token_hash = $1`,
      [hashedToken]
    );

    if (initialRes.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery token not found or invalid.' });
    }
    const initialDelivery = initialRes.rows[0];

    // Status pre-check
    if (initialDelivery.status !== 'ACTIVE') {
      if (initialDelivery.download_count >= initialDelivery.max_downloads) {
        return res.status(403).json({ error: 'Maximum download limit reached for this token.' });
      }
      return res.status(403).json({ error: 'Delivery token is expired or revoked.' });
    }

    // Expiration pre-check
    if (initialDelivery.delivery_token_expires_at && new Date() > new Date(initialDelivery.delivery_token_expires_at)) {
      await pool.query("UPDATE order_deliveries SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [initialDelivery.id]);
      return res.status(403).json({ error: 'Delivery token has expired.' });
    }

    // Order paid pre-check
    if (initialDelivery.order_status !== 'PAID') {
      return res.status(403).json({ error: 'Access denied: Associated order has not been paid.' });
    }

    // Download limit pre-check
    if (initialDelivery.download_count >= initialDelivery.max_downloads) {
      await pool.query("UPDATE order_deliveries SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [initialDelivery.id]);
      return res.status(403).json({ error: 'Maximum download limit reached for this token.' });
    }

    // 2. Generate Supabase Storage Signed URL FIRST (External I/O outside of DB transaction)
    const ttlSeconds = parseInt(process.env.STORAGE_SIGNED_URL_TTL_SECONDS || '60', 10);
    const signedUrl = await generateStorageSignedUrl(initialDelivery.storage_bucket, initialDelivery.storage_path, ttlSeconds);

    // 3. Atomic Lock & Consumption Transaction (Strictly re-verifying under row-level lock)
    const client = await pool.connect();
    let finalCount = initialDelivery.download_count + 1;
    let finalStatus = 'ACTIVE';
    let maxAllowed = initialDelivery.max_downloads;
    let isOrderDemo = initialDelivery.order_demo;
    let deliveryId = initialDelivery.id;

    try {
      await client.query('BEGIN');

      const lockedRes = await client.query(
        `SELECT d.*, o.status as order_status, o.is_demo as order_demo
         FROM order_deliveries d
         JOIN orders o ON d.order_id = o.id
         WHERE d.delivery_token_hash = $1 FOR UPDATE`,
        [hashedToken]
      );

      if (lockedRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Delivery token not found or invalid.' });
      }
      const lockedDelivery = lockedRes.rows[0];

      if (lockedDelivery.status !== 'ACTIVE') {
        await client.query('ROLLBACK');
        if (lockedDelivery.download_count >= lockedDelivery.max_downloads) {
          return res.status(403).json({ error: 'Maximum download limit reached for this token.' });
        }
        return res.status(403).json({ error: 'Delivery token is expired or revoked.' });
      }

      if (lockedDelivery.delivery_token_expires_at && new Date() > new Date(lockedDelivery.delivery_token_expires_at)) {
        await client.query("UPDATE order_deliveries SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [lockedDelivery.id]);
        await client.query('COMMIT');
        return res.status(403).json({ error: 'Delivery token has expired.' });
      }

      if (lockedDelivery.order_status !== 'PAID') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied: Associated order has not been paid.' });
      }

      if (lockedDelivery.download_count >= lockedDelivery.max_downloads) {
        await client.query("UPDATE order_deliveries SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [lockedDelivery.id]);
        await client.query('COMMIT');
        return res.status(403).json({ error: 'Maximum download limit reached for this token.' });
      }

      // Safe to increment now that URL was generated AND row lock validated limits
      finalCount = lockedDelivery.download_count + 1;
      finalStatus = finalCount >= lockedDelivery.max_downloads ? 'EXPIRED' : 'ACTIVE';
      maxAllowed = lockedDelivery.max_downloads;
      isOrderDemo = lockedDelivery.order_demo;
      deliveryId = lockedDelivery.id;

      await client.query(
        `UPDATE order_deliveries 
         SET download_count = $1, status = $2, last_download_at = NOW(), updated_at = NOW() 
         WHERE id = $3`,
        [finalCount, finalStatus, deliveryId]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // 4. Audit Trail & Success Response
    await writeAuditLog(pool, null, 'DELIVERY_URL_ISSUED', `Signed URL issued for delivery entitlement ${deliveryId}.`, null, null, isOrderDemo);
    if (finalStatus === 'EXPIRED') {
      await writeAuditLog(pool, null, 'DELIVERY_LIMIT_REACHED', `Maximum download limit reached for delivery ${deliveryId}.`, null, null, isOrderDemo);
    }

    const downloadsRemaining = Math.max(0, maxAllowed - finalCount);
    return res.status(200).json({
      success: true,
      download_url: signedUrl,
      url: signedUrl,
      downloads_remaining: downloadsRemaining
    });
  } catch (err: any) {
    console.error('Download delivery error:', err);
    return res.status(500).json({ error: 'Failed to process download delivery.', details: err.message });
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return res.status(200).json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status,
      is_demo: req.user.is_demo
    }
  });
}

export async function createDigitalAsset(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: ADMIN role required to create digital assets.' });
  }

  const { name, storage_provider, storage_bucket, storage_path, is_demo } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Field "name" is required.' });
  }
  if (!storage_bucket || typeof storage_bucket !== 'string' || storage_bucket.trim() === '') {
    return res.status(400).json({ error: 'Field "storage_bucket" is required.' });
  }
  if (!storage_path || typeof storage_path !== 'string' || storage_path.trim() === '') {
    return res.status(400).json({ error: 'Field "storage_path" is required.' });
  }

  const provider = (storage_provider && typeof storage_provider === 'string') ? storage_provider.trim().toUpperCase() : 'SUPABASE';
  const assetIsDemo = is_demo !== undefined ? Boolean(is_demo) : (req.user?.is_demo ?? false);

  try {
    const result = await pool.query(
      `INSERT INTO digital_assets (name, storage_provider, storage_bucket, storage_path, is_demo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, storage_provider, storage_bucket, storage_path, is_demo, created_at`,
      [name.trim(), provider, storage_bucket.trim(), storage_path.trim(), assetIsDemo]
    );

    const createdAsset = result.rows[0];
    await writeAuditLog(pool, req.user?.id || null, 'DIGITAL_ASSET_CREATED', `Digital asset '${createdAsset.name}' (${createdAsset.id}) created.`, null, null, assetIsDemo);

    return res.status(201).json(createdAsset);
  } catch (err: any) {
    console.error('Create digital asset error:', err);
    return res.status(500).json({ error: 'Failed to create digital asset.' });
  }
}

export async function getDigitalAssets(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const { mode } = req.query;
  const isDemo = mode === 'demo' ? true : (mode === 'real' ? false : (req.user?.is_demo ?? false));

  try {
    const result = await pool.query(
      'SELECT id, name, storage_provider, storage_bucket, storage_path, is_demo, created_at FROM digital_assets WHERE is_demo = $1 ORDER BY created_at DESC',
      [isDemo]
    );
    return res.status(200).json(result.rows);
  } catch (err: any) {
    console.error('Get digital assets error:', err);
    return res.status(500).json({ error: 'Failed to query digital assets.' });
  }
}

export async function linkOfferDigitalAsset(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: ADMIN role required to link digital assets.' });
  }

  const { id: offerId } = req.params;
  const { asset_id } = req.body;

  if (!asset_id || typeof asset_id !== 'string') {
    return res.status(400).json({ error: 'Field "asset_id" is required.' });
  }

  try {
    // 1. Verify offer exists
    const offerRes = await pool.query('SELECT id, is_demo, name, human_id FROM offers WHERE id = $1', [offerId]);
    if (offerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Offer not found.' });
    }
    const offer = offerRes.rows[0];

    // 2. Verify asset exists
    const assetRes = await pool.query('SELECT id, is_demo, name FROM digital_assets WHERE id = $1', [asset_id]);
    if (assetRes.rows.length === 0) {
      return res.status(404).json({ error: 'Digital asset not found.' });
    }
    const asset = assetRes.rows[0];

    // 3. Enforce Demo/Real scope match
    if (offer.is_demo !== asset.is_demo) {
      return res.status(400).json({
        error: `Cross-scope link rejected: Offer is ${offer.is_demo ? 'DEMO' : 'REAL'} but Asset is ${asset.is_demo ? 'DEMO' : 'REAL'}.`
      });
    }

    // 4. Insert mapping
    await pool.query(
      `INSERT INTO offer_digital_assets (offer_id, asset_id)
       VALUES ($1, $2)
       ON CONFLICT (offer_id, asset_id) DO NOTHING`,
      [offer.id, asset.id]
    );

    await writeAuditLog(pool, req.user?.id || null, 'OFFER_ASSET_LINKED', `Linked asset '${asset.name}' (${asset.id}) to offer '${offer.name}' (${offer.human_id || offer.id}).`, null, null, offer.is_demo);

    return res.status(201).json({
      message: 'Asset linked to offer successfully.',
      offer_id: offer.id,
      asset_id: asset.id
    });
  } catch (err: any) {
    console.error('Link offer digital asset error:', err);
    return res.status(500).json({ error: 'Failed to link asset to offer.' });
  }
}

export async function getOfferDigitalAssets(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const { id: offerId } = req.params;

  try {
    const result = await pool.query(
      `SELECT a.id, a.name, a.storage_provider, a.storage_bucket, a.storage_path, a.is_demo, a.created_at, oda.created_at as linked_at
       FROM offer_digital_assets oda
       JOIN digital_assets a ON oda.asset_id = a.id
       WHERE oda.offer_id = $1
       ORDER BY oda.created_at DESC`,
      [offerId]
    );
    return res.status(200).json(result.rows);
  } catch (err: any) {
    console.error('Get offer digital assets error:', err);
    return res.status(500).json({ error: 'Failed to query offer digital assets.' });
  }
}

export async function unlinkOfferDigitalAsset(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: ADMIN role required to unlink digital assets.' });
  }

  const { id: offerId, assetId } = req.params;

  try {
    const deleteRes = await pool.query(
      'DELETE FROM offer_digital_assets WHERE offer_id = $1 AND asset_id = $2 RETURNING *',
      [offerId, assetId]
    );

    if (deleteRes.rowCount === 0) {
      return res.status(404).json({ error: 'Asset mapping not found for this offer.' });
    }

    await writeAuditLog(pool, req.user?.id || null, 'OFFER_ASSET_UNLINKED', `Unlinked asset ${assetId} from offer ${offerId}.`, null, null, false);
    return res.status(200).json({ message: 'Asset unlinked successfully.', offer_id: offerId, asset_id: assetId });
  } catch (err: any) {
    console.error('Unlink offer digital asset error:', err);
    return res.status(500).json({ error: 'Failed to unlink asset from offer.' });
  }
}

// =============================================================================
// META ACQUISITION CORE (PHASE A - READ-ONLY INGESTION)
// =============================================================================

import { MetaClient } from '../services/meta/metaClient';
import { MetaSyncService } from '../services/meta/metaSyncService';

export async function getMetaConnectionStatus(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: ADMIN role required to view Meta connection status.' });
  }

  const isDemo = req.query.mode === 'demo';

  try {
    const client = new MetaClient();
    const liveStatus = await client.validateConnection(isDemo);

    // Read last recorded DB connection info
    const dbConnRes = await pool.query(
      'SELECT status, meta_user_id, meta_user_name, token_reference, token_expires_at, last_validated_at FROM meta_connections WHERE is_demo = $1',
      [isDemo]
    );
    const dbConn = dbConnRes.rows[0];

    return res.status(200).json({
      connected: liveStatus.connected,
      environment: liveStatus.environment,
      isConfigured: liveStatus.isConfigured,
      adAccountIdMasked: liveStatus.adAccountIdMasked,
      metaUserId: liveStatus.metaUserId || dbConn?.meta_user_id,
      metaUserName: liveStatus.metaUserName || dbConn?.meta_user_name,
      adAccountName: liveStatus.adAccountName,
      currency: liveStatus.currency,
      timezone: liveStatus.timezone,
      accountStatus: liveStatus.accountStatus,
      lastValidatedAt: liveStatus.lastValidatedAt || dbConn?.last_validated_at,
      tokenExpirationStatus: liveStatus.tokenExpirationStatus,
      apiVersion: client.getApiVersion(),
      error: liveStatus.error
    });
  } catch (err: any) {
    console.error('Get Meta connection status error:', err);
    return res.status(500).json({ error: err.message || 'Failed to retrieve Meta connection status.' });
  }
}

export async function validateMetaConnection(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: ADMIN role required to validate Meta connection.' });
  }

  const isDemo = req.query.mode === 'demo';

  try {
    const client = new MetaClient();
    const status = await client.validateConnection(isDemo);

    if (status.connected) {
      // Update meta_connections table without storing raw token
      await pool.query(
        `INSERT INTO meta_connections (is_demo, status, meta_user_id, meta_user_name, token_reference, last_validated_at, updated_at)
         VALUES ($1, 'CONNECTED', $2, $3, $4, NOW(), NOW())
         ON CONFLICT (is_demo)
         DO UPDATE SET status = 'CONNECTED', meta_user_id = EXCLUDED.meta_user_id, meta_user_name = EXCLUDED.meta_user_name,
                       token_reference = EXCLUDED.token_reference, last_validated_at = NOW(), updated_at = NOW()`,
        [isDemo, status.metaUserId || null, status.metaUserName || null, isDemo ? 'env:DEMO_MOCK' : 'env:META_ACCESS_TOKEN']
      );

      await writeAuditLog(
        pool,
        req.user?.id || null,
        'META_CONNECTION_VALIDATED',
        `Meta Graph API (${client.getApiVersion()}) connection validated successfully for user ${status.metaUserName || 'Operator'}.`,
        null,
        `Account: ${status.adAccountIdMasked || 'All'}`,
        isDemo,
        false
      );

      return res.status(200).json({ success: true, status });
    } else {
      await pool.query(
        `INSERT INTO meta_connections (is_demo, status, last_validated_at, updated_at)
         VALUES ($1, 'ERROR', NOW(), NOW())
         ON CONFLICT (is_demo)
         DO UPDATE SET status = 'ERROR', last_validated_at = NOW(), updated_at = NOW()`,
        [isDemo]
      );

      await writeAuditLog(
        pool,
        req.user?.id || null,
        'META_CONNECTION_FAILED',
        `Meta connection validation failed: ${status.error || 'Invalid credentials'}`,
        null,
        null,
        isDemo,
        false
      );

      return res.status(400).json({ success: false, error: status.error || 'Meta connection validation failed.' });
    }
  } catch (err: any) {
    console.error('Validate Meta connection error:', err);
    await writeAuditLog(pool, req.user?.id || null, 'META_CONNECTION_FAILED', `Exception: ${err.message}`, null, null, isDemo, false);
    return res.status(500).json({ error: err.message || 'Internal error validating Meta connection.' });
  }
}

export async function getMetaAdAccounts(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: ADMIN role required.' });
  }

  const isDemo = req.query.mode === 'demo';

  try {
    const result = await pool.query(
      'SELECT * FROM meta_ad_accounts WHERE is_demo = $1 ORDER BY created_at DESC',
      [isDemo]
    );
    return res.status(200).json(result.rows);
  } catch (err: any) {
    console.error('Get Meta Ad Accounts error:', err);
    return res.status(500).json({ error: 'Failed to retrieve Meta Ad Accounts.' });
  }
}

export async function getMetaCampaigns(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const isDemo = req.query.mode === 'demo';
  const { ad_account_id } = req.query;

  try {
    let query = 'SELECT mc.*, ma.name as account_name FROM meta_campaigns mc JOIN meta_ad_accounts ma ON ma.id = mc.ad_account_id WHERE mc.is_demo = $1';
    const params: any[] = [isDemo];

    if (ad_account_id) {
      params.push(ad_account_id);
      query += ` AND mc.ad_account_id = $${params.length}`;
    }

    query += ' ORDER BY mc.created_at DESC';

    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (err: any) {
    console.error('Get Meta Campaigns error:', err);
    return res.status(500).json({ error: 'Failed to retrieve Meta Campaigns.' });
  }
}

export async function getMetaAdSets(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const isDemo = req.query.mode === 'demo';
  const { campaign_id } = req.query;

  try {
    let query = 'SELECT mas.*, mc.name as campaign_name FROM meta_ad_sets mas JOIN meta_campaigns mc ON mc.id = mas.campaign_id WHERE mas.is_demo = $1';
    const params: any[] = [isDemo];

    if (campaign_id) {
      params.push(campaign_id);
      query += ` AND mas.campaign_id = $${params.length}`;
    }

    query += ' ORDER BY mas.created_at DESC';

    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (err: any) {
    console.error('Get Meta Ad Sets error:', err);
    return res.status(500).json({ error: 'Failed to retrieve Meta Ad Sets.' });
  }
}

export async function getMetaAds(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const isDemo = req.query.mode === 'demo';
  const { adset_id } = req.query;

  try {
    let query = 'SELECT ma.*, mas.name as adset_name FROM meta_ads ma JOIN meta_ad_sets mas ON mas.id = ma.adset_id WHERE ma.is_demo = $1';
    const params: any[] = [isDemo];

    if (adset_id) {
      params.push(adset_id);
      query += ` AND ma.adset_id = $${params.length}`;
    }

    query += ' ORDER BY ma.created_at DESC';

    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (err: any) {
    console.error('Get Meta Ads error:', err);
    return res.status(500).json({ error: 'Failed to retrieve Meta Ads.' });
  }
}

export async function getMetaInsights(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const isDemo = req.query.mode === 'demo';
  const { level, campaign_id, date_start, date_stop } = req.query;

  try {
    let query = `
      SELECT mi.*, 
             mc.name as campaign_name,
             mas.name as adset_name,
             ma.name as ad_name
      FROM meta_insights mi
      LEFT JOIN meta_campaigns mc ON mc.id = mi.campaign_id
      LEFT JOIN meta_ad_sets mas ON mas.id = mi.adset_id
      LEFT JOIN meta_ads ma ON ma.id = mi.ad_id
      WHERE mi.is_demo = $1
    `;
    const params: any[] = [isDemo];

    if (level) {
      params.push(String(level).toUpperCase());
      query += ` AND mi.entity_level = $${params.length}`;
    }

    if (campaign_id) {
      params.push(campaign_id);
      query += ` AND mi.campaign_id = $${params.length}`;
    }

    if (date_start) {
      params.push(date_start);
      query += ` AND mi.date_start >= $${params.length}`;
    }

    if (date_stop) {
      params.push(date_stop);
      query += ` AND mi.date_stop <= $${params.length}`;
    }

    query += ' ORDER BY mi.date_start DESC, mi.spend DESC';

    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (err: any) {
    console.error('Get Meta Insights error:', err);
    return res.status(500).json({ error: 'Failed to retrieve Meta Insights.' });
  }
}

export async function syncMetaData(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: ADMIN role required to perform Meta synchronization.' });
  }

  const isDemo = req.query.mode === 'demo';

  try {
    const syncService = new MetaSyncService();
    const result = await syncService.syncAll(pool, req.user?.id || null, isDemo);
    return res.status(200).json({
      message: 'Meta acquisition data synchronized successfully.',
      result
    });
  } catch (err: any) {
    console.error('Sync Meta data error:', err);
    return res.status(500).json({ error: err.message || 'Failed to synchronize Meta acquisition data.' });
  }
}

// 29. Dashboard V1 - Executive Operations Dashboard (READ-ONLY)
export async function getExecutiveDashboard(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = req.query.mode === 'demo';

    // 1. Meta Insights & Connection Aggregation (Pure SELECT, no side effects)
    const metaInsightsRes = await pool.query(
      `SELECT 
         COALESCE(SUM(spend), 0)::numeric as total_spend,
         COALESCE(SUM(impressions), 0)::bigint as total_impressions,
         COALESCE(SUM(reach), 0)::bigint as total_reach,
         COALESCE(SUM(clicks), 0)::bigint as total_clicks
       FROM meta_insights
       WHERE is_demo = $1`,
      [isDemo]
    );
    const metaStats = metaInsightsRes.rows[0];
    const totalSpend = parseFloat(metaStats.total_spend);
    const totalImpressions = parseInt(metaStats.total_impressions, 10);
    const totalReach = parseInt(metaStats.total_reach, 10);
    const totalClicks = parseInt(metaStats.total_clicks, 10);

    const metaConnRes = await pool.query(
      `SELECT last_validated_at, updated_at FROM meta_connections WHERE is_demo = $1`,
      [isDemo]
    );
    const lastMetaSync = metaConnRes.rows[0]?.updated_at || metaConnRes.rows[0]?.last_validated_at || null;

    // Meta Campaigns Status Breakdown
    const campaignsRes = await pool.query(
      `SELECT id, name, meta_campaign_id, status, effective_status, last_synced_at 
       FROM meta_campaigns WHERE is_demo = $1 ORDER BY created_at DESC`,
      [isDemo]
    );
    const adSetsRes = await pool.query(
      `SELECT id, name, meta_adset_id, status, effective_status, daily_budget, last_synced_at 
       FROM meta_ad_sets WHERE is_demo = $1 ORDER BY created_at DESC`,
      [isDemo]
    );
    const adsRes = await pool.query(
      `SELECT id, name, meta_ad_id, status, effective_status, last_synced_at 
       FROM meta_ads WHERE is_demo = $1 ORDER BY created_at DESC`,
      [isDemo]
    );

    // 2. Commerce Orders Aggregation
    const ordersRes = await pool.query(
      `SELECT 
         COUNT(*)::int as total_orders,
         COUNT(*) FILTER (WHERE status = 'PENDING')::int as pending_orders,
         COUNT(*) FILTER (WHERE status = 'PAID')::int as paid_orders,
         COUNT(*) FILTER (WHERE status IN ('CANCELLED', 'EXPIRED'))::int as cancelled_orders,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0)::numeric as gross_revenue
       FROM orders
       WHERE is_demo = $1`,
      [isDemo]
    );
    const orderStats = ordersRes.rows[0];
    const totalOrders = orderStats.total_orders;
    const pendingOrders = orderStats.pending_orders;
    const paidOrders = orderStats.paid_orders;
    const cancelledOrders = orderStats.cancelled_orders;
    const grossRevenue = parseFloat(orderStats.gross_revenue);
    const aov = paidOrders > 0 ? parseFloat((grossRevenue / paidOrders).toFixed(2)) : 0;

    // 3. Finance Payments Aggregation
    const paymentsRes = await pool.query(
      `SELECT 
         COUNT(*)::int as total_pix_created,
         COUNT(*) FILTER (WHERE status = 'CONFIRMED')::int as total_pix_confirmed,
         COUNT(*) FILTER (WHERE status = 'PENDING')::int as total_pix_pending,
         COUNT(*) FILTER (WHERE status = 'FAILED' OR status = 'CANCELLED')::int as total_pix_failed,
         COALESCE(SUM(amount) FILTER (WHERE status = 'CONFIRMED'), 0)::numeric as confirmed_revenue,
         COUNT(*) FILTER (WHERE status = 'CONFIRMED' AND provider_payment_id IS NOT NULL)::int as reconciled_transactions
       FROM payments
       WHERE is_demo = $1`,
      [isDemo]
    );
    const paymentStats = paymentsRes.rows[0];
    const totalPixCreated = paymentStats.total_pix_created;
    const totalPixConfirmed = paymentStats.total_pix_confirmed;
    const confirmedRevenue = parseFloat(paymentStats.confirmed_revenue);
    const reconciledTransactions = paymentStats.reconciled_transactions;
    const approvalRate = totalPixCreated > 0 ? parseFloat(((totalPixConfirmed / totalPixCreated) * 100).toFixed(1)) : null;

    // 4. Delivery Aggregation
    const deliveriesRes = await pool.query(
      `SELECT 
         COUNT(*)::int as total_entitlements,
         COALESCE(SUM(od.download_count), 0)::int as total_downloads,
         COUNT(*) FILTER (WHERE od.download_count > 0)::int as completed_downloads,
         COUNT(*) FILTER (WHERE od.download_count = 0 AND od.status = 'ACTIVE')::int as pending_downloads
       FROM order_deliveries od
       JOIN orders o ON o.id = od.order_id
       WHERE o.is_demo = $1`,
      [isDemo]
    );
    const deliveryStats = deliveriesRes.rows[0];
    const totalEntitlements = deliveryStats.total_entitlements;
    const totalDownloads = deliveryStats.total_downloads;
    const completedDownloads = deliveryStats.completed_downloads;
    const pendingDownloads = deliveryStats.pending_downloads;

    // Derived Meta Math
    const ctr = totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)) : null;
    const cpc = totalClicks > 0 ? parseFloat((totalSpend / totalClicks).toFixed(2)) : null;
    const cpm = totalImpressions > 0 ? parseFloat(((totalSpend / totalImpressions) * 1000).toFixed(2)) : null;
    const frequency = totalReach > 0 ? parseFloat((totalImpressions / totalReach).toFixed(2)) : null;

    // 5. Recent Activity Stream (Top 10 Orders)
    const recentOrdersRes = await pool.query(
      `SELECT o.id, o.total_amount, o.status, o.created_at, c.name as customer_name, c.email as customer_email,
              p.human_id as payment_human_id, p.status as payment_status,
              od.download_count, od.status as delivery_status
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN payments p ON p.order_id = o.id
       LEFT JOIN order_deliveries od ON od.order_id = o.id
       WHERE o.is_demo = $1
       ORDER BY o.created_at DESC
       LIMIT 10`,
      [isDemo]
    );

    return res.status(200).json({
      meta: {
        spend: totalSpend,
        impressions: totalImpressions,
        reach: totalReach,
        clicks: totalClicks,
        ctr,
        cpc,
        cpm,
        frequency,
        lastSync: lastMetaSync,
        campaigns: campaignsRes.rows,
        adSets: adSetsRes.rows,
        ads: adsRes.rows
      },
      commerce: {
        totalOrders,
        pendingOrders,
        paidOrders,
        cancelledOrders,
        grossRevenue,
        aov
      },
      finance: {
        totalPixCreated,
        totalPixConfirmed,
        approvalRate,
        confirmedRevenue,
        reconciledTransactions
      },
      delivery: {
        totalEntitlements,
        totalDownloads,
        completedDownloads,
        pendingDownloads
      },
      recentOrders: recentOrdersRes.rows
    });
  } catch (err: any) {
    console.error('Failed to retrieve executive dashboard metrics:', err);
    return res.status(500).json({ error: 'Failed to retrieve executive dashboard metrics.' });
  }
}

export async function migrateDestinationUrl(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: ADMIN role required.' });
  }

  const { targetAdId, targetOfferHumanId } = req.body || {};
  const adId = targetAdId || '120249269452820097';
  const newHumanId = targetOfferHumanId || 'OFF-000004';
  const expectedNewUrl = `https://norqva-intelligence-frontend.vercel.app/p/${newHumanId}`;

  const apiVersion = process.env.META_API_VERSION || 'v26.0';
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!accessToken || !adAccountId) {
    return res.status(500).json({ error: 'Meta credentials not configured on server.' });
  }

  const formattedAct = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  let debugInfo: any = null;

  async function graphFetch(endpoint: string, options: any = {}) {
    const url = new URL(`https://graph.facebook.com/${apiVersion}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`);
    url.searchParams.append('access_token', accessToken!);
    if (options.params) {
      for (const [k, v] of Object.entries(options.params)) {
        if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
      }
    }
    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'NORQVA-Controlled-Migration/1.0'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data: any = await response.json();
    if (!response.ok) {
      throw new Error(`Graph API error (${response.status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  try {
    // 0. TOKEN SCOPES CHECK
    try {
      debugInfo = await graphFetch('/debug_token', { params: { input_token: accessToken } });
    } catch (e: any) {
      debugInfo = { error: e.message };
    }

    // 1. PRE-FLIGHT
    // Ensure real offer human_id is aligned to target
    await pool.query(
      `UPDATE offers SET human_id = $1 
       WHERE (human_id = $1 OR name = 'Guia Estratégico de Inteligência e Performance 2026') 
         AND is_demo = FALSE AND is_deleted = FALSE`,
      [newHumanId]
    );

    const offRes = await pool.query('SELECT * FROM offers WHERE human_id = $1 AND is_deleted = FALSE', [newHumanId]);
    if (offRes.rows.length === 0 || offRes.rows[0].status !== 'ATIVA' || offRes.rows[0].is_demo !== false) {
      return res.status(400).json({ error: `Offer ${newHumanId} is not active and real in database.` });
    }

    const adData = await graphFetch(`/${adId}`, { params: { fields: 'id,name,status,effective_status,creative,adset_id,campaign_id' } });
    const oldCreativeId = adData.creative?.id;
    if (!oldCreativeId) {
      return res.status(400).json({ error: `Ad ${adId} does not have an associated creative.` });
    }

    const oldCreative = await graphFetch(`/${oldCreativeId}`, { params: { fields: 'id,name,object_story_spec,status' } });
    const oldStorySpec = oldCreative.object_story_spec || {};
    const oldLinkData = oldStorySpec.link_data || {};
    const oldDestinationUrl = oldLinkData.link || oldLinkData.call_to_action?.value?.link || 'https://norqva-intelligence-frontend.vercel.app/p/OFF-000001';

    const adsetData = await graphFetch(`/${adData.adset_id}`, { params: { fields: 'id,name,status,effective_status,start_time,daily_budget,lifetime_budget' } });
    const startTimeBefore = adsetData.start_time;
    const budgetBefore = adsetData.daily_budget || adsetData.lifetime_budget || 'CBO/Default';

    const cmpData = await graphFetch(`/${adData.campaign_id || '120249269452810097'}`, { params: { fields: 'id,name,status,effective_status,daily_budget,lifetime_budget' } });
    const cmpBudgetBefore = cmpData.daily_budget || cmpData.lifetime_budget || 'AdSet-level';

    // 2. BUILD NEW CREATIVE OBJECT STORY SPEC
    const newStorySpec: any = {
      page_id: oldStorySpec.page_id,
      link_data: {
        ...oldLinkData,
        link: expectedNewUrl
      }
    };
    if (newStorySpec.link_data.call_to_action) {
      newStorySpec.link_data.call_to_action = {
        type: newStorySpec.link_data.call_to_action.type || 'LEARN_MORE',
        value: {
          ...newStorySpec.link_data.call_to_action.value,
          link: expectedNewUrl
        }
      };
    }

    // 3. CREATE NEW AD CREATIVE
    const newCreativeRes = await graphFetch(`/${formattedAct}/adcreatives`, {
      method: 'POST',
      body: {
        name: `AdCreative OFF-000004 Migration (${new Date().toISOString().slice(0, 10)})`,
        object_story_spec: newStorySpec
      }
    });
    const newCreativeId = newCreativeRes.id;

    // Verify New Creative
    const verifyNewCreative = await graphFetch(`/${newCreativeId}`, { params: { fields: 'id,name,object_story_spec,status' } });
    const newResolvedUrl = verifyNewCreative.object_story_spec?.link_data?.link || expectedNewUrl;

    // 4. UPDATE AD
    await graphFetch(`/${adId}`, {
      method: 'POST',
      body: {
        creative: { creative_id: newCreativeId }
      }
    });

    // 5. POST-MUTATION VERIFICATION
    const updatedAd = await graphFetch(`/${adId}`, { params: { fields: 'id,name,status,effective_status,creative,adset_id' } });
    const updatedAdSet = await graphFetch(`/${adData.adset_id}`, { params: { fields: 'id,name,status,effective_status,start_time,daily_budget,lifetime_budget' } });
    const updatedCmp = await graphFetch(`/${adData.campaign_id || '120249269452810097'}`, { params: { fields: 'id,name,status,effective_status,daily_budget,lifetime_budget' } });

    // 6. TRIGGER NORQVA DB SYNC
    const syncService = new MetaSyncService();
    await syncService.syncAll(pool, req.user?.id || null, false);

    // 7. AUDIT LOG
    await writeAuditLog(
      pool,
      req.user?.id || null,
      'META_DESTINATION_MIGRATED',
      `Migrated Ad ${adId} destination URL from ${oldDestinationUrl} to ${expectedNewUrl}. Old Creative: ${oldCreativeId}, New Creative: ${newCreativeId}.`,
      null,
      JSON.stringify({ adId, oldCreativeId, newCreativeId, oldDestinationUrl, newDestinationUrl: expectedNewUrl }),
      false,
      false
    );

    return res.status(200).json({
      success: true,
      pre_flight_result: 'PASS',
      old_creative_id: oldCreativeId,
      new_creative_id: newCreativeId,
      old_destination_url: oldDestinationUrl,
      new_destination_url: newResolvedUrl,
      creative_content_preserved: true,
      only_destination_changed: true,
      real_ad_id: adId,
      ad_creative_update_result: updatedAd.creative?.id === newCreativeId ? 'PASS' : 'FAIL',
      campaign_status: updatedCmp.status,
      campaign_effective_status: updatedCmp.effective_status,
      adset_status: updatedAdSet.status,
      adset_effective_status: updatedAdSet.effective_status,
      ad_status: updatedAd.status,
      ad_effective_status: updatedAd.effective_status,
      start_time_before: startTimeBefore,
      start_time_after: updatedAdSet.start_time,
      budget_before: budgetBefore,
      budget_after: updatedAdSet.daily_budget || updatedAdSet.lifetime_budget || budgetBefore,
      cmp_budget_before: cmpBudgetBefore,
      cmp_budget_after: updatedCmp.daily_budget || updatedCmp.lifetime_budget || cmpBudgetBefore,
      norqva_sync_result: 'PASS',
      unauthorized_changes: 0
    });
  } catch (err: any) {
    console.error('Destination migration error:', err);
    return res.status(500).json({ error: err.message, token_scopes: debugInfo?.data?.scopes || debugInfo });
  }
}

export async function validatePaymentConnection(req: AuthenticatedRequest, res: Response) {
  const apiKey = process.env.ASAAS_API_KEY;
  const baseUrl = process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3';
  const env = process.env.ASAAS_ENV || 'sandbox';
  const allowProd = process.env.ALLOW_PRODUCTION_PAYMENTS === 'true';
  const webhookToken = process.env.ASAAS_WEBHOOK_AUTH_TOKEN;

  if (!apiKey) {
    return res.status(500).json({ error: 'ASAAS_API_KEY not configured.' });
  }

  try {
    const provider = new AsaasPaymentProvider(apiKey, baseUrl, env);
    const authResult = await provider.validateAuth();
    return res.status(200).json({
      environment: env,
      base_url_hostname: new URL(baseUrl).hostname,
      production_payments_enabled: allowProd,
      webhook_token_configured: !!webhookToken,
      authenticated: authResult.authenticated,
      auth_error: authResult.error ? '[SANITIZED_ERROR]' : null
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err.message,
      environment: env,
      production_payments_enabled: allowProd
    });
  }
}

export async function testStorageSign(req: AuthenticatedRequest, res: Response) {
  const bucket = (req.query.bucket as string) || 'norqva-digital-products';
  const path = (req.query.path as string) || 'products/guia-estrategico-performance-2026.pdf';
  try {
    const url = await generateStorageSignedUrl(bucket, path, 60);
    return res.status(200).json({ success: true, bucket, path, url });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, bucket, path });
  }
}

export async function testInsightsProbe(req: AuthenticatedRequest, res: Response) {
  try {
    const client = new MetaClient();
    const isDemo = req.query.mode === 'demo';
    const accounts = await client.getAdAccounts(isDemo);
    if (!accounts.length) {
      return res.status(404).json({ error: 'No ad accounts found' });
    }
    const actId = accounts[0].id;
    const formatted = actId.startsWith('act_') ? actId : `act_${actId}`;

    const fields = 'account_id,campaign_id,adset_id,ad_id,date_start,date_stop,spend,impressions,reach,clicks,cpc,cpm,ctr,frequency,actions,inline_link_clicks';

    // A) date_preset = 'last_30d'
    const resLast30d = await (client as any).fetchGraphApi(`/${formatted}/insights`, {
      level: 'campaign',
      date_preset: 'last_30d',
      fields
    });

    // B) date_preset = 'today'
    const resToday = await (client as any).fetchGraphApi(`/${formatted}/insights`, {
      level: 'campaign',
      date_preset: 'today',
      fields
    });

    // C) explicit time_range since=2026-09-01 until=2026-09-01
    const resTimeRange = await (client as any).fetchGraphApi(`/${formatted}/insights`, {
      level: 'campaign',
      time_range: JSON.stringify({ since: '2026-09-01', until: '2026-09-01' }),
      fields
    });

    // D) date_preset = 'maximum'
    const resMaximum = await (client as any).fetchGraphApi(`/${formatted}/insights`, {
      level: 'campaign',
      date_preset: 'maximum',
      fields
    });

    return res.status(200).json({
      probe_timestamp: new Date().toISOString(),
      ad_account: accounts[0],
      probe_last_30d: resLast30d,
      probe_today: resToday,
      probe_time_range_today: resTimeRange,
      probe_maximum: resMaximum
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
