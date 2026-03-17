'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useMultiplayerSocket } from './useMultiplayerSocket';
import MultiplayerLobby from './MultiplayerLobby';
import MultiplayerWaiting from './MultiplayerWaiting';
import MultiplayerTable from './MultiplayerTable';
import './Multiplayer.css';

function generateGuestName() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `Guest_${suffix}`;
}

function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Top-level multiplayer component.
 *
 * view:
 *   'lobby'   → create / join lobby screen
 *   'waiting' → waiting room (players joining, host starts)
 *   'game'    → the actual game table
 */
export default function MultiplayerClient({ onLeave, volumeOn }) {
  const { data: session, status: authStatus } = useSession();
  const playerName = useMemo(() => {
    if (authStatus === 'authenticated' && session?.user?.username) return session.user.username;
    return generateGuestName();
  }, [authStatus, session?.user?.username]); // eslint-disable-line react-hooks/exhaustive-deps
  const { connect, disconnect, send, on, connected, error } = useMultiplayerSocket();
  const [view, setView] = useState('lobby');     // 'lobby' | 'waiting' | 'game'
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [lobbyError, setLobbyError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const playerIdRef = useRef(null);

  // Register all server→client event handlers once on mount
  useEffect(() => {
    on('lobby:created', ({ code, state, playerId: pid }) => {
      setPlayerId(pid);
      playerIdRef.current = pid;
      setGameState(state);
      setLobbyError(null);
      setIsConnecting(false);
      setView('waiting');
    });

    on('lobby:joined', ({ state, playerId: pid }) => {
      setPlayerId(pid);
      playerIdRef.current = pid;
      setGameState(state);
      setLobbyError(null);
      setIsConnecting(false);
      setView('waiting');
    });

    on('lobby:update', ({ state }) => setGameState(state));

    on('lobby:player-left', ({ state }) => {
      setGameState(state);
      if (state.status === 'waiting') setView('waiting');
    });

    on('game:started', ({ state }) => {
      setGameState(state);
      setView('game');
    });

    on('game:dealt', ({ state }) => setGameState(state));
    on('game:state', ({ state }) => setGameState(state));
    on('game:dealer-play', ({ state }) => setGameState(state));
    on('game:round-end', ({ state }) => {
      setGameState(state);
      const me = state.players.find(p => p.id === playerIdRef.current);
      if (me?.forcedReset) {
        fetch('/api/user/track-reset', { method: 'POST' });
      }
    });
    on('game:new-round', ({ state }) => setGameState(state));

    on('error', ({ message }) => {
      setLobbyError(message);
      setIsConnecting(false);
    });

    return () => disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateLobby = useCallback(() => {
    setLobbyError(null);
    setIsConnecting(true);
    const code = generateLobbyCode();
    connect(code);
    // PartySocket buffers the message until connection opens
    send({ type: 'lobby:create', name: playerName });
  }, [connect, send, playerName]);

  const handleJoinLobby = useCallback((code) => {
    setLobbyError(null);
    setIsConnecting(true);
    connect(code.toUpperCase());
    send({ type: 'lobby:join', name: playerName });
  }, [connect, send, playerName]);

  const handleStartGame = useCallback(() => {
    send({ type: 'lobby:start' });
  }, [send]);

  const handleLeaveToLobby = useCallback(() => {
    disconnect();
    setGameState(null);
    setPlayerId(null);
    setLobbyError(null);
    setIsConnecting(false);
    setView('lobby');
    // No reconnect needed — will connect to a new room when user creates/joins next
  }, [disconnect]);

  if (error && view === 'lobby') {
    return (
      <div className="mp-connecting">
        <div className="mp-error-box">{error}</div>
        <button className="mp-back-btn" onClick={onLeave}>← Back</button>
      </div>
    );
  }

  if (view === 'lobby') {
    return (
      <MultiplayerLobby
        playerName={playerName}
        onCreate={handleCreateLobby}
        onJoin={handleJoinLobby}
        onBack={onLeave}
        error={lobbyError}
        connected={!isConnecting}
      />
    );
  }

  if (view === 'waiting') {
    return (
      <MultiplayerWaiting
        gameState={gameState}
        playerId={playerId}
        onStart={handleStartGame}
        onLeave={handleLeaveToLobby}
      />
    );
  }

  return (
    <MultiplayerTable
      gameState={gameState}
      playerId={playerId}
      send={send}
      onLeave={handleLeaveToLobby}
      volumeOn={volumeOn}
    />
  );
}
