require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// ─── In-Memory Game State ────────────────────────────────────────────────────

const rooms = {}; // roomId → gameState
const revealTimers = {}; // roomId → timeout

function createRoom(hostId, hostName) {
  return {
    hostId,
    players: {
      [hostId]: { name: hostName, timeline: [], score: 0, challenged: false }
    },
    phase: 'lobby',      // lobby | playing | placed | reveal | gameover
    currentCard: null,   // { trackId, title, artist, year, albumArt }
    currentPlayerId: null,
    playerOrder: [],
    currentTurnIndex: 0,
    round: 0,
    playlist: null,
    usedTracks: [],
    spotifyToken: null,
    lastResult: null,  // { playerName, correct, challengers: [name] }
  };
}

function roomPublicState(room) {
  const hideCurrentYear = room.phase === 'playing' || room.phase === 'placed';
  const currentTrackId = room.currentCard?.trackId;
  return {
    phase: room.phase,
    round: room.round,
    hostId: room.hostId,
    currentPlayerId: room.currentPlayerId,
    players: Object.fromEntries(
      Object.entries(room.players).map(([id, p]) => [
        id,
        {
          name: p.name,
          score: p.score,
          challenged: p.challenged,
          // Only hide the year of the current round's card; starter cards stay visible
          timeline: hideCurrentYear
            ? p.timeline.map(c => c.trackId === currentTrackId ? { trackId: c.trackId } : c)
            : p.timeline,
          timelineCount: p.timeline.length,
        }
      ])
    ),
    currentCard: hideCurrentYear
      ? {
          trackId: room.currentCard?.trackId,
          title: room.currentCard?.title,
          artist: room.currentCard?.artist,
          albumArt: room.currentCard?.albumArt,
        }
      : room.currentCard && (({ isrc, ...rest }) => rest)(room.currentCard),
    playlist: room.playlist && {
      ...room.playlist,
      tracks: room.playlist.tracks.map(({ isrc, ...t }) => t),
    },
    lastResult: room.lastResult,
    revealTimeoutSeconds: parseInt(process.env.REVEAL_TIMEOUT_SECONDS || '10'),
  };
}

// ─── Spotify Helpers ─────────────────────────────────────────────────────────

async function getSpotifyToken() {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  const creds = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data.access_token;
}

async function getMusicBrainzYear(isrc) {
  try {
    const res = await axios.get(
      `https://musicbrainz.org/ws/2/isrc/${isrc}?fmt=json&inc=releases`,
      { headers: { 'User-Agent': 'MusicQuiz/1.0 (music-quiz-party-game)' } }
    );
    let earliest = null;
    for (const rec of (res.data.recordings || [])) {
      for (const release of (rec.releases || [])) {
        const y = release.date ? parseInt(release.date) : NaN;
        if (!isNaN(y) && y > 1000 && (!earliest || y < earliest)) earliest = y;
      }
    }
    console.log(`[MusicBrainz] ISRC ${isrc} → ${earliest ?? 'no match'}`);
    return earliest;
  } catch (e) {
    console.warn(`[MusicBrainz] ISRC ${isrc} failed:`, e.message);
    return null;
  }
}

async function getPlaylistTracks(playlistId, token) {
  let tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  while (url) {
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    tracks = tracks.concat(res.data.items);
    url = res.data.next;
  }
  return tracks
    .filter(i => i.track && i.track.album?.release_date)
    .map(i => ({
      trackId: i.track.id,
      title: i.track.name,
      artist: i.track.artists.map(a => a.name).join(', '),
      year: parseInt(i.track.album.release_date.substring(0, 4)),
      albumArt: i.track.album.images?.[1]?.url || null,
      isrc: i.track.external_ids?.isrc || null,
    }));
}

function pickRandomTrack(room) {
  const available = room.playlist.tracks.filter(t => !room.usedTracks.includes(t.trackId));
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function triggerNextTurn(roomId) {
  const room = rooms[roomId];
  if (!room || room.phase !== 'reveal') return;

  let attempts = 0;
  do {
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.playerOrder.length;
    attempts++;
  } while (!room.players[room.playerOrder[room.currentTurnIndex]] && attempts < room.playerOrder.length);

  room.currentPlayerId = room.playerOrder[room.currentTurnIndex];
  room.round += 1;

  if (!startTurn(room)) {
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

  const year = room.currentCard.year;
  const activePlayer = room.players[room.currentPlayerId];
  if (!activePlayer) { io.to(roomId).emit('gameState', roomPublicState(room)); return; }
  const cardIdx = activePlayer.timeline.findIndex(c => c.trackId === room.currentCard.trackId);
  const prev = activePlayer.timeline[cardIdx - 1];
  const next = activePlayer.timeline[cardIdx + 1];
  const correct = (!prev || prev.year <= year) && (!next || next.year >= year);

  if (correct) {
    activePlayer.score += 1;
    room.lastResult = { playerName: activePlayer.name, correct: true, challengers: [] };
  } else {
    activePlayer.timeline.splice(cardIdx, 1);
    const challengers = [];
    Object.values(room.players).forEach(p => {
      if (p.challenged) {
        p.score += 1;
        challengers.push(p.name);
        const insertIdx = p.timeline.findIndex(c => c.year > year);
        p.timeline.splice(insertIdx === -1 ? p.timeline.length : insertIdx, 0, { ...room.currentCard });
      }
    });
    room.lastResult = { playerName: activePlayer.name, correct: false, challengers };
  }

  io.to(roomId).emit('gameState', roomPublicState(room));
}

async function enrichCurrentCardYear(room, trackId, isrc) {
  const mbYear = await getMusicBrainzYear(isrc);
  if (mbYear && room.currentCard?.trackId === trackId) {
    room.currentCard.year = mbYear;
    const playlistTrack = room.playlist?.tracks.find(t => t.trackId === trackId);
    if (playlistTrack) playlistTrack.year = mbYear;
  }
}

function startTurn(room) {
  const track = pickRandomTrack(room);
  if (!track) return false;
  room.phase = 'playing';
  room.currentCard = { ...track };
  room.usedTracks.push(track.trackId);
  Object.values(room.players).forEach(p => { p.challenged = false; });
  if (track.isrc) enrichCurrentCardYear(room, track.trackId, track.isrc); // fire & forget
  return true;
}

// ─── REST: Spotify OAuth Callback ────────────────────────────────────────────

app.get('/auth/spotify/callback', async (req, res) => {
  const { code, state: roomId } = req.query;
  if (!code || !roomId || !rooms[roomId]) return res.status(400).send('Invalid request');

  try {
    const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, REDIRECT_URI } = process.env;
    const creds = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
      { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
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
  const { SPOTIFY_CLIENT_ID, REDIRECT_URI } = process.env;
  const scopes = 'streaming user-read-playback-state user-modify-playback-state user-read-email user-read-private';
  const url = `https://accounts.spotify.com/authorize?response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${roomId}`;
  res.json({ url });
});

app.get('/verify', (req, res) => {
  const { code } = req.query;
  res.json({ ok: code === process.env.APP_CODE });
});


// ─── Socket.io ───────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('createRoom', ({ playerName }, cb) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = createRoom(socket.id, playerName);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = socket.id;
    console.log(`Room ${roomId} created by ${playerName}`);
    cb({ roomId, playerId: socket.id });
    io.to(roomId).emit('gameState', roomPublicState(rooms[roomId]));
  });

  socket.on('joinRoom', ({ roomId, playerName }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ error: 'Room not found' });
    if (room.phase !== 'lobby') return cb({ error: 'Game already in progress' });

    room.players[socket.id] = { name: playerName, timeline: [], score: 0, challenged: false };
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = socket.id;
    console.log(`${playerName} joined room ${roomId}`);
    cb({ roomId, playerId: socket.id });
    io.to(roomId).emit('gameState', roomPublicState(room));
  });

  socket.on('loadPlaylist', async ({ roomId, playlistUrl }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;

    const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!match) return socket.emit('error', 'Invalid playlist URL');

    try {
      const token = await getSpotifyToken();
      const tracks = await getPlaylistTracks(match[1], token);
      if (!tracks.length) return socket.emit('error', 'No tracks found in playlist');

      room.playlist = { id: match[1], tracks };
      io.to(roomId).emit('gameState', roomPublicState(room));
    } catch (e) {
      socket.emit('error', 'Failed to load playlist: ' + e.message);
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    if (!room.playlist) return socket.emit('error', 'Please load a playlist first');

    room.playerOrder = Object.keys(room.players);
    room.currentTurnIndex = 0;
    room.currentPlayerId = room.playerOrder[0];
    room.round = 1;

    // Deal one starter card (with visible year) to each player
    for (const playerId of room.playerOrder) {
      const starter = pickRandomTrack(room);
      if (starter) {
        room.players[playerId].timeline.push(starter);
        room.usedTracks.push(starter.trackId);
      }
    }

    if (!startTurn(room)) return socket.emit('error', 'No tracks available');

    io.to(roomId).emit('gameState', roomPublicState(room));
  });

  // Only the active player places their card
  socket.on('placeCard', ({ roomId, position }) => {
    const room = rooms[roomId];
    if (!room || room.phase !== 'playing') return;
    if (socket.id !== room.currentPlayerId) return;

    const player = room.players[socket.id];
    player.timeline.splice(position, 0, { ...room.currentCard });

    if (Object.keys(room.players).length === 1) {
      room.phase = 'placed';
      triggerReveal(roomId);
      return;
    }

    room.phase = 'placed';

    const timeout = parseInt(process.env.REVEAL_TIMEOUT_SECONDS || '10') * 1000;
    revealTimers[roomId] = setTimeout(() => triggerReveal(roomId), timeout);

    io.to(roomId).emit('gameState', roomPublicState(room));
  });

  // Other players challenge the active player's placement
  socket.on('challenge', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.phase !== 'placed') return;
    if (socket.id === room.currentPlayerId) return;

    room.players[socket.id].challenged = true;
    io.to(roomId).emit('gameState', roomPublicState(room));

    // Cancel auto-reveal timer and reveal immediately
    if (revealTimers[roomId]) {
      clearTimeout(revealTimers[roomId]);
      delete revealTimers[roomId];
    }
    triggerReveal(roomId);
  });

  socket.on('nextTurn', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id || room.phase !== 'reveal') return;
    triggerNextTurn(roomId);
  });

  socket.on('disconnect', () => {
    const { roomId, playerId } = socket.data;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      delete room.players[playerId];
      if (Object.keys(room.players).length === 0) {
        delete rooms[roomId];
      } else {
        if (room.hostId === playerId) {
          room.hostId = Object.keys(room.players)[0];
        }
        io.to(roomId).emit('gameState', roomPublicState(room));
      }
    }
  });
});

const PORT = process.env.PORT || 3011;
server.listen(PORT, () => console.log(`Music Quiz server running on port ${PORT}`));
