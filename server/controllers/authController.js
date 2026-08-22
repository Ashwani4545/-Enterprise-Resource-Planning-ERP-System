const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/db');

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

// Generate UUID v4
function generateUUID() {
  return crypto.randomUUID();
}

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

async function register(req, res) {
  try {
    const { fullName, email, password, role } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'fullName, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const roleName = role || 'employee';
    const roleResult = await query('SELECT id FROM roles WHERE name = ?', [roleName]);
    if (roleResult.rowCount === 0) {
      return res.status(400).json({ error: `Unknown role: ${roleName}` });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = generateUUID();

    const insertResult = await query(
      `INSERT INTO users (id, full_name, email, password_hash, role_id)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, fullName, email.toLowerCase(), passwordHash, roleResult.rows[0].id]
    );

    return res.status(201).json({
      message: 'User registered successfully',
      user: { 
        id: userId,
        full_name: fullName, 
        email: email.toLowerCase(), 
        role: roleName 
      },
    });
  } catch (err) {
    console.error('register error:', err.message);
    return res.status(500).json({ error: 'Failed to register user' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // First, get the user without JOIN
    const userResult = await query(
      `SELECT id, full_name, email, password_hash, is_active, role_id FROM users WHERE email = ?`,
      [email.toLowerCase()]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get the role name
    const roleResult = await query(
      `SELECT name FROM roles WHERE id = ?`,
      [user.role_id]
    );
    const roleName = roleResult.rowCount > 0 ? roleResult.rows[0].name : 'employee';

    const accessToken = signAccessToken({ ...user, role_name: roleName });
    const refreshToken = signRefreshToken(user);

    // Store a hash of the refresh token so it can be revoked on logout.
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const refreshTokenId = generateUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
      [refreshTokenId, user.id, tokenHash, expiresAt.toISOString()]
    );

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: roleName,
      },
    });
  } catch (err) {
    console.error('login error:', err.message);
    return res.status(500).json({ error: 'Failed to log in' });
  }
}

/**
 * POST /api/auth/refresh
 * Exchanges a valid, non-revoked refresh token for a new access token.
 */
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await query(
      `SELECT id, revoked, expires_at FROM refresh_tokens WHERE token_hash = ? AND user_id = ?`,
      [tokenHash, payload.id]
    );

    if (stored.rowCount === 0 || stored.rows[0].revoked || new Date(stored.rows[0].expires_at) < new Date()) {
      return res.status(401).json({ error: 'Refresh token is no longer valid' });
    }

    const userResult = await query(
      `SELECT u.id, u.email, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      [payload.id]
    );
    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const accessToken = signAccessToken(userResult.rows[0]);
    return res.json({ accessToken });
  } catch (err) {
    console.error('refresh error:', err.message);
    return res.status(500).json({ error: 'Failed to refresh token' });
  }
}

/**
 * POST /api/auth/logout
 * Revokes the given refresh token.
 */
async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await query(`UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`, [tokenHash]);
    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('logout error:', err.message);
    return res.status(500).json({ error: 'Failed to log out' });
  }
}

module.exports = { register, login, refresh, logout };
