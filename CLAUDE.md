# CLAUDE.md

## Project Overview

Music quiz party game inspired by Hitster. Players listen to Spotify tracks and place cards chronologically on a timeline. Supports multiplayer via Socket.io with Spotify Premium playback.

## Architecture

**Two-service app:**
- `client/` — React 18 SPA built with Vite (port 3010 in dev, served via nginx in prod)
- `server/` — Node.js + Express + Socket.io game server (port 3011)

**State management:** All game state lives in server memory (the `rooms` object in `server/index.js`). No database — state resets on server restart. The client subscribes via Socket.io and renders from `GameContext.jsx`.

**Communication:** Socket.io for all game events; REST only for Spotify OAuth (`/auth/spotify`, `/auth/spotify/callback`) and access code verification (`/verify`).

## Development

```bash
npm run install:all   # install deps in both server/ and client/
npm run dev:server    # backend with nodemon on :3011
npm run dev:client    # frontend with Vite on :3010
```

In dev, Vite's built-in proxy (configured in `vite.config.js`) forwards `/verify`, `/auth`, and `/socket.io` (including WebSocket) to `http://localhost:3011`. Copy `client/.env.example` to `client/.env` (default values work for dev).

## Production (Docker)

```bash
docker compose up -d           # start both services
docker compose up -d --build   # rebuild after code changes
docker compose logs -f         # follow logs
docker compose down            # stop
```

## Environment

**`server/.env`** — copy from `server/.env.example`. All variables are required unless noted:

| Variable | Description |
|---|---|
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |
| `REDIRECT_URI` | OAuth callback (must be HTTPS in prod) |
| `PORT` | Server port (default 3011) |
| `APP_URL` | Full app URL used for Socket.io CORS (e.g. `https://your-domain.com`) |
| `APP_CODE` | Access gate code — validated client-side (CodeGate) **and** server-side (Socket.io middleware) |
| `REVEAL_TIMEOUT_SECONDS` | Challenge countdown after card placement (default 10) |
| `PLAYLIST_N_NAME` | Display name for preset playlist N (e.g. `PLAYLIST_1_NAME`) |
| `PLAYLIST_N_URL` | Spotify URL for preset playlist N (e.g. `PLAYLIST_1_URL`) |

**`client/.env`** — copy from `client/.env.example`. Used at build time by Vite:

| Variable | Description |
|---|---|
| `VITE_BASE_PATH` | URL path prefix the app is served under (default `/music-quiz/`) |

## Game Flow

Phases cycle through: `lobby` → `playing` → `placed` → `reveal` → back to `playing` (or `gameover`)

1. **CodeGate** — verifies `APP_CODE` before entering
2. **JoinScreen** — host creates room (5-char code), others join
3. **Lobby** — host connects Spotify, loads playlist, starts game
4. **GameScreen** — active player places song card on timeline; others can challenge within countdown; year revealed; scores updated

**Scoring:** Correct placement = +1 for active player. Wrong placement = +1 for each challenger, card removed.

## Key Files

| File | Purpose |
|---|---|
| `server/index.js` | Express app, Socket.io event handlers, Spotify OAuth, timer management |
| `server/gameLogic.js` | Pure game logic functions — imported by index.js and unit-tested directly |
| `client/src/context/GameContext.jsx` | Socket.io client, shared game state, action dispatchers |
| `client/src/components/GameScreen.jsx` | Main game UI, phase rendering, countdowns |
| `client/src/components/Timeline.jsx` | Drag-and-drop card placement |
| `client/src/components/NowPlaying.jsx` | Spotify Web Playback SDK integration |

## Testing & Tooling

```bash
npm test          # run all tests (server + client)
npm run lint      # ESLint for server and client
npm run format    # Prettier (write)
npm run format:check  # Prettier (check only, used in CI)
```

**Server** — Jest + Supertest. Tests live in `server/__tests__/`:
- `gameLogic.test.js` — unit tests for pure functions
- `scoring.test.js` — `applyReveal` and `advanceTurn` logic
- `api.test.js` — REST endpoint integration tests

**Client** — Vitest + Testing Library. Tests live in `client/src/__tests__/`.

**CI** — GitHub Actions runs server, client, and format-check jobs in parallel on every push and PR to `main`.

## Constraints & Gotchas

- **Spotify Premium required** for Web Playback SDK (full track playback)
- **HTTPS required** in production (Spotify SDK constraint)
- `VITE_BASE_PATH` in `client/.env` controls the asset base path; `import.meta.env.BASE_URL` is `/music-quiz/` in prod and `/` in dev. The value is baked in at build time — a rebuild is required to change it. **Changing `VITE_BASE_PATH` requires updating the reverse-proxy config in lockstep** (all `ProxyPass /music-quiz/…` rules in Apache, or equivalent in nginx/Caddy).
- `APP_CODE` is enforced both in the browser (CodeGate component) and on the server (Socket.io `io.use()` middleware). A socket connection without the correct code is rejected before any event handler runs.
- Playlist loading uses server-side Spotify Client Credentials (no user login needed); only audio playback requires the user OAuth token
- Next turn is manual — the host must press "Next →" after each reveal; there is no auto-advance timer
- Challenging immediately collapses the challenge window to 0 s — the first challenger triggers instant reveal (by design)
