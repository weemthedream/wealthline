import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = { date: today(), amount: '', type: 'expense', categoryId: '', description: '' };

export default function Transactions({ month, categories, onChange }) {
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

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
        <h3>Transactions this month</h3>
        {transactions.length === 0 ? (
          <p className="empty-hint">No transactions yet for this month.</p>
        ) : (
          <table className="data-table">
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
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{categoryName(t.categoryId)}</td>
                  <td>{t.description}</td>
                  <td className={`align-right ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
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
