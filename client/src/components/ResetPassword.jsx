import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../api.js';

export default function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const user = await api.resetPassword(token, password);
      onDone(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
          <span className="brand-mark">
            <Wallet size={15} strokeWidth={2.25} />
          </span>
          Wealthline
        </div>
        <h2 style={{ textAlign: 'center', marginTop: 0 }}>Set a new password</h2>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={submit} className="stack-gap-sm">
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button type="submit" className="primary-btn" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? 'Please wait…' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  );
}
