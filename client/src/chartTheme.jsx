import React from 'react';

// Categorical slots, fixed order, never cycled. Validated for CVD separation and
// contrast against both the light (#ffffff) and dark (#111113) card surfaces.
export const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];

export const axisProps = {
  tick: { fill: 'var(--axis)', fontSize: 11 },
  axisLine: false,
  tickLine: false
};

// Solid hairline grid, one shade off the surface — never dashed.
export const gridProps = {
  stroke: 'var(--grid)',
  strokeDasharray: '0',
  vertical: false
};

export function money(n, { compact = false } = {}) {
  if (compact) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `$${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
    return `$${Math.round(n)}`;
  }
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function ChartTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tooltip">
      {label !== undefined && (
        <div className="chart-tooltip-label">{labelFormatter ? labelFormatter(label) : label}</div>
      )}
      {payload.map((entry, i) => (
        <div className="chart-tooltip-row" key={i}>
          <span className="swatch" style={{ background: entry.color || entry.payload?.color }} />
          <span className="name">{entry.name}</span>
          <span className="value">{money(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}
