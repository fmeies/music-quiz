import 'dotenv/config';
import * as crypto from 'crypto';
import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import {
  generateRoomId,
  generateId,
  createRoom,
  roomPublicState,
  pickRandomTrack,
  makeRateLimiter,
  applyReveal,
  advanceTurn,
  defaultSettings,
  checkGameover,
} from './gameLogic';
import {
  getSpotifyToken,
  getPlaylistTracks,
  enrichCurrentCardYear,
  ENRICH_TIMEOUT_MS,
} from './spotifyService';
import type { RoomSettings } from './types';
import type { Room } from './types';

const REQUIRED_ENV = [
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'REDIRECT_URI',
  'APP_CODE',
  'APP_URL',
];
if (require.main === module) {
  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missingEnv.length) {
    console.error(
      `[Config] Missing required environment variables: ${missingEnv.join(', ')}`
    );
    process.exit(1);
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.APP_URL || '*', methods: ['GET', 'POST'] },
});

app.use(express.json());

// ─── In-Memory Game State ────────────────────────────────────────────────────

const rooms: Record<string, Room> = {};
let globalDefaultSettings = defaultSettings();
const revealTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const inactivityTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const disconnectTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const autoAdvanceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

const INACTIVITY_MS = 60 * 60 * 1000; // 60 minutes
const MAX_PLAYER_NAME_LENGTH = 30;
const DISCONNECT_GRACE_PERIOD_MS = 10000;

function clearAutoAdvanceTimer(roomId: string): void {
  if (autoAdvanceTimers[roomId]) {
    clearTimeout(autoAdvanceTimers[roomId]);
    delete autoAdvanceTimers[roomId];
  }
}

function clearRevealTimer(roomId: string): void {
  if (revealTimers[roomId]) {
    clearTimeout(revealTimers[roomId]);
    delete revealTimers[roomId];
  }
}

function clearPlayerTimer(playerId: string): void {
  if (disconnectTimers[playerId]) {
    clearTimeout(disconnectTimers[playerId]);
    delete disconnectTimers[playerId];
  }
}

function deleteRoom(roomId: string): void {
  const room = rooms[roomId];
  if (room) Object.keys(room.players).forEach(clearPlayerTimer);
  clearRevealTimer(roomId);
  clearAutoAdvanceTimer(roomId);
  if (inactivityTimers[roomId]) {
    clearTimeout(inactivityTimers[roomId]);
    delete inactivityTimers[roomId];
  }
  delete rooms[roomId];
}

function resetInactivityTimer(roomId: string): void {
  if (inactivityTimers[roomId]) clearTimeout(inactivityTimers[roomId]);
  inactivityTimers[roomId] = setTimeout(() => {
    deleteRoom(roomId);
    console.log(`Room ${roomId} removed after 60 min inactivity`);
  }, INACTIVITY_MS);
}

// ─── Spotify Helpers ─────────────────────────────────────────────────────────
// Functions moved to spotifyService.ts

function triggerNextTurn(roomId: string): void {
  const room = rooms[roomId];
  if (!room || room.phase !== 'reveal') return;

  if (!advanceTurn(room)) {
    room.gameoverReason = 'no_players';
    io.to(roomId).emit('gameState', roomPublicState(room));
    return;
  }

  if (!startTurn(room, roomId)) {
    room.phase = 'gameover';
    room.gameoverReason = 'no_tracks';
    io.to(roomId).emit('gameState', roomPublicState(room));
    return;
  }

  io.to(roomId).emit('gameState', roomPublicState(room));
}

function triggerReveal(roomId: string): void {
  const room = rooms[roomId];
  if (!room || room.phase !== 'placed') return;
  delete revealTimers[roomId];

  room.phase = 'reveal';
  room.revealedAt = Date.now();
  applyReveal(room);

  const gameoverReason = checkGameover(room);
  if (gameoverReason) {
    room.phase = 'gameover';
    room.gameoverReason = gameoverReason;
    io.to(roomId).emit('gameState', roomPublicState(room));
    return;
  }

  if (room.settings.autoAdvanceSeconds !== null) {
    autoAdvanceTimers[roomId] = setTimeout(
      () => triggerNextTurn(roomId),
      room.settings.autoAdvanceSeconds * 1000
    );
  }

  io.to(roomId).emit('gameState', roomPublicState(room));
}

// startTurn is synchronous — clients see the new turn immediately.
// Year enrichment runs in the background and pushes a second update when done.
function startTurn(room: Room, roomId: string): boolean {
  const track = pickRandomTrack(room);
  if (!track) return false;
  room.phase = 'playing';
  room.currentCard = { ...track };
  room.usedTracks.add(track.trackId);
  Object.values(room.players).forEach((p) => {
    p.challenged = false;
  });
  Promise.race([
    enrichCurrentCardYear(room, track),
    new Promise<void>((resolve) => setTimeout(resolve, ENRICH_TIMEOUT_MS)),
  ]).then(() => {
    // Push year update only while still on this card and in playing phase
    if (rooms[roomId] && room.currentCard?.trackId === track.trackId) {
      io.to(roomId).emit('gameState', roomPublicState(room));
    }
  });
  return true;
}

// ─── REST: Spotify OAuth ─────────────────────────────────────────────────────

app.get('/auth/spotify/callback', async (req, res) => {
  const { code, state: oauthState } = req.query as {
    code?: string;
    state?: string;
  };
  const roomId =
    oauthState &&
    Object.keys(rooms).find((id) => rooms[id].oauthState === oauthState);
  if (!code || !roomId) return res.status(400).send('Invalid request');

  rooms[roomId].oauthState = null; // consume before async work — prevents replay on concurrent requests
  try {
    const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, REDIRECT_URI } =
      process.env;
    const creds = Buffer.from(
      `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI!,
      }),
    });
    if (!tokenRes.ok) throw new Error(`Spotify auth error: ${tokenRes.status}`);
    const tokenData = (await tokenRes.json()) as { access_token: string };
    const accessToken = tokenData.access_token;
    rooms[roomId].spotifyToken = accessToken;
    io.to(rooms[roomId].hostId).emit('spotifyToken', accessToken);
    res.send('<script>window.close();</script>');
  } catch (e) {
    res.status(500).send('Spotify auth failed: ' + (e as Error).message);
  }
});

app.get('/auth/spotify/url', (req, res) => {
  const { roomId } = req.query as { roomId?: string };
  const room = roomId ? rooms[roomId] : null;
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const oauthState = crypto.randomBytes(16).toString('hex');
  room.oauthState = oauthState;

  const { SPOTIFY_CLIENT_ID, REDIRECT_URI } = process.env;
  // user-read-private + user-read-email are required by the Web Playback SDK to verify Spotify Premium
  const scopes =
    'streaming user-read-playback-state user-modify-playback-state user-read-private user-read-email';
  const url = `https://accounts.spotify.com/authorize?response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(REDIRECT_URI!)}&state=${oauthState}`;
  res.json({ url });
});

app.get('/rooms/single', (_req, res) => {
  const ids = Object.keys(rooms);
  res.json({ roomId: ids.length === 1 ? ids[0] : null });
});

app.get('/verify', (req, res) => {
  const { code } = req.query as { code?: string };
  res.json({ ok: code === process.env.APP_CODE });
});

// ─── Socket.io ───────────────────────────────────────────────────────────────

io.use((socket, next) => {
  if (socket.handshake.auth.code !== process.env.APP_CODE) {
    return next(new Error('Unauthorized'));
  }
  next();
});

io.on('connection', (socket: Socket) => {
  console.log('Client connected:', socket.id);
  const rl = makeRateLimiter();

  socket.on(
    'createRoom',
    (
      { playerName }: { playerName: string },
      cb: (
        res: { roomId: string; playerId: string } | { error: string }
      ) => void
    ) => {
      if (!rl('createRoom')) return cb({ error: 'Too many requests' });
      if (!playerName || typeof playerName !== 'string')
        return cb({ error: 'Invalid name' });
      playerName = playerName.trim().substring(0, MAX_PLAYER_NAME_LENGTH);
      if (!playerName) return cb({ error: 'Name required' });
      const roomId = generateRoomId();
      const playerId = generateId();
      rooms[roomId] = {
        ...createRoom(playerId, playerName),
        settings: { ...globalDefaultSettings },
      };
      socket.join(roomId);
      socket.join(playerId);
      socket.data.roomId = roomId;
      socket.data.playerId = playerId;
      console.log(`Room ${roomId} created by ${playerName}`);
      cb({ roomId, playerId });
      resetInactivityTimer(roomId);
      io.to(roomId).emit('gameState', roomPublicState(rooms[roomId]));
    }
  );

  socket.on(
    'joinRoom',
    (
      { roomId, playerName }: { roomId: string; playerName: string },
      cb: (
        res: { roomId: string; playerId: string } | { error: string }
      ) => void
    ) => {
      if (!rl('joinRoom')) return cb({ error: 'Too many requests' });
      if (!playerName || typeof playerName !== 'string')
        return cb({ error: 'Invalid name' });
      playerName = playerName.trim().substring(0, MAX_PLAYER_NAME_LENGTH);
      if (!playerName) return cb({ error: 'Name required' });
      const room = rooms[roomId];
      if (!room) return cb({ error: 'Room not found' });

      const playerId = generateId();
      room.players[playerId] = {
        name: playerName,
        timeline: [],
        score: 0,
        challenged: false,
      };

      if (room.phase !== 'lobby') {
        const starter = pickRandomTrack(room);
        if (starter) {
          room.players[playerId].timeline.push(starter);
          room.usedTracks.add(starter.trackId);
        }
        room.playerOrder.push(playerId);
      }

      socket.join(roomId);
      socket.join(playerId);
      socket.data.roomId = roomId;
      socket.data.playerId = playerId;
      console.log(`${playerName} joined room ${roomId}`);
      cb({ roomId, playerId });
      resetInactivityTimer(roomId);
      io.to(roomId).emit('gameState', roomPublicState(room));
    }
  );

  socket.on(
    'reconnectPlayer',
    (
      { roomId, playerId }: { roomId: string; playerId: string },
      cb: (res: { ok: true } | { error: string }) => void
    ) => {
      const room = rooms[roomId];
      if (!room || !room.players[playerId])
        return cb({ error: 'Session not found' });

      clearPlayerTimer(playerId);

      socket.join(roomId);
      socket.join(playerId);
      socket.data.roomId = roomId;
      socket.data.playerId = playerId;
      cb({ ok: true });
      socket.emit('gameState', roomPublicState(room));
      if (room.spotifyToken && room.hostId === playerId) {
        socket.emit('spotifyToken', room.spotifyToken);
      }
    }
  );

  socket.on(
    'loadPlaylist',
    async ({
      roomId,
      playlistUrl,
    }: {
      roomId: string;
      playlistUrl: string;
    }) => {
      if (!rl('loadPlaylist')) return;
      const room = rooms[roomId];
      if (!room || room.hostId !== socket.data.playerId) return;
      if (room.playlistLoading)
        return socket.emit('error', 'Already loading a playlist');

      if (typeof playlistUrl !== 'string' || playlistUrl.length > 500)
        return socket.emit('error', 'Invalid playlist URL');
      const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
      if (!match) return socket.emit('error', 'Invalid playlist URL');

      room.playlistLoading = true;
      try {
        const token = await getSpotifyToken();
        const tracks = await getPlaylistTracks(match[1], token);
        if (!tracks.length)
          return socket.emit('error', 'No tracks found in playlist');

        room.playlist = { id: match[1], tracks };
        io.to(roomId).emit('gameState', roomPublicState(room));
      } catch (e) {
        socket.emit(
          'error',
          'Failed to load playlist: ' + (e as Error).message
        );
      } finally {
        room.playlistLoading = false;
      }
    }
  );

  socket.on('startGame', ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.data.playerId) return;
    if (room.phase !== 'lobby') return;
    if (!room.playlist)
      return socket.emit('error', 'Please load a playlist first');

    room.playerOrder = Object.keys(room.players);
    room.currentTurnIndex = 0;
    room.currentPlayerId = room.playerOrder[0];
    room.round = 1;

    // Deal one starter card (with visible year) to each player
    for (const pid of room.playerOrder) {
      const starter = pickRandomTrack(room);
      if (starter) {
        room.players[pid].timeline.push(starter);
        room.usedTracks.add(starter.trackId);
      }
    }

    room.gameoverReason = null;
    if (!startTurn(room, roomId))
      return socket.emit('error', 'No tracks available');

    resetInactivityTimer(roomId);
    io.to(roomId).emit('gameState', roomPublicState(room));
  });

  socket.on(
    'placeCard',
    ({ roomId, position }: { roomId: string; position: number }) => {
      if (!rl('placeCard')) return;
      const room = rooms[roomId];
      if (!room || room.phase !== 'playing') return;
      if (socket.data.playerId !== room.currentPlayerId) return;

      const player = room.players[socket.data.playerId];
      player.timeline.splice(position, 0, { ...room.currentCard! });
      room.placedAt = Date.now();

      if (Object.keys(room.players).length === 1) {
        room.phase = 'placed';
        triggerReveal(roomId);
        return;
      }

      room.phase = 'placed';

      const timeout = room.settings.revealTimeoutSeconds * 1000;
      revealTimers[roomId] = setTimeout(() => triggerReveal(roomId), timeout);

      resetInactivityTimer(roomId);
      io.to(roomId).emit('gameState', roomPublicState(room));
    }
  );

  socket.on('challenge', ({ roomId }: { roomId: string }) => {
    if (!rl('challenge')) return;
    const room = rooms[roomId];
    if (!room || room.phase !== 'placed') return;
    if (socket.data.playerId === room.currentPlayerId) return;
    // Only the first challenger is accepted — once anyone has challenged, the
    // reveal fires immediately and no further challenges are meaningful.
    if (Object.values(room.players).some((p) => p.challenged)) return;

    room.players[socket.data.playerId].challenged = true;
    io.to(roomId).emit('gameState', roomPublicState(room));

    // Cancel auto-reveal timer and reveal immediately
    clearRevealTimer(roomId);
    triggerReveal(roomId);
  });

  socket.on('nextTurn', ({ roomId }: { roomId: string }) => {
    if (!rl('nextTurn')) return;
    const room = rooms[roomId];
    if (
      !room ||
      room.hostId !== socket.data.playerId ||
      room.phase !== 'reveal'
    )
      return;
    clearAutoAdvanceTimer(roomId);
    resetInactivityTimer(roomId);
    triggerNextTurn(roomId);
  });

  socket.on('continueGame', ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (
      !room ||
      room.hostId !== socket.data.playerId ||
      room.phase !== 'gameover'
    )
      return;
    room.settings.maxCards = null;
    room.gameoverReason = null;
    room.phase = 'reveal';
    clearAutoAdvanceTimer(roomId);
    resetInactivityTimer(roomId);
    triggerNextTurn(roomId);
  });

  socket.on(
    'updateSettings',
    ({ roomId, settings }: { roomId: string; settings: RoomSettings }) => {
      const room = rooms[roomId];
      if (!room || room.hostId !== socket.data.playerId) return;
      const revealTimeoutSeconds = Math.min(
        60,
        Math.max(1, Math.round(Number(settings.revealTimeoutSeconds)) || 10)
      );
      const autoAdvanceSeconds =
        settings.autoAdvanceSeconds === null
          ? null
          : Math.min(
              120,
              Math.max(1, Math.round(Number(settings.autoAdvanceSeconds)) || 5)
            );
      const maxCards =
        settings.maxCards === null
          ? null
          : Math.min(
              999,
              Math.max(2, Math.round(Number(settings.maxCards)) || 10)
            );
      room.settings = { revealTimeoutSeconds, autoAdvanceSeconds, maxCards };
      globalDefaultSettings = { ...room.settings };
      io.to(roomId).emit('gameState', roomPublicState(room));
    }
  );

  socket.on('disconnect', () => {
    const { roomId, playerId } = socket.data as {
      roomId?: string;
      playerId?: string;
    };
    if (!roomId || !playerId || !rooms[roomId]) return;

    const playerName = rooms[roomId].players[playerId]?.name ?? playerId;
    console.log(
      `${playerName} disconnected from room ${roomId} (10s grace period)`
    );

    disconnectTimers[playerId] = setTimeout(() => {
      const room = rooms[roomId];
      if (!room) return;
      delete room.players[playerId];
      delete disconnectTimers[playerId];

      if (Object.keys(room.players).length === 0) {
        deleteRoom(roomId);
        console.log(`Room ${roomId} deleted — no players left`);
        return;
      }

      // Keep playerOrder in sync
      room.playerOrder = room.playerOrder.filter((id) => id !== playerId);
      // Clamp index so it stays valid after shrinking the array
      if (room.playerOrder.length > 0) {
        room.currentTurnIndex = room.currentTurnIndex % room.playerOrder.length;
      }

      if (room.hostId === playerId) room.hostId = Object.keys(room.players)[0];

      // If the active player left mid-turn, skip to the next turn
      if (
        room.currentPlayerId === playerId &&
        (room.phase === 'playing' || room.phase === 'placed')
      ) {
        clearRevealTimer(roomId);
        room.phase = 'reveal';
        room.lastResult = null;
        triggerNextTurn(roomId);
      } else {
        io.to(roomId).emit('gameState', roomPublicState(room));
      }

      console.log(
        `${playerName} removed from room ${roomId} after grace period`
      );
    }, DISCONNECT_GRACE_PERIOD_MS);
  });
});

const PORT = parseInt(process.env.PORT || '3011');
if (require.main === module) {
  server.listen(PORT, () =>
    console.log(`Music Quiz server running on port ${PORT}`)
  );
}

export { app, server };
