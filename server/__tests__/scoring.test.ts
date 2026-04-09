import { applyReveal, advanceTurn, checkGameover } from '../gameLogic';
import type { Room, Card, InternalPlayer, Phase } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRoom({
  players,
  currentPlayerId,
  currentCard,
  playerOrder = [],
  currentTurnIndex = 0,
  phase = 'placed' as Phase,
  round = 1,
}: {
  players: Record<string, InternalPlayer>;
  currentPlayerId: string;
  currentCard: Card;
  playerOrder?: string[];
  currentTurnIndex?: number;
  phase?: Phase;
  round?: number;
}): Room {
  return {
    players,
    currentPlayerId,
    currentCard,
    playerOrder,
    currentTurnIndex,
    phase,
    lastResult: null,
    round,
    hostId: currentPlayerId,
    playlist: null,
    usedTracks: new Set(),
    spotifyToken: null,
    oauthState: null,
    placedAt: null,
    revealedAt: null,
    settings: { revealTimeoutSeconds: 10, autoAdvanceSeconds: null, maxRounds: 10 },
    gameoverReason: null,
  };
}

function card(trackId: string, year: number): Card {
  return {
    trackId,
    title: `Song ${trackId}`,
    artist: 'Band',
    year,
    albumArt: null,
  };
}

function player(
  name: string,
  timeline: Card[] = [],
  score = 0,
  challenged = false
): InternalPlayer {
  return { name, timeline: timeline.map((c) => ({ ...c })), score, challenged };
}

// ─── applyReveal ─────────────────────────────────────────────────────────────

describe('applyReveal — correct placement', () => {
  it('gives active player +1 score when only card in timeline', () => {
    const c = card('t1', 1990);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: { p1: player('Alice', [c]) },
    });
    applyReveal(room);
    expect(room.players.p1.score).toBe(1);
    expect(room.lastResult).toEqual({
      playerName: 'Alice',
      correct: true,
      challenger: null,
    });
  });

  it('correct when card is placed between two cards with correct years', () => {
    const c = card('t2', 1990);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: {
        p1: player('Alice', [card('t0', 1980), c, card('t3', 2000)]),
      },
    });
    applyReveal(room);
    expect(room.players.p1.score).toBe(1);
    expect(room.lastResult?.correct).toBe(true);
  });

  it('correct when placed at the beginning (no prev card)', () => {
    const c = card('t1', 1975);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: { p1: player('Alice', [c, card('t2', 2000)]) },
    });
    applyReveal(room);
    expect(room.players.p1.score).toBe(1);
  });

  it('correct when placed at the end (no next card)', () => {
    const c = card('t2', 2005);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: { p1: player('Alice', [card('t1', 1990), c]) },
    });
    applyReveal(room);
    expect(room.players.p1.score).toBe(1);
  });

  it('correct placement — challenger loses a card from their timeline', () => {
    const c = card('t1', 1990);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: {
        p1: player('Alice', [c]),
        p2: player('Bob', [card('x1', 1985), card('x2', 1995)], 0, true),
      },
    });
    applyReveal(room);
    expect(room.players.p1.score).toBe(1);
    expect(room.players.p2.timeline).toHaveLength(1);
    expect(room.lastResult?.challenger).toBeNull();
  });

  it('correct placement — challenger with empty timeline loses no card', () => {
    const c = card('t1', 1990);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: {
        p1: player('Alice', [c]),
        p2: player('Bob', [], 0, true),
      },
    });
    applyReveal(room);
    expect(room.players.p2.timeline).toHaveLength(0);
  });
});

describe('applyReveal — wrong placement', () => {
  it('removes card from active player timeline on wrong placement', () => {
    // year 1990 placed after year 2000 → wrong
    const c = card('t2', 1990);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: { p1: player('Alice', [card('t1', 2000), c]) },
    });
    applyReveal(room);
    expect(room.players.p1.score).toBe(0);
    expect(room.players.p1.timeline).toHaveLength(1);
    expect(room.lastResult?.correct).toBe(false);
  });

  it('challenger gets +1 score and receives the card on wrong placement', () => {
    const c = card('t2', 1990);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: {
        p1: player('Alice', [card('t1', 2000), c]),
        p2: player('Bob', [card('x1', 1985)], 0, true),
      },
    });
    applyReveal(room);
    expect(room.players.p2.score).toBe(1);
    expect(room.lastResult?.challenger).toBe('Bob');
    expect(room.players.p2.timeline.map((t) => t.year)).toEqual([1985, 1990]);
  });

  it('challenger card is inserted at correct sorted position', () => {
    const c = card('t2', 1993);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: {
        p1: player('Alice', [c, card('t1', 1980)]), // wrong: 1993 before 1980
        p2: player('Bob', [card('x1', 1985), card('x2', 2000)], 0, true),
      },
    });
    applyReveal(room);
    expect(room.players.p2.timeline.map((t) => t.year)).toEqual([
      1985, 1993, 2000,
    ]);
  });

  it('challenger card appended when it is the latest year', () => {
    const c = card('t2', 2010);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: {
        p1: player('Alice', [c, card('t1', 1980)]), // wrong placement
        p2: player('Bob', [card('x1', 1990), card('x2', 2005)], 0, true),
      },
    });
    applyReveal(room);
    expect(room.players.p2.timeline.map((t) => t.year)).toEqual([
      1990, 2005, 2010,
    ]);
  });

  it('only the one challenger receives the card and score', () => {
    const c = card('t2', 1990);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: {
        p1: player('Alice', [c, card('t1', 1980)]), // wrong
        p2: player('Bob', [], 0, true), // the challenger
        p3: player('Carol', [], 0, false), // did not challenge
      },
    });
    applyReveal(room);
    expect(room.players.p2.score).toBe(1);
    expect(room.players.p3.score).toBe(0);
    expect(room.lastResult?.challenger).toBe('Bob');
  });

  it('non-challenging players are unaffected on wrong placement', () => {
    const c = card('t2', 1990);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'p1',
      players: {
        p1: player('Alice', [c, card('t1', 1980)]),
        p2: player('Bob', [card('x1', 2000)], 5, false), // did not challenge
      },
    });
    applyReveal(room);
    expect(room.players.p2.score).toBe(5);
    expect(room.players.p2.timeline).toHaveLength(1);
  });

  it('returns false when active player is missing', () => {
    const c = card('t1', 1990);
    const room = makeRoom({
      currentCard: c,
      currentPlayerId: 'ghost',
      players: { p1: player('Alice', [c]) },
    });
    const result = applyReveal(room);
    expect(result).toBe(false);
  });
});

// ─── advanceTurn ─────────────────────────────────────────────────────────────

describe('advanceTurn', () => {
  it('advances to the next player in order', () => {
    const room = makeRoom({
      playerOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      currentPlayerId: 'p1',
      players: {
        p1: player('Alice'),
        p2: player('Bob'),
        p3: player('Carol'),
      },
      phase: 'reveal',
      currentCard: card('t1', 2000),
    });
    const result = advanceTurn(room);
    expect(result).toBe(true);
    expect(room.currentPlayerId).toBe('p2');
    expect(room.currentTurnIndex).toBe(1);
    expect(room.round).toBe(2);
  });

  it('wraps around to first player after last', () => {
    const room = makeRoom({
      playerOrder: ['p1', 'p2'],
      currentTurnIndex: 1,
      currentPlayerId: 'p2',
      players: { p1: player('Alice'), p2: player('Bob') },
      phase: 'reveal',
      currentCard: card('t1', 2000),
    });
    advanceTurn(room);
    expect(room.currentPlayerId).toBe('p1');
    expect(room.currentTurnIndex).toBe(0);
  });

  it('removes disconnected players from playerOrder before advancing', () => {
    const room = makeRoom({
      playerOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      currentPlayerId: 'p1',
      players: { p1: player('Alice'), p3: player('Carol') }, // p2 disconnected
      phase: 'reveal',
      currentCard: card('t1', 2000),
    });
    advanceTurn(room);
    expect(room.playerOrder).toEqual(['p1', 'p3']);
    expect(room.currentPlayerId).toBe('p3');
  });

  it('returns false and sets gameover when no players remain', () => {
    const room = makeRoom({
      playerOrder: ['p1'],
      currentTurnIndex: 0,
      currentPlayerId: 'p1',
      players: {}, // everyone disconnected
      phase: 'reveal',
      currentCard: card('t1', 2000),
    });
    const result = advanceTurn(room);
    expect(result).toBe(false);
    expect(room.phase).toBe('gameover');
  });

  it('increments round counter after advancing', () => {
    const room = makeRoom({
      playerOrder: ['p1', 'p2'],
      currentTurnIndex: 0,
      currentPlayerId: 'p1',
      players: { p1: player('Alice'), p2: player('Bob') },
      phase: 'reveal',
      round: 5,
      currentCard: card('t1', 2000),
    });
    advanceTurn(room);
    expect(room.round).toBe(6);
  });
});

// ─── checkGameover ────────────────────────────────────────────────────────────

describe('checkGameover', () => {
  function roundRoom(round: number, maxRounds: number | null) {
    const room = makeRoom({
      players: { p1: player('Alice') },
      currentPlayerId: 'p1',
      currentCard: card('t1', 2000),
      round,
    });
    room.settings = { revealTimeoutSeconds: 10, autoAdvanceSeconds: null, maxRounds };
    return room;
  }

  it('returns null when maxRounds is null (unlimited)', () => {
    expect(checkGameover(roundRoom(100, null))).toBeNull();
  });

  it('returns rounds when round exceeds maxRounds', () => {
    expect(checkGameover(roundRoom(11, 10))).toBe('rounds');
  });

  it('returns null when round equals maxRounds (turn not over yet)', () => {
    expect(checkGameover(roundRoom(10, 10))).toBeNull();
  });

  it('returns null when round is below maxRounds', () => {
    expect(checkGameover(roundRoom(5, 10))).toBeNull();
  });
});
