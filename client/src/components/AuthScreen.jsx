import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../api.js';

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await api.forgotPassword(email);
        setForgotSent(true);
      } else {
        const user = mode === 'login' ? await api.login(email, password) : await api.signup(email, password);
        onAuthenticated(user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setForgotSent(false);
  };

  const titles = { login: 'Log in', signup: 'Create your account', forgot: 'Reset your password' };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
          <span className="brand-mark">
            <Wallet size={15} strokeWidth={2.25} />
          </span>
          Wealthline
        </div>
        <h2 style={{ textAlign: 'center', marginTop: 0 }}>{titles[mode]}</h2>

        {error && <div className="error-box">{error}</div>}

        {mode === 'forgot' && forgotSent ? (
          <p className="empty-hint" style={{ textAlign: 'center' }}>
            If an account exists for that email, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <form onSubmit={submit} className="stack-gap-sm">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            {mode !== 'forgot' && (
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'signup' ? 8 : undefined}
                  required
                />
              </label>
            )}
            <button type="submit" className="primary-btn" disabled={busy} style={{ marginTop: 8 }}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}
            </button>
          </form>
        )}

        {mode === 'login' && (
          <p className="auth-switch">
            <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
              Forgot password?
            </button>
          </p>
        )}

        <p className="auth-switch">
          {mode === 'forgot' ? (
            <button type="button" className="link-btn" onClick={() => switchMode('login')}>
              Back to log in
            </button>
          ) : (
            <>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button type="button" className="link-btn" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
                {mode === 'login' ? 'Sign up' : 'Log in'}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
