import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext(null);

const BASE = import.meta.env.DEV ? '' : import.meta.env.BASE_URL.slice(0, -1);
const lsKey = (k) => `${import.meta.env.BASE_URL}${k}`;

export function GameProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [error, setError] = useState(null);
  const [spotifyToken, setSpotifyToken] = useState(null);
  const playerIdRef = useRef(null);

  useEffect(() => {
    const code = localStorage.getItem(lsKey('mqCode')) || '';
    const socket = io(window.location.origin, {
      path: `${BASE}/socket.io`,
      auth: { code },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const session = JSON.parse(
        localStorage.getItem(lsKey('mqSession')) || 'null'
      );
      if (!session) return;
      socket.emit('reconnectPlayer', session, (res) => {
        if (res.ok) {
          playerIdRef.current = session.playerId;
          setPlayerId(session.playerId);
          setRoomId(session.roomId);
        } else {
          // Server no longer has this session (e.g. restart) — reset to join screen
          localStorage.removeItem(lsKey('mqSession'));
          playerIdRef.current = null;
          setPlayerId(null);
          setRoomId(null);
          setGameState(null);
        }
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('gameState', setGameState);
    socket.on('error', (msg) => {
      setError(msg);
      setTimeout(() => setError(null), 15000);
    });
    socket.on('spotifyToken', setSpotifyToken);

    return () => socket.disconnect();
  }, []);

  const createRoom = (playerName) =>
    new Promise((resolve, reject) => {
      socketRef.current.emit('createRoom', { playerName }, (res) => {
        if (res.error) return reject(res.error);
        playerIdRef.current = res.playerId;
        setPlayerId(res.playerId);
        setRoomId(res.roomId);
        localStorage.setItem(
          lsKey('mqSession'),
          JSON.stringify({ roomId: res.roomId, playerId: res.playerId })
        );
        resolve(res);
      });
    });

  const joinRoom = (roomId, playerName) =>
    new Promise((resolve, reject) => {
      socketRef.current.emit(
        'joinRoom',
        { roomId: roomId.toUpperCase(), playerName },
        (res) => {
          if (res.error) return reject(res.error);
          playerIdRef.current = res.playerId;
          setPlayerId(res.playerId);
          setRoomId(res.roomId);
          localStorage.setItem(
            lsKey('mqSession'),
            JSON.stringify({ roomId: res.roomId, playerId: res.playerId })
          );
          resolve(res);
        }
      );
    });

  const connectSpotify = async () => {
    const win = window.open('', '_blank', 'width=500,height=700');
    const res = await fetch(`${BASE}/auth/spotify/url?roomId=${roomId}`);
    const { url } = await res.json();
    win.location.href = url;
  };

  const loadPlaylist = (playlistUrl) =>
    socketRef.current.emit('loadPlaylist', { roomId, playlistUrl });
  const startGame = () => socketRef.current.emit('startGame', { roomId });
  const placeCard = (position) =>
    socketRef.current.emit('placeCard', { roomId, position });
  const challenge = () => socketRef.current.emit('challenge', { roomId });
  const nextTurn = () => socketRef.current.emit('nextTurn', { roomId });

  const isHost = gameState?.hostId === playerId;
  const me = gameState?.players?.[playerId];
  const isActivePlayer = gameState?.currentPlayerId === playerId;

  return (
    <GameContext.Provider
      value={{
        connected,
        gameState,
        playerId,
        roomId,
        error,
        clearError: () => setError(null),
        isHost,
        me,
        isActivePlayer,
        spotifyToken,
        createRoom,
        joinRoom,
        connectSpotify,
        loadPlaylist,
        startGame,
        placeCard,
        challenge,
        nextTurn,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export const useGame = () => useContext(GameContext);
