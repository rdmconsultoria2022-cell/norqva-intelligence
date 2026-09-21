/**
 * NORQVA — Bolso Blindado UI Controller V1.1
 * Asynchronous DataStore & Supabase Auth Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  let currentFilter = 'all';
  let formType = 'Despesa';

  // --- Initialize Supabase Auth if config available ---
  const supabaseUrl = window.ENV?.SUPABASE_URL || localStorage.getItem('norqva_supabase_url');
  const supabaseKey = window.ENV?.SUPABASE_ANON_KEY || localStorage.getItem('norqva_supabase_anon_key');
  
  if (supabaseUrl && supabaseKey && window.authService) {
    window.authService.init(supabaseUrl, supabaseKey);
    await window.authService.getSession();
  }

  // --- DOM Elements ---
  const views = {
    inicio: document.getElementById('view-inicio'),
    lancamentos: document.getElementById('view-lancamentos'),
    planejamento: document.getElementById('view-planejamento'),
    ajustes: document.getElementById('view-ajustes')
  };

  const navButtons = document.querySelectorAll('.nav-btn');
  const modalBackdrop = document.getElementById('txModalBackdrop');
  const txForm = document.getElementById('txForm');
  const btnTypeExpense = document.getElementById('btnTypeExpense');
  const btnTypeIncome = document.getElementById('btnTypeIncome');
  const formCategorySelect = document.getElementById('formCategory');

  // Auth Elements
  const authModalBackdrop = document.getElementById('authModalBackdrop');
  const authForm = document.getElementById('authForm');
  const authTitle = document.getElementById('authModalTitle');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const authNameGroup = document.getElementById('authNameGroup');
  const authPasswordGroup = document.getElementById('authPasswordGroup');
  const authToggleRegister = document.getElementById('authToggleRegister');
  const authToggleForgot = document.getElementById('authToggleForgot');
  const authErrorBox = document.getElementById('authErrorBox');
  const userProfileBadge = document.getElementById('userProfileBadge');
  const btnHeaderAuth = document.getElementById('btnHeaderAuth');
  const btnLogoutAjustes = document.getElementById('btnLogoutAjustes');
  const authStatusCard = document.getElementById('authStatusCard');

  let authMode = 'LOGIN'; // 'LOGIN' | 'REGISTER' | 'RECOVERY'

  // --- Auth State Updates ---
  function updateAuthUI() {
    const isAuth = window.authService && window.authService.isAuthenticated();
    const user = window.authService?.currentUser;
    const isSupabase = window.db && window.db.mode === 'SUPABASE';

    if (userProfileBadge) {
      if (isAuth && user) {
        const name = user.user_metadata?.full_name || user.email.split('@')[0];
        userProfileBadge.textContent = name;
        userProfileBadge.style.display = 'inline-flex';
        if (btnHeaderAuth) btnHeaderAuth.style.display = 'none';
      } else {
        userProfileBadge.style.display = 'none';
        if (btnHeaderAuth) btnHeaderAuth.style.display = 'inline-flex';
      }
    }

    if (authStatusCard) {
      if (isAuth && user) {
        authStatusCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600; color: var(--text-primary);">${user.user_metadata?.full_name || 'Conta Conectada'}</div>
              <div style="font-size: 12px; color: var(--text-muted);">${user.email}</div>
              <div style="display: flex; gap: 6px; margin-top: 4px; align-items: center;">
                <span class="badge-cloud" style="font-size: 11px;">● Nuvem Segura (RLS)</span>
                <span id="badgeEntitlement" class="badge-cloud" style="font-size: 11px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-color: rgba(59, 130, 246, 0.2);">Verificando Acesso...</span>
              </div>
            </div>
            <button class="btn-secondary" id="btnSignOutCard" style="height: 36px; padding: 0 12px; font-size: 12px;">Sair</button>
          </div>
        `;
        document.getElementById('btnSignOutCard')?.addEventListener('click', handleLogout);

        // Asynchronous Entitlement Verification
        window.authService.checkUserAccess('bolso_blindado_web').then(access => {
          const badge = document.getElementById('badgeEntitlement');
          if (badge) {
            if (access.hasAccess) {
              badge.textContent = '● Acesso Comercial Ativo';
              badge.style.color = '#10b981';
              badge.style.background = 'rgba(16, 185, 129, 0.1)';
              badge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
            } else {
              badge.textContent = '○ Modo Pessoal';
              badge.style.color = '#f59e0b';
              badge.style.background = 'rgba(245, 158, 11, 0.1)';
              badge.style.borderColor = 'rgba(245, 158, 11, 0.2)';
            }
          }
        }).catch(() => {});
      } else {
        authStatusCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600; color: var(--text-primary);">Armazenamento Local</div>
              <div style="font-size: 12px; color: var(--text-muted);">Dados salvos apenas neste navegador</div>
              <span class="badge-local" style="font-size: 11px; margin-top: 4px;">○ Modo Local / Demonstração</span>
            </div>
            <button class="btn-primary" id="btnSignInCard" style="height: 36px; padding: 0 12px; font-size: 12px;">Entrar / Criar Conta</button>
          </div>
        `;
        document.getElementById('btnSignInCard')?.addEventListener('click', () => openAuthModal('LOGIN'));
      }
    }
  }

  if (window.authService) {
    window.authService.onAuthStateChange(async () => {
      updateAuthUI();
      await renderAll();
    });
  }

  // --- Auth Modal Lifecycle ---
  function openAuthModal(mode = 'LOGIN') {
    authMode = mode;
    authErrorBox.style.display = 'none';
    authErrorBox.textContent = '';
    
    if (authMode === 'LOGIN') {
      authTitle.textContent = 'Entrar no Bolso Blindado';
      authSubmitBtn.textContent = 'Entrar';
      authNameGroup.style.display = 'none';
      authPasswordGroup.style.display = 'block';
      authToggleRegister.textContent = 'Não tem uma conta? Cadastre-se';
      authToggleForgot.style.display = 'block';
    } else if (authMode === 'REGISTER') {
      authTitle.textContent = 'Criar Nova Conta';
      authSubmitBtn.textContent = 'Criar Conta';
      authNameGroup.style.display = 'block';
      authPasswordGroup.style.display = 'block';
      authToggleRegister.textContent = 'Já tem uma conta? Entrar';
      authToggleForgot.style.display = 'none';
    } else if (authMode === 'RECOVERY') {
      authTitle.textContent = 'Recuperar Senha';
      authSubmitBtn.textContent = 'Enviar Link de Recuperação';
      authNameGroup.style.display = 'none';
      authPasswordGroup.style.display = 'none';
      authToggleRegister.textContent = 'Voltar para o Login';
      authToggleForgot.style.display = 'none';
    }
    
    if (authModalBackdrop) authModalBackdrop.classList.add('active');
  }

  function closeAuthModal() {
    if (authModalBackdrop) authModalBackdrop.classList.remove('active');
  }

  btnHeaderAuth?.addEventListener('click', () => openAuthModal('LOGIN'));
  document.getElementById('btnCloseAuthModal')?.addEventListener('click', closeAuthModal);

  authToggleRegister?.addEventListener('click', () => {
    if (authMode === 'LOGIN') openAuthModal('REGISTER');
    else openAuthModal('LOGIN');
  });

  authToggleForgot?.addEventListener('click', () => {
    openAuthModal('RECOVERY');
  });

  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const name = document.getElementById('authName')?.value || '';

    authErrorBox.style.display = 'none';
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Processando...';

    try {
      if (!window.authService?.isConfigured) {
        throw new Error('Serviço de autenticação em nuvem não configurado neste ambiente.');
      }

      if (authMode === 'LOGIN') {
        await window.authService.signIn(email, password);
        closeAuthModal();
      } else if (authMode === 'REGISTER') {
        await window.authService.signUp(email, password, name);
        alert('Conta criada com sucesso! Você já pode acessar seu Bolso Blindado.');
        closeAuthModal();
      } else if (authMode === 'RECOVERY') {
        await window.authService.resetPassword(email);
        alert('Link de recuperação enviado para seu e-mail!');
        closeAuthModal();
      }
    } catch (err) {
      console.error('Auth error:', err);
      authErrorBox.textContent = err.message || 'Falha na autenticação. Verifique os dados.';
      authErrorBox.style.display = 'block';
    } finally {
      authSubmitBtn.disabled = false;
      if (authMode === 'LOGIN') authSubmitBtn.textContent = 'Entrar';
      else if (authMode === 'REGISTER') authSubmitBtn.textContent = 'Criar Conta';
      else if (authMode === 'RECOVERY') authSubmitBtn.textContent = 'Enviar Link de Recuperação';
    }
  });

  async function handleLogout() {
    if (confirm('Deseja realmente sair da sua conta?')) {
      await window.authService?.signOut();
      updateAuthUI();
      await renderAll();
    }
  }

  btnLogoutAjustes?.addEventListener('click', handleLogout);

  // --- View Navigation ---
  async function switchView(viewName) {
    Object.keys(views).forEach(key => {
      if (key === viewName) {
        views[key].classList.add('active');
      } else {
        views[key].classList.remove('active');
      }
    });

    navButtons.forEach(btn => {
      if (btn.getAttribute('data-view') === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    await renderCurrentView(viewName);
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewName = btn.getAttribute('data-view');
      switchView(viewName);
    });
  });

  const btnViewAllHome = document.getElementById('btnViewAllHome');
  if (btnViewAllHome) {
    btnViewAllHome.addEventListener('click', () => switchView('lancamentos'));
  }

  // --- Modal Handling ---
  async function openModal(tx = null) {
    const titleEl = document.getElementById('txModalTitle');
    const idEl = document.getElementById('formTxId');
    const amountEl = document.getElementById('formAmount');
    const descEl = document.getElementById('formDesc');
    const dateEl = document.getElementById('formDate');

    await populateCategorySelect(tx ? tx.type : formType);

    if (tx) {
      titleEl.textContent = 'Editar Lançamento';
      idEl.value = tx.id;
      amountEl.value = tx.amount;
      descEl.value = tx.description;
      dateEl.value = tx.date;
      setType(tx.type);
      formCategorySelect.value = tx.category;
    } else {
      titleEl.textContent = 'Adicionar Lançamento';
      idEl.value = '';
      amountEl.value = '';
      descEl.value = '';
      dateEl.value = new Date().toISOString().split('T')[0];
      setType(formType);
    }

    modalBackdrop.classList.add('active');
  }

  function closeModal() {
    modalBackdrop.classList.remove('active');
  }

  async function setType(type) {
    formType = type;
    if (type === 'Receita') {
      btnTypeIncome.classList.add('active');
      btnTypeExpense.classList.remove('active');
    } else {
      btnTypeExpense.classList.add('active');
      btnTypeIncome.classList.remove('active');
    }
    await populateCategorySelect(type);
  }

  btnTypeExpense.addEventListener('click', () => setType('Despesa'));
  btnTypeIncome.addEventListener('click', () => setType('Receita'));

  document.getElementById('btnOpenAddModal')?.addEventListener('click', () => openModal());
  document.getElementById('btnOpenAddModalList')?.addEventListener('click', () => openModal());
  document.getElementById('btnCloseModal')?.addEventListener('click', closeModal);
  document.getElementById('btnCancelForm')?.addEventListener('click', closeModal);

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  // --- Category Options ---
  async function populateCategorySelect(type) {
    const categories = (await window.db.getCategories()).filter(c => c.type === type);
    formCategorySelect.innerHTML = '';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      formCategorySelect.appendChild(opt);
    });
  }

  // --- Form Submit ---
  txForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('formTxId').value;
    const amount = parseFloat(document.getElementById('formAmount').value);
    const description = document.getElementById('formDesc').value;
    const category = formCategorySelect.value;
    const date = document.getElementById('formDate').value;

    if (!amount || amount <= 0 || !description.trim()) {
      alert('Por favor, preencha valor e descrição corretamente.');
      return;
    }

    if (id) {
      await window.db.updateTransaction(id, { date, description, category, type: formType, amount });
    } else {
      await window.db.addTransaction({ date, description, category, type: formType, amount });
    }

    closeModal();
    await renderAll();
  });

  // Goal Form in Planning View
  const goalForm = document.getElementById('goalSettingForm');
  if (goalForm) {
    goalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalVal = parseFloat(document.getElementById('inputMonthlyGoal').value) || 0;
      await window.db.updateSettings({ monthlySavingsGoal: goalVal });
      await renderAll();
      alert('Meta mensal de economia atualizada com sucesso!');
    });
  }

  // --- Render Functions ---
  async function renderHome() {
    const summary = await window.db.getMonthlySummary(2026, 1);
    const goalData = await window.db.getGoalProgress();
    
    // Top KPIs
    document.getElementById('kpiIncome').textContent = window.db.formatCurrency(summary.totalIncome);
    document.getElementById('kpiExpense').textContent = window.db.formatCurrency(summary.totalExpense);
    document.getElementById('kpiBalance').textContent = window.db.formatCurrency(summary.netBalance);

    // Dynamic Financial Goal Progress Component
    document.getElementById('goalTargetSublabel').textContent = `Meta de economia: ${window.db.formatCurrency(goalData.goal)}`;
    
    const badgeEl = document.getElementById('goalStatusBadge');
    badgeEl.className = `goal-status-badge ${goalData.colorClass}`;
    document.getElementById('goalStatusLabel').textContent = goalData.label;

    const fillEl = document.getElementById('goalProgressBarFill');
    fillEl.className = `goal-progress-bar-fill ${goalData.colorClass}`;
    fillEl.style.width = `${goalData.clampedProgressPct}%`;

    document.getElementById('goalPctText').textContent = `${goalData.progressPct}% do objetivo`;
    document.getElementById('goalCurrentText').textContent = `Economizado: ${window.db.formatCurrency(goalData.currentSavings)}`;

    const msgEl = document.getElementById('goalMessageBox');
    msgEl.className = `goal-message-box ${goalData.colorClass}`;
    msgEl.textContent = goalData.message;

    // Top Categories
    const topContainer = document.getElementById('topCategoriesContainer');
    topContainer.innerHTML = '';
    if (summary.topCategories.length === 0) {
      topContainer.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px;">Nenhuma despesa registrada no mês.</div>';
    } else {
      summary.topCategories.slice(0, 5).forEach(cat => {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.innerHTML = `
          <div class="category-header">
            <span class="category-name">${cat.name}</span>
            <span class="category-amount">${window.db.formatCurrency(cat.amount)}</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${Math.min(100, Math.max(5, cat.percentageOfExpense))}%;"></div>
          </div>
        `;
        topContainer.appendChild(item);
      });
    }

    // Recent Transactions
    const recentList = document.getElementById('recentTransactionsList');
    recentList.innerHTML = '';
    if (summary.transactions.length === 0) {
      recentList.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px;">Nenhum lançamento recente.</div>';
    } else {
      summary.transactions.slice(0, 4).forEach(tx => {
        const li = document.createElement('li');
        li.className = 'tx-item';
        const isInc = tx.type === 'Receita';
        li.innerHTML = `
          <div class="tx-left">
            <span class="tx-desc">${tx.description}</span>
            <span class="tx-meta">${tx.category} • ${window.db.formatDate(tx.date)}</span>
          </div>
          <div class="tx-right">
            <span class="tx-amount ${isInc ? 'income' : 'expense'}">${isInc ? '+ ' : '- '}${window.db.formatCurrency(tx.amount)}</span>
          </div>
        `;
        recentList.appendChild(li);
      });
    }
  }

  async function renderLancamentos() {
    const transactions = await window.db.getTransactions();
    const listEl = document.getElementById('allTransactionsList');
    listEl.innerHTML = '';

    const filtered = transactions.filter(t => {
      if (currentFilter === 'all') return true;
      return t.type === currentFilter;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Nenhum lançamento encontrado</div>
          <div class="empty-state-text">Clique em "Adicionar lançamento" para começar.</div>
        </div>
      `;
      return;
    }

    filtered.forEach(tx => {
      const li = document.createElement('li');
      li.className = 'tx-item';
      const isInc = tx.type === 'Receita';
      li.innerHTML = `
        <div class="tx-left">
          <span class="tx-desc">${tx.description}</span>
          <span class="tx-meta">${tx.category} • ${window.db.formatDate(tx.date)}</span>
        </div>
        <div class="tx-right">
          <span class="tx-amount ${isInc ? 'income' : 'expense'}">${isInc ? '+ ' : '- '}${window.db.formatCurrency(tx.amount)}</span>
          <button class="btn-icon btn-edit" title="Editar" data-id="${tx.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-icon btn-delete" title="Excluir" data-id="${tx.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      li.querySelector('.btn-edit').addEventListener('click', () => {
        openModal(tx);
      });

      li.querySelector('.btn-delete').addEventListener('click', async () => {
        if (confirm(`Deseja excluir "${tx.description}"?`)) {
          await window.db.deleteTransaction(tx.id);
          await renderAll();
        }
      });

      listEl.appendChild(li);
    });
  }

  // Filter Chips in Lançamentos
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.getAttribute('data-filter');
      await renderLancamentos();
    });
  });

  async function renderPlanejamento() {
    const summary = await window.db.getMonthlySummary(2026, 1);
    const settings = await window.db.getSettings();

    // Goal input
    const goalInput = document.getElementById('inputMonthlyGoal');
    if (goalInput) {
      goalInput.value = settings.monthlySavingsGoal || 3000;
    }

    // Reserve calculation
    const goal = settings.reserveGoal || 20000;
    const current = settings.currentReserve || 0;
    const pct = goal > 0 ? ((current / goal) * 100).toFixed(1) : 0;

    document.getElementById('reserveGoalVal').textContent = window.db.formatCurrency(goal);
    document.getElementById('reserveCurrentVal').textContent = window.db.formatCurrency(current);
    document.getElementById('reservePercent').textContent = `${pct}%`;
    document.getElementById('reserveProgressFill').style.width = `${Math.min(100, pct)}%`;

    // 4 Pillars calculation
    const totalInc = summary.totalIncome || 1;
    const p = summary.pillarTotals;

    const essPct = ((p.Essencial / totalInc) * 100).toFixed(1);
    const confPct = ((p.Conforto / totalInc) * 100).toFixed(1);
    const resPct = ((summary.netBalance / totalInc) * 100).toFixed(1);
    const divPct = ((p.Dividas / totalInc) * 100).toFixed(1);

    document.getElementById('pillarEssencialVal').textContent = `${window.db.formatCurrency(p.Essencial)} (${essPct}%)`;
    document.getElementById('pillarEssencialBar').style.width = `${Math.min(100, Math.max(0, essPct))}%`;

    document.getElementById('pillarConfortoVal').textContent = `${window.db.formatCurrency(p.Conforto)} (${confPct}%)`;
    document.getElementById('pillarConfortoBar').style.width = `${Math.min(100, Math.max(0, confPct))}%`;

    document.getElementById('pillarReservaVal').textContent = `${window.db.formatCurrency(Math.max(0, summary.netBalance))} (${Math.max(0, resPct)}%)`;
    document.getElementById('pillarReservaBar').style.width = `${Math.min(100, Math.max(0, resPct))}%`;

    document.getElementById('pillarDividasVal').textContent = `${window.db.formatCurrency(p.Dividas)} (${divPct}%)`;
    document.getElementById('pillarDividasBar').style.width = `${Math.min(100, Math.max(0, divPct))}%`;
  }

  async function renderAjustes() {
    const categories = await window.db.getCategories();
    const listEl = document.getElementById('settingsCategoriesList');
    listEl.innerHTML = '';
    categories.forEach(c => {
      const li = document.createElement('li');
      li.className = 'tx-item';
      li.innerHTML = `
        <div class="tx-left">
          <span class="tx-desc">${c.name}</span>
          <span class="tx-meta">Tipo: ${c.type} • Pilar: ${c.pillar}</span>
        </div>
      `;
      listEl.appendChild(li);
    });
  }

  document.getElementById('btnResetDemo')?.addEventListener('click', async () => {
    if (confirm('Restaurar dados fictícios de demonstração (Apenas modo Local)?')) {
      if (window.db.loadDemoData) {
        window.db.loadDemoData();
        await renderAll();
        alert('Dados de demonstração restaurados com sucesso!');
      } else {
        alert('Restauração de demo disponível apenas no modo local.');
      }
    }
  });

  document.getElementById('btnClearAll')?.addEventListener('click', async () => {
    if (confirm('Atenção: Deseja apagar todos os lançamentos?')) {
      await window.db.resetAllData();
      await renderAll();
      alert('Todos os lançamentos foram limpos.');
    }
  });

  async function renderCurrentView(viewName) {
    if (viewName === 'inicio') await renderHome();
    if (viewName === 'lancamentos') await renderLancamentos();
    if (viewName === 'planejamento') await renderPlanejamento();
    if (viewName === 'ajustes') await renderAjustes();
  }

  async function renderAll() {
    updateAuthUI();
    await renderHome();
    await renderLancamentos();
    await renderPlanejamento();
    await renderAjustes();
  }

  // Initial render
  await renderAll();
});
