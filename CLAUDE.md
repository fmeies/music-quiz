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

In dev, Vite's built-in proxy (configured in `vite.config.js`) forwards `/verify`, `/auth`, and `/socket.io` (including WebSocket) to `http://localhost:3011`. No env file needed.

## Production (Docker)

```bash
docker compose up -d           # start both services
docker compose up -d --build   # rebuild after code changes
docker compose logs -f         # follow logs
docker compose down            # stop
```

## Environment

Copy `server/.env.example` to `server/.env` and fill in:

| Variable | Description |
|---|---|
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |
| `REDIRECT_URI` | OAuth callback (must be HTTPS in prod) |
| `PORT` | Server port (default 3011) |
| `APP_CODE` | Access gate code for the UI |
| `REVEAL_TIMEOUT_SECONDS` | Challenge countdown after card placement (default 10) |

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
| `server/index.js` | All game logic, Spotify API, Socket.io event handlers |
| `client/src/context/GameContext.jsx` | Socket.io client, shared game state, action dispatchers |
| `client/src/components/GameScreen.jsx` | Main game UI, phase rendering, countdowns |
| `client/src/components/Timeline.jsx` | Drag-and-drop card placement |
| `client/src/components/NowPlaying.jsx` | Spotify Web Playback SDK integration |

## Constraints & Gotchas

- **Spotify Premium required** for Web Playback SDK (full track playback)
- **HTTPS required** in production (Spotify SDK constraint)
- `base: '/music-quiz'` in `client/vite.config.js` sets the asset base path — `import.meta.env.BASE_URL` is `/music-quiz/` in prod and `/` in dev
- Playlist loading uses server-side Spotify Client Credentials (no user login needed); only audio playback requires the user OAuth token
- Next turn is manual — the host must press "Next →" after each reveal; there is no auto-advance timer
- No test suite exists
