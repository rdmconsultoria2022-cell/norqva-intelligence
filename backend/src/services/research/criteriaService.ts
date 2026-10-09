import { Pool } from 'pg';
import crypto from 'crypto';
import { writeAuditLog } from '../../db/audit';
import { isDbInMemory } from '../../db/db';
import { VALIDATION_CHECKS, AI_RULES } from './criteriaTexts';

// NORQVA-0029: critérios de avaliação da Pesquisa, com versões validadas pelo dono.
// - A versão 1 nasce em rascunho com exatamente os valores que o sistema já usava.
// - Ajustar cria uma versão nova em rascunho; só vale depois de "Validar" (ADMIN).
// - Enquanto nada foi validado, o sistema usa os valores de sempre (DEFAULT_NUMBERS).
// - Os textos (checklist do validador e regras das IAs) entram em cada versão; se o código mudar o texto,
//   a versão validada deixa de valer até uma nova validação.

export class CriteriaError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface CriteriaNumbers {
  // Classes da Base de campanhas (B = CPA de equilíbrio do produto)
  winner_min_sales: number;
  winner_cpa_ratio: number;
  promising_cpa_ratio: number;
  loser_spend_ratio: number;
  loser_ctr_min_pct: number;
  loser_ctr_min_spend: number;
  loser_cpa_ratio: number;
  no_data_spend_ratio: number;
  no_breakeven_min_spend: number;
  no_breakeven_winner_roas: number;
  // Seleção de candidatos para avaliação
  shortlist_min_spend: number;
  shortlist_min_impressions: number;
  shortlist_min_days: number;
  shortlist_max_cpa_ratio: number;
  // Mercado europeu (Biblioteca de Anúncios)
  eu_min_ads: number;
  eu_w_long_runners: number;
  eu_w_advertisers: number;
  eu_w_reach: number;
  eu_w_momentum: number;
  eu_validated_min: number;
  eu_promising_min: number;
}

export const DEFAULT_NUMBERS: CriteriaNumbers = {
  winner_min_sales: 3,
  winner_cpa_ratio: 0.66,
  promising_cpa_ratio: 1,
  loser_spend_ratio: 2,
  loser_ctr_min_pct: 0.6,
  loser_ctr_min_spend: 15,
  loser_cpa_ratio: 1.5,
  no_data_spend_ratio: 0.5,
  no_breakeven_min_spend: 5,
  no_breakeven_winner_roas: 1.5,
  shortlist_min_spend: 10,
  shortlist_min_impressions: 500,
  shortlist_min_days: 2,
  shortlist_max_cpa_ratio: 1.5,
  eu_min_ads: 5,
  eu_w_long_runners: 0.4,
  eu_w_advertisers: 0.25,
  eu_w_reach: 0.2,
  eu_w_momentum: 0.15,
  eu_validated_min: 70,
  eu_promising_min: 45
};

export type CriteriaGroup = 'BASE' | 'SHORTLIST' | 'EU';
export interface CriteriaDef {
  key: keyof CriteriaNumbers;
  group: CriteriaGroup;
  label: string;
  unit: string;
  min: number;
  max: number;
  integer?: boolean;
}

/** Descrição em português de cada número, com os limites aceitos. */
export const CRITERIA_DEFS: CriteriaDef[] = [
  { key: 'winner_min_sales', group: 'BASE', label: 'Vencedor: vendas mínimas', unit: 'vendas', min: 1, max: 50, integer: true },
  { key: 'winner_cpa_ratio', group: 'BASE', label: 'Vencedor: CPA até esta fração do equilíbrio', unit: '× equilíbrio', min: 0.1, max: 1.5 },
  { key: 'promising_cpa_ratio', group: 'BASE', label: 'Promissor: CPA até esta fração do equilíbrio (com 1 venda ou mais)', unit: '× equilíbrio', min: 0.1, max: 3 },
  { key: 'loser_spend_ratio', group: 'BASE', label: 'Perdedor: gasto sem venda a partir de (por anúncio)', unit: '× equilíbrio', min: 0.5, max: 10 },
  { key: 'loser_ctr_min_pct', group: 'BASE', label: 'Perdedor: CTR de link abaixo de', unit: '%', min: 0, max: 10 },
  { key: 'loser_ctr_min_spend', group: 'BASE', label: 'Perdedor por CTR: só depois de gastar (por anúncio)', unit: 'R$', min: 0, max: 1000 },
  { key: 'loser_cpa_ratio', group: 'BASE', label: 'Perdedor: CPA acima de (com gasto relevante)', unit: '× equilíbrio', min: 1, max: 5 },
  { key: 'no_data_spend_ratio', group: 'BASE', label: 'Sem dados: gasto sem venda abaixo de', unit: '× equilíbrio', min: 0, max: 5 },
  { key: 'no_breakeven_min_spend', group: 'BASE', label: 'Sem equilíbrio cadastrado: gasto mínimo para julgar', unit: 'R$', min: 0, max: 1000 },
  { key: 'no_breakeven_winner_roas', group: 'BASE', label: 'Sem equilíbrio cadastrado: ROAS de vencedor', unit: '×', min: 0.5, max: 10 },
  { key: 'shortlist_min_spend', group: 'SHORTLIST', label: 'Candidato: gasto mínimo', unit: 'R$', min: 0, max: 100000 },
  { key: 'shortlist_min_impressions', group: 'SHORTLIST', label: 'Candidato: impressões mínimas', unit: 'impressões', min: 0, max: 10000000, integer: true },
  { key: 'shortlist_min_days', group: 'SHORTLIST', label: 'Candidato: dias mínimos no ar', unit: 'dias', min: 0, max: 365, integer: true },
  { key: 'shortlist_max_cpa_ratio', group: 'SHORTLIST', label: 'Candidato: CPA máximo', unit: '× equilíbrio', min: 0.1, max: 10 },
  { key: 'eu_min_ads', group: 'EU', label: 'Nicho: anúncios mínimos para dar nota', unit: 'anúncios', min: 1, max: 500, integer: true },
  { key: 'eu_w_long_runners', group: 'EU', label: 'Peso: anúncios ativos há 30+ dias', unit: 'peso', min: 0, max: 1 },
  { key: 'eu_w_advertisers', group: 'EU', label: 'Peso: anunciantes diferentes', unit: 'peso', min: 0, max: 1 },
  { key: 'eu_w_reach', group: 'EU', label: 'Peso: alcance na UE', unit: 'peso', min: 0, max: 1 },
  { key: 'eu_w_momentum', group: 'EU', label: 'Peso: anúncios novos em 7 dias', unit: 'peso', min: 0, max: 1 },
  { key: 'eu_validated_min', group: 'EU', label: 'Nicho validado: nota a partir de', unit: 'pontos', min: 1, max: 100, integer: true },
  { key: 'eu_promising_min', group: 'EU', label: 'Nicho promissor: nota a partir de', unit: 'pontos', min: 0, max: 100, integer: true }
];

export function currentTexts() {
  return { validator_checks: VALIDATION_CHECKS, ai_rules: AI_RULES };
}
export function textsHash(texts: unknown = currentTexts()): string {
  return crypto.createHash('sha256').update(JSON.stringify(texts)).digest('hex');
}

const parseJson = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Completa com os padrões e confere limites e coerência; erro em português no primeiro problema. */
export function checkNumbers(input: Partial<Record<string, unknown>>, base: CriteriaNumbers = DEFAULT_NUMBERS): CriteriaNumbers {
  const out: CriteriaNumbers = { ...DEFAULT_NUMBERS, ...base };
  for (const [k, raw] of Object.entries(input || {})) {
    const def = CRITERIA_DEFS.find(d => d.key === k);
    if (!def) throw new CriteriaError(400, `Critério desconhecido: ${k}.`);
    const n = Number(typeof raw === 'string' ? raw.replace(',', '.') : raw);
    if (raw === null || raw === '' || !Number.isFinite(n)) throw new CriteriaError(400, `${def.label}: informe um número.`);
    if (n < def.min || n > def.max) throw new CriteriaError(400, `${def.label}: use um valor entre ${def.min} e ${def.max}.`);
    if (def.integer && !Number.isInteger(n)) throw new CriteriaError(400, `${def.label}: use um número inteiro.`);
    out[def.key] = n;
  }
  const w = out.eu_w_long_runners + out.eu_w_advertisers + out.eu_w_reach + out.eu_w_momentum;
  if (Math.abs(w - 1) > 0.001) throw new CriteriaError(400, `Os quatro pesos do mercado europeu precisam somar 1 (hoje somam ${w.toFixed(2)}).`);
  if (out.eu_promising_min >= out.eu_validated_min) throw new CriteriaError(400, 'A nota de nicho promissor precisa ser menor que a de validado.');
  if (out.winner_cpa_ratio > out.promising_cpa_ratio) throw new CriteriaError(400, 'O CPA de vencedor não pode ser maior que o de promissor.');
  if (out.loser_cpa_ratio < out.promising_cpa_ratio) throw new CriteriaError(400, 'O CPA de perdedor precisa ser maior ou igual ao de promissor.');
  return out;
}

export interface EffectiveCriteria {
  numbers: CriteriaNumbers;
  /** Versão validada cujos números estão valendo (null = valores de sempre, nada validado). */
  version: number | null;
  /** true só se há versão validada E os textos atuais são os mesmos que foram validados. */
  validated: boolean;
  texts_changed: boolean;
}

function rowOut(r: any) {
  return {
    version: r.version,
    status: r.status,
    numbers: parseJson(r.numbers),
    texts: parseJson(r.texts),
    texts_hash: r.texts_hash,
    note: r.note,
    created_by: r.created_by,
    created_by_name: r.created_by_name || null,
    created_at: r.created_at,
    validated_by: r.validated_by,
    validated_by_name: r.validated_by_name || null,
    validated_at: r.validated_at
  };
}

export class CriteriaService {
  /** Números em vigor. Nunca derruba quem chama: em erro, volta aos valores de sempre. */
  async effective(pool: Pool): Promise<EffectiveCriteria> {
    try {
      const r = await pool.query(`SELECT version, numbers, texts_hash FROM research_criteria_versions WHERE status = 'VALIDATED' ORDER BY version DESC LIMIT 1`);
      if (r.rows.length === 0) return { numbers: { ...DEFAULT_NUMBERS }, version: null, validated: false, texts_changed: false };
      const v = r.rows[0];
      const changed = v.texts_hash !== textsHash();
      return { numbers: { ...DEFAULT_NUMBERS, ...parseJson(v.numbers) }, version: v.version, validated: !changed, texts_changed: changed };
    } catch {
      return { numbers: { ...DEFAULT_NUMBERS }, version: null, validated: false, texts_changed: false };
    }
  }

  /** Cria a versão 1 (rascunho com os valores de sempre) se a tabela estiver vazia. */
  private async ensureFirst(pool: Pool) {
    const texts = currentTexts();
    await pool.query(
      `INSERT INTO research_criteria_versions (version, status, numbers, texts, texts_hash, note)
       SELECT 1, 'DRAFT', $1, $2, $3, 'Valores que o sistema já usava antes da validação'
       WHERE NOT EXISTS (SELECT 1 FROM research_criteria_versions)
       ON CONFLICT (version) DO NOTHING`,
      [JSON.stringify(DEFAULT_NUMBERS), JSON.stringify(texts), textsHash(texts)]
    );
  }

  async overview(pool: Pool) {
    await this.ensureFirst(pool);
    const r = await pool.query(
      `SELECT v.*, cu.name AS created_by_name, vu.name AS validated_by_name
       FROM research_criteria_versions v
       LEFT JOIN users cu ON cu.id = v.created_by
       LEFT JOIN users vu ON vu.id = v.validated_by
       ORDER BY v.version DESC LIMIT 30`
    );
    const versions = r.rows.map(rowOut);
    const eff = await this.effective(pool);
    const validatedRow = versions.find(v => v.status === 'VALIDATED') || null;
    const draft = versions.find(v => v.status === 'DRAFT' && (!validatedRow || v.version > validatedRow.version)) || null;
    return {
      effective: eff,
      validated: validatedRow,
      draft,
      versions,
      defs: CRITERIA_DEFS,
      defaults: DEFAULT_NUMBERS,
      texts: currentTexts(),
      texts_hash: textsHash()
    };
  }

  /** Ajuste: nova versão em rascunho a partir do rascunho mais novo (ou da validada). */
  async createDraft(pool: Pool, input: { numbers?: Record<string, unknown>; note?: unknown }, userId: string | null) {
    await this.ensureFirst(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa ajustes e validações simultâneos (o banco em memória dos testes não tem LOCK)
      if (!isDbInMemory()) await client.query('LOCK TABLE research_criteria_versions IN SHARE ROW EXCLUSIVE MODE');
      const last = await client.query(`SELECT version, status, numbers FROM research_criteria_versions WHERE status IN ('DRAFT', 'VALIDATED') ORDER BY version DESC LIMIT 1`);
      const base: CriteriaNumbers = last.rows.length ? { ...DEFAULT_NUMBERS, ...parseJson(last.rows[0].numbers) } : DEFAULT_NUMBERS;
      const numbers = checkNumbers(input?.numbers || {}, base);
      const max = await client.query(`SELECT COALESCE(MAX(version), 0) AS v FROM research_criteria_versions`);
      const version = Number(max.rows[0].v) + 1;
      const texts = currentTexts();
      // Rascunhos anteriores ficam guardados, mas não podem mais ser validados
      await client.query(`UPDATE research_criteria_versions SET status = 'SUPERSEDED' WHERE status = 'DRAFT'`);
      const note = input?.note === undefined || input?.note === null ? null : String(input.note).trim().slice(0, 500) || null;
      const ins = await client.query(
        `INSERT INTO research_criteria_versions (version, status, numbers, texts, texts_hash, note, created_by)
         VALUES ($1, 'DRAFT', $2, $3, $4, $5, $6) RETURNING *`,
        [version, JSON.stringify(numbers), JSON.stringify(texts), textsHash(texts), note, userId]
      );
      await client.query('COMMIT');
      const changed = (Object.keys(numbers) as (keyof CriteriaNumbers)[]).filter(k => numbers[k] !== base[k]);
      await writeAuditLog(pool, userId, 'RESEARCH_CRITERIA_DRAFT', `Critérios v${version} em rascunho (${changed.join(', ') || 'sem mudança de número'})`, JSON.stringify(base), JSON.stringify(numbers), false).catch(() => {});
      return rowOut(ins.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Validar: só o rascunho mais novo, e só se os textos dele ainda são os do sistema. */
  async validate(pool: Pool, version: number, userId: string | null) {
    if (!Number.isInteger(version) || version < 1) throw new CriteriaError(404, 'Versão não encontrada.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa ajustes e validações simultâneos (o banco em memória dos testes não tem LOCK)
      if (!isDbInMemory()) await client.query('LOCK TABLE research_criteria_versions IN SHARE ROW EXCLUSIVE MODE');
      const r = await client.query(`SELECT * FROM research_criteria_versions WHERE version = $1`, [version]);
      if (r.rows.length === 0) throw new CriteriaError(404, 'Versão não encontrada.');
      const row = r.rows[0];
      if (row.status !== 'DRAFT') throw new CriteriaError(409, 'Só um rascunho pode ser validado. Faça um ajuste para criar um novo.');
      if (row.texts_hash !== textsHash()) throw new CriteriaError(409, 'Os textos do checklist ou das regras mudaram depois deste rascunho. Crie um rascunho novo e valide.');
      checkNumbers(parseJson(row.numbers));
      await client.query(`UPDATE research_criteria_versions SET status = 'SUPERSEDED' WHERE status = 'VALIDATED'`);
      const up = await client.query(
        `UPDATE research_criteria_versions SET status = 'VALIDATED', validated_by = $2, validated_at = NOW() WHERE version = $1 RETURNING *`,
        [version, userId]
      );
      await client.query('COMMIT');
      await writeAuditLog(pool, userId, 'RESEARCH_CRITERIA_VALIDATED', `Critérios v${version} validados`, null, JSON.stringify(parseJson(row.numbers)), false).catch(() => {});
      return rowOut(up.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
