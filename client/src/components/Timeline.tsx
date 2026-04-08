import React from 'react';
import { useGame } from '../context/GameContext';
import type { PublicTimelineCard } from '../types';

function TimelineCard({ card }: { card: PublicTimelineCard }) {
  if (!card.title) {
    return (
      <div className="timeline-card">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 4,
            background: '#333',
            flexShrink: 0,
          }}
        />
        <div className="card-info">
          <span className="card-title" style={{ color: '#555' }}>
            ???
          </span>
          <span className="card-artist" style={{ color: '#555' }}>
            ???
          </span>
          <span className="card-year" style={{ color: '#555' }}>
            ?
          </span>
        </div>
      </div>
    );
  }
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

function DropZone({
  index,
  onClick,
}: {
  index: number;
  onClick: (index: number) => void;
}) {
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

export default function Timeline({ playerId }: { playerId: string | null }) {
  const { gameState, placeCard, playerId: myId, isActivePlayer } = useGame();

  const player = playerId ? gameState?.players?.[playerId] : null;
  if (!player) return null;

  const isMe = playerId === myId;
  const isActiveTimeline = playerId === gameState?.currentPlayerId;
  const phase = gameState?.phase;
  const canPlace = isMe && isActivePlayer && phase === 'playing';
  const timeline = player.timeline;

  const handleDrop = (position: number) => {
    if (!canPlace) return;
    placeCard(position);
  };

  return (
    <div
      className={`timeline-wrapper ${isMe ? 'mine' : ''} ${isActiveTimeline ? 'active-player' : ''}`}
    >
      <div className="timeline-player-name">
        {player.name}
        {isMe && ' (You)'}
        {isActiveTimeline && <span className="turn-badge">🎵 active</span>}
        <span className="score-badge">⭐ {player.score}</span>
        {player.challenged && phase === 'placed' && (
          <span className="challenged-badge">✋</span>
        )}
      </div>

      <div className="timeline">
        {canPlace && <DropZone index={0} onClick={handleDrop} />}

        {timeline.length === 0 && (
          <div className="timeline-empty">
            {canPlace ? 'Click ▼ to place your first card' : 'No cards yet'}
          </div>
        )}

        {timeline.map((card, i) => (
          <React.Fragment key={card.trackId}>
            <TimelineCard card={card} />
            {canPlace && <DropZone index={i + 1} onClick={handleDrop} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
