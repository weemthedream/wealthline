const BASE = '/api';

// The database sleeps when idle and takes a moment to wake, which surfaces as a
// 503. Retry those briefly so a cold start looks like a slow load, not an error.
async function request(path, options = {}, attempt = 0) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options
  });

  if (res.status === 503 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
    return request(path, options, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.data = body;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  signup: (email, password) => request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) =>
    request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),

  getCategories: () => request('/categories'),
  createCategory: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getCategoryUsage: (id) => request(`/categories/${id}/usage`),
  deleteCategory: (id, reassignTo) =>
    request(`/categories/${id}${reassignTo ? `?reassignTo=${reassignTo}` : ''}`, { method: 'DELETE' }),

  getTransactions: (month) => request(`/transactions${month ? `?month=${month}` : ''}`),
  createTransaction: (data) => request('/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id, data) => request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),

  getBudgets: (month) => request(`/budgets${month ? `?month=${month}` : ''}`),
  upsertBudget: (data) => request('/budgets', { method: 'POST', body: JSON.stringify(data) }),
  deleteBudget: (id) => request(`/budgets/${id}`, { method: 'DELETE' }),

  getBills: () => request('/bills'),
  createBill: (data) => request('/bills', { method: 'POST', body: JSON.stringify(data) }),
  updateBill: (id, data) => request(`/bills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleBillPaid: (id, month) => request(`/bills/${id}/toggle-paid`, { method: 'POST', body: JSON.stringify({ month }) }),
  deleteBill: (id) => request(`/bills/${id}`, { method: 'DELETE' }),

  getSummary: (month) => request(`/summary${month ? `?month=${month}` : ''}`),
  getYearSummary: (year) => request(`/summary/year${year ? `?year=${year}` : ''}`),

  getGoals: () => request('/goals'),
  createGoal: (data) => request('/goals', { method: 'POST', body: JSON.stringify(data) }),
  updateGoal: (id, data) => request(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGoal: (id) => request(`/goals/${id}`, { method: 'DELETE' }),

  getAccounts: () => request('/accounts'),
  createAccount: (data) => request('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id, data) => request(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),

  getNetWorth: () => request('/networth')
};
