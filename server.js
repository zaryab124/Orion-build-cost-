const http = require('http');
const fs = require('fs');
const path = require('path');
const { calculateEstimate } = require('./estimating-engine.js');
const { generateBOQ_CSV, generateBOQ_Excel } = require('./boq-export.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname);
const STORAGE_DIR = path.join(__dirname, 'storage', 'quotes');
const DATA_DIR = path.join(__dirname, 'data', 'quotes');

// Ensure storage and data directories exist (private directories, not publicly served)
fs.mkdirSync(STORAGE_DIR, { recursive: true });
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

// Simple In-Memory Rate Limiter (15 requests per 10 minutes per IP)
const rateLimits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const maxRequests = 20;

  const userRecord = rateLimits.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > userRecord.resetAt) {
    userRecord.count = 1;
    userRecord.resetAt = now + windowMs;
  } else {
    userRecord.count++;
  }
  rateLimits.set(ip, userRecord);
  return userRecord.count > maxRequests;
}

// Allowed file extensions for quote attachments
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.dwg', '.dxf', '.png', '.jpg', '.jpeg', '.zip']);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB max per file

const server = http.createServer(async (req, res) => {
  const clientIp = req.socket.remoteAddress || '127.0.0.1';

  // Helper JSON sender
  function sendJson(statusCode, data) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify(data));
  }

  // -----------------------------------------------------------------
  // 1. API: POST /api/quote (Quotation Request System)
  // -----------------------------------------------------------------
  if (req.method === 'POST' && req.url === '/api/quote') {
    if (isRateLimited(clientIp)) {
      return sendJson(429, { success: false, error: 'Rate limit exceeded. Please wait a few minutes before submitting again.' });
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 30 * 1024 * 1024) { // 30 MB body ceiling
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);

        // Server-Side Field Validation
        const {
          fullName,
          companyName,
          email,
          phone,
          projectType,
          ukCountry,
          postcode,
          services,
          description,
          deadline,
          approxSize,
          privacyConsent,
          files
        } = payload;

        if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
          return sendJson(400, { success: false, error: 'Full name is required (min 2 characters).' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          return sendJson(400, { success: false, error: 'A valid email address is required.' });
        }

        if (!projectType) {
          return sendJson(400, { success: false, error: 'Project type is required.' });
        }

        if (!ukCountry || !postcode) {
          return sendJson(400, { success: false, error: 'UK Country and Postcode are required.' });
        }

        if (!description || description.trim().length < 10) {
          return sendJson(400, { success: false, error: 'Please provide a project description (min 10 characters).' });
        }

        if (!privacyConsent) {
          return sendJson(400, { success: false, error: 'You must acknowledge the privacy notice to submit.' });
        }

        // Validate attached files if any
        const savedFiles = [];
        const randomDigits = Math.floor(1000 + Math.random() * 9000);
        const quoteRef = `OBC-${new Date().getFullYear()}-${randomDigits}`;
        const quoteStorageDir = path.join(STORAGE_DIR, quoteRef);

        if (Array.isArray(files) && files.length > 0) {
          fs.mkdirSync(quoteStorageDir, { recursive: true });

          for (const f of files) {
            if (!f.name || !f.data) continue;
            const ext = path.extname(f.name).toLowerCase();

            if (!ALLOWED_EXTENSIONS.has(ext)) {
              return sendJson(400, {
                success: false,
                error: `File type "${ext}" is not permitted. Allowed types: PDF, DWG, DXF, PNG, JPG, ZIP.`
              });
            }

            // Extract base64 data safely
            const base64Data = f.data.replace(/^data:.*?;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            if (buffer.length > MAX_FILE_SIZE) {
              return sendJson(400, {
                success: false,
                error: `File "${f.name}" exceeds the maximum allowed size of 25MB.`
              });
            }

            // Sanitize filename
            const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const filePath = path.join(quoteStorageDir, safeName);
            fs.writeFileSync(filePath, buffer);

            savedFiles.push({
              originalName: f.name,
              storedName: safeName,
              sizeBytes: buffer.length,
              extension: ext
            });
          }
        }

        // Store structured record in data directory for Phase 6/7 admin handoff
        const quoteRecord = {
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
            services: Array.isArray(services) ? services : [services].filter(Boolean),
            description: description.trim(),
            requestedDeadline: deadline || null,
            approximateSize: approxSize || null
          },
          attachments: savedFiles,
          system: {
            clientIp,
            environment: 'production-ready',
            emailDispatch: 'local-store-demo' // Clearly marked; no fake emails sent
          }
        };

        const recordPath = path.join(DATA_DIR, `${quoteRef}.json`);
        fs.writeFileSync(recordPath, JSON.stringify(quoteRecord, null, 2));

        return sendJson(200, {
          success: true,
          reference: quoteRef,
          message: 'Quotation request submitted and recorded securely.',
          filesReceived: savedFiles.length,
          note: 'Record stored securely in local database. Offline demo mode active: email dispatch simulated.'
        });

      } catch (err) {
        console.error('Quote submission error:', err);
        return sendJson(500, { success: false, error: 'An unexpected server error occurred while processing your request.' });
      }
    });
    return;
  }

  // -----------------------------------------------------------------
  // 2. API: POST /api/export/xlsx (BOQ Excel Workbook Export)
  // -----------------------------------------------------------------
  if (req.method === 'POST' && req.url === '/api/export/xlsx') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const estimate = calculateEstimate(payload);
        const buffer = await generateBOQ_Excel(estimate);

        const filename = `Orion-Build-Cost-BOQ-${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': buffer.length
        });
        res.end(buffer);
      } catch (err) {
        console.error('Excel export error:', err);
        sendJson(500, { success: false, error: 'Failed to generate Excel export: ' + err.message });
      }
    });
    return;
  }

  // -----------------------------------------------------------------
  // 3. API: POST /api/export/csv (BOQ CSV Export)
  // -----------------------------------------------------------------
  if (req.method === 'POST' && req.url === '/api/export/csv') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const estimate = calculateEstimate(payload);
        const csvString = generateBOQ_CSV(estimate);

        const filename = `Orion-Build-Cost-BOQ-${new Date().toISOString().slice(0, 10)}.csv`;
        const buffer = Buffer.from(csvString, 'utf8');

        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': buffer.length
        });
        res.end(buffer);
      } catch (err) {
        console.error('CSV export error:', err);
        sendJson(500, { success: false, error: 'Failed to generate CSV export: ' + err.message });
      }
    });
    return;
  }

  // -----------------------------------------------------------------
  // 4. API: GET /api/quote/:ref (Secure Quote Inspection for Admin Handoff)
  // -----------------------------------------------------------------
  if (req.method === 'GET' && req.url.startsWith('/api/quote/')) {
    const quoteRef = req.url.replace('/api/quote/', '').trim();
    const safeRef = quoteRef.replace(/[^a-zA-Z0-9_-]/g, '');
    const recordPath = path.join(DATA_DIR, `${safeRef}.json`);

    if (fs.existsSync(recordPath)) {
      const data = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
      return sendJson(200, { success: true, quote: data });
    } else {
      return sendJson(404, { success: false, error: 'Quote reference not found.' });
    }
  }

  // -----------------------------------------------------------------
  // 5. Static File Server with Clean Route Rewriting
  // -----------------------------------------------------------------
  let reqUrl = req.url.split('?')[0];

  // Map clean routes to HTML files
  if (reqUrl === '/') reqUrl = '/index.html';
  else if (reqUrl === '/quote') reqUrl = '/quote.html';
  else if (reqUrl === '/estimator') reqUrl = '/estimator.html';
  else if (reqUrl === '/boq-builder') reqUrl = '/boq-builder.html';
  else if (reqUrl === '/portfolio') reqUrl = '/portfolio.html';
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
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

// If run directly, listen on port
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Orion Build Cost server active on http://localhost:${PORT}/`);
  });
}

module.exports = server;
