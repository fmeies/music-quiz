import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState, GameContextValue, PublicPlayer } from '../types';

const GameContext = createContext<GameContextValue | null>(null);

const BASE = import.meta.env.DEV ? '' : import.meta.env.BASE_URL.slice(0, -1);
const lsKey = (k: string) => `${import.meta.env.BASE_URL}${k}`;

export function GameProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);
  const playerIdRef = useRef<string | null>(null);

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
      ) as { roomId: string; playerId: string } | null;
      if (!session) return;
      socket.emit(
        'reconnectPlayer',
        session,
        (res: { ok: true } | { error: string }) => {
          if ('ok' in res) {
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
        }
      );
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('gameState', setGameState);
    socket.on('error', (msg: string) => {
      setError(msg);
      setTimeout(() => setError(null), 15000);
    });
    socket.on('spotifyToken', setSpotifyToken);

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = (playerName: string) =>
    new Promise<{ roomId: string; playerId: string }>((resolve, reject) => {
      socketRef.current!.emit(
        'createRoom',
        { playerName },
        (res: { roomId: string; playerId: string } | { error: string }) => {
          if ('error' in res) return reject(res.error);
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

  const joinRoom = (roomId: string, playerName: string) =>
    new Promise<{ roomId: string; playerId: string }>((resolve, reject) => {
      socketRef.current!.emit(
        'joinRoom',
        { roomId: roomId.toUpperCase(), playerName },
        (res: { roomId: string; playerId: string } | { error: string }) => {
          if ('error' in res) return reject(res.error);
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
    const { url } = (await res.json()) as { url: string };
    win!.location.href = url;
  };

  const loadPlaylist = (playlistUrl: string) =>
    socketRef.current!.emit('loadPlaylist', { roomId, playlistUrl });
  const startGame = () => socketRef.current!.emit('startGame', { roomId });
  const placeCard = (position: number) =>
    socketRef.current!.emit('placeCard', { roomId, position });
  const challenge = () => socketRef.current!.emit('challenge', { roomId });
  const nextTurn = () => socketRef.current!.emit('nextTurn', { roomId });

  const isHost = gameState?.hostId === playerId;
  const me: PublicPlayer | undefined = playerId
    ? gameState?.players?.[playerId]
    : undefined;
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
        isHost: isHost ?? false,
        me,
        isActivePlayer: isActivePlayer ?? false,
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

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
