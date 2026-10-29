import React, { useState } from 'react';
import { Download, FileSpreadsheet, LogOut, Trash2 } from 'lucide-react';
import { api } from '../api.js';

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
