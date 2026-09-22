import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api.js';
import { CategoryIcon } from '../categoryIcons.jsx';

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

const EMPTY_FORM = { name: '', amount: '', dueDay: '1', categoryId: '', frequency: 'monthly' };

export default function Bills({ month, categories, onChange }) {
  const [bills, setBills] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api.getBills().then(setBills).catch((e) => setError(e.message));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!form.categoryId && categories.length > 0) {
      const expense = categories.find((c) => c.type === 'expense');
      setForm((f) => ({ ...f, categoryId: expense ? expense.id : categories[0].id }));
    }
  }, [categories]);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, categoryId: form.categoryId });
    setEditingId(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.amount || !form.dueDay) return;
    try {
      const payload = { ...form, amount: Number(form.amount), dueDay: Number(form.dueDay) };
      if (editingId) {
        await api.updateBill(editingId, payload);
      } else {
        await api.createBill(payload);
      }
      resetForm();
      load();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (b) => {
    setForm({ name: b.name, amount: b.amount, dueDay: b.dueDay, categoryId: b.categoryId || '', frequency: b.frequency });
    setEditingId(b.id);
  };

  const remove = async (id) => {
    await api.deleteBill(id);
    load();
    onChange();
  };

  const togglePaid = async (id) => {
    await api.toggleBillPaid(id, month);
    load();
  };

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || '—';

  return (
    <div className="bills">
      {error && <div className="error-box">{error}</div>}
      <form className="panel" onSubmit={submit}>
        <h3>{editingId ? 'Edit Bill' : 'Add Recurring Bill'}</h3>
        <div className="form-row">
          <label className="grow">
            Name
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
          <label>
            Due day
            <input
              type="number"
              min="1"
              max="31"
              value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
              required
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Category
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Frequency
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary-btn">
            {!editingId && <Plus size={14} />}
            {editingId ? 'Save changes' : 'Add bill'}
          </button>
          {editingId && (
            <button type="button" className="secondary-btn" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="panel">
        <h3>Recurring Bills</h3>
        {bills.length === 0 ? (
          <p className="empty-hint">No recurring bills yet.</p>
        ) : (
          <table className="data-table responsive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Due Day</th>
                <th>Frequency</th>
                <th className="align-right">Amount</th>
                <th>Paid this month</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const paid = (b.paidMonths || []).includes(month);
                return (
                  <tr key={b.id}>
                    <td data-label="Name">{b.name}</td>
                    <td data-label="Category">
                      <span className="cell-with-icon">
                        <CategoryIcon name={categoryName(b.categoryId)} />
                        {categoryName(b.categoryId)}
                      </span>
                    </td>
                    <td data-label="Due Day">{b.dueDay}</td>
                    <td data-label="Frequency">{b.frequency}</td>
                    <td data-label="Amount" className="align-right">{currency(b.amount)}</td>
                    <td data-label="Paid this month">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={paid} onChange={() => togglePaid(b.id)} />
                        {paid ? 'Paid' : 'Unpaid'}
                      </label>
                    </td>
                    <td className="row-actions">
                      <button className="link-btn" onClick={() => edit(b)}>
                        Edit
                      </button>
                      <button className="link-btn danger" onClick={() => remove(b.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
