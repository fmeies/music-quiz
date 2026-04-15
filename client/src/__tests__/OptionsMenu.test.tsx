import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OptionsMenu from '../components/OptionsMenu';
import { useGame } from '../context/GameContext';
import type { GameContextValue, GameState, RoomSettings } from '../types';

vi.mock('../context/GameContext', () => ({ useGame: vi.fn() }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<RoomSettings> = {}): RoomSettings {
  return {
    revealTimeoutSeconds: 10,
    autoAdvanceSeconds: null,
    autoAdvanceChallengeSeconds: null,
    maxCards: 10,
    ...overrides,
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
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
    settings: makeSettings(),
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
    me: undefined,
    isActivePlayer: false,
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

// ─── Visibility ───────────────────────────────────────────────────────────────

describe('OptionsMenu — visibility', () => {
  it('renders the gear button', () => {
    vi.mocked(useGame).mockReturnValue(makeContext());
    render(<OptionsMenu />);
    expect(screen.getByTitle('Options')).toBeDefined();
  });

  it('returns null when gameState is null', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({ gameState: null as unknown as GameState })
    );
    const { container } = render(<OptionsMenu />);
    expect(container.firstChild).toBeNull();
  });

  it('does not show modal initially', () => {
    vi.mocked(useGame).mockReturnValue(makeContext());
    render(<OptionsMenu />);
    expect(screen.queryByText('Game options')).toBeNull();
  });

  it('opens modal when gear button is clicked', () => {
    vi.mocked(useGame).mockReturnValue(makeContext());
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    expect(screen.getByText('Game options')).toBeDefined();
  });

  it('closes modal when Done is clicked', () => {
    vi.mocked(useGame).mockReturnValue(makeContext());
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Game options')).toBeNull();
  });

  it('closes modal when overlay backdrop is clicked', () => {
    vi.mocked(useGame).mockReturnValue(makeContext());
    const { container } = render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    const overlay = container.querySelector('.modal-overlay')!;
    fireEvent.click(overlay);
    expect(screen.queryByText('Game options')).toBeNull();
  });
});

// ─── Current values ───────────────────────────────────────────────────────────

describe('OptionsMenu — current values', () => {
  it('shows current revealTimeoutSeconds', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          settings: makeSettings({ revealTimeoutSeconds: 15 }),
        }),
      })
    );
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    const input = screen.getByLabelText('Challenge window') as HTMLInputElement;
    expect(input.value).toBe('15');
  });

  it('auto-advance checkbox is unchecked when autoAdvanceSeconds is null', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          settings: makeSettings({ autoAdvanceSeconds: null }),
        }),
      })
    );
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    const checkbox = screen.getByLabelText('Auto-advance') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('auto-advance checkbox is checked when autoAdvanceSeconds is set', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          settings: makeSettings({ autoAdvanceSeconds: 5 }),
        }),
      })
    );
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    const checkbox = screen.getByLabelText('Auto-advance') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('round limit checkbox is checked when maxCards is set', () => {
    vi.mocked(useGame).mockReturnValue(makeContext());
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    const checkbox = screen.getByLabelText('Card target') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('shows auto-advance seconds input when auto-advance is enabled', () => {
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        gameState: makeGameState({
          settings: makeSettings({ autoAdvanceSeconds: 8 }),
        }),
      })
    );
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    const values = inputs.map((i) => i.value);
    expect(values).toContain('8');
  });
});

// ─── Interactions ─────────────────────────────────────────────────────────────

describe('OptionsMenu — interactions', () => {
  it('calls updateSettings when reveal timeout changes', () => {
    const updateSettings = vi.fn();
    vi.mocked(useGame).mockReturnValue(makeContext({ updateSettings }));
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    fireEvent.change(screen.getByLabelText('Challenge window'), {
      target: { value: '20' },
    });
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ revealTimeoutSeconds: 20 })
    );
  });

  it('calls updateSettings with autoAdvanceSeconds: 5 when auto-advance is enabled', () => {
    const updateSettings = vi.fn();
    vi.mocked(useGame).mockReturnValue(makeContext({ updateSettings }));
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    fireEvent.click(screen.getByLabelText('Auto-advance'));
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoAdvanceSeconds: 5 })
    );
  });

  it('calls updateSettings with autoAdvanceSeconds: null when auto-advance is disabled', () => {
    const updateSettings = vi.fn();
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        updateSettings,
        gameState: makeGameState({
          settings: makeSettings({ autoAdvanceSeconds: 5 }),
        }),
      })
    );
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    fireEvent.click(screen.getByLabelText('Auto-advance'));
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoAdvanceSeconds: null })
    );
  });

  it('calls updateSettings with maxCards: 10 when round limit is enabled', () => {
    const updateSettings = vi.fn();
    vi.mocked(useGame).mockReturnValue(
      makeContext({
        updateSettings,
        gameState: makeGameState({
          settings: makeSettings({ maxCards: null }),
        }),
      })
    );
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    fireEvent.click(screen.getByLabelText('Card target'));
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ maxCards: 10 })
    );
  });

  it('calls updateSettings with maxCards: null when round limit is disabled', () => {
    const updateSettings = vi.fn();
    vi.mocked(useGame).mockReturnValue(makeContext({ updateSettings }));
    render(<OptionsMenu />);
    fireEvent.click(screen.getByTitle('Options'));
    fireEvent.click(screen.getByLabelText('Card target'));
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ maxCards: null })
    );
  });
});
