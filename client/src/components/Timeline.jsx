import React from 'react';
import { useGame } from '../context/GameContext';

function TimelineCard({ card }) {
  return (
    <div className="timeline-card">
      {card.albumArt && <img src={card.albumArt} alt="" />}
      <div className="card-info">
        <span className="card-title">{card.title}</span>
        <span className="card-artist">{card.artist}</span>
        {card.year && <span className="card-year">{card.year}</span>}
      </div>
    </div>
  );
}

function DropZone({ index, onClick }) {
  return (
    <button
      className="drop-zone active"
      onClick={() => onClick(index)}
      title={`Place here (position ${index + 1})`}
    >
      ▼
    </button>
  );
}

export default function Timeline({ playerId }) {
  const { gameState, placeCard, playerId: myId, isActivePlayer } = useGame();

  const player = gameState?.players?.[playerId];
  if (!player) return null;

  const isMe = playerId === myId;
  const isActiveTimeline = playerId === gameState.currentPlayerId;
  const phase = gameState.phase;
  const canPlace = isMe && isActivePlayer && phase === 'playing';
  const timeline = player.timeline;

  const handleDrop = (position) => {
    if (!canPlace) return;
    placeCard(position);
  };

  return (
    <div className={`timeline-wrapper ${isMe ? 'mine' : ''} ${isActiveTimeline ? 'active-player' : ''}`}>
      <div className="timeline-player-name">
        {player.name}
        {isMe && ' (Du)'}
        {isActiveTimeline && <span className="turn-badge">🎵 active</span>}
        <span className="score-badge">⭐ {player.score}</span>
        {player.challenged && phase === 'placed' && <span className="challenged-badge">✋</span>}
      </div>

      <div className="timeline">
        {canPlace && (
          <DropZone index={0} onClick={handleDrop} />
        )}

        {timeline.length === 0 && (
          <div className="timeline-empty">
            {canPlace ? 'Click ▼ to place your first card' : 'No cards yet'}
          </div>
        )}

        {timeline.map((card, i) => (
          <React.Fragment key={card.trackId + i}>
            <TimelineCard card={card} />
            {canPlace && (
              <DropZone index={i + 1} onClick={handleDrop} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
