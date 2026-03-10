'use client'
import React, { useEffect, useCallback, useState, useRef } from "react";
import { DeckContext } from "./context/DeckContext";
import PlayerHand from './components/PlayerHand';
import DealerHand from './components/DealerHand';
import PlayerActions from "./components/PlayerActions";
import BettingPanel from "./components/BettingPanel";
import ResultPanel from "./components/ResultPanel";
import StatusBanner from "./components/StatusBanner";
import checkWinner from "./logic/checkWinner";
import getHandTotal from "./logic/getHandTotal";
import drawCard from "./logic/drawCard";

// gamePhase values: 'betting' | 'dealing' | 'player' | 'dealer' | 'pausing' | 'result'

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

  // Split state
  const [splitHand2, setSplitHand2] = useState([]);                   // second hand (waiting to be played)
  const [splitHand1Completed, setSplitHand1Completed] = useState([]); // first hand (done)
  const [splitBet, setSplitBet] = useState(0);                        // original bet when split was made
  const [splitHand1Bet, setSplitHand1Bet] = useState(0);              // actual bet for hand 1 (may be doubled)
  const [splitResults, setSplitResults] = useState(null);             // {result1, result2, amount1, amount2}

  // Prevents the game effect from re-entering during banner pauses.
  const gameTransitionRef = useRef(false);

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
    if (result === 'Player Wins') {
      setBankroll(prev => prev + amount * 2);
      setResultAmount(amount);
    } else if (result === 'House Wins') {
      setResultAmount(amount);
    } else {
      setBankroll(prev => prev + amount);
      setResultAmount(0);
    }
    setResultMessage(result);
    return result;
  }, [currentBet, setBankroll]);

  const dealCards = useCallback((betAmount) => {
    gameTransitionRef.current = false;
    setLastBetAmount(betAmount);
    setBankroll(prev => prev - betAmount);
    setPlayerTurn(true);
    setGamePhase('dealing');
    setWinner(null);
    setStatusMessage('');

    const c0 = deck[0], c1 = deck[1], c2 = deck[2], c3 = deck[3];

    setTimeout(() => setPlayerHand([c0]), 500);
    setTimeout(() => setDealerHand([c1]), 1000);
    setTimeout(() => setPlayerHand([c0, c2]), 1500);
    setTimeout(() => {
      const finalPlayer = [c0, c2];
      const finalDealer = [c1, c3];
      setDealerHand(finalDealer);
      setDeck(prev => prev.slice(4));

      const playerTotal = getHandTotal(finalPlayer);
      const dealerTotal = getHandTotal(finalDealer);

      if (playerTotal === 21 && dealerTotal === 21) {
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
      }
    }, 2000);
  }, [deck, setDeck, setDealerHand, setPlayerHand, setPlayerTurn, setBankroll, resolveRound]);

  const handleDouble = useCallback(() => {
    if (playerHand.length !== 2 || currentBet > bankroll || deck.length === 0) return;
    setBankroll(prev => prev - currentBet);
    setCurrentBet(prev => prev * 2);
    const { updatedHand, updatedDeck } = drawCard({ hand: playerHand, deck });
    setTimeout(() => {
      setPlayerHand(updatedHand);
      setDeck(updatedDeck);
      setPlayerTurn(false);
    }, 500);
  }, [playerHand, currentBet, bankroll, deck, setBankroll, setCurrentBet, setPlayerHand, setDeck, setPlayerTurn]);

  const handleSplit = useCallback(() => {
    const isAlreadySplit = splitHand2.length > 0 || splitHand1Completed.length > 0;
    if (
      playerHand.length !== 2 ||
      playerHand[0]?.value !== playerHand[1]?.value ||
      isAlreadySplit ||
      deck.length < 2 ||
      currentBet > bankroll
    ) return;

    const [card1, card2] = playerHand;
    const newCard1 = deck[0];
    const newCard2 = deck[1];
    setBankroll(prev => prev - currentBet);
    setSplitBet(currentBet);
    setDeck(prev => prev.slice(2));
    setPlayerHand([card1, newCard1]);
    setSplitHand2([card2, newCard2]);
  }, [playerHand, splitHand2, splitHand1Completed, currentBet, bankroll, deck, setBankroll, setDeck, setPlayerHand]);

  // Game logic: player bust/21 detection + dealer auto-play
  useEffect(() => {
    if (playerHand.length === 0 || dealerHand.length === 0) return;
    if (gameTransitionRef.current) return;

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
        setPlayerTurn(false);
        const ph = playerHand.slice();
        const dh = dealerHand.slice();
        const isSplitHand1 = splitHand2.length > 0;
        const isInSplitHand2 = splitHand1Completed.length > 0;
        const hand2Snap = splitHand2.slice();
        const bet1Snap = currentBet;
        const splitBetSnap = splitBet;

        setTimeout(() => {
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
        }, 600);

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
          // Hit/split to 21: auto-stand
          setPlayerTurn(false);
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
            if (result1 === 'Player Wins') setBankroll(prev => prev + bet1 * 2);
            else if (result1 === 'Push') setBankroll(prev => prev + bet1);
            if (result2 === 'Player Wins') setBankroll(prev => prev + bet2 * 2);
            else if (result2 === 'Push') setBankroll(prev => prev + bet2);
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
      splitHand2, splitHand1Completed, splitBet, splitHand1Bet, currentBet]);

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

  const canSplit = (
    playerHand.length === 2 &&
    playerHand[0]?.value === playerHand[1]?.value &&
    splitHand2.length === 0 &&
    splitHand1Completed.length === 0 &&
    currentBet <= bankroll
  );
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
            const { updatedHand, updatedDeck } = drawCard({ hand: playerHand, deck });
            setTimeout(() => {
              setPlayerHand(updatedHand);
              setDeck(updatedDeck);
            }, 500);
          }
          break;
        case 's':
          setPlayerTurn(false);
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
  }, [gamePhase, playerHand, deck, handleDouble, handleSplit, setPlayerHand, setDeck, setPlayerTurn]);

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
    setGamePhase('betting');
  }, [setBankroll, setPlayerHand, setDealerHand, setPlayerTurn, setCurrentBet]);

  const isSplitActive = splitHand2.length > 0 || splitHand1Completed.length > 0;
  const isOutOfMoney = gamePhase === 'betting' && bankroll < 10;

  return (
    <div className="game-table">
      <header className="game-header">
        <span className="game-title">Blackjack</span>
        <div className="game-hud">
          <span className="hud-item">Bankroll: ${bankroll}</span>
          {currentBet > 0 && <span className="hud-item hud-bet">Bet: ${currentBet}</span>}
        </div>
      </header>

      <div className="table-area">
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
        {gamePhase === 'betting' && (
          <BettingPanel onDeal={dealCards} defaultBet={lastBetAmount} />
        )}
        {gamePhase === 'player' && !statusMessage && (
          <PlayerActions
            canSplit={canSplit}
            canDouble={canDouble}
            onDouble={handleDouble}
            onSplit={handleSplit}
          />
        )}
        {gamePhase === 'result' && (
          <ResultPanel
            result={resultMessage}
            amount={resultAmount}
            splitResults={splitResults}
            onNext={handleResultsClose}
          />
        )}
        {(gamePhase === 'dealing' || gamePhase === 'dealer' || gamePhase === 'pausing' || (gamePhase === 'player' && statusMessage)) && (
          <div className="waiting-indicator">
            <span className="waiting-dots">• • •</span>
          </div>
        )}
      </div>
      {isOutOfMoney && (
        <div className="broke-overlay">
          <div className="broke-modal">
            <h2 className="broke-title">You're broke!</h2>
            <p className="broke-subtitle">Not enough to place a bet.</p>
            <button className="broke-reset-btn" onClick={handleReset}>
              Reset — $1000
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
