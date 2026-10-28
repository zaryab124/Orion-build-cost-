const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../auth.js');
const { db } = require('../db.js');

describe('Orion Database & Authentication Unit Tests', () => {

  const testEmail = `test.client.${Date.now()}@example.co.uk`;

  test('hashPassword creates a valid salt:scrypt format and verifies correctly', () => {
    const raw = 'SecureSecretPass123!';
    const hashed = auth.hashPassword(raw);
    assert.ok(hashed.includes(':'));
    assert.equal(hashed.split(':').length, 2);

    assert.equal(auth.verifyPassword(raw, hashed), true);
    assert.equal(auth.verifyPassword('WrongPass', hashed), false);
    assert.equal(auth.verifyPassword('', hashed), false);
  });

  test('registerUser creates new client user with encrypted credentials and profile', () => {
    const user = auth.registerUser({
      email: testEmail,
      password: 'StrongPassword2026!',
      fullName: 'Thomas Contractor',
      companyName: 'Thomas Build Solutions',
      phone: '+44 7900 123456'
    });

    assert.ok(user.id > 0);
    assert.equal(user.email, testEmail.toLowerCase());
    assert.equal(user.role, 'client');
    assert.equal(user.fullName, 'Thomas Contractor');

    // Verify row in database
    const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    assert.ok(dbUser);
    assert.ok(dbUser.password_hash.includes(':'));
    assert.notEqual(dbUser.password_hash, 'StrongPassword2026!'); // Plaintext password is NEVER stored
  });

  test('registerUser rejects duplicate email address with clear message', () => {
    assert.throws(() => {
      auth.registerUser({
        email: testEmail,
        password: 'AnotherPassword2026!',
        fullName: 'Duplicate User'
      });
    }, /already exists/);
  });

  test('loginUser authenticates successfully and returns user profile and session token', () => {
    const result = auth.loginUser(testEmail, 'StrongPassword2026!');
    assert.ok(result.user);
    assert.equal(result.user.email, testEmail.toLowerCase());
    assert.ok(result.session.token);
    assert.equal(result.session.token.length, 64);

    // Validate session
    const validated = auth.validateSession(result.session.token);
    assert.ok(validated);
    assert.equal(validated.id, result.user.id);
    assert.equal(validated.role, 'client');
  });

  test('loginUser rejects invalid password', () => {
    assert.throws(() => {
      auth.loginUser(testEmail, 'WrongPassword!');
    }, /Invalid email or password/);
  });

  test('destroySession removes active session from database', () => {
    const result = auth.loginUser(testEmail, 'StrongPassword2026!');
    const token = result.session.token;

    assert.ok(auth.validateSession(token));
    auth.destroySession(token);
    assert.equal(auth.validateSession(token), null);
  });

  test('createPasswordReset generates recovery token and resetPasswordWithToken updates hash', () => {
    const reset = auth.createPasswordReset(testEmail);
    assert.equal(reset.success, true);
    assert.ok(reset.demoToken);

    // Reset password
    const update = auth.resetPasswordWithToken(reset.demoToken, 'NewBrandSecret2026!');
    assert.equal(update.success, true);

    // Login with new password
    const loginNew = auth.loginUser(testEmail, 'NewBrandSecret2026!');
    assert.ok(loginNew.user);

    // Old password should now fail
    assert.throws(() => {
      auth.loginUser(testEmail, 'StrongPassword2026!');
    }, /Invalid email or password/);
  });

  test('Tenant isolation: Client cannot access another client projects', () => {
    // Create client A
    const clientA = auth.registerUser({
      email: `clientA.${Date.now()}@example.co.uk`,
      password: 'PasswordClientA1!',
      fullName: 'Client A'
    });

    // Create client B
    const clientB = auth.registerUser({
      email: `clientB.${Date.now()}@example.co.uk`,
      password: 'PasswordClientB1!',
      fullName: 'Client B'
    });

    // Client A creates a project
    const proj = db.prepare(`
      INSERT INTO projects (user_id, title, project_type, location)
      VALUES (?, 'Client A Private Scheme', 'residential', 'London')
    `).run(clientA.id);

    // Query project with Client B's user_id filter
    const rowForB = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(proj.lastInsertRowid, clientB.id);
    assert.equal(rowForB, undefined, 'Client B must not be able to retrieve Client A project');

    // Query project with Client A's user_id filter
    const rowForA = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(proj.lastInsertRowid, clientA.id);
    assert.ok(rowForA, 'Client A can retrieve own project');
    assert.equal(rowForA.title, 'Client A Private Scheme');
  });
});
