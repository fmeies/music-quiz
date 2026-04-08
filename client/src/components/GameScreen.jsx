import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import NowPlaying from './NowPlaying';
import Timeline from './Timeline';

export default function GameScreen() {
  const {
    gameState,
    playerId,
    roomId,
    isHost,
    isActivePlayer,
    challenge,
    nextTurn,
  } = useGame();
  const [countdown, setCountdown] = useState(null);

  const phase = gameState?.phase;

  useEffect(() => {
    if (phase === 'placed') {
      const totalMs = (gameState?.revealTimeoutSeconds ?? 10) * 1000;
      const elapsed = gameState?.placedAt ? Date.now() - gameState.placedAt : 0;
      const remainingMs = Math.max(0, totalMs - elapsed);
      setCountdown(Math.ceil(remainingMs / 1000));
      if (remainingMs <= 0) return;
      const interval = setInterval(() => {
        setCountdown((c) => (c <= 1 ? (clearInterval(interval), 0) : c - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
    setCountdown(null);
  }, [phase, gameState?.currentPlayerId, gameState?.round]);

  if (!gameState) return null;

  const players = Object.entries(gameState.players);
  const activePlayer = gameState.players[gameState.currentPlayerId];

  const canChallenge =
    phase === 'placed' &&
    !isActivePlayer &&
    !gameState.players[playerId]?.challenged;

  return (
    <div className="game-screen">
      <div className="game-header">
        <span className="round-info">
          Round {gameState.round} · {roomId}
        </span>

        <span className={`phase-badge phase-${phase}`}>
          {phase === 'playing' &&
            (isActivePlayer
              ? '🎵 Your turn!'
              : `🎵 ${activePlayer?.name}'s turn`)}
          {phase === 'placed' && '👀 Challenge phase'}
          {phase === 'reveal' && '🔍 Reveal'}
          {phase === 'gameover' && '🏆 Game over'}
        </span>

        <div className="header-actions">
          {phase === 'placed' && countdown > 0 && (
            <span className="countdown">{countdown}</span>
          )}
          {canChallenge && phase === 'placed' && countdown > 0 && (
            <button className="btn-challenge" onClick={challenge}>
              ✋ Challenge!
            </button>
          )}
          {!isActivePlayer &&
            gameState.players[playerId]?.challenged &&
            phase === 'placed' && (
              <span className="challenged-badge">✅ Challenged</span>
            )}
          {isHost && phase === 'reveal' && (
            <button className="btn-next" onClick={nextTurn}>
              Next →
            </button>
          )}
        </div>
      </div>

      <NowPlaying />

      {/* Timelines */}
      <div className="timelines-container">
        {/* Active player's timeline first */}
        <Timeline playerId={gameState.currentPlayerId} />
        {/* Other players */}
        {players
          .filter(([id]) => id !== gameState.currentPlayerId)
          .map(([id]) => (
            <Timeline key={id} playerId={id} />
          ))}
      </div>

      {phase === 'gameover' && (
        <div className="gameover-overlay">
          <h2>🏆 Game over!</h2>
          <div className="final-scores">
            {players
              .sort(([, a], [, b]) => b.score - a.score)
              .map(([id, p], i) => (
                <div key={id} className="final-score-row">
                  <span className="rank">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                  </span>
                  <span className="pname">{p.name}</span>
                  <span className="pscore">{p.score} pts</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
