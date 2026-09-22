import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Plus, X } from 'lucide-react';
import { ChartTooltip, axisProps, gridProps, money, SERIES } from '../chartTheme.jsx';

const YEAR_ROWS = [5, 10, 15, 20, 25, 30, 35, 40];
const MAX_YEARS = 40;
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

const seriesKey = (i) => `s${i}`;

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
    if (contributions.length >= SERIES.length) return;
    const last = contributions[contributions.length - 1] || 1000;
    setContributions([...contributions, last + 1000]);
  };

  const removeColumn = (index) => {
    if (contributions.length <= 1) return;
    setContributions(contributions.filter((_, i) => i !== index));
  };

  const numericRate = Number(rate) || 0;
  const numericStart = Number(startingBalance) || 0;

  const rows = useMemo(
    () =>
      YEAR_ROWS.map((years) => ({
        years,
        values: contributions.map((c) => futureValue(numericStart, c, numericRate, years))
      })),
    [contributions, numericRate, numericStart]
  );

  // One point per year so the compounding curve reads smoothly.
  const chartData = useMemo(() => {
    const points = [];
    for (let year = 0; year <= MAX_YEARS; year++) {
      const point = { year };
      contributions.forEach((c, i) => {
        point[seriesKey(i)] = futureValue(numericStart, c, numericRate, year);
      });
      points.push(point);
    }
    return points;
  }, [contributions, numericRate, numericStart]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Roth IRA Growth</h3>
          <p className="empty-hint" style={{ margin: 0 }}>
            Projected value at different annual contribution levels, compounded yearly.
          </p>
        </div>
        <button className="secondary-btn" onClick={addColumn} disabled={contributions.length >= SERIES.length}>
          <Plus size={14} />
          Add scenario
        </button>
      </div>

      <div className="form-row" style={{ marginTop: 16 }}>
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

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="year"
            {...axisProps}
            ticks={[0, 5, 10, 15, 20, 25, 30, 35, 40]}
            tickFormatter={(v) => (v === 0 ? 'Now' : `${v}y`)}
          />
          <YAxis {...axisProps} width={56} tickFormatter={(v) => money(v, { compact: true })} />
          <Tooltip
            content={<ChartTooltip />}
            labelFormatter={(y) => (y === 0 ? 'Today' : `After ${y} year${y === 1 ? '' : 's'}`)}
            cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
          />
          <Legend iconType="line" iconSize={14} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {contributions.map((c, i) => (
            <Line
              key={i}
              type="monotone"
              dataKey={seriesKey(i)}
              name={`$${c.toLocaleString()}/yr`}
              stroke={SERIES[i]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="scroll-x" style={{ marginTop: 18 }}>
        <table className="data-table tvm-table">
          <thead>
            <tr>
              <th>Years</th>
              {contributions.map((c, i) => (
                <th key={i}>
                  <div className="tvm-col-head">
                    <span className="tvm-swatch" style={{ background: SERIES[i] }} />
                    <input
                      type="number"
                      min="0"
                      step="500"
                      className="tvm-header-input"
                      value={c}
                      onChange={(e) => updateContribution(i, e.target.value)}
                      aria-label={`Annual contribution for scenario ${i + 1}`}
                    />
                    <span className="tvm-col-suffix">/yr</span>
                    {contributions.length > 1 && (
                      <button
                        className="link-btn danger tvm-remove-col"
                        onClick={() => removeColumn(i)}
                        title="Remove scenario"
                        aria-label="Remove scenario"
                      >
                        <X size={12} />
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
                <td>{row.years}</td>
                {row.values.map((v, i) => (
                  <td key={i} className="align-right">
                    {money(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="chart-note">
        Assumes contributions are made at the end of each year and grow at a fixed {numericRate}% annual rate — a
        simplified projection, not a guarantee of investment returns. Roth IRA contribution limits apply in real
        accounts.
      </p>
    </div>
  );
}
