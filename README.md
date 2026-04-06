# Music Quiz

A browser-based multiplayer music quiz inspired by the Hitster board game. Players take turns placing songs in the correct chronological order on their timeline.

## How it works

1. The host creates a room and loads a Spotify playlist
2. Other players join via a 5-character room code
3. Players take turns being the active player
4. The host plays the song (full track via Spotify Premium)
5. The active player places the card in their timeline
6. Other players can challenge if they think the placement is wrong
7. The year is revealed — correct placement earns a point; wrong placement removes the card (challengers get it instead)
8. Most points at the end wins!

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
```

Edit `server/.env`:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
REDIRECT_URI=https://your-domain.com/music-quiz/auth/spotify/callback
PORT=3011
APP_CODE=your_secret_access_code
```

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
│   ├── index.js          # Express + Socket.io + Spotify API
│   ├── .env.example
│   └── package.json
├── client/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.jsx
│       ├── App.css
│       ├── context/
│       │   └── GameContext.jsx   # Socket.io state + actions
│       └── components/
│           ├── CodeGate.jsx      # Access code screen
│           ├── JoinScreen.jsx    # Create / join room
│           ├── Lobby.jsx         # Waiting room + playlist loader
│           ├── GameScreen.jsx    # Main game view
│           ├── NowPlaying.jsx    # Current song + Spotify player
│           └── Timeline.jsx      # Player's card timeline
├── docker-compose.yml
└── package.json
```
