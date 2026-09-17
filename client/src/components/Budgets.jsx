import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { iconForCategory } from '../categoryIcons.js';

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export default function Budgets({ month, categories, onChange }) {
  const [budgets, setBudgets] = useState([]);
  const [spentByCategory, setSpentByCategory] = useState({});
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState('');

  const load = () => {
    Promise.all([api.getBudgets(month), api.getSummary(month)])
      .then(([b, summary]) => {
        setBudgets(b);
        const spent = {};
        summary.byCategory.forEach((c) => {
          spent[c.categoryId] = c.total;
        });
        setSpentByCategory(spent);
        const nextDrafts = {};
        b.forEach((budget) => {
          nextDrafts[budget.categoryId] = budget.limit;
        });
        setDrafts(nextDrafts);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(load, [month]);

  const expenseCategories = categories.filter((c) => c.type === 'expense');

  const save = async (categoryId) => {
    const value = drafts[categoryId];
    if (value === undefined || value === '') return;
    try {
      await api.upsertBudget({ categoryId, month, limit: Number(value) });
      load();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (categoryId) => {
    const budget = budgets.find((b) => b.categoryId === categoryId);
    if (!budget) return;
    await api.deleteBudget(budget.id);
    load();
    onChange();
  };

  return (
    <div className="budgets">
      {error && <div className="error-box">{error}</div>}
      <div className="panel">
        <h3>Monthly Budgets by Category</h3>
        <p className="empty-hint">Set a spending limit for each category. Progress updates as you log expenses.</p>
        <table className="data-table responsive-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Spent</th>
              <th>Limit</th>
              <th>Progress</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenseCategories.map((c) => {
              const spent = spentByCategory[c.id] || 0;
              const limit = budgets.find((b) => b.categoryId === c.id)?.limit;
              const pct = limit ? Math.min(100, (spent / limit) * 100) : 0;
              const over = limit !== undefined && spent > limit;
              return (
                <tr key={c.id}>
                  <td data-label="Category">
                    <span className="category-icon">{iconForCategory(c.name)}</span>
                    <span className="color-dot" style={{ background: c.color }} />
                    {c.name}
                  </td>
                  <td data-label="Spent">{currency(spent)}</td>
                  <td data-label="Limit">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="budget-input"
                      placeholder="No limit"
                      value={drafts[c.id] ?? ''}
                      onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                      onBlur={() => save(c.id)}
                    />
                  </td>
                  <td className="budget-progress-cell" data-label="Progress">
                    {limit ? (
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${pct}%`, background: over ? '#c92a2a' : c.color }}
                        />
                      </div>
                    ) : (
                      <span className="empty-hint">—</span>
                    )}
                  </td>
                  <td>
                    {limit !== undefined && (
                      <button className="link-btn danger" onClick={() => remove(c.id)}>
                        Clear
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
