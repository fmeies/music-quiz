import * as crypto from 'crypto';
import type {
  Room,
  InternalPlayer,
  Card,
  Phase,
  GameState,
  PublicPlayer,
  PublicTimelineCard,
  MusicBrainzRecording,
  RateLimitConfig,
  RateLimitWindow,
  LastResult,
  RoomSettings,
  GameoverReason,
} from './types';

export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  createRoom: { windowMs: 10000, max: 3 },
  joinRoom: { windowMs: 10000, max: 5 },
  loadPlaylist: { windowMs: 15000, max: 3 },
  placeCard: { windowMs: 5000, max: 3 },
  challenge: { windowMs: 5000, max: 3 },
  nextTurn: { windowMs: 3000, max: 2 },
};

export function generateRoomId(): string {
  const bytes = crypto.randomBytes(5);
  return Array.from(
    bytes,
    (b) => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]
  ).join('');
}

export function generateId(): string {
  return crypto.randomBytes(12).toString('hex');
}

export function defaultSettings(): RoomSettings {
  return {
    revealTimeoutSeconds: parseInt(process.env.REVEAL_TIMEOUT_SECONDS || '10'),
    autoAdvanceSeconds: null,
    maxRounds: 10,
  };
}

export function createRoom(hostId: string, hostName: string): Room {
  return {
    hostId,
    players: {
      [hostId]: { name: hostName, timeline: [], score: 0, challenged: false },
    },
    phase: 'lobby' as Phase,
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
    revealedAt: null,
    lastResult: null,
    settings: defaultSettings(),
    gameoverReason: null,
  };
}

export function roomPublicState(room: Room): GameState {
  const hideCurrentYear = room.phase === 'playing' || room.phase === 'placed';
  const currentTrackId = room.currentCard?.trackId;

  return {
    phase: room.phase,
    round: room.round,
    hostId: room.hostId,
    currentPlayerId: room.currentPlayerId,
    players: Object.fromEntries(
      Object.entries(room.players).map(([id, p]: [string, InternalPlayer]) => [
        id,
        {
          name: p.name,
          score: p.score,
          challenged: p.challenged,
          timeline: hideCurrentYear
            ? p.timeline.map(
                (c: Card): PublicTimelineCard =>
                  c.trackId === currentTrackId ? { trackId: c.trackId } : c
              )
            : p.timeline,
          timelineCount: p.timeline.length,
        } satisfies PublicPlayer,
      ])
    ),
    currentCard: hideCurrentYear
      ? {
          trackId: room.currentCard?.trackId ?? '',
          title: room.currentCard?.title,
          artist: room.currentCard?.artist,
          albumArt: room.currentCard?.albumArt,
        }
      : room.currentCard,
    playlist: room.playlist,
    lastResult: room.lastResult,
    placedAt: room.placedAt,
    revealedAt: room.revealedAt,
    settings: room.settings,
    gameoverReason: room.gameoverReason,
    playlists: Object.keys(process.env)
      .filter((k) => /^PLAYLIST_\d+_NAME$/.test(k))
      .sort()
      .flatMap((k) => {
        const match = k.match(/^PLAYLIST_(\d+)_NAME$/);
        if (!match) return [];
        const url = process.env[`PLAYLIST_${match[1]}_URL`];
        return url ? [{ name: process.env[k] as string, url }] : [];
      }),
  };
}

export function earliestYearFromRecordings(
  recordings: MusicBrainzRecording[]
): number | null {
  let earliest: number | null = null;
  for (const rec of recordings) {
    for (const rg of rec['release-groups'] || []) {
      const y = rg['first-release-date']
        ? parseInt(rg['first-release-date'])
        : NaN;
      if (!isNaN(y) && y > 1000 && (!earliest || y < earliest)) earliest = y;
    }
    for (const release of rec.releases || []) {
      const y = release.date ? parseInt(release.date) : NaN;
      if (!isNaN(y) && y > 1000 && (!earliest || y < earliest)) earliest = y;
    }
  }
  return earliest;
}

export function pickRandomTrack(
  room: Pick<Room, 'playlist' | 'usedTracks'>
): Card | null {
  const available = room.playlist!.tracks.filter(
    (t) => !room.usedTracks.has(t.trackId)
  );
  if (!available.length) return null;
  return available[crypto.randomInt(available.length)];
}

export function makeRateLimiter(): (event: string) => boolean {
  const windows: Record<string, RateLimitWindow> = {};
  return function isAllowed(event: string): boolean {
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

// Pure scoring logic for triggerReveal — modifies room in place, returns true if active player existed.
export function applyReveal(room: Room): boolean {
  const year = room.currentCard!.year;
  const activePlayer = room.players[room.currentPlayerId!];
  if (!activePlayer) return false;

  const cardIdx = activePlayer.timeline.findIndex(
    (c) => c.trackId === room.currentCard!.trackId
  );
  const prev = activePlayer.timeline[cardIdx - 1];
  const next = activePlayer.timeline[cardIdx + 1];
  const correct = (!prev || prev.year <= year) && (!next || next.year >= year);

  const challenger =
    Object.values(room.players).find((p: InternalPlayer) => p.challenged) ??
    null;

  if (correct) {
    activePlayer.score += 1;
    if (challenger && challenger.timeline.length > 0) {
      challenger.timeline.splice(
        Math.floor(Math.random() * challenger.timeline.length),
        1
      );
    }
    room.lastResult = {
      playerName: activePlayer.name,
      correct: true,
      challenger: null,
    } satisfies LastResult;
  } else {
    activePlayer.timeline.splice(cardIdx, 1);
    if (challenger) {
      challenger.score += 1;
      const insertIdx = challenger.timeline.findIndex((c) => c.year > year);
      challenger.timeline.splice(
        insertIdx === -1 ? challenger.timeline.length : insertIdx,
        0,
        { ...room.currentCard! }
      );
    }
    room.lastResult = {
      playerName: activePlayer.name,
      correct: false,
      challenger: challenger?.name ?? null,
    } satisfies LastResult;
  }

  return true;
}

// Returns the gameover reason if the round limit has been reached, null otherwise.
export function checkGameover(
  room: Pick<Room, 'round' | 'settings'>
): GameoverReason | null {
  if (
    room.settings.maxRounds !== null &&
    room.round > room.settings.maxRounds
  ) {
    return 'rounds';
  }
  return null;
}

// Pure turn-rotation logic for triggerNextTurn — modifies room in place.
// Returns true if game continues, false if gameover (no players or no tracks).
export function advanceTurn(room: Room): boolean {
  room.playerOrder = room.playerOrder.filter((id) => room.players[id]);
  if (room.playerOrder.length === 0) {
    room.phase = 'gameover';
    return false;
  }
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.playerOrder.length;
  room.currentPlayerId = room.playerOrder[room.currentTurnIndex];
  room.round += 1;
  return true;
}
