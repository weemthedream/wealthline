import React, { useState } from 'react';
import { api } from '../api.js';
import { X, Plus } from 'lucide-react';
import { CategoryIcon } from '../categoryIcons.jsx';

const EMPTY_NEW = { name: '', type: 'expense', color: '#6366f1' };

export default function CategoriesDrawer({ categories, onClose, onChange }) {
  const [renameDrafts, setRenameDrafts] = useState({});
  const [newCategory, setNewCategory] = useState(EMPTY_NEW);
  const [pendingDelete, setPendingDelete] = useState(null); // { category, counts, reassignTo }
  const [error, setError] = useState('');

  const income = categories.filter((c) => c.type === 'income');
  const expense = categories.filter((c) => c.type === 'expense');

  const saveName = async (category, name) => {
    if (!name || name === category.name) return;
    try {
      await api.updateCategory(category.id, { name });
      onChange();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveColor = async (category, color) => {
    try {
      await api.updateCategory(category.id, { color });
      onChange();
    } catch (err) {
      setError(err.message);
    }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.name) return;
    try {
      await api.createCategory(newCategory);
      setNewCategory(EMPTY_NEW);
      onChange();
    } catch (err) {
      setError(err.message);
    }
  };

  const requestDelete = async (category) => {
    try {
      await api.deleteCategory(category.id);
      onChange();
    } catch (err) {
      if (err.status === 409) {
        setPendingDelete({ category, counts: err.data.counts, reassignTo: '' });
      } else {
        setError(err.message);
      }
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete?.reassignTo) return;
    try {
      await api.deleteCategory(pendingDelete.category.id, pendingDelete.reassignTo);
      setPendingDelete(null);
      onChange();
    } catch (err) {
      setError(err.message);
    }
  };

  const renderRow = (category) => (
    <div className="category-row" key={category.id}>
      <CategoryIcon name={category.name} size={15} />
      <input
        type="color"
        value={category.color}
        onChange={(e) => saveColor(category, e.target.value)}
        title="Category color"
      />
      <input
        type="text"
        defaultValue={category.name}
        onChange={(e) => setRenameDrafts({ ...renameDrafts, [category.id]: e.target.value })}
        onBlur={() => saveName(category, renameDrafts[category.id])}
      />
      <button className="link-btn danger" onClick={() => requestDelete(category)}>
        Delete
      </button>
    </div>
  );

  const reassignOptions = pendingDelete
    ? categories.filter((c) => c.type === pendingDelete.category.type && c.id !== pendingDelete.category.id)
    : [];

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-head">
          <h3 style={{ margin: 0 }}>Manage Categories</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {pendingDelete && (
          <div className="confirm-box">
            <strong>{pendingDelete.category.name}</strong> is used by {pendingDelete.counts.transactions} transaction(s),{' '}
            {pendingDelete.counts.budgets} budget(s) and {pendingDelete.counts.bills} bill(s). Choose a category to move
            them to before deleting:
            <div className="form-row" style={{ marginTop: 10, marginBottom: 0 }}>
              <select
                value={pendingDelete.reassignTo}
                onChange={(e) => setPendingDelete({ ...pendingDelete, reassignTo: e.target.value })}
              >
                <option value="">Select category…</option>
                {reassignOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-actions" style={{ marginTop: 10 }}>
              <button className="danger-btn" disabled={!pendingDelete.reassignTo} onClick={confirmDelete}>
                Reassign & Delete
              </button>
              <button className="secondary-btn" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="category-type-heading">Income</div>
        {income.map(renderRow)}

        <div className="category-type-heading">Expense</div>
        {expense.map(renderRow)}

        <div className="category-type-heading">Add category</div>
        <form onSubmit={addCategory} className="form-row" style={{ alignItems: 'flex-end' }}>
          <label className="grow">
            Name
            <input
              type="text"
              value={newCategory.name}
              onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
              placeholder="e.g. Pets"
            />
          </label>
          <label>
            Type
            <select
              value={newCategory.type}
              onChange={(e) => setNewCategory({ ...newCategory, type: e.target.value })}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Color
            <input
              type="color"
              value={newCategory.color}
              onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
            />
          </label>
          <button type="submit" className="primary-btn">
            <Plus size={14} />
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
