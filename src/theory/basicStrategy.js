// Multi-deck S17 Basic Strategy
// Dealer upcard columns: [2, 3, 4, 5, 6, 7, 8, 9, 10, A] → indices 0–9

export const HARD = {
   5: ['H','H','H','H','H','H','H','H','H','H'],
   6: ['H','H','H','H','H','H','H','H','H','H'],
   7: ['H','H','H','H','H','H','H','H','H','H'],
   8: ['H','H','H','H','H','H','H','H','H','H'],
   9: ['H','D','D','D','D','H','H','H','H','H'],
  10: ['D','D','D','D','D','D','D','D','H','H'],
  11: ['D','D','D','D','D','D','D','D','D','H'],
  12: ['H','H','S','S','S','H','H','H','H','H'],
  13: ['S','S','S','S','S','H','H','H','H','H'],
  14: ['S','S','S','S','S','H','H','H','H','H'],
  15: ['S','S','S','S','S','H','H','H','Rh','H'],
  16: ['S','S','S','S','S','H','H','Rh','Rh','Rh'],
  17: ['S','S','S','S','S','S','S','S','S','S'],
  // 18–21: always stand (handled in function)
};

// Key = non-Ace pip value (2 = soft 13 … 9 = soft 20)
export const SOFT = {
  2: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  3: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  4: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  5: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  6: ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  7: ['DS','DS','DS','DS','DS','S', 'S', 'H', 'H', 'H'], // soft 18
  8: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'], // soft 19
  9: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'], // soft 20
};

// Key = raw card.value string. Face cards normalize to '10' before lookup.
export const PAIRS = {
  'A':  ['P','P','P','P','P','P','P','P','P','P'],
  '2':  ['P','P','P','P','P','P','H','H','H','H'],
  '3':  ['P','P','P','P','P','P','H','H','H','H'],
  '4':  ['H','H','H','P','P','H','H','H','H','H'],
  '5':  ['D','D','D','D','D','D','D','D','H','H'], // treat as hard 10
  '6':  ['P','P','P','P','P','H','H','H','H','H'],
  '7':  ['P','P','P','P','P','P','H','H','H','H'],
  '8':  ['P','P','P','P','P','P','P','P','P','P'],
  '9':  ['P','P','P','P','P','S','P','P','S','S'],
  '10': ['S','S','S','S','S','S','S','S','S','S'],
};

function dealerCol(dealerUpcard) {
  const v = String(dealerUpcard.value);
  if (v === 'A') return 9;
  if (['J', 'Q', 'K', '10'].includes(v)) return 8;
  return Number(v) - 2; // 2→0, 3→1, … 9→7
}

function resolveCode(code, canDouble, canSplit, canResign) {
  if (code === 'P')  return canSplit  ? 'split'  : 'hit';
  if (code === 'Rh') return canResign ? 'resign' : 'hit';
  if (code === 'D')  return canDouble ? 'double' : 'hit';
  if (code === 'DS') return canDouble ? 'double' : 'stand';
  if (code === 'S')  return 'stand';
  return 'hit'; // 'H'
}

const normFace = (v) => ['J', 'Q', 'K'].includes(String(v)) ? '10' : String(v);

export function getBasicStrategyAction(playerHand, dealerUpcard, canDouble, canSplit, canResign = false) {
  const col = dealerCol(dealerUpcard);

  // --- Pairs (only on 2-card hand when split is available) ---
  if (playerHand.length === 2 && canSplit) {
    const v0 = normFace(playerHand[0].value);
    const v1 = normFace(playerHand[1].value);
    if (v0 === v1 && PAIRS[v0]) {
      return resolveCode(PAIRS[v0][col], canDouble, canSplit, canResign);
    }
  }

  // --- Soft hand (live Ace still string 'A') on 2-card hand ---
  const hasLiveAce = playerHand.some(c => c.value === 'A');
  if (hasLiveAce && playerHand.length === 2) {
    const nonAce = playerHand.find(c => c.value !== 'A');
    if (nonAce) {
      const pip = ['J', 'Q', 'K'].includes(String(nonAce.value)) ? 10 : Number(nonAce.value);
      if (pip <= 9 && SOFT[pip]) {
        return resolveCode(SOFT[pip][col], canDouble, canSplit, canResign);
      }
    }
  }

  // --- Hard hand ---
  let total = 0;
  let liveAces = 0;
  for (const c of playerHand) {
    if (c.value === 'A') { total += 11; liveAces++; }
    else if (['J', 'Q', 'K'].includes(String(c.value))) total += 10;
    else total += Number(c.value);
  }
  while (total > 21 && liveAces > 0) { total -= 10; liveAces--; }

  if (total >= 18) return 'stand';
  const row = HARD[Math.max(5, Math.min(17, total))];
  return resolveCode(row[col], canDouble, canSplit, canResign);
}
