import React, { useEffect, useRef, useState } from 'react';
import { Wallet, Check, AlertTriangle } from 'lucide-react';
import { api } from '../api.js';

export default function VerifyEmail({ token, onVerified, onBackToLogin }) {
  const [state, setState] = useState('working'); // working | ok | failed
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invoke would burn the token
    ran.current = true;
    api
      .verifyEmail(token)
      .then((user) => {
        setState('ok');
        setTimeout(() => onVerified(user), 900);
      })
      .catch((err) => {
        setError(err.message);
        setState('failed');
      });
  }, [token, onVerified]);

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
          <span className="brand-mark">
            <Wallet size={15} strokeWidth={2.25} />
          </span>
          Wealthline
        </div>

        {state === 'working' && <p className="empty-hint">Confirming your email…</p>}

        {state === 'ok' && (
          <>
            <div className="import-done-icon">
              <Check size={26} />
            </div>
            <h2 style={{ marginBottom: 6 }}>Email confirmed</h2>
            <p className="empty-hint">Signing you in…</p>
          </>
        )}

        {state === 'failed' && (
          <>
            <div className="import-done-icon" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
              <AlertTriangle size={24} />
            </div>
            <h2 style={{ marginBottom: 6 }}>Link didn't work</h2>
            <p className="empty-hint">{error}</p>
            <button className="primary-btn" style={{ marginTop: 16 }} onClick={onBackToLogin}>
              Back to log in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
