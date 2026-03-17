'use client'
import { useCallback, useEffect, useRef, useState } from 'react';
import PartySocket from 'partysocket';

/**
 * Manages a PartyKit WebSocket connection to the multiplayer game server.
 *
 * Usage:
 *   const { connect, disconnect, send, on, connected, error } = useMultiplayerSocket();
 *
 * Call `on(type, handler)` to register message listeners.
 * Call `connect(roomCode)` to open a connection to a specific lobby room.
 * PartySocket buffers messages sent before the connection opens — no need to wait.
 */
export function useMultiplayerSocket() {
  const wsRef = useRef(null);
  const handlersRef = useRef({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const on = useCallback((type, handler) => {
    handlersRef.current[type] = handler;
  }, []);

  const send = useCallback((msg) => {
    // PartySocket buffers messages if not yet connected — safe to call immediately
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const connect = useCallback((room) => {
    if (wsRef.current) wsRef.current.close();

    const ws = new PartySocket({
      host: process.env.NEXT_PUBLIC_PARTYKIT_HOST,
      room,
    });
    wsRef.current = ws;

    ws.addEventListener('open', () => { setConnected(true); setError(null); });
    ws.addEventListener('close', () => { setConnected(false); });
    ws.addEventListener('error', () => {
      setError('Connection failed. Is the server running?');
      setConnected(false);
    });
    ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      const handler = handlersRef.current[msg.type];
      if (handler) handler(msg);
    });

    return ws;
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  // Clean up on unmount
  useEffect(() => () => wsRef.current?.close(), []);

  return { connect, disconnect, send, on, connected, error };
}
