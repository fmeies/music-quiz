import React, { createContext, useContext, useState } from 'react';
import type { GameContextValue, PublicPlayer, RoomSettings } from '../types';
import { useGameSocket, STORAGE_KEYS } from '../hooks/useGameSocket';

const GameContext = createContext<GameContextValue | null>(null);

const BASE = import.meta.env.DEV ? '' : import.meta.env.BASE_URL.slice(0, -1);
const lsKey = (k: string) => `${import.meta.env.BASE_URL}${k}`;

export function GameProvider({ children }: { children: React.ReactNode }) {
  const {
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
  } = useGameSocket();

  const [connectingSpotify, setConnectingSpotify] = useState(false);

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
            lsKey(STORAGE_KEYS.SESSION),
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
            lsKey(STORAGE_KEYS.SESSION),
            JSON.stringify({ roomId: res.roomId, playerId: res.playerId })
          );
          resolve(res);
        }
      );
    });

  const connectSpotify = async () => {
    if (connectingSpotify) return;
    setConnectingSpotify(true);
    try {
      const win = window.open('', '_blank', 'width=500,height=700');
      const res = await fetch(`${BASE}/auth/spotify/url?roomId=${roomId}`);
      const { url } = (await res.json()) as { url: string };
      win!.location.href = url;
    } finally {
      setConnectingSpotify(false);
    }
  };

  const updateSettings = (settings: RoomSettings) =>
    socketRef.current!.emit('updateSettings', { roomId, settings });
  const continueGame = () =>
    socketRef.current!.emit('continueGame', { roomId });
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
        connectingSpotify,
        updateSettings,
        continueGame,
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
