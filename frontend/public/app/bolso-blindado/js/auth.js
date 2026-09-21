/**
 * NORQVA — Bolso Blindado Auth Service V1.1
 * Supabase Auth Lifecycle Manager (Email + Password, Session Restore, Sign Out, Recovery)
 * Strict Security: Client uses ONLY public publishable credentials (SUPABASE_URL, SUPABASE_ANON_KEY).
 */

class AuthService {
  constructor() {
    this.client = null;
    this.currentSession = null;
    this.currentUser = null;
    this.listeners = [];
    this.isConfigured = false;
  }

  init(url, anonKey) {
    if (url && anonKey && window.supabase && window.supabase.createClient) {
      try {
        this.client = window.supabase.createClient(url, anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.localStorage
          }
        });
        this.isConfigured = true;
        this.setupAuthListener();
      } catch (e) {
        console.warn('Supabase initialization failed, falling back to LocalStorage:', e);
        this.isConfigured = false;
      }
    } else {
      console.log('Supabase client not configured. Running in LocalStorage offline mode.');
      this.isConfigured = false;
    }
  }

  setupAuthListener() {
    if (!this.client) return;

    this.client.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session ? session.user.email : 'No session');
      this.currentSession = session;
      this.currentUser = session ? session.user : null;

      if (session && window.SupabaseDataStore) {
        window.db = new window.SupabaseDataStore(this.client, session);
      } else if (window.LocalStorageDataStore) {
        window.db = new window.LocalStorageDataStore();
      }

      this.notifyListeners(event, session);
    });
  }

  onAuthStateChange(callback) {
    this.listeners.push(callback);
  }

  notifyListeners(event, session) {
    this.listeners.forEach(cb => {
      try {
        cb(event, session);
      } catch (e) {
        console.error('Error in auth state listener:', e);
      }
    });
  }

  async getSession() {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.currentSession = data.session;
      this.currentUser = data.session ? data.session.user : null;
      return data.session;
    } catch (e) {
      console.error('Error getting session:', e);
      return null;
    }
  }

  async signUp(email, password, fullName) {
    if (!this.client) throw new Error('Supabase não configurado');
    const { data, error } = await this.client.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: {
          full_name: fullName.trim()
        }
      }
    });
    if (error) throw error;
    return data;
  }

  async signIn(email, password) {
    if (!this.client) throw new Error('Supabase não configurado');
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    if (!this.client) return;
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    this.currentSession = null;
    this.currentUser = null;
    if (window.LocalStorageDataStore) {
      window.db = new window.LocalStorageDataStore();
    }
  }

  async resetPassword(email, redirectTo = null) {
    if (!this.client) throw new Error('Supabase não configurado');
    const options = {};
    if (redirectTo) {
      options.redirectTo = redirectTo;
    }
    const { data, error } = await this.client.auth.resetPasswordForEmail(email.trim(), options);
    if (error) throw error;
    return data;
  }

  async checkUserAccess(productId = 'bolso_blindado_web') {
    if (!this.client || !this.currentSession) {
      return { hasAccess: false, status: 'unauthenticated' };
    }
    try {
      // 1. Primary: Server-authoritative PostgreSQL RPC
      const { data, error } = await this.client.rpc('check_user_access', { p_product_id: productId });
      if (!error && data) {
        return {
          hasAccess: !!data.has_access,
          status: data.status || 'none',
          productId: productId,
          expiresAt: data.expires_at || null
        };
      }

      // 2. Direct RLS query fallback if RPC is still being deployed
      const { data: entData, error: entErr } = await this.client
        .from('customer_entitlements')
        .select('*')
        .eq('product_id', productId)
        .eq('status', 'active')
        .limit(1);

      if (!entErr && entData && entData.length > 0) {
        return {
          hasAccess: true,
          status: 'active',
          productId: productId
        };
      }

      return { hasAccess: false, status: 'no_entitlement' };
    } catch (e) {
      console.warn('[AuthService] Error checking user entitlement:', e);
      return { hasAccess: false, status: 'error', error: e.message };
    }
  }

  isAuthenticated() {
    return !!this.currentSession;
  }
}

window.authService = new AuthService();
