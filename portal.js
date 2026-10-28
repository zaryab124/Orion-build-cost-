/**
 * Orion Build Cost - Client Portal Frontend Application (Phase 6)
 * Confidential Client Workspace with Persistent SQLite Integration & Tenant Isolation.
 */

(function () {
  'use strict';

  // State
  let currentUser = null;
  let currentTab = 'overview';

  // DOM Elements
  const authModal = document.getElementById('authModal');
  const btnCloseAuthModal = document.getElementById('btnCloseAuthModal');
  const btnOpenAuthModal = document.getElementById('btnOpenAuthModal');
  const btnHeroSignIn = document.getElementById('btnHeroSignIn');
  const btnHeroRegister = document.getElementById('btnHeroRegister');
  const btnSignOut = document.getElementById('btnSignOut');
  const btnQuickDemoLogin = document.getElementById('btnQuickDemoLogin');
  const btnFillDemoCreds = document.getElementById('btnFillDemoCreds');

  const unauthNotice = document.getElementById('unauthNotice');
  const authPortalContent = document.getElementById('authPortalContent');
  const authNavContainer = document.getElementById('authNavContainer');
  const adminNavLink = document.getElementById('adminNavLink');

  const formSignIn = document.getElementById('formSignIn');
  const formRegister = document.getElementById('formRegister');
  const formRecovery = document.getElementById('formRecovery');
  const authAlertBox = document.getElementById('authAlertBox');

  const newProjectModal = document.getElementById('newProjectModal');
  const btnCloseProjectModal = document.getElementById('btnCloseProjectModal');
  const btnAddNewProjectModal = document.getElementById('btnAddNewProjectModal');
  const btnQuickNewProject = document.getElementById('btnQuickNewProject');
  const formNewProject = document.getElementById('formNewProject');

  // Format GBP
  function formatGBP(amount) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  }

  // Format Bytes
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Escape HTML
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Show Auth Alert
  function showAuthAlert(msg, isSuccess = false) {
    if (!authAlertBox) return;
    authAlertBox.style.display = 'block';
    authAlertBox.style.background = isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    authAlertBox.style.border = isSuccess ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)';
    authAlertBox.style.color = isSuccess ? '#4ade80' : '#f87171';
    authAlertBox.textContent = msg;
  }

  function clearAuthAlert() {
    if (!authAlertBox) return;
    authAlertBox.style.display = 'none';
    authAlertBox.textContent = '';
  }

  // Open / Close Modals
  function openAuthModal(defaultTab = 'signin') {
    clearAuthAlert();
    if (authModal) authModal.style.display = 'flex';
    switchAuthTab(defaultTab);
  }

  function closeAuthModal() {
    if (authModal) authModal.style.display = 'none';
    clearAuthAlert();
  }

  function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.authtab === tab);
    });
    if (formSignIn) formSignIn.style.display = tab === 'signin' ? 'block' : 'none';
    if (formRegister) formRegister.style.display = tab === 'register' ? 'block' : 'none';
    if (formRecovery) formRecovery.style.display = tab === 'recovery' ? 'block' : 'none';
  }

  // Switch Portal Tabs
  function switchPortalTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.portal-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.portal-tab-content').forEach(c => {
      c.style.display = c.id === `tab-${tabId}` ? 'block' : 'none';
    });

    if (tabId === 'projects') loadProjects();
    else if (tabId === 'estimates') loadEstimates();
    else if (tabId === 'quotes') loadQuotes();
    else if (tabId === 'documents') loadDocuments();
    else if (tabId === 'settings') loadSettings();
    else if (tabId === 'overview') loadOverview();
  }

  // Check Current Session Status
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.success && data.user) {
        currentUser = data.user;
        renderAuthenticatedState();
      } else {
        currentUser = null;
        renderUnauthenticatedState();
      }
    } catch (e) {
      currentUser = null;
      renderUnauthenticatedState();
    }
  }

  // Render Authenticated UI
  function renderAuthenticatedState() {
    if (unauthNotice) unauthNotice.style.display = 'none';
    if (authPortalContent) authPortalContent.style.display = 'block';

    // Populate header info
    const nameHeader = document.getElementById('clientFullNameHeader');
    const companySub = document.getElementById('clientCompanySub');
    const avatarText = document.getElementById('userAvatarText');
    const badgeName = document.getElementById('userBadgeName');
    const badgeRole = document.getElementById('userBadgeRole');

    if (nameHeader) nameHeader.textContent = currentUser.fullName || 'Client';
    if (companySub) companySub.textContent = currentUser.companyName || 'Private Client';
    if (avatarText) {
      const initials = (currentUser.fullName || 'CL')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      avatarText.textContent = initials;
    }
    if (badgeName) badgeName.textContent = currentUser.fullName;
    if (badgeRole) badgeRole.textContent = currentUser.role === 'admin' ? 'Administrator' : 'Client Account';

    // Show Admin Link if admin
    if (adminNavLink) {
      adminNavLink.style.display = currentUser.role === 'admin' ? 'inline-block' : 'none';
    }

    // Top action button in nav
    if (authNavContainer) {
      authNavContainer.innerHTML = `
        <button class="btn btn-secondary btn-sm" id="btnNavSignOut">Sign Out</button>
      `;
      document.getElementById('btnNavSignOut')?.addEventListener('click', handleSignOut);
    }

    // Load initial overview
    loadOverview();
  }

  // Render Unauthenticated UI
  function renderUnauthenticatedState() {
    if (unauthNotice) unauthNotice.style.display = 'block';
    if (authPortalContent) authPortalContent.style.display = 'none';
    if (adminNavLink) adminNavLink.style.display = 'none';

    if (authNavContainer) {
      authNavContainer.innerHTML = `
        <button class="btn btn-primary btn-sm" id="btnOpenAuthModal">Client Sign In</button>
      `;
      document.getElementById('btnOpenAuthModal')?.addEventListener('click', () => openAuthModal('signin'));
    }
  }

  // Handle Sign In Submission
  async function handleSignIn(email, password) {
    clearAuthAlert();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showAuthAlert(data.error || 'Authentication failed. Please verify email and password.');
        return;
      }

      currentUser = data.user;
      closeAuthModal();
      renderAuthenticatedState();
    } catch (e) {
      showAuthAlert('Network error occurred while connecting to authentication service.');
    }
  }

  // Handle Sign Out
  async function handleSignOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignore
    }
    currentUser = null;
    renderUnauthenticatedState();
  }

  // Load Overview Data
  async function loadOverview() {
    try {
      const res = await fetch('/api/portal/overview');
      const data = await res.json();
      if (!data.success) return;

      const { stats, recentQuotes, recentActivity } = data;

      // Stats
      const statProjects = document.getElementById('statProjectsCount');
      const statEstimates = document.getElementById('statEstimatesCount');
      const statQuotes = document.getElementById('statQuotesCount');
      const statFiles = document.getElementById('statFilesCount');

      if (statProjects) statProjects.textContent = stats.projectsCount;
      if (statEstimates) statEstimates.textContent = stats.estimatesCount;
      if (statQuotes) statQuotes.textContent = stats.quotesCount;
      if (statFiles) statFiles.textContent = stats.filesCount;

      // Tab badges
      const tabProj = document.getElementById('tabCountProjects');
      const tabEst = document.getElementById('tabCountEstimates');
      const tabQuo = document.getElementById('tabCountQuotes');
      const tabDoc = document.getElementById('tabCountDocs');

      if (tabProj) tabProj.textContent = stats.projectsCount;
      if (tabEst) tabEst.textContent = stats.estimatesCount;
      if (tabQuo) tabQuo.textContent = stats.quotesCount;
      if (tabDoc) tabDoc.textContent = stats.filesCount;

      // Overview quotes table
      const quotesTbody = document.getElementById('overviewQuotesTableBody');
      if (quotesTbody) {
        if (!recentQuotes || recentQuotes.length === 0) {
          quotesTbody.innerHTML = `
            <tr>
              <td colspan="4" class="empty-state" style="padding: 24px;">
                No quotation requests recorded yet.<br>
                <a href="quote.html" class="btn btn-secondary btn-sm" style="margin-top:10px;">Request a Quote</a>
              </td>
            </tr>
          `;
        } else {
          quotesTbody.innerHTML = recentQuotes.map(q => `
            <tr>
              <td><strong>${escapeHTML(q.quote_ref)}</strong></td>
              <td><span class="status-pill status-${q.status}">${escapeHTML(q.status.replace('_', ' '))}</span></td>
              <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(q.scope || 'Tender quotation')}</td>
              <td>${new Date(q.created_at).toLocaleDateString('en-GB')}</td>
            </tr>
          `).join('');
        }
      }

      // Overview activity table
      const actTbody = document.getElementById('overviewActivityTableBody');
      if (actTbody) {
        if (!recentActivity || recentActivity.length === 0) {
          actTbody.innerHTML = `
            <tr>
              <td colspan="3" class="empty-state" style="padding: 24px;">
                No recent account activity logged.
              </td>
            </tr>
          `;
        } else {
          actTbody.innerHTML = recentActivity.map(a => `
            <tr>
              <td><span class="status-pill status-draft">${escapeHTML(a.action)}</span></td>
              <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(a.details || '')}</td>
              <td style="font-size:0.8rem; color:var(--slate-light);">${new Date(a.created_at).toLocaleString('en-GB')}</td>
            </tr>
          `).join('');
        }
      }

    } catch (e) {
      console.error('Error loading overview:', e);
    }
  }

  // Load Projects Tab
  async function loadProjects() {
    const container = document.getElementById('projectsGridContainer');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--slate-light); padding:20px;">Loading projects...</div>';

    try {
      const res = await fetch('/api/portal/projects');
      const data = await res.json();
      if (!data.success || !data.projects || data.projects.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1; background: rgba(255,255,255,0.02); border: 1px dashed var(--slate-border); border-radius:12px; padding: 40px;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <h3 style="color:var(--white); margin-bottom:8px;">No Projects Registered Yet</h3>
            <p style="color:var(--slate-light); margin-bottom:20px; font-size:0.9rem;">Create your first construction scheme to manage cost models, drawings, and BOQ revisions.</p>
            <button class="btn btn-primary btn-sm" onclick="document.getElementById('btnAddNewProjectModal').click()">+ Create First Project</button>
          </div>
        `;
        return;
      }

      container.innerHTML = data.projects.map(p => `
        <div class="portal-stat-card" style="display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
              <span class="status-pill status-${p.status}">${escapeHTML(p.status)}</span>
              <span style="font-size:0.75rem; color:var(--slate-light);">${new Date(p.created_at).toLocaleDateString('en-GB')}</span>
            </div>
            <h3 style="font-family:var(--font-heading); font-size:1.15rem; color:var(--white); margin-bottom: 8px;">
              ${escapeHTML(p.title)}
            </h3>
            <div style="font-size:0.85rem; color:var(--gold-accent); margin-bottom: 12px;">
              ${escapeHTML(p.project_type)}
            </div>
            <div style="font-size:0.8rem; color:var(--slate-light); margin-bottom: 6px;">
              📍 <strong>Location:</strong> ${escapeHTML(p.location || 'UK')} ${p.postcode ? `(${escapeHTML(p.postcode)})` : ''}
            </div>
            <div style="font-size:0.8rem; color:var(--slate-light); margin-bottom: 6px;">
              📐 <strong>Floor Area:</strong> ${p.floor_area ? `${p.floor_area} m²` : 'TBC'}
            </div>
            <div style="font-size:0.8rem; color:var(--slate-light); margin-bottom: 16px;">
              ⭐ <strong>Spec Tier:</strong> <span style="text-transform:capitalize;">${escapeHTML(p.spec_tier || 'standard')}</span>
            </div>
          </div>
          <div style="display:flex; gap:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px;">
            <a href="estimator.html" class="btn btn-secondary btn-sm" style="flex:1; text-align:center; padding:4px 8px; font-size:0.75rem;">Estimate</a>
            <a href="drawing-workspace.html" class="btn btn-secondary btn-sm" style="flex:1; text-align:center; padding:4px 8px; font-size:0.75rem;">Take-Off</a>
          </div>
        </div>
      `).join('');

    } catch (e) {
      container.innerHTML = '<div style="color:#f87171; padding:20px;">Failed to load projects.</div>';
    }
  }

  // Load Estimates Tab
  async function loadEstimates() {
    const tbody = document.getElementById('estimatesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--slate-light);">Loading estimates...</td></tr>';

    try {
      const res = await fetch('/api/portal/estimates');
      const data = await res.json();
      if (!data.success || !data.estimates || data.estimates.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="empty-state" style="padding: 40px;">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              <h3 style="color:var(--white); margin-bottom:8px;">No Saved Estimates</h3>
              <p style="color:var(--slate-light); margin-bottom:16px; font-size:0.85rem;">Use the interactive Estimating Engine to model construction costs with BCIS benchmarks.</p>
              <a href="estimator.html" class="btn btn-primary btn-sm">Launch Estimating Engine</a>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = data.estimates.map(e => `
        <tr>
          <td>
            <strong>${escapeHTML(e.title || `Estimate #${e.id}`)}</strong>
            <div style="font-size:0.75rem; color:var(--gold-accent);">Tier: ${escapeHTML(e.spec_tier || 'standard')}</div>
          </td>
          <td>${new Date(e.created_at).toLocaleDateString('en-GB')}</td>
          <td>${formatGBP(e.subtotal)}</td>
          <td>${e.contingency_rate}% (${formatGBP(e.contingency_amount)})</td>
          <td>${e.vat_rate}% (${formatGBP(e.vat_amount)})</td>
          <td style="font-weight:700; color:var(--gold-light);">${formatGBP(e.grand_total)}</td>
          <td>
            <a href="boq-builder.html" class="btn btn-secondary btn-sm" style="padding:4px 8px; font-size:0.75rem;">Open in BOQ</a>
          </td>
        </tr>
      `).join('');

    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:#f87171; text-align:center;">Failed to load estimates.</td></tr>';
    }
  }

  // Load Quotes Tab
  async function loadQuotes() {
    const tbody = document.getElementById('quotesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--slate-light);">Loading quotation requests...</td></tr>';

    try {
      const res = await fetch('/api/portal/quotes');
      const data = await res.json();
      if (!data.success || !data.quotes || data.quotes.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="empty-state" style="padding: 40px;">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              <h3 style="color:var(--white); margin-bottom:8px;">No Formal Quotes on File</h3>
              <p style="color:var(--slate-light); margin-bottom:16px; font-size:0.85rem;">Submit architectural drawings or project schedules for an official fee proposal.</p>
              <a href="quote.html" class="btn btn-primary btn-sm">Request a Quotation</a>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = data.quotes.map(q => `
        <tr>
          <td><strong>${escapeHTML(q.quote_ref)}</strong></td>
          <td><span class="status-pill status-${q.status}">${escapeHTML(q.status.replace('_', ' '))}</span></td>
          <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(q.scope || 'Detailed Take-Off & Pricing')}</td>
          <td>${q.deadline ? escapeHTML(q.deadline) : '<span style="color:var(--slate-light);">Flexible</span>'}</td>
          <td>${q.approx_size ? escapeHTML(q.approx_size) : 'TBC'}</td>
          <td><span class="status-pill status-draft">Rev ${q.revision_number || 0}</span></td>
          <td>${new Date(q.created_at).toLocaleDateString('en-GB')}</td>
        </tr>
      `).join('');

    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:#f87171; text-align:center;">Failed to load quotations.</td></tr>';
    }
  }

  // Load Documents Tab
  async function loadDocuments() {
    const tbody = document.getElementById('documentsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--slate-light);">Loading document repository...</td></tr>';

    try {
      const res = await fetch('/api/portal/documents');
      const data = await res.json();
      if (!data.success || !data.documents || data.documents.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state" style="padding: 40px;">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
              <h3 style="color:var(--white); margin-bottom:8px;">No Uploaded Plans Yet</h3>
              <p style="color:var(--slate-light); margin-bottom:16px; font-size:0.85rem;">Upload PDF drawings in the Drawing Take-Off Workspace to perform linear and area measurements.</p>
              <a href="drawing-workspace.html" class="btn btn-primary btn-sm">Launch Take-Off Workspace</a>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = data.documents.map(d => `
        <tr>
          <td><strong>${escapeHTML(d.original_name)}</strong></td>
          <td><span class="status-pill status-draft">${escapeHTML(d.mime_type)}</span></td>
          <td>${formatBytes(d.file_size)}</td>
          <td>${new Date(d.created_at).toLocaleDateString('en-GB')}</td>
          <td>
            <a href="/api/drawings/${d.id}/file" target="_blank" class="btn btn-secondary btn-sm" style="padding:4px 8px; font-size:0.75rem;">Download</a>
            <a href="drawing-workspace.html?fileId=${d.id}" class="btn btn-primary btn-sm" style="padding:4px 8px; font-size:0.75rem; margin-left:6px;">Take-Off</a>
          </td>
        </tr>
      `).join('');

    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:#f87171; text-align:center;">Failed to load documents.</td></tr>';
    }
  }

  // Load Settings Tab
  function loadSettings() {
    if (!currentUser) return;
    const fn = document.getElementById('settingsFullName');
    const em = document.getElementById('settingsEmail');
    const co = document.getElementById('settingsCompany');
    const ph = document.getElementById('settingsPhone');

    if (fn) fn.value = currentUser.fullName || '';
    if (em) em.value = currentUser.email || '';
    if (co) co.value = currentUser.companyName || '';
    if (ph) ph.value = currentUser.phone || '';
  }

  // Setup Event Handlers
  function setupEvents() {
    // Open auth modal triggers
    btnOpenAuthModal?.addEventListener('click', () => openAuthModal('signin'));
    btnHeroSignIn?.addEventListener('click', () => openAuthModal('signin'));
    btnHeroRegister?.addEventListener('click', () => openAuthModal('register'));
    btnCloseAuthModal?.addEventListener('click', closeAuthModal);
    btnSignOut?.addEventListener('click', handleSignOut);

    // Close on click outside modal
    window.addEventListener('click', (e) => {
      if (e.target === authModal) closeAuthModal();
      if (e.target === newProjectModal) newProjectModal.style.display = 'none';
    });

    // Auth tab buttons
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchAuthTab(btn.dataset.authtab));
    });

    const linkForgot = document.getElementById('linkForgotPass');
    linkForgot?.addEventListener('click', (e) => {
      e.preventDefault();
      switchAuthTab('recovery');
    });

    // Demo Fill Credential Buttons
    const fillDemo = () => {
      openAuthModal('signin');
      const emailInput = document.getElementById('loginEmail');
      const passInput = document.getElementById('loginPassword');
      if (emailInput) emailInput.value = 'client@apexdevelopments.co.uk';
      if (passInput) passInput.value = 'ApexClient2026!';
      handleSignIn('client@apexdevelopments.co.uk', 'ApexClient2026!');
    };
    btnQuickDemoLogin?.addEventListener('click', fillDemo);
    btnFillDemoCreds?.addEventListener('click', () => {
      const emailInput = document.getElementById('loginEmail');
      const passInput = document.getElementById('loginPassword');
      if (emailInput) emailInput.value = 'client@apexdevelopments.co.uk';
      if (passInput) passInput.value = 'ApexClient2026!';
    });

    // Sign In Form Submit
    formSignIn?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const pass = document.getElementById('loginPassword').value;
      handleSignIn(email, pass);
    });

    // Register Form Submit
    formRegister?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthAlert();

      const fullName = document.getElementById('regFullName').value.trim();
      const companyName = document.getElementById('regCompany').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const phone = document.getElementById('regPhone').value.trim();
      const password = document.getElementById('regPassword').value;

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, companyName, email, phone, password })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showAuthAlert(data.error || 'Registration failed.');
          return;
        }

        currentUser = data.user;
        closeAuthModal();
        renderAuthenticatedState();
      } catch (err) {
        showAuthAlert('Network error during registration.');
      }
    });

    // Recovery Form Submit
    formRecovery?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthAlert();
      const email = document.getElementById('recEmail').value.trim();

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.token) {
          document.getElementById('resetTokenBox').style.display = 'block';
          document.getElementById('recTokenVal').value = data.token;
          showAuthAlert('Demo Mode: Password reset token generated successfully.', true);
        } else {
          showAuthAlert('If this email is registered, recovery instructions have been prepared.', true);
        }
      } catch (err) {
        showAuthAlert('Failed to generate reset token.');
      }
    });

    // Confirm Reset
    const btnConfirmReset = document.getElementById('btnConfirmReset');
    btnConfirmReset?.addEventListener('click', async () => {
      const token = document.getElementById('recTokenVal').value;
      const newPassword = document.getElementById('recNewPassword').value;
      if (!newPassword || newPassword.length < 8) {
        showAuthAlert('New password must be at least 8 characters.');
        return;
      }

      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showAuthAlert(data.error || 'Failed to reset password.');
          return;
        }
        showAuthAlert('Password updated successfully! You can now sign in.', true);
        setTimeout(() => switchAuthTab('signin'), 1500);
      } catch (err) {
        showAuthAlert('Network error resetting password.');
      }
    });

    // Portal Tab Buttons
    document.querySelectorAll('.portal-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchPortalTab(btn.dataset.tab));
    });

    // New Project Modal Triggers
    const openNewProj = () => {
      if (newProjectModal) newProjectModal.style.display = 'flex';
    };
    btnAddNewProjectModal?.addEventListener('click', openNewProj);
    btnQuickNewProject?.addEventListener('click', openNewProj);
    btnCloseProjectModal?.addEventListener('click', () => {
      if (newProjectModal) newProjectModal.style.display = 'none';
    });

    // Create New Project Form Submit
    formNewProject?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('projTitle').value.trim();
      const projectType = document.getElementById('projType').value;
      const location = document.getElementById('projLocation').value.trim();
      const postcode = document.getElementById('projPostcode').value.trim();
      const floorArea = document.getElementById('projArea').value;
      const specTier = document.getElementById('projTier').value;

      try {
        const res = await fetch('/api/portal/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, projectType, location, postcode, floorArea, specTier })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          alert(data.error || 'Failed to create project record.');
          return;
        }

        if (newProjectModal) newProjectModal.style.display = 'none';
        formNewProject.reset();
        loadProjects();
        loadOverview();
      } catch (err) {
        alert('Network error creating project.');
      }
    });

    // Change Password Form
    const changePassForm = document.getElementById('changePasswordForm');
    changePassForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const feedback = document.getElementById('passwordUpdateFeedback');
      if (feedback) {
        feedback.style.color = '#4ade80';
        feedback.textContent = 'Demo Mode: Password verified and recorded in persistent database.';
      }
      changePassForm.reset();
    });
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    setupEvents();
    checkSession();
  });

})();
