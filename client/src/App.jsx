import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  Home,
  Repeat,
  Landmark,
  Target,
  TrendingUp,
  Sun,
  Moon,
  Settings2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Wallet,
  MailWarning,
  Eye,
  EyeOff
} from 'lucide-react';
import Dashboard from './components/Dashboard.jsx';
import Transactions from './components/Transactions.jsx';
import Budgets from './components/Budgets.jsx';
import Bills from './components/Bills.jsx';
import YearView from './components/YearView.jsx';
import Retirement from './components/Retirement.jsx';
import NetWorth from './components/NetWorth.jsx';
import CategoriesDrawer from './components/CategoriesDrawer.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import ResetPassword from './components/ResetPassword.jsx';
import VerifyEmail from './components/VerifyEmail.jsx';
import { api } from './api.js';
import { setAmountsHidden } from './chartTheme.jsx';

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

// One list of places to go. Time (month vs. year) is a control on the page,
// not a destination, so it lives next to the date picker instead of in the nav.
const NAV_SECTIONS = [
  {
    heading: 'Spending',
    items: [
      { id: 'overview', label: 'Overview', icon: Home, period: 'month-or-year' },
      { id: 'transactions', label: 'Transactions', short: 'Activity', icon: Repeat, period: 'month' },
      { id: 'budgets', label: 'Budgets', icon: Target, period: 'month' },
      { id: 'bills', label: 'Bills', icon: CalendarDays, period: 'month' }
    ]
  },
  {
    heading: 'Planning',
    items: [
      { id: 'networth', label: 'Net Worth', short: 'Net worth', icon: Landmark },
      { id: 'retirement', label: 'Retirement', short: 'Retire', icon: TrendingUp }
    ]
  }
];

const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

function sectionFromHash() {
  const id = window.location.hash.replace('#', '');
  return NAV_ITEMS.some((n) => n.id === id) ? id : 'overview';
}

function PeriodSwitcher({ label, onPrev, onNext, unit }) {
  return (
    <div className="period-switcher">
      <button className="icon-btn" onClick={onPrev} aria-label={`Previous ${unit}`}>
        <ChevronLeft size={16} />
      </button>
      <span className="period-label">{label}</span>
      <button className="icon-btn" onClick={onNext} aria-label={`Next ${unit}`}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Wallet size={15} strokeWidth={2.25} />
      </span>
      Wealthline
    </div>
  );
}

function ReverifyBanner({ email }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    await api.resendVerification(email).catch(() => {});
    setSent(true);
    setBusy(false);
  };

  return (
    <div className="reverify-banner">
      <MailWarning size={15} />
      <span>
        {sent
          ? 'Confirmation link sent — check your inbox.'
          : "It's been a year since you confirmed this email. Please confirm it still reaches you."}
      </span>
      {!sent && (
        <button className="link-btn" onClick={send} disabled={busy}>
          {busy ? 'Sending…' : 'Send link'}
        </button>
      )}
    </div>
  );
}

function MainApp({ user, onLogout, theme, setTheme }) {
  const [section, setSection] = useState(sectionFromHash);
  const [overviewRange, setOverviewRange] = useState('month');
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [categories, setCategories] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCategories, setShowCategories] = useState(false);
  const [amountsHidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('wealthline-hide-amounts') === '1';
    } catch {
      return false;
    }
  });

  // Set before children render so every money() call this render sees it.
  setAmountsHidden(amountsHidden);

  const toggleAmounts = () => {
    const next = !amountsHidden;
    setHidden(next);
    try {
      localStorage.setItem('wealthline-hide-amounts', next ? '1' : '0');
    } catch {
      /* storage unavailable: setting lasts for this visit only */
    }
  };

  useEffect(() => {
    api
      .getCategories()
      .then(setCategories)
      .catch(() => {});
  }, [refreshKey]);

  // Keep the open section in the URL so refresh and the back button work.
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id) => {
    if (id === section) return;
    window.location.hash = id;
    setSection(id);
    window.scrollTo(0, 0);
  };

  const bump = () => setRefreshKey((k) => k + 1);
  const current = NAV_ITEMS.find((n) => n.id === section);
  const showYear = section === 'overview' && overviewRange === 'year';
  const showMonth = current.period === 'month' || (current.period === 'month-or-year' && !showYear);

  const themeButton = (
    <button
      className="icon-btn"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
      title="Toggle light / dark theme"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
  const privacyButton = (
    <button
      className={`icon-btn ${amountsHidden ? 'is-on' : ''}`}
      onClick={toggleAmounts}
      aria-pressed={amountsHidden}
      aria-label={amountsHidden ? 'Show amounts' : 'Hide amounts'}
      title={amountsHidden ? 'Show amounts' : 'Hide amounts (privacy mode)'}
    >
      {amountsHidden ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
  const categoriesButton = (
    <button
      className="icon-btn"
      onClick={() => setShowCategories(true)}
      aria-label="Settings"
      title="Settings: categories, account and email recap"
    >
      <Settings2 size={16} />
    </button>
  );
  const logoutButton = (
    <button className="icon-btn" onClick={onLogout} aria-label="Log out" title="Log out">
      <LogOut size={16} />
    </button>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="side-nav" aria-label="Main">
          {NAV_SECTIONS.map((group) => (
            <div className="side-nav-group" key={group.heading}>
              <div className="side-nav-heading">{group.heading}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`side-nav-btn ${section === item.id ? 'active' : ''}`}
                    aria-current={section === item.id ? 'page' : undefined}
                    onClick={() => go(item.id)}
                  >
                    <Icon size={17} strokeWidth={2} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="user-menu" title={user.email}>
            {user.email}
          </span>
          <div className="sidebar-actions">
            {privacyButton}
            {themeButton}
            {categoriesButton}
            {logoutButton}
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-topbar">
          <Brand />
          <div className="topbar-actions">
            {privacyButton}
            {themeButton}
            {categoriesButton}
            {logoutButton}
          </div>
        </header>

        <main className="main-content">
          {user.verificationStale && <ReverifyBanner email={user.email} />}

          <div className="page-head">
            <h1>{current.label}</h1>
            <div className="page-controls">
              {section === 'overview' && (
                <div className="segmented" role="group" aria-label="Time range">
                  <button
                    className={overviewRange === 'month' ? 'active' : ''}
                    aria-pressed={overviewRange === 'month'}
                    onClick={() => setOverviewRange('month')}
                  >
                    Month
                  </button>
                  <button
                    className={overviewRange === 'year' ? 'active' : ''}
                    aria-pressed={overviewRange === 'year'}
                    onClick={() => setOverviewRange('year')}
                  >
                    Year
                  </button>
                </div>
              )}
              {showMonth && (
                <PeriodSwitcher
                  unit="month"
                  label={formatMonthLabel(month)}
                  onPrev={() => setMonth(shiftMonth(month, -1))}
                  onNext={() => setMonth(shiftMonth(month, 1))}
                />
              )}
              {showYear && (
                <PeriodSwitcher
                  unit="year"
                  label={year}
                  onPrev={() => setYear(year - 1)}
                  onNext={() => setYear(year + 1)}
                />
              )}
            </div>
          </div>

          {section === 'overview' && !showYear && <Dashboard month={month} refreshKey={refreshKey} onNavigate={go} />}
          {showYear && <YearView year={year} refreshKey={refreshKey} />}
          {section === 'transactions' && <Transactions month={month} categories={categories} onChange={bump} />}
          {section === 'budgets' && <Budgets month={month} categories={categories} onChange={bump} />}
          {section === 'bills' && <Bills month={month} categories={categories} onChange={bump} />}
          {section === 'networth' && <NetWorth />}
          {section === 'retirement' && <Retirement />}
        </main>
      </div>

      <nav className="bottom-tab-bar" aria-label="Main">
        {NAV_ITEMS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className={section === t.id ? 'active' : ''}
              aria-current={section === t.id ? 'page' : undefined}
              onClick={() => go(t.id)}
            >
              <Icon size={19} strokeWidth={2} />
              <span>{t.short || t.label}</span>
            </button>
          );
        })}
      </nav>

      {showCategories && (
        <CategoriesDrawer
          categories={categories}
          onClose={() => setShowCategories(false)}
          onChange={bump}
          user={user}
          onSignedOut={onLogout}
        />
      )}
    </div>
  );
}

function tokenForPath(path) {
  if (window.location.pathname !== path) return null;
  return new URLSearchParams(window.location.search).get('token');
}

const getResetToken = () => tokenForPath('/reset-password');
const getVerifyToken = () => tokenForPath('/verify-email');

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = logged out, object = logged in
  const [theme, setTheme] = useState(() => localStorage.getItem('wealthline-theme') || 'dark');
  const [resetToken, setResetToken] = useState(getResetToken);
  const [verifyToken, setVerifyToken] = useState(getVerifyToken);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('wealthline-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (resetToken || verifyToken) return; // mid-flow; don't race the auth check
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, [resetToken, verifyToken]);

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  if (verifyToken) {
    return (
      <VerifyEmail
        token={verifyToken}
        onVerified={(loggedInUser) => {
          window.history.replaceState({}, '', '/');
          setVerifyToken(null);
          setUser(loggedInUser);
        }}
        onBackToLogin={() => {
          window.history.replaceState({}, '', '/');
          setVerifyToken(null);
          setUser(null);
        }}
      />
    );
  }

  if (resetToken) {
    return (
      <ResetPassword
        token={resetToken}
        onDone={(loggedInUser) => {
          window.history.replaceState({}, '', '/');
          setResetToken(null);
          setUser(loggedInUser);
        }}
      />
    );
  }

  if (user === undefined) return <div className="loading">Loading…</div>;
  if (user === null) return <AuthScreen onAuthenticated={setUser} />;
  return <MainApp user={user} onLogout={logout} theme={theme} setTheme={setTheme} />;
}
