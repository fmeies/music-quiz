import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import GameScreen from '../components/GameScreen';
import { useGame } from '../context/GameContext';
import type { GameContextValue, GameState } from '../types';

vi.mock('../context/GameContext', () => ({ useGame: vi.fn() }));
vi.mock('../components/NowPlaying', () => ({
  default: () => <div data-testid="now-playing" />,
}));
vi.mock('../components/Timeline', () => ({
  default: ({ playerId }: { playerId: string | null }) => (
    <div data-testid={`timeline-${playerId}`} />
  ),
}));
vi.mock('../components/OptionsMenu', () => ({
  default: () => <button data-testid="options-menu">⚙️</button>,
}));

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
        score: 2,
        challenged: false,
        timeline: [],
        timelineCount: 0,
      },
      p2: {
        name: 'Bob',
        score: 1,
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
    settings: {
      revealTimeoutSeconds: 10,
      autoAdvanceSeconds: null,
      autoAdvanceChallengeSeconds: null,
      maxCards: 10,
    },
    gameoverReason: null,
    playlists: [],
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<GameContextValue> = {}
): GameContextValue {
  return {
    connected: true,
    gameState: makeGameState(),
    playerId: 'p1',
    roomId: 'ABCDE',
    error: null,
    clearError: vi.fn(),
    isHost: true,
    me: {
      name: 'Alice',
      score: 2,
      challenged: false,
      timeline: [],
      timelineCount: 0,
    },
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

// ─── Phase badges ─────────────────────────────────────────────────────────────

describe('GameScreen — phase badges', () => {
  it('shows "Your turn!" when active player in playing phase', () => {
    vi.mocked(useGame).mockReturnValue(makeContext({ isActivePlayer: true }));
    render(<GameScreen />);
    expect(screen.getByText(/Your turn!/)).toBeDefined();
  });

  it("shows other player's name when not active player in playing phase", () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: false,
        playerId: 'p2',
        gameState: makeGameState({ currentPlayerId: 'p1' }),
      })
    );
    render(<GameScreen />);
    expect(screen.getByText(/Alice's turn/)).toBeDefined();
  });

  it('shows challenge phase badge in placed phase', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({ phase: 'placed', placedAt: Date.now() }),
      })
    );
    render(<GameScreen />);
    expect(screen.getByText('👀 Challenge phase')).toBeDefined();
  });

  it('shows reveal badge in reveal phase', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({ gameState: makeGameState({ phase: 'reveal' }) })
    );
    render(<GameScreen />);
    expect(screen.getByText('🔍 Reveal')).toBeDefined();
  });
});

// ─── Challenge button ─────────────────────────────────────────────────────────

describe('GameScreen — challenge button', () => {
  it('shows challenge button for non-active player in placed phase', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: false,
        playerId: 'p2',
        me: {
          name: 'Bob',
          score: 1,
          challenged: false,
          timeline: [],
          timelineCount: 0,
        },
        gameState: makeGameState({
          phase: 'placed',
          placedAt: Date.now(),
          currentPlayerId: 'p1',
        }),
      })
    );
    render(<GameScreen />);
    expect(screen.getByRole('button', { name: /Challenge/ })).toBeDefined();
  });

  it('hides challenge button when player has already challenged', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: false,
        playerId: 'p2',
        me: {
          name: 'Bob',
          score: 1,
          challenged: true,
          timeline: [],
          timelineCount: 0,
        },
        gameState: makeGameState({
          phase: 'placed',
          placedAt: Date.now(),
          currentPlayerId: 'p1',
          players: {
            p1: {
              name: 'Alice',
              score: 2,
              challenged: false,
              timeline: [],
              timelineCount: 0,
            },
            p2: {
              name: 'Bob',
              score: 1,
              challenged: true,
              timeline: [],
              timelineCount: 0,
            },
          },
        }),
      })
    );
    render(<GameScreen />);
    expect(screen.queryByRole('button', { name: /Challenge/ })).toBeNull();
  });

  it('hides challenge button for the active player', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: true,
        gameState: makeGameState({ phase: 'placed', placedAt: Date.now() }),
      })
    );
    render(<GameScreen />);
    expect(screen.queryByRole('button', { name: /Challenge/ })).toBeNull();
  });

  it('calls challenge() when challenge button is clicked', () => {
    const challenge = vi.fn();
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: false,
        playerId: 'p2',
        me: {
          name: 'Bob',
          score: 1,
          challenged: false,
          timeline: [],
          timelineCount: 0,
        },
        gameState: makeGameState({
          phase: 'placed',
          placedAt: Date.now(),
          currentPlayerId: 'p1',
        }),
        challenge,
      })
    );
    render(<GameScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Challenge/ }));
    expect(challenge).toHaveBeenCalledOnce();
  });
});

// ─── Next button ──────────────────────────────────────────────────────────────

describe('GameScreen — next turn button', () => {
  it('shows "Next →" for host in reveal phase', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isHost: true,
        gameState: makeGameState({ phase: 'reveal' }),
      })
    );
    render(<GameScreen />);
    expect(screen.getByRole('button', { name: /Next/ })).toBeDefined();
  });

  it('hides "Next →" for non-host in reveal phase', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isHost: false,
        gameState: makeGameState({ phase: 'reveal' }),
      })
    );
    render(<GameScreen />);
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
  });

  it('hides "Next →" for host outside reveal phase', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isHost: true,
        gameState: makeGameState({ phase: 'playing' }),
      })
    );
    render(<GameScreen />);
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
  });

  it('calls nextTurn() when next button is clicked', () => {
    const nextTurn = vi.fn();
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isHost: true,
        gameState: makeGameState({ phase: 'reveal' }),
        nextTurn,
      })
    );
    render(<GameScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(nextTurn).toHaveBeenCalledOnce();
  });
});

// ─── Options menu ─────────────────────────────────────────────────────────────

describe('GameScreen — options menu', () => {
  it('shows options menu for host', () => {
    vi.mocked(useGame).mockReturnValue(makeContext({ isHost: true }));
    render(<GameScreen />);
    expect(screen.getByTestId('options-menu')).toBeDefined();
  });

  it('hides options menu for non-host', () => {
    vi.mocked(useGame).mockReturnValue(makeContext({ isHost: false }));
    render(<GameScreen />);
    expect(screen.queryByTestId('options-menu')).toBeNull();
  });
});

// ─── Countdown ────────────────────────────────────────────────────────────────

describe('GameScreen — challenge countdown', () => {
  it('shows initial countdown when phase is placed', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          phase: 'placed',
          placedAt: Date.now(),
          settings: {
            revealTimeoutSeconds: 10,
            autoAdvanceSeconds: null,
            autoAdvanceChallengeSeconds: null,
            maxCards: 10,
          },
        }),
      })
    );
    render(<GameScreen />);
    expect(screen.getByText('10')).toBeDefined();
  });

  it('shows auto-advance countdown in reveal phase when configured', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          phase: 'reveal',
          revealedAt: Date.now(),
          settings: {
            revealTimeoutSeconds: 10,
            autoAdvanceSeconds: 5,
            autoAdvanceChallengeSeconds: null,
            maxCards: 10,
          },
        }),
      })
    );
    render(<GameScreen />);
    expect(screen.getByText('5')).toBeDefined();
  });

  it('does not show auto-advance countdown when not configured', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          phase: 'reveal',
          revealedAt: Date.now(),
          settings: {
            revealTimeoutSeconds: 10,
            autoAdvanceSeconds: null,
            autoAdvanceChallengeSeconds: null,
            maxCards: 10,
          },
        }),
      })
    );
    render(<GameScreen />);
    // No countdown number should appear
    expect(screen.queryByText('5')).toBeNull();
    expect(screen.queryByText('10')).toBeNull();
  });
});

// ─── Countdown ticks ─────────────────────────────────────────────────────────

describe('GameScreen — countdown ticking', () => {
  it('counts down over time in placed phase', async () => {
    vi.useFakeTimers();
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isActivePlayer: false,
        playerId: 'p2',
        me: {
          name: 'Bob',
          score: 1,
          challenged: false,
          timeline: [],
          timelineCount: 0,
        },
        gameState: makeGameState({
          phase: 'placed',
          placedAt: Date.now(),
          currentPlayerId: 'p1',
          settings: {
            revealTimeoutSeconds: 10,
            autoAdvanceSeconds: null,
            autoAdvanceChallengeSeconds: null,
            maxCards: 10,
          },
        }),
      })
    );
    render(<GameScreen />);
    expect(screen.getByText('10')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('7')).toBeDefined();
    vi.useRealTimers();
  });
});

// ─── Gameover ────────────────────────────────────────────────────────────────

describe('GameScreen — gameover', () => {
  it('shows gameover overlay with sorted scores', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          phase: 'gameover',
          players: {
            p1: {
              name: 'Alice',
              score: 5,
              challenged: false,
              timeline: [],
              timelineCount: 0,
            },
            p2: {
              name: 'Bob',
              score: 8,
              challenged: false,
              timeline: [],
              timelineCount: 0,
            },
          },
        }),
      })
    );
    render(<GameScreen />);
    expect(screen.getByText('🏆 Game over!')).toBeDefined();
    const scores = screen.getAllByText(/pts/);
    expect(scores[0].textContent).toBe('8 pts');
    expect(scores[1].textContent).toBe('5 pts');
  });

  it('shows round limit reason when gameoverReason is rounds', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isHost: true,
        gameState: makeGameState({
          phase: 'gameover',
          gameoverReason: 'cards',
          settings: {
            revealTimeoutSeconds: 10,
            autoAdvanceSeconds: null,
            autoAdvanceChallengeSeconds: null,
            maxCards: 10,
          },
        }),
      })
    );
    render(<GameScreen />);
    expect(screen.getByText('A player reached 10 cards')).toBeDefined();
  });

  it('shows all songs played reason when gameoverReason is no_tracks', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          phase: 'gameover',
          gameoverReason: 'no_tracks',
        }),
      })
    );
    render(<GameScreen />);
    expect(screen.getByText('All songs have been played')).toBeDefined();
  });

  it('shows Continue button for host when round limit was reached', () => {
    const continueGame = vi.fn();
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isHost: true,
        continueGame,
        gameState: makeGameState({
          phase: 'gameover',
          gameoverReason: 'cards',
        }),
      })
    );
    render(<GameScreen />);
    const btn = screen.getByRole('button', { name: /Continue playing/ });
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(continueGame).toHaveBeenCalledOnce();
  });

  it('hides Continue button for non-host', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isHost: false,
        gameState: makeGameState({
          phase: 'gameover',
          gameoverReason: 'cards',
        }),
      })
    );
    render(<GameScreen />);
    expect(
      screen.queryByRole('button', { name: /Continue playing/ })
    ).toBeNull();
  });

  it('hides Continue button when gameover reason is not rounds', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        isHost: true,
        gameState: makeGameState({
          phase: 'gameover',
          gameoverReason: 'no_tracks',
        }),
      })
    );
    render(<GameScreen />);
    expect(
      screen.queryByRole('button', { name: /Continue playing/ })
    ).toBeNull();
  });
});
