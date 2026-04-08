import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

export default function Lobby() {
  const { gameState, roomId, isHost, loadPlaylist, startGame, connectSpotify, spotifyToken } = useGame();
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [manualMode, setManualMode] = useState(false);

  const players = Object.entries(gameState?.players || {});
  const hasPresets = gameState.playlists?.length > 0;

  return (
    <div className="lobby">
      <div className="room-code">
        <span>Room code:</span>
        <strong>{roomId}</strong>
        <button className="btn-copy" onClick={() => navigator.clipboard.writeText(roomId)}>
          📋 Copy
        </button>
      </div>

      <div className="player-list">
        <h3>Players ({players.length})</h3>
        {players.map(([id, p]) => (
          <div key={id} className="player-chip">
            {p.name}
            {gameState.hostId === id && <span className="host-badge">👑 Host</span>}
          </div>
        ))}
      </div>

      {isHost && (
        <div className="host-controls">
          <div className="lobby-section">
            <span className="lobby-label">Spotify</span>
            {spotifyToken
              ? <p className="success">✅ Connected</p>
              : <button className="btn-connect-spotify" onClick={connectSpotify}>Connect Spotify</button>
            }
          </div>

          <div className="lobby-section">
            <span className="lobby-label">Playlist</span>
            {hasPresets && !manualMode ? (
              <div className="input-row">
                <select
                  className="playlist-select"
                  value={playlistUrl}
                  onChange={e => setPlaylistUrl(e.target.value)}
                >
                  <option value="">– Select –</option>
                  {gameState.playlists.map(p => (
                    <option key={p.url} value={p.url}>{p.name}</option>
                  ))}
                </select>
                <button className="btn-primary" onClick={() => loadPlaylist(playlistUrl)} disabled={!playlistUrl}>
                  Load
                </button>
              </div>
            ) : (
              <div className="input-row">
                <input
                  type="text"
                  placeholder="https://open.spotify.com/playlist/..."
                  value={playlistUrl}
                  onChange={e => setPlaylistUrl(e.target.value)}
                />
                <button className="btn-primary" onClick={() => loadPlaylist(playlistUrl)} disabled={!playlistUrl}>
                  Load
                </button>
              </div>
            )}
            {hasPresets && (
              <button className="btn-ghost" onClick={() => { setManualMode(m => !m); setPlaylistUrl(''); }}>
                {manualMode ? '← Back to presets' : 'Enter URL manually'}
              </button>
            )}
            {gameState.playlist && (
              <p className="success">✅ {gameState.playlist.tracks.length} songs loaded</p>
            )}
          </div>

          <button
            className="btn-start"
            disabled={!gameState.playlist || players.length < 1}
            onClick={startGame}
          >
            🎵 Start game
          </button>
        </div>
      )}

      {!isHost && (
        <p className="waiting">⏳ Waiting for the host…</p>
      )}
    </div>
  );
}
