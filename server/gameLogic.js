const crypto = require('crypto');

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const RATE_LIMITS = {
  createRoom:   { windowMs: 10000, max: 3 },
  joinRoom:     { windowMs: 10000, max: 5 },
  loadPlaylist: { windowMs: 15000, max: 3 },
  placeCard:    { windowMs:  5000, max: 3 },
  challenge:    { windowMs:  5000, max: 3 },
  nextTurn:     { windowMs:  3000, max: 2 },
};

function generateRoomId() {
  const bytes = crypto.randomBytes(5);
  return Array.from(bytes, b => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]).join('');
}

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function createRoom(hostId, hostName) {
  return {
    hostId,
    players: {
      [hostId]: { name: hostName, timeline: [], score: 0, challenged: false }
    },
    phase: 'lobby',
    currentCard: null,
    currentPlayerId: null,
    playerOrder: [],
    currentTurnIndex: 0,
    round: 0,
    playlist: null,
    usedTracks: new Set(),
    spotifyToken: null,
    oauthState: null,
    placedAt: null,
    lastResult: null,
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
      : room.currentCard,
    playlist: room.playlist,
    lastResult: room.lastResult,
    placedAt: room.placedAt,
    revealTimeoutSeconds: parseInt(process.env.REVEAL_TIMEOUT_SECONDS || '10'),
    playlists: Object.keys(process.env)
      .filter(k => /^PLAYLIST_\d+_NAME$/.test(k))
      .sort()
      .flatMap(k => {
        const n = k.match(/^PLAYLIST_(\d+)_NAME$/)[1];
        const url = process.env[`PLAYLIST_${n}_URL`];
        return url ? [{ name: process.env[k], url }] : [];
      }),
  };
}

function earliestYearFromRecordings(recordings) {
  let earliest = null;
  for (const rec of recordings) {
    for (const rg of (rec['release-groups'] || [])) {
      const y = rg['first-release-date'] ? parseInt(rg['first-release-date']) : NaN;
      if (!isNaN(y) && y > 1000 && (!earliest || y < earliest)) earliest = y;
    }
    for (const release of (rec.releases || [])) {
      const y = release.date ? parseInt(release.date) : NaN;
      if (!isNaN(y) && y > 1000 && (!earliest || y < earliest)) earliest = y;
    }
  }
  return earliest;
}

function pickRandomTrack(room) {
  const available = room.playlist.tracks.filter(t => !room.usedTracks.has(t.trackId));
  if (!available.length) return null;
  return available[crypto.randomInt(available.length)];
}

function makeRateLimiter() {
  const windows = {};
  return function isAllowed(event) {
    const limit = RATE_LIMITS[event];
    if (!limit) return true;
    const now = Date.now();
    const w = windows[event];
    if (!w || now - w.start > limit.windowMs) {
      windows[event] = { start: now, count: 1 };
      return true;
    }
    if (w.count >= limit.max) return false;
    w.count++;
    return true;
  };
}

module.exports = {
  ROOM_CODE_CHARS,
  RATE_LIMITS,
  generateRoomId,
  generateId,
  createRoom,
  roomPublicState,
  earliestYearFromRecordings,
  pickRandomTrack,
  makeRateLimiter,
};
