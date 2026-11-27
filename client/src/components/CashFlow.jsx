import React from 'react';
import { money } from '../chartTheme.jsx';

// A two-column flow diagram: where the month's money came from (left) and
// where it went (right). If spending beat income, the gap shows up on the left
// as a "Shortfall" node; if income beat spending, the leftover shows on the
// right as "Saved". Both columns always add up to the same total.

const W = 640;
const NODE = 10;
const RIGHT_X = 420;
const BODY_H = 300;
const GAP = 10;
const MIN_H = 2;
const LABEL_STEP = 34;

function truncate(s, n = 20) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export default function CashFlow({ income, expenses, slices }) {
  const total = Math.max(income, expenses);
  if (total <= 0) return <p className="empty-hint">No income or spending recorded this month yet.</p>;

  const right = slices.map((s) => ({ key: s.categoryId, name: s.name, color: s.color, value: s.total }));
  if (income > expenses) {
    right.push({ key: '__saved__', name: 'Saved', color: 'var(--income)', value: income - expenses });
  }

  const scale = BODY_H / total;
  let y = 0;
  const nodes = right.map((r) => {
    const h = Math.max(r.value * scale, MIN_H);
    const node = { ...r, h, y };
    y += h + GAP;
    return node;
  });
  const rightH = y - GAP;
  const bandsH = nodes.reduce((s, n) => s + n.h, 0);
  const leftTop = (rightH - bandsH) / 2;

  let ly = leftTop;
  for (const n of nodes) {
    n.ly = ly;
    ly += n.h;
  }

  const incomeH = bandsH * (Math.min(income, total) / total);
  const shortfall = expenses - income;
  const midX = (NODE + RIGHT_X) / 2;

  // Push labels down so two-line labels never overlap.
  let lastLabel = -Infinity;
  for (const n of nodes) {
    const mid = n.y + n.h / 2;
    n.labelY = Math.max(mid, lastLabel + LABEL_STEP);
    lastLabel = n.labelY;
  }
  const viewH = Math.max(rightH, lastLabel + 22);

  const pct = (v) => `${Math.round((v / total) * 100)}%`;

  return (
    <div className="cashflow-scroll">
      <svg
        className="cashflow-svg"
        viewBox={`0 -6 ${W} ${viewH + 12}`}
        role="img"
        aria-label={`Cash flow: ${money(income)} income and ${money(expenses)} spending across ${slices.length} categories`}
      >
        <g opacity="0.3">
          {nodes.map((n) => {
            const y1a = n.ly;
            const y1b = n.ly + n.h;
            const y2a = n.y;
            const y2b = n.y + n.h;
            const d = `M${NODE} ${y1a} C${midX} ${y1a},${midX} ${y2a},${RIGHT_X} ${y2a} L${RIGHT_X} ${y2b} C${midX} ${y2b},${midX} ${y1b},${NODE} ${y1b}Z`;
            return <path key={n.key} d={d} style={{ fill: n.color }} />;
          })}
        </g>

        <rect x="0" y={leftTop} width={NODE} height={incomeH} style={{ fill: 'var(--income)' }} />
        {shortfall > 0 && (
          <rect x="0" y={leftTop + incomeH} width={NODE} height={bandsH - incomeH} style={{ fill: 'var(--expense)' }} />
        )}

        {nodes.map((n) => (
          <rect key={n.key} x={RIGHT_X} y={n.y} width={NODE} height={n.h} style={{ fill: n.color }} />
        ))}

        {income > 0 && (
          <g>
            <text x={NODE + 10} y={leftTop + incomeH / 2 - 4} className="cf-label">
              Income
            </text>
            <text x={NODE + 10} y={leftTop + incomeH / 2 + 13} className="cf-value">
              {money(income)}
            </text>
          </g>
        )}
        {shortfall > 0 && (
          <text x={NODE + 10} y={leftTop + incomeH + (bandsH - incomeH) / 2 + 4} className="cf-value cf-short">
            Shortfall {money(shortfall)}
          </text>
        )}

        {nodes.map((n) => (
          <g key={n.key}>
            <text x={RIGHT_X + NODE + 12} y={n.labelY - 4} className="cf-label">
              {truncate(n.name)}
            </text>
            <text x={RIGHT_X + NODE + 12} y={n.labelY + 13} className="cf-value">
              {money(n.value)} ({pct(n.value)})
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
