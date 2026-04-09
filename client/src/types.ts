export type Phase = 'lobby' | 'playing' | 'placed' | 'reveal' | 'gameover';

export interface RoomSettings {
  revealTimeoutSeconds: number;
  autoAdvanceSeconds: number | null;
  maxCards: number | null;
}

export type GameoverReason = 'cards' | 'no_tracks' | 'no_players' | null;

export interface Card {
  trackId: string;
  title: string;
  artist: string;
  year: number;
  albumArt: string | null;
}

export interface PublicTimelineCard {
  trackId: string;
  title?: string;
  artist?: string;
  year?: number;
  albumArt?: string | null;
}

export interface PublicCard {
  trackId: string;
  title?: string;
  artist?: string;
  year?: number;
  albumArt?: string | null;
}

export interface PublicPlayer {
  name: string;
  score: number;
  challenged: boolean;
  timeline: PublicTimelineCard[];
  timelineCount: number;
}

export interface Playlist {
  id: string;
  tracks: Card[];
}

export interface LastResult {
  playerName: string;
  correct: boolean;
  challenger: string | null;
}

export interface PresetPlaylist {
  name: string;
  url: string;
}

export interface GameState {
  phase: Phase;
  round: number;
  hostId: string;
  currentPlayerId: string | null;
  players: Record<string, PublicPlayer>;
  currentCard: PublicCard | null;
  playlist: Playlist | null;
  lastResult: LastResult | null;
  placedAt: number | null;
  revealedAt: number | null;
  settings: RoomSettings;
  gameoverReason: GameoverReason;
  playlists: PresetPlaylist[];
}

export interface GameContextValue {
  connected: boolean;
  gameState: GameState | null;
  playerId: string | null;
  roomId: string | null;
  error: string | null;
  clearError: () => void;
  isHost: boolean;
  me: PublicPlayer | undefined;
  isActivePlayer: boolean;
  spotifyToken: string | null;
  connectingSpotify: boolean;
  updateSettings: (settings: RoomSettings) => void;
  continueGame: () => void;
  createRoom: (
    playerName: string
  ) => Promise<{ roomId: string; playerId: string }>;
  joinRoom: (
    roomId: string,
    playerName: string
  ) => Promise<{ roomId: string; playerId: string }>;
  connectSpotify: () => Promise<void>;
  loadPlaylist: (playlistUrl: string) => void;
  startGame: () => void;
  placeCard: (position: number) => void;
  challenge: () => void;
  nextTurn: () => void;
}
