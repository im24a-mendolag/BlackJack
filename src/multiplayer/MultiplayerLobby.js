'use client'
import { useState } from 'react';

export default function MultiplayerLobby({ playerName, onCreate, onJoin, onBack, error, connected }) {
  const [joinCode, setJoinCode] = useState('');
  const [tab, setTab] = useState('create'); // 'create' | 'join'

  const trimmedCode = joinCode.trim().toUpperCase();

  const handleCreate = () => onCreate();

  const handleJoin = () => {
    if (trimmedCode.length !== 4) return;
    onJoin(trimmedCode);
  };

  return (
    <div className="mp-screen">
      <div className="mp-lobby-card">
        <div className="mp-lobby-header">
          <h1 className="mp-title">Multiplayer</h1>
          <p className="mp-subtitle">Play with up to 5 players</p>
        </div>

        {/* Player name display (read-only) */}
        <div className="mp-field">
          <label className="mp-field-label">Playing as</label>
          <div className="mp-name-display">{playerName}</div>
        </div>

        {/* Tabs */}
        <div className="mp-tabs">
          <button
            className={`mp-tab${tab === 'create' ? ' mp-tab-active' : ''}`}
            onClick={() => setTab('create')}
          >
            Create Lobby
          </button>
          <button
            className={`mp-tab${tab === 'join' ? ' mp-tab-active' : ''}`}
            onClick={() => setTab('join')}
          >
            Join Lobby
          </button>
        </div>

        {tab === 'create' && (
          <div className="mp-tab-body">
            <p className="mp-hint">
              A 4-character code will be generated. Share it with up to 4 friends.
            </p>
            <button
              className="mp-primary-btn"
              disabled={!connected}
              onClick={handleCreate}
            >
              Create Lobby
            </button>
          </div>
        )}

        {tab === 'join' && (
          <div className="mp-tab-body">
            <div className="mp-field">
              <label className="mp-field-label">Lobby code</label>
              <input
                className="mp-input mp-input-code"
                type="text"
                placeholder="X7K2"
                maxLength={4}
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
              />
            </div>
            <button
              className="mp-primary-btn"
              disabled={trimmedCode.length !== 4 || !connected}
              onClick={handleJoin}
            >
              Join Lobby
            </button>
          </div>
        )}

        {error && <div className="mp-error-msg">{error}</div>}

        <button className="mp-back-btn" onClick={onBack}>
          ← Back to Singleplayer
        </button>
      </div>
    </div>
  );
}
