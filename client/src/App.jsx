import React, { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import Transactions from './components/Transactions.jsx';
import Budgets from './components/Budgets.jsx';
import Bills from './components/Bills.jsx';
import YearView from './components/YearView.jsx';
import Retirement from './components/Retirement.jsx';
import CategoriesDrawer from './components/CategoriesDrawer.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import { api } from './api.js';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const MONTH_SUBTABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'bills', label: 'Bills' }
];

function MainApp({ user, onLogout, theme, setTheme }) {
  const [primaryTab, setPrimaryTab] = useState('month');
  const [monthSubTab, setMonthSubTab] = useState('overview');
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [categories, setCategories] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, [refreshKey]);

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">W</span>
            Wealthline
          </div>
          <div className="topbar-actions">
            <span className="user-menu">{user.email}</span>
            <button
              className="icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
              title="Toggle light / dark theme"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowCategories(true)}
              aria-label="Manage categories"
              title="Manage categories"
            >
              ⚙️
            </button>
            <button className="icon-btn" onClick={onLogout} aria-label="Log out" title="Log out">
              ⏻
            </button>
          </div>
        </div>
        <div className="primary-nav-row">
          <div className="segmented">
            <button className={primaryTab === 'month' ? 'active' : ''} onClick={() => setPrimaryTab('month')}>
              1 Month
            </button>
            <button className={primaryTab === 'year' ? 'active' : ''} onClick={() => setPrimaryTab('year')}>
              1 Year
            </button>
            <button className={primaryTab === 'retirement' ? 'active' : ''} onClick={() => setPrimaryTab('retirement')}>
              Retirement Goals
            </button>
          </div>

          {primaryTab === 'month' && (
            <div className="period-switcher">
              <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
                ‹
              </button>
              <span className="period-label">{formatMonthLabel(month)}</span>
              <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
                ›
              </button>
            </div>
          )}

          {primaryTab === 'year' && (
            <div className="period-switcher">
              <button className="icon-btn" onClick={() => setYear(year - 1)} aria-label="Previous year">
                ‹
              </button>
              <span className="period-label">{year}</span>
              <button className="icon-btn" onClick={() => setYear(year + 1)} aria-label="Next year">
                ›
              </button>
            </div>
          )}
        </div>

        {primaryTab === 'month' && (
          <nav className="subnav">
            {MONTH_SUBTABS.map((t) => (
              <button
                key={t.id}
                className={`subnav-btn ${monthSubTab === t.id ? 'active' : ''}`}
                onClick={() => setMonthSubTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="main-content">
        {primaryTab === 'month' && monthSubTab === 'overview' && <Dashboard month={month} refreshKey={refreshKey} />}
        {primaryTab === 'month' && monthSubTab === 'transactions' && (
          <Transactions month={month} categories={categories} onChange={bump} />
        )}
        {primaryTab === 'month' && monthSubTab === 'budgets' && (
          <Budgets month={month} categories={categories} onChange={bump} />
        )}
        {primaryTab === 'month' && monthSubTab === 'bills' && (
          <Bills month={month} categories={categories} onChange={bump} />
        )}

        {primaryTab === 'year' && <YearView year={year} refreshKey={refreshKey} />}

        {primaryTab === 'retirement' && <Retirement />}
      </main>

      {showCategories && (
        <CategoriesDrawer categories={categories} onClose={() => setShowCategories(false)} onChange={bump} />
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = logged out, object = logged in
  const [theme, setTheme] = useState(() => localStorage.getItem('wealthline-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wealthline-theme', theme);
  }, [theme]);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  if (user === undefined) return <div className="loading">Loading…</div>;
  if (user === null) return <AuthScreen onAuthenticated={setUser} />;
  return <MainApp user={user} onLogout={logout} theme={theme} setTheme={setTheme} />;
}
