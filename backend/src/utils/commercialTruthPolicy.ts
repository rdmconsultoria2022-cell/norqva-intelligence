/**
 * NORQVA Commercial Truth Policy V1
 *
 * Centralized domain rules for strict segregation between:
 * 1. NORQVA Commercial Production Operations
 * 2. Staging / QA / Sandbox / Demo Development History
 *
 * Rule: Fail closed. Historical and test categories MUST NOT contribute
 * to commercial revenue, orders, conversions, CAC, ROAS, AOV, or KPIs.
 */

export type DataProvenance = 
  | 'COMMERCIAL_PRODUCTION' 
  | 'STAGING_SANDBOX_QA' 
  | 'QA_FIXTURE' 
  | 'DEMO_SEED' 
  | 'LEGACY_MIGRATION' 
  | 'UNKNOWN';

export interface ProvenanceEntity {
  is_demo?: boolean;
  data_provenance?: string;
  status?: string;
}

/**
 * Domain rule: Determines if an entity is strictly eligible for commercial operations/reporting.
 */
export function isCommercialEligible(entity: ProvenanceEntity | null | undefined): boolean {
  if (!entity) return false;
  if (entity.is_demo === true) return false;
  return entity.data_provenance === 'COMMERCIAL_PRODUCTION';
}

/**
 * Domain rule for orders contributing to commercial revenue.
 */
export function isOrderEligibleForRevenue(order: (ProvenanceEntity & { status?: string }) | null | undefined): boolean {
  if (!isCommercialEligible(order)) return false;
  return order?.status === 'PAID';
}

/**
 * Domain rule for payments contributing to confirmed commercial settlement.
 */
export function isPaymentEligibleForRevenue(payment: (ProvenanceEntity & { status?: string }) | null | undefined): boolean {
  if (!isCommercialEligible(payment)) return false;
  return payment?.status === 'CONFIRMED';
}

/**
 * Domain rule for products in the commercial catalog.
 */
export function isProductEligibleForCatalog(product: (ProvenanceEntity & { is_deleted?: boolean }) | null | undefined): boolean {
  if (!isCommercialEligible(product)) return false;
  return product?.is_deleted !== true;
}

/**
 * Domain rule for offers in commercial commerce.
 */
export function isOfferEligibleForCommerce(offer: (ProvenanceEntity & { is_deleted?: boolean }) | null | undefined): boolean {
  if (!isCommercialEligible(offer)) return false;
  return offer?.is_deleted !== true;
}

/**
 * SQL Clause Builder: Orders
 */
export function getCommercialOrderClause(tableAlias = 'o', isDemo = false): string {
  if (isDemo) {
    return `(${tableAlias}.is_demo = TRUE OR ${tableAlias}.data_provenance IN ('DEMO_SEED', 'QA_FIXTURE'))`;
  }
  return `(${tableAlias}.is_demo = FALSE AND ${tableAlias}.data_provenance = 'COMMERCIAL_PRODUCTION')`;
}

/**
 * SQL Clause Builder: Payments
 */
export function getCommercialPaymentClause(tableAlias = 'p', isDemo = false): string {
  if (isDemo) {
    return `(${tableAlias}.is_demo = TRUE OR ${tableAlias}.data_provenance IN ('DEMO_SEED', 'QA_FIXTURE'))`;
  }
  return `(${tableAlias}.is_demo = FALSE AND ${tableAlias}.data_provenance = 'COMMERCIAL_PRODUCTION')`;
}

/**
 * SQL Clause Builder: Products
 */
export function getCommercialProductClause(tableAlias = 'p', isDemo = false): string {
  if (isDemo) {
    return `(${tableAlias}.is_demo = TRUE OR ${tableAlias}.data_provenance IN ('DEMO_SEED', 'QA_FIXTURE'))`;
  }
  return `(${tableAlias}.is_demo = FALSE AND ${tableAlias}.data_provenance = 'COMMERCIAL_PRODUCTION' AND ${tableAlias}.is_deleted = FALSE)`;
}

/**
 * SQL Clause Builder: Offers
 */
export function getCommercialOfferClause(tableAlias = 'o', isDemo = false): string {
  if (isDemo) {
    return `(${tableAlias}.is_demo = TRUE OR ${tableAlias}.data_provenance IN ('DEMO_SEED', 'QA_FIXTURE'))`;
  }
  return `(${tableAlias}.is_demo = FALSE AND ${tableAlias}.data_provenance = 'COMMERCIAL_PRODUCTION' AND ${tableAlias}.is_deleted = FALSE)`;
}

/**
 * SQL Clause Builder: Performance Entries
 */
export function getCommercialPerformanceClause(tableAlias = 'pe', isDemo = false): string {
  if (isDemo) {
    return `(${tableAlias}.is_demo = TRUE OR ${tableAlias}.data_provenance IN ('DEMO_SEED', 'QA_FIXTURE'))`;
  }
  return `(${tableAlias}.is_demo = FALSE AND ${tableAlias}.data_provenance = 'COMMERCIAL_PRODUCTION')`;
}

/**
 * SQL Clause Builder: Meta Spend & Media Insights
 */
export function getCommercialMediaSpendClause(tableAlias = 'mi', accountAlias = 'mac', connAlias = 'mconn', isDemo = false): string {
  if (isDemo) {
    return `(${tableAlias}.is_demo = TRUE OR ${tableAlias}.data_provenance IN ('DEMO_SEED', 'QA_FIXTURE') OR ${accountAlias}.is_demo = TRUE OR ${connAlias}.is_demo = TRUE)`;
  }
  return `(
    ${tableAlias}.is_demo = FALSE 
    AND ${accountAlias}.is_demo = FALSE 
    AND ${accountAlias}.connection_id IS NOT NULL
    AND ${connAlias}.id IS NOT NULL
    AND ${connAlias}.is_demo = FALSE
    AND ${connAlias}.status IN ('CONNECTED', 'EXPIRED')
    AND ${tableAlias}.data_provenance IN ('COMMERCIAL_PRODUCTION', 'LEGACY_MIGRATION')
  )`;
}
