// Monthly recap emails: opt-in setting, on-demand download/send, one-click
// unsubscribe, and the scheduled job that sends last month's recap.

const crypto = require('crypto');
const express = require('express');
const { sql } = require('../database');
const { requireAuth } = require('../auth');
const { rateLimit } = require('../rateLimit');
const { sendEmail, emailConfigured } = require('../email');
const {
  loadMonthData,
  buildRecapWorkbook,
  renderRecapEmail,
  recapFilename,
  shiftMonth
} = require('../recap/monthlyReport');

const router = express.Router();

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const BATCH = 25;

function appUrl() {
  return process.env.APP_URL || 'http://localhost:5173';
}

function currentMonthUtc() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Unsubscribe links carry a signature instead of requiring sign-in.
function unsubscribeToken(userId) {
  return crypto.createHmac('sha256', SECRET).update(`recap-unsub:${userId}`).digest('hex').slice(0, 40);
}

function unsubscribeUrl(userId) {
  const base = process.env.API_URL || appUrl();
  return `${base}/api/reports/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}

function validUnsub(u, t) {
  if (!u || !t || typeof u !== 'string' || typeof t !== 'string') return false;
  const expected = Buffer.from(unsubscribeToken(u));
  const given = Buffer.from(t);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

async function sendRecap(user, month) {
  const report = await loadMonthData(sql, user.id, month);
  if (report.count === 0) return { sent: false, reason: 'empty' };
  const xlsx = buildRecapWorkbook(report);
  const unsub = unsubscribeUrl(user.id);
  await sendEmail({
    to: user.email,
    subject: `Your ${report.monthLabel} money recap`,
    html: renderRecapEmail(report, { appUrl: appUrl(), unsubscribeUrl: unsub }),
    attachments: [{ filename: recapFilename(report), content: xlsx.toString('base64') }],
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  });
  return { sent: true };
}

// ---------- signed-in routes ----------
router.get('/preferences', requireAuth, async (req, res, next) => {
  try {
    const [row] = await sql`SELECT monthly_recap FROM users WHERE id = ${req.userId}`;
    res.json({ monthlyRecap: !!row?.monthly_recap, emailConfigured: emailConfigured() });
  } catch (err) {
    next(err);
  }
});

router.put('/preferences', requireAuth, async (req, res, next) => {
  try {
    const on = !!req.body?.monthlyRecap;
    await sql`UPDATE users SET monthly_recap = ${on} WHERE id = ${req.userId}`;
    res.json({ monthlyRecap: on, emailConfigured: emailConfigured() });
  } catch (err) {
    next(err);
  }
});

// The same workbook the email attaches, for any month.
router.get('/monthly.xlsx', requireAuth, async (req, res, next) => {
  try {
    const month = MONTH_RE.test(req.query.month || '') ? req.query.month : currentMonthUtc();
    const report = await loadMonthData(sql, req.userId, month);
    const buf = buildRecapWorkbook(report);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${recapFilename(report).replace(/"/g, '')}"`);
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/monthly/send',
  requireAuth,
  (req, res, next) => {
    req.body = { ...(req.body || {}), recapUser: req.userId };
    next();
  },
  rateLimit([{ scope: 'recap-send', by: 'recapUser', max: 3, windowMinutes: 60 }]),
  async (req, res, next) => {
    try {
      const month = MONTH_RE.test(req.body.month || '') ? req.body.month : currentMonthUtc();
      const result = await sendRecap({ id: req.userId, email: req.user.email }, month);
      await res.locals.recordAuthFailure?.(); // counts toward the hourly limit
      if (!result.sent) return res.status(400).json({ error: 'There are no transactions in that month to recap yet.' });
      res.json({ sent: true, delivered: emailConfigured(), to: req.user.email });
    } catch (err) {
      next(err);
    }
  }
);

// ---------- unsubscribe (no sign-in) ----------
function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;background:#F6F5F2;color:#1C1B19;margin:0;padding:48px 16px;">
<div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #E4E1DB;border-radius:12px;padding:28px;">${body}</div></body></html>`;
}

// GET shows a button rather than unsubscribing, because mail scanners open links.
router.get('/unsubscribe', (req, res) => {
  const { u, t } = req.query;
  if (!validUnsub(u, t))
    return res
      .status(400)
      .send(
        page(
          'Link not valid',
          '<h1 style="font-size:20px">This link is not valid</h1><p>Turn monthly recaps off from Settings in Wealthline instead.</p>'
        )
      );
  const action = `/api/reports/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`;
  res.send(
    page(
      'Turn off monthly recaps',
      `<h1 style="font-size:20px;margin:0 0 8px">Turn off monthly recaps?</h1>
<p style="color:#57534D">You'll stop getting the monthly email. You can turn it back on any time in Wealthline settings.</p>
<form method="post" action="${action}"><button type="submit" style="background:#4F46E5;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-weight:600;font-size:14px;cursor:pointer">Turn off</button></form>`
    )
  );
});

// POST handles both the button above and one-click unsubscribe from mail apps.
router.post('/unsubscribe', express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const { u, t } = req.query;
    if (!validUnsub(u, t))
      return res.status(400).send(page('Link not valid', '<h1 style="font-size:20px">This link is not valid</h1>'));
    await sql`UPDATE users SET monthly_recap = false WHERE id = ${u}`;
    res.send(
      page(
        'Monthly recaps turned off',
        `<h1 style="font-size:20px;margin:0 0 8px">Monthly recaps are off</h1><p style="color:#57534D">You won't get them any more. <a href="${appUrl()}" style="color:#4F46E5">Back to Wealthline</a></p>`
      )
    );
  } catch (err) {
    next(err);
  }
});

// ---------- scheduled job ----------
// Vercel Cron calls this on the 1st–3rd of each month (see vercel.json) with
// "Authorization: Bearer $CRON_SECRET". Each run sends up to BATCH recaps for
// last month; users already sent are skipped, so later runs pick up the rest.
router.get('/cron/monthly', async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const month = shiftMonth(currentMonthUtc(), -1);
    const users = await sql`
      SELECT id, email FROM users
      WHERE monthly_recap = true AND email_verified = true
        AND (last_recap_month IS NULL OR last_recap_month < ${month})
      ORDER BY id
      LIMIT ${BATCH}
    `;
    const result = { month, sent: 0, skippedEmpty: 0, failed: 0 };
    for (const user of users) {
      try {
        const r = await sendRecap(user, month);
        if (r.sent) result.sent++;
        else result.skippedEmpty++;
        await sql`UPDATE users SET last_recap_month = ${month} WHERE id = ${user.id}`;
      } catch (err) {
        console.error(`[recap] failed for user ${user.id}:`, err.message);
        result.failed++;
      }
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
