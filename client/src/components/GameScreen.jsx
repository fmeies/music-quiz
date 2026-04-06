import React from 'react';
import { useGame } from '../context/GameContext';
import NowPlaying from './NowPlaying';
import Timeline from './Timeline';

export default function GameScreen() {
  const { gameState, playerId, isHost, isActivePlayer, challenge, reveal, nextTurn } = useGame();

  if (!gameState) return null;

  const players = Object.entries(gameState.players);
  const phase = gameState.phase;
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

      {/* Challenge button for non-active players */}
      {canChallenge && (
        <div className="challenge-area">
          <button className="btn-challenge" onClick={challenge}>
            ✋ Challenge!
          </button>
        </div>
      )}
      {phase === 'placed' && !isActivePlayer && gameState.players[playerId]?.challenged && (
        <div className="challenge-area">
          <span className="challenged-badge">✅ You challenged</span>
        </div>
      )}

      {/* Host controls */}
      {isHost && phase === 'placed' && (
        <div className="host-controls-game">
          <button className="btn-reveal" onClick={reveal}>🔍 Reveal</button>
        </div>
      )}
      {isHost && phase === 'reveal' && (
        <div className="host-controls-game">
          <button className="btn-next" onClick={nextTurn}>Next player →</button>
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
