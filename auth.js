/**
 * Orion Build Cost - Authentication & Authorization Layer (Phase 6)
 * Cryptographic scrypt password hashing, session management, and RBAC.
 */

const crypto = require('node:crypto');
const { db } = require('./db.js');

/**
 * Hash password securely with scrypt and a unique 16-byte random salt
 */
function hashPassword(password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password against stored salt:hash using constant-time equality
 */
function verifyPassword(password, stored) {
  if (!password || !stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 2) return false;

  const [salt, key] = parts;
  const keyBuffer = Buffer.from(key, 'hex');
  const match = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, match);
}

/**
 * Create a new cryptographic session token valid for 7 days
 */
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, userId, expiresAt);

  return { token, expiresAt };
}

/**
 * Validate session token and return user profile with role permissions
 */
function validateSession(token) {
  if (!token || typeof token !== 'string') return null;

  const row = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.email, u.role, u.full_name, u.company_name, u.phone, u.created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token);

  if (!row) return null;

  // Check expiration
  if (new Date(row.expires_at) < new Date()) {
    destroySession(token);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    fullName: row.full_name,
    companyName: row.company_name,
    phone: row.phone,
    createdAt: row.created_at
  };
}

/**
 * Destroy session (Logout)
 */
function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/**
 * Register a new user
 */
function registerUser(data) {
  const { email, password, fullName, companyName, phone, role } = data;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    throw new Error('A valid email address is required.');
  }

  if (!fullName || fullName.trim().length < 2) {
    throw new Error('Full name is required (min 2 characters).');
  }

  const cleanEmail = email.trim().toLowerCase();

  // Check if user already exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    throw new Error('An account with this email address already exists.');
  }

  const passwordHash = hashPassword(password);
  const userRole = role === 'admin' ? 'admin' : 'client';

  // Insert user
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, role, full_name, company_name, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(cleanEmail, passwordHash, userRole, fullName.trim(), (companyName || '').trim(), (phone || '').trim());

  const userId = result.lastInsertRowid;

  // Create default customer profile & organisation
  if (companyName && companyName.trim()) {
    db.prepare(`
      INSERT INTO organisations (name, user_id)
      VALUES (?, ?)
    `).run(companyName.trim(), userId);
  }

  db.prepare(`
    INSERT INTO customer_profiles (user_id, billing_email)
    VALUES (?, ?)
  `).run(userId, cleanEmail);

  // Log activity
  db.prepare(`
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (?, 'USER_REGISTERED', 'users', ?, 'New user registration')
  `).run(userId, String(userId));

  return {
    id: userId,
    email: cleanEmail,
    role: userRole,
    fullName: fullName.trim(),
    companyName: (companyName || '').trim()
  };
}

/**
 * Authenticate user with email and password
 */
function loginUser(email, password, ipAddress = '127.0.0.1') {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare(`
    SELECT id, email, password_hash, role, full_name, company_name, phone
    FROM users
    WHERE email = ?
  `).get(cleanEmail);

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error('Invalid email or password.');
  }

  // Create session
  const session = createSession(user.id);

  // Log activity
  db.prepare(`
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address)
    VALUES (?, 'USER_LOGIN', 'users', ?, 'Successful session login', ?)
  `).run(user.id, String(user.id), ipAddress);

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      companyName: user.company_name,
      phone: user.phone
    },
    session
  };
}

/**
 * Password Recovery
 */
function createPasswordReset(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (!user) {
    // Return success to avoid email enumeration
    return { success: true, message: 'If an account exists with this email, a reset link has been dispatched.' };
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  db.prepare(`
    INSERT INTO password_resets (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, user.id, expiresAt);

  return {
    success: true,
    message: 'Password reset link prepared.',
    demoToken: token, // Surfaced for testing & demo mode when SMTP is offline
    note: 'SMTP email provider not configured: reset token provided directly for local testing.'
  };
}

function resetPasswordWithToken(token, newPassword) {
  if (!token) throw new Error('Reset token is required.');

  const row = db.prepare(`
    SELECT token, user_id, expires_at, used
    FROM password_resets
    WHERE token = ? AND used = 0
  `).get(token);

  if (!row || new Date(row.expires_at) < new Date()) {
    throw new Error('Invalid or expired password reset token.');
  }

  const newHash = hashPassword(newPassword);

  // Update password and invalidate token
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token);

  // Invalidate any active sessions for this user
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);

  return { success: true, message: 'Password has been reset successfully. Please log in with your new password.' };
}

/**
 * Seed initial administrative and demo accounts if they do not exist
 */
function seedInitialUsers() {
  const adminEmail = 'admin@orionbuildcost.co.uk';
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

  if (!existingAdmin) {
    const adminHash = hashPassword('OrionAdmin2026!');
    db.prepare(`
      INSERT INTO users (email, password_hash, role, full_name, company_name, phone)
      VALUES (?, ?, 'admin', 'Orion Senior Director', 'Orion Build Cost Ltd', '+44 20 7946 0850')
    `).run(adminEmail, adminHash);
  }

  const clientEmail = 'client@apexdevelopments.co.uk';
  const existingClient = db.prepare('SELECT id FROM users WHERE email = ?').get(clientEmail);

  if (!existingClient) {
    const clientHash = hashPassword('ApexClient2026!');
    const clientResult = db.prepare(`
      INSERT INTO users (email, password_hash, role, full_name, company_name, phone)
      VALUES (?, ?, 'client', 'James Anderson', 'Apex Developments UK', '+44 7700 900077')
    `).run(clientEmail, clientHash);

    const clientId = clientResult.lastInsertRowid;

    // Seed sample project for demo client
    const projResult = db.prepare(`
      INSERT INTO projects (user_id, title, project_type, location, postcode, floor_area, spec_tier, status)
      VALUES (?, 'Oakfield Commercial Offices Refurbishment', 'Commercial Office / Fit-Out', 'Leeds', 'LS1 4DY', 2400, 'premium', 'active')
    `).run(clientId);

    const projId = projResult.lastInsertRowid;

    // Seed sample quote
    db.prepare(`
      INSERT INTO quotes (quote_ref, user_id, project_id, status, scope, deadline, approx_size, revision_number)
      VALUES ('OBC-2026-7492', ?, ?, 'under_review', 'Full Bill of Quantities (NRM2) and tender comparison pack for commercial office scheme.', '2026-11-20', '2,400 m²', 0)
    `).run(clientId, projId);
  }
}

// Seed on startup
seedInitialUsers();

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  destroySession,
  registerUser,
  loginUser,
  createPasswordReset,
  resetPasswordWithToken
};
