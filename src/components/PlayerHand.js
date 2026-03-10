'use client'
import Card from './Card';
import getHandTotal from '../logic/getHandTotal';

export default function PlayerHand({ hand, label, isActive }) {
  const displayHand = hand.length === 0
    ? [{ value: '', suit: '' }, { value: '', suit: '' }]
    : hand;

  const playerTotal = hand.length > 0 ? getHandTotal(hand) : null;
  const isLabelled = label != null;

  return (
    <div className={`hand-section${isLabelled && !isActive ? ' hand-section-inactive' : ''}`}>
      <div className="cards-row">
        {displayHand.map((c, index) => (
          <div
            key={`${c.value}-${c.suit}-${index}`}
            style={{ visibility: hand.length === 0 ? 'hidden' : 'visible' }}
          >
            <Card card={c} />
          </div>
        ))}
      </div>
      <div className="hand-label">
        <span>{isLabelled ? label : 'Player'}</span>
        {playerTotal != null && (
          <span className={`hand-total${playerTotal > 21 ? ' hand-total-bust' : ''}`}>
            {playerTotal}
          </span>
        )}
        {isLabelled && isActive && <span className="hand-active-dot">●</span>}
      </div>
    </div>
  );
}
