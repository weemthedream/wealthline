import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const EMPTY_FORM = { date: today(), amount: '', type: 'expense', categoryId: '', description: '' };

export default function Transactions({ month, categories, onChange }) {
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');

  const load = () => {
    api.getTransactions(month).then(setTransactions).catch((e) => setError(e.message));
  };

  useEffect(load, [month]);

  useEffect(() => {
    if (!form.categoryId && categories.length > 0) {
      const match = categories.find((c) => c.type === form.type);
      setForm((f) => ({ ...f, categoryId: match ? match.id : categories[0].id }));
    }
  }, [categories, form.type]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount || !form.categoryId) return;
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (editingId) {
        await api.updateTransaction(editingId, payload);
      } else {
        await api.createTransaction(payload);
      }
      resetForm();
      load();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (t) => {
    setForm({ date: t.date, amount: t.amount, type: t.type, categoryId: t.categoryId, description: t.description });
    setEditingId(t.id);
  };

  const remove = async (id) => {
    await api.deleteTransaction(id);
    load();
    onChange();
  };

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || 'Unknown';

  const filteredCategories = categories.filter((c) => c.type === form.type);

  const visibleTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (filterCategoryId && t.categoryId !== filterCategoryId) return false;
      if (!q) return true;
      return t.description.toLowerCase().includes(q) || categoryName(t.categoryId).toLowerCase().includes(q);
    });
  }, [transactions, search, filterCategoryId, categories]);

  const exportCsv = () => {
    const rows = [
      ['Date', 'Type', 'Category', 'Description', 'Amount'],
      ...visibleTransactions.map((t) => [t.date, t.type, categoryName(t.categoryId), t.description, t.amount])
    ];
    downloadCsv(`wealthline-transactions-${month}.csv`, rows);
  };

  return (
    <div className="transactions">
      {error && <div className="error-box">{error}</div>}
      <form className="transaction-form panel" onSubmit={submit}>
        <h3>{editingId ? 'Edit Transaction' : 'Add Transaction'}</h3>
        <div className="form-row">
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, categoryId: '' })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Date
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </label>
          <label>
            Amount
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Category
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            Description
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional note"
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary-btn">
            {editingId ? 'Save Changes' : 'Add Transaction'}
          </button>
          {editingId && (
            <button type="button" className="secondary-btn" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="panel">
        <div className="panel-head">
          <h3>Transactions this month</h3>
          <button className="secondary-btn" onClick={exportCsv} disabled={visibleTransactions.length === 0}>
            Export CSV
          </button>
        </div>
        <div className="filter-row">
          <input
            type="text"
            placeholder="Search description or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="grow"
          />
          <select value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {visibleTransactions.length === 0 ? (
          <p className="empty-hint">
            {transactions.length === 0 ? 'No transactions yet for this month.' : 'No transactions match your search.'}
          </p>
        ) : (
          <table className="data-table responsive-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th className="align-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((t) => (
                <tr key={t.id}>
                  <td data-label="Date">{t.date}</td>
                  <td data-label="Category">{categoryName(t.categoryId)}</td>
                  <td data-label="Description">{t.description}</td>
                  <td data-label="Amount" className={`align-right ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {t.type === 'income' ? '+' : '-'}
                    {currency(t.amount)}
                  </td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => edit(t)}>
                      Edit
                    </button>
                    <button className="link-btn danger" onClick={() => remove(t.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
