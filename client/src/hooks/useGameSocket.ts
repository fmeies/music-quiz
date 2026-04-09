import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState } from '../types';

const BASE = import.meta.env.DEV ? '' : import.meta.env.BASE_URL.slice(0, -1);
const lsKey = (k: string) => `${import.meta.env.BASE_URL}${k}`;

export const STORAGE_KEYS = { CODE: 'mqCode', SESSION: 'mqSession' } as const;

export interface GameSocketState {
  socketRef: MutableRefObject<Socket | null>;
  playerIdRef: MutableRefObject<string | null>;
  connected: boolean;
  gameState: GameState | null;
  playerId: string | null;
  setPlayerId: Dispatch<SetStateAction<string | null>>;
  roomId: string | null;
  setRoomId: Dispatch<SetStateAction<string | null>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  spotifyToken: string | null;
  setSpotifyToken: Dispatch<SetStateAction<string | null>>;
}

export function useGameSocket(): GameSocketState {
  const socketRef = useRef<Socket | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);

  useEffect(() => {
    const code = localStorage.getItem(lsKey(STORAGE_KEYS.CODE)) || '';
    const socket = io(window.location.origin, {
      path: `${BASE}/socket.io`,
      auth: { code },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const session = JSON.parse(
        localStorage.getItem(lsKey(STORAGE_KEYS.SESSION)) || 'null'
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
            localStorage.removeItem(lsKey(STORAGE_KEYS.SESSION));
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
      setTimeout(() => setError((prev) => (prev === msg ? null : prev)), 15000);
    });
    socket.on('spotifyToken', setSpotifyToken);

    return () => {
      socket.disconnect();
    };
  }, []);

  return {
    socketRef,
    playerIdRef,
    connected,
    gameState,
    playerId,
    setPlayerId,
    roomId,
    setRoomId,
    error,
    setError,
    spotifyToken,
    setSpotifyToken,
  };
}
