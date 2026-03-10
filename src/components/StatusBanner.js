'use client'

const MESSAGE_COLORS = {
  'Blackjack!': '#ffd700',
  'Dealer Blackjack!': '#ff9800',
  'Bust!': '#f44336',
  'Dealer Busts!': '#4caf50',
  'Push! Both Blackjack!': '#9e9e9e',
  'You Win!': '#4caf50',
  'Dealer Wins!': '#f44336',
  'Push!': '#9e9e9e',
};

export default function StatusBanner({ message }) {
  const color = MESSAGE_COLORS[message] || '#fff';
  return (
    <div className="status-banner" style={{ color }}>
      {message}
    </div>
  );
}
