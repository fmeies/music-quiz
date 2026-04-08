require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const {
  generateRoomId,
  generateId,
  createRoom,
  roomPublicState,
  earliestYearFromRecordings,
  pickRandomTrack,
  makeRateLimiter,
  applyReveal,
  advanceTurn,
} = require('./gameLogic');

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

app.use(cors());
app.use(express.json());

// ─── In-Memory Game State ────────────────────────────────────────────────────

const rooms = {}; // roomId → gameState
const revealTimers = {}; // roomId → timeout
const inactivityTimers = {}; // roomId → timeout
const disconnectTimers = {}; // playerId → timeout

const INACTIVITY_MS = 60 * 60 * 1000; // 60 minutes

function resetInactivityTimer(roomId) {
  if (inactivityTimers[roomId]) clearTimeout(inactivityTimers[roomId]);
  inactivityTimers[roomId] = setTimeout(() => {
    const room = rooms[roomId];
    if (room) {
      Object.keys(room.players).forEach((pid) => {
        if (disconnectTimers[pid]) {
          clearTimeout(disconnectTimers[pid]);
          delete disconnectTimers[pid];
        }
      });
      if (revealTimers[roomId]) {
        clearTimeout(revealTimers[roomId]);
        delete revealTimers[roomId];
      }
    }
    delete rooms[roomId];
    delete inactivityTimers[roomId];
    console.log(`Room ${roomId} removed after 60 min inactivity`);
  }, INACTIVITY_MS);
}

// ─── Spotify Helpers ─────────────────────────────────────────────────────────

async function getSpotifyToken() {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  const creds = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  return res.data.access_token;
}

async function getMusicBrainzYear(title, artist) {
  try {
    const primaryArtist = artist.split(',')[0].trim();
    const query = `recording:"${title.replace(/"/g, '')}" AND artist:"${primaryArtist.replace(/"/g, '')}"`;
    const res = await axios.get(
      `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=10`,
      {
        headers: {
          'User-Agent':
            'MusicQuiz/1.0 (+https://github.com/music-quiz-party-game)',
        },
      }
    );
    const year = earliestYearFromRecordings(
      (res.data.recordings || []).filter((r) => r.score >= 90)
    );
    if (year) return { year, via: `search "${title}" / "${primaryArtist}"` };
  } catch {
    // search failed
  }
  return null;
}

async function getPlaylistTracks(playlistId, token) {
  let tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  while (url) {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    tracks = tracks.concat(res.data.items);
    url = res.data.next;
  }
  return tracks
    .filter((i) => i.track && i.track.album?.release_date)
    .map((i) => ({
      trackId: i.track.id,
      title: i.track.name,
      artist: i.track.artists.map((a) => a.name).join(', '),
      year: parseInt(i.track.album.release_date.substring(0, 4)),
      albumArt: i.track.album.images?.[1]?.url || null,
    }));
}

function triggerNextTurn(roomId) {
  const room = rooms[roomId];
  if (!room || room.phase !== 'reveal') return;

  if (!advanceTurn(room)) {
    io.to(roomId).emit('gameState', roomPublicState(room));
    return;
  }

  if (!startTurn(room, roomId)) {
    room.phase = 'gameover';
    io.to(roomId).emit('gameState', roomPublicState(room));
    return;
  }

  io.to(roomId).emit('gameState', roomPublicState(room));
}

function triggerReveal(roomId) {
  const room = rooms[roomId];
  if (!room || room.phase !== 'placed') return;
  delete revealTimers[roomId];

  room.phase = 'reveal';

  applyReveal(room);

  io.to(roomId).emit('gameState', roomPublicState(room));
}

const ENRICH_TIMEOUT_MS = 5000;
const yearCache = new Map(); // trackId → year (number) | null

async function enrichCurrentCardYear(room, track) {
  let mbYear;
  if (yearCache.has(track.trackId)) {
    mbYear = yearCache.get(track.trackId);
  } else {
    const result = await getMusicBrainzYear(track.title, track.artist);
    mbYear = result ? result.year : null;
    yearCache.set(track.trackId, mbYear);
    const spotifyYear = track.year;
    if (mbYear) {
      console.log(
        `[Year] "${track.title}" – Spotify: ${spotifyYear}, MusicBrainz: ${mbYear} (via ${result.via}) → ${Math.min(spotifyYear, mbYear)}`
      );
    } else {
      console.log(
        `[Year] "${track.title}" – Spotify: ${spotifyYear} (MusicBrainz: kein Treffer)`
      );
    }
  }
  if (mbYear && room.currentCard?.trackId === track.trackId) {
    const finalYear = Math.min(track.year, mbYear);
    room.currentCard.year = finalYear;
    const playlistTrack = room.playlist?.tracks.find(
      (t) => t.trackId === track.trackId
    );
    if (playlistTrack) playlistTrack.year = finalYear;
  }
}

// startTurn is synchronous — clients see the new turn immediately.
// Year enrichment runs in the background and pushes a second update when done.
function startTurn(room, roomId) {
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
    new Promise((resolve) => setTimeout(resolve, ENRICH_TIMEOUT_MS)),
  ]).then(() => {
    // Push year update only while still on this card and in playing phase
    if (rooms[roomId] && room.currentCard?.trackId === track.trackId) {
      io.to(roomId).emit('gameState', roomPublicState(room));
    }
  });
  return true;
}

// ─── REST: Spotify OAuth Callback ────────────────────────────────────────────

app.get('/auth/spotify/callback', async (req, res) => {
  const { code, state: oauthState } = req.query;
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
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          Authorization: `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    const accessToken = tokenRes.data.access_token;
    rooms[roomId].spotifyToken = accessToken;
    io.to(rooms[roomId].hostId).emit('spotifyToken', accessToken);
    res.send('<script>window.close();</script>');
  } catch (e) {
    res.status(500).send('Spotify auth failed: ' + e.message);
  }
});

app.get('/auth/spotify/url', (req, res) => {
  const { roomId } = req.query;
  const room = rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const oauthState = crypto.randomBytes(16).toString('hex');
  room.oauthState = oauthState;

  const { SPOTIFY_CLIENT_ID, REDIRECT_URI } = process.env;
  // user-read-private is required by the Web Playback SDK to verify Spotify Premium
  const scopes =
    'streaming user-read-playback-state user-modify-playback-state user-read-private';
  const url = `https://accounts.spotify.com/authorize?response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${oauthState}`;
  res.json({ url });
});

app.get('/rooms/single', (req, res) => {
  const ids = Object.keys(rooms);
  res.json({ roomId: ids.length === 1 ? ids[0] : null });
});

app.get('/verify', (req, res) => {
  const { code } = req.query;
  res.json({ ok: code === process.env.APP_CODE });
});

// ─── Socket.io ───────────────────────────────────────────────────────────────

io.use((socket, next) => {
  if (socket.handshake.auth.code !== process.env.APP_CODE) {
    return next(new Error('Unauthorized'));
  }
  next();
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  const rl = makeRateLimiter();

  socket.on('createRoom', ({ playerName }, cb) => {
    if (!rl('createRoom')) return cb({ error: 'Too many requests' });
    if (!playerName || typeof playerName !== 'string')
      return cb({ error: 'Invalid name' });
    playerName = playerName.trim().substring(0, 30);
    if (!playerName) return cb({ error: 'Name required' });
    const roomId = generateRoomId();
    const playerId = generateId();
    rooms[roomId] = createRoom(playerId, playerName);
    socket.join(roomId);
    socket.join(playerId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;
    console.log(`Room ${roomId} created by ${playerName}`);
    cb({ roomId, playerId });
    resetInactivityTimer(roomId);
    io.to(roomId).emit('gameState', roomPublicState(rooms[roomId]));
  });

  socket.on('joinRoom', ({ roomId, playerName }, cb) => {
    if (!rl('joinRoom')) return cb({ error: 'Too many requests' });
    if (!playerName || typeof playerName !== 'string')
      return cb({ error: 'Invalid name' });
    playerName = playerName.trim().substring(0, 30);
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
  });

  socket.on('reconnectPlayer', ({ roomId, playerId }, cb) => {
    const room = rooms[roomId];
    if (!room || !room.players[playerId])
      return cb({ error: 'Session not found' });

    if (disconnectTimers[playerId]) {
      clearTimeout(disconnectTimers[playerId]);
      delete disconnectTimers[playerId];
    }

    socket.join(roomId);
    socket.join(playerId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;
    cb({ ok: true });
    socket.emit('gameState', roomPublicState(room));
    if (room.spotifyToken && room.hostId === playerId) {
      socket.emit('spotifyToken', room.spotifyToken);
    }
  });

  socket.on('loadPlaylist', async ({ roomId, playlistUrl }) => {
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
      socket.emit('error', 'Failed to load playlist: ' + e.message);
    } finally {
      room.playlistLoading = false;
    }
  });

  socket.on('startGame', ({ roomId }) => {
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
    for (const playerId of room.playerOrder) {
      const starter = pickRandomTrack(room);
      if (starter) {
        room.players[playerId].timeline.push(starter);
        room.usedTracks.add(starter.trackId);
      }
    }

    if (!startTurn(room, roomId))
      return socket.emit('error', 'No tracks available');

    resetInactivityTimer(roomId);
    io.to(roomId).emit('gameState', roomPublicState(room));
  });

  // Only the active player places their card
  socket.on('placeCard', ({ roomId, position }) => {
    if (!rl('placeCard')) return;
    const room = rooms[roomId];
    if (!room || room.phase !== 'playing') return;
    if (socket.data.playerId !== room.currentPlayerId) return;

    const player = room.players[socket.data.playerId];
    player.timeline.splice(position, 0, { ...room.currentCard });
    room.placedAt = Date.now();

    if (Object.keys(room.players).length === 1) {
      room.phase = 'placed';
      triggerReveal(roomId);
      return;
    }

    room.phase = 'placed';

    const timeout = parseInt(process.env.REVEAL_TIMEOUT_SECONDS || '10') * 1000;
    revealTimers[roomId] = setTimeout(() => triggerReveal(roomId), timeout);

    resetInactivityTimer(roomId);
    io.to(roomId).emit('gameState', roomPublicState(room));
  });

  // Other players challenge the active player's placement
  socket.on('challenge', ({ roomId }) => {
    if (!rl('challenge')) return;
    const room = rooms[roomId];
    if (!room || room.phase !== 'placed') return;
    if (socket.data.playerId === room.currentPlayerId) return;

    room.players[socket.data.playerId].challenged = true;
    io.to(roomId).emit('gameState', roomPublicState(room));

    // Cancel auto-reveal timer and reveal immediately
    if (revealTimers[roomId]) {
      clearTimeout(revealTimers[roomId]);
      delete revealTimers[roomId];
    }
    triggerReveal(roomId);
  });

  socket.on('nextTurn', ({ roomId }) => {
    if (!rl('nextTurn')) return;
    const room = rooms[roomId];
    if (
      !room ||
      room.hostId !== socket.data.playerId ||
      room.phase !== 'reveal'
    )
      return;
    resetInactivityTimer(roomId);
    triggerNextTurn(roomId);
  });

  socket.on('disconnect', () => {
    const { roomId, playerId } = socket.data;
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
        delete rooms[roomId];
        if (revealTimers[roomId]) {
          clearTimeout(revealTimers[roomId]);
          delete revealTimers[roomId];
        }
        if (inactivityTimers[roomId]) {
          clearTimeout(inactivityTimers[roomId]);
          delete inactivityTimers[roomId];
        }
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
        if (revealTimers[roomId]) {
          clearTimeout(revealTimers[roomId]);
          delete revealTimers[roomId];
        }
        room.phase = 'reveal';
        room.lastResult = null;
        triggerNextTurn(roomId);
      } else {
        io.to(roomId).emit('gameState', roomPublicState(room));
      }

      console.log(
        `${playerName} removed from room ${roomId} after grace period`
      );
    }, 10000); // 10s grace period for page reload
  });
});

const PORT = process.env.PORT || 3011;
if (require.main === module) {
  server.listen(PORT, () =>
    console.log(`Music Quiz server running on port ${PORT}`)
  );
}

module.exports = { app, server };
