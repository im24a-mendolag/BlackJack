'use client'
import { useState, useEffect } from 'react';
import { useDeck } from '../context/DeckContext';
import './BettingPanel.css';

const QUICK_BETS = [10, 25, 100, 500];

export default function BettingPanel({ onDeal, defaultBet = 0 }) {
  const { bankroll, setCurrentBet } = useDeck();
  const [betAmount, setBetAmount] = useState(() => defaultBet <= bankroll ? defaultBet : 0);

  const handleQuickBet = (amount) => {
    if (betAmount + amount <= bankroll) {
      setBetAmount(prev => prev + amount);
    }
  };

  const handleClear = () => setBetAmount(0);

  const handleDeal = () => {
    if (betAmount > 0 && betAmount <= bankroll) {
      setCurrentBet(betAmount);
      onDeal(betAmount);
      setBetAmount(0);
    }
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === 'Space') { e.preventDefault(); handleDeal(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [betAmount, bankroll]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="betting-panel">
      <div className="betting-row">
        <div className="chip-row">
          {QUICK_BETS.map((amount) => (
            <button
              key={amount}
              className="chip-button"
              onClick={() => handleQuickBet(amount)}
              disabled={betAmount + amount > bankroll}
            >
              ${amount}
            </button>
          ))}
        </div>

        <div className="bet-display">
          Bet: <span className="bet-amount">${betAmount}</span>
        </div>

        <button
          className="clear-btn"
          onClick={handleClear}
          disabled={betAmount === 0}
        >
          Clear
        </button>
      </div>

      <div className="betting-row betting-row-actions">
        <button
          className="deal-btn"
          onClick={handleDeal}
          disabled={betAmount === 0 || betAmount > bankroll}
        >
          Deal →
        </button>
      </div>
    </div>
  );
}
