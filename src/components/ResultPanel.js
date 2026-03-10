'use client'
import { useEffect } from 'react';
import './ResultPanel.css';

function SplitHandResult({ label, result, amount }) {
  const isWin = result === 'Player Wins';
  const isLoss = result === 'House Wins';
  return (
    <div className="split-result-col">
      <span className="split-hand-label">{label}</span>
      <span className={`split-result-outcome ${isWin ? 'result-win' : isLoss ? 'result-loss' : 'result-push'}`}>
        {isWin ? 'Win' : isLoss ? 'Lose' : 'Push'}
      </span>
      <span className="split-result-amount">
        {isWin && <span className="amount-win">+${amount}</span>}
        {isLoss && <span className="amount-loss">-${amount}</span>}
        {!isWin && !isLoss && <span className="amount-push">Returned</span>}
      </span>
    </div>
  );
}

export default function ResultPanel({ result, amount, splitResults, onNext }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === 'Space') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onNext]);

  if (splitResults) {
    const { result1, result2, amount1, amount2 } = splitResults;
    return (
      <div className="result-panel">
        <div className="split-results-row">
          <SplitHandResult label="Hand 1" result={result1} amount={amount1} />
          <div className="split-divider" />
          <SplitHandResult label="Hand 2" result={result2} amount={amount2} />
        </div>
        <button className="next-hand-btn" onClick={onNext}>Next Hand →</button>
      </div>
    );
  }

  const isWin = result === 'Player Wins';
  const isLoss = result === 'House Wins';
  const isPush = result === 'Push';

  return (
    <div className="result-panel">
      <h2 className={isWin ? 'result-win' : isLoss ? 'result-loss' : 'result-push'}>
        {isWin && 'You Win!'}
        {isLoss && 'You Lose'}
        {isPush && 'Push'}
      </h2>
      <div className="result-amount">
        {isWin && <span className="amount-win">+${amount}</span>}
        {isLoss && <span className="amount-loss">-${amount}</span>}
        {isPush && <span className="amount-push">Bet returned</span>}
      </div>
      <button className="next-hand-btn" onClick={onNext}>Next Hand →</button>
    </div>
  );
}
