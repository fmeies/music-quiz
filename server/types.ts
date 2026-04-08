export type Phase = 'lobby' | 'playing' | 'placed' | 'reveal' | 'gameover';

export interface Card {
  trackId: string;
  title: string;
  artist: string;
  year: number;
  albumArt: string | null;
}

export interface InternalPlayer {
  name: string;
  timeline: Card[];
  score: number;
  challenged: boolean;
}

export interface Playlist {
  id: string;
  tracks: Card[];
}

export interface LastResult {
  playerName: string;
  correct: boolean;
  challengers: string[];
}

export interface PresetPlaylist {
  name: string;
  url: string;
}

// Server-internal room state (never sent to clients directly)
export interface Room {
  hostId: string;
  players: Record<string, InternalPlayer>;
  phase: Phase;
  currentCard: Card | null;
  currentPlayerId: string | null;
  playerOrder: string[];
  currentTurnIndex: number;
  round: number;
  playlist: Playlist | null;
  usedTracks: Set<string>;
  spotifyToken: string | null;
  oauthState: string | null;
  placedAt: number | null;
  lastResult: LastResult | null;
  playlistLoading?: boolean;
}

// Card as seen by clients — year may be hidden during playing/placed phases
export interface PublicCard {
  trackId: string;
  title?: string;
  artist?: string;
  year?: number;
  albumArt?: string | null;
}

// Timeline card as seen by clients — current round's card has only trackId during playing/placed
export interface PublicTimelineCard {
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

// The game state broadcast to all clients
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
  revealTimeoutSeconds: number;
  playlists: PresetPlaylist[];
}

export interface MusicBrainzReleaseGroup {
  'first-release-date'?: string | null;
}

export interface MusicBrainzRelease {
  date?: string | null;
}

export interface MusicBrainzRecording {
  score: number;
  'release-groups'?: MusicBrainzReleaseGroup[];
  releases?: MusicBrainzRelease[];
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface RateLimitWindow {
  start: number;
  count: number;
}
