import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, Plus, Upload, FileSpreadsheet, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { money } from '../chartTheme.jsx';
import { CategoryIcon } from '../categoryIcons.jsx';
import ImportCsv from './ImportCsv.jsx';
import { learnFromHistory, merchantKey, suggestCategory } from '../autoCategory.js';

function currency(n) {
  return money(n, { cents: true });
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
  const [showImport, setShowImport] = useState(false);
  // Every transaction (all months) so categories can be learned per merchant.
  const [history, setHistory] = useState([]);
  // Once the user picks a category by hand, stop auto-filling it.
  const [categoryTouched, setCategoryTouched] = useState(false);
  // After a category change on an existing transaction: offer to apply it to the same merchant.
  const [recatOffer, setRecatOffer] = useState(null);

  const load = () => {
    api
      .getTransactions(month)
      .then(setTransactions)
      .catch((e) => setError(e.message));
    api
      .getTransactions()
      .then(setHistory)
      .catch(() => setHistory([]));
  };

  useEffect(load, [month]);

  const learned = useMemo(() => learnFromHistory(history), [history]);
  const suggestion = useMemo(
    () => (editingId ? null : suggestCategory(form.description, form.type, categories, learned)),
    [form.description, form.type, categories, learned, editingId]
  );

  // Auto-fill the category from the description until the user overrides it.
  useEffect(() => {
    if (suggestion && !categoryTouched && suggestion.categoryId !== form.categoryId) {
      setForm((f) => ({ ...f, categoryId: suggestion.categoryId }));
    }
  }, [suggestion, categoryTouched]);

  useEffect(() => {
    if (!form.categoryId && categories.length > 0) {
      const match = categories.find((c) => c.type === form.type);
      setForm((f) => ({ ...f, categoryId: match ? match.id : categories[0].id }));
    }
  }, [categories, form.type]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setCategoryTouched(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount || !form.categoryId) return;
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (editingId) {
        const before = transactions.find((t) => t.id === editingId);
        await api.updateTransaction(editingId, payload);
        // Changed the category? Offer to fix this merchant's other transactions too.
        const key = merchantKey(payload.description);
        if (before && key && before.categoryId !== payload.categoryId) {
          const others = history.filter(
            (t) =>
              t.id !== editingId &&
              t.type === payload.type &&
              t.categoryId !== payload.categoryId &&
              merchantKey(t.description) === key
          );
          if (others.length > 0) setRecatOffer({ key, categoryId: payload.categoryId, ids: others.map((t) => t.id) });
        }
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
    setCategoryTouched(true);
    setRecatOffer(null);
  };

  const applyRecat = async () => {
    const offer = recatOffer;
    setRecatOffer(null);
    try {
      for (const id of offer.ids) {
        await api.updateTransaction(id, { categoryId: offer.categoryId });
      }
      load();
      onChange();
    } catch (err) {
      setError(err.message);
    }
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

  const downloadExcel = async () => {
    try {
      const res = await fetch('/api/export/xlsx', { credentials: 'include' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wealthline-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

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
            <select
              value={form.type}
              onChange={(e) => {
                setForm({ ...form, type: e.target.value, categoryId: '' });
                setCategoryTouched(false);
              }}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
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
          <label className="grow">
            Description
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Merchant or note, e.g. Starbucks"
            />
          </label>
          <label>
            Category
            <select
              value={form.categoryId}
              onChange={(e) => {
                setForm({ ...form, categoryId: e.target.value });
                setCategoryTouched(true);
              }}
            >
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {suggestion && !categoryTouched && suggestion.categoryId === form.categoryId && (
          <p className="auto-hint">
            <Sparkles size={13} aria-hidden="true" />
            {suggestion.source === 'history'
              ? `Category filled in from ${suggestion.count} past “${suggestion.merchant}” ${
                  suggestion.count === 1 ? 'transaction' : 'transactions'
                }.`
              : `Category guessed from the description. Change it if it's wrong and Wealthline will remember.`}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="primary-btn">
            {!editingId && <Plus size={14} />}
            {editingId ? 'Save changes' : 'Add transaction'}
          </button>
          {editingId && (
            <button type="button" className="secondary-btn" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {recatOffer && (
        <div className="recat-offer panel" role="status">
          <span>
            Also move {recatOffer.ids.length} other “{recatOffer.key}”{' '}
            {recatOffer.ids.length === 1 ? 'transaction' : 'transactions'} to {categoryName(recatOffer.categoryId)}?
            Then new ones will be filled in this way automatically.
          </span>
          <div className="form-actions">
            <button className="primary-btn" onClick={applyRecat}>
              Move {recatOffer.ids.length}
            </button>
            <button className="secondary-btn" onClick={() => setRecatOffer(null)}>
              Just this one
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Transactions</h3>
            <p className="empty-hint" style={{ margin: 0 }}>
              {visibleTransactions.length} of {transactions.length} this month
            </p>
          </div>
          <div className="form-actions">
            <button className="primary-btn" onClick={() => setShowImport(true)}>
              <Upload size={14} />
              Import CSV
            </button>
            <button className="secondary-btn" onClick={exportCsv} disabled={visibleTransactions.length === 0}>
              <Download size={14} />
              CSV
            </button>
            <button
              className="secondary-btn"
              onClick={downloadExcel}
              title="Full multi-sheet workbook of all your data"
            >
              <FileSpreadsheet size={14} />
              Excel
            </button>
          </div>
        </div>
        <div className="filter-row">
          <div style={{ position: 'relative', flex: 1, minWidth: 180, display: 'flex' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-faint)'
              }}
            />
            <input
              type="text"
              placeholder="Search description or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 30, width: '100%' }}
            />
          </div>
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
                  <td data-label="Category">
                    <span className="cell-with-icon">
                      <CategoryIcon name={categoryName(t.categoryId)} />
                      {categoryName(t.categoryId)}
                    </span>
                  </td>
                  <td data-label="Description">{t.description}</td>
                  <td
                    data-label="Amount"
                    className={`align-right ${t.type === 'income' ? 'text-income' : 'text-expense'}`}
                  >
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

      {showImport && (
        <ImportCsv
          categories={categories}
          learned={learned}
          onClose={() => setShowImport(false)}
          onImported={() => {
            load();
            onChange();
          }}
        />
      )}
    </div>
  );
}
