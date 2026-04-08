import React, { useState } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import CodeGate from './components/CodeGate';
import JoinScreen from './components/JoinScreen';
import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import './App.css';

function AppInner() {
  const { connected, gameState, roomId, error } = useGame();

  return (
    <div className="app">
      {!connected && (
        <div className="connecting-banner">⏳ Connecting to server…</div>
      )}
      {error && (
        <div className="error-toast">❌ {error}</div>
      )}

      {!roomId && <JoinScreen />}
      {roomId && gameState?.phase === 'lobby' && <Lobby />}
      {roomId && gameState?.phase !== 'lobby' && <GameScreen />}
    </div>
  );
}

export default function App() {
  const [verified, setVerified] = useState(() => localStorage.getItem('mqVerified') === '1');

  if (!verified) return <CodeGate onVerified={() => { localStorage.setItem('mqVerified', '1'); setVerified(true); }} />;

  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  );
}
