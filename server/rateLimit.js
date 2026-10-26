const crypto = require('crypto');
const { sql } = require('./database');

// Serverless instances don't share memory, so attempts are counted in Postgres.
// Buckets are hashed: they contain emails and IPs, and this table has a much
// longer retention than it needs identifying data for.
function bucketKey(scope, identifier) {
  return `${scope}:${crypto.createHash('sha256').update(String(identifier).toLowerCase()).digest('hex').slice(0, 32)}`;
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.ip || 'unknown';
}

async function countRecent(bucket, windowMinutes) {
  const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const [row] = await sql`
    SELECT COUNT(*)::int AS count FROM auth_attempts WHERE bucket = ${bucket} AND created_at > ${cutoff}
  `;
  return row?.count ?? 0;
}

async function recordAttempt(bucket) {
  await sql`INSERT INTO auth_attempts (id, bucket) VALUES (${crypto.randomUUID()}, ${bucket})`;
  // Opportunistic cleanup so the table doesn't grow without bound.
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    await sql`DELETE FROM auth_attempts WHERE created_at < ${cutoff}`;
  }
}

/**
 * Express middleware. Checks every configured limit before the handler runs;
 * the handler calls res.locals.recordAuthFailure() when an attempt actually
 * fails, so successful logins never count toward a lockout.
 */
function rateLimit(rules) {
  return async (req, res, next) => {
    try {
      const buckets = rules
        .map((rule) => {
          const identifier = rule.by === 'ip' ? clientIp(req) : req.body?.[rule.by];
          if (!identifier) return null;
          return { ...rule, bucket: bucketKey(`${rule.scope}:${rule.by}`, identifier) };
        })
        .filter(Boolean);

      for (const b of buckets) {
        if ((await countRecent(b.bucket, b.windowMinutes)) >= b.max) {
          return res.status(429).json({
            error: `Too many attempts. Please wait ${b.windowMinutes} minutes and try again.`
          });
        }
      }

      res.locals.recordAuthFailure = () => Promise.all(buckets.map((b) => recordAttempt(b.bucket)));
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { rateLimit, clientIp };
