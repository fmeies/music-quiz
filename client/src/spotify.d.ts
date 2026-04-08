// Minimal Spotify Web Playback SDK type declarations (global)
declare namespace Spotify {
  interface PlayerInit {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  interface WebPlaybackState {
    paused: boolean;
  }

  interface WebPlaybackInstance {
    device_id: string;
  }

  interface WebPlaybackError {
    message: string;
  }

  class Player {
    constructor(options: PlayerInit);
    connect(): Promise<boolean>;
    disconnect(): void;
    pause(): Promise<void>;
    addListener(
      event: 'ready' | 'not_ready',
      cb: (instance: WebPlaybackInstance) => void
    ): void;
    addListener(
      event: 'player_state_changed',
      cb: (state: WebPlaybackState | null) => void
    ): void;
    addListener(
      event: 'initialization_error' | 'authentication_error' | 'account_error',
      cb: (error: WebPlaybackError) => void
    ): void;
  }
}

interface Window {
  Spotify: typeof Spotify;
  onSpotifyWebPlaybackSDKReady: (() => void) | undefined;
}
