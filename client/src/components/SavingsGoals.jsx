import React, { useEffect, useState } from 'react';
import { Plus, Check, Pencil, Trash2, Minus } from 'lucide-react';
import { api } from '../api.js';
import { money } from '../chartTheme.jsx';

// Savings goals: short-term pots for a trip, a laptop, a deposit. Unlike the
// Retirement page there's no investment growth here, just "how much is in it,
// how much is left, and what do I need to put in each month to make the date".

export const GOAL_COLORS = ['#4F46E5', '#1A7F4E', '#E8833A', '#D9467A', '#2F9E8F', '#6D5BD0'];

const EMPTY_FORM = {
  name: '',
  targetAmount: '',
  targetDate: '',
  currentAmount: '',
  monthlyContribution: '',
  color: GOAL_COLORS[0]
};

// Whole months from today until the target date, at least 1.
export function monthsUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  const months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()) + ((d || 1) >= now.getDate() ? 0 : -1);
  return Math.max(1, months + 1);
}

// What a goal needs and whether the plan gets there.
export function goalPlan(goal) {
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const pct = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
  const done = remaining <= 0;
  const months = monthsUntil(goal.targetDate);
  const needed = months ? remaining / months : null;
  const monthly = goal.monthlyContribution || 0;
  let status = 'none';
  if (done) status = 'done';
  else if (needed !== null) status = monthly >= needed - 0.5 ? 'on-track' : 'behind';
  else if (monthly > 0) status = 'open';
  const finishIn = !done && monthly > 0 ? Math.ceil(remaining / monthly) : null;
  return { remaining, pct, done, months, needed, monthly, status, finishIn };
}

function monthLabel(offsetMonths) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function dateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d || 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function GoalForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const target = Number(form.targetAmount) || 0;
  const saved = Number(form.currentAmount) || 0;
  const months = monthsUntil(form.targetDate);
  const suggested = months && target > saved ? Math.ceil((target - saved) / months) : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Give the goal a name.');
    if (!(target > 0)) return setError('Enter how much you want to save.');
    setError('');
    try {
      await onSave({
        name: form.name.trim(),
        targetAmount: target,
        targetDate: form.targetDate || '',
        currentAmount: saved,
        monthlyContribution: Number(form.monthlyContribution) || 0,
        color: form.color,
        kind: 'savings'
      });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="panel goal-form" onSubmit={submit}>
      <h3>{initial.id ? 'Edit goal' : 'New savings goal'}</h3>
      <div className="form-row">
        <label className="grow">
          What are you saving for?
          <input
            type="text"
            value={form.name}
            maxLength={80}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Spring break trip, New laptop"
            autoFocus
          />
        </label>
        <label>
          Goal amount
          <input
            type="number"
            min="1"
            step="0.01"
            inputMode="decimal"
            value={form.targetAmount}
            onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
            placeholder="1200"
          />
        </label>
        <label>
          By when? <span className="label-optional">(optional)</span>
          <input
            type="date"
            value={form.targetDate}
            onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Already saved
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.currentAmount}
            onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
            placeholder="0"
          />
        </label>
        <label>
          Put in each month
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.monthlyContribution}
            onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })}
            placeholder={suggested ? String(suggested) : '0'}
          />
        </label>
        <fieldset className="color-pick">
          <legend>Color</legend>
          <div>
            {GOAL_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch ${form.color === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setForm({ ...form, color: c })}
                aria-label={`Color ${c}`}
                aria-pressed={form.color === c}
              />
            ))}
          </div>
        </fieldset>
      </div>
      {suggested !== null && (
        <p className="auto-hint">
          To reach {money(target)} by {dateLabel(form.targetDate)}, put in about {money(suggested)} a month.
          {Number(form.monthlyContribution) !== suggested && (
            <button
              type="button"
              className="link-btn"
              onClick={() => setForm({ ...form, monthlyContribution: String(suggested) })}
            >
              Use {money(suggested)}
            </button>
          )}
        </p>
      )}
      {error && <div className="error-box">{error}</div>}
      <div className="form-actions">
        <button type="submit" className="primary-btn">
          {initial.id ? 'Save changes' : 'Create goal'}
        </button>
        <button type="button" className="secondary-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function GoalCard({ goal, onContribute, onEdit, onDelete }) {
  const [amount, setAmount] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const plan = goalPlan(goal);
  const color = goal.color || GOAL_COLORS[0];

  const add = (n) => {
    if (!Number.isFinite(n) || n === 0) return;
    onContribute(goal.id, n);
    setAmount('');
  };

  let statusText;
  if (plan.status === 'done') statusText = 'Goal reached. Nice work.';
  else if (plan.status === 'on-track')
    statusText = `On track: ${money(plan.monthly)}/month gets you there by ${dateLabel(goal.targetDate)}.`;
  else if (plan.status === 'behind')
    statusText = `Needs ${money(plan.needed)}/month to make ${dateLabel(goal.targetDate)}. You're planning ${money(plan.monthly)}.`;
  else if (plan.status === 'open')
    statusText = `At ${money(plan.monthly)}/month you'll get there around ${monthLabel(plan.finishIn)}.`;
  else statusText = 'Set a monthly amount or a date to see when you’ll get there.';

  return (
    <article className="goal-pot" style={{ '--goal': color }}>
      <div className="goal-pot-head">
        <h3>{goal.name}</h3>
        <div className="goal-pot-tools">
          <button className="icon-btn" onClick={() => onEdit(goal)} aria-label={`Edit ${goal.name}`}>
            <Pencil size={15} />
          </button>
          <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${goal.name}`}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="goal-pot-amounts">
        <span className="goal-pot-saved tabular">{money(goal.currentAmount)}</span>
        <span className="goal-pot-target">of {money(goal.targetAmount)}</span>
      </div>
      <div
        className="goal-pot-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(plan.pct)}
        aria-label={`${goal.name} progress`}
      >
        <div style={{ width: `${plan.pct}%` }} />
      </div>
      <div className="goal-pot-meta">
        <span>{Math.round(plan.pct)}% saved</span>
        <span>{plan.done ? 'Done' : `${money(plan.remaining)} to go`}</span>
      </div>

      <p className={`goal-pot-status ${plan.status}`}>
        {plan.status === 'done' && <Check size={14} aria-hidden="true" />}
        {statusText}
      </p>

      {confirmDelete ? (
        <div className="goal-pot-confirm">
          <span>Delete this goal? This can't be undone.</span>
          <div className="form-actions">
            <button className="danger-btn" onClick={() => onDelete(goal.id)}>
              Delete
            </button>
            <button className="secondary-btn" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </div>
        </div>
      ) : (
        <div className="goal-pot-actions">
          {!plan.done && plan.monthly > 0 && (
            <button className="btn-mini" onClick={() => add(plan.monthly)}>
              <Plus size={13} /> {money(plan.monthly)}
            </button>
          )}
          <form
            className="goal-pot-custom"
            onSubmit={(e) => {
              e.preventDefault();
              add(Number(amount));
            }}
          >
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              aria-label={`Amount for ${goal.name}`}
            />
            <button type="submit" className="btn-mini" disabled={!(Number(amount) > 0)}>
              <Plus size={13} /> Add
            </button>
            <button
              type="button"
              className="btn-mini"
              disabled={!(Number(amount) > 0) || goal.currentAmount <= 0}
              onClick={() => add(-Number(amount))}
              title="Take money out of this goal"
            >
              <Minus size={13} /> Take out
            </button>
          </form>
        </div>
      )}
    </article>
  );
}

export default function SavingsGoals({ onChange }) {
  const [goals, setGoals] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | goal
  const [error, setError] = useState('');

  const load = () =>
    api
      .getGoals()
      .then((all) => setGoals(all.filter((g) => g.kind === 'savings')))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const changed = () => {
    load();
    onChange && onChange();
  };

  const save = async (data) => {
    if (editing && editing !== 'new') await api.updateGoal(editing.id, data);
    else await api.createGoal(data);
    setEditing(null);
    changed();
  };

  const contribute = async (id, amount) => {
    try {
      const updated = await api.contributeGoal(id, amount);
      setGoals((gs) => gs.map((g) => (g.id === id ? updated : g)));
      onChange && onChange();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteGoal(id);
      changed();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!goals) return error ? <div className="error-box">{error}</div> : <div className="loading">Loading…</div>;

  const active = goals.filter((g) => g.currentAmount < g.targetAmount);
  const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const monthlyPlan = active.reduce((s, g) => s + (g.monthlyContribution || 0), 0);
  // Unfinished goals first, closest date first; finished ones at the end.
  const sorted = [...goals].sort((a, b) => {
    const ad = a.currentAmount >= a.targetAmount;
    const bd = b.currentAmount >= b.targetAmount;
    if (ad !== bd) return ad ? 1 : -1;
    return (a.targetDate || '9999') < (b.targetDate || '9999') ? -1 : 1;
  });

  return (
    <div className="savings-goals">
      {error && <div className="error-box">{error}</div>}

      {goals.length > 0 && (
        <div className="summary-cards">
          <div className="card kpi">
            <div className="kpi-label">Saved so far</div>
            <div className="card-value">{money(totalSaved)}</div>
            <div className="card-sub">
              of {money(totalTarget)} across {goals.length} {goals.length === 1 ? 'goal' : 'goals'}
            </div>
          </div>
          <div className="card kpi">
            <div className="kpi-label">Setting aside</div>
            <div className="card-value">{money(monthlyPlan)}</div>
            <div className="card-sub">a month, taken out of Safe to spend</div>
          </div>
        </div>
      )}

      {editing ? (
        <GoalForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={
            editing === 'new'
              ? EMPTY_FORM
              : {
                  id: editing.id,
                  name: editing.name,
                  targetAmount: String(editing.targetAmount),
                  targetDate: editing.targetDate || '',
                  currentAmount: String(editing.currentAmount),
                  monthlyContribution: editing.monthlyContribution ? String(editing.monthlyContribution) : '',
                  color: editing.color || GOAL_COLORS[0]
                }
          }
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : (
        <button className="primary-btn add-goal-btn" onClick={() => setEditing('new')}>
          <Plus size={16} /> New savings goal
        </button>
      )}

      {goals.length === 0 && !editing && (
        <div className="panel empty-goals">
          <h3>Save up for something specific</h3>
          <p className="empty-hint">
            Make a goal for a trip, a new phone, concert tickets or an emergency fund. Wealthline tracks how much you've
            put in, tells you what to set aside each month to hit your date, and takes that amount out of Safe to spend
            so you don't spend it by accident.
          </p>
        </div>
      )}

      <div className="goal-pot-grid">
        {sorted.map((g) => (
          <GoalCard key={g.id} goal={g} onContribute={contribute} onEdit={setEditing} onDelete={remove} />
        ))}
      </div>
    </div>
  );
}
