// Custom Next.js + WebSocket server
// Runs the Next.js app AND the multiplayer WebSocket game server on the same port.

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// ── Deck helpers ──────────────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RESHUFFLE_THRESHOLD = Math.floor(4 * 52 * 0.25); // 52 cards

function createShoe() {
  const deck = [];
  for (let i = 0; i < 4; i++)
    for (const suit of SUITS)
      for (const value of VALUES)
        deck.push({ suit, value });
  return deck.sort(() => Math.random() - 0.5);
}

function getHandTotal(hand) {
  let total = 0, aces = 0;
  for (const card of hand) {
    if (card.value === 'A') { total += 11; aces++; }
    else if (['J', 'Q', 'K'].includes(card.value)) total += 10;
    else total += parseInt(card.value, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function checkWinner(playerHand, dealerHand) {
  const pt = getHandTotal(playerHand);
  const dt = getHandTotal(dealerHand);
  if (pt > 21) return 'House Wins';
  if (dt > 21) return 'Player Wins';
  if (pt > dt) return 'Player Wins';
  if (dt > pt) return 'House Wins';
  return 'Push';
}

// ── Lobby / player state ──────────────────────────────────────────────────────

const lobbies = new Map();      // code → lobby
const playerLobbies = new Map(); // wsId → code
let wsIdCounter = 0;

function makePlayer(ws, name) {
  return {
    id: ws._id,
    name: (name || 'Player').slice(0, 20),
    bankroll: 1000,
    bet: 0,
    hand: [],
    splitHand: null,      // second hand (waiting) after split
    hand1Completed: null, // first hand (done) after split
    hand1Bet: 0,
    splitBet: 0,
    handStatus: 'betting', // betting | waiting | acting | stood | busted | done
    result: null,
    splitResult: null,
    resultAmount: 0,
    splitResultAmount: 0,
    ws,
  };
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (lobbies.has(code));
  return code;
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(lobby, msg) {
  const str = JSON.stringify(msg);
  for (const p of lobby.players)
    if (p.ws.readyState === 1) p.ws.send(str);
}

// Strip server-only fields (ws) before sending to clients.
// Each client also gets a personalised view: their own hole cards etc.
function publicLobby(lobby) {
  return {
    code: lobby.code,
    status: lobby.status,
    hostId: lobby.hostId,
    players: lobby.players.map(p => ({
      id: p.id,
      name: p.name,
      bankroll: p.bankroll,
      bet: p.bet,
      hand: p.hand,
      splitHand: p.splitHand,
      hand1Completed: p.hand1Completed,
      hand1Bet: p.hand1Bet,
      splitBet: p.splitBet,
      handStatus: p.handStatus,
      result: p.result,
      splitResult: p.splitResult,
      resultAmount: p.resultAmount,
      splitResultAmount: p.splitResultAmount,
    })),
    dealerHand: lobby.dealerHand,
    dealerHoleHidden: lobby.dealerHoleHidden,
    currentPlayerIndex: lobby.currentPlayerIndex,
    round: lobby.round,
  };
}

// ── Turn / game flow ──────────────────────────────────────────────────────────
  
  // Turn order: left to right = lowest seat index first (0 → n-1)
function advanceToNextPlayer(lobby) {
  // Find the next player (higher seat index) who hasn't acted yet
  let next = lobby.currentPlayerIndex + 1;
  while (next < lobby.players.length) {
    const status = lobby.players[next].handStatus;
    if (status !== 'stood' && status !== 'busted' && status !== 'done') break;
    next++;
  }

  if (next >= lobby.players.length) {
    const allBusted = lobby.players.every(p => p.handStatus === 'busted');
    if (allBusted) {
      resolveRound(lobby);
    } else {
      startDealerPhase(lobby);
    }
  } else {
    lobby.currentPlayerIndex = next;
    lobby.players[next].handStatus = 'acting';
    broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });
  }
}

function startDealerPhase(lobby) {
  lobby.status = 'dealer';
  lobby.dealerHoleHidden = false;
  broadcast(lobby, { type: 'game:dealer-play', state: publicLobby(lobby) });
  dealerDraw(lobby);
}

function dealerDraw(lobby) {
  const total = getHandTotal(lobby.dealerHand);
  if (total < 17 && lobby.deck.length > 0) {
    setTimeout(() => {
      if (!lobbies.has(lobby.code)) return;
      lobby.dealerHand.push(lobby.deck.shift());
      broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });
      dealerDraw(lobby);
    }, 1000);
  } else {
    setTimeout(() => resolveRound(lobby), 600);
  }
}

function resolveRound(lobby) {
  if (!lobbies.has(lobby.code)) return;
  const dealerH = lobby.dealerHand;

  for (const player of lobby.players) {
    player.handStatus = 'done';

    if (player.hand1Completed && player.hand1Completed.length > 0) {
      // ── Split resolution ───────────────────────────────────────────────────
      const r1 = checkWinner(player.hand1Completed, dealerH);
      const r2 = checkWinner(player.hand, dealerH);

      let payout = 0;
      if (r1 === 'Player Wins') payout += player.hand1Bet * 2;
      else if (r1 === 'Push')   payout += player.hand1Bet;
      if (r2 === 'Player Wins') payout += player.bet * 2;
      else if (r2 === 'Push')   payout += player.bet;

      player.bankroll += payout;
      player.result = r1;
      player.resultAmount = player.hand1Bet;
      player.splitResult = r2;
      player.splitResultAmount = player.bet;

    } else {
      // ── Single hand resolution ─────────────────────────────────────────────
      const result = checkWinner(player.hand, dealerH);
      const isNaturalBJ = (
        result === 'Player Wins' &&
        player.hand.length === 2 &&
        getHandTotal(player.hand) === 21
      );

      let payout = 0;
      if (isNaturalBJ)              payout = Math.floor(player.bet * 2.5);
      else if (result === 'Player Wins') payout = player.bet * 2;
      else if (result === 'Push')        payout = player.bet;

      player.bankroll += payout;
      player.result = isNaturalBJ ? 'Blackjack!' : result;
      player.resultAmount = isNaturalBJ ? Math.floor(player.bet * 1.5) : player.bet;
    }
  }

  lobby.status = 'round-end';
  broadcast(lobby, { type: 'game:round-end', state: publicLobby(lobby) });

  // Auto-advance to next round after 5 s
  setTimeout(() => {
    if (!lobbies.has(lobby.code)) return;
    startNewRound(lobby);
  }, 5000);
}

function startNewRound(lobby) {
  if (lobby.deck.length < RESHUFFLE_THRESHOLD) lobby.deck = createShoe();

  for (const p of lobby.players) {
    p.bet = 0;
    p.hand = [];
    p.splitHand = null;
    p.hand1Completed = null;
    p.hand1Bet = 0;
    p.splitBet = 0;
    p.handStatus = 'betting';
    p.result = null;
    p.splitResult = null;
    p.resultAmount = 0;
    p.splitResultAmount = 0;
  }

  lobby.dealerHand = [];
  lobby.dealerHoleHidden = true;
  lobby.currentPlayerIndex = -1;
  lobby.status = 'betting';
  lobby.round += 1;

  broadcast(lobby, { type: 'game:new-round', state: publicLobby(lobby) });
}

function dealCards(lobby) {
  lobby.status = 'dealing';
  const n = lobby.players.length;

  // Deal right to left (highest index first), two passes
  for (let i = n - 1; i >= 0; i--) lobby.players[i].hand.push(lobby.deck.shift());
  lobby.dealerHand.push(lobby.deck.shift());          // dealer card 1 (shown)
  for (let i = n - 1; i >= 0; i--) lobby.players[i].hand.push(lobby.deck.shift());
  lobby.dealerHand.push(lobby.deck.shift());          // dealer card 2 (hole)

  const dealerTotal = getHandTotal(lobby.dealerHand);

  // All players set to waiting (bets locked in)
  for (const p of lobby.players) p.handStatus = 'waiting';

  if (dealerTotal === 21) {
    // Dealer blackjack — reveal hole card and end round immediately
    lobby.status = 'dealer';
    lobby.dealerHoleHidden = false;
    broadcast(lobby, { type: 'game:dealt', state: publicLobby(lobby) });
    setTimeout(() => resolveRound(lobby), 3000);
    return;
  }

  // Auto-stand players with natural blackjack
  for (const p of lobby.players) {
    if (getHandTotal(p.hand) === 21) p.handStatus = 'stood';
  }

  // Start player action phase with leftmost player who still needs to act
  lobby.status = 'playing';
  const firstActive = lobby.players.findIndex(p => p.handStatus === 'waiting');
  if (firstActive === -1) {
    // All players have blackjack — go straight to dealer
    lobby.currentPlayerIndex = -1;
    broadcast(lobby, { type: 'game:dealt', state: publicLobby(lobby) });
    setTimeout(() => startDealerPhase(lobby), 1500);
    return;
  }
  lobby.currentPlayerIndex = firstActive;
  lobby.players[firstActive].handStatus = 'acting';

  broadcast(lobby, { type: 'game:dealt', state: publicLobby(lobby) });
}

// ── Split / bust helpers used by action handlers ──────────────────────────────

function transitionToSplitHand2(player) {
  player.hand1Completed = [...player.hand];
  player.hand1Bet = player.bet;
  player.bet = player.splitBet;
  player.hand = [...player.splitHand];
  player.splitHand = null;
  player.handStatus = 'acting';
}

function handleBustOrComplete(lobby, player, status) {
  const hasSplitWaiting = player.splitHand && player.splitHand.length > 0;
  const isOnHand2 = player.hand1Completed && player.hand1Completed.length > 0;

  if (hasSplitWaiting) {
    // Hand 1 bust/21 → move to hand 2
    transitionToSplitHand2(player);
    broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });
  } else {
    // Hand 2 (or no split) → done
    player.handStatus = status; // 'stood' or 'busted'
    broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });
    setTimeout(() => advanceToNextPlayer(lobby), status === 'busted' ? 1200 : 300);
  }
}

// ── WebSocket message handler ─────────────────────────────────────────────────

function handleMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  const { type } = msg;

  // ── Lobby create ─────────────────────────────────────────────────────────
  if (type === 'lobby:create') {
    // Clean up any previous lobby membership
    const prevCode = playerLobbies.get(ws._id);
    if (prevCode) cleanupPlayerFromLobby(ws._id, prevCode);

    const code = generateCode();
    const player = makePlayer(ws, msg.name);
    const lobby = {
      code,
      hostId: ws._id,
      players: [player],
      status: 'waiting',
      deck: createShoe(),
      dealerHand: [],
      dealerHoleHidden: true,
      currentPlayerIndex: -1,
      round: 0,
    };
    lobbies.set(code, lobby);
    playerLobbies.set(ws._id, code);
    send(ws, { type: 'lobby:created', code, state: publicLobby(lobby), playerId: ws._id });
    return;
  }

  // ── Lobby join ────────────────────────────────────────────────────────────
  if (type === 'lobby:join') {
    const { code, name } = msg;
    const lobby = lobbies.get(code?.toUpperCase());
    if (!lobby) { send(ws, { type: 'error', message: 'Lobby not found.' }); return; }
    if (lobby.status !== 'waiting') { send(ws, { type: 'error', message: 'Game has already started.' }); return; }
    if (lobby.players.length >= 5) { send(ws, { type: 'error', message: 'Lobby is full (5/5).' }); return; }
    if (lobby.players.some(p => p.id === ws._id)) { send(ws, { type: 'error', message: 'Already in lobby.' }); return; }

    const prevCode = playerLobbies.get(ws._id);
    if (prevCode) cleanupPlayerFromLobby(ws._id, prevCode);

    const player = makePlayer(ws, name);
    lobby.players.push(player);
    playerLobbies.set(ws._id, code.toUpperCase());
    send(ws, { type: 'lobby:joined', code: lobby.code, state: publicLobby(lobby), playerId: ws._id });
    broadcast(lobby, { type: 'lobby:update', state: publicLobby(lobby) });
    return;
  }

  // ── Lobby start (host only) ───────────────────────────────────────────────
  if (type === 'lobby:start') {
    const code = playerLobbies.get(ws._id);
    const lobby = lobbies.get(code);
    if (!lobby) return;
    if (lobby.hostId !== ws._id) { send(ws, { type: 'error', message: 'Only the host can start.' }); return; }
    if (lobby.players.length < 2) { send(ws, { type: 'error', message: 'Need at least 2 players to start.' }); return; }
    if (lobby.status !== 'waiting') return;

    lobby.status = 'betting';
    lobby.round = 1;
    broadcast(lobby, { type: 'game:started', state: publicLobby(lobby) });
    return;
  }

  // ── All game actions require an active lobby ──────────────────────────────
  const code = playerLobbies.get(ws._id);
  const lobby = lobbies.get(code);
  if (!lobby) return;
  const player = lobby.players.find(p => p.id === ws._id);
  if (!player) return;

  // ── Bet ───────────────────────────────────────────────────────────────────
  if (type === 'player:bet') {
    if (lobby.status !== 'betting') return;
    if (player.handStatus !== 'betting') return;
    const amount = Math.floor(Number(msg.amount));
    if (!amount || amount <= 0 || amount > player.bankroll) {
      send(ws, { type: 'error', message: 'Invalid bet amount.' });
      return;
    }
    player.bet = amount;
    player.bankroll -= amount;
    player.handStatus = 'waiting';
    broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });

    // If all players have bet, deal
    if (lobby.players.every(p => p.handStatus !== 'betting')) {
      setTimeout(() => dealCards(lobby), 500);
    }
    return;
  }

  // ── Action-phase guard: only current player can act ──────────────────────
  if (lobby.status !== 'playing') return;
  if (lobby.currentPlayerIndex < 0) return;
  if (lobby.players[lobby.currentPlayerIndex]?.id !== ws._id) return;
  if (player.handStatus !== 'acting') return;

  // ── Hit ───────────────────────────────────────────────────────────────────
  if (type === 'player:hit') {
    if (lobby.deck.length === 0) return;
    const card = lobby.deck.shift();
    player.hand.push(card);
    const total = getHandTotal(player.hand);
    broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });

    if (total > 21) {
      setTimeout(() => {
        if (!lobbies.has(lobby.code)) return;
        handleBustOrComplete(lobby, player, 'busted');
      }, 650);
    } else if (total === 21) {
      setTimeout(() => {
        if (!lobbies.has(lobby.code)) return;
        handleBustOrComplete(lobby, player, 'stood');
      }, 650);
    }
    return;
  }

  // ── Stand ─────────────────────────────────────────────────────────────────
  if (type === 'player:stand') {
    if (player.splitHand && player.splitHand.length > 0) {
      // Completed hand 1, move to hand 2
      transitionToSplitHand2(player);
      broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });
    } else {
      player.handStatus = 'stood';
      broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });
      setTimeout(() => {
        if (!lobbies.has(lobby.code)) return;
        advanceToNextPlayer(lobby);
      }, 300);
    }
    return;
  }

  // ── Double down ───────────────────────────────────────────────────────────
  if (type === 'player:double') {
    if (player.hand.length !== 2) return;
    if (player.bankroll < player.bet) { send(ws, { type: 'error', message: 'Not enough bankroll to double.' }); return; }
    if (lobby.deck.length === 0) return;

    player.bankroll -= player.bet;
    player.bet *= 2;
    const card = lobby.deck.shift();
    player.hand.push(card);
    const total = getHandTotal(player.hand);
    broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });

    setTimeout(() => {
      if (!lobbies.has(lobby.code)) return;
      const status = total > 21 ? 'busted' : 'stood';
      if (player.splitHand && player.splitHand.length > 0) {
        // Doubled on hand 1 of a split — transition to hand 2
        transitionToSplitHand2(player);
        broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });
      } else {
        player.handStatus = status;
        broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });
        setTimeout(() => {
          if (!lobbies.has(lobby.code)) return;
          advanceToNextPlayer(lobby);
        }, 600);
      }
    }, 700);
    return;
  }

  // ── Split ─────────────────────────────────────────────────────────────────
  if (type === 'player:split') {
    const alreadySplit = player.splitHand !== null || player.hand1Completed !== null;
    if (alreadySplit) return;                               // no re-split
    if (player.hand.length !== 2) return;
    if (player.hand[0].value !== player.hand[1].value) return;
    if (player.bankroll < player.bet) { send(ws, { type: 'error', message: 'Not enough bankroll to split.' }); return; }
    if (lobby.deck.length < 2) return;

    const [card1, card2] = player.hand;
    const newCard1 = lobby.deck.shift();
    const newCard2 = lobby.deck.shift();

    player.bankroll -= player.bet;         // deduct second bet
    player.splitBet = player.bet;          // store for hand 2
    player.hand = [card1, newCard1];       // hand 1
    player.splitHand = [card2, newCard2];  // hand 2 (waiting)

    broadcast(lobby, { type: 'game:state', state: publicLobby(lobby) });
    return;
  }
}

// ── Disconnect cleanup ────────────────────────────────────────────────────────

function cleanupPlayerFromLobby(wsId, code) {
  const lobby = lobbies.get(code);
  if (!lobby) return;

  const idx = lobby.players.findIndex(p => p.id === wsId);
  if (idx === -1) return;

  lobby.players.splice(idx, 1);

  if (lobby.players.length === 0) {
    lobbies.delete(code);
    return;
  }

  // Reassign host if the host left
  if (lobby.hostId === wsId) lobby.hostId = lobby.players[0].id;

  // Adjust currentPlayerIndex if needed (left-to-right order)
  if (lobby.status === 'playing') {
    if (idx < lobby.currentPlayerIndex) {
      // A player before the current one left — shift index down
      lobby.currentPlayerIndex--;
    } else if (idx === lobby.currentPlayerIndex) {
      // The current player disconnected — set index one before so advanceToNextPlayer
      // picks up the player that shifted into this slot (or ends the phase)
      lobby.currentPlayerIndex = idx - 1;
      broadcast(lobby, { type: 'lobby:player-left', state: publicLobby(lobby) });
      advanceToNextPlayer(lobby);
      return;
    }
  }

  // If game was in betting and this player hadn't bet, check if all remaining have bet
  if (lobby.status === 'betting') {
    const allBet = lobby.players.every(p => p.handStatus !== 'betting');
    if (allBet && lobby.players.length >= 1) {
      setTimeout(() => dealCards(lobby), 500);
    }
  }

  broadcast(lobby, { type: 'lobby:player-left', state: publicLobby(lobby) });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws._id = `p${++wsIdCounter}_${Date.now()}`;

    ws.on('message', (data) => handleMessage(ws, data.toString()));

    ws.on('close', () => {
      const code = playerLobbies.get(ws._id);
      playerLobbies.delete(ws._id);
      if (code) cleanupPlayerFromLobby(ws._id, code);
    });
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
