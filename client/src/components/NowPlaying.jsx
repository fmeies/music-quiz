import React, { useRef, useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';

export default function NowPlaying() {
  const { gameState, isHost, spotifyToken } = useGame();
  const [playing, setPlaying] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [sdkError, setSdkError] = useState(null);
  const playerRef = useRef(null);

  const card = gameState?.currentCard;
  const phase = gameState?.phase;

  // Load Spotify Web Playback SDK and init player
  useEffect(() => {
    if (!isHost || !spotifyToken) return;

    const initPlayer = () => {
      if (playerRef.current) return; // already initialized

      const player = new window.Spotify.Player({
        name: 'Music Quiz',
        getOAuthToken: cb => cb(spotifyToken),
        volume: 0.8,
      });

      player.addListener('ready', async ({ device_id }) => {
        console.log('Spotify SDK ready, device_id:', device_id);
        // Transfer playback to this browser device
        await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${spotifyToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_ids: [device_id], play: false }),
        });
        setDeviceId(device_id);
        setSdkError(null);
      });
      player.addListener('not_ready', () => setDeviceId(null));
      player.addListener('player_state_changed', state => {
        if (!state) return;
        setPlaying(!state.paused);
      });
      player.addListener('initialization_error', ({ message }) => {
        console.error('SDK init error:', message);
        setSdkError('Init-Fehler: ' + message);
      });
      player.addListener('authentication_error', ({ message }) => {
        console.error('SDK auth error:', message);
        setSdkError('Auth-Fehler: ' + message);
      });
      player.addListener('account_error', ({ message }) => {
        console.error('SDK account error:', message);
        setSdkError('Account-Fehler (Premium nötig): ' + message);
      });

      player.connect();
      playerRef.current = player;
    };

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      if (!document.getElementById('spotify-sdk')) {
        const script = document.createElement('script');
        script.id = 'spotify-sdk';
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        document.body.appendChild(script);
      }
    }

    return () => {
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [isHost, spotifyToken]);

  // Pause when round ends
  useEffect(() => {
    if (phase !== 'playing') {
      playerRef.current?.pause();
      setPlaying(false);
    }
  }, [phase]);

  const togglePlay = async () => {
    if (!deviceId || !spotifyToken || !card) return;
    if (playing) {
      playerRef.current.pause();
    } else {
      const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${spotifyToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [`spotify:track:${card.trackId}`] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('Play API error:', res.status, body);
        setSdkError(`Play fehlgeschlagen (${res.status}): ${body?.error?.message || ''}`);
      }
    }
  };

  if (!card) return null;

  return (
    <div className="now-playing">
      <div className="now-playing-inner">
        <div className="album-art-slot">
          {card.albumArt && (
            <img
              src={card.albumArt}
              alt="Album Art"
              className="album-art"
              style={{ visibility: (phase === 'reveal' || phase === 'gameover') ? 'visible' : 'hidden' }}
            />
          )}
        </div>

        <div className="song-info">
          {phase === 'reveal' || phase === 'gameover' ? (
            <>
              <span className="song-title">{card.title}</span>
              <span className="song-artist">{card.artist}</span>
              <span className="song-year reveal-year">{card.year}</span>
            </>
          ) : (
            <>
              <span className="mystery-label">🎵 Which song is this?</span>
              <span className="mystery-sub">Place it in your timeline!</span>
            </>
          )}
        </div>

        <div className="player-controls">
          {sdkError && <span className="hint" style={{color:'red'}}>❌ {sdkError}</span>}
          {isHost && !sdkError && (
            deviceId ? (
              <button className="btn-play" onClick={togglePlay}>
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
            ) : (
              <span className="hint">⏳ Connecting to Spotify…</span>
            )
          )}
          {!isHost && (phase === 'playing' || phase === 'placed') && (
            <span className="hint">The host is playing the song</span>
          )}
        </div>
      </div>
    </div>
  );
}
