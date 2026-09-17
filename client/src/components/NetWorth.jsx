import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api.js';

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking', isLiability: false },
  { value: 'savings', label: 'Savings', isLiability: false },
  { value: 'investment', label: 'Investment', isLiability: false },
  { value: 'property', label: 'Property / Other Asset', isLiability: false },
  { value: 'credit_card', label: 'Credit Card', isLiability: true },
  { value: 'loan', label: 'Loan', isLiability: true },
  { value: 'mortgage', label: 'Mortgage', isLiability: true }
];

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const EMPTY_FORM = { name: '', type: 'checking', balance: '' };

export default function NetWorth() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [balanceDrafts, setBalanceDrafts] = useState({});
  const [error, setError] = useState('');

  const load = () => {
    api.getNetWorth().then(setData).catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || form.balance === '') return;
    const typeInfo = ACCOUNT_TYPES.find((t) => t.value === form.type);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        isLiability: typeInfo.isLiability,
        balance: Number(form.balance)
      };
      if (editingId) {
        await api.updateAccount(editingId, payload);
      } else {
        await api.createAccount(payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (account) => {
    setForm({ name: account.name, type: account.type, balance: account.balance });
    setEditingId(account.id);
    setShowForm(true);
  };

  const remove = async (id) => {
    await api.deleteAccount(id);
    load();
  };

  const saveBalance = async (account) => {
    const value = balanceDrafts[account.id];
    if (value === undefined || value === '' || Number(value) === account.balance) return;
    await api.updateAccount(account.id, { balance: Number(value) });
    load();
  };

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="loading">Loading…</div>;

  const assetAccounts = data.accounts.filter((a) => !a.isLiability);
  const liabilityAccounts = data.accounts.filter((a) => a.isLiability);
  const chartData = data.history.map((h) => ({ ...h, label: formatDateShort(h.date) }));

  const renderAccountRow = (account) => (
    <div className="account-row" key={account.id}>
      <span className="color-dot" style={{ background: account.color }} />
      <div className="account-row-main">
        <div className="account-row-name">{account.name}</div>
        <div className="account-row-type">{ACCOUNT_TYPES.find((t) => t.value === account.type)?.label || account.type}</div>
      </div>
      <input
        type="number"
        step="0.01"
        className="budget-input"
        defaultValue={account.balance}
        onChange={(e) => setBalanceDrafts({ ...balanceDrafts, [account.id]: e.target.value })}
        onBlur={() => saveBalance(account)}
      />
      <div className="row-actions">
        <button className="link-btn" onClick={() => edit(account)}>
          Edit
        </button>
        <button className="link-btn danger" onClick={() => remove(account.id)}>
          Delete
        </button>
      </div>
    </div>
  );

  return (
    <div className="net-worth">
      <div className="summary-cards">
        <div className={`card net ${data.netWorth >= 0 ? 'positive' : 'negative'}`}>
          <div className="card-icon">Σ</div>
          <div className="card-label">Net Worth</div>
          <div className="card-value">{currency(data.netWorth)}</div>
        </div>
        <div className="card income">
          <div className="card-icon">↑</div>
          <div className="card-label">Total Assets</div>
          <div className="card-value">{currency(data.totalAssets)}</div>
        </div>
        <div className="card expense">
          <div className="card-icon">↓</div>
          <div className="card-label">Total Liabilities</div>
          <div className="card-value">{currency(data.totalLiabilities)}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Net Worth Over Time</h3>
        {chartData.length < 2 ? (
          <p className="empty-hint">Update an account balance on a different day to start building your net worth trend.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--brand-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                formatter={(value) => currency(value)}
                contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
              />
              <Area type="monotone" dataKey="netWorth" stroke="var(--brand-1)" fill="url(#netWorthGrad)" strokeWidth={2.5} name="Net Worth" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="panel-head" style={{ marginTop: 4 }}>
        <h3 style={{ margin: 0 }}>Accounts</h3>
        {!showForm && (
          <button className="primary-btn" onClick={() => setShowForm(true)}>
            + Add Account
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={submit}>
          <h3>{editingId ? 'Edit Account' : 'New Account'}</h3>
          <div className="form-row">
            <label className="grow">
              Name
              <input
                type="text"
                placeholder="e.g. Chase Checking"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Current balance
              <input
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-btn">
              {editingId ? 'Save Changes' : 'Add Account'}
            </button>
            <button type="button" className="secondary-btn" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {data.accounts.length === 0 && !showForm ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏦</div>
          <p>No accounts yet. Add your checking, savings, and cards to track your net worth.</p>
        </div>
      ) : (
        <div className="account-groups">
          <div className="panel">
            <h3>Assets</h3>
            {assetAccounts.length === 0 ? (
              <p className="empty-hint">No asset accounts yet.</p>
            ) : (
              <div className="account-list">{assetAccounts.map(renderAccountRow)}</div>
            )}
          </div>
          <div className="panel">
            <h3>Liabilities</h3>
            {liabilityAccounts.length === 0 ? (
              <p className="empty-hint">No liability accounts yet.</p>
            ) : (
              <div className="account-list">{liabilityAccounts.map(renderAccountRow)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
