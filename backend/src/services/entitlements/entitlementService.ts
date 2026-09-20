export interface ProvisionEntitlementParams {
  orderId: string;
  paymentId: string;
  customerEmail: string;
  productId: string;
  metadata?: Record<string, any>;
}

export interface EntitlementResult {
  success: boolean;
  entitlementId?: string;
  status: 'active' | 'pending' | 'failed';
  error?: string;
}

export interface SupabaseBridgeConfig {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  fetchFn?: typeof fetch;
}

/**
 * Maps commercial offer slugs / names to authoritative entitlement product IDs.
 */
export function resolveEntitlementProductId(offerSlugOrName: string): string | null {
  if (!offerSlugOrName) return null;
  const normalized = offerSlugOrName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const compact = normalized.replace(/[\s_-]+/g, '');
  if (
    compact.includes('bolsoblindado') ||
    normalized.includes('bolso') && normalized.includes('blindado')
  ) {
    return 'bolso_blindado_web';
  }
  return null;
}

/**
 * Post-Commit Supabase Entitlement Provisioner.
 * Communicates directly with Supabase via HTTPS REST and Admin Auth APIs.
 * 
 * CRITICAL ARCHITECTURAL RULE:
 * This runs strictly AFTER the payment transaction has committed (PAID state).
 * Failure here NEVER rolls back the payment or financial state.
 */
export async function provisionProductEntitlement(
  params: ProvisionEntitlementParams,
  config?: SupabaseBridgeConfig
): Promise<EntitlementResult> {
  const supabaseUrl = (config?.supabaseUrl || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = config?.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const fetchImpl = config?.fetchFn || fetch;

  if (!supabaseUrl || !serviceKey) {
    console.warn('[EntitlementBridge] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Entitlement skipped (non-fatal).');
    return {
      success: false,
      status: 'pending',
      error: 'SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED'
    };
  }

  const normalizedEmail = params.customerEmail.trim().toLowerCase();

  try {
    // 1. Resolve existing user from Supabase Auth Admin API
    let boundUserId: string | null = null;
    try {
      const adminAuthRes = await fetchImpl(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (adminAuthRes.ok) {
        const authData: any = await adminAuthRes.json();
        const usersList: any[] = Array.isArray(authData) ? authData : (authData.users || []);
        const matched = usersList.find((u: any) => u.email && u.email.trim().toLowerCase() === normalizedEmail);
        if (matched && matched.id) {
          boundUserId = matched.id;
        }
      }
    } catch (authErr: any) {
      console.warn('[EntitlementBridge] Auth Admin lookup warning (continuing with NULL user_id):', authErr.message);
      boundUserId = null;
    }

    // 2. Upsert customer_entitlements record via PostgREST with service_role key
    const entitlementPayload = {
      user_id: boundUserId,
      customer_email: normalizedEmail,
      product_id: params.productId,
      order_id: params.orderId,
      payment_id: params.paymentId,
      status: 'active',
      metadata: params.metadata || {}
    };

    const restRes = await fetchImpl(`${supabaseUrl}/rest/v1/customer_entitlements?on_conflict=customer_email,product_id,order_id`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(entitlementPayload)
    });

    if (!restRes.ok) {
      const errorText = await restRes.text();
      throw new Error(`SUPABASE_REST_ERROR_${restRes.status}: ${errorText}`);
    }

    const insertedData: any = await restRes.json();
    const entitlementRecord = Array.isArray(insertedData) ? insertedData[0] : insertedData;
    const entitlementId = entitlementRecord?.id;

    // 3. Write secondary audit log record (non-fatal)
    if (entitlementId) {
      try {
        await fetchImpl(`${supabaseUrl}/rest/v1/entitlement_audit_log`, {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            entitlement_id: entitlementId,
            action: boundUserId ? 'GRANTED_AND_BOUND' : 'GRANTED_PENDING_USER',
            actor: 'post_commit_provisioner',
            payload: {
              order_id: params.orderId,
              email: normalizedEmail,
              user_id: boundUserId,
              product_id: params.productId
            }
          })
        });
      } catch (auditErr: any) {
        console.warn('[EntitlementBridge] Audit log write warning (non-fatal):', auditErr.message);
      }
    }

    return {
      success: true,
      entitlementId,
      status: 'active'
    };
  } catch (err: any) {
    console.error('[EntitlementBridge] Entitlement provisioning error:', err.message);
    return {
      success: false,
      status: 'failed',
      error: err.message
    };
  }
}
