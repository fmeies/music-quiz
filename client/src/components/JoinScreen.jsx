import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';

const isMobile = window.matchMedia('(pointer: coarse)').matches;
const BASE = import.meta.env.DEV ? '' : import.meta.env.BASE_URL.slice(0, -1);

export default function JoinScreen() {
  const { createRoom, joinRoom } = useGame();
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`${BASE}/rooms/single`)
      .then(r => r.json())
      .then(({ roomId }) => {
        if (roomId) {
          setCode(roomId);
          setMode('join');
        }
      })
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return setErr('Please enter your name');
    try { await createRoom(name.trim()); }
    catch (e) { setErr(e); }
  };

  const handleJoin = async () => {
    if (!name.trim()) return setErr('Please enter your name');
    if (!code.trim()) return setErr('Please enter a room code');
    try { await joinRoom(code.trim(), name.trim()); }
    catch (e) { setErr(e); }
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1>🎵 Music Quiz</h1>
        <p className="tagline">The music quiz — who knows the year?</p>

        {!mode && (
          <div className="mode-buttons">
            {!isMobile && (
              <button className="btn-primary" onClick={() => setMode('create')}>
                🏠 Create room
              </button>
            )}
            <button className="btn-secondary" onClick={() => setMode('join')}>
              🚪 Join room
            </button>
          </div>
        )}

        {mode && (
          <div className="form">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (mode === 'create' ? handleCreate() : handleJoin())}
              autoFocus
            />
            {mode === 'join' && (
              <input
                type="text"
                placeholder="Room code (e.g. ABC12)"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                maxLength={5}
              />
            )}
            {err && <p className="error">{err}</p>}
            <div className="form-buttons">
              <button className="btn-ghost" onClick={() => { setMode(null); setErr(''); }}>
                ← Back
              </button>
              <button
                className="btn-primary"
                onClick={mode === 'create' ? handleCreate : handleJoin}
              >
                {mode === 'create' ? 'Create' : 'Join'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
