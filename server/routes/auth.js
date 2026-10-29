const express = require('express');
const crypto = require('crypto');
const { sql, seedDefaultCategories } = require('../database');
const { hashPassword, verifyPassword, createToken, requireAuth, COOKIE_NAME, cookieOptions } = require('../auth');
const { sendPasswordResetEmail, sendVerificationEmail, emailConfigured } = require('../email');
const { rateLimit } = require('../rateLimit');

const router = express.Router();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Set SIGNUP_DISABLED=true to close registration, or SIGNUP_INVITE_CODE=<secret>
// to require an invite code. Neither set means open registration.
const SIGNUP_DISABLED = process.env.SIGNUP_DISABLED === 'true';
const SIGNUP_INVITE_CODE = process.env.SIGNUP_INVITE_CODE || '';

// Email verification is only enforced when an email provider is actually
// configured — otherwise nobody could ever verify, and signup would be a trap.
const VERIFY_EMAILS = emailConfigured();

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function appUrl() {
  return process.env.APP_URL || 'http://localhost:5173';
}

async function issueVerification(userId, email) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sql`
    UPDATE users SET verify_token_hash = ${hashToken(rawToken)}, verify_token_expires = ${expires} WHERE id = ${userId}
  `;
  await sendVerificationEmail(email, `${appUrl()}/verify-email?token=${rawToken}`);
}

router.get('/config', (req, res) => {
  res.json({
    signupEnabled: !SIGNUP_DISABLED,
    inviteRequired: !SIGNUP_DISABLED && Boolean(SIGNUP_INVITE_CODE),
    verificationRequired: VERIFY_EMAILS
  });
});

router.post(
  '/signup',
  rateLimit([{ scope: 'signup', by: 'ip', max: 8, windowMinutes: 60 }]),
  async (req, res, next) => {
    try {
      if (SIGNUP_DISABLED) {
        return res.status(403).json({ error: 'Registration is closed on this instance.' });
      }
      const { email, password, inviteCode } = req.body;
      if (SIGNUP_INVITE_CODE && !timingSafeEqual(inviteCode || '', SIGNUP_INVITE_CODE)) {
        await res.locals.recordAuthFailure?.();
        return res.status(403).json({ error: 'That invite code is not valid.' });
      }
      if (!email || !password || password.length < 8) {
        return res.status(400).json({ error: 'Email and a password of at least 8 characters are required' });
      }
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'That email address does not look valid.' });
      }
      const [existing] = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`;
      if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

      await res.locals.recordAuthFailure?.(); // signups count toward the per-IP cap

      const id = crypto.randomUUID();
      await sql`
        INSERT INTO users (id, email, password_hash, created_at, email_verified)
        VALUES (${id}, ${normalizedEmail}, ${hashPassword(password)}, ${new Date().toISOString()}, ${!VERIFY_EMAILS})
      `;
      await seedDefaultCategories(id);

      if (VERIFY_EMAILS) {
        await issueVerification(id, normalizedEmail);
        return res.status(201).json({ pendingVerification: true, email: normalizedEmail });
      }

      const token = createToken(id, 0);
      res.cookie(COOKIE_NAME, token, cookieOptions);
      res.status(201).json({ id, email: normalizedEmail });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  rateLimit([
    { scope: 'login', by: 'email', max: 8, windowMinutes: 15 },
    { scope: 'login', by: 'ip', max: 30, windowMinutes: 15 }
  ]),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
      const normalizedEmail = String(email).trim().toLowerCase();
      const [user] = await sql`SELECT * FROM users WHERE email = ${normalizedEmail}`;
      if (!user || !verifyPassword(password, user.password_hash)) {
        await res.locals.recordAuthFailure?.();
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (VERIFY_EMAILS && !user.email_verified) {
        return res.status(403).json({ error: 'Please verify your email first.', pendingVerification: true });
      }
      const token = createToken(user.id, user.token_version);
      res.cookie(COOKIE_NAME, token, cookieOptions);
      res.json({ id: user.id, email: user.email });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'A verification token is required' });
    const [user] = await sql`
      SELECT * FROM users WHERE verify_token_hash = ${hashToken(token)} AND verify_token_expires > now()
    `;
    if (!user) return res.status(400).json({ error: 'This verification link is invalid or has expired.' });

    await sql`
      UPDATE users SET email_verified = true, verify_token_hash = NULL, verify_token_expires = NULL WHERE id = ${user.id}
    `;
    const authToken = createToken(user.id, user.token_version);
    res.cookie(COOKIE_NAME, authToken, cookieOptions);
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/resend-verification',
  rateLimit([{ scope: 'resend', by: 'email', max: 3, windowMinutes: 60 }]),
  async (req, res, next) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });
      await res.locals.recordAuthFailure?.();
      const normalizedEmail = String(email).trim().toLowerCase();
      const [user] = await sql`SELECT id, email_verified FROM users WHERE email = ${normalizedEmail}`;
      if (user && !user.email_verified && VERIFY_EMAILS) {
        await issueVerification(user.id, normalizedEmail);
      }
      // Same response either way, so this can't be used to discover accounts.
      res.json({ message: 'If that account needs verification, a new link is on its way.' });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.status(204).end();
});

router.post('/forgot-password', rateLimit([
  { scope: 'forgot', by: 'email', max: 5, windowMinutes: 60 },
  { scope: 'forgot', by: 'ip', max: 15, windowMinutes: 60 }
]), async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    await res.locals.recordAuthFailure?.();
    const normalizedEmail = String(email).trim().toLowerCase();
    const [user] = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`;

    // Always respond the same way whether or not the account exists, so this
    // endpoint can't be used to discover which emails have accounts.
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await sql`
        UPDATE users SET reset_token_hash = ${hashToken(rawToken)}, reset_token_expires = ${expires} WHERE id = ${user.id}
      `;
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
      await sendPasswordResetEmail(normalizedEmail, resetUrl);
    }

    res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 8) {
      return res.status(400).json({ error: 'A token and a password of at least 8 characters are required' });
    }
    const [user] = await sql`
      SELECT * FROM users WHERE reset_token_hash = ${hashToken(token)} AND reset_token_expires > now()
    `;
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired' });

    await sql`
      UPDATE users
      SET password_hash = ${hashPassword(password)},
          reset_token_hash = NULL,
          reset_token_expires = NULL,
          token_version = token_version + 1
      WHERE id = ${user.id}
    `;

    // Every session minted before this point is now invalid, so whoever
    // triggered the reset is the only one still signed in.
    const [updated] = await sql`SELECT token_version FROM users WHERE id = ${user.id}`;
    const authToken = createToken(user.id, updated.token_version);
    res.cookie(COOKIE_NAME, authToken, cookieOptions);
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

const USER_TABLES = [
  'transactions',
  'budgets',
  'bills',
  'goals',
  'account_snapshots',
  'accounts',
  'categories'
];

// Everything the account holds, in one file. Pairs with deletion: people should
// be able to take their data with them before removing it.
router.get('/export', requireAuth, async (req, res, next) => {
  try {
    const data = { exportedAt: new Date().toISOString(), email: req.user.email };
    for (const table of USER_TABLES) {
      data[table] = await sql(`SELECT * FROM ${table} WHERE user_id = $1`, [req.userId]);
    }
    res.setHeader('Content-Disposition', `attachment; filename="wealthline-export-${Date.now()}.json"`);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/sign-out-everywhere', requireAuth, async (req, res, next) => {
  try {
    await sql`UPDATE users SET token_version = token_version + 1 WHERE id = ${req.userId}`;
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    const [user] = await sql`SELECT password_hash FROM users WHERE id = ${req.userId}`;
    if (!user || !password || !verifyPassword(password, user.password_hash)) {
      return res.status(403).json({ error: 'Enter your current password to delete your account.' });
    }
    for (const table of USER_TABLES) {
      await sql(`DELETE FROM ${table} WHERE user_id = $1`, [req.userId]);
    }
    await sql`DELETE FROM users WHERE id = ${req.userId}`;
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [user] = await sql`SELECT id, email FROM users WHERE id = ${req.userId}`;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
