'use client'
import { useEffect, useState } from 'react';

export default function Card({ card, isFaceDown = false }) {
  const [isFlipping, setIsFlipping] = useState(true);
  const displayValue = card.value === 1 ? 'A' : card.value;
  const isRedSuit = card.suit === '♥' || card.suit === '♦';

  useEffect(() => {
    setIsFlipping(true);
    const timer = setTimeout(() => setIsFlipping(false), 600);
    return () => clearTimeout(timer);
  }, [card.value, card.suit]);

  if (isFaceDown) {
    return (
      <span className={`card card-face-down ${isFlipping ? 'card-flip' : ''}`}>
        <span className="card-corner">
          <span className="card-corner-value">?</span>
        </span>
      </span>
    );
  }

  return (
    <span className={`card ${isRedSuit ? 'card-red' : ''} ${isFlipping ? 'card-flip' : ''}`}>
      <span className="card-corner">
        <span className="card-corner-value">{displayValue}</span>
        <span className="card-corner-suit">{card.suit}</span>
      </span>
      <span className="card-center-suit">{card.suit}</span>
      <span className="card-corner card-corner-bottom">
        <span className="card-corner-value">{displayValue}</span>
        <span className="card-corner-suit">{card.suit}</span>
      </span>
    </span>
  );
}
