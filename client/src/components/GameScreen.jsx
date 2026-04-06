import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import NowPlaying from './NowPlaying';
import Timeline from './Timeline';

export default function GameScreen() {
  const { gameState, playerId, isHost, isActivePlayer, challenge, reveal, nextTurn } = useGame();
  const [countdown, setCountdown] = useState(null);

  const phase = gameState?.phase;

  useEffect(() => {
    if (phase === 'placed') {
      const seconds = gameState?.revealTimeoutSeconds ?? 10;
      setCountdown(seconds);
      const interval = setInterval(() => {
        setCountdown(c => (c <= 1 ? (clearInterval(interval), 0) : c - 1));
      }, 1000);
      return () => clearInterval(interval);
    } else if (phase === 'reveal') {
      const seconds = gameState?.nextTurnTimeoutSeconds ?? 5;
      setCountdown(seconds);
      const interval = setInterval(() => {
        setCountdown(c => (c <= 1 ? (clearInterval(interval), 0) : c - 1));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdown(null);
    }
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
        <span className="round-info">Round {gameState.round}</span>
        <span className={`phase-badge phase-${phase}`}>
          {phase === 'playing' && (isActivePlayer ? '🎵 Your turn!' : `🎵 ${activePlayer?.name}'s turn`)}
          {phase === 'placed' && '👀 Others can challenge'}
          {phase === 'reveal' && '🔍 Reveal'}
          {phase === 'gameover' && '🏆 Game over'}
        </span>
      </div>

      <NowPlaying />

      {/* Countdown + challenge area */}
      {phase === 'placed' && (
        <div className="challenge-area">
          {countdown > 0 && (
            <span className="countdown">{countdown}</span>
          )}
          {canChallenge && countdown > 0 && (
            <button className="btn-challenge" onClick={challenge}>
              ✋ Challenge!
            </button>
          )}
          {!isActivePlayer && gameState.players[playerId]?.challenged && (
            <span className="challenged-badge">✅ You challenged</span>
          )}
        </div>
      )}

      {/* Host manual reveal override */}
      {isHost && phase === 'placed' && (
        <div className="host-controls-game">
          <button className="btn-reveal" onClick={reveal}>🔍 Reveal now</button>
        </div>
      )}
      {isHost && phase === 'reveal' && (
        <div className="host-controls-game">
          <button className="btn-next" onClick={nextTurn}>Skip ({countdown}s) →</button>
        </div>
      )}

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
                  <span className="rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
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
