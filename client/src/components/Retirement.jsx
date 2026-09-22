import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { api } from '../api.js';
import TvmTable from './TvmTable.jsx';

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function monthsBetween(from, to) {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, months);
}

// Projects month-by-month balance given a starting amount, fixed monthly contribution,
// and an assumed annual return applied monthly.
function projectSeries(current, monthlyContribution, annualReturnPct, months) {
  const r = annualReturnPct / 100 / 12;
  const series = [{ month: 0, balance: current }];
  let balance = current;
  for (let i = 1; i <= months; i++) {
    balance = balance * (1 + r) + monthlyContribution;
    series.push({ month: i, balance });
  }
  return series;
}

// Solves for the flat monthly contribution needed to reach `target` in `months` months.
function requiredMonthlyContribution(target, current, annualReturnPct, months) {
  const r = annualReturnPct / 100 / 12;
  if (months <= 0) return Math.max(0, target - current);
  const growthFactor = Math.pow(1 + r, months);
  if (r === 0) return (target - current) / months;
  const futureValueOfCurrent = current * growthFactor;
  const annuityFactor = (growthFactor - 1) / r;
  return (target - futureValueOfCurrent) / annuityFactor;
}

const EMPTY_FORM = {
  name: '',
  targetAmount: '',
  targetDate: '',
  currentAmount: '',
  monthlyContribution: '',
  expectedReturnPct: '6'
};

function ProgressRing({ pct, color }) {
  const size = 88;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--surface-alt)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x="50%" y="52%" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--text)">
        {clamped.toFixed(0)}%
      </text>
    </svg>
  );
}

function GoalCard({ goal, onEdit, onDelete }) {
  const targetDate = new Date(goal.targetDate);
  const now = new Date();
  const months = monthsBetween(now, targetDate);
  const series = useMemo(
    () => projectSeries(goal.currentAmount, goal.monthlyContribution, goal.expectedReturnPct, months),
    [goal, months]
  );
  const projectedFinal = series[series.length - 1]?.balance ?? goal.currentAmount;
  const onTrack = projectedFinal >= goal.targetAmount;
  const requiredContribution = requiredMonthlyContribution(
    goal.targetAmount,
    goal.currentAmount,
    goal.expectedReturnPct,
    months
  );
  const pctToGoal = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;

  return (
    <div className="goal-card">
      <div className="goal-card-head">
        <div>
          <div className="goal-name">{goal.name}</div>
          <div className="goal-target-date">
            Target: {targetDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div className="row-actions">
          <button className="link-btn" onClick={() => onEdit(goal)}>
            Edit
          </button>
          <button className="link-btn danger" onClick={() => onDelete(goal.id)}>
            Delete
          </button>
        </div>
      </div>

      <div className="goal-ring-row">
        <ProgressRing pct={pctToGoal} color="var(--goal)" />
        <div className="goal-stats">
          <div className="goal-stat-line">
            <span>Current</span>
            <span>{currency(goal.currentAmount)}</span>
          </div>
          <div className="goal-stat-line">
            <span>Target</span>
            <span>{currency(goal.targetAmount)}</span>
          </div>
          <div className="goal-stat-line">
            <span>Monthly contribution</span>
            <span>{currency(goal.monthlyContribution)}</span>
          </div>
          <div className="goal-stat-line">
            <span>Projected at target</span>
            <span>{currency(projectedFinal)}</span>
          </div>
        </div>
      </div>

      <div className={`goal-status ${onTrack ? 'on-track' : 'behind'}`}>
        {onTrack ? '✓ On track' : `⚠ Behind — need ${currency(Math.max(0, requiredContribution))}/mo`}
      </div>

      {months > 1 && (
        <div style={{ marginTop: 14 }}>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="month" tick={false} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v) => `${Math.round(v / 1000)}k`}
              />
              <Tooltip
                formatter={(value) => currency(value)}
                labelFormatter={(m) => `Month ${m}`}
                contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
              />
              <ReferenceLine y={goal.targetAmount} stroke="var(--goal)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="balance" stroke="var(--goal)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function Retirement() {
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.getGoals().then(setGoals).catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.targetAmount || !form.targetDate) return;
    try {
      const payload = {
        name: form.name,
        targetAmount: Number(form.targetAmount),
        targetDate: form.targetDate,
        currentAmount: Number(form.currentAmount) || 0,
        monthlyContribution: Number(form.monthlyContribution) || 0,
        expectedReturnPct: Number(form.expectedReturnPct) || 0
      };
      if (editingId) {
        await api.updateGoal(editingId, payload);
      } else {
        await api.createGoal(payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (goal) => {
    setForm({
      name: goal.name,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate,
      currentAmount: goal.currentAmount,
      monthlyContribution: goal.monthlyContribution,
      expectedReturnPct: goal.expectedReturnPct
    });
    setEditingId(goal.id);
    setShowForm(true);
  };

  const remove = async (id) => {
    await api.deleteGoal(id);
    load();
  };

  return (
    <div className="retirement">
      {error && <div className="error-box">{error}</div>}

      <div className="panel-head" style={{ marginBottom: 16 }}>
        <div>
          <h3 style={{ marginBottom: 2 }}>Retirement & Savings Goals</h3>
          <p className="empty-hint" style={{ margin: 0 }}>
            Set a target and see whether your current savings pace gets you there.
          </p>
        </div>
        {!showForm && (
          <button className="primary-btn" onClick={() => setShowForm(true)}>
            + New Goal
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={submit}>
          <h3>{editingId ? 'Edit Goal' : 'New Goal'}</h3>
          <div className="form-row">
            <label className="grow">
              Goal name
              <input
                type="text"
                placeholder="e.g. Retirement, House down payment"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              Target amount
              <input
                type="number"
                min="0"
                step="1000"
                value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                required
              />
            </label>
            <label>
              Target date
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Current savings
              <input
                type="number"
                min="0"
                step="100"
                value={form.currentAmount}
                onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
              />
            </label>
            <label>
              Monthly contribution
              <input
                type="number"
                min="0"
                step="10"
                value={form.monthlyContribution}
                onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })}
              />
            </label>
            <label>
              Expected annual return (%)
              <input
                type="number"
                min="0"
                max="30"
                step="0.1"
                value={form.expectedReturnPct}
                onChange={(e) => setForm({ ...form, expectedReturnPct: e.target.value })}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-btn">
              {editingId ? 'Save Changes' : 'Create Goal'}
            </button>
            <button type="button" className="secondary-btn" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {goals.length === 0 && !showForm ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎯</div>
          <p>No goals yet. Create one to start projecting your retirement or savings timeline.</p>
        </div>
      ) : (
        <div className="goal-grid">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onEdit={edit} onDelete={remove} />
          ))}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <TvmTable />
      </div>
    </div>
  );
}
