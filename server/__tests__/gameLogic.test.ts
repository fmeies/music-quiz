import {
  ROOM_CODE_CHARS,
  generateRoomId,
  generateId,
  createRoom,
  roomPublicState,
  earliestYearFromRecordings,
  pickRandomTrack,
  makeRateLimiter,
} from '../gameLogic';
import type { Room, MusicBrainzRecording } from '../types';

describe('generateRoomId', () => {
  it('returns a 5-character string', () => {
    expect(generateRoomId()).toHaveLength(5);
  });

  it('only uses characters from ROOM_CODE_CHARS', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateRoomId();
      expect([...id].every((c) => ROOM_CODE_CHARS.includes(c))).toBe(true);
    }
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, generateRoomId));
    expect(ids.size).toBeGreaterThan(90);
  });
});

describe('generateId', () => {
  it('returns a 24-character hex string', () => {
    const id = generateId();
    expect(id).toHaveLength(24);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });
});

describe('createRoom', () => {
  it('creates a room with correct structure', () => {
    const room = createRoom('host-1', 'Alice');
    expect(room.hostId).toBe('host-1');
    expect(room.phase).toBe('lobby');
    expect(room.players['host-1']).toEqual({
      name: 'Alice',
      timeline: [],
      score: 0,
      challenged: false,
    });
    expect(room.usedTracks).toBeInstanceOf(Set);
    expect(room.currentCard).toBeNull();
    expect(room.playlist).toBeNull();
  });
});

describe('roomPublicState', () => {
  const baseRoom = (): Room => ({
    hostId: 'p1',
    phase: 'lobby',
    round: 0,
    currentPlayerId: null,
    currentCard: null,
    playlist: null,
    lastResult: null,
    placedAt: null,
    revealedAt: null,
    playerOrder: [],
    currentTurnIndex: 0,
    usedTracks: new Set(),
    spotifyToken: null,
    oauthState: null,
    settings: { revealTimeoutSeconds: 10, autoAdvanceSeconds: null, maxRounds: 10 },
    gameoverReason: null,
    players: {
      p1: { name: 'Alice', score: 0, challenged: false, timeline: [] },
    },
  });

  it('includes all required top-level fields', () => {
    const state = roomPublicState(baseRoom());
    expect(state).toMatchObject({
      phase: 'lobby',
      round: 0,
      hostId: 'p1',
      currentPlayerId: null,
    });
  });

  it('hides current card year in playing phase', () => {
    const room = baseRoom();
    room.phase = 'playing';
    room.currentCard = {
      trackId: 't1',
      title: 'Song',
      artist: 'Band',
      year: 1995,
      albumArt: null,
    };
    room.players.p1.timeline = [
      {
        trackId: 't1',
        title: 'Song',
        artist: 'Band',
        year: 1995,
        albumArt: null,
      },
    ];
    const state = roomPublicState(room);
    expect(state.currentCard?.year).toBeUndefined();
    expect(state.currentCard?.title).toBe('Song');
    expect(state.players.p1.timeline[0]).toEqual({ trackId: 't1' });
  });

  it('hides current card year in placed phase', () => {
    const room = baseRoom();
    room.phase = 'placed';
    room.currentCard = {
      trackId: 't1',
      title: 'Song',
      artist: 'Band',
      year: 1995,
      albumArt: null,
    };
    const state = roomPublicState(room);
    expect(state.currentCard?.year).toBeUndefined();
  });

  it('reveals year in reveal phase', () => {
    const room = baseRoom();
    room.phase = 'reveal';
    room.currentCard = {
      trackId: 't1',
      title: 'Song',
      artist: 'Band',
      year: 1995,
      albumArt: null,
    };
    const state = roomPublicState(room);
    expect(state.currentCard?.year).toBe(1995);
  });

  it('does not strip year from other timeline cards', () => {
    const room = baseRoom();
    room.phase = 'playing';
    room.currentCard = {
      trackId: 'current',
      title: 'New',
      artist: 'Band',
      year: 2000,
      albumArt: null,
    };
    room.players.p1.timeline = [
      {
        trackId: 'old',
        title: 'Old',
        artist: 'Band',
        year: 1980,
        albumArt: null,
      },
      {
        trackId: 'current',
        title: 'New',
        artist: 'Band',
        year: 2000,
        albumArt: null,
      },
    ];
    const state = roomPublicState(room);
    expect(state.players.p1.timeline[0]).toEqual({
      trackId: 'old',
      title: 'Old',
      artist: 'Band',
      year: 1980,
      albumArt: null,
    });
    expect(state.players.p1.timeline[1]).toEqual({ trackId: 'current' });
  });

  it('uses default revealTimeoutSeconds of 10', () => {
    delete process.env.REVEAL_TIMEOUT_SECONDS;
    const state = roomPublicState(baseRoom());
    expect(state.settings.revealTimeoutSeconds).toBe(10);
  });

  it('default autoAdvanceSeconds is null', () => {
    const state = roomPublicState(baseRoom());
    expect(state.settings.autoAdvanceSeconds).toBeNull();
  });
});

describe('earliestYearFromRecordings', () => {
  it('returns null for empty array', () => {
    expect(earliestYearFromRecordings([])).toBeNull();
  });

  it('extracts year from release-groups', () => {
    const recordings: MusicBrainzRecording[] = [
      {
        score: 100,
        'release-groups': [{ 'first-release-date': '1991-11-24' }],
        releases: [],
      },
    ];
    expect(earliestYearFromRecordings(recordings)).toBe(1991);
  });

  it('extracts year from releases', () => {
    const recordings: MusicBrainzRecording[] = [
      {
        score: 100,
        'release-groups': [],
        releases: [{ date: '2005-03-01' }],
      },
    ];
    expect(earliestYearFromRecordings(recordings)).toBe(2005);
  });

  it('returns the earliest year across multiple recordings', () => {
    const recordings: MusicBrainzRecording[] = [
      {
        score: 90,
        'release-groups': [{ 'first-release-date': '1999' }],
        releases: [],
      },
      {
        score: 90,
        'release-groups': [{ 'first-release-date': '1985' }],
        releases: [],
      },
      {
        score: 90,
        'release-groups': [{ 'first-release-date': '2010' }],
        releases: [],
      },
    ];
    expect(earliestYearFromRecordings(recordings)).toBe(1985);
  });

  it('ignores invalid years (below 1000)', () => {
    const recordings: MusicBrainzRecording[] = [
      {
        score: 90,
        'release-groups': [{ 'first-release-date': '999' }],
        releases: [{ date: '1975' }],
      },
    ];
    expect(earliestYearFromRecordings(recordings)).toBe(1975);
  });

  it('handles missing date fields gracefully', () => {
    const recordings: MusicBrainzRecording[] = [
      {
        score: 90,
        'release-groups': [{ 'first-release-date': null }],
        releases: [{ date: null }],
      },
    ];
    expect(earliestYearFromRecordings(recordings)).toBeNull();
  });
});

describe('pickRandomTrack', () => {
  it('returns null when all tracks are used', () => {
    const room = {
      playlist: {
        id: 'p',
        tracks: [
          { trackId: 'a', title: '', artist: '', year: 2000, albumArt: null },
          { trackId: 'b', title: '', artist: '', year: 2001, albumArt: null },
        ],
      },
      usedTracks: new Set(['a', 'b']),
    };
    expect(pickRandomTrack(room)).toBeNull();
  });

  it('returns only unused tracks', () => {
    const room = {
      playlist: {
        id: 'p',
        tracks: [
          { trackId: 'a', title: '', artist: '', year: 2000, albumArt: null },
          { trackId: 'b', title: '', artist: '', year: 2001, albumArt: null },
          { trackId: 'c', title: '', artist: '', year: 2002, albumArt: null },
        ],
      },
      usedTracks: new Set(['a', 'b']),
    };
    expect(pickRandomTrack(room)).toMatchObject({ trackId: 'c' });
  });

  it('returns one of the available tracks', () => {
    const tracks = [
      { trackId: 'x', title: '', artist: '', year: 2000, albumArt: null },
      { trackId: 'y', title: '', artist: '', year: 2001, albumArt: null },
    ];
    const room = {
      playlist: { id: 'p', tracks },
      usedTracks: new Set<string>(),
    };
    const picked = pickRandomTrack(room);
    expect(tracks).toContainEqual(picked);
  });
});

describe('makeRateLimiter', () => {
  it('allows requests within limit', () => {
    const rl = makeRateLimiter();
    expect(rl('createRoom')).toBe(true);
    expect(rl('createRoom')).toBe(true);
    expect(rl('createRoom')).toBe(true);
  });

  it('blocks requests exceeding limit', () => {
    const rl = makeRateLimiter();
    rl('createRoom');
    rl('createRoom');
    rl('createRoom');
    expect(rl('createRoom')).toBe(false);
  });

  it('allows unknown events unconditionally', () => {
    const rl = makeRateLimiter();
    for (let i = 0; i < 20; i++) {
      expect(rl('unknownEvent')).toBe(true);
    }
  });

  it('tracks limits per event independently', () => {
    const rl = makeRateLimiter();
    rl('createRoom');
    rl('createRoom');
    rl('createRoom');
    expect(rl('createRoom')).toBe(false);
    // joinRoom has max 5, should still be allowed
    expect(rl('joinRoom')).toBe(true);
  });
});
