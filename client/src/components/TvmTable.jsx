import React, { useMemo, useState } from 'react';

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const YEAR_ROWS = [5, 10, 15, 20, 25, 30, 35, 40];
const DEFAULT_CONTRIBUTIONS = [3000, 5000, 7000, 10000];

// Future value of a starting balance plus a fixed contribution made at the end
// of each year, compounded annually.
function futureValue(startingBalance, annualContribution, ratePct, years) {
  const r = ratePct / 100;
  const growth = Math.pow(1 + r, years);
  const fromStart = startingBalance * growth;
  const fromContributions = r === 0 ? annualContribution * years : annualContribution * ((growth - 1) / r);
  return fromStart + fromContributions;
}

export default function TvmTable() {
  const [rate, setRate] = useState(8);
  const [startingBalance, setStartingBalance] = useState(0);
  const [contributions, setContributions] = useState(DEFAULT_CONTRIBUTIONS);

  const updateContribution = (index, value) => {
    const next = [...contributions];
    next[index] = Number(value) || 0;
    setContributions(next);
  };

  const addColumn = () => {
    if (contributions.length >= 6) return;
    const last = contributions[contributions.length - 1] || 1000;
    setContributions([...contributions, last + 1000]);
  };

  const removeColumn = (index) => {
    if (contributions.length <= 1) return;
    setContributions(contributions.filter((_, i) => i !== index));
  };

  const rows = useMemo(
    () =>
      YEAR_ROWS.map((years) => ({
        years,
        values: contributions.map((c) => futureValue(Number(startingBalance) || 0, c, Number(rate) || 0, years))
      })),
    [contributions, rate, startingBalance]
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3 style={{ marginBottom: 2 }}>Roth IRA Growth Table</h3>
          <p className="empty-hint" style={{ margin: 0 }}>
            Future value at different annual contribution levels, compounded yearly.
          </p>
        </div>
        <button className="secondary-btn" onClick={addColumn} disabled={contributions.length >= 6}>
          + Add Column
        </button>
      </div>

      <div className="form-row" style={{ marginTop: 14 }}>
        <label>
          Growth rate (%/yr)
          <input type="number" min="0" max="30" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label>
          Starting balance
          <input
            type="number"
            min="0"
            step="500"
            value={startingBalance}
            onChange={(e) => setStartingBalance(e.target.value)}
          />
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table tvm-table">
          <thead>
            <tr>
              <th>Years</th>
              {contributions.map((c, i) => (
                <th key={i}>
                  <div className="tvm-col-head">
                    <input
                      type="number"
                      min="0"
                      step="500"
                      className="tvm-header-input"
                      value={c}
                      onChange={(e) => updateContribution(i, e.target.value)}
                    />
                    <span className="tvm-col-suffix">/yr</span>
                    {contributions.length > 1 && (
                      <button className="link-btn danger tvm-remove-col" onClick={() => removeColumn(i)} title="Remove column">
                        ✕
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.years}>
                <td data-label="Years">{row.years}</td>
                {row.values.map((v, i) => (
                  <td data-label={`$${contributions[i].toLocaleString()}/yr`} key={i} className="align-right">
                    {currency(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="empty-hint" style={{ marginTop: 12, marginBottom: 0 }}>
        Assumes contributions are made at the end of each year and grow at a fixed {rate}% annual rate — a simplified
        projection, not a guarantee of investment returns. Roth IRA contribution limits apply in real accounts.
      </p>
    </div>
  );
}
