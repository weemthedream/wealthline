import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  Plus,
  Landmark,
  PiggyBank,
  TrendingUp,
  Home,
  CreditCard,
  Banknote,
  Scale,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { api } from '../api.js';
import { ChartTooltip, axisProps, gridProps, money } from '../chartTheme.jsx';

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking', isLiability: false, icon: Landmark },
  { value: 'savings', label: 'Savings', isLiability: false, icon: PiggyBank },
  { value: 'investment', label: 'Investment', isLiability: false, icon: TrendingUp },
  { value: 'property', label: 'Property / Other Asset', isLiability: false, icon: Home },
  { value: 'credit_card', label: 'Credit Card', isLiability: true, icon: CreditCard },
  { value: 'loan', label: 'Loan', isLiability: true, icon: Banknote },
  { value: 'mortgage', label: 'Mortgage', isLiability: true, icon: Home }
];

const typeInfo = (value) => ACCOUNT_TYPES.find((t) => t.value === value);

function formatDateShort(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
    try {
      const payload = {
        name: form.name,
        type: form.type,
        isLiability: typeInfo(form.type).isLiability,
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

  const renderAccountRow = (account) => {
    const info = typeInfo(account.type);
    const Icon = info?.icon || Landmark;
    return (
      <div className="account-row" key={account.id}>
        <span className="account-icon">
          <Icon size={15} />
        </span>
        <div className="account-row-main">
          <div className="account-row-name">{account.name}</div>
          <div className="account-row-type">{info?.label || account.type}</div>
        </div>
        <input
          type="number"
          step="0.01"
          className="budget-input"
          defaultValue={account.balance}
          onChange={(e) => setBalanceDrafts({ ...balanceDrafts, [account.id]: e.target.value })}
          onBlur={() => saveBalance(account)}
          aria-label={`${account.name} balance`}
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
  };

  return (
    <div className="net-worth">
      <div className="summary-cards">
        <div className={`card net ${data.netWorth >= 0 ? 'positive' : 'negative'}`}>
          <div className="card-top">
            <span className="card-icon">
              <Scale size={15} />
            </span>
            <span className="card-label">Net Worth</span>
          </div>
          <div className="card-value">{money(data.netWorth)}</div>
        </div>
        <div className="card income">
          <div className="card-top">
            <span className="card-icon">
              <ArrowUpRight size={15} />
            </span>
            <span className="card-label">Total Assets</span>
          </div>
          <div className="card-value">{money(data.totalAssets)}</div>
        </div>
        <div className="card expense">
          <div className="card-top">
            <span className="card-icon">
              <ArrowDownRight size={15} />
            </span>
            <span className="card-label">Total Liabilities</span>
          </div>
          <div className="card-value">{money(data.totalLiabilities)}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Net Worth Over Time</h3>
        {chartData.length < 2 ? (
          <p className="empty-hint" style={{ marginTop: 6 }}>
            Update an account balance on a different day to start building your net worth trend.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} width={58} tickFormatter={(v) => money(v, { compact: true })} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="netWorth"
                stroke="var(--accent)"
                fill="url(#netWorthGrad)"
                strokeWidth={2}
                name="Net Worth"
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="section-head">
        <h2>Accounts</h2>
        {!showForm && (
          <button className="primary-btn" onClick={() => setShowForm(true)}>
            <Plus size={14} />
            Add account
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={submit}>
          <h3>{editingId ? 'Edit account' : 'New account'}</h3>
          <div className="form-row" style={{ marginTop: 14 }}>
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
              {editingId ? 'Save changes' : 'Add account'}
            </button>
            <button type="button" className="secondary-btn" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {data.accounts.length === 0 && !showForm ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Landmark size={28} strokeWidth={1.5} />
          </div>
          <p>No accounts yet. Add your checking, savings, and cards to track your net worth.</p>
        </div>
      ) : (
        <div className="account-groups">
          <div className="panel">
            <h3>Assets</h3>
            {assetAccounts.length === 0 ? (
              <p className="empty-hint" style={{ marginTop: 6 }}>
                No asset accounts yet.
              </p>
            ) : (
              <div className="account-list" style={{ marginTop: 6 }}>
                {assetAccounts.map(renderAccountRow)}
              </div>
            )}
          </div>
          <div className="panel">
            <h3>Liabilities</h3>
            {liabilityAccounts.length === 0 ? (
              <p className="empty-hint" style={{ marginTop: 6 }}>
                No liability accounts yet.
              </p>
            ) : (
              <div className="account-list" style={{ marginTop: 6 }}>
                {liabilityAccounts.map(renderAccountRow)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
