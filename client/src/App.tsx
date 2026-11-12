import { useState } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import CodeGate from './components/CodeGate';
import JoinScreen from './components/JoinScreen';
import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { STORAGE_KEYS } from './hooks/useGameSocket';
import './App.css';

function AppInner() {
  const { connected, gameState, roomId, error, clearError } = useGame();

  return (
    <div className="app">
      {!connected && (
        <div className="connecting-banner">⏳ Connecting to server…</div>
      )}
      {error && (
        <div
          className="error-toast"
          onClick={clearError}
          style={{ cursor: 'pointer' }}
        >
          ❌ {error} <span style={{ marginLeft: 8, opacity: 0.7 }}>✕</span>
        </div>
      )}

      {!roomId && <JoinScreen />}
      {roomId && gameState?.phase === 'lobby' && <Lobby />}
      {roomId && gameState?.phase !== 'lobby' && <GameScreen />}
    </div>
  );
}

export default function App() {
  const [verified, setVerified] = useState(
    () => !!localStorage.getItem(STORAGE_KEYS.CODE)
  );

  if (!verified)
    return (
      <CodeGate
        onVerified={(code) => {
          localStorage.setItem(STORAGE_KEYS.CODE, code);
          setVerified(true);
        }}
      />
    );

  return (
    <ErrorBoundary>
      <GameProvider>
        <AppInner />
      </GameProvider>
    </ErrorBoundary>
  );
}
