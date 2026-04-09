import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Timeline from '../components/Timeline';
import { useGame } from '../context/GameContext';
import type { GameContextValue, GameState } from '../types';

vi.mock('../context/GameContext', () => ({ useGame: vi.fn() }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing',
    round: 1,
    hostId: 'p1',
    currentPlayerId: 'p1',
    players: {
      p1: {
        name: 'Alice',
        score: 3,
        challenged: false,
        timeline: [],
        timelineCount: 0,
      },
    },
    currentCard: null,
    playlist: null,
    lastResult: null,
    placedAt: null,
    revealedAt: null,
    settings: { revealTimeoutSeconds: 10, autoAdvanceSeconds: null, maxRounds: 10 },
    gameoverReason: null,
    playlists: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<GameContextValue> = {}): GameContextValue {
  return {
    connected: true,
    gameState: makeGameState(),
    playerId: 'p1',
    roomId: 'ABCDE',
    error: null,
    clearError: vi.fn(),
    isHost: true,
    me: { name: 'Alice', score: 3, challenged: false, timeline: [], timelineCount: 0 },
    isActivePlayer: true,
    spotifyToken: null,
    connectingSpotify: false,
    updateSettings: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    connectSpotify: vi.fn(),
    loadPlaylist: vi.fn(),
    startGame: vi.fn(),
    placeCard: vi.fn(),
    challenge: vi.fn(),
    nextTurn: vi.fn(),
    continueGame: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('Timeline — rendering', () => {
  it('returns null when player not found', () => {
    vi.mocked(useGame).mockReturnValue(makeContext());
    const { container } = render(<Timeline playerId="unknown" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when playerId is null', () => {
    vi.mocked(useGame).mockReturnValue(makeContext());
    const { container } = render(<Timeline playerId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the player name', () => {
    vi.mocked(useGame).mockReturnValue(makeContext());
    render(<Timeline playerId="p1" />);
    expect(screen.getByText(/Alice/)).toBeDefined();
  });

  it('shows "(You)" for own timeline', () => {
    vi.mocked(useGame).mockReturnValue(makeContext({ playerId: 'p1' }));
    render(<Timeline playerId="p1" />);
    expect(screen.getByText(/\(You\)/)).toBeDefined();
  });

  it('does not show "(You)" for another player', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        playerId: 'p2',
        gameState: makeGameState({
          players: {
            p1: { name: 'Alice', score: 3, challenged: false, timeline: [], timelineCount: 0 },
            p2: { name: 'Bob', score: 1, challenged: false, timeline: [], timelineCount: 0 },
          },
        }),
      })
    );
    render(<Timeline playerId="p1" />);
    expect(screen.queryByText(/\(You\)/)).toBeNull();
  });

  it('shows the player score', () => {
    vi.mocked(useGame).mockReturnValue(makeContext());
    render(<Timeline playerId="p1" />);
    expect(screen.getByText(/⭐ 3/)).toBeDefined();
  });

  it('shows active badge for active player', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({ gameState: makeGameState({ currentPlayerId: 'p1' }) })
    );
    render(<Timeline playerId="p1" />);
    expect(screen.getByText(/active/)).toBeDefined();
  });

  it('shows "No cards yet" when timeline is empty and cannot place', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: false,
        playerId: 'p2',
        gameState: makeGameState({ currentPlayerId: 'p2' }),
      })
    );
    render(<Timeline playerId="p1" />);
    expect(screen.getByText('No cards yet')).toBeDefined();
  });
});

// ─── Cards ────────────────────────────────────────────────────────────────────

describe('Timeline — cards', () => {
  it('shows card title and artist when available', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          players: {
            p1: {
              name: 'Alice',
              score: 3,
              challenged: false,
              timelineCount: 1,
              timeline: [
                { trackId: 't1', title: 'Bohemian Rhapsody', artist: 'Queen', year: 1975, albumArt: null },
              ],
            },
          },
        }),
      })
    );
    render(<Timeline playerId="p1" />);
    expect(screen.getByText('Bohemian Rhapsody')).toBeDefined();
    expect(screen.getByText('Queen')).toBeDefined();
    expect(screen.getByText('1975')).toBeDefined();
  });

  it('shows ??? for hidden card (no title)', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          players: {
            p1: {
              name: 'Alice',
              score: 3,
              challenged: false,
              timelineCount: 1,
              timeline: [{ trackId: 't1' }],
            },
          },
        }),
      })
    );
    render(<Timeline playerId="p1" />);
    const unknowns = screen.getAllByText('???');
    expect(unknowns.length).toBeGreaterThan(0);
  });
});

// ─── Drop zones ───────────────────────────────────────────────────────────────

describe('Timeline — drop zones', () => {
  it('shows drop zone when active player in playing phase with empty timeline', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: true,
        playerId: 'p1',
        gameState: makeGameState({ phase: 'playing', currentPlayerId: 'p1' }),
      })
    );
    render(<Timeline playerId="p1" />);
    expect(screen.getByTitle('Place here (position 1)')).toBeDefined();
  });

  it('shows drop zones between cards', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: true,
        playerId: 'p1',
        gameState: makeGameState({
          phase: 'playing',
          currentPlayerId: 'p1',
          players: {
            p1: {
              name: 'Alice',
              score: 3,
              challenged: false,
              timelineCount: 2,
              timeline: [
                { trackId: 't1', title: 'Song A', artist: 'Band', year: 1980, albumArt: null },
                { trackId: 't2', title: 'Song B', artist: 'Band', year: 1990, albumArt: null },
              ],
            },
          },
        }),
      })
    );
    render(<Timeline playerId="p1" />);
    // 2 cards → 3 drop zones (before, between, after)
    const dropZones = screen.getAllByTitle(/Place here/);
    expect(dropZones).toHaveLength(3);
  });

  it('hides drop zones for non-active player', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: false,
        playerId: 'p2',
        gameState: makeGameState({ phase: 'playing', currentPlayerId: 'p1' }),
      })
    );
    render(<Timeline playerId="p1" />);
    expect(screen.queryByTitle(/Place here/)).toBeNull();
  });

  it('hides drop zones outside playing phase', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: true,
        gameState: makeGameState({ phase: 'placed', currentPlayerId: 'p1' }),
      })
    );
    render(<Timeline playerId="p1" />);
    expect(screen.queryByTitle(/Place here/)).toBeNull();
  });

  it('calls placeCard with position 0 for first drop zone', () => {
    const placeCard = vi.fn();
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: true,
        playerId: 'p1',
        gameState: makeGameState({ phase: 'playing', currentPlayerId: 'p1' }),
        placeCard,
      })
    );
    render(<Timeline playerId="p1" />);
    fireEvent.click(screen.getByTitle('Place here (position 1)'));
    expect(placeCard).toHaveBeenCalledWith(0);
  });

  it('calls placeCard with correct position for later drop zones', () => {
    const placeCard = vi.fn();
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: true,
        playerId: 'p1',
        gameState: makeGameState({
          phase: 'playing',
          currentPlayerId: 'p1',
          players: {
            p1: {
              name: 'Alice',
              score: 3,
              challenged: false,
              timelineCount: 1,
              timeline: [
                { trackId: 't1', title: 'Song A', artist: 'Band', year: 1980, albumArt: null },
              ],
            },
          },
        }),
        placeCard,
      })
    );
    render(<Timeline playerId="p1" />);
    fireEvent.click(screen.getByTitle('Place here (position 2)'));
    expect(placeCard).toHaveBeenCalledWith(1);
  });
});

// ─── Challenged badge ─────────────────────────────────────────────────────────

describe('Timeline — challenged badge', () => {
  it('shows challenged badge in placed phase', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          phase: 'placed',
          placedAt: Date.now(),
          players: {
            p1: { name: 'Alice', score: 3, challenged: true, timeline: [], timelineCount: 0 },
          },
        }),
      })
    );
    render(<Timeline playerId="p1" />);
    expect(screen.getByText('✋')).toBeDefined();
  });

  it('does not show challenged badge outside placed phase', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          phase: 'reveal',
          players: {
            p1: { name: 'Alice', score: 3, challenged: true, timeline: [], timelineCount: 0 },
          },
        }),
      })
    );
    render(<Timeline playerId="p1" />);
    expect(screen.queryByText('✋')).toBeNull();
  });
});
