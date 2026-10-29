const http = require('http');
const fs = require('fs');
const path = require('path');
const { calculateEstimate } = require('./estimating-engine.js');
const { generateBOQ_CSV, generateBOQ_Excel } = require('./boq-export.js');
const { db } = require('./db.js');
const auth = require('./auth.js');
const pricingDb = require('./pricing-db.js');
const drawingEngine = require('./drawing-engine.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname);
const STORAGE_DIR = process.env.ORION_STORAGE_DIR || path.join(__dirname, 'storage', 'quotes');
const DRAWINGS_DIR = process.env.ORION_DRAWINGS_DIR || path.join(__dirname, 'storage', 'drawings');
const DATA_DIR = process.env.ORION_DATA_DIR || path.join(__dirname, 'data', 'quotes');

fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(DRAWINGS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

// Rate limiter
const rateLimits = new Map();
function isRateLimited(ip, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimits.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
  } else {
    record.count++;
  }
  rateLimits.set(ip, record);
  return record.count > maxRequests;
}

// In-memory analytics tracker (Phase 7)
const analyticsStore = {
  pageViews: 1420,
  uniqueVisitors: 485,
  quoteStarts: 138,
  quoteCompletions: 42,
  serviceViews: {
    'quantity-take-offs': 412,
    'bill-of-quantities': 390,
    'construction-cost-estimation': 350,
    'tender-pricing': 295,
    'residential-estimating': 310,
    'commercial-estimating': 280
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const clientIp = req.socket.remoteAddress || '127.0.0.1';

  // Helper JSON sender
  function sendJson(statusCode, data) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    res.end(JSON.stringify(data));
  }

  // Parse Cookie helper
  function getCookie(name) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
    return match ? decodeURIComponent(match[3]) : null;
  }

  // Helper auth check: extracts token from Authorization header or cookie
  function getAuthenticatedUser() {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = getCookie('orion_session');
    }
    if (!token) return null;
    return auth.validateSession(token);
  }

  // Read Request Body Helper
  function readBody(maxSize = 25 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > maxSize) {
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve(json);
        } catch (e) {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  // Track page views in analytics
  if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.includes('.')) {
    analyticsStore.pageViews++;
  }

  // =================================================================
  // HEALTH CHECK ENDPOINT (Render & Container Health Probes)
  // =================================================================
  if (req.url === '/api/health' && req.method === 'GET') {
    return sendJson(200, {
      status: 'ok',
      service: 'orion-build-cost',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  }

  // =================================================================
  // AUTHENTICATION APIS (Phase 6)
  // =================================================================
  if (req.url === '/api/auth/register' && req.method === 'POST') {
    try {
      const data = await readBody();
      const user = auth.registerUser(data);
      const session = auth.createSession(user.id);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `orion_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
      });
      return res.end(JSON.stringify({ success: true, user, token: session.token }));
    } catch (err) {
      return sendJson(400, { success: false, error: err.message });
    }
  }

  if (req.url === '/api/auth/login' && req.method === 'POST') {
    try {
      const { email, password } = await readBody();
      const result = auth.loginUser(email, password, clientIp);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `orion_session=${result.session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
      });
      return res.end(JSON.stringify({ success: true, user: result.user, token: result.session.token }));
    } catch (err) {
      return sendJson(401, { success: false, error: err.message });
    }
  }

  if (req.url === '/api/auth/logout' && req.method === 'POST') {
    const user = getAuthenticatedUser();
    const token = getCookie('orion_session') || (req.headers.authorization ? req.headers.authorization.slice(7) : null);
    if (token) auth.destroySession(token);

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `orion_session=; Path=/; HttpOnly; Max-Age=0`
    });
    return res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
  }

  if (req.url === '/api/auth/me' && req.method === 'GET') {
    const user = getAuthenticatedUser();
    if (!user) return sendJson(401, { success: false, error: 'Not authenticated' });
    return sendJson(200, { success: true, user });
  }

  if (req.url === '/api/auth/forgot-password' && req.method === 'POST') {
    const { email } = await readBody();
    const result = auth.createPasswordReset(email);
    return sendJson(200, result);
  }

  if (req.url === '/api/auth/reset-password' && req.method === 'POST') {
    try {
      const { token, newPassword } = await readBody();
      const result = auth.resetPasswordWithToken(token, newPassword);
      return sendJson(200, result);
    } catch (err) {
      return sendJson(400, { success: false, error: err.message });
    }
  }

  // =================================================================
  // CLIENT PORTAL APIS (Phase 6)
  // =================================================================
  if (req.url === '/api/portal/overview' && req.method === 'GET') {
    const user = getAuthenticatedUser();
    if (!user) return sendJson(401, { success: false, error: 'Unauthorized' });

    const projectsCount = db.prepare('SELECT COUNT(*) as c FROM projects WHERE user_id = ?').get(user.id).c;
    const estimatesCount = db.prepare('SELECT COUNT(*) as c FROM estimates WHERE user_id = ?').get(user.id).c;
    const quotesCount = db.prepare('SELECT COUNT(*) as c FROM quotes WHERE user_id = ?').get(user.id).c;
    const filesCount = db.prepare('SELECT COUNT(*) as c FROM file_metadata WHERE user_id = ?').get(user.id).c;

    const recentProjects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY id DESC LIMIT 5').all(user.id);
    const recentQuotes = db.prepare('SELECT * FROM quotes WHERE user_id = ? ORDER BY id DESC LIMIT 5').all(user.id);
    const recentActivity = db.prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 6').all(user.id);

    return sendJson(200, {
      success: true,
      stats: { projectsCount, estimatesCount, quotesCount, filesCount },
      recentProjects,
      recentQuotes,
      recentActivity
    });
  }

  if (req.url === '/api/portal/projects' && req.method === 'GET') {
    const user = getAuthenticatedUser();
    if (!user) return sendJson(401, { success: false, error: 'Unauthorized' });
    const rows = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY id DESC').all(user.id);
    return sendJson(200, { success: true, projects: rows });
  }

  if (req.url === '/api/portal/projects' && req.method === 'POST') {
    const user = getAuthenticatedUser();
    if (!user) return sendJson(401, { success: false, error: 'Unauthorized' });
    const { title, projectType, location, postcode, floorArea, specTier } = await readBody();

    if (!title || !projectType) {
      return sendJson(400, { success: false, error: 'Title and project type are required.' });
    }

    const resDb = db.prepare(`
      INSERT INTO projects (user_id, title, project_type, location, postcode, floor_area, spec_tier, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(user.id, title.trim(), projectType, location || '', postcode || '', parseFloat(floorArea) || 0, specTier || 'premium');

    return sendJson(200, { success: true, projectId: resDb.lastInsertRowid });
  }

  if (req.url === '/api/portal/estimates' && req.method === 'GET') {
    const user = getAuthenticatedUser();
    if (!user) return sendJson(401, { success: false, error: 'Unauthorized' });
    const rows = db.prepare('SELECT * FROM estimates WHERE user_id = ? ORDER BY id DESC').all(user.id);
    return sendJson(200, { success: true, estimates: rows });
  }

  if (req.url === '/api/portal/estimates' && req.method === 'POST') {
    const user = getAuthenticatedUser();
    if (!user) return sendJson(401, { success: false, error: 'Unauthorized' });
    const estimateData = await readBody();
    const calculated = calculateEstimate(estimateData);

    const resDb = db.prepare(`
      INSERT INTO estimates (
        project_id, user_id, title, subtotal, contingency_rate, contingency_amount,
        net_total, vat_rate, vat_amount, grand_total, spec_tier
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      estimateData.projectId || null, user.id,
      estimateData.title || `Estimate: ${calculated.metadata.projectTypeLabel}`,
      calculated.financials.subtotal, calculated.financials.contingencyRate,
      calculated.financials.contingencyAmount, calculated.financials.netTotal,
      calculated.financials.vatRate, calculated.financials.vatAmount,
      calculated.financials.grandTotal, calculated.metadata.finishCategory
    );

    const estimateId = resDb.lastInsertRowid;

    // Save line items
    const insertLine = db.prepare(`
      INSERT INTO estimate_line_items (estimate_id, category, item_no, description, unit, quantity, unit_rate, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    calculated.items.forEach(item => {
      insertLine.run(estimateId, item.category, item.itemNo, item.description, item.unit, item.quantity, item.unitRate, item.total);
    });

    return sendJson(200, { success: true, estimateId, grandTotal: calculated.financials.grandTotal });
  }

  if (req.url === '/api/portal/quotes' && req.method === 'GET') {
    const user = getAuthenticatedUser();
    if (!user) return sendJson(401, { success: false, error: 'Unauthorized' });
    // Exclude internal notes from client response
    const rows = db.prepare(`
      SELECT id, quote_ref, status, scope, deadline, approx_size, revision_number, created_at, updated_at
      FROM quotes
      WHERE user_id = ?
      ORDER BY id DESC
    `).all(user.id);
    return sendJson(200, { success: true, quotes: rows });
  }

  if (req.url === '/api/portal/documents' && req.method === 'GET') {
    const user = getAuthenticatedUser();
    if (!user) return sendJson(401, { success: false, error: 'Unauthorized' });
    const rows = db.prepare(`
      SELECT id, original_name, file_size, mime_type, created_at
      FROM file_metadata
      WHERE user_id = ?
      ORDER BY id DESC
    `).all(user.id);
    return sendJson(200, { success: true, documents: rows });
  }

  // =================================================================
  // ADMIN DASHBOARD APIS (Phase 7)
  // =================================================================
  if (req.url.startsWith('/api/admin/')) {
    const user = getAuthenticatedUser();
    if (!user || user.role !== 'admin') {
      return sendJson(403, { success: false, error: 'Forbidden: Administrator privileges required.' });
    }

    if (req.url === '/api/admin/overview' && req.method === 'GET') {
      const enquiriesCount = db.prepare('SELECT COUNT(*) as c FROM enquiries').get().c;
      const projectsCount = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
      const quotesCount = db.prepare('SELECT COUNT(*) as c FROM quotes').get().c;
      const usersCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ?').get('client').c;

      const recentEnquiries = db.prepare('SELECT * FROM enquiries ORDER BY id DESC LIMIT 5').all();
      const recentActivity = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 8').all();

      return sendJson(200, {
        success: true,
        stats: { enquiriesCount, projectsCount, quotesCount, usersCount },
        recentEnquiries,
        recentActivity
      });
    }

    if (req.url.startsWith('/api/admin/enquiries') && req.method === 'GET') {
      const rows = db.prepare('SELECT * FROM enquiries ORDER BY id DESC').all();
      return sendJson(200, { success: true, enquiries: rows });
    }

    if (req.url.startsWith('/api/admin/enquiries/') && req.method === 'PUT') {
      const id = req.url.split('/')[4];
      const { status, internalNotes } = await readBody();

      db.prepare(`
        UPDATE enquiries SET
          status = COALESCE(?, status),
          internal_notes = COALESCE(?, internal_notes),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, internalNotes, id);

      return sendJson(200, { success: true, message: 'Enquiry updated successfully' });
    }

    if (req.url === '/api/admin/quotes' && req.method === 'GET') {
      const rows = db.prepare('SELECT * FROM quotes ORDER BY id DESC').all();
      return sendJson(200, { success: true, quotes: rows });
    }

    if (req.url.startsWith('/api/admin/quotes/') && req.method === 'PUT') {
      const id = req.url.split('/')[4];
      const { status, internalNotes, revisionNumber } = await readBody();

      db.prepare(`
        UPDATE quotes SET
          status = COALESCE(?, status),
          internal_notes = COALESCE(?, internal_notes),
          revision_number = COALESCE(?, revision_number),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, internalNotes, revisionNumber, id);

      return sendJson(200, { success: true, message: 'Quote updated' });
    }

    if (req.url === '/api/admin/users' && req.method === 'GET') {
      const rows = db.prepare('SELECT id, email, role, full_name, company_name, phone, created_at FROM users ORDER BY id DESC').all();
      return sendJson(200, { success: true, users: rows });
    }

    if (req.url === '/api/admin/activity-logs' && req.method === 'GET') {
      const rows = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 50').all();
      return sendJson(200, { success: true, logs: rows });
    }

    if (req.url === '/api/admin/analytics' && req.method === 'GET') {
      const enquiriesCount = db.prepare('SELECT COUNT(*) as c FROM enquiries').get().c;
      const conversionRate = analyticsStore.quoteStarts > 0 ? ((analyticsStore.quoteCompletions / analyticsStore.quoteStarts) * 100).toFixed(1) : 0;

      return sendJson(200, {
        success: true,
        analytics: {
          dailyVisitors: analyticsStore.uniqueVisitors,
          pageViews: analyticsStore.pageViews,
          quoteStarts: analyticsStore.quoteStarts,
          quoteCompletions: analyticsStore.quoteCompletions,
          enquiriesTotal: enquiriesCount,
          conversionRatePct: conversionRate,
          servicePageViews: analyticsStore.serviceViews,
          mode: 'Hybrid (Live DB Enquiries & Local Tracking)'
        }
      });
    }

    if (req.url === '/api/admin/system-status' && req.method === 'GET') {
      return sendJson(200, {
        success: true,
        system: {
          database: 'SQLite (node:sqlite native WAL mode)',
          dbPath: DB_PATH,
          emailProvider: 'Local Store Demo (SMTP Credentials unconfigured)',
          storagePath: STORAGE_DIR,
          activeSessions: db.prepare('SELECT COUNT(*) as c FROM sessions').get().c,
          totalPricingRecords: db.prepare('SELECT COUNT(*) as c FROM pricing_records').get().c
        }
      });
    }
  }

  // =================================================================
  // PRICING DATA APIS (Phase 8)
  // =================================================================
  if (req.url.startsWith('/api/pricing')) {
    if (req.method === 'GET') {
      const urlObj = new URL(req.url, 'http://localhost');
      const trade = urlObj.searchParams.get('trade');
      const status = urlObj.searchParams.get('status');
      const search = urlObj.searchParams.get('search');
      const records = pricingDb.getAllPricingRecords({ tradeCategory: trade, verificationStatus: status, search });
      return sendJson(200, { success: true, records, regionalFactors: pricingDb.REGIONAL_FACTORS });
    }

    // Mutating endpoints require Admin
    const user = getAuthenticatedUser();
    if (!user || user.role !== 'admin') {
      return sendJson(403, { success: false, error: 'Admin permission required to edit pricing records.' });
    }

    if (req.method === 'POST') {
      try {
        const body = await readBody();
        const created = pricingDb.createPricingRecord(body);
        return sendJson(200, { success: true, record: created });
      } catch (e) {
        return sendJson(400, { success: false, error: e.message });
      }
    }

    if (req.method === 'PUT') {
      try {
        const id = req.url.split('/')[3];
        const body = await readBody();
        const updated = pricingDb.updatePricingRecord(id, body);
        return sendJson(200, { success: true, record: updated });
      } catch (e) {
        return sendJson(400, { success: false, error: e.message });
      }
    }

    if (req.method === 'DELETE') {
      const id = req.url.split('/')[3];
      pricingDb.deletePricingRecord(id);
      return sendJson(200, { success: true });
    }
  }

  // =================================================================
  // DRAWING WORKSPACE & TAKEOFF APIS (Phase 9)
  // =================================================================
  if (req.url.startsWith('/api/drawings')) {
    const user = getAuthenticatedUser();
    if (!user) return sendJson(401, { success: false, error: 'Unauthorized: login required.' });

    // Upload drawing
    if (req.url === '/api/drawings/upload' && req.method === 'POST') {
      const { fileName, fileData } = await readBody();
      if (!fileName || !fileData) return sendJson(400, { success: false, error: 'File data required' });

      const ext = path.extname(fileName).toLowerCase();
      if (!['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) {
        return sendJson(400, { success: false, error: 'Supported formats for workspace: PDF, PNG, JPG' });
      }

      const base64Data = fileData.replace(/^data:.*?;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const safeName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(DRAWINGS_DIR, safeName);
      fs.writeFileSync(filePath, buffer);

      const resDb = db.prepare(`
        INSERT INTO file_metadata (user_id, original_name, stored_name, file_path, file_size, mime_type)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(user.id, fileName, safeName, filePath, buffer.length, ext === '.pdf' ? 'application/pdf' : 'image/png');

      return sendJson(200, {
        success: true,
        fileId: resDb.lastInsertRowid,
        fileName,
        sizeBytes: buffer.length
      });
    }

    // List user drawings
    if (req.url === '/api/drawings' && req.method === 'GET') {
      const rows = db.prepare('SELECT id, original_name, file_size, mime_type, created_at FROM file_metadata WHERE user_id = ? ORDER BY id DESC').all(user.id);
      return sendJson(200, { success: true, drawings: rows });
    }

    // Stream drawing file securely
    if (req.url.match(/^\/api\/drawings\/\d+\/file$/) && req.method === 'GET') {
      const fileId = req.url.split('/')[3];
      const fileMeta = db.prepare('SELECT * FROM file_metadata WHERE id = ?').get(fileId);

      if (!fileMeta) return sendJson(404, { success: false, error: 'File not found' });
      if (fileMeta.user_id !== user.id && user.role !== 'admin') {
        return sendJson(403, { success: false, error: 'Forbidden: You do not own this drawing' });
      }

      if (!fs.existsSync(fileMeta.file_path)) {
        return sendJson(404, { success: false, error: 'Drawing binary missing on disk' });
      }

      res.writeHead(200, {
        'Content-Type': fileMeta.mime_type,
        'Content-Length': fileMeta.file_size
      });
      return fs.createReadStream(fileMeta.file_path).pipe(res);
    }

    // Annotations for drawing
    if (req.url.match(/^\/api\/drawings\/\d+\/annotations$/)) {
      const fileId = req.url.split('/')[3];
      if (req.method === 'GET') {
        const annotations = drawingEngine.getAnnotationsForFile(fileId, user.id, user.role === 'admin');
        return sendJson(200, { success: true, annotations });
      }
      if (req.method === 'POST') {
        const body = await readBody();
        const annotation = drawingEngine.saveAnnotation({ ...body, fileId, userId: user.id });
        return sendJson(200, { success: true, annotation });
      }
    }

    // Assisted Candidates
    if (req.url.match(/^\/api\/drawings\/\d+\/assisted-candidates$/) && req.method === 'GET') {
      const fileId = req.url.split('/')[3];
      const fileMeta = db.prepare('SELECT * FROM file_metadata WHERE id = ?').get(fileId);
      const candidates = drawingEngine.generateAssistedCandidates(fileMeta);
      return sendJson(200, { success: true, candidates });
    }

    // Export to BOQ
    if (req.url.match(/^\/api\/drawings\/\d+\/export-to-boq$/) && req.method === 'POST') {
      const fileId = req.url.split('/')[3];
      const items = drawingEngine.exportApprovedAnnotationsToBOQ(fileId, user.id);
      return sendJson(200, { success: true, items });
    }

    // Approve annotation
    if (req.url.match(/^\/api\/drawings\/annotations\/\d+\/status$/) && req.method === 'PUT') {
      const annId = req.url.split('/')[4];
      const { status, notes } = await readBody();
      const updated = drawingEngine.updateAnnotationStatus(annId, user.id, status, notes, user.role === 'admin');
      return sendJson(200, { success: true, annotation: updated });
    }
  }

  // =================================================================
  // PUBLIC QUOTE & EXPORT APIS (Preserving Phase 3 & 5)
  // =================================================================
  if (req.method === 'POST' && req.url === '/api/quote') {
    if (isRateLimited(clientIp)) {
      return sendJson(429, { success: false, error: 'Rate limit exceeded. Please wait a few minutes.' });
    }

    try {
      const payload = await readBody();
      const { fullName, companyName, email, phone, projectType, ukCountry, postcode, services, description, deadline, approxSize, privacyConsent, files } = payload;

      if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
        return sendJson(400, { success: false, error: 'Full name is required (min 2 characters).' });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        return sendJson(400, { success: false, error: 'A valid email address is required.' });
      }
      if (!projectType || !ukCountry || !postcode) {
        return sendJson(400, { success: false, error: 'Project type, country and postcode are required.' });
      }
      if (!description || description.trim().length < 10) {
        return sendJson(400, { success: false, error: 'Please provide a project description (min 10 characters).' });
      }
      if (!privacyConsent) {
        return sendJson(400, { success: false, error: 'You must acknowledge the privacy notice.' });
      }

      analyticsStore.quoteCompletions++;

      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      const quoteRef = `OBC-${new Date().getFullYear()}-${randomDigits}`;

      // Insert Enquiry in SQLite database
      const resDb = db.prepare(`
        INSERT INTO enquiries (reference, full_name, email, phone, company, project_type, country, postcode, services, description, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
      `).run(
        quoteRef, fullName.trim(), email.trim().toLowerCase(), (phone || '').trim(),
        (companyName || '').trim(), projectType, ukCountry, postcode.trim().toUpperCase(),
        JSON.stringify(services || []), description.trim()
      );

      // Create linked quote record
      db.prepare(`
        INSERT INTO quotes (quote_ref, status, scope, deadline, approx_size, revision_number)
        VALUES (?, 'new', ?, ?, ?, 0)
      `).run(quoteRef, description.trim(), deadline || null, approxSize || null);

      // Store attachments
      const savedFiles = [];
      const quoteStorageDir = path.join(STORAGE_DIR, quoteRef);

      if (Array.isArray(files) && files.length > 0) {
        fs.mkdirSync(quoteStorageDir, { recursive: true });
        for (const f of files) {
          if (!f.name || !f.data) continue;
          const ext = path.extname(f.name).toLowerCase();
          if (!['.pdf', '.dwg', '.dxf', '.png', '.jpg', '.jpeg', '.zip'].includes(ext)) {
            return sendJson(400, { success: false, error: `File type "${ext}" not permitted.` });
          }

          const base64Data = f.data.replace(/^data:.*?;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          if (buffer.length > 25 * 1024 * 1024) {
            return sendJson(400, { success: false, error: `File exceeds 25MB.` });
          }

          const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = path.join(quoteStorageDir, safeName);
          fs.writeFileSync(filePath, buffer);

          db.prepare(`
            INSERT INTO file_metadata (original_name, stored_name, file_path, file_size, mime_type)
            VALUES (?, ?, ?, ?, ?)
          `).run(f.name, safeName, filePath, buffer.length, ext === '.pdf' ? 'application/pdf' : 'application/octet-stream');

          savedFiles.push({ originalName: f.name, storedName: safeName });
        }
      }

      // Write JSON file backup for direct inspection and integration
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const record = {
        reference: quoteRef,
        status: 'received',
        createdAt: new Date().toISOString(),
        client: {
          fullName: fullName.trim(),
          companyName: (companyName || '').trim(),
          email: email.trim().toLowerCase(),
          phone: (phone || '').trim()
        },
        project: {
          type: projectType,
          country: ukCountry,
          postcode: postcode.trim().toUpperCase(),
          services: services || [],
          description: description.trim(),
          requestedDeadline: deadline || null,
          approximateSize: approxSize || null
        },
        attachments: savedFiles,
        system: {
          clientIp,
          environment: 'production-ready',
          emailDispatch: 'local-store-demo'
        }
      };
      fs.writeFileSync(path.join(DATA_DIR, `${quoteRef}.json`), JSON.stringify(record, null, 2), 'utf8');

      return sendJson(200, {
        success: true,
        reference: quoteRef,
        message: 'Quotation request submitted and recorded in persistent database.',
        filesReceived: savedFiles.length
      });
    } catch (e) {
      return sendJson(500, { success: false, error: e.message });
    }
  }

  // Admin / Client Quote Lookup Endpoint
  if (req.method === 'GET' && req.url.startsWith('/api/quote/')) {
    const ref = decodeURIComponent(req.url.replace('/api/quote/', '').trim());
    const recordFile = path.join(DATA_DIR, `${ref}.json`);
    if (fs.existsSync(recordFile)) {
      try {
        const quoteData = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
        return sendJson(200, { success: true, quote: quoteData });
      } catch (e) {
        // Fall back to DB lookup
      }
    }
    const enquiry = db.prepare('SELECT * FROM enquiries WHERE reference = ?').get(ref);
    if (!enquiry) {
      return sendJson(404, { success: false, error: 'Quote record not found' });
    }
    return sendJson(200, {
      success: true,
      quote: {
        reference: enquiry.reference,
        status: enquiry.status,
        createdAt: enquiry.created_at,
        client: {
          fullName: enquiry.full_name,
          companyName: enquiry.company,
          email: enquiry.email,
          phone: enquiry.phone
        },
        project: {
          type: enquiry.project_type,
          country: enquiry.country,
          postcode: enquiry.postcode,
          services: JSON.parse(enquiry.services || '[]'),
          description: enquiry.description
        }
      }
    });
  }

  if (req.method === 'POST' && req.url === '/api/export/xlsx') {
    try {
      const payload = await readBody();
      const estimate = calculateEstimate(payload);
      const buffer = await generateBOQ_Excel(estimate);

      const filename = `Orion-Build-Cost-BOQ-${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length
      });
      return res.end(buffer);
    } catch (e) {
      return sendJson(500, { success: false, error: e.message });
    }
  }

  if (req.method === 'POST' && req.url === '/api/export/csv') {
    try {
      const payload = await readBody();
      const estimate = calculateEstimate(payload);
      const csvString = generateBOQ_CSV(estimate);

      const filename = `Orion-Build-Cost-BOQ-${new Date().toISOString().slice(0, 10)}.csv`;
      const buffer = Buffer.from(csvString, 'utf8');

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length
      });
      return res.end(buffer);
    } catch (e) {
      return sendJson(500, { success: false, error: e.message });
    }
  }

  // =================================================================
  // STATIC FILE SERVING WITH CLEAN ROUTE REWRITES
  // =================================================================
  let reqUrl = req.url.split('?')[0];

  if (reqUrl === '/') reqUrl = '/index.html';
  else if (reqUrl === '/quote') reqUrl = '/quote.html';
  else if (reqUrl === '/estimator') reqUrl = '/estimator.html';
  else if (reqUrl === '/boq-builder') reqUrl = '/boq-builder.html';
  else if (reqUrl === '/portfolio') reqUrl = '/portfolio.html';
  else if (reqUrl === '/portal') reqUrl = '/portal.html';
  else if (reqUrl === '/admin') reqUrl = '/admin.html';
  else if (reqUrl === '/drawing-workspace') reqUrl = '/drawing-workspace.html';
  else if (reqUrl.startsWith('/services/') && !reqUrl.endsWith('.html')) {
    reqUrl = reqUrl + '.html';
  }

  const filePath = path.join(PUBLIC_DIR, decodeURIComponent(reqUrl));

  // Security Check: prevent path traversal outside PUBLIC_DIR
  // Also ensure private storage/ and data/ directories are NEVER served via HTTP static server
  if (!filePath.startsWith(PUBLIC_DIR) || filePath.includes(path.join(PUBLIC_DIR, 'storage')) || filePath.includes(path.join(PUBLIC_DIR, 'data'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden: Access denied.');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + reqUrl);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // HTTP 206 Partial Content Range Streaming for MP4 videos
    const range = req.headers.range;
    if (range && ext === '.mp4') {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
  } catch (err) {
    console.error('Unhandled request error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: 'Internal server error occurred.' }));
    }
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

if (require.main === module) {
  const HOST = process.env.HOST || '0.0.0.0';
  server.listen(PORT, HOST, () => {
    console.log(`Orion Build Cost server active on http://${HOST}:${PORT}/`);
  });
}

module.exports = server;
