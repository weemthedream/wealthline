import React, { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, FileSpreadsheet, ArrowLeft, Check, AlertTriangle, X } from 'lucide-react';
import { api } from '../api.js';

const money = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

/* ---------- parsing helpers ---------- */

// Bank exports use every date format under the sun. Normalise to YYYY-MM-DD.
function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // US-style MM/DD/YYYY (the dominant convention in US bank exports)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    let [, mm, dd, yy] = m;
    if (yy.length === 2) yy = Number(yy) > 70 ? `19${yy}` : `20${yy}`;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

// Handles "$1,234.56", "(45.00)" for negatives, and stray whitespace.
function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  let s = String(raw).trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/[^0-9.]/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return negative ? -n : n;
}

const guess = (headers, patterns) =>
  headers.find((h) => patterns.some((p) => p.test(h.toLowerCase().trim()))) || '';

/* ---------- component ---------- */

export default function ImportCsv({ categories, onClose, onImported }) {
  const [step, setStep] = useState('upload'); // upload | map | preview | done
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({ date: '', description: '', amount: '', debit: '', credit: '' });
  const [amountMode, setAmountMode] = useState('single'); // single | split
  const [negativeMeans, setNegativeMeans] = useState('expense'); // expense | income
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const expenseCats = categories.filter((c) => c.type === 'expense');
  const incomeCats = categories.filter((c) => c.type === 'income');
  const fallbackExpense = expenseCats.find((c) => /other/i.test(c.name)) || expenseCats[0];
  const fallbackIncome = incomeCats.find((c) => /other/i.test(c.name)) || incomeCats[0];

  // Guess a category from the description, preferring names the user actually has.
  const categorise = useMemo(() => {
    const rules = categories.map((c) => ({
      id: c.id,
      type: c.type,
      test: new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).join('|'), 'i')
    }));
    const keywordRules = [
      [/safeway|kroger|trader joe|whole foods|aldi|publix|grocer|wegmans|costco|walmart/i, /grocer/i],
      [/uber eats|doordash|grubhub|starbucks|chipotle|mcdonald|restaurant|cafe|coffee|pizza/i, /dining/i],
      [/uber|lyft|shell|chevron|exxon|bp |gas |parking|transit|metro/i, /transport/i],
      [/netflix|spotify|hulu|disney|cinema|steam|playstation|xbox/i, /entertain/i],
      [/rent|landlord|property manage/i, /rent|housing/i],
      [/comcast|xfinity|verizon|at&t|t-mobile|electric|water|utility|pg&e/i, /utilit/i],
      [/payroll|direct dep|salary|paycheck/i, /salary/i]
    ];
    return (description, type) => {
      const text = description || '';
      for (const [descPattern, catPattern] of keywordRules) {
        if (descPattern.test(text)) {
          const hit = categories.find((c) => c.type === type && catPattern.test(c.name));
          if (hit) return hit.id;
        }
      }
      const direct = rules.find((r) => r.type === type && r.test.test(text));
      if (direct) return direct.id;
      return (type === 'income' ? fallbackIncome : fallbackExpense)?.id || '';
    };
  }, [categories, fallbackExpense, fallbackIncome]);

  const handleFile = (file) => {
    if (!file) return;
    setError('');
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (res) => {
        const cols = (res.meta.fields || []).filter(Boolean);
        if (cols.length === 0 || res.data.length === 0) {
          setError("That file didn't look like a CSV with a header row.");
          return;
        }
        setHeaders(cols);
        setRawRows(res.data);
        const debit = guess(cols, [/^debit$/, /withdrawal/, /money out/]);
        const credit = guess(cols, [/^credit$/, /deposit/, /money in/]);
        setMapping({
          date: guess(cols, [/date|posted|transaction date/]),
          description: guess(cols, [/description|memo|payee|name|details|merchant/]),
          amount: guess(cols, [/^amount$/, /amount/]),
          debit,
          credit
        });
        setAmountMode(debit && credit ? 'split' : 'single');
        setStep('map');
      },
      error: (err) => setError(`Couldn't read that file: ${err.message}`)
    });
  };

  const buildPreview = () => {
    const out = [];
    const problems = [];
    rawRows.forEach((r, i) => {
      const date = parseDate(r[mapping.date]);
      const description = String(r[mapping.description] ?? '').trim();

      let signed = null;
      if (amountMode === 'split') {
        const d = parseAmount(r[mapping.debit]);
        const c = parseAmount(r[mapping.credit]);
        if (d) signed = -Math.abs(d);
        else if (c) signed = Math.abs(c);
      } else {
        signed = parseAmount(r[mapping.amount]);
      }

      if (!date || signed === null || signed === 0) {
        problems.push(i + 1);
        return;
      }

      const isExpense = negativeMeans === 'expense' ? signed < 0 : signed > 0;
      const type = isExpense ? 'expense' : 'income';
      out.push({
        key: `${i}`,
        date,
        description,
        amount: Math.abs(signed),
        type,
        categoryId: categorise(description, type),
        include: true
      });
    });

    if (out.length === 0) {
      setError('No usable rows found — check the column mapping above.');
      return;
    }
    setError(problems.length ? `${problems.length} row(s) were skipped as unreadable.` : '');
    setRows(out);
    setStep('preview');
  };

  const updateRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const doImport = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = rows
        .filter((r) => r.include && r.categoryId)
        .map(({ date, amount, type, categoryId, description }) => ({ date, amount, type, categoryId, description }));
      const res = await api.importTransactions(payload);
      setResult(res);
      setStep('done');
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const includedCount = rows.filter((r) => r.include).length;
  const totals = rows.reduce(
    (acc, r) => {
      if (!r.include) return acc;
      if (r.type === 'income') acc.income += r.amount;
      else acc.expense += r.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );

  return (
    <div className="overlay center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="import-modal">
        <div className="drawer-head">
          <h3>Import transactions</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {step === 'upload' && (
          <div>
            <button className="dropzone" onClick={() => fileInput.current?.click()}>
              <Upload size={26} strokeWidth={1.5} />
              <strong>Choose a CSV file</strong>
              <span className="empty-hint">
                Export transactions from your bank or credit card app, then pick the file here.
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <p className="chart-note">
              Nothing is uploaded anywhere else — the file is read in your browser and only the rows you approve are
              saved to your account.
            </p>
          </div>
        )}

        {step === 'map' && (
          <div>
            <p className="empty-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 0 }}>
              <FileSpreadsheet size={14} /> {fileName} · {rawRows.length} rows
            </p>

            <div className="form-row">
              <label className="grow">
                Date column
                <select value={mapping.date} onChange={(e) => setMapping({ ...mapping, date: e.target.value })}>
                  <option value="">Select…</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
              <label className="grow">
                Description column
                <select
                  value={mapping.description}
                  onChange={(e) => setMapping({ ...mapping, description: e.target.value })}
                >
                  <option value="">Select…</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label>
                Amount format
                <select value={amountMode} onChange={(e) => setAmountMode(e.target.value)}>
                  <option value="single">One amount column</option>
                  <option value="split">Separate debit / credit columns</option>
                </select>
              </label>

              {amountMode === 'single' ? (
                <>
                  <label className="grow">
                    Amount column
                    <select value={mapping.amount} onChange={(e) => setMapping({ ...mapping, amount: e.target.value })}>
                      <option value="">Select…</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Negative amounts are
                    <select value={negativeMeans} onChange={(e) => setNegativeMeans(e.target.value)}>
                      <option value="expense">Spending (most banks)</option>
                      <option value="income">Income (some cards)</option>
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label className="grow">
                    Debit (money out)
                    <select value={mapping.debit} onChange={(e) => setMapping({ ...mapping, debit: e.target.value })}>
                      <option value="">Select…</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grow">
                    Credit (money in)
                    <select value={mapping.credit} onChange={(e) => setMapping({ ...mapping, credit: e.target.value })}>
                      <option value="">Select…</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            <div className="form-actions">
              <button
                className="primary-btn"
                onClick={buildPreview}
                disabled={!mapping.date || (amountMode === 'single' ? !mapping.amount : !mapping.debit && !mapping.credit)}
              >
                Preview {rawRows.length} rows
              </button>
              <button className="secondary-btn" onClick={() => setStep('upload')}>
                <ArrowLeft size={14} />
                Back
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div>
            <div className="import-summary">
              <span>
                <strong>{includedCount}</strong> of {rows.length} selected
              </span>
              <span className="text-income">+{money(totals.income)}</span>
              <span className="text-expense">-{money(totals.expense)}</span>
            </div>

            <div className="import-rows">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}></th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th className="align-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} style={{ opacity: r.include ? 1 : 0.4 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => updateRow(r.key, { include: e.target.checked })}
                          aria-label="Include this row"
                        />
                      </td>
                      <td>{r.date}</td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.description}
                      </td>
                      <td>
                        <select
                          value={r.categoryId}
                          onChange={(e) => updateRow(r.key, { categoryId: e.target.value })}
                          style={{ maxWidth: 170 }}
                        >
                          {(r.type === 'income' ? incomeCats : expenseCats).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className={`align-right ${r.type === 'income' ? 'text-income' : 'text-expense'}`}>
                        {r.type === 'income' ? '+' : '-'}
                        {money(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="primary-btn" onClick={doImport} disabled={busy || includedCount === 0}>
                {busy ? 'Importing…' : `Import ${includedCount} transactions`}
              </button>
              <button className="secondary-btn" onClick={() => setStep('map')} disabled={busy}>
                <ArrowLeft size={14} />
                Back
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="import-done">
            <div className="import-done-icon">
              <Check size={26} />
            </div>
            <h3>Imported {result.imported} transactions</h3>
            {result.skipped > 0 && (
              <p className="empty-hint">
                <AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> {result.skipped} already existed and were
                skipped.
              </p>
            )}
            {result.errors?.length > 0 && (
              <p className="empty-hint">{result.errors.length} row(s) couldn't be read.</p>
            )}
            <div className="form-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="primary-btn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
