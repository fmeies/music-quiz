# CLAUDE.md

## Project Overview

Music quiz party game inspired by Hitster. Players listen to Spotify tracks and place cards chronologically on a timeline. Supports multiplayer via Socket.io with Spotify Premium playback.

## Architecture

**Two-service app:**
- `client/` — React 18 SPA built with Vite + TypeScript (Vite dev server on port 3010 in dev)
- `server/` — Node.js + Express + Socket.io game server, written in TypeScript, compiled to CommonJS (port 3011)

In production both ship as **one Docker image**: the root `Dockerfile` builds the client and Express serves it (`server/staticClient.ts`, registered after the API routes) from the same origin as REST and Socket.io.

**Language:** The entire codebase is TypeScript. Server compiles via `tsc` to `dist/`; client is transpiled at build time by Vite. Shared type contracts live in `server/types.ts` and `client/src/types.ts`.

**State management:** All game state lives in server memory (the `rooms` object in `server/index.ts`). No database — state resets on server restart. The client subscribes via Socket.io and renders from `GameContext.tsx`.

**Communication:** Socket.io for all game events; REST only for Spotify OAuth (`/auth/spotify`, `/auth/spotify/callback`) and access code verification (`/verify`).

## Development

```bash
npm run install:all   # install deps in both server/ and client/
npm run dev:server    # backend with nodemon on :3011
npm run dev:client    # frontend with Vite on :3010
```

In dev, Vite's built-in proxy (configured in `vite.config.ts`) forwards `/verify`, `/rooms`, `/auth`, and `/socket.io` (including WebSocket) to `http://localhost:3011`.

## Production (Docker)

```bash
docker compose pull && docker compose up -d   # deploy the latest image
docker compose logs -f                        # follow logs
docker compose down                           # stop
```

`.github/workflows/docker.yml` publishes `ghcr.io/fmeies/music-quiz` (linux/amd64; `latest`, `sha-*`, semver on `v*` tags) on pushes to `main`, only after `ci.yml` passes (reused via `workflow_call`). Compose is pull-only (no `build:`), so a failed pull fails loudly instead of triggering a slow local build on the server.

## Environment

**`server/.env`** — copy from `server/.env.example`. All variables are required unless noted:

| Variable | Description |
|---|---|
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |
| `REDIRECT_URI` | OAuth callback (must be HTTPS in prod) |
| `PORT` | Server port (default 3011) |
| `APP_CODE` | Access gate code — validated client-side (CodeGate) **and** server-side (Socket.io middleware) |
| `PLAYLIST_N_NAME` | Display name for preset playlist N (e.g. `PLAYLIST_1_NAME`) |
| `PLAYLIST_N_URL` | Spotify URL for preset playlist N (e.g. `PLAYLIST_1_URL`). **Must be a playlist the connecting host owns or collaborates on** — see the playlist-loading gotcha below. |

The server loads `server/.env` via Node's built-in `--env-file-if-exists` (no `dotenv`); in Docker, Compose's `env_file` provides the variables. The client needs no configuration.

## Game Flow

Phases cycle through: `lobby` → `playing` → `placed` → `reveal` → back to `playing` (or `gameover`)

1. **CodeGate** — verifies `APP_CODE` before entering
2. **JoinScreen** — host creates room (5-char code), others join
3. **Lobby** — host connects Spotify, loads playlist, configures options, starts game
4. **GameScreen** — active player places song card on timeline; any other player can challenge (first challenger wins); year revealed; scores updated

**Scoring:** Correct placement = +1 for active player (challenger loses a random card). Wrong placement = +1 for the challenger, who receives the card; active player's card is removed.

**Challenging:** Only the first player to click Challenge is accepted. This triggers an immediate reveal — the countdown collapses instantly.

**Gameover** — triggered by one of three reasons (`gameoverReason`):
- `'cards'` — a player reached the card target; host can choose to continue playing (removes the limit)
- `'no_tracks'` — all songs in the playlist have been played
- `'no_players'` — all players disconnected

## Game Options (configurable in-game via ⚙️ menu, host only)

Settings persist as defaults for subsequently created rooms (`globalDefaultSettings` on the server).

| Option | Default | Range |
|---|---|---|
| Challenge window (`revealTimeoutSeconds`) | 10 s | 1–60 s |
| Auto-advance after reveal (`autoAdvanceSeconds`) | 5 s | 1–120 s or null |
| Auto-advance after challenge (`autoAdvanceChallengeSeconds`) | 10 s | 1–120 s or null |
| Card target (`maxCards`) | 10 | 2–999 or null (unlimited) |

## Key Files

| File | Purpose |
|---|---|
| `server/index.ts` | Express app, Socket.io event handlers, Spotify OAuth, timer management |
| `server/gameLogic.ts` | Pure game logic — `createRoom`, `applyReveal`, `advanceTurn`, `checkGameover`, `pickRandomTrack`, `makeRateLimiter` |
| `server/staticClient.ts` | Serves the built client in production; fails at startup if the build is missing |
| `server/spotifyService.ts` | Spotify & MusicBrainz API calls; `yearCache` (capped at 500 entries) |
| `server/types.ts` | Shared server-side TypeScript types (`Room`, `InternalPlayer`, `GameState`, `RoomSettings`, `GameoverReason`, …) |
| `client/src/context/GameContext.tsx` | Socket.io client, shared game state, action dispatchers |
| `client/src/hooks/useGameSocket.ts` | Socket lifecycle, reconnection logic, `STORAGE_KEYS` |
| `client/src/hooks/useSpotifyPlayer.ts` | Spotify Web Playback SDK initialisation and controls |
| `client/src/types.ts` | Client-side TypeScript types mirroring server's public types |
| `client/src/components/GameScreen.tsx` | Main game UI, phase rendering, countdowns |
| `client/src/components/Timeline.tsx` | Card placement with drop zones |
| `client/src/components/NowPlaying.tsx` | Current song display + Spotify playback controls |
| `client/src/components/OptionsMenu.tsx` | In-game settings modal (challenge window, auto-advance, auto-advance after challenge, card target) |
| `client/src/components/ErrorBoundary.tsx` | React error boundary fallback |

## Testing & Tooling

```bash
npm test          # run all tests (server + client)
npm run lint      # ESLint for server and client
npm run format    # Prettier (write)
npm run format:check  # Prettier (check only, used in CI)
```

**Before every commit:** always run `npm run format` first. CI runs `format:check` and will fail if formatting is off.

**Server** — Vitest + Supertest. Tests live in `server/__tests__/`:
- `gameLogic.test.ts` — unit tests for pure functions
- `scoring.test.ts` — `applyReveal`, `advanceTurn`, `checkGameover`
- `api.test.ts` — REST endpoint integration tests
- `socket.test.ts` — Socket.io integration tests (auth, createRoom, joinRoom, updateSettings)
- `staticClient.test.ts` — serving the client build, route precedence, missing-build failure

**Client** — Vitest + Testing Library. Tests live in `client/src/__tests__/`:
- `GameContext.test.tsx`, `GameScreen.test.tsx`, `Timeline.test.tsx`, `CodeGate.test.tsx`, `OptionsMenu.test.tsx`

**CI** — GitHub Actions runs server, client, and format-check jobs in parallel on every push and PR to `main`.

## Constraints & Gotchas

- **Spotify Premium required** for Web Playback SDK (full track playback)
- **HTTPS required** in production (Spotify SDK constraint)
- **The app is path-prefix agnostic.** Vite builds with `base: './'` and the client uses relative URLs (`fetch('verify')`, Socket.io path derived from `window.location`), so the reverse proxy alone decides the prefix (`/music-quiz/` in prod) and strips it before forwarding. Keep all client URLs relative — an absolute `/…` URL would bypass the prefix. Consequence: the app must be opened with a trailing slash (`/music-quiz/`).
- `APP_CODE` is enforced both in the browser (CodeGate component) and on the server (Socket.io `io.use()` middleware). A socket connection without the correct code is rejected before any event handler runs.
- **Playlist loading requires the host's connected Spotify (user OAuth token).** Spotify's Feb/Mar 2026 API migration removed `GET /playlists/{id}/tracks` (now 403) in favour of `GET /playlists/{id}/items`, which only returns contents to a user token and **only for playlists that user owns or collaborates on**. App-only Client-Credentials tokens get 401, so loading fails until the host clicks "Connect Spotify". Preset playlists (`PLAYLIST_N_URL`) therefore only work if the host owns/collaborates on them — to use a third-party playlist (e.g. an official HITSTER list), duplicate it into the host's own account and point the URL at the copy. See the [Feb 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).
- Only the **first** player to challenge is accepted per turn; subsequent challenge attempts in the same turn are silently rejected.
- Challenging immediately triggers reveal (challenge window collapses to 0 s).
- The host must press "Next →" to advance turns, unless auto-advance is enabled in the options.
- `socket.test.ts` uses `socket.io-client` as a server dev-dependency. The server is started in `beforeAll` and closed in `afterAll`; disconnect grace-period timers (10 s) and inactivity timers (60 min) are handled by process teardown.
