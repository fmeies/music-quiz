import React, { useState } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import CodeGate from './components/CodeGate';
import JoinScreen from './components/JoinScreen';
import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import './App.css';

function AppInner() {
  const { connected, gameState, roomId, notification, error } = useGame();

  return (
    <div className="app">
      {!connected && (
        <div className="connecting-banner">⏳ Connecting to server…</div>
      )}
      {notification && (
        <div className="notification">{notification}</div>
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
  const [verified, setVerified] = useState(false);

  if (!verified) return <CodeGate onVerified={() => setVerified(true)} />;

  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  );
}
