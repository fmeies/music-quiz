import { useRef, useEffect, useState } from 'react';
import type { Phase, PublicCard } from '../types';

export interface SpotifyPlayerControls {
  deviceId: string | null;
  sdkError: string | null;
  playing: boolean;
  togglePlay: () => Promise<void>;
}

export function useSpotifyPlayer(
  isHost: boolean,
  spotifyToken: string | null,
  card: PublicCard | null | undefined,
  phase: Phase | undefined
): SpotifyPlayerControls {
  const playerRef = useRef<Spotify.Player | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // Initialize Spotify Web Playback SDK
  useEffect(() => {
    if (!isHost || !spotifyToken) return;

    const initPlayer = () => {
      if (playerRef.current) return;

      const player = new window.Spotify.Player({
        name: 'Music Quiz',
        getOAuthToken: (cb) => cb(spotifyToken),
        volume: 0.8,
      });

      player.addListener('ready', async ({ device_id }) => {
        console.log('Spotify SDK ready, device_id:', device_id);
        const res = await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${spotifyToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ device_ids: [device_id], play: false }),
        });
        console.log('Transfer playback status:', res.status);
        if (!res.ok && res.status !== 204) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          console.error('Transfer playback failed:', res.status, body);
          setSdkError(
            `Spotify error (${res.status}): ${body?.error?.message || 'transfer playback failed'}`
          );
          return;
        }
        // Wait briefly for Spotify backend to propagate the device switch
        // before allowing auto-play, otherwise the play request can silently
        // land on a different device.
        await new Promise((resolve) => setTimeout(resolve, 500));
        setDeviceId(device_id);
        setSdkError(null);
      });
      player.addListener('not_ready', () => setDeviceId(null));
      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        const nowPlaying = !state.paused;
        console.log('Player state changed:', { paused: state.paused });
        setPlaying(nowPlaying);
      });
      player.addListener('initialization_error', ({ message }) => {
        console.error('SDK init error:', message);
        setSdkError('Init error: ' + message);
      });
      player.addListener('authentication_error', ({ message }) => {
        console.error('SDK auth error:', message);
        setSdkError('Auth error: ' + message);
      });
      player.addListener('account_error', ({ message }) => {
        console.error('SDK account error:', message);
        setSdkError('Account error (Spotify Premium required): ' + message);
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

  // Auto-play when a new track starts (or when deviceId becomes available for the current track)
  const playedTrackRef = useRef<string | null>(null);
  useEffect(() => {
    console.log('Auto-play effect:', { phase, isHost, deviceId, trackId: card?.trackId });
    if (phase !== 'playing' || !isHost || !deviceId || !spotifyToken || !card)
      return;
    if (playedTrackRef.current === card.trackId) return;
    playedTrackRef.current = card.trackId;

    const doPlay = (attempt: number) => {
      console.log(`Auto-play: starting track ${card.trackId} (attempt ${attempt})`);
      fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${spotifyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [`spotify:track:${card.trackId}`] }),
      })
        .then((res) => {
          console.log('Auto-play response status:', res.status);
          if (!res.ok)
            res
              .json()
              .catch(() => ({}))
              .then((body: { error?: { message?: string } }) =>
                setSdkError(
                  `Playback failed (${res.status}): ${body?.error?.message || ''}`
                )
              );
        })
        .catch((err: Error) => setSdkError(`Playback error: ${err.message}`));
    };

    doPlay(1);

    // Retry once after 3 s if player_state_changed never confirmed playback.
    // This recovers the case where the play request silently lands on a
    // different Spotify device and our SDK player never fires player_state_changed.
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      if (!playingRef.current) {
        console.log('Auto-play: no playback confirmed after 3s, retrying');
        doPlay(2);
      }
    }, 3000);

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [card?.trackId, deviceId, phase, isHost, spotifyToken]);

  // Pause when game is over
  useEffect(() => {
    if (phase === 'gameover') {
      playerRef.current?.pause();
      setPlaying(false);
    }
  }, [phase]);

  const togglePlay = async () => {
    if (!deviceId || !spotifyToken || !card) return;
    if (playing) {
      playerRef.current?.pause();
    } else {
      const res = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${spotifyToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: [`spotify:track:${card.trackId}`] }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        console.error('Play API error:', res.status, body);
        setSdkError(
          `Playback failed (${res.status}): ${body?.error?.message || ''}`
        );
      }
    }
  };

  return { deviceId, sdkError, playing, togglePlay };
}
