import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

export default function Lobby() {
  const { gameState, roomId, isHost, loadPlaylist, startGame, connectSpotify, spotifyToken } = useGame();
  const [playlistUrl, setPlaylistUrl] = useState(gameState?.defaultPlaylistUrl || '');

  const players = Object.entries(gameState?.players || {});

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
          <h3>Spotify</h3>
          {spotifyToken ? (
            <p className="success">✅ Spotify connected</p>
          ) : (
            <button className="btn-primary" onClick={connectSpotify}>
              Connect Spotify
            </button>
          )}

          <h3>Playlist</h3>
          {gameState.playlists?.length > 0 && (
            <select
              className="playlist-select"
              value={playlistUrl}
              onChange={e => setPlaylistUrl(e.target.value)}
            >
              <option value="">– Select playlist –</option>
              {gameState.playlists.map(p => (
                <option key={p.url} value={p.url}>{p.name}</option>
              ))}
              <option value="">– Enter URL manually –</option>
            </select>
          )}
          <div className="input-row">
            <input
              type="text"
              placeholder="https://open.spotify.com/playlist/..."
              value={playlistUrl}
              onChange={e => setPlaylistUrl(e.target.value)}
            />
            <button className="btn-primary" onClick={() => loadPlaylist(playlistUrl)}>
              Load
            </button>
          </div>
          {gameState.playlist && (
            <p className="success">✅ {gameState.playlist.tracks.length} songs loaded</p>
          )}

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
