import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { GameProvider, useGame } from '../context/GameContext';
import type { GameState } from '../types';

// ─── Mock socket.io-client ────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;
const socketHandlers: Record<string, EventHandler> = {};

const mockSocket = {
  on: vi.fn((event: string, handler: EventHandler) => {
    socketHandlers[event] = handler;
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function TestConsumer() {
  const ctx = useGame();
  return (
    <div>
      <span data-testid="connected">{String(ctx.connected)}</span>
      <span data-testid="phase">{ctx.gameState?.phase ?? 'none'}</span>
      <span data-testid="error">{ctx.error ?? ''}</span>
      <span data-testid="playerId">{ctx.playerId ?? ''}</span>
      <span data-testid="roomId">{ctx.roomId ?? ''}</span>
      <span data-testid="spotifyToken">{ctx.spotifyToken ?? ''}</span>
      <button
        data-testid="create-room-btn"
        onClick={() => ctx.createRoom('Alice').catch(() => {})}
      >
        Create
      </button>
      <button
        data-testid="join-room-btn"
        onClick={() => ctx.joinRoom('ABCDE', 'Alice').catch(() => {})}
      >
        Join
      </button>
      <button data-testid="clear-error-btn" onClick={ctx.clearError}>
        Clear error
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <GameProvider>
      <TestConsumer />
    </GameProvider>
  );
}

const baseGameState: GameState = {
  phase: 'lobby',
  round: 0,
  hostId: 'p1',
  currentPlayerId: null,
  players: {},
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
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  localStorage.clear();
  mockSocket.on.mockImplementation((event: string, handler: EventHandler) => {
    socketHandlers[event] = handler;
  });
});

// ── Connection ────────────────────────────────────────────────────────────────

describe('GameContext — connection', () => {
  it('starts disconnected', () => {
    renderWithProvider();
    expect(screen.getByTestId('connected').textContent).toBe('false');
  });

  it('sets connected=true when socket emits connect', () => {
    renderWithProvider();
    act(() => {
      socketHandlers['connect']?.();
    });
    expect(screen.getByTestId('connected').textContent).toBe('true');
  });

  it('sets connected=false when socket emits disconnect', () => {
    renderWithProvider();
    act(() => {
      socketHandlers['connect']?.();
    });
    act(() => {
      socketHandlers['disconnect']?.();
    });
    expect(screen.getByTestId('connected').textContent).toBe('false');
  });
});

// ── Game state ────────────────────────────────────────────────────────────────

describe('GameContext — game state', () => {
  it('updates phase on gameState event', () => {
    renderWithProvider();
    act(() => {
      socketHandlers['gameState']?.(baseGameState);
    });
    expect(screen.getByTestId('phase').textContent).toBe('lobby');
  });

  it('reflects phase changes', () => {
    renderWithProvider();
    act(() => {
      socketHandlers['gameState']?.({ ...baseGameState, phase: 'playing' });
    });
    expect(screen.getByTestId('phase').textContent).toBe('playing');
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('GameContext — error handling', () => {
  it('shows error on error event', () => {
    renderWithProvider();
    act(() => {
      socketHandlers['error']?.('Playlist not found');
    });
    expect(screen.getByTestId('error').textContent).toBe('Playlist not found');
  });

  it('clears error via clearError()', () => {
    renderWithProvider();
    act(() => {
      socketHandlers['error']?.('Something went wrong');
    });
    act(() => {
      fireEvent.click(screen.getByTestId('clear-error-btn'));
    });
    expect(screen.getByTestId('error').textContent).toBe('');
  });

  it('stores Spotify token on spotifyToken event', () => {
    renderWithProvider();
    act(() => {
      socketHandlers['spotifyToken']?.('my-token-123');
    });
    expect(screen.getByTestId('spotifyToken').textContent).toBe('my-token-123');
  });
});

// ── createRoom ────────────────────────────────────────────────────────────────

describe('GameContext — createRoom', () => {
  it('emits createRoom with playerName', async () => {
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, cb?: (res: unknown) => void) => {
        if (event === 'createRoom' && cb)
          cb({ roomId: 'ABCDE', playerId: 'p1' });
      }
    );
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('create-room-btn'));
    });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'createRoom',
      { playerName: 'Alice' },
      expect.any(Function)
    );
  });

  it('updates playerId and roomId on success', async () => {
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, cb?: (res: unknown) => void) => {
        if (event === 'createRoom' && cb)
          cb({ roomId: 'ABCDE', playerId: 'p1' });
      }
    );
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('create-room-btn'));
    });
    expect(screen.getByTestId('playerId').textContent).toBe('p1');
    expect(screen.getByTestId('roomId').textContent).toBe('ABCDE');
  });

  it('persists session to localStorage on success', async () => {
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, cb?: (res: unknown) => void) => {
        if (event === 'createRoom' && cb)
          cb({ roomId: 'ABCDE', playerId: 'p1' });
      }
    );
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('create-room-btn'));
    });
    const session = JSON.parse(
      localStorage.getItem(`${import.meta.env.BASE_URL}mqSession`) ?? 'null'
    );
    expect(session).toEqual({ roomId: 'ABCDE', playerId: 'p1' });
  });

  it('rejects on error response', async () => {
    let caughtError: unknown;
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, cb?: (res: unknown) => void) => {
        if (event === 'createRoom' && cb) cb({ error: 'Too many requests' });
      }
    );

    function CreateWithErrorCapture() {
      const ctx = useGame();
      return (
        <button
          data-testid="create-err-btn"
          onClick={() =>
            ctx.createRoom('Alice').catch((e: string) => {
              caughtError = e;
            })
          }
        >
          Create
        </button>
      );
    }
    render(
      <GameProvider>
        <CreateWithErrorCapture />
      </GameProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('create-err-btn'));
    });
    expect(caughtError).toBe('Too many requests');
  });
});

// ── joinRoom ──────────────────────────────────────────────────────────────────

describe('GameContext — joinRoom', () => {
  it('emits joinRoom with uppercased roomId', async () => {
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, cb?: (res: unknown) => void) => {
        if (event === 'joinRoom' && cb) cb({ roomId: 'ABCDE', playerId: 'p2' });
      }
    );
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('join-room-btn'));
    });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'joinRoom',
      { roomId: 'ABCDE', playerName: 'Alice' },
      expect.any(Function)
    );
  });

  it('updates state on success', async () => {
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, cb?: (res: unknown) => void) => {
        if (event === 'joinRoom' && cb) cb({ roomId: 'ABCDE', playerId: 'p2' });
      }
    );
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('join-room-btn'));
    });
    expect(screen.getByTestId('playerId').textContent).toBe('p2');
  });
});

// ── Reconnection ──────────────────────────────────────────────────────────────

describe('GameContext — reconnection', () => {
  it('emits reconnectPlayer when session exists in localStorage', () => {
    localStorage.setItem(
      `${import.meta.env.BASE_URL}mqSession`,
      JSON.stringify({ roomId: 'ABCDE', playerId: 'p1' })
    );
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, cb?: (res: unknown) => void) => {
        if (event === 'reconnectPlayer' && cb) cb({ ok: true });
      }
    );
    renderWithProvider();
    act(() => {
      socketHandlers['connect']?.();
    });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'reconnectPlayer',
      { roomId: 'ABCDE', playerId: 'p1' },
      expect.any(Function)
    );
  });

  it('restores playerId and roomId on successful reconnection', () => {
    localStorage.setItem(
      `${import.meta.env.BASE_URL}mqSession`,
      JSON.stringify({ roomId: 'ABCDE', playerId: 'p1' })
    );
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, cb?: (res: unknown) => void) => {
        if (event === 'reconnectPlayer' && cb) cb({ ok: true });
      }
    );
    renderWithProvider();
    act(() => {
      socketHandlers['connect']?.();
    });
    expect(screen.getByTestId('playerId').textContent).toBe('p1');
    expect(screen.getByTestId('roomId').textContent).toBe('ABCDE');
  });

  it('clears session and resets state on reconnection failure', () => {
    localStorage.setItem(
      `${import.meta.env.BASE_URL}mqSession`,
      JSON.stringify({ roomId: 'ABCDE', playerId: 'p1' })
    );
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, cb?: (res: unknown) => void) => {
        if (event === 'reconnectPlayer' && cb)
          cb({ error: 'Session not found' });
      }
    );
    renderWithProvider();
    act(() => {
      socketHandlers['connect']?.();
    });
    expect(
      localStorage.getItem(`${import.meta.env.BASE_URL}mqSession`)
    ).toBeNull();
    expect(screen.getByTestId('playerId').textContent).toBe('');
    expect(screen.getByTestId('roomId').textContent).toBe('');
  });

  it('skips reconnect attempt when no session in localStorage', () => {
    renderWithProvider();
    act(() => {
      socketHandlers['connect']?.();
    });
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});
