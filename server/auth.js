const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const COOKIE_NAME = 'wealthline_token';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Set it to a long random value before deploying to production.');
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// Tokens carry the account's token_version. Bumping that column server-side
// invalidates every token already issued — which is what makes a password
// reset actually evict an attacker instead of leaving them signed in.
function createToken(userId, tokenVersion = 0) {
  return jwt.sign({ userId, v: tokenVersion }, JWT_SECRET, { expiresIn: '30d' });
}

function decodeToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { userId: payload.userId, version: payload.v ?? 0 };
  } catch {
    return null;
  }
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000
};

function requireAuth(req, res, next) {
  const { sql } = require('./database');
  const raw = req.cookies[COOKIE_NAME];
  const decoded = raw && decodeToken(raw);
  if (!decoded) return res.status(401).json({ error: 'Not authenticated' });

  sql`SELECT id, email, token_version, email_verified FROM users WHERE id = ${decoded.userId}`
    .then(([user]) => {
      if (!user || user.token_version !== decoded.version) {
        res.clearCookie(COOKIE_NAME, cookieOptions);
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      }
      req.userId = user.id;
      req.user = user;
      next();
    })
    .catch(next);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  decodeToken,
  requireAuth,
  COOKIE_NAME,
  cookieOptions
};
