import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, LogOut, Trash2, Mail } from 'lucide-react';
import { api } from '../api.js';

function lastMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Monthly recap email: opt-in toggle, plus a way to see the report right now.
function MonthlyRecapSettings() {
  const [prefs, setPrefs] = useState(null);
  const [month, setMonth] = useState(lastMonth());
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getRecapPrefs()
      .then(setPrefs)
      .catch(() => setPrefs({ monthlyRecap: false, emailConfigured: false }));
  }, []);

  const toggle = async (on) => {
    setStatus('');
    try {
      setPrefs(await api.setRecapPrefs(on));
    } catch (err) {
      setStatus(err.message);
    }
  };

  const download = async () => {
    setStatus('');
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/monthly.xlsx?month=${month}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Wealthline ${month} recap.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    setStatus('');
    setBusy(true);
    try {
      const r = await api.sendRecapNow(month);
      setStatus(
        r.delivered ? `Sent to ${r.to}.` : 'Email sending isn’t set up on the server yet, so nothing was delivered.'
      );
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!prefs) return null;
  return (
    <div className="recap-settings">
      <div className="category-type-heading">Monthly email recap</div>
      <label className="toggle-row">
        <input type="checkbox" checked={prefs.monthlyRecap} onChange={(e) => toggle(e.target.checked)} />
        <span>
          <strong>Email me a recap on the 1st of each month</strong>
          <span className="empty-hint" style={{ display: 'block', margin: '2px 0 0' }}>
            Last month's income, spending and savings, what to do next, and an Excel file with charts.
          </span>
        </span>
      </label>
      {!prefs.emailConfigured && (
        <p className="empty-hint">Email sending isn't set up on the server yet, so recaps can't be delivered.</p>
      )}
      <div className="account-actions" style={{ alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem' }}>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button className="secondary-btn" onClick={download} disabled={busy || !month}>
          <FileSpreadsheet size={14} />
          Download report
        </button>
        <button className="secondary-btn" onClick={sendNow} disabled={busy || !month}>
          <Mail size={14} />
          Email it to me now
        </button>
      </div>
      {status && (
        <p className="empty-hint" role="status">
          {status}
        </p>
      )}
    </div>
  );
}

export default function AccountSettings({ user, onSignedOut }) {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const exportAll = async () => {
    setError('');
    try {
      const data = await api.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wealthline-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  // Binary download, so this bypasses the JSON api helper.
  const downloadExcel = async () => {
    setError('');
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    setBusy(true);
    try {
      await api.signOutEverywhere();
      onSignedOut();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError('');
    try {
      await api.deleteAccount(password);
      onSignedOut();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="category-type-heading">Account</div>
      <p className="empty-hint" style={{ marginTop: 0 }}>
        Signed in as {user.email}
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="account-actions">
        <button className="secondary-btn" onClick={downloadExcel} disabled={busy}>
          <FileSpreadsheet size={14} />
          Download Excel workbook
        </button>
        <button className="secondary-btn" onClick={exportAll}>
          <Download size={14} />
          Export raw data (JSON)
        </button>
        <button className="secondary-btn" onClick={signOutEverywhere} disabled={busy}>
          <LogOut size={14} />
          Sign out on all devices
        </button>
      </div>

      <MonthlyRecapSettings />

      <div className="category-type-heading" style={{ color: 'var(--expense)' }}>
        Danger zone
      </div>

      {!confirming ? (
        <button className="secondary-btn danger-outline" onClick={() => setConfirming(true)}>
          <Trash2 size={14} />
          Delete my account
        </button>
      ) : (
        <div className="confirm-box" style={{ background: 'var(--expense-soft)', borderColor: 'var(--expense)' }}>
          <strong>This permanently deletes your account</strong> and every transaction, budget, bill, account and goal
          in it. This cannot be undone — export your data first if you want a copy.
          <div className="form-row" style={{ marginTop: 12, marginBottom: 0 }}>
            <label className="grow">
              Confirm your password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="danger-btn" onClick={deleteAccount} disabled={busy || !password}>
              {busy ? 'Deleting…' : 'Permanently delete'}
            </button>
            <button className="secondary-btn" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
