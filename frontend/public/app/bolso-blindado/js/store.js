/**
 * NORQVA — Bolso Blindado Data Store Architecture V1.1
 * Clean asynchronous IDataStore interface with dual backends:
 * 1. LocalStorageDataStore (Offline / Legacy / Demo compatibility)
 * 2. SupabaseDataStore (Commercial Multi-User / PostgreSQL / Row Level Security)
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'norqva_bb_transactions_v1',
  CATEGORIES: 'norqva_bb_categories_v1',
  SETTINGS: 'norqva_bb_settings_v1',
  INITIALIZED: 'norqva_bb_initialized_v1'
};

const DEFAULT_CATEGORIES = [
  { id: 'cat_salario', name: 'Salário / Pró-Labore', type: 'Receita', pillar: 'Renda', budget: 0 },
  { id: 'cat_renda_extra', name: 'Renda Extra / Freelance', type: 'Receita', pillar: 'Renda', budget: 0 },
  { id: 'cat_investimentos_ret', name: 'Rendimento de Investimentos', type: 'Receita', pillar: 'Renda', budget: 0 },
  { id: 'cat_moradia', name: 'Moradia (Aluguel/Condomínio)', type: 'Despesa', pillar: 'Essencial', budget: 2200 },
  { id: 'cat_mercado', name: 'Alimentação & Mercado', type: 'Despesa', pillar: 'Essencial', budget: 1000 },
  { id: 'cat_saude', name: 'Saúde & Farmácia', type: 'Despesa', pillar: 'Essencial', budget: 600 },
  { id: 'cat_transporte', name: 'Transporte & Combustível', type: 'Despesa', pillar: 'Essencial', budget: 500 },
  { id: 'cat_contas', name: 'Contas de Consumo (Luz/Água/Net)', type: 'Despesa', pillar: 'Essencial', budget: 300 },
  { id: 'cat_educacao', name: 'Educação & Cursos', type: 'Despesa', pillar: 'Essencial', budget: 250 },
  { id: 'cat_lazer', name: 'Lazer & Restaurantes', type: 'Despesa', pillar: 'Conforto', budget: 400 },
  { id: 'cat_assinaturas', name: 'Assinaturas & Streaming', type: 'Despesa', pillar: 'Conforto', budget: 150 },
  { id: 'cat_compras', name: 'Compras Pessoais & Roupas', type: 'Despesa', pillar: 'Conforto', budget: 250 },
  { id: 'cat_reserva', name: 'Aporte Reserva de Emergência', type: 'Despesa', pillar: 'Reserva', budget: 1500 },
  { id: 'cat_dividas', name: 'Quitação de Dívidas / Empréstimos', type: 'Despesa', pillar: 'Dividas', budget: 0 },
  { id: 'cat_outros', name: 'Outros / Diversos', type: 'Despesa', pillar: 'Conforto', budget: 300 }
];

const DEFAULT_SETTINGS = {
  currency: 'BRL',
  monthlySavingsGoal: 3000.00,
  reserveGoal: 20000.00,
  currentReserve: 8500.00,
  userName: 'Usuário',
  currentYear: 2026,
  currentMonth: 1
};

const DEMO_TRANSACTIONS = [
  { id: 'tx_01', date: '2026-01-05', description: 'Salário Mensal CLT', category: 'Salário / Pró-Labore', type: 'Receita', amount: 7200.00 },
  { id: 'tx_02', date: '2026-01-05', description: 'Aluguel & Condomínio', category: 'Moradia (Aluguel/Condomínio)', type: 'Despesa', amount: 2100.00 },
  { id: 'tx_03', date: '2026-01-08', description: 'Supermercado Mensal', category: 'Alimentação & Mercado', type: 'Despesa', amount: 850.00 },
  { id: 'tx_04', date: '2026-01-10', description: 'Projeto Freelance Consultoria', category: 'Renda Extra / Freelance', type: 'Receita', amount: 1250.00 },
  { id: 'tx_05', date: '2026-01-12', description: 'Plano de Saúde Familiar', category: 'Saúde & Farmácia', type: 'Despesa', amount: 520.00 },
  { id: 'tx_06', date: '2026-01-15', description: 'Combustível Posto Ipiranga', category: 'Transporte & Combustível', type: 'Despesa', amount: 230.00 },
  { id: 'tx_07', date: '2026-01-18', description: 'Jantar Restaurante Italiano', category: 'Lazer & Restaurantes', type: 'Despesa', amount: 180.00 },
  { id: 'tx_08', date: '2026-01-20', description: 'Conta de Energia Elétrica', category: 'Contas de Consumo (Luz/Água/Net)', type: 'Despesa', amount: 195.00 },
  { id: 'tx_09', date: '2026-01-22', description: 'Assinatura Netflix + Spotify', category: 'Assinaturas & Streaming', type: 'Despesa', amount: 79.90 },
  { id: 'tx_10', date: '2026-01-25', description: 'Farmácia Remédios', category: 'Saúde & Farmácia', type: 'Despesa', amount: 85.00 },
  { id: 'tx_11', date: '2026-01-27', description: 'Supermercado Reposição', category: 'Alimentação & Mercado', type: 'Despesa', amount: 215.00 },
  { id: 'tx_12', date: '2026-01-28', description: 'Uber Transporte', category: 'Transporte & Combustível', type: 'Despesa', amount: 98.50 },
  { id: 'tx_13', date: '2026-01-30', description: 'Internet Fibra Óptica', category: 'Contas de Consumo (Luz/Água/Net)', type: 'Despesa', amount: 120.00 },
  { id: 'tx_14', date: '2026-01-31', description: 'Manutenção Preventiva / Outros', category: 'Outros / Diversos', type: 'Despesa', amount: 214.10 }
];

/**
 * Abstract DataStore Base Class
 */
class BaseDataStore {
  // Format helpers
  formatCurrency(value) {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  // Pure Business Logic / Aggregation (Independent of persistence layer)
  async getMonthlySummary(year = 2026, month = null) {
    const transactions = await this.getTransactions();
    const categories = await this.getCategories();
    
    const filtered = transactions.filter(t => {
      if (!t.date) return true;
      const parts = t.date.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (year && y !== year) return false;
      if (month && m !== month) return false;
      return true;
    });

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = {};
    const pillarTotals = {
      Essencial: 0,
      Conforto: 0,
      Reserva: 0,
      Dividas: 0
    };

    const catMap = {};
    categories.forEach(c => { catMap[c.name] = c; });

    filtered.forEach(t => {
      if (t.type === 'Receita') {
        totalIncome += t.amount;
      } else {
        totalExpense += t.amount;
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
        
        const catInfo = catMap[t.category];
        const pillar = catInfo ? catInfo.pillar : 'Conforto';
        if (pillarTotals[pillar] !== undefined) {
          pillarTotals[pillar] += t.amount;
        } else {
          pillarTotals.Conforto += t.amount;
        }
      }
    });

    const netBalance = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

    const sortedCategories = Object.entries(categoryTotals)
      .map(([name, amount]) => {
        const catInfo = catMap[name] || {};
        return {
          name,
          amount,
          budget: catInfo.budget || 0,
          percentageOfExpense: totalExpense > 0 ? (amount / totalExpense) * 100 : 0
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return {
      totalIncome,
      totalExpense,
      netBalance,
      savingsRate,
      transactionCount: filtered.length,
      topCategories: sortedCategories,
      pillarTotals,
      transactions: filtered
    };
  }

  async getGoalProgress() {
    const summary = await this.getMonthlySummary(2026, 1);
    const settings = await this.getSettings();
    const goal = parseFloat(settings.monthlySavingsGoal) || 3000.00;
    const netBalance = summary.netBalance;
    const isNegative = netBalance < 0;
    const currentSavings = Math.max(0, netBalance);
    const progressPct = goal > 0 ? (currentSavings / goal) * 100 : 0;

    let state = 'NEEDS_ATTENTION';
    let label = 'Precisamos ajustar';
    let message = 'Seus gastos estão afastando você do objetivo deste mês. Veja onde é possível reduzir.';
    let colorClass = 'state-attention';

    if (isNegative) {
      state = 'NEGATIVE_BALANCE';
      label = 'Saldo negativo';
      message = 'Neste momento, suas despesas estão maiores que suas receitas. Revise os principais gastos do mês.';
      colorClass = 'state-negative';
    } else if (progressPct >= 100) {
      state = 'GOAL_ACHIEVED';
      label = 'Objetivo alcançado';
      message = progressPct > 100
        ? 'Você ultrapassou sua meta. Ótimo trabalho em manter o controle.'
        : 'Excelente. Você alcançou seu objetivo deste mês. Continue mantendo esse ritmo.';
      colorClass = 'state-achieved';
    } else if (progressPct >= 60) {
      state = 'GETTING_CLOSE';
      label = 'Você está quase lá';
      message = 'Seu objetivo está próximo. Pequenos ajustes podem fazer a diferença.';
      colorClass = 'state-close';
    }

    return {
      goal,
      currentSavings,
      netBalance,
      isNegative,
      progressPct: parseFloat(progressPct.toFixed(1)),
      clampedProgressPct: Math.min(100, Math.max(0, progressPct)),
      state,
      label,
      message,
      colorClass
    };
  }
}

/**
 * LocalStorageDataStore — Offline / Legacy / Testing Implementation
 */
class LocalStorageDataStore extends BaseDataStore {
  constructor() {
    super();
    this.mode = 'LOCALSTORAGE';
    this.init();
  }

  init() {
    const initialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!initialized) {
      this.loadDemoData();
    }
  }

  loadDemoData() {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(DEMO_TRANSACTIONS));
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  }

  async resetAllData() {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    return true;
  }

  async getTransactions() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error loading local transactions', e);
      return [];
    }
  }

  async saveTransactions(transactions) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  }

  async addTransaction(tx) {
    const transactions = await this.getTransactions();
    const newTx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      date: tx.date || new Date().toISOString().split('T')[0],
      description: tx.description.trim(),
      category: tx.category,
      type: tx.type === 'Receita' ? 'Receita' : 'Despesa',
      amount: Math.abs(parseFloat(tx.amount)) || 0
    };
    transactions.unshift(newTx);
    await this.saveTransactions(transactions);
    return newTx;
  }

  async updateTransaction(id, updatedTx) {
    const transactions = await this.getTransactions();
    const index = transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      transactions[index] = {
        ...transactions[index],
        date: updatedTx.date,
        description: updatedTx.description.trim(),
        category: updatedTx.category,
        type: updatedTx.type === 'Receita' ? 'Receita' : 'Despesa',
        amount: Math.abs(parseFloat(updatedTx.amount)) || 0
      };
      await this.saveTransactions(transactions);
      return transactions[index];
    }
    return null;
  }

  async deleteTransaction(id) {
    const transactions = await this.getTransactions();
    const filtered = transactions.filter(t => t.id !== id);
    await this.saveTransactions(filtered);
    return filtered.length !== transactions.length;
  }

  async getCategories() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      return data ? JSON.parse(data) : DEFAULT_CATEGORIES;
    } catch (e) {
      return DEFAULT_CATEGORIES;
    }
  }

  async saveCategories(categories) {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  }

  async addCategory(name, type = 'Despesa', pillar = 'Conforto', budget = 0) {
    const categories = await this.getCategories();
    const newCat = {
      id: 'cat_' + Date.now(),
      name: name.trim(),
      type: type,
      pillar: pillar,
      budget: parseFloat(budget) || 0
    };
    categories.push(newCat);
    await this.saveCategories(categories);
    return newCat;
  }

  async deleteCategory(id) {
    const categories = await this.getCategories();
    const filtered = categories.filter(c => c.id !== id);
    await this.saveCategories(filtered);
    return true;
  }

  async getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? JSON.parse(data) : DEFAULT_SETTINGS;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  }

  async updateSettings(newSettings) {
    const current = await this.getSettings();
    const updated = { ...current, ...newSettings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  }
}

/**
 * SupabaseDataStore — Production Commercial Multi-User Implementation
 * Row Level Security & PostgreSQL Backend
 */
class SupabaseDataStore extends BaseDataStore {
  constructor(supabaseClient, session) {
    super();
    this.mode = 'SUPABASE';
    this.client = supabaseClient;
    this.session = session;
    this.userId = session ? session.user.id : null;
    this._cachedCategories = null;
  }

  setSession(session) {
    this.session = session;
    this.userId = session ? session.user.id : null;
    this._cachedCategories = null;
  }

  async getTransactions() {
    if (!this.client || !this.userId) return [];
    try {
      const { data, error } = await this.client
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      return (data || []).map(t => ({
        id: t.id,
        date: t.date,
        description: t.description,
        category: t.category_name,
        categoryId: t.category_id,
        type: t.type,
        amount: parseFloat(t.amount) || 0
      }));
    } catch (e) {
      console.error('Supabase getTransactions error:', e);
      return [];
    }
  }

  async addTransaction(tx) {
    if (!this.client || !this.userId) throw new Error('Unauthenticated');
    const categories = await this.getCategories();
    const matchedCat = categories.find(c => c.name === tx.category && c.type === tx.type);

    const payload = {
      user_id: this.userId,
      date: tx.date || new Date().toISOString().split('T')[0],
      description: tx.description.trim(),
      category_name: tx.category,
      category_id: matchedCat ? matchedCat.id : null,
      type: tx.type === 'Receita' ? 'Receita' : 'Despesa',
      amount: Math.abs(parseFloat(tx.amount)) || 0
    };

    const { data, error } = await this.client
      .from('transactions')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      date: data.date,
      description: data.description,
      category: data.category_name,
      categoryId: data.category_id,
      type: data.type,
      amount: parseFloat(data.amount) || 0
    };
  }

  async updateTransaction(id, updatedTx) {
    if (!this.client || !this.userId) throw new Error('Unauthenticated');
    const categories = await this.getCategories();
    const matchedCat = categories.find(c => c.name === updatedTx.category && c.type === updatedTx.type);

    const payload = {
      date: updatedTx.date,
      description: updatedTx.description.trim(),
      category_name: updatedTx.category,
      category_id: matchedCat ? matchedCat.id : null,
      type: updatedTx.type === 'Receita' ? 'Receita' : 'Despesa',
      amount: Math.abs(parseFloat(updatedTx.amount)) || 0,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.client
      .from('transactions')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      date: data.date,
      description: data.description,
      category: data.category_name,
      categoryId: data.category_id,
      type: data.type,
      amount: parseFloat(data.amount) || 0
    };
  }

  async deleteTransaction(id) {
    if (!this.client || !this.userId) throw new Error('Unauthenticated');
    const { error } = await this.client
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  async getCategories() {
    if (!this.client || !this.userId) return DEFAULT_CATEGORIES;
    try {
      const { data, error } = await this.client
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;
      if (data && data.length > 0) {
        this._cachedCategories = data.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          pillar: c.pillar,
          budget: parseFloat(c.budget) || 0,
          isDefault: c.is_default
        }));
        return this._cachedCategories;
      }
      return DEFAULT_CATEGORIES;
    } catch (e) {
      console.error('Supabase getCategories error:', e);
      return DEFAULT_CATEGORIES;
    }
  }

  async addCategory(name, type = 'Despesa', pillar = 'Conforto', budget = 0) {
    if (!this.client || !this.userId) throw new Error('Unauthenticated');
    const payload = {
      user_id: this.userId,
      name: name.trim(),
      type,
      pillar,
      budget: parseFloat(budget) || 0,
      is_default: false
    };

    const { data, error } = await this.client
      .from('categories')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    this._cachedCategories = null;
    return {
      id: data.id,
      name: data.name,
      type: data.type,
      pillar: data.pillar,
      budget: parseFloat(data.budget) || 0
    };
  }

  async deleteCategory(id) {
    if (!this.client || !this.userId) throw new Error('Unauthenticated');
    const { error } = await this.client
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
    this._cachedCategories = null;
    return true;
  }

  async getSettings() {
    if (!this.client || !this.userId) return DEFAULT_SETTINGS;
    try {
      const { data, error } = await this.client
        .from('user_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        return {
          currency: data.currency || 'BRL',
          monthlySavingsGoal: parseFloat(data.monthly_savings_goal) || 3000.00,
          reserveGoal: parseFloat(data.reserve_goal) || 20000.00,
          currentReserve: parseFloat(data.current_reserve) || 0.00,
          userName: this.session.user.user_metadata?.full_name || 'Usuário',
          currentYear: 2026,
          currentMonth: 1
        };
      }
      return DEFAULT_SETTINGS;
    } catch (e) {
      console.error('Supabase getSettings error:', e);
      return DEFAULT_SETTINGS;
    }
  }

  async updateSettings(newSettings) {
    if (!this.client || !this.userId) throw new Error('Unauthenticated');
    const payload = {
      user_id: this.userId,
      updated_at: new Date().toISOString()
    };

    if (newSettings.monthlySavingsGoal !== undefined) {
      payload.monthly_savings_goal = parseFloat(newSettings.monthlySavingsGoal) || 0;
    }
    if (newSettings.reserveGoal !== undefined) {
      payload.reserve_goal = parseFloat(newSettings.reserveGoal) || 0;
    }
    if (newSettings.currentReserve !== undefined) {
      payload.current_reserve = parseFloat(newSettings.currentReserve) || 0;
    }
    if (newSettings.currency !== undefined) {
      payload.currency = newSettings.currency;
    }

    const { data, error } = await this.client
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    return {
      currency: data.currency,
      monthlySavingsGoal: parseFloat(data.monthly_savings_goal),
      reserveGoal: parseFloat(data.reserve_goal),
      currentReserve: parseFloat(data.current_reserve),
      userName: this.session.user.user_metadata?.full_name || 'Usuário',
      currentYear: 2026,
      currentMonth: 1
    };
  }

  async resetAllData() {
    if (!this.client || !this.userId) throw new Error('Unauthenticated');
    // Delete only user's transactions
    const { error } = await this.client
      .from('transactions')
      .delete()
      .eq('user_id', this.userId);

    if (error) throw error;
    return true;
  }
}

// Global Factory / Registry
window.LocalStorageDataStore = LocalStorageDataStore;
window.SupabaseDataStore = SupabaseDataStore;

// Default initial active store is LocalStorage until Supabase session is established
window.db = new LocalStorageDataStore();
