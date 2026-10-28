/**
 * Orion Build Cost - Admin Dashboard & Analytics Frontend (Phase 7 & 8)
 * Confidential Internal QS Management, Enquiry Lifecycle & Pricing Governance.
 */

(function () {
  'use strict';

  // State
  let currentAdmin = null;
  let allEnquiries = [];
  let allPricingRecords = [];
  let selectedEnquiryId = null;

  // DOM Elements
  const adminAuthGate = document.getElementById('adminAuthGate');
  const adminWorkspace = document.getElementById('adminWorkspace');
  const formAdminLogin = document.getElementById('formAdminLogin');
  const adminLoginAlert = document.getElementById('adminLoginAlert');
  const btnAdminSignOut = document.getElementById('btnAdminSignOut');

  const enquiryModal = document.getElementById('enquiryModal');
  const btnCloseEnquiryModal = document.getElementById('btnCloseEnquiryModal');
  const btnSaveEnquiryChanges = document.getElementById('btnSaveEnquiryChanges');

  // Format GBP
  function formatGBP(amount) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
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

  // Check Session
  async function checkAdminSession() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.success && data.user && data.user.role === 'admin') {
        currentAdmin = data.user;
        renderAdminWorkspace();
      } else {
        currentAdmin = null;
        renderAdminAuthGate();
      }
    } catch (e) {
      currentAdmin = null;
      renderAdminAuthGate();
    }
  }

  function renderAdminAuthGate() {
    if (adminAuthGate) adminAuthGate.style.display = 'block';
    if (adminWorkspace) adminWorkspace.style.display = 'none';
  }

  function renderAdminWorkspace() {
    if (adminAuthGate) adminAuthGate.style.display = 'none';
    if (adminWorkspace) adminWorkspace.style.display = 'block';

    // Load initial overview
    loadOverview();
  }

  // Switch Admin Tabs
  function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.admin-tab-content').forEach(c => {
      c.style.display = c.id === `tab-${tabId}` ? 'block' : 'none';
    });

    if (tabId === 'overview') loadOverview();
    else if (tabId === 'enquiries') loadEnquiries();
    else if (tabId === 'quotes') loadQuotes();
    else if (tabId === 'clients') loadClients();
    else if (tabId === 'pricing') loadPricing();
    else if (tabId === 'analytics') loadAnalytics();
    else if (tabId === 'system') loadSystemStatus();
  }

  // Load Overview Data
  async function loadOverview() {
    try {
      const res = await fetch('/api/admin/overview');
      const data = await res.json();
      if (!data.success) return;

      const { stats, recentEnquiries, recentActivity } = data;

      document.getElementById('kpiEnquiries').textContent = stats.enquiriesCount;
      document.getElementById('kpiProjects').textContent = stats.projectsCount;
      document.getElementById('kpiQuotes').textContent = stats.quotesCount;
      document.getElementById('kpiUsers').textContent = stats.usersCount;
      document.getElementById('countEnquiriesTab').textContent = stats.enquiriesCount;

      // Recent Enquiries table
      const enqBody = document.getElementById('overviewEnquiriesBody');
      if (enqBody) {
        if (!recentEnquiries || recentEnquiries.length === 0) {
          enqBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--slate-light);">No enquiries recorded yet.</td></tr>';
        } else {
          enqBody.innerHTML = recentEnquiries.map(e => `
            <tr>
              <td><strong>${escapeHTML(e.reference)}</strong></td>
              <td>${escapeHTML(e.full_name)}</td>
              <td>${escapeHTML(e.company || 'Private')}</td>
              <td>${escapeHTML(e.project_type)}</td>
              <td>${escapeHTML(e.postcode)}</td>
              <td><span class="status-badge status-${e.status}">${escapeHTML(e.status.replace('_', ' '))}</span></td>
              <td>${new Date(e.created_at).toLocaleDateString('en-GB')}</td>
              <td>
                <button class="btn btn-secondary btn-sm" style="padding:4px 8px; font-size:0.75rem;" onclick="window.viewEnquiry(${e.id})">Manage</button>
              </td>
            </tr>
          `).join('');
        }
      }

      // Recent Activity table
      const actBody = document.getElementById('overviewActivityBody');
      if (actBody) {
        if (!recentActivity || recentActivity.length === 0) {
          actBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--slate-light);">No recent activity logged.</td></tr>';
        } else {
          actBody.innerHTML = recentActivity.map(a => `
            <tr>
              <td><span class="status-badge status-draft">${escapeHTML(a.action)}</span></td>
              <td>${escapeHTML(a.details || '')}</td>
              <td style="font-family:monospace; font-size:0.75rem;">${escapeHTML(a.ip_address || '127.0.0.1')}</td>
              <td style="color:var(--slate-light); font-size:0.8rem;">${new Date(a.created_at).toLocaleString('en-GB')}</td>
            </tr>
          `).join('');
        }
      }

    } catch (e) {
      console.error('Error loading admin overview:', e);
    }
  }

  // Load Enquiries Inbox
  async function loadEnquiries() {
    const tbody = document.getElementById('enquiriesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--slate-light);">Loading enquiry records...</td></tr>';

    try {
      const res = await fetch('/api/admin/enquiries');
      const data = await res.json();
      if (!data.success || !data.enquiries) return;

      allEnquiries = data.enquiries;
      document.getElementById('countEnquiriesTab').textContent = allEnquiries.length;
      renderFilteredEnquiries();
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="9" style="color:#f87171; text-align:center;">Failed to load enquiries.</td></tr>';
    }
  }

  function renderFilteredEnquiries() {
    const tbody = document.getElementById('enquiriesTableBody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('searchEnquiries')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('filterEnquiryStatus')?.value || 'all';

    const filtered = allEnquiries.filter(e => {
      const matchesSearch = !searchTerm ||
        (e.full_name && e.full_name.toLowerCase().includes(searchTerm)) ||
        (e.company && e.company.toLowerCase().includes(searchTerm)) ||
        (e.reference && e.reference.toLowerCase().includes(searchTerm)) ||
        (e.postcode && e.postcode.toLowerCase().includes(searchTerm));

      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--slate-light); padding:24px;">No matching enquiries found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(e => `
      <tr>
        <td><strong>${escapeHTML(e.reference)}</strong></td>
        <td>${escapeHTML(e.full_name)}</td>
        <td>${escapeHTML(e.company || 'Private')}</td>
        <td>
          <div style="font-size:0.8rem;">✉️ ${escapeHTML(e.email)}</div>
          ${e.phone ? `<div style="font-size:0.75rem; color:var(--slate-light);">📞 ${escapeHTML(e.phone)}</div>` : ''}
        </td>
        <td>${escapeHTML(e.project_type)}</td>
        <td>${escapeHTML(e.country || 'UK')} / <strong>${escapeHTML(e.postcode || '')}</strong></td>
        <td><span class="status-badge status-${e.status}">${escapeHTML(e.status.replace('_', ' '))}</span></td>
        <td>${new Date(e.created_at).toLocaleDateString('en-GB')}</td>
        <td>
          <button class="btn btn-secondary btn-sm" style="padding:4px 8px; font-size:0.75rem;" onclick="window.viewEnquiry(${e.id})">Review &amp; Notes</button>
        </td>
      </tr>
    `).join('');
  }

  // View Enquiry Detail Modal
  window.viewEnquiry = function (id) {
    const enquiry = allEnquiries.find(e => e.id === id);
    if (!enquiry) return;

    selectedEnquiryId = id;
    document.getElementById('modalEnquiryRefBadge').textContent = enquiry.reference;
    document.getElementById('modalEnquiryTitle').textContent = `Enquiry: ${enquiry.full_name} (${enquiry.company || 'Private'})`;
    document.getElementById('modalEnquiryName').textContent = enquiry.full_name;
    document.getElementById('modalEnquiryCompany').textContent = enquiry.company || 'N/A';
    document.getElementById('modalEnquiryEmail').textContent = enquiry.email;
    document.getElementById('modalEnquiryPhone').textContent = enquiry.phone || 'N/A';
    document.getElementById('modalEnquiryType').textContent = enquiry.project_type;
    document.getElementById('modalEnquiryLoc').textContent = `${enquiry.country || 'UK'} (${enquiry.postcode || ''})`;
    document.getElementById('modalEnquiryDesc').textContent = enquiry.description || 'No description provided.';

    // Services
    let services = [];
    try {
      services = JSON.parse(enquiry.services || '[]');
    } catch (e) {
      services = [];
    }
    const srvBox = document.getElementById('modalEnquiryServices');
    if (srvBox) {
      srvBox.innerHTML = services.length > 0
        ? services.map(s => `<span class="status-badge status-draft">${escapeHTML(s)}</span>`).join('')
        : '<span style="color:var(--slate-light); font-size:0.85rem;">None specified</span>';
    }

    // Status select & Internal Notes
    document.getElementById('modalStatusSelect').value = enquiry.status;
    document.getElementById('modalInternalNotes').value = enquiry.internal_notes || '';

    if (enquiryModal) enquiryModal.style.display = 'flex';
  };

  // Save Enquiry Changes
  async function handleSaveEnquiry() {
    if (!selectedEnquiryId) return;

    const status = document.getElementById('modalStatusSelect').value;
    const internalNotes = document.getElementById('modalInternalNotes').value.trim();

    try {
      const res = await fetch(`/api/admin/enquiries/${selectedEnquiryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, internalNotes })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to update enquiry.');
        return;
      }

      if (enquiryModal) enquiryModal.style.display = 'none';
      loadEnquiries();
      loadOverview();
    } catch (e) {
      alert('Network error updating enquiry.');
    }
  }

  // Load Quotes Management
  async function loadQuotes() {
    const tbody = document.getElementById('adminQuotesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--slate-light);">Loading quotes...</td></tr>';

    try {
      const res = await fetch('/api/admin/quotes');
      const data = await res.json();
      if (!data.success || !data.quotes) return;

      tbody.innerHTML = data.quotes.map(q => `
        <tr>
          <td><strong>${escapeHTML(q.quote_ref)}</strong></td>
          <td><span class="status-badge status-${q.status}">${escapeHTML(q.status.replace('_', ' '))}</span></td>
          <td style="max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(q.scope || '')}</td>
          <td>${q.deadline ? escapeHTML(q.deadline) : '<span style="color:var(--slate-light);">Flexible</span>'}</td>
          <td>${escapeHTML(q.approx_size || 'TBC')}</td>
          <td><span class="status-badge status-draft">Rev ${q.revision_number || 0}</span></td>
          <td style="color:#fb923c; font-size:0.8rem; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(q.internal_notes || '—')}</td>
          <td>${new Date(q.created_at).toLocaleDateString('en-GB')}</td>
          <td>
            <button class="btn btn-secondary btn-sm" style="padding:4px 8px; font-size:0.75rem;" onclick="window.bumpQuoteRev(${q.id}, ${q.revision_number || 0})">+ Increment Rev</button>
          </td>
        </tr>
      `).join('');

    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="9" style="color:#f87171; text-align:center;">Failed to load quotes.</td></tr>';
    }
  }

  window.bumpQuoteRev = async function (id, currentRev) {
    const nextRev = currentRev + 1;
    if (!confirm(`Increment quote revision to Rev ${nextRev}?`)) return;

    try {
      await fetch(`/api/admin/quotes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisionNumber: nextRev, internalNotes: `Incremented to Rev ${nextRev} by Director.` })
      });
      loadQuotes();
    } catch (e) {
      alert('Failed to update quote revision.');
    }
  };

  // Load Client Accounts
  async function loadClients() {
    const tbody = document.getElementById('adminClientsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--slate-light);">Loading accounts...</td></tr>';

    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!data.success || !data.users) return;

      tbody.innerHTML = data.users.map(u => `
        <tr>
          <td>#${u.id}</td>
          <td><strong>${escapeHTML(u.full_name)}</strong></td>
          <td>${escapeHTML(u.company_name || 'Individual Client')}</td>
          <td>✉️ ${escapeHTML(u.email)}</td>
          <td>${escapeHTML(u.phone || '—')}</td>
          <td><span class="status-badge ${u.role === 'admin' ? 'status-new' : 'status-completed'}">${escapeHTML(u.role)}</span></td>
          <td>${new Date(u.created_at).toLocaleDateString('en-GB')}</td>
        </tr>
      `).join('');

    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:#f87171; text-align:center;">Failed to load clients.</td></tr>';
    }
  }

  // Load Pricing Data Layer (Phase 8)
  async function loadPricing() {
    const tbody = document.getElementById('adminPricingTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--slate-light);">Loading NRM2 pricing rate library...</td></tr>';

    try {
      const res = await fetch('/api/pricing');
      const data = await res.json();
      if (!data.success || !data.records) return;

      allPricingRecords = data.records;

      // Populate trades filter if empty
      const tradeSel = document.getElementById('filterPricingTrade');
      if (tradeSel && tradeSel.options.length <= 1) {
        const trades = [...new Set(allPricingRecords.map(r => r.trade_category))];
        trades.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          tradeSel.appendChild(opt);
        });
      }

      renderFilteredPricing();
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="9" style="color:#f87171; text-align:center;">Failed to load pricing library.</td></tr>';
    }
  }

  function renderFilteredPricing() {
    const tbody = document.getElementById('adminPricingTableBody');
    if (!tbody) return;

    const tradeFilter = document.getElementById('filterPricingTrade')?.value || '';
    const statusFilter = document.getElementById('filterPricingStatus')?.value || '';

    const filtered = allPricingRecords.filter(r => {
      const matchTrade = !tradeFilter || r.trade_category === tradeFilter;
      const matchStatus = !statusFilter || r.verification_status === statusFilter;
      return matchTrade && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--slate-light); padding:20px;">No matching pricing records.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td><strong>${escapeHTML(r.item_code)}</strong></td>
        <td>${escapeHTML(r.trade_category)}</td>
        <td style="max-width:280px;">${escapeHTML(r.description)}</td>
        <td>${escapeHTML(r.unit)}</td>
        <td style="font-weight:700; color:var(--gold-light);">${formatGBP(r.unit_rate)}</td>
        <td style="font-size:0.75rem; color:var(--slate-light);">
          L: ${formatGBP(r.labour_element)} | M: ${formatGBP(r.materials_element)} | P: ${formatGBP(r.plant_element)}
        </td>
        <td style="font-size:0.75rem;">${escapeHTML(r.source_reference || 'Manual Entry')}</td>
        <td>
          <span class="status-badge ${r.verification_status === 'verified' ? 'status-completed' : 'status-under_review'}">
            ${escapeHTML(r.verification_status)}
          </span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:0.7rem;" onclick="window.toggleRateVerification(${r.id}, '${r.verification_status}')">
            ${r.verification_status === 'verified' ? 'Set Illustrative' : 'Verify Rate'}
          </button>
        </td>
      </tr>
    `).join('');
  }

  window.toggleRateVerification = async function (id, currentStatus) {
    const newStatus = currentStatus === 'verified' ? 'illustrative' : 'verified';
    try {
      const res = await fetch(`/api/pricing/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationStatus: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        loadPricing();
      }
    } catch (e) {
      alert('Failed to update rate verification status.');
    }
  };

  // Load Analytics
  async function loadAnalytics() {
    try {
      const res = await fetch('/api/admin/analytics');
      const data = await res.json();
      if (!data.success || !data.analytics) return;

      const a = data.analytics;
      document.getElementById('analyticsVisitors').textContent = a.dailyVisitors;
      document.getElementById('analyticsPageViews').textContent = a.pageViews;
      document.getElementById('analyticsQuoteStarts').textContent = a.quoteStarts;
      document.getElementById('analyticsConversion').textContent = `${a.conversionRatePct}%`;

      const tbody = document.getElementById('analyticsServicesBody');
      if (tbody && a.servicePageViews) {
        const totalViews = Object.values(a.servicePageViews).reduce((sum, v) => sum + v, 0);
        tbody.innerHTML = Object.entries(a.servicePageViews).map(([service, views]) => {
          const share = totalViews > 0 ? ((views / totalViews) * 100).toFixed(1) : 0;
          return `
            <tr>
              <td><strong style="text-transform:capitalize;">${escapeHTML(service.replace(/-/g, ' '))}</strong></td>
              <td>${views.toLocaleString()} views</td>
              <td>
                <div style="display:flex; align-items:center; gap:10px;">
                  <div style="flex:1; background:rgba(255,255,255,0.06); height:6px; border-radius:3px; overflow:hidden;">
                    <div style="background:var(--gold-accent); height:100%; width:${share}%;"></div>
                  </div>
                  <span style="font-size:0.8rem; color:var(--slate-light);">${share}%</span>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (e) {
      console.error('Error loading analytics:', e);
    }
  }

  // Load System Status & Logs
  async function loadSystemStatus() {
    try {
      const resSys = await fetch('/api/admin/system-status');
      const dataSys = await resSys.json();
      if (dataSys.success && dataSys.system) {
        const s = dataSys.system;
        document.getElementById('sysDbEngine').textContent = s.database;
        document.getElementById('sysDbPath').textContent = s.dbPath;
        document.getElementById('sysSessions').textContent = s.activeSessions;
        document.getElementById('sysRates').textContent = s.totalPricingRecords;
      }

      const resLogs = await fetch('/api/admin/activity-logs');
      const dataLogs = await resLogs.json();
      const tbody = document.getElementById('fullAuditLogsBody');
      if (tbody && dataLogs.success && dataLogs.logs) {
        tbody.innerHTML = dataLogs.logs.map(l => `
          <tr>
            <td>#${l.id}</td>
            <td><span class="status-badge status-draft">${escapeHTML(l.action)}</span></td>
            <td>${escapeHTML(l.details || '—')}</td>
            <td>${l.user_id ? `#${l.user_id}` : 'System'}</td>
            <td style="font-family:monospace; font-size:0.75rem;">${escapeHTML(l.ip_address || '127.0.0.1')}</td>
            <td style="font-size:0.8rem; color:var(--slate-light);">${new Date(l.created_at).toLocaleString('en-GB')}</td>
          </tr>
        `).join('');
      }
    } catch (e) {
      console.error('Error loading system status:', e);
    }
  }

  // Event Handlers
  function setupAdminEvents() {
    // Admin Login Form
    formAdminLogin?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('adminEmailInput').value.trim();
      const password = document.getElementById('adminPassInput').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          adminLoginAlert.style.display = 'block';
          adminLoginAlert.style.background = 'rgba(239,68,68,0.15)';
          adminLoginAlert.style.color = '#f87171';
          adminLoginAlert.textContent = data.error || 'Login failed.';
          return;
        }

        if (data.user.role !== 'admin') {
          adminLoginAlert.style.display = 'block';
          adminLoginAlert.style.background = 'rgba(239,68,68,0.15)';
          adminLoginAlert.style.color = '#f87171';
          adminLoginAlert.textContent = 'Forbidden: This account does not possess administrator credentials.';
          return;
        }

        currentAdmin = data.user;
        renderAdminWorkspace();
      } catch (err) {
        adminLoginAlert.style.display = 'block';
        adminLoginAlert.style.color = '#f87171';
        adminLoginAlert.textContent = 'Network error during admin authentication.';
      }
    });

    // Sign Out
    btnAdminSignOut?.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) { }
      currentAdmin = null;
      renderAdminAuthGate();
    });

    // Admin Tab Navigation
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab));
    });

    // Enquiry Filter Inputs
    document.getElementById('searchEnquiries')?.addEventListener('input', renderFilteredEnquiries);
    document.getElementById('filterEnquiryStatus')?.addEventListener('change', renderFilteredEnquiries);

    // Pricing Filter Inputs
    document.getElementById('filterPricingTrade')?.addEventListener('change', renderFilteredPricing);
    document.getElementById('filterPricingStatus')?.addEventListener('change', renderFilteredPricing);

    // Modal Close
    btnCloseEnquiryModal?.addEventListener('click', () => {
      if (enquiryModal) enquiryModal.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
      if (e.target === enquiryModal) enquiryModal.style.display = 'none';
    });

    // Save Enquiry Changes
    btnSaveEnquiryChanges?.addEventListener('click', handleSaveEnquiry);
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    setupAdminEvents();
    checkAdminSession();
  });

})();
