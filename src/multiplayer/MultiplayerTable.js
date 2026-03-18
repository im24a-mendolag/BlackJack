'use client'
import { useState, useEffect, useCallback, useRef } from 'react';
import Card from '../components/Card';
import getHandTotal from '../logic/getHandTotal';
import { playSound } from '../lib/sound';

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUICK_BETS = [10, 25, 100, 500];

function HandTotal({ hand }) {
  const total = hand.length > 0 ? getHandTotal(hand) : null;
  if (total === null) return null;
  return (
    <span className={`hand-total${total > 21 ? ' hand-total-bust' : ''}`}>{total}</span>
  );
}

// ── Dealer area ───────────────────────────────────────────────────────────────

function MultiDealerHand({ hand, holeHidden }) {
  const showTotal = hand.length > 0 && !holeHidden;
  const displayHand = hand.length === 0
    ? [{ value: '', suit: '' }, { value: '', suit: '' }]
    : hand;
  const dealerTotal = showTotal ? getHandTotal(hand) : null;

  const prevHiddenRef = useRef(holeHidden);
  useEffect(() => {
    if (prevHiddenRef.current && !holeHidden && hand.length > 0) playSound('draw');
    prevHiddenRef.current = holeHidden;
  }, [holeHidden, hand.length]);

  return (
    <div className="hand-section mp-dealer-hand">
      <div className="hand-label">
        <span>Dealer</span>
        {dealerTotal !== null && (
          <span className={`hand-total${dealerTotal > 21 ? ' hand-total-bust' : ''}`}>{dealerTotal}</span>
        )}
        {!showTotal && hand.length > 0 && <span className="hand-total">?</span>}
      </div>
      <div className="cards-row">
        {displayHand.map((c, i) => (
          <div key={`${c.value}-${c.suit}-${i}`} style={{ visibility: hand.length === 0 ? 'hidden' : 'visible' }}>
            <Card card={c} isFaceDown={holeHidden && i === 0} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compact fixed-size window for other players ───────────────────────────────

function resultLabel(result) {
  return result === 'Player Wins' ? 'Win'
    : result === 'House Wins' ? 'Loss'
    : result === 'Blackjack!' ? 'BJ!'
    : result === 'Push' ? 'Push'
    : result === 'Resigned' ? 'Resign'
    : null;
}

function resultClass(result) {
  return result === 'Player Wins' || result === 'Blackjack!' ? 'mp-slot-result-win'
    : result === 'Push' ? 'mp-slot-result-push'
    : result ? 'mp-slot-result-lose' : '';
}

function PlayerWindow({ player, isActive, isLocal }) {
  if (!player) return null;
  const isSplit = player.hand1Completed && player.hand1Completed.length > 0;
  const isDone = player.handStatus === 'stood' || player.handStatus === 'busted';

  const windowClass = [
    'mp-other-window',
    isLocal ? 'mp-other-window-local' : '',
    isActive ? 'mp-other-window-active' : '',
    isDone && !isActive ? 'mp-other-window-done' : '',
  ].filter(Boolean).join(' ');

  const r1Label = resultLabel(player.result);
  const r2Label = resultLabel(player.splitResult);

  return (
    <div className={windowClass}>
      <div className="mp-other-window-name">
        <span className="mp-other-window-name-text">{player.name}</span>
        {isLocal && <span className="mp-other-window-you">you</span>}
      </div>
      {player.bet > 0 && <div className="mp-slot-bet">${player.bet}</div>}

      {isSplit ? (
        <>
          {/* Hand 1 */}
          <div className="mp-other-split-row">
            <div className="mp-other-cards">
              {player.hand1Completed.map((c, i) => (
                <Card key={`h1-${i}-${c.value}${c.suit}`} card={c} />
              ))}
            </div>
            <HandTotal hand={player.hand1Completed} />
            {r1Label && <span className={`mp-slot-result-badge ${resultClass(player.result)}`}>{r1Label}</span>}
          </div>
          {/* Hand 2 */}
          <div className="mp-other-split-row mp-other-split-row-2">
            <div className="mp-other-cards">
              {player.hand.length > 0
                ? player.hand.map((c, i) => <Card key={`h2-${i}-${c.value}${c.suit}`} card={c} />)
                : [0, 1].map(i => <div key={i} className="card" style={{ visibility: 'hidden' }} />)
              }
            </div>
            {player.hand.length > 0 && <HandTotal hand={player.hand} />}
            {r2Label && <span className={`mp-slot-result-badge ${resultClass(player.splitResult)}`}>{r2Label}</span>}
          </div>
        </>
      ) : (
        <>
          <div className="mp-other-cards">
            {player.hand.length > 0
              ? player.hand.map((c, i) => <Card key={`${i}-${c.value}${c.suit}`} card={c} />)
              : [0, 1].map(i => <div key={i} className="card" style={{ visibility: 'hidden' }} />)
            }
          </div>
          {player.hand.length > 0 && <HandTotal hand={player.hand} />}
          {r1Label && <span className={`mp-slot-result-badge ${resultClass(player.result)}`}>{r1Label}</span>}
          {!r1Label && player.handStatus === 'busted' && <span className="mp-other-bust-tag">Bust!</span>}
          {!r1Label && player.handStatus === 'betting' && <span className="mp-other-status-tag">Betting…</span>}
        </>
      )}
    </div>
  );
}

// ── Local player's full-size hand (mirrors singleplayer) ──────────────────────

function LocalPlayerHand({ player, status }) {
  if (!player) return null;

  const isSplit = player.hand1Completed && player.hand1Completed.length > 0;
  const hasSplitWaiting = player.splitHand && player.splitHand.length > 0;

  const resultClass = player.result === 'Player Wins' || player.result === 'Blackjack!'
    ? 'mp-local-result-win'
    : player.result === 'Push' ? 'mp-local-result-push'
    : player.result ? 'mp-local-result-lose' : '';

  if (player.hand.length === 0) {
    return (
      <div className="hand-section mp-local-hand">
        <div className="hand-label"><span>{player.name}</span></div>
        <div className="cards-row">
          {[0, 1].map(i => <div key={i} className="card" style={{ visibility: 'hidden' }} />)}
        </div>
      </div>
    );
  }

  if (isSplit) {
    return (
      <div className="mp-local-split-row">
        <div className="hand-section">
          <div className="hand-label">
            <span>Hand 1</span>
            <HandTotal hand={player.hand1Completed} />
          </div>
          <div className="cards-row">
            {player.hand1Completed.map((c, i) => <Card key={`h1-${i}`} card={c} />)}
          </div>
        </div>
        <div className="hand-section">
          <div className="hand-label">
            <span>Hand 2</span>
            <HandTotal hand={player.hand} />
          </div>
          <div className="cards-row">
            {player.hand.map((c, i) => <Card key={`h2-${i}`} card={c} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hand-section mp-local-hand">
      <div className="hand-label">
        <span>{player.name}</span>
        <HandTotal hand={player.hand} />
        {hasSplitWaiting && <span style={{ fontSize: '0.75em', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>+ split</span>}
        {player.result && <span className={`mp-local-result ${resultClass}`}>{player.result}</span>}
      </div>
      <div className="cards-row">
        {player.hand.map((c, i) => <Card key={`${i}-${c.value}${c.suit}`} card={c} />)}
      </div>
    </div>
  );
}

// ── Betting panel ─────────────────────────────────────────────────────────────

function BettingPanel({ bankroll, onBet }) {
  const [betAmount, setBetAmount] = useState(0);

  const handleQuickBet = (amount) => {
    if (betAmount + amount <= bankroll) { setBetAmount(prev => prev + amount); playSound('chip'); }
  };

  const handleDeal = () => {
    if (betAmount > 0 && betAmount <= bankroll) { onBet(betAmount); setBetAmount(0); }
  };

  return (
    <div className="betting-panel">
      <div className="betting-row">
        <div className="chip-row">
          {QUICK_BETS.map(amount => (
            <button key={amount} className="chip-button" onClick={() => handleQuickBet(amount)} disabled={betAmount + amount > bankroll}>
              ${amount}
            </button>
          ))}
        </div>
        <div className="bet-display">Bet: <span className="bet-amount">${betAmount}</span></div>
        <button className="clear-btn" onClick={() => { setBetAmount(0); playSound('clearbet'); }} disabled={betAmount === 0}>Clear</button>
      </div>
      <div className="betting-row betting-row-actions">
        <button className="deal-btn" onClick={handleDeal} disabled={betAmount === 0 || betAmount > bankroll}>
          Place Bet →
        </button>
      </div>
    </div>
  );
}

// ── Action buttons ────────────────────────────────────────────────────────────

function ActionButtons({ player, send }) {
  const hand = player.hand;
  const hasSplitWaiting = player.splitHand && player.splitHand.length > 0;
  const alreadySplit = player.hand1Completed && player.hand1Completed.length > 0;
  const canSplit = hand.length === 2 && !hasSplitWaiting && !alreadySplit && hand[0]?.value === hand[1]?.value && player.bankroll >= player.bet;
  const canDouble = hand.length === 2 && player.bankroll >= player.bet;
  const canResign = hand.length === 2 && !hasSplitWaiting && !alreadySplit;
  const canHit = hand.length > 0 && getHandTotal(hand) < 21;

  return (
    <div className="action-buttons-wrapper">
      <button className="action-btn btn-hit" disabled={!canHit} onClick={() => { if (canHit) { playSound('draw'); send({ type: 'player:hit' }); } }}>
        Hit <kbd className="key-hint">W</kbd>
      </button>
      <button className="action-btn btn-stand" onClick={() => send({ type: 'player:stand' })}>
        Stand <kbd className="key-hint">S</kbd>
      </button>
      <button className="action-btn btn-double" disabled={!canDouble} onClick={() => { if (canDouble) send({ type: 'player:double' }); }}>
        Double <kbd className="key-hint">D</kbd>
      </button>
      {canSplit && (
        <button className="action-btn btn-split" onClick={() => send({ type: 'player:split' })}>
          Split <kbd className="key-hint">A</kbd>
        </button>
      )}
      <button className="action-btn btn-resign" disabled={!canResign} onClick={() => { if (canResign) send({ type: 'player:resign' }); }}>
        Resign <kbd className="key-hint">R</kbd>
      </button>
    </div>
  );
}

// ── Main table component ──────────────────────────────────────────────────────

export default function MultiplayerTable({ gameState, playerId, send, onLeave, volumeOn }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const { players = [], dealerHand = [], dealerHoleHidden, currentPlayerIndex, status, code, round } = gameState || {};

  const localPlayer = players.find(p => p.id === playerId);
  const localPlayerIndex = players.findIndex(p => p.id === playerId);
  const otherPlayers = players.filter(p => p.id !== playerId);

  const isLocalPlayerTurn = status === 'playing' && currentPlayerIndex === localPlayerIndex && localPlayer?.handStatus === 'acting';
  const isLocalBetting = status === 'betting' && localPlayer?.handStatus === 'betting';

  // Keyboard shortcuts
  useEffect(() => {
    if (!isLocalPlayerTurn) return;
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      const p = players[localPlayerIndex];
      if (k === 'w') {
        if (p && getHandTotal(p.hand) < 21) { playSound('draw'); send({ type: 'player:hit' }); }
      } else if (k === 's') {
        send({ type: 'player:stand' });
      } else if (k === 'd') {
        if (p?.hand.length === 2 && p.bankroll >= p.bet) send({ type: 'player:double' });
      } else if (k === 'a') {
        if (p?.hand.length === 2 && p.hand[0]?.value === p.hand[1]?.value && !p.splitHand && !p.hand1Completed && p.bankroll >= p.bet)
          send({ type: 'player:split' });
      } else if (k === 'r') {
        if (p?.hand.length === 2 && !p.splitHand && !p.hand1Completed)
          send({ type: 'player:resign' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLocalPlayerTurn, send, players, localPlayerIndex]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleBet = useCallback((amount) => send({ type: 'player:bet', amount }), [send]);

  if (!gameState) return null;

  return (
    <div className="game-table">
      {/* ── Header ── */}
      <header className="game-header">
        <div className="game-header-left">
          <button className="game-title-btn" onClick={onLeave}>Blackjack</button>
          <span className="mp-lobby-badge">Multiplayer</span>
        </div>
        <div className="game-header-right">
          {localPlayer && <span className="hud-item">Bankroll: ${localPlayer.bankroll}</span>}
          {localPlayer?.bet > 0 && <span className="hud-item hud-bet">Bet: ${localPlayer.bet}</span>}
          <div className="menu-container" ref={menuRef}>
            <button className={`settings-btn${menuOpen ? ' settings-btn-open' : ''}`} onClick={() => setMenuOpen(o => !o)} aria-label="Settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            {menuOpen && (
              <div className="menu-panel">
                <button className="menu-logout-btn" onClick={() => { setMenuOpen(false); onLeave(); }}>Leave Game</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="green-board mp-board-layout">

        {/* ── Left sidebar ── */}
        <aside className="mp-sidebar-left">
          <div className="mp-sidebar-section">
            <span className="mp-sidebar-label">Lobby</span>
            <div className="mp-sidebar-code">{code}</div>
            <span className="mp-sidebar-round">Round {round}</span>
          </div>

          <div className="mp-sidebar-divider" />

          <div className="mp-sidebar-section mp-sidebar-leaderboard">
            <span className="mp-sidebar-label">Leaderboard</span>
            {[...players]
              .sort((a, b) => b.bankroll - a.bankroll)
              .map((p, i) => (
                <div key={p.id} className={`mp-lb-row${p.id === playerId ? ' mp-lb-row-you' : ''}`}>
                  <span className="mp-lb-rank">{i + 1}</span>
                  <span className="mp-lb-name">{p.name}</span>
                  {p.id === playerId && <span className="mp-lb-you">YOU</span>}
                  <span className="mp-lb-bankroll">${p.bankroll}</span>
                </div>
              ))
            }
          </div>
        </aside>

        {/* ── Center: table + controls ── */}
        <div className="mp-center-col">
          <div className="table-area mp-table-area">
            <div className="table-rules">
              <span>Blackjack Pays 3 to 2</span>
              <span className="table-rules-divider">·</span>
              <span>Dealer Stands Soft 17</span>
              <span className="table-rules-divider">·</span>
              <span>4 Decks</span>
            </div>

            {/* Dealer */}
            <MultiDealerHand hand={dealerHand} holeHidden={dealerHoleHidden} />

            {/* Local player — full-size cards, same as singleplayer */}
            <LocalPlayerHand player={localPlayer} status={status} />
          </div>

          {/* ── Controls bar ── */}
          <div className="controls-bar">
          {isLocalBetting && (
            <div className="betting-controls">
              <BettingPanel bankroll={localPlayer.bankroll} onBet={handleBet} />
            </div>
          )}

          {status === 'betting' && !isLocalBetting && (
            <div className="mp-waiting-indicator">
              <span className="mp-turn-label">Waiting for others to bet…</span>
            </div>
          )}

          {isLocalPlayerTurn && localPlayer && (
            <ActionButtons player={localPlayer} send={send} />
          )}

          {status === 'playing' && !isLocalPlayerTurn && (
            <div className="mp-waiting-indicator">
              <span className="mp-turn-label">
                {currentPlayerIndex >= 0 && players[currentPlayerIndex]
                  ? `${players[currentPlayerIndex].name}'s turn`
                  : 'Waiting…'}
              </span>
            </div>
          )}

          {(status === 'dealing' || status === 'dealer') && (
            <div className="mp-waiting-indicator">
              <span className="waiting-dots">• • •</span>
            </div>
          )}

          {status === 'round-end' && (
            <div className="mp-round-end">
              <div className="mp-round-end-results">
                {players.map(p => (
                  <div key={p.id} className="mp-round-result-row">
                    <span className="mp-round-result-name">{p.name}:</span>
                    <span className={`mp-round-result-label ${p.result === 'Player Wins' || p.result === 'Blackjack!' ? 'stat-win' : p.result === 'Push' ? 'stat-push' : p.result === 'Resigned' ? 'stat-loss' : 'stat-loss'}`}>
                      {p.result || '—'}
                    </span>
                    {p.splitResult && (
                      <>
                        <span className="mp-round-result-name"> / </span>
                        <span className={`mp-round-result-label ${p.splitResult === 'Player Wins' ? 'stat-win' : p.splitResult === 'Push' ? 'stat-push' : 'stat-loss'}`}>
                          {p.splitResult}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p className="mp-next-round-hint">Next round starting automatically…</p>
            </div>
          )}
          </div>{/* controls-bar */}
        </div>{/* mp-center-col */}

        {/* ── Right sidebar: all players stacked vertically ── */}
        <aside className="mp-sidebar-right">
          {players.map((p, i) => (
            <PlayerWindow
              key={p.id}
              player={p}
              isLocal={p.id === playerId}
              isActive={status === 'playing' && currentPlayerIndex === i}
            />
          ))}
        </aside>

      </div>{/* green-board */}
    </div>
  );
}
