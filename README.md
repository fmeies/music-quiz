# Music Quiz

A browser-based multiplayer music quiz inspired by the Hitster board game. Players take turns placing songs in the correct chronological order on their timeline.

## How it works

1. The host creates a room and loads a Spotify playlist
2. Other players join via a 5-character room code
3. Players take turns being the active player
4. The host plays the song (full track via Spotify Premium)
5. The active player places the card in their timeline
6. Any other player can challenge if they think the placement is wrong — the first to challenge triggers an immediate reveal
7. The year is revealed — correct placement earns a point; wrong placement removes the card (the challenger gets it instead)
8. The game ends after a configurable number of rounds (default 10); the host can continue playing if desired

## Requirements

- **Spotify Premium** account for the host (required for full track playback via Web Playback SDK)
- Docker + Docker Compose on the server
- A domain with HTTPS (required by the Spotify Web Playback SDK)

## Setup

### 1. Create a Spotify Developer App

1. Go to https://developer.spotify.com/dashboard
2. Create a new app
3. Note the **Client ID** and **Client Secret**
4. Add this Redirect URI: `https://your-domain.com/music-quiz/auth/spotify/callback`

### 2. Configure environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit `server/.env`:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
APP_URL=https://your-domain.com
REDIRECT_URI=https://your-domain.com/music-quiz/auth/spotify/callback
PORT=3011
APP_CODE=your_secret_access_code

PLAYLIST_1_NAME=My Playlist
PLAYLIST_1_URL=https://open.spotify.com/playlist/xxx
```

Edit `client/.env` (only needed if you deploy under a different URL path):

```
VITE_BASE_PATH=/music-quiz/
```

> **Note:** If you change `VITE_BASE_PATH`, update all reverse-proxy rules to match (the `ProxyPass /music-quiz/…` lines in the Apache example below).

### 3. Deploy

```bash
docker compose up -d
```

### 4. Configure your reverse proxy (Apache example)

```apache
ProxyPass /music-quiz/socket.io/ http://localhost:3011/socket.io/
ProxyPassReverse /music-quiz/socket.io/ http://localhost:3011/socket.io/
RewriteEngine On
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/music-quiz/socket.io/(.*) ws://localhost:3011/socket.io/$1 [P,L]

ProxyPass /music-quiz/auth/ http://localhost:3011/auth/
ProxyPassReverse /music-quiz/auth/ http://localhost:3011/auth/
ProxyPass /music-quiz/verify http://localhost:3011/verify
ProxyPassReverse /music-quiz/verify http://localhost:3011/verify

ProxyPass /music-quiz/ http://localhost:3010/
ProxyPassReverse /music-quiz/ http://localhost:3010/
```

The app will be available at `https://your-domain.com/music-quiz`.

## Useful commands

```bash
docker compose logs -f          # Follow logs
docker compose restart          # Restart containers
docker compose down             # Stop
docker compose up -d --build    # Rebuild after code changes
```

## Project structure

```
music-quiz/
├── server/
│   ├── index.ts              # Express + Socket.io + Spotify OAuth, timer management
│   ├── gameLogic.ts          # Pure game logic (tested independently)
│   ├── spotifyService.ts     # Spotify & MusicBrainz API calls, year cache
│   ├── types.ts              # Shared server-side TypeScript types
│   ├── __tests__/            # Vitest tests
│   ├── .env.example
│   └── package.json
├── client/
│   ├── index.html
│   ├── .env.example
│   └── src/
│       ├── App.tsx
│       ├── App.css
│       ├── __tests__/        # Vitest tests
│       ├── context/
│       │   └── GameContext.tsx       # Socket.io state + actions
│       ├── hooks/
│       │   ├── useGameSocket.ts      # Socket lifecycle + reconnection
│       │   └── useSpotifyPlayer.ts   # Spotify Web Playback SDK
│       └── components/
│           ├── CodeGate.tsx          # Access code screen
│           ├── JoinScreen.tsx        # Create / join room
│           ├── Lobby.tsx             # Waiting room + playlist loader
│           ├── GameScreen.tsx        # Main game view
│           ├── NowPlaying.tsx        # Current song + Spotify player
│           ├── Timeline.tsx          # Player's card timeline
│           ├── OptionsMenu.tsx       # In-game settings modal
│           └── ErrorBoundary.tsx     # React error boundary
├── docker-compose.yml
└── package.json
```

## Development

```bash
npm run install:all   # install deps for server and client
npm run dev:server    # start backend on :3011 (with nodemon)
npm run dev:client    # start frontend on :3010 (with Vite)
```

```bash
npm test              # run all tests
npm run lint          # ESLint (server + client)
npm run format        # Prettier
```
