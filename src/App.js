'use client'
import React, { useEffect, useCallback, useState, useRef } from "react";
import { useSession, signOut } from 'next-auth/react';
import { setVolumeEnabled } from "./lib/sound";
import { useBlackjackGame } from "./hooks/useBlackjackGame";
import PlayerHand from './components/PlayerHand';
import DealerHand from './components/DealerHand';
import PlayerActions from "./components/PlayerActions";
import BettingPanel from "./components/BettingPanel";
import TrainingFeedback from "./components/TrainingFeedback";
import ResultPanel from "./components/ResultPanel";
import StatusBanner from "./components/StatusBanner";
import StrategyTableModal from "./components/StrategyTableModal";
import LeaderboardModal from "./components/LeaderboardModal";
import TestDealPanel from "./components/TestDealPanel";
import Link from 'next/link';

// gamePhase values: 'betting' | 'dealing' | 'player' | 'dealer' | 'pausing' | 'result'

function App({ initialStats = { hands: 0, wins: 0, losses: 0, pushes: 0, totalIncome: 0, blackjacks: 0, trainingHands: 0, trainingCorrect: 0 }, onRoundEnd, onReset, onShowAuth, volumeOn, onVolumeChange, onSwitchToMultiplayer }) {
  const { data: session } = useSession();

  // ── UI-only state ────────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen]             = useState(false);
  const [trainingMode, setTrainingMode]     = useState('off');
  const [trainingSetup, setTrainingSetup]   = useState(false);
  const [practiceHardHands, setPracticeHardHands] = useState(true);
  const [practiceSoftHands, setPracticeSoftHands] = useState(true);
  const [practicePairs, setPracticePairs]         = useState(true);
  const [showStrategyTable, setShowStrategyTable] = useState(false);
  const [showLeaderboard, setShowLeaderboard]     = useState(false);
  const [testHand, setTestHand]             = useState(null);
  const [earlyResign, setEarlyResign] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('earlyResign') === 'true';
    return false;
  });
  const menuRef = useRef(null);

  // ── Sync volume ──────────────────────────────────────────────────────────────
  useEffect(() => { setVolumeEnabled(volumeOn); }, [volumeOn]);

  // ── Close menu on outside click ──────────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // ── Game logic (the heavy lifting) ──────────────────────────────────────────
  const {
    gamePhase, statusMessage, lastBetAmount,
    resultMessage, resultAmount, splitResults,
    strategyStats, trainingFeedback, actionFeedback,
    isSplitActive, isOutOfMoney, hasSplitPair, canSplit, canDouble, canResign,
    splitHand2, splitHand1Completed, splitBet, splitHand1Bet,
    playerHand, dealerHand, bankroll, currentBet,
    dealCards, cancelHand, handleDouble, handleSplit, handleResign,
    handleReset, handleResultsClose, handleActionValidation,
  } = useBlackjackGame({
    initialStats,
    onRoundEnd,
    onReset,
    onMenuClose: useCallback(() => setMenuOpen(false), []),
    trainingMode,
    trainingSetup,
    practiceHardHands,
    practiceSoftHands,
    practicePairs,
    testHand,
    earlyResign,
  });

  return (
    <div className="game-table">
      {/* ── Header ── */}
      <header className="game-header">
        <div className="game-header-left">
          <a href="/" className="game-title">Blackjack</a>
          <nav className="game-nav">
            {[
              ['off',   'Singleplayer'],
              ['basic', 'Training'],
            ].map(([val, label]) => (
              <button
                key={val}
                className={`nav-btn${trainingMode === val ? ' nav-btn-active' : ''}`}
                onClick={() => {
                  if (val === trainingMode) return;
                  if (gamePhase !== 'betting') cancelHand();
                  setTrainingMode(val);
                  if (val === 'basic') setTrainingSetup(true);
                }}
              >
                {label}
              </button>
            ))}
            <button
              className="nav-btn"
              onClick={() => { if (gamePhase !== 'betting') cancelHand(); onSwitchToMultiplayer?.(); }}
            >
              Multiplayer
            </button>
          </nav>
          <button className="nav-btn nav-btn-highlight" onClick={() => setShowLeaderboard(true)}>
            Leaderboard
          </button>
        </div>
        <div className="game-header-right">
          {session?.user?.username && (
            <Link href="/profile" className="hud-item hud-user hud-user-link">{session.user.username}</Link>
          )}
          {trainingMode !== 'basic' && <span className="hud-item">Bankroll: ${bankroll}</span>}
          {trainingMode !== 'basic' && currentBet > 0 && (
            <span className="hud-item hud-bet">
              Bet: ${isSplitActive ? (splitHand1Completed.length > 0 ? splitHand1Bet : splitBet) + currentBet : currentBet}
            </span>
          )}
          <div className="menu-container" ref={menuRef}>
            <button
              className={`settings-btn${menuOpen ? ' settings-btn-open' : ''}`}
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            {menuOpen && (
              <div className="menu-panel">
                <div className="menu-row">
                  <span className="menu-label">Volume</span>
                  <button
                    className={`menu-toggle${volumeOn ? ' menu-toggle-on' : ''}`}
                    onClick={() => onVolumeChange(!volumeOn)}
                  >
                    {volumeOn ? 'On' : 'Off'}
                  </button>
                </div>
                <div className="menu-row">
                  <span className="menu-label">Early Resign</span>
                  <button
                    className={`menu-toggle${earlyResign ? ' menu-toggle-on' : ''}`}
                    onClick={() => {
                      const next = !earlyResign;
                      setEarlyResign(next);
                      localStorage.setItem('earlyResign', String(next));
                    }}
                  >
                    {earlyResign ? 'On' : 'Off'}
                  </button>
                </div>
                {!session?.user && onShowAuth && (
                  <>
                    <div className="menu-divider" />
                    <button className="menu-auth-btn" onClick={() => { setMenuOpen(false); onShowAuth(); }}>
                      Sign In / Register
                    </button>
                  </>
                )}
                {session?.user && (
                  <>
                    <div className="menu-divider" />
                    <button className="menu-logout-btn" onClick={() => { setMenuOpen(false); signOut(); }}>
                      Sign Out
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Board ── */}
      <div className="green-board">
        <div className="table-area">
          <div className="table-rules">
            <span>Blackjack Pays 3 to 2</span>
            <span className="table-rules-divider">·</span>
            <span>Dealer Stands Soft 17</span>
            <span className="table-rules-divider">·</span>
            <span>4 Decks</span>
          </div>

          {/* Training setup / controls */}
          {trainingMode === 'basic' && (
            trainingSetup ? (
              <div className="training-setup-overlay">
                <div className="training-setup-card">
                  <h2 className="training-setup-title">Training Setup</h2>
                  <p className="training-setup-subtitle">Select which hand types to practice</p>
                  <div className="training-setup-checks">
                    {[
                      ['Hard Hands', practiceHardHands, setPracticeHardHands],
                      ['Soft Hands', practiceSoftHands, setPracticeSoftHands],
                      ['Pairs',      practicePairs,      setPracticePairs],
                    ].map(([label, checked, setter]) => (
                      <label key={label} className="training-setup-check">
                        <input type="checkbox" checked={checked} onChange={e => setter(e.target.checked)} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    className="training-setup-start-btn"
                    disabled={![practiceHardHands, practiceSoftHands, practicePairs].some(Boolean)}
                    onClick={() => setTrainingSetup(false)}
                  >
                    Start Training
                  </button>
                </div>
              </div>
            ) : (
              <div className="training-controls-left">
                <div className="training-hand-panel strategy-table-panel">
                  <button
                    className="training-hand-btn"
                    onClick={() => { if (gamePhase !== 'betting') cancelHand(); setTrainingSetup(true); }}
                  >
                    Reconfigure
                  </button>
                  <button
                    className="training-hand-btn strategy-table-btn"
                    onClick={() => setShowStrategyTable(true)}
                  >
                    Strategy Table
                  </button>
                </div>
                <div className="training-session-stats">
                  <div className="training-session-stat-row">
                    <span>Hands</span>
                    <span className="training-session-stat-value">{strategyStats.total}</span>
                  </div>
                  <div className="training-session-stat-row training-session-stat-divider" />
                  <div className="training-session-stat-row">
                    <span>Correct</span>
                    {(() => {
                      const pct = strategyStats.total > 0 ? Math.round(strategyStats.correct / strategyStats.total * 100) : null;
                      const cls = pct === null ? 'training-session-stat-value' : pct >= 70 ? 'training-session-stat-value stat-win' : pct < 50 ? 'training-session-stat-value stat-loss' : 'training-session-stat-value';
                      return <span className={cls}>{pct !== null ? `${pct}%` : '—'}</span>;
                    })()}
                  </div>
                </div>
              </div>
            )
          )}

          <DealerHand hand={dealerHand} gamePhase={gamePhase} />
          {statusMessage && <StatusBanner message={statusMessage} />}

          {isSplitActive ? (
            <div className="split-hands-row">
              <PlayerHand
                hand={splitHand1Completed.length > 0 ? splitHand1Completed : playerHand}
                label="Hand 1"
                isActive={splitHand2.length > 0}
              />
              <PlayerHand
                hand={splitHand1Completed.length > 0 ? playerHand : splitHand2}
                label="Hand 2"
                isActive={splitHand1Completed.length > 0}
              />
            </div>
          ) : (
            <PlayerHand hand={playerHand} />
          )}
        </div>

        {/* ── Controls bar ── */}
        <div className="controls-bar">
          {gamePhase === 'betting' && trainingMode !== 'basic' && (
            <div className="betting-controls">
              {process.env.NEXT_PUBLIC_TEST_MODE === 'true' && (
                <TestDealPanel testHand={testHand} onSelect={setTestHand} />
              )}
              <BettingPanel onDeal={dealCards} defaultBet={lastBetAmount} />
            </div>
          )}
          {gamePhase === 'player' && !statusMessage && (
            <PlayerActions
              hasSplitPair={hasSplitPair}
              canSplit={canSplit}
              canDouble={canDouble}
              canResign={canResign}
              onDouble={handleDouble}
              onSplit={handleSplit}
              onResign={handleResign}
              onValidate={trainingMode === 'basic' ? handleActionValidation : undefined}
              actionFeedback={actionFeedback}
            />
          )}
          {gamePhase === 'training-result' && trainingFeedback && (
            <TrainingFeedback feedback={trainingFeedback} onSkip={cancelHand} />
          )}
          {gamePhase === 'result' && trainingMode !== 'basic' && (
            <ResultPanel
              result={resultMessage}
              amount={resultAmount}
              splitResults={splitResults}
              onNext={handleResultsClose}
            />
          )}
          {(gamePhase === 'dealing' || gamePhase === 'dealer' || gamePhase === 'pausing' ||
            (gamePhase === 'betting' && trainingMode === 'basic') ||
            (gamePhase === 'player' && statusMessage)) && (
            <div className="waiting-indicator">
              <span className="waiting-dots">• • •</span>
            </div>
          )}
        </div>
      </div>{/* green-board */}

      {/* ── Modals ── */}
      {showStrategyTable && <StrategyTableModal onClose={() => setShowStrategyTable(false)} />}
      {showLeaderboard   && <LeaderboardModal   onClose={() => setShowLeaderboard(false)}   />}
      {isOutOfMoney && trainingMode !== 'basic' && (
        <div className="broke-overlay">
          <div className="broke-modal">
            <h2 className="broke-title">You're broke!</h2>
            <p className="broke-subtitle">Not enough to place a bet.</p>
            <button className="broke-reset-btn" onClick={handleReset}>Reset</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
