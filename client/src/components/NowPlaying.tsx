import { useGame } from '../context/GameContext';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import type { LastResult, PublicPlayer } from '../types';

function getResultDisplay(
  result: LastResult,
  isActivePlayer: boolean,
  me: PublicPlayer | undefined
): { isRight: boolean; label: string } {
  if (isActivePlayer) {
    return {
      isRight: result.correct,
      label: `${me?.name} ${result.correct ? 'is right' : 'is wrong'}!`,
    };
  }
  if (me?.challenged) {
    const isRight = !result.correct;
    return {
      isRight,
      label: `${me?.name} ${isRight ? 'is right' : 'is wrong'}!`,
    };
  }
  const label = result.correct
    ? `${result.playerName} is right!`
    : result.challenger
      ? `${result.challenger} is right!`
      : `${result.playerName} is wrong!`;
  return { isRight: result.correct, label };
}

export default function NowPlaying() {
  const { gameState, isHost, isActivePlayer, me, spotifyToken } = useGame();

  const card = gameState?.currentCard;
  const phase = gameState?.phase;
  const result = gameState?.lastResult;
  const revealDisplay =
    phase === 'reveal' && result
      ? getResultDisplay(result, isActivePlayer, me)
      : null;

  const { deviceId, sdkError, playing, togglePlay } = useSpotifyPlayer(
    isHost,
    spotifyToken,
    card,
    phase
  );

  if (!card) return null;

  return (
    <div className="now-playing">
      <div className="now-playing-inner">
        {(phase === 'reveal' || phase === 'gameover') && card.albumArt && (
          <img src={card.albumArt} alt="Album Art" className="album-art" />
        )}

        <div className="song-info">
          {phase === 'reveal' || phase === 'gameover' ? (
            <>
              <span className="song-title">{card.title}</span>
              <span className="song-artist">{card.artist}</span>
              <span className="song-year reveal-year">{card.year}</span>
              {revealDisplay && (
                <span
                  className={`result-label ${revealDisplay.isRight ? 'result-right' : 'result-wrong'}`}
                >
                  {revealDisplay.label}
                </span>
              )}
              {result?.challenger && (
                <span className="challenge-note">
                  ✋ {result.challenger} challenged
                </span>
              )}
            </>
          ) : (
            <>
              <span className="mystery-label">🎵 Which song is this?</span>
              <span className="mystery-sub">Place it in your timeline!</span>
            </>
          )}
        </div>

        <div className="player-controls">
          {sdkError && (
            <span className="hint" style={{ color: 'red' }}>
              ❌ {sdkError}
            </span>
          )}
          {isHost &&
            spotifyToken &&
            !sdkError &&
            (deviceId ? (
              <button className="btn-play" onClick={togglePlay}>
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
            ) : (
              <span className="hint">⏳ Connecting to Spotify…</span>
            ))}
          {!isHost && (phase === 'playing' || phase === 'placed') && (
            <span className="hint">The host is playing the song</span>
          )}
        </div>
      </div>
    </div>
  );
}
