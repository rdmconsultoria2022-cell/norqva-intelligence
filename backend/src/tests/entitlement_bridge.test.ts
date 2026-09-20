import { describe, it, expect, vi } from 'vitest';
import {
  resolveEntitlementProductId,
  provisionProductEntitlement
} from '../services/entitlements/entitlementService';

describe('NORQVA — Gate 11.6 Supabase Entitlement Server Bridge', () => {
  const fakeSupabaseUrl = 'https://fake-project.supabase.co';
  const fakeServiceKey = 'service_role_secret_key_12345';

  it('A: Existing Supabase User: resolves auth UUID and provisions entitlement with user_id', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.endsWith('/auth/v1/admin/users')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            users: [
              { id: 'user-uuid-1111', email: 'customer@norqva.com' },
              { id: 'user-uuid-2222', email: 'other@norqva.com' }
            ]
          })
        };
      }
      if (url.includes('/rest/v1/customer_entitlements')) {
        const body = JSON.parse(init.body);
        expect(body.user_id).toBe('user-uuid-1111');
        expect(body.customer_email).toBe('customer@norqva.com');
        expect(body.product_id).toBe('bolso_blindado_web');
        expect(init.headers['Authorization']).toBe(`Bearer ${fakeServiceKey}`);
        return {
          ok: true,
          status: 201,
          json: async () => [{ id: 'ent-uuid-0001', status: 'active', user_id: 'user-uuid-1111' }]
        };
      }
      if (url.includes('/rest/v1/entitlement_audit_log')) {
        const body = JSON.parse(init.body);
        expect(body.action).toBe('GRANTED_AND_BOUND');
        return { ok: true, status: 201, json: async () => [{ id: 'audit-001' }] };
      }
      return { ok: false, status: 404, text: async () => 'Not Found' };
    });

    const res = await provisionProductEntitlement(
      {
        orderId: 'order-0001',
        paymentId: 'pay-0001',
        customerEmail: 'CUSTOMER@NORQVA.COM ', // test normalization
        productId: 'bolso_blindado_web'
      },
      {
        supabaseUrl: fakeSupabaseUrl,
        serviceRoleKey: fakeServiceKey,
        fetchFn: mockFetch as any
      }
    );

    expect(res.success).toBe(true);
    expect(res.entitlementId).toBe('ent-uuid-0001');
    expect(res.status).toBe('active');
  });

  it('B: User Not Yet Registered: provisions entitlement with user_id NULL for future trigger binding', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.endsWith('/auth/v1/admin/users')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ users: [] }) // no user exists
        };
      }
      if (url.includes('/rest/v1/customer_entitlements')) {
        const body = JSON.parse(init.body);
        expect(body.user_id).toBeNull();
        expect(body.customer_email).toBe('pending@example.com');
        return {
          ok: true,
          status: 201,
          json: async () => [{ id: 'ent-uuid-pending-0002', status: 'active', user_id: null }]
        };
      }
      if (url.includes('/rest/v1/entitlement_audit_log')) {
        const body = JSON.parse(init.body);
        expect(body.action).toBe('GRANTED_PENDING_USER');
        return { ok: true, status: 201, json: async () => [{ id: 'audit-002' }] };
      }
      return { ok: false, status: 404, text: async () => 'Not Found' };
    });

    const res = await provisionProductEntitlement(
      {
        orderId: 'order-0002',
        paymentId: 'pay-0002',
        customerEmail: 'pending@example.com',
        productId: 'bolso_blindado_web'
      },
      {
        supabaseUrl: fakeSupabaseUrl,
        serviceRoleKey: fakeServiceKey,
        fetchFn: mockFetch as any
      }
    );

    expect(res.success).toBe(true);
    expect(res.entitlementId).toBe('ent-uuid-pending-0002');
    expect(res.status).toBe('active');
  });

  it('C & D: Idempotency & Unique Order Support: passes canonical conflict target to PostgREST', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.endsWith('/auth/v1/admin/users')) {
        return { ok: true, status: 200, json: async () => ({ users: [] }) };
      }
      if (url.includes('/rest/v1/customer_entitlements')) {
        expect(url).toContain('on_conflict=customer_email,product_id,order_id');
        expect(init.headers['Prefer']).toContain('resolution=merge-duplicates');
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'ent-uuid-0001', status: 'active' }]
        };
      }
      return { ok: true, status: 201, json: async () => [] };
    });

    const res = await provisionProductEntitlement(
      {
        orderId: 'order-0001',
        paymentId: 'pay-0001',
        customerEmail: 'customer@norqva.com',
        productId: 'bolso_blindado_web'
      },
      {
        supabaseUrl: fakeSupabaseUrl,
        serviceRoleKey: fakeServiceKey,
        fetchFn: mockFetch as any
      }
    );

    expect(res.success).toBe(true);
  });

  it('E: Supabase Network/API Failure returns non-fatal failure result without throwing uncaught error', async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      throw new Error('Supabase network connection timeout');
    });

    const res = await provisionProductEntitlement(
      {
        orderId: 'order-0003',
        paymentId: 'pay-0003',
        customerEmail: 'customer@norqva.com',
        productId: 'bolso_blindado_web'
      },
      {
        supabaseUrl: fakeSupabaseUrl,
        serviceRoleKey: fakeServiceKey,
        fetchFn: mockFetch as any
      }
    );

    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.error).toContain('Supabase network connection timeout');
  });

  it('F: Secret Isolation: missing config produces clean status without leaking credentials', async () => {
    const res = await provisionProductEntitlement(
      {
        orderId: 'order-0004',
        paymentId: 'pay-0004',
        customerEmail: 'customer@norqva.com',
        productId: 'bolso_blindado_web'
      },
      {
        supabaseUrl: '',
        serviceRoleKey: ''
      }
    );

    expect(res.success).toBe(false);
    expect(res.status).toBe('pending');
    expect(res.error).toBe('SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED');
  });

  it('G: Product Mapping resolves commercial names and offer human_ids to bolso_blindado_web', () => {
    expect(resolveEntitlementProductId('Método Bolso Blindado')).toBe('bolso_blindado_web');
    expect(resolveEntitlementProductId('OFF-BOLSO-BLINDADO-2990')).toBe('bolso_blindado_web');
    expect(resolveEntitlementProductId('bolso_blindado_pix')).toBe('bolso_blindado_web');
    expect(resolveEntitlementProductId('GEO-LITE Proximity Engine')).toBeNull();
    expect(resolveEntitlementProductId('')).toBeNull();
  });
});
