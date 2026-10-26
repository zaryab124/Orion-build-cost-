const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const server = require('../server.js');

const TEST_PORT = 3001;

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        let json = null;
        try {
          json = JSON.parse(bodyBuffer.toString());
        } catch (e) {
          // not json
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          bodyText: bodyBuffer.toString(),
          bodyBuffer,
          json
        });
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

describe('Orion Server Backend API Tests', () => {

  before((done) => {
    server.listen(TEST_PORT, done);
  });

  after((done) => {
    server.close(done);
  });

  test('POST /api/quote returns 400 when missing required fields', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/quote',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ fullName: '' }));

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.success, false);
    assert.ok(res.json.error.includes('Full name is required'));
  });

  test('POST /api/quote returns 400 when email is invalid', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/quote',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      fullName: 'John Contractor',
      email: 'not-an-email'
    }));

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.success, false);
    assert.ok(res.json.error.includes('valid email'));
  });

  test('POST /api/quote rejects unpermitted file types like .exe', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/quote',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      fullName: 'Alice Builder',
      email: 'alice@builder.co.uk',
      projectType: 'extension',
      ukCountry: 'england',
      postcode: 'SW1A 1AA',
      description: 'Single storey ground floor kitchen extension with bifolds',
      privacyConsent: true,
      files: [
        { name: 'malicious.exe', data: 'data:application/octet-stream;base64,TVqQAAMAAAAEAAAA' }
      ]
    }));

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.success, false);
    assert.ok(res.json.error.includes('not permitted'));
  });

  test('POST /api/quote successfully saves quote and returns reference code', async () => {
    const samplePayload = {
      fullName: 'David Richardson',
      companyName: 'Apex Developments UK',
      email: 'd.richardson@apex.co.uk',
      phone: '+44 7700 900077',
      projectType: 'commercial',
      ukCountry: 'england',
      postcode: 'M3 3AP',
      services: ['Bill of Quantities (BOQ)', 'Quantity Take-Offs'],
      description: 'Full bill of quantities tender pack required for 2,400 m² commercial office development.',
      deadline: '2026-11-15',
      approxSize: '2400 m²',
      privacyConsent: true,
      files: [
        {
          name: 'test-drawing.pdf',
          data: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwgL0xlbmd0aCA1IDAgUiA+PgpzdHJlYW0K'
        }
      ]
    };

    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/quote',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(samplePayload));

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.success, true);
    assert.ok(res.json.reference.startsWith('OBC-2026-'));
    assert.equal(res.json.filesReceived, 1);

    // Verify record exists in data/quotes/
    const ref = res.json.reference;
    const recordFile = path.join(__dirname, '..', 'data', 'quotes', `${ref}.json`);
    assert.ok(fs.existsSync(recordFile));

    // Test GET /api/quote/:ref admin handoff endpoint
    const getRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/quote/${ref}`,
      method: 'GET'
    });
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.json.quote.reference, ref);
    assert.equal(getRes.json.quote.client.fullName, 'David Richardson');
  });

  test('GET /storage/ or /data/ is blocked with 403 Forbidden', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/data/quotes/',
      method: 'GET'
    });
    assert.equal(res.statusCode, 403);
  });

  test('POST /api/export/xlsx streams valid Excel file', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/export/xlsx',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      projectType: 'extension',
      floorArea: 80,
      finishCategory: 'premium'
    }));

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.ok(res.bodyBuffer.length > 5000);
  });

  test('POST /api/export/csv streams valid CSV file', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/export/csv',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      projectType: 'renovation',
      floorArea: 120
    }));

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.bodyText.includes('ORION BUILD COST - BILL OF QUANTITIES'));
  });
});
