'use client'
import React, { useEffect, useCallback, useState, useRef } from "react";
import { DeckContext } from "./context/DeckContext";
import PlayerHand from './components/PlayerHand';
import DealerHand from './components/DealerHand';
import PlayerActions from "./components/PlayerActions";
import BettingPanel from "./components/BettingPanel";
import TrainingFeedback from "./components/TrainingFeedback";
import ResultPanel from "./components/ResultPanel";
import StatusBanner from "./components/StatusBanner";
import checkWinner from "./logic/checkWinner";
import getHandTotal from "./logic/getHandTotal";
import drawCard from "./logic/drawCard";
import { getBasicStrategyAction } from "./theory/basicStrategy";
import StrategyTableModal from "./components/StrategyTableModal";
import TestDealPanel from "./components/TestDealPanel";

// gamePhase values: 'betting' | 'dealing' | 'player' | 'dealer' | 'pausing' | 'result'

function classifyHandType(c0, c2) {
  if (c0.value === c2.value) return 'pair';
  if (c0.value === 'A' || c2.value === 'A') return 'soft';
  return 'hard';
}

function setupTestHand(deck, v1, v2) {
  const d = [...deck];
  // Move a v1 card to position 0 (player's first card)
  const i1 = d.findIndex(c => c.value === v1);
  if (i1 > 0) { const [c] = d.splice(i1, 1); d.unshift(c); }
  // Move a v2 card to position 2 (player's second card), skipping positions 0 & 1
  const i2 = d.findIndex((c, i) => c.value === v2 && i >= 2);
  if (i2 > 2) { const [c] = d.splice(i2, 1); d.splice(2, 0, c); }
  return d;
}

function findValidArrangement(deck, enabledTypes) {
  if (enabledTypes.length === 0) return deck;
  const n = deck.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (enabledTypes.includes(classifyHandType(deck[i], deck[j]))) {
        const d = [...deck];
        [d[0], d[i]] = [d[i], d[0]];
        const jAdj = j === 0 ? i : j;
        [d[2], d[jAdj]] = [d[jAdj], d[2]];
        return d;
      }
    }
  }
  return deck;
}

function App() {
  const {
    deck, setDeck,
    dealerHand, setDealerHand,
    playerHand, setPlayerHand,
    playerTurn, setPlayerTurn,
    bankroll, setBankroll,
    currentBet, setCurrentBet,
  } = React.useContext(DeckContext);

  const [gamePhase, setGamePhase] = useState('betting');
  const [winner, setWinner] = useState(null);
  const [resultAmount, setResultAmount] = useState(0);
  const [resultMessage, setResultMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [lastBetAmount, setLastBetAmount] = useState(0);

  // Menu & settings state
  const [menuOpen, setMenuOpen] = useState(false);
  const [volumeOn, setVolumeOn] = useState(true);
  const [trainingMode, setTrainingMode] = useState('off');
  const [showStats, setShowStats] = useState('off');
  const [stats, setStats] = useState({ hands: 0, wins: 0, losses: 0, pushes: 0 });
  const menuRef = useRef(null);

  // Training practice state
  const [practiceHardHands, setPracticeHardHands] = useState(true);
  const [practiceSoftHands, setPracticeSoftHands] = useState(true);
  const [practicePairs, setPracticePairs] = useState(true);
  const [strategyStats, setStrategyStats] = useState({ total: 0, correct: 0 });
  const [expectedAction, setExpectedAction] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [trainingFeedback, setTrainingFeedback] = useState(null);
  const [showStrategyTable, setShowStrategyTable] = useState(false);

  // Test deal state (freeplay only)
  const [testHand, setTestHand] = useState(null); // { v1, v2, label } | null

  // Split state
  const [splitHand2, setSplitHand2] = useState([]);                   // second hand (waiting to be played)
  const [splitHand1Completed, setSplitHand1Completed] = useState([]); // first hand (done)
  const [splitBet, setSplitBet] = useState(0);                        // original bet when split was made
  const [splitHand1Bet, setSplitHand1Bet] = useState(0);              // actual bet for hand 1 (may be doubled)
  const [splitResults, setSplitResults] = useState(null);             // {result1, result2, amount1, amount2}

  // Prevents the game effect from re-entering during banner pauses.
  const gameTransitionRef = useRef(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const suits = ["♠", "♥", "♦", "♣"];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  const createDeck = (numDecks = 4) => {
    const newDeck = [];
    for (let i = 0; i < numDecks; i++) {
      for (let suit of suits) {
        for (let value of values) {
          newDeck.push({ suit, value });
        }
      }
    }
    setDeck(newDeck.sort(() => Math.random() - 0.5));
  };

  useEffect(() => {
    if (deck.length === 0) createDeck();
  }, [deck.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolveRound = useCallback((playerH, dealerH, betAmount) => {
    const result = checkWinner({ playerHand: playerH, dealerHand: dealerH });
    setWinner(result);
    const amount = betAmount != null ? betAmount : currentBet;
    const isNaturalBlackjack = result === 'Player Wins' && playerH.length === 2 && getHandTotal(playerH) === 21;
    if (trainingMode !== 'basic') {
      if (isNaturalBlackjack) {
        // Natural blackjack pays 3:2
        setBankroll(prev => prev + Math.floor(amount * 2.5));
        setResultAmount(Math.floor(amount * 1.5));
      } else if (result === 'Player Wins') {
        setBankroll(prev => prev + amount * 2);
        setResultAmount(amount);
      } else if (result === 'House Wins') {
        setResultAmount(amount);
      } else {
        setBankroll(prev => prev + amount);
        setResultAmount(0);
      }
    }
    setResultMessage(isNaturalBlackjack ? 'Blackjack!' : result);
    setStats(prev => ({
      hands: prev.hands + 1,
      wins: prev.wins + (result === 'Player Wins' ? 1 : 0),
      losses: prev.losses + (result === 'House Wins' ? 1 : 0),
      pushes: prev.pushes + (result === 'Push' ? 1 : 0),
    }));
    return result;
  }, [currentBet, setBankroll, trainingMode]);

  // Ref always points to latest dealCards — used by effects to avoid stale closures
  const dealCardsRef = useRef(null);

  const cancelHand = useCallback(() => {
    gameTransitionRef.current = false;
    setPlayerHand([]);
    setDealerHand([]);
    setPlayerTurn(true);
    setWinner(null);
    setStatusMessage('');
    setCurrentBet(0);
    setSplitHand2([]);
    setSplitHand1Completed([]);
    setSplitBet(0);
    setSplitHand1Bet(0);
    setSplitResults(null);
    setTrainingFeedback(null);
    setExpectedAction(null);
    setActionFeedback(null);
    setGamePhase('betting');
  }, [setPlayerHand, setDealerHand, setPlayerTurn, setCurrentBet]);

  const dealCards = useCallback((betAmount) => {
    gameTransitionRef.current = false;
    setPlayerHand([]);
    setDealerHand([]);
    setLastBetAmount(betAmount);
    if (trainingMode !== 'basic') setBankroll(prev => prev - betAmount);
    setPlayerTurn(true);
    setGamePhase('dealing');
    setWinner(null);
    setStatusMessage('');

    let workingDeck = deck;
    if (trainingMode === 'basic') {
      const enabledTypes = [
        practiceHardHands && 'hard',
        practiceSoftHands && 'soft',
        practicePairs     && 'pair',
      ].filter(Boolean);
      workingDeck = findValidArrangement(deck, enabledTypes);
    } else if (testHand) {
      workingDeck = setupTestHand(deck, testHand.v1, testHand.v2);
    }

    const c0 = workingDeck[0], c1 = workingDeck[1], c2 = workingDeck[2], c3 = workingDeck[3];

    setTimeout(() => setPlayerHand([c0]), 650);
    setTimeout(() => setDealerHand([c1]), 1300);
    setTimeout(() => setPlayerHand([c0, c2]), 1950);
    setTimeout(() => {
      const finalPlayer = [c0, c2];
      const finalDealer = [c1, c3];
      setDealerHand(finalDealer);
      setDeck(workingDeck.slice(4));

      const playerTotal = getHandTotal(finalPlayer);
      const dealerTotal = getHandTotal(finalDealer);

      if (trainingMode === 'basic' && (playerTotal === 21 || dealerTotal === 21)) {
        // Blackjack in training: no decision to make, skip straight to next hand
        setGamePhase('betting');
      } else if (playerTotal === 21 && dealerTotal === 21) {
        setStatusMessage('Push! Both Blackjack!');
        setGamePhase('pausing');
        setTimeout(() => {
          setStatusMessage('');
          resolveRound(finalPlayer, finalDealer, betAmount);
          setGamePhase('result');
        }, 1500);
      } else if (dealerTotal === 21) {
        setStatusMessage('Dealer Blackjack!');
        setPlayerTurn(false);
        setGamePhase('pausing');
        setTimeout(() => {
          setStatusMessage('');
          resolveRound(finalPlayer, finalDealer, betAmount);
          setGamePhase('result');
        }, 1500);
      } else if (playerTotal === 21) {
        setStatusMessage('Blackjack!');
        setPlayerTurn(false);
        setGamePhase('pausing');
        setTimeout(() => {
          setStatusMessage('');
          resolveRound(finalPlayer, finalDealer, betAmount);
          setGamePhase('result');
        }, 1500);
      } else {
        setGamePhase('player');
        // Set expected action synchronously (same batch as gamePhase) to avoid stale closure in handleActionValidation
        if (trainingMode === 'basic') {
          const canSplitNow = finalPlayer[0].value === finalPlayer[1].value;
          setExpectedAction(getBasicStrategyAction(finalPlayer, finalDealer[1], true, canSplitNow));
        }
      }
    }, 2600);
  }, [deck, setDeck, setDealerHand, setPlayerHand, setPlayerTurn, setBankroll, resolveRound,
      trainingMode, practiceHardHands, practiceSoftHands, practicePairs, testHand]);

  // Keep ref current so effects can call dealCards without stale closures
  dealCardsRef.current = dealCards;

  const handleActionValidation = useCallback((action) => {
    if (trainingMode !== 'basic' || !expectedAction) return;
    const isCorrect = action === expectedAction;
    setStrategyStats(prev => ({ total: prev.total + 1, correct: prev.correct + (isCorrect ? 1 : 0) }));
    setTrainingFeedback({ correct: isCorrect, expected: expectedAction });
    setGamePhase('training-result');
  }, [trainingMode, expectedAction]);

  const handleDouble = useCallback(() => {
    if (playerHand.length !== 2 || (trainingMode !== 'basic' && currentBet > bankroll) || deck.length === 0) return;
    handleActionValidation('double');
    if (trainingMode === 'basic') return;
    setBankroll(prev => prev - currentBet);
    setCurrentBet(prev => prev * 2);
    const { updatedHand, updatedDeck } = drawCard({ hand: playerHand, deck });
    setTimeout(() => {
      setPlayerHand(updatedHand);
      setDeck(updatedDeck);
    }, 500);
    setTimeout(() => setPlayerTurn(false), 1150);
  }, [playerHand, currentBet, bankroll, deck, setBankroll, setCurrentBet, setPlayerHand, setDeck, setPlayerTurn,
      trainingMode, handleActionValidation]);

  const handleSplit = useCallback(() => {
    const isAlreadySplit = splitHand2.length > 0 || splitHand1Completed.length > 0;
    if (
      playerHand.length !== 2 ||
      playerHand[0]?.value !== playerHand[1]?.value ||
      isAlreadySplit ||
      deck.length < 2 ||
      (trainingMode !== 'basic' && currentBet > bankroll)
    ) return;

    handleActionValidation('split');
    if (trainingMode === 'basic') return;
    const [card1, card2] = playerHand;
    const newCard1 = deck[0];
    const newCard2 = deck[1];
    setBankroll(prev => prev - currentBet);
    setSplitBet(currentBet);
    setDeck(prev => prev.slice(2));
    setPlayerHand([card1]);
    setSplitHand2([card2]);
    setTimeout(() => setPlayerHand([card1, newCard1]), 650);
    setTimeout(() => setSplitHand2([card2, newCard2]), 1300);
  }, [playerHand, splitHand2, splitHand1Completed, currentBet, bankroll, deck, setBankroll, setDeck, setPlayerHand,
      trainingMode, handleActionValidation]);

  // Game logic: player bust/21 detection + dealer auto-play
  useEffect(() => {
    if (playerHand.length === 0 || dealerHand.length === 0) return;
    if (gameTransitionRef.current) return;
    if (gamePhase === 'training-result') return;

    // Player stood → transition to hand 2 (split) or go to dealer
    if (gamePhase === 'player' && !playerTurn) {
      if (splitHand2.length > 0) {
        // Finished hand 1, move to hand 2
        setSplitHand1Completed(playerHand.slice());
        setSplitHand1Bet(currentBet);
        setCurrentBet(splitBet);
        setPlayerHand(splitHand2);
        setSplitHand2([]);
        setPlayerTurn(true);
      } else {
        const playerTotal = getHandTotal(playerHand);
        if (playerTotal <= 21) {
          setGamePhase('dealer');
        } else {
          // Busted after double down (playerTurn already false)
          gameTransitionRef.current = true;
          const ph = playerHand.slice();
          const dh = dealerHand.slice();
          const isInSplitHand2 = splitHand1Completed.length > 0;
          setTimeout(() => {
            setStatusMessage('Bust!');
            setTimeout(() => {
              setStatusMessage('');
              if (isInSplitHand2) {
                gameTransitionRef.current = false;
                setGamePhase('dealer');
              } else {
                resolveRound(ph, dh);
                setGamePhase('result');
              }
            }, 1500);
          }, 600);
        }
      }
      return;
    }

    // Player bust or 21
    if (gamePhase === 'player' && playerTurn) {
      const playerTotal = getHandTotal(playerHand);

      if (playerTotal > 21) {
        gameTransitionRef.current = true;
        const ph = playerHand.slice();
        const dh = dealerHand.slice();
        const isSplitHand1 = splitHand2.length > 0;
        const isInSplitHand2 = splitHand1Completed.length > 0;
        const hand2Snap = splitHand2.slice();
        const bet1Snap = currentBet;
        const splitBetSnap = splitBet;

        // Delay setPlayerTurn(false) so the bust card's flip animation (600ms)
        // finishes before the dealer hole card reveal animation starts.
        setTimeout(() => {
          setPlayerTurn(false);
          setStatusMessage('Bust!');
          setTimeout(() => {
            setStatusMessage('');
            if (isSplitHand1) {
              // Hand 1 busted, transition to hand 2
              setSplitHand1Completed(ph);
              setSplitHand1Bet(bet1Snap);
              setCurrentBet(splitBetSnap);
              setPlayerHand(hand2Snap);
              setSplitHand2([]);
              setPlayerTurn(true);
              gameTransitionRef.current = false;
            } else if (isInSplitHand2) {
              // Hand 2 busted, proceed to dealer
              gameTransitionRef.current = false;
              setGamePhase('dealer');
            } else {
              // Normal bust
              resolveRound(ph, dh);
              setGamePhase('result');
            }
          }, 1500);
        }, 650);

      } else if (playerTotal === 21) {
        const isInSplit = splitHand2.length > 0 || splitHand1Completed.length > 0;
        if (playerHand.length === 2 && !isInSplit) {
          // Natural blackjack fallback (not in split)
          gameTransitionRef.current = true;
          setPlayerTurn(false);
          const ph = playerHand.slice();
          const dh = dealerHand.slice();
          setStatusMessage('Blackjack!');
          setTimeout(() => {
            setStatusMessage('');
            resolveRound(ph, dh);
            setGamePhase('result');
          }, 1500);
        } else {
          // Hit/split to 21: delay auto-stand so the card flip animation (600ms)
          // finishes before the dealer hole card reveal animation starts.
          setTimeout(() => setPlayerTurn(false), 650);
        }
      }
      return;
    }

    // Dealer auto-play
    if (gamePhase === 'dealer') {
      const dealerTotal = getHandTotal(dealerHand);
      if (dealerTotal < 17 && deck.length > 0) {
        const { updatedHand, updatedDeck } = drawCard({ hand: dealerHand, deck });
        const timeout = setTimeout(() => {
          setDealerHand(updatedHand);
          setDeck(updatedDeck);
        }, 1000);
        return () => clearTimeout(timeout);
      } else {
        // Dealer done drawing
        gameTransitionRef.current = true;
        const ph = playerHand.slice();
        const dh = dealerHand.slice();
        const ph1 = splitHand1Completed.slice();
        const bet2 = currentBet;
        const bet1 = splitHand1Bet;

        setTimeout(() => {
          if (ph1.length > 0) {
            // Split round: resolve both hands
            const result1 = checkWinner({ playerHand: ph1, dealerHand: dh });
            const result2 = checkWinner({ playerHand: ph, dealerHand: dh });
            if (trainingMode !== 'basic') {
              if (result1 === 'Player Wins') setBankroll(prev => prev + bet1 * 2);
              else if (result1 === 'Push') setBankroll(prev => prev + bet1);
              if (result2 === 'Player Wins') setBankroll(prev => prev + bet2 * 2);
              else if (result2 === 'Push') setBankroll(prev => prev + bet2);
            }
            setStats(prev => ({
              hands: prev.hands + 2,
              wins: prev.wins + (result1 === 'Player Wins' ? 1 : 0) + (result2 === 'Player Wins' ? 1 : 0),
              losses: prev.losses + (result1 === 'House Wins' ? 1 : 0) + (result2 === 'House Wins' ? 1 : 0),
              pushes: prev.pushes + (result1 === 'Push' ? 1 : 0) + (result2 === 'Push' ? 1 : 0),
            }));
            setSplitResults({ result1, result2, amount1: bet1, amount2: bet2 });
            setTimeout(() => setGamePhase('result'), 600);
          } else {
            // Normal round
            if (dealerTotal > 21) {
              setStatusMessage('Dealer Busts!');
            } else {
              const result = checkWinner({ playerHand: ph, dealerHand: dh });
              if (result === 'Player Wins') setStatusMessage('You Win!');
              else if (result === 'House Wins') setStatusMessage('Dealer Wins!');
              else setStatusMessage('Push!');
            }
            setTimeout(() => {
              setStatusMessage('');
              resolveRound(ph, dh);
              setGamePhase('result');
            }, 1500);
          }
        }, 600);
      }
    }
  }, [gamePhase, playerTurn, playerHand, dealerHand, deck, resolveRound,
      setDealerHand, setDeck, setPlayerTurn, setCurrentBet, setBankroll,
      splitHand2, splitHand1Completed, splitBet, splitHand1Bet, currentBet, trainingMode]);

  const handleResultsClose = useCallback(() => {
    gameTransitionRef.current = false;
    setPlayerHand([]);
    setDealerHand([]);
    setPlayerTurn(true);
    setWinner(null);
    setStatusMessage('');
    setCurrentBet(0);
    setSplitHand2([]);
    setSplitHand1Completed([]);
    setSplitBet(0);
    setSplitHand1Bet(0);
    setSplitResults(null);
    setGamePhase('betting');
  }, [setPlayerHand, setDealerHand, setPlayerTurn, setCurrentBet]);

  const hasSplitPair = (
    playerHand.length === 2 &&
    playerHand[0]?.value === playerHand[1]?.value &&
    splitHand2.length === 0 &&
    splitHand1Completed.length === 0
  );
  const canSplit = hasSplitPair && currentBet <= bankroll;
  const canDouble = playerHand.length === 2 && currentBet <= bankroll;

  // Hotkeys (W=Hit, S=Stand, D=Double, A=Split)
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (gamePhase !== 'player') return;
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

      const key = event.key.toLowerCase();
      switch (key) {
        case 'w':
          if (deck.length > 0) {
            handleActionValidation('hit');
            if (trainingMode !== 'basic') {
              const { updatedHand, updatedDeck } = drawCard({ hand: playerHand, deck });
              setTimeout(() => {
                setPlayerHand(updatedHand);
                setDeck(updatedDeck);
              }, 500);
            }
          }
          break;
        case 's':
          handleActionValidation('stand');
          if (trainingMode !== 'basic') setPlayerTurn(false);
          break;
        case 'd':
          handleDouble();
          break;
        case 'a':
          handleSplit();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gamePhase, playerHand, deck, handleDouble, handleSplit, setPlayerHand, setDeck, setPlayerTurn, handleActionValidation]);

  const handleReset = useCallback(() => {
    gameTransitionRef.current = false;
    setBankroll(1000);
    setPlayerHand([]);
    setDealerHand([]);
    setPlayerTurn(true);
    setWinner(null);
    setStatusMessage('');
    setCurrentBet(0);
    setLastBetAmount(0);
    setSplitHand2([]);
    setSplitHand1Completed([]);
    setSplitBet(0);
    setSplitHand1Bet(0);
    setSplitResults(null);
    setStats({ hands: 0, wins: 0, losses: 0, pushes: 0 });
    setStrategyStats({ total: 0, correct: 0 });
    setExpectedAction(null);
    setActionFeedback(null);
    setMenuOpen(false);
    setGamePhase('betting');
  }, [setBankroll, setPlayerHand, setDealerHand, setPlayerTurn, setCurrentBet]);

  useEffect(() => {
    setExpectedAction(null);
    setActionFeedback(null);
    setTrainingFeedback(null);
  }, [trainingMode]);

  // Auto-advance from training-result: wait 1.8s then go back to betting (auto-deal fires below)
  useEffect(() => {
    if (gamePhase !== 'training-result') return;
    const t = setTimeout(() => cancelHand(), 1800);
    return () => clearTimeout(t);
  }, [gamePhase, cancelHand]);

  // Auto-deal next hand whenever training mode lands on betting phase
  useEffect(() => {
    if (trainingMode !== 'basic' || gamePhase !== 'betting') return;
    const t = setTimeout(() => dealCardsRef.current?.(lastBetAmount || 10), 350);
    return () => clearTimeout(t);
  }, [trainingMode, gamePhase, lastBetAmount]);

  const isSplitActive = splitHand2.length > 0 || splitHand1Completed.length > 0;
  const isOutOfMoney = gamePhase === 'betting' && bankroll < 10;

  return (
    <div className="game-table">
      <header className="game-header">
        <span className="game-title">Blackjack</span>
        {trainingMode === 'basic' ? (
          <div className="game-bankroll">
            <span className="hud-item training-badge">Training</span>
          </div>
        ) : (
          <div className="game-bankroll">
            <span className="hud-item">Bankroll: ${bankroll}</span>
            {currentBet > 0 && <span className="hud-item hud-bet">Bet: ${currentBet}</span>}
          </div>
        )}
        <div className="menu-container" ref={menuRef}>
          <button
            className={`burger-btn${menuOpen ? ' burger-btn-open' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
          >
            <span /><span /><span />
          </button>
          {menuOpen && (
            <div className="menu-panel">
              <div className="menu-row">
                <span className="menu-label">Volume</span>
                <button
                  className={`menu-toggle${volumeOn ? ' menu-toggle-on' : ''}`}
                  onClick={() => setVolumeOn(v => !v)}
                >
                  {volumeOn ? 'On' : 'Off'}
                </button>
              </div>
              <div className="menu-section-label">Training Mode</div>
              <div className="training-options">
                {[['off', 'Off', false], ['basic', 'Basic Strategy', false], ['pro', 'Pro', true]].map(([val, label, soon]) => (
                  <button
                    key={val}
                    className={`training-btn${trainingMode === val ? ' training-btn-active' : ''}${soon ? ' training-btn-soon' : ''}`}
                    onClick={() => {
                      if (soon || val === trainingMode) return;
                      if (gamePhase !== 'betting') cancelHand();
                      setTrainingMode(val);
                      setMenuOpen(false);
                    }}
                    disabled={soon}
                  >
                    {label}{soon && <span className="soon-badge">Soon</span>}
                  </button>
                ))}
              </div>
              <div className="menu-section-label">Statistics</div>
              <div className="training-options">
                {[['off', 'Off', false], ['simple', 'Simple', false], ['detailed', 'Detailed', true]].map(([val, label, soon]) => (
                  <button
                    key={val}
                    className={`training-btn${showStats === val ? ' training-btn-active' : ''}${soon ? ' training-btn-soon' : ''}`}
                    onClick={() => !soon && setShowStats(val)}
                    disabled={soon}
                  >
                    {label}{soon && <span className="soon-badge">Soon</span>}
                  </button>
                ))}
              </div>
              <div className="menu-divider" />
              <button className="menu-reset-btn" onClick={handleReset}>
                Reset
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="table-area">
        <div className="table-rules">
          <span>Blackjack Pays 3 to 2</span>
          <span className="table-rules-divider">·</span>
          <span>Dealer Stands Soft 17</span>
          <span className="table-rules-divider">·</span>
          <span>4 Decks</span>
        </div>
        {trainingMode === 'basic' && (() => {
          const enabledCount = [practiceHardHands, practiceSoftHands, practicePairs].filter(Boolean).length;
          const toggle = (setter) => {
            setter(v => !v);
            if (gamePhase !== 'betting') cancelHand();
          };
          return (
            <>
              <div className="training-hand-panel">
                <span className="training-hand-panel-label">Practice</span>
                {[
                  ['Hard', practiceHardHands, () => toggle(setPracticeHardHands)],
                  ['Soft', practiceSoftHands, () => toggle(setPracticeSoftHands)],
                  ['Pairs', practicePairs,    () => toggle(setPracticePairs)],
                ].map(([label, active, handler]) => (
                  <button
                    key={label}
                    className={`training-hand-btn${active ? ' training-hand-btn-on' : ''}`}
                    onClick={active && enabledCount === 1 ? undefined : handler}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="training-hand-panel strategy-table-panel">
                <button
                  className="training-hand-btn strategy-table-btn"
                  onClick={() => setShowStrategyTable(true)}
                >
                  Strategy Table
                </button>
              </div>
            </>
          );
        })()}
        {showStats !== 'off' && (
          <div className="table-stats">
            {trainingMode === 'basic' ? (
              <>
                <div className="table-stats-row"><span>Decisions</span><span>{strategyStats.total}</span></div>
                <div className="table-stats-row table-stats-rate"><span>Correct</span><span>{strategyStats.total > 0 ? Math.round(strategyStats.correct / strategyStats.total * 100) : 0}%</span></div>
              </>
            ) : (
              <>
                <div className="table-stats-row"><span>Hands</span><span>{stats.hands}</span></div>
                <div className="table-stats-row table-stats-rate"><span>Win %</span><span>{stats.hands > 0 ? Math.round(stats.wins / stats.hands * 100) : 0}%</span></div>
              </>
            )}
          </div>
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
            onDouble={handleDouble}
            onSplit={handleSplit}
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
        {(gamePhase === 'dealing' || gamePhase === 'dealer' || gamePhase === 'pausing' || gamePhase === 'betting' && trainingMode === 'basic' || (gamePhase === 'player' && statusMessage)) && (
          <div className="waiting-indicator">
            <span className="waiting-dots">• • •</span>
          </div>
        )}
      </div>
      {showStrategyTable && (
        <StrategyTableModal onClose={() => setShowStrategyTable(false)} />
      )}
      {isOutOfMoney && trainingMode !== 'basic' && (
        <div className="broke-overlay">
          <div className="broke-modal">
            <h2 className="broke-title">You're broke!</h2>
            <p className="broke-subtitle">Not enough to place a bet.</p>
            <button className="broke-reset-btn" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
