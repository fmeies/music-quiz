import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext(null);

const BASE = import.meta.env.DEV ? '' : import.meta.env.BASE_URL.slice(0, -1);

export function GameProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [error, setError] = useState(null);
  const [spotifyToken, setSpotifyToken] = useState(null);

  useEffect(() => {
    const socket = io(window.location.origin, { path: `${BASE}/socket.io` });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('gameState', setGameState);
    socket.on('error', (msg) => {
      setError(msg);
      setTimeout(() => setError(null), 5000);
    });
    socket.on('spotifyToken', setSpotifyToken);

    return () => socket.disconnect();
  }, []);

  const createRoom = (playerName) => new Promise((resolve, reject) => {
    socketRef.current.emit('createRoom', { playerName }, (res) => {
      if (res.error) return reject(res.error);
      setPlayerId(res.playerId);
      setRoomId(res.roomId);
      resolve(res);
    });
  });

  const joinRoom = (roomId, playerName) => new Promise((resolve, reject) => {
    socketRef.current.emit('joinRoom', { roomId: roomId.toUpperCase(), playerName }, (res) => {
      if (res.error) return reject(res.error);
      setPlayerId(res.playerId);
      setRoomId(res.roomId);
      resolve(res);
    });
  });

  const connectSpotify = async () => {
    const res = await fetch(`${BASE}/auth/spotify/url?roomId=${roomId}`);
    const { url } = await res.json();
    window.open(url, '_blank', 'width=500,height=700');
  };

  const loadPlaylist = (playlistUrl) => socketRef.current.emit('loadPlaylist', { roomId, playlistUrl });
  const startGame = () => socketRef.current.emit('startGame', { roomId });
  const placeCard = (position) => socketRef.current.emit('placeCard', { roomId, position });
  const challenge = () => socketRef.current.emit('challenge', { roomId });
  const nextTurn = () => socketRef.current.emit('nextTurn', { roomId });

  const isHost = gameState?.hostId === playerId;
  const me = gameState?.players?.[playerId];
  const isActivePlayer = gameState?.currentPlayerId === playerId;

  return (
    <GameContext.Provider value={{
      connected, gameState, playerId, roomId,
      error,
      isHost, me, isActivePlayer,
      spotifyToken,
      createRoom, joinRoom, connectSpotify, loadPlaylist, startGame, placeCard, challenge, nextTurn,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export const useGame = () => useContext(GameContext);
