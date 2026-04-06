import React, { useState } from 'react';

const BASE = process.env.PUBLIC_URL || '';

export default function CodeGate({ onVerified }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const res = await fetch(`${BASE}/verify?code=${encodeURIComponent(code)}`);
    const { ok } = await res.json();
    if (ok) {
      onVerified();
    } else {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1>🎵 Music Quiz</h1>
        <form onSubmit={submit}>
          <input
            type="password"
            placeholder="Access code"
            value={code}
            onChange={e => setCode(e.target.value)}
            autoFocus
          />
          {error && <p style={{ color: '#e05', marginTop: 8 }}>Wrong code</p>}
          <button className="btn-primary" type="submit" disabled={loading || !code}>
            {loading ? '…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
