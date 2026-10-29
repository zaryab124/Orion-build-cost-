const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString();
        let json = null;
        try {
          json = JSON.parse(bodyText);
        } catch (e) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, bodyText, json });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

describe('Render Production Deployment Environment Simulation', () => {
  const SIM_PORT = 3099;
  const tempDiskDir = path.join(__dirname, '..', '.tmp_render_test_disk');

  test('Server starts successfully in Render production environment with persistent disk', async () => {
    // Ensure clean simulated persistent disk directory
    if (fs.existsSync(tempDiskDir)) {
      fs.rmSync(tempDiskDir, { recursive: true, force: true });
    }

    const env = {
      ...process.env,
      PORT: String(SIM_PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      ORION_DB_PATH: path.join(tempDiskDir, 'data', 'orion.db'),
      ORION_STORAGE_DIR: path.join(tempDiskDir, 'storage', 'quotes'),
      ORION_DRAWINGS_DIR: path.join(tempDiskDir, 'storage', 'drawings'),
      ORION_DATA_DIR: path.join(tempDiskDir, 'data', 'quotes'),
      ORION_SEED_DEMO_ACCOUNTS: 'false',
      ORION_SESSION_SECRET: 'simulated_render_secret_64_characters_hex_0123456789abcdef0123456789',
      ORION_ADMIN_EMAIL: 'director.render@orionbuildcost.co.uk',
      ORION_ADMIN_PASSWORD: 'RenderDirectorPass2026!',
      ORION_ADMIN_NAME: 'Render Lead QS'
    };

    const serverProcess = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    try {
      // Wait for server to bind and respond to health check
      let ready = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 300));
        try {
          const res = await request({
            hostname: '127.0.0.1',
            port: SIM_PORT,
            path: '/api/health',
            method: 'GET'
          });
          if (res.statusCode === 200 && res.json && res.json.status === 'ok') {
            ready = true;
            break;
          }
        } catch (e) {
          // Retry
        }
      }

      assert.ok(ready, 'Server failed to start and respond to /api/health within timeout');

      // 1. Verify health check response payload
      const healthRes = await request({
        hostname: '127.0.0.1',
        port: SIM_PORT,
        path: '/api/health',
        method: 'GET'
      });
      assert.equal(healthRes.statusCode, 200);
      assert.equal(healthRes.json.status, 'ok');
      assert.equal(healthRes.json.service, 'orion-build-cost');

      // 2. Verify persistent disk directories were created
      assert.ok(fs.existsSync(path.join(tempDiskDir, 'data', 'orion.db')), 'SQLite database must exist on persistent disk');
      assert.ok(fs.existsSync(path.join(tempDiskDir, 'storage', 'quotes')), 'Quote storage directory must exist');
      assert.ok(fs.existsSync(path.join(tempDiskDir, 'storage', 'drawings')), 'Drawings directory must exist');
      assert.ok(fs.existsSync(path.join(tempDiskDir, 'data', 'quotes')), 'Quote metadata directory must exist');

      // 3. Verify configured production admin can log in
      const loginRes = await request({
        hostname: '127.0.0.1',
        port: SIM_PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, JSON.stringify({
        email: 'director.render@orionbuildcost.co.uk',
        password: 'RenderDirectorPass2026!'
      }));

      assert.equal(loginRes.statusCode, 200, 'Configured production admin must be able to log in');
      assert.equal(loginRes.json.success, true);
      assert.equal(loginRes.json.user.role, 'admin');
      assert.equal(loginRes.json.user.fullName, 'Render Lead QS');
      assert.ok(loginRes.json.token);
      assert.equal(loginRes.json.token.length, 64);

      // 4. Verify demo accounts were strictly suppressed
      const demoAdminLogin = await request({
        hostname: '127.0.0.1',
        port: SIM_PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, JSON.stringify({
        email: 'admin@orionbuildcost.co.uk',
        password: 'OrionAdmin2026!'
      }));
      assert.equal(demoAdminLogin.statusCode, 401, 'Default demo admin must NOT exist in production');

      const demoClientLogin = await request({
        hostname: '127.0.0.1',
        port: SIM_PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, JSON.stringify({
        email: 'client@apexdevelopments.co.uk',
        password: 'ApexClient2026!'
      }));
      assert.equal(demoClientLogin.statusCode, 401, 'Default demo client must NOT exist in production');

    } finally {
      serverProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
      if (fs.existsSync(tempDiskDir)) {
        fs.rmSync(tempDiskDir, { recursive: true, force: true });
      }
    }
  });
});
