const express = require('express');
const crypto = require('crypto');
const { sql, seedDefaultCategories } = require('../database');
const { hashPassword, verifyPassword, createToken, requireAuth, COOKIE_NAME, cookieOptions } = require('../auth');

const router = express.Router();

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: 'Email and a password of at least 8 characters are required' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`;
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

    const id = crypto.randomUUID();
    await sql`
      INSERT INTO users (id, email, password_hash, created_at)
      VALUES (${id}, ${normalizedEmail}, ${hashPassword(password)}, ${new Date().toISOString()})
    `;
    await seedDefaultCategories(id);

    const token = createToken(id);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.status(201).json({ id, email: normalizedEmail });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const normalizedEmail = String(email).trim().toLowerCase();
    const [user] = await sql`SELECT * FROM users WHERE email = ${normalizedEmail}`;
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = createToken(user.id);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.status(204).end();
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
