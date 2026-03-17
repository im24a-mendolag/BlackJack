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
  const connectedRef = useRef(false);

  // Register all server→client event handlers BEFORE connecting
  useEffect(() => {
    on('lobby:created', ({ code, state, playerId: pid }) => {
      setPlayerId(pid);
      setGameState(state);
      setLobbyError(null);
      setView('waiting');
    });

    on('lobby:joined', ({ state, playerId: pid }) => {
      setPlayerId(pid);
      setGameState(state);
      setLobbyError(null);
      setView('waiting');
    });

    on('lobby:update', ({ state }) => setGameState(state));

    on('lobby:player-left', ({ state }) => {
      setGameState(state);
      // If game is now in progress and there's only 1 player, return to waiting
      if (state.status === 'waiting') setView('waiting');
    });

    on('game:started', ({ state }) => {
      setGameState(state);
      setView('game');
    });

    on('game:dealt', ({ state }) => setGameState(state));
    on('game:state', ({ state }) => setGameState(state));
    on('game:dealer-play', ({ state }) => setGameState(state));
    on('game:round-end', ({ state }) => setGameState(state));
    on('game:new-round', ({ state }) => setGameState(state));

    on('error', ({ message }) => setLobbyError(message));

    connect();
    connectedRef.current = true;

    return () => disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateLobby = useCallback(() => {
    setLobbyError(null);
    send({ type: 'lobby:create', name: playerName });
  }, [send, playerName]);

  const handleJoinLobby = useCallback((code) => {
    setLobbyError(null);
    send({ type: 'lobby:join', code: code.toUpperCase(), name: playerName });
  }, [send, playerName]);

  const handleStartGame = useCallback(() => {
    send({ type: 'lobby:start' });
  }, [send]);

  const handleLeaveToLobby = useCallback(() => {
    // Disconnect (closes the socket, server removes the player from lobby).
    // Handlers already registered in useEffect remain in handlersRef,
    // so a fresh connect() will work without re-registering.
    disconnect();
    setGameState(null);
    setPlayerId(null);
    setLobbyError(null);
    setView('lobby');
    // Give the socket a moment to close before re-connecting
    setTimeout(() => connect(), 120);
  }, [disconnect, connect]);

  if (!connected && view === 'lobby' && !error) {
    return (
      <div className="mp-connecting">
        <div className="mp-connecting-text">Connecting…</div>
      </div>
    );
  }

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
        connected={connected}
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
