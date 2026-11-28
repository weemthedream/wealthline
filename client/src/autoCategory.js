// Auto-categorisation shared by the Add form and CSV import.
//
// Order of trust:
//   1. History: what this user picked for the same merchant before (learns from
//      every edit, so it gets better the more you use it).
//   2. Keywords: a built-in list of well-known merchants (works on day one).
//   3. Name match: description mentions one of the user's category names.

// Turn "SQ *STARBUCKS #1234 SEATTLE WA" and "Starbucks 5678" into "starbucks".
export function merchantKey(description) {
  if (!description) return '';
  let s = String(description).toLowerCase();
  s = s.replace(/^(pos|debit card purchase|debit|purchase|recurring|ach|card)\s+/g, '');
  s = s.replace(/^(sq|tst|sp|py|pp|paypal|in|dd)\s*\*\s*/g, '');
  s = s.replace(/[#*].*$/, ' ');
  s = s.replace(/\d+/g, ' ');
  s = s.replace(/[^a-z&' ]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const words = s.split(' ').filter((w) => w.length > 1);
  return words.slice(0, 2).join(' ');
}

// Keys to remember a merchant by: the two-word key ("uber eats") and, as a
// looser fallback, its first word ("starbucks seattle" -> "starbucks").
function keysFor(description) {
  const key = merchantKey(description);
  if (!key) return [];
  const first = key.split(' ')[0];
  return first !== key ? [key, `~${first}`] : [key];
}

// Most-used category per merchant from the user's own past transactions.
export function learnFromHistory(transactions) {
  const counts = new Map();
  for (const t of transactions) {
    for (const key of keysFor(t.description)) {
      const bucketKey = `${t.type}|${key}`;
      if (!counts.has(bucketKey)) counts.set(bucketKey, new Map());
      const byCat = counts.get(bucketKey);
      byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + 1);
    }
  }
  const learned = new Map();
  for (const [bucketKey, byCat] of counts) {
    let best = null;
    let total = 0;
    for (const [categoryId, n] of byCat) {
      total += n;
      if (!best || n > best.count) best = { categoryId, count: n };
    }
    learned.set(bucketKey, { ...best, total });
  }
  return learned;
}

const KEYWORD_RULES = [
  [
    /safeway|kroger|trader joe|whole foods|aldi|publix|grocer|wegmans|costco|walmart|meijer|target|h-e-b|heb\b/i,
    /grocer/i
  ],
  [
    /uber eats|doordash|grubhub|starbucks|chipotle|mcdonald|restaurant|cafe|coffee|pizza|taco|burger|subway|panera|chick-fil/i,
    /dining|restaurant|food/i
  ],
  [
    /uber|lyft|shell|chevron|exxon|marathon|speedway|bp |gas |fuel|parking|transit|metro|amtrak/i,
    /transport|car|fuel/i
  ],
  [/netflix|spotify|hulu|disney|cinema|amc |steam|playstation|xbox|nintendo|ticketmaster/i, /entertain/i],
  [/rent|landlord|property manage|apartments/i, /rent|housing/i],
  [/comcast|xfinity|verizon|at&t|t-mobile|electric|water|utility|pg&e|consumers energy|dte/i, /utilit|phone|internet/i],
  [/amazon|amzn|etsy|ebay|best buy|ikea/i, /shopping/i],
  [/cvs|walgreens|pharmacy|doctor|dental|clinic|hospital/i, /health|medical/i],
  [/payroll|direct dep|salary|paycheck/i, /salary|paycheck|income/i]
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns { categoryId, source, merchant, count } or null when there's no guess.
export function suggestCategory(description, type, categories, learned) {
  const merchant = merchantKey(description);
  if (!description || !description.trim()) return null;

  if (merchant && learned) {
    const first = merchant.split(' ')[0];
    const hit =
      learned.get(`${type}|${merchant}`) || learned.get(`${type}|~${first}`) || learned.get(`${type}|${first}`);
    if (hit && categories.some((c) => c.id === hit.categoryId)) {
      return { categoryId: hit.categoryId, source: 'history', merchant, count: hit.total };
    }
  }

  for (const [descPattern, catPattern] of KEYWORD_RULES) {
    if (descPattern.test(description)) {
      const cat = categories.find((c) => c.type === type && catPattern.test(c.name));
      if (cat) return { categoryId: cat.id, source: 'keyword', merchant };
    }
  }

  for (const c of categories) {
    if (c.type !== type) continue;
    const words = c.name.split(/\s+/).filter((w) => w.length > 2);
    if (words.length && new RegExp(`\\b(${words.map(escapeRe).join('|')})`, 'i').test(description)) {
      return { categoryId: c.id, source: 'name', merchant };
    }
  }
  return null;
}
