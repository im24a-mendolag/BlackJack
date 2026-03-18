'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DeckContext } from '../context/DeckContext';
import { playSound, resumeAudio } from '../lib/sound';
import checkWinner from '../logic/checkWinner';
import getHandTotal from '../logic/getHandTotal';
import drawCard from '../logic/drawCard';
import { getBasicStrategyAction } from '../theory/basicStrategy';

// Reshuffle when fewer than 25% of the 4-deck shoe remain
const RESHUFFLE_THRESHOLD = Math.floor(4 * 52 * 0.25);
const SUITS  = ['♠', '♥', '♦', '♣'];
const VALUES = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

// ── Pure helpers ──────────────────────────────────────────────────────────────

function classifyHandType(c0, c2) {
  if (c0.value === c2.value) return 'pair';
  if (c0.value === 'A' || c2.value === 'A') return 'soft';
  return 'hard';
}

function setupTestHand(deck, v1, v2) {
  const d = [...deck];
  const i1 = d.findIndex(c => c.value === v1);
  if (i1 > 0) { const [c] = d.splice(i1, 1); d.unshift(c); }
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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBlackjackGame({
  initialStats,
  onRoundEnd,
  onReset,
  onMenuClose,
  trainingMode,
  trainingSetup = false,
  practiceHardHands,
  practiceSoftHands,
  practicePairs,
  testHand,
  earlyResign = false,
}) {
  const {
    deck, setDeck,
    dealerHand, setDealerHand,
    playerHand, setPlayerHand,
    playerTurn, setPlayerTurn,
    bankroll, setBankroll,
    currentBet, setCurrentBet,
  } = React.useContext(DeckContext);

  // Always-current ref for trainingMode — prevents stale closures in callbacks
  const trainingModeRef = useRef(trainingMode);
  trainingModeRef.current = trainingMode;

  const [gamePhase, setGamePhase]           = useState('betting');
  const [winner, setWinner]                 = useState(null);
  const [resultAmount, setResultAmount]     = useState(0);
  const [resultMessage, setResultMessage]   = useState('');
  const [statusMessage, setStatusMessage]   = useState('');
  const [lastBetAmount, setLastBetAmount]   = useState(0);
  const [stats, setStats]                   = useState(initialStats);
  const [strategyStats, setStrategyStats]   = useState({ total: 0, correct: 0 });
  const [expectedAction, setExpectedAction] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [trainingFeedback, setTrainingFeedback] = useState(null);

  // Split state
  const [splitHand2, setSplitHand2]                   = useState([]);
  const [splitHand1Completed, setSplitHand1Completed] = useState([]);
  const [splitBet, setSplitBet]                       = useState(0);
  const [splitHand1Bet, setSplitHand1Bet]             = useState(0);
  const [splitResults, setSplitResults]               = useState(null);

  // Refs
  const bankrollRef        = useRef(bankroll);
  const initialTrainingRef = useRef({ hands: initialStats.trainingHands ?? 0, correct: initialStats.trainingCorrect ?? 0 });
  const strategyStatsRef   = useRef({ total: 0, correct: 0 });
  const statsRef           = useRef(stats);
  const gameTransitionRef  = useRef(false);
  const dealCardsRef       = useRef(null);
  const handIdRef          = useRef(0);

  useEffect(() => { bankrollRef.current = bankroll; }, [bankroll]);
  useEffect(() => { statsRef.current = stats; }, [stats]);

  // Init deck on mount if empty
  useEffect(() => {
    if (deck.length === 0) {
      const newDeck = [];
      for (let i = 0; i < 4; i++)
        for (const suit of SUITS)
          for (const value of VALUES)
            newDeck.push({ suit, value });
      setDeck(newDeck.sort(() => Math.random() - 0.5));
    }
  }, [deck.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear training state when mode changes
  useEffect(() => {
    setExpectedAction(null);
    setActionFeedback(null);
    setTrainingFeedback(null);
  }, [trainingMode]);

  // ── Game logic ──────────────────────────────────────────────────────────────

  const resolveRound = useCallback((playerH, dealerH, betAmount) => {
    const result = checkWinner({ playerHand: playerH, dealerHand: dealerH });
    setWinner(result);
    const amount = betAmount != null ? betAmount : currentBet;
    const isNaturalBlackjack = result === 'Player Wins' && playerH.length === 2 && getHandTotal(playerH) === 21;
    let delta = 0;
    if (trainingModeRef.current !== 'basic') {
      if (isNaturalBlackjack) {
        delta = Math.floor(amount * 2.5);
        setBankroll(prev => prev + delta);
        setResultAmount(Math.floor(amount * 1.5));
      } else if (result === 'Player Wins') {
        delta = amount * 2;
        setBankroll(prev => prev + delta);
        setResultAmount(amount);
      } else if (result === 'House Wins') {
        setResultAmount(amount);
      } else {
        delta = amount;
        setBankroll(prev => prev + delta);
        setResultAmount(0);
      }
    }
    setResultMessage(isNaturalBlackjack ? 'Blackjack!' : result);
    const incomeDelta = trainingModeRef.current !== 'basic' ? delta - (betAmount ?? currentBet) : 0;
    setStats(prev => {
      const next = {
        hands: prev.hands + 1,
        wins: prev.wins + (result === 'Player Wins' ? 1 : 0),
        losses: prev.losses + (result === 'House Wins' ? 1 : 0),
        pushes: prev.pushes + (result === 'Push' ? 1 : 0),
        totalIncome: prev.totalIncome + incomeDelta,
        blackjacks: prev.blackjacks + (isNaturalBlackjack ? 1 : 0),
      };
      const s = strategyStatsRef.current;
      const trainingStats = trainingModeRef.current === 'basic' ? {
        trainingHands: initialTrainingRef.current.hands + s.total,
        trainingCorrect: initialTrainingRef.current.correct + s.correct,
      } : undefined;
      onRoundEnd?.({ bankroll: bankrollRef.current + delta, stats: next, trainingStats });
      return next;
    });
    return result;
  }, [currentBet, setBankroll, onRoundEnd]);

  const cancelHand = useCallback(() => {
    handIdRef.current += 1;
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
    const handId = ++handIdRef.current;
    resumeAudio();
    gameTransitionRef.current = false;
    setPlayerHand([]);
    setDealerHand([]);
    setLastBetAmount(betAmount);
    if (trainingModeRef.current !== 'basic') setBankroll(prev => prev - betAmount);
    setPlayerTurn(true);
    setGamePhase('dealing');
    setWinner(null);
    setStatusMessage('');

    let workingDeck = deck;
    if (trainingModeRef.current !== 'basic' && deck.length < RESHUFFLE_THRESHOLD) {
      playSound('shuffle');
      const newDeck = [];
      for (let i = 0; i < 4; i++)
        for (const suit of SUITS)
          for (const value of VALUES)
            newDeck.push({ suit, value });
      newDeck.sort(() => Math.random() - 0.5);
      workingDeck = newDeck;
      setDeck(newDeck);
    }

    if (trainingModeRef.current === 'basic') {
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

    setTimeout(() => { if (handIdRef.current !== handId) return; playSound('draw'); setPlayerHand([c0]); }, 650);
    setTimeout(() => { if (handIdRef.current !== handId) return; playSound('draw'); setDealerHand([c1]); }, 1300);
    setTimeout(() => { if (handIdRef.current !== handId) return; playSound('draw'); setPlayerHand([c0, c2]); }, 1950);
    setTimeout(() => {
      if (handIdRef.current !== handId) return;
      playSound('draw');
      const finalPlayer = [c0, c2];
      const finalDealer = [c1, c3];
      setDealerHand(finalDealer);
      setDeck(workingDeck.slice(4));

      const playerTotal = getHandTotal(finalPlayer);
      const dealerTotal = getHandTotal(finalDealer);

      if (trainingModeRef.current === 'basic' && (playerTotal === 21 || dealerTotal === 21)) {
        setGamePhase('betting');
      } else if (playerTotal === 21 && dealerTotal === 21) {
        setStatusMessage('Push! Both Blackjack!');
        setGamePhase('pausing');
        setTimeout(() => {
          if (handIdRef.current !== handId) return;
          setStatusMessage('');
          resolveRound(finalPlayer, finalDealer, betAmount);
          setGamePhase('result');
        }, 1500);
      } else if (dealerTotal === 21) {
        setStatusMessage('Dealer Blackjack!');
        playSound('bust');
        setPlayerTurn(false);
        setGamePhase('pausing');
        setTimeout(() => {
          if (handIdRef.current !== handId) return;
          setStatusMessage('');
          resolveRound(finalPlayer, finalDealer, betAmount);
          setGamePhase('result');
        }, 1500);
      } else if (playerTotal === 21) {
        setStatusMessage('Blackjack!');
        playSound('win');
        setPlayerTurn(false);
        setGamePhase('pausing');
        setTimeout(() => {
          if (handIdRef.current !== handId) return;
          setStatusMessage('');
          resolveRound(finalPlayer, finalDealer, betAmount);
          setGamePhase('result');
        }, 1500);
      } else {
        setGamePhase('player');
        if (trainingModeRef.current === 'basic') {
          const canSplitNow = finalPlayer[0].value === finalPlayer[1].value;
          setExpectedAction(getBasicStrategyAction(finalPlayer, finalDealer[1], true, canSplitNow, true));
        }
      }
    }, 2600);
  }, [deck, setDeck, setDealerHand, setPlayerHand, setPlayerTurn, setBankroll, resolveRound,
      practiceHardHands, practiceSoftHands, practicePairs, testHand]);

  dealCardsRef.current = dealCards;

  const handleActionValidation = useCallback((action) => {
    if (trainingModeRef.current !== 'basic' || !expectedAction) return;
    const isCorrect = action === expectedAction;
    playSound(isCorrect ? 'win' : 'bust');
    const next = { total: strategyStatsRef.current.total + 1, correct: strategyStatsRef.current.correct + (isCorrect ? 1 : 0) };
    strategyStatsRef.current = next;
    setStrategyStats(next);
    onRoundEnd?.({
      bankroll: bankrollRef.current,
      stats: statsRef.current,
      trainingStats: {
        trainingHands: initialTrainingRef.current.hands + next.total,
        trainingCorrect: initialTrainingRef.current.correct + next.correct,
      },
    });
    setTrainingFeedback({ correct: isCorrect, expected: expectedAction });
    setGamePhase('training-result');
  }, [expectedAction, onRoundEnd]);

  const handleDouble = useCallback(() => {
    if (playerHand.length !== 2 || (trainingModeRef.current !== 'basic' && currentBet > bankroll) || deck.length === 0) return;
    handleActionValidation('double');
    if (trainingModeRef.current === 'basic') return;
    setBankroll(prev => prev - currentBet);
    setCurrentBet(prev => prev * 2);
    const { updatedHand, updatedDeck } = drawCard({ hand: playerHand, deck });
    playSound('draw');
    setTimeout(() => { setPlayerHand(updatedHand); setDeck(updatedDeck); }, 500);
    setTimeout(() => setPlayerTurn(false), 1150);
  }, [playerHand, currentBet, bankroll, deck, setBankroll, setCurrentBet, setPlayerHand, setDeck, setPlayerTurn,
      handleActionValidation]);

  const handleSplit = useCallback(() => {
    const isAlreadySplit = splitHand2.length > 0 || splitHand1Completed.length > 0;
    if (
      playerHand.length !== 2 ||
      playerHand[0]?.value !== playerHand[1]?.value ||
      isAlreadySplit ||
      deck.length < 2 ||
      (trainingModeRef.current !== 'basic' && currentBet > bankroll)
    ) return;
    handleActionValidation('split');
    if (trainingModeRef.current === 'basic') return;
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
      handleActionValidation]);

  const handleResign = useCallback(() => {
    if (playerHand.length !== 2 || splitHand2.length > 0 || splitHand1Completed.length > 0) return;
    handleActionValidation('resign');
    if (trainingModeRef.current === 'basic') return;

    const handId = handIdRef.current;
    const dealerTotal = getHandTotal(dealerHand);
    const dealerHasBJ = dealerHand.length === 2 && dealerTotal === 21;

    if (!earlyResign && dealerHasBJ) {
      gameTransitionRef.current = true;
      setPlayerTurn(false);
      setStatusMessage('Dealer Blackjack!');
      playSound('bust');
      const ph = playerHand.slice();
      const dh = dealerHand.slice();
      setTimeout(() => {
        if (handIdRef.current !== handId) return;
        setStatusMessage('');
        resolveRound(ph, dh);
        setGamePhase('result');
      }, 1500);
    } else {
      gameTransitionRef.current = true;
      const halfBet = Math.floor(currentBet / 2);
      setBankroll(prev => prev + halfBet);
      setPlayerTurn(false);
      setStatusMessage('Resigned!');
      playSound('bust');
      const lostAmount = currentBet - halfBet;
      setTimeout(() => {
        if (handIdRef.current !== handId) return;
        setStatusMessage('');
        setWinner('House Wins');
        setResultMessage('Resigned');
        setResultAmount(lostAmount);
        const incomeDelta = -lostAmount;
        setStats(prev => {
          const next = {
            hands: prev.hands + 1,
            wins: prev.wins,
            losses: prev.losses + 1,
            pushes: prev.pushes,
            totalIncome: prev.totalIncome + incomeDelta,
            blackjacks: prev.blackjacks,
          };
          const s = strategyStatsRef.current;
          const trainingStats = trainingModeRef.current === 'basic' ? {
            trainingHands: initialTrainingRef.current.hands + s.total,
            trainingCorrect: initialTrainingRef.current.correct + s.correct,
          } : undefined;
          onRoundEnd?.({ bankroll: bankrollRef.current + halfBet, stats: next, trainingStats });
          return next;
        });
        setGamePhase('result');
      }, 1500);
    }
  }, [playerHand, splitHand2, splitHand1Completed, dealerHand, currentBet, earlyResign,
      setBankroll, setPlayerTurn, resolveRound, handleActionValidation, onRoundEnd]);

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
    if (bankroll < 10) {
      setBankroll(1000);
      setLastBetAmount(0);
      onReset?.();
    }
    setGamePhase('betting');
  }, [setPlayerHand, setDealerHand, setPlayerTurn, setCurrentBet, bankroll, onReset]);

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
    setStats({ hands: 0, wins: 0, losses: 0, pushes: 0, totalIncome: 0, blackjacks: 0 });
    setStrategyStats({ total: 0, correct: 0 });
    setExpectedAction(null);
    setActionFeedback(null);
    onMenuClose?.();
    setGamePhase('betting');
    onReset?.();
  }, [setBankroll, setPlayerHand, setDealerHand, setPlayerTurn, setCurrentBet, onMenuClose, onReset]);

  // ── Main game effect: bust detection + dealer auto-play ─────────────────────

  useEffect(() => {
    if (playerHand.length === 0 || dealerHand.length === 0) return;
    if (gameTransitionRef.current) return;
    if (gamePhase === 'training-result') return;
    const handId = handIdRef.current;

    if (gamePhase === 'player' && !playerTurn) {
      if (splitHand2.length > 0) {
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
          gameTransitionRef.current = true;
          const ph = playerHand.slice();
          const dh = dealerHand.slice();
          const isInSplitHand2 = splitHand1Completed.length > 0;
          setTimeout(() => {
            if (handIdRef.current !== handId) return;
            setStatusMessage('Bust!');
            playSound('bust');
            setTimeout(() => {
              if (handIdRef.current !== handId) return;
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

        setTimeout(() => {
          if (handIdRef.current !== handId) return;
          setPlayerTurn(false);
          setStatusMessage('Bust!');
          playSound('bust');
          setTimeout(() => {
            if (handIdRef.current !== handId) return;
            setStatusMessage('');
            if (isSplitHand1) {
              setSplitHand1Completed(ph);
              setSplitHand1Bet(bet1Snap);
              setCurrentBet(splitBetSnap);
              setPlayerHand(hand2Snap);
              setSplitHand2([]);
              setPlayerTurn(true);
              gameTransitionRef.current = false;
            } else if (isInSplitHand2) {
              gameTransitionRef.current = false;
              setGamePhase('dealer');
            } else {
              resolveRound(ph, dh);
              setGamePhase('result');
            }
          }, 1500);
        }, 650);

      } else if (playerTotal === 21) {
        const isInSplit = splitHand2.length > 0 || splitHand1Completed.length > 0;
        if (playerHand.length === 2 && !isInSplit) {
          gameTransitionRef.current = true;
          setPlayerTurn(false);
          const ph = playerHand.slice();
          const dh = dealerHand.slice();
          setStatusMessage('Blackjack!');
          setTimeout(() => {
            if (handIdRef.current !== handId) return;
            setStatusMessage('');
            resolveRound(ph, dh);
            setGamePhase('result');
          }, 1500);
        } else {
          setTimeout(() => { if (handIdRef.current !== handId) return; setPlayerTurn(false); }, 650);
        }
      }
      return;
    }

    if (gamePhase === 'dealer') {
      const dealerTotal = getHandTotal(dealerHand);
      if (dealerTotal < 17 && deck.length > 0) {
        const { updatedHand, updatedDeck } = drawCard({ hand: dealerHand, deck });
        const timeout = setTimeout(() => {
          if (handIdRef.current !== handId) return;
          playSound('draw');
          setDealerHand(updatedHand);
          setDeck(updatedDeck);
        }, 1000);
        return () => clearTimeout(timeout);
      } else {
        gameTransitionRef.current = true;
        const ph = playerHand.slice();
        const dh = dealerHand.slice();
        const ph1 = splitHand1Completed.slice();
        const bet2 = currentBet;
        const bet1 = splitHand1Bet;

        setTimeout(() => {
          if (handIdRef.current !== handId) return;
          if (ph1.length > 0) {
            const result1 = checkWinner({ playerHand: ph1, dealerHand: dh });
            const result2 = checkWinner({ playerHand: ph, dealerHand: dh });
            let splitDelta = 0;
            if (trainingModeRef.current !== 'basic') {
              if (result1 === 'Player Wins') { setBankroll(prev => prev + bet1 * 2); splitDelta += bet1 * 2; }
              else if (result1 === 'Push') { setBankroll(prev => prev + bet1); splitDelta += bet1; }
              if (result2 === 'Player Wins') { setBankroll(prev => prev + bet2 * 2); splitDelta += bet2 * 2; }
              else if (result2 === 'Push') { setBankroll(prev => prev + bet2); splitDelta += bet2; }
            }
            const splitIncomeDelta = trainingModeRef.current !== 'basic' ? splitDelta - (bet1 + bet2) : 0;
            setStats(prev => {
              const next = {
                hands: prev.hands + 2,
                wins: prev.wins + (result1 === 'Player Wins' ? 1 : 0) + (result2 === 'Player Wins' ? 1 : 0),
                losses: prev.losses + (result1 === 'House Wins' ? 1 : 0) + (result2 === 'House Wins' ? 1 : 0),
                pushes: prev.pushes + (result1 === 'Push' ? 1 : 0) + (result2 === 'Push' ? 1 : 0),
                totalIncome: prev.totalIncome + splitIncomeDelta,
                blackjacks: prev.blackjacks,
              };
              const s = strategyStatsRef.current;
              const trainingStats = trainingModeRef.current === 'basic' ? {
                trainingHands: initialTrainingRef.current.hands + s.total,
                trainingCorrect: initialTrainingRef.current.correct + s.correct,
              } : undefined;
              onRoundEnd?.({ bankroll: bankrollRef.current + splitDelta, stats: next, trainingStats });
              return next;
            });
            setSplitResults({ result1, result2, amount1: bet1, amount2: bet2 });
            setTimeout(() => { if (handIdRef.current !== handId) return; setGamePhase('result'); }, 600);
          } else {
            if (dealerTotal > 21) {
              setStatusMessage('Dealer Busts!');
              playSound('win');
            } else {
              const result = checkWinner({ playerHand: ph, dealerHand: dh });
              if (result === 'Player Wins') { setStatusMessage('You Win!'); playSound('win'); }
              else if (result === 'House Wins') { setStatusMessage('Dealer Wins!'); playSound('bust'); }
              else { setStatusMessage('Push!'); playSound('push'); }
            }
            setTimeout(() => {
              if (handIdRef.current !== handId) return;
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
      splitHand2, splitHand1Completed, splitBet, splitHand1Bet, currentBet, onRoundEnd]);

  // ── Hotkeys ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyPress = (event) => {
      if (gamePhase !== 'player') return;
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
      const key = event.key.toLowerCase();
      switch (key) {
        case 'w':
          if (deck.length > 0) {
            handleActionValidation('hit');
            playSound('draw');
            if (trainingModeRef.current !== 'basic') {
              const { updatedHand, updatedDeck } = drawCard({ hand: playerHand, deck });
              setTimeout(() => { setPlayerHand(updatedHand); setDeck(updatedDeck); }, 500);
            }
          }
          break;
        case 's':
          handleActionValidation('stand');
          if (trainingModeRef.current !== 'basic') setPlayerTurn(false);
          break;
        case 'd': handleDouble(); break;
        case 'a': handleSplit(); break;
        case 'r': handleResign(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gamePhase, playerHand, deck, handleDouble, handleSplit, handleResign, setPlayerHand, setDeck, setPlayerTurn, handleActionValidation]);

  // ── Auto-advance training-result after 1.8s ──────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'training-result') return;
    const handId = handIdRef.current;
    const t = setTimeout(() => {
      if (handIdRef.current !== handId) return;
      cancelHand();
    }, 1800);
    return () => clearTimeout(t);
  }, [gamePhase, cancelHand]);

  // ── Auto-deal next hand in training mode ─────────────────────────────────────

  useEffect(() => {
    if (trainingMode !== 'basic' || gamePhase !== 'betting' || trainingSetup) return;
    const t = setTimeout(() => {
      if (trainingModeRef.current !== 'basic') return;
      dealCardsRef.current?.(lastBetAmount || 10);
    }, 350);
    return () => clearTimeout(t);
  }, [trainingMode, gamePhase, lastBetAmount, trainingSetup]);

  // ── Derived values ───────────────────────────────────────────────────────────

  const isSplitActive  = splitHand2.length > 0 || splitHand1Completed.length > 0;
  const isOutOfMoney   = gamePhase === 'betting' && bankroll < 10;
  const hasSplitPair   = playerHand.length === 2 && playerHand[0]?.value === playerHand[1]?.value && splitHand2.length === 0 && splitHand1Completed.length === 0;
  const canSplit       = hasSplitPair && currentBet <= bankroll;
  const canDouble      = playerHand.length === 2 && currentBet <= bankroll;
  const canResign      = playerHand.length === 2 && splitHand2.length === 0 && splitHand1Completed.length === 0;

  return {
    // State
    gamePhase, winner, resultAmount, resultMessage, statusMessage, lastBetAmount,
    stats, strategyStats, expectedAction, actionFeedback, trainingFeedback,
    splitHand2, splitHand1Completed, splitBet, splitHand1Bet, splitResults,
    // DeckContext values (re-exported for convenience)
    playerHand, dealerHand, bankroll, currentBet,
    // Derived
    isSplitActive, isOutOfMoney, hasSplitPair, canSplit, canDouble, canResign,
    // Handlers
    dealCards, cancelHand, handleDouble, handleSplit, handleResign,
    handleReset, handleResultsClose, handleActionValidation,
  };
}
