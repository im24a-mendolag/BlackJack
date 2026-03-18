import * as Party from 'partykit/server';

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

// ── Party server ──────────────────────────────────────────────────────────────

export default class BlackjackParty {
  constructor(room) {
    this.room = room;
    // Lobby state — one instance per room (= one lobby per room ID)
    this.players = [];
    this.hostId = null;
    this.status = 'waiting'; // waiting | betting | playing | dealer | round-end
    this.deck = createShoe();
    this.dealerHand = [];
    this.dealerHoleHidden = true;
    this.currentPlayerIndex = -1;
    this.round = 0;
  }

  onConnect(conn) {
    // Send current state to reconnecting players or late joiners
    if (this.players.length > 0) {
      conn.send(JSON.stringify({ type: 'lobby:sync', state: this.publicState() }));
    }
  }

  onMessage(raw, sender) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    this.handleMessage(sender, msg);
  }

  onClose(conn) {
    this.cleanupPlayer(conn.id);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  makePlayer(connId, name) {
    return {
      id: connId,
      name: (name || 'Player').slice(0, 20),
      bankroll: 1000,
      bet: 0,
      hand: [],
      splitHand: null,
      hand1Completed: null,
      hand1Bet: 0,
      splitBet: 0,
      handStatus: 'betting', // betting | waiting | acting | stood | busted | done
      result: null,
      splitResult: null,
      resultAmount: 0,
      splitResultAmount: 0,
      forcedReset: false,
    };
  }

  publicState() {
    return {
      code: this.room.id,
      status: this.status,
      hostId: this.hostId,
      players: this.players.map(p => ({
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
        forcedReset: p.forcedReset || false,
      })),
      dealerHand: this.dealerHand,
      dealerHoleHidden: this.dealerHoleHidden,
      currentPlayerIndex: this.currentPlayerIndex,
      round: this.round,
    };
  }

  broadcast(msg) {
    this.room.broadcast(JSON.stringify(msg));
  }

  // ── Message handler ────────────────────────────────────────────────────────

  handleMessage(sender, msg) {
    const { type } = msg;

    // ── Lobby create ──────────────────────────────────────────────────────────
    if (type === 'lobby:create') {
      if (this.players.length > 0) {
        // Room already taken — code collision (very rare with 4-char codes)
        sender.send(JSON.stringify({ type: 'error', message: 'Lobby code already in use. Try again.' }));
        return;
      }
      const player = this.makePlayer(sender.id, msg.name);
      this.players.push(player);
      this.hostId = sender.id;
      sender.send(JSON.stringify({
        type: 'lobby:created',
        code: this.room.id,
        state: this.publicState(),
        playerId: sender.id,
      }));
      return;
    }

    // ── Lobby join ────────────────────────────────────────────────────────────
    if (type === 'lobby:join') {
      if (this.players.length === 0) {
        sender.send(JSON.stringify({ type: 'error', message: 'Lobby not found.' }));
        return;
      }
      if (this.status !== 'waiting') {
        sender.send(JSON.stringify({ type: 'error', message: 'Game has already started.' }));
        return;
      }
      if (this.players.length >= 5) {
        sender.send(JSON.stringify({ type: 'error', message: 'Lobby is full (5/5).' }));
        return;
      }
      if (this.players.some(p => p.id === sender.id)) {
        sender.send(JSON.stringify({ type: 'error', message: 'Already in lobby.' }));
        return;
      }
      const player = this.makePlayer(sender.id, msg.name);
      this.players.push(player);
      sender.send(JSON.stringify({
        type: 'lobby:joined',
        code: this.room.id,
        state: this.publicState(),
        playerId: sender.id,
      }));
      this.broadcast({ type: 'lobby:update', state: this.publicState() });
      return;
    }

    // ── Lobby start (host only) ───────────────────────────────────────────────
    if (type === 'lobby:start') {
      if (this.hostId !== sender.id) {
        sender.send(JSON.stringify({ type: 'error', message: 'Only the host can start.' }));
        return;
      }
      if (this.players.length < 2) {
        sender.send(JSON.stringify({ type: 'error', message: 'Need at least 2 players to start.' }));
        return;
      }
      if (this.status !== 'waiting') return;
      this.status = 'betting';
      this.round = 1;
      this.broadcast({ type: 'game:started', state: this.publicState() });
      return;
    }

    // ── All game actions require the player to be in the lobby ────────────────
    const player = this.players.find(p => p.id === sender.id);
    if (!player) return;

    // ── Bet ───────────────────────────────────────────────────────────────────
    if (type === 'player:bet') {
      if (this.status !== 'betting') return;
      if (player.handStatus !== 'betting') return;
      const amount = Math.floor(Number(msg.amount));
      if (!amount || amount <= 0 || amount > player.bankroll) {
        sender.send(JSON.stringify({ type: 'error', message: 'Invalid bet amount.' }));
        return;
      }
      player.bet = amount;
      player.bankroll -= amount;
      player.handStatus = 'waiting';
      this.broadcast({ type: 'game:state', state: this.publicState() });
      if (this.players.every(p => p.handStatus !== 'betting')) {
        setTimeout(() => this.dealCards(), 500);
      }
      return;
    }

    // ── Action-phase guard: only the current player can act ───────────────────
    if (this.status !== 'playing') return;
    if (this.currentPlayerIndex < 0) return;
    if (this.players[this.currentPlayerIndex]?.id !== sender.id) return;
    if (player.handStatus !== 'acting') return;

    // ── Hit ───────────────────────────────────────────────────────────────────
    if (type === 'player:hit') {
      if (this.deck.length === 0) return;
      const card = this.deck.shift();
      player.hand.push(card);
      const total = getHandTotal(player.hand);
      this.broadcast({ type: 'game:state', state: this.publicState() });
      if (total > 21) {
        setTimeout(() => {
          if (this.players.length === 0) return;
          this.handleBustOrComplete(player, 'busted');
        }, 650);
      } else if (total === 21) {
        setTimeout(() => {
          if (this.players.length === 0) return;
          this.handleBustOrComplete(player, 'stood');
        }, 650);
      }
      return;
    }

    // ── Stand ─────────────────────────────────────────────────────────────────
    if (type === 'player:stand') {
      if (player.splitHand && player.splitHand.length > 0) {
        this.transitionToSplitHand2(player);
        this.broadcast({ type: 'game:state', state: this.publicState() });
      } else {
        player.handStatus = 'stood';
        this.broadcast({ type: 'game:state', state: this.publicState() });
        setTimeout(() => {
          if (this.players.length === 0) return;
          this.advanceToNextPlayer();
        }, 300);
      }
      return;
    }

    // ── Double down ───────────────────────────────────────────────────────────
    if (type === 'player:double') {
      if (player.hand.length !== 2) return;
      if (player.bankroll < player.bet) {
        sender.send(JSON.stringify({ type: 'error', message: 'Not enough bankroll to double.' }));
        return;
      }
      if (this.deck.length === 0) return;
      player.bankroll -= player.bet;
      player.bet *= 2;
      const card = this.deck.shift();
      player.hand.push(card);
      const total = getHandTotal(player.hand);
      this.broadcast({ type: 'game:state', state: this.publicState() });
      setTimeout(() => {
        if (this.players.length === 0) return;
        const status = total > 21 ? 'busted' : 'stood';
        if (player.splitHand && player.splitHand.length > 0) {
          this.transitionToSplitHand2(player);
          this.broadcast({ type: 'game:state', state: this.publicState() });
        } else {
          player.handStatus = status;
          this.broadcast({ type: 'game:state', state: this.publicState() });
          setTimeout(() => {
            if (this.players.length === 0) return;
            this.advanceToNextPlayer();
          }, 600);
        }
      }, 700);
      return;
    }

    // ── Resign ────────────────────────────────────────────────────────────────
    if (type === 'player:resign') {
      if (player.hand.length !== 2) return;
      const alreadySplit = player.splitHand !== null || player.hand1Completed !== null;
      if (alreadySplit) return;
      const halfBet = Math.floor(player.bet / 2);
      player.bankroll += halfBet;
      player.bet = player.bet - halfBet;
      player.handStatus = 'stood';
      player.result = 'Resigned';
      player.resultAmount = player.bet;
      this.broadcast({ type: 'game:state', state: this.publicState() });
      setTimeout(() => {
        if (this.players.length === 0) return;
        this.advanceToNextPlayer();
      }, 300);
      return;
    }

    // ── Split ─────────────────────────────────────────────────────────────────
    if (type === 'player:split') {
      const alreadySplit = player.splitHand !== null || player.hand1Completed !== null;
      if (alreadySplit) return;
      if (player.hand.length !== 2) return;
      if (player.hand[0].value !== player.hand[1].value) return;
      if (player.bankroll < player.bet) {
        sender.send(JSON.stringify({ type: 'error', message: 'Not enough bankroll to split.' }));
        return;
      }
      if (this.deck.length < 2) return;
      const [card1, card2] = player.hand;
      const newCard1 = this.deck.shift();
      const newCard2 = this.deck.shift();
      player.bankroll -= player.bet;
      player.splitBet = player.bet;
      player.hand = [card1, newCard1];
      player.splitHand = [card2, newCard2];
      this.broadcast({ type: 'game:state', state: this.publicState() });
      return;
    }
  }

  // ── Turn / game flow ───────────────────────────────────────────────────────

  advanceToNextPlayer() {
    let next = this.currentPlayerIndex + 1;
    while (next < this.players.length) {
      const status = this.players[next].handStatus;
      if (status !== 'stood' && status !== 'busted' && status !== 'done') break;
      next++;
    }
    if (next >= this.players.length) {
      const allBusted = this.players.every(p => p.handStatus === 'busted');
      if (allBusted) {
        this.resolveRound();
      } else {
        this.startDealerPhase();
      }
    } else {
      this.currentPlayerIndex = next;
      this.players[next].handStatus = 'acting';
      this.broadcast({ type: 'game:state', state: this.publicState() });
    }
  }

  startDealerPhase() {
    this.status = 'dealer';
    this.dealerHoleHidden = false;
    this.broadcast({ type: 'game:dealer-play', state: this.publicState() });
    this.dealerDraw();
  }

  dealerDraw() {
    const total = getHandTotal(this.dealerHand);
    if (total < 17 && this.deck.length > 0) {
      setTimeout(() => {
        if (this.players.length === 0) return;
        this.dealerHand.push(this.deck.shift());
        this.broadcast({ type: 'game:state', state: this.publicState() });
        this.dealerDraw();
      }, 1000);
    } else {
      setTimeout(() => this.resolveRound(), 600);
    }
  }

  resolveRound() {
    if (this.players.length === 0) return;
    const dealerH = this.dealerHand;

    for (const player of this.players) {
      player.handStatus = 'done';

      if (player.result === 'Resigned') continue;

      if (player.hand1Completed && player.hand1Completed.length > 0) {
        // ── Split resolution ─────────────────────────────────────────────────
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
        // ── Single hand resolution ───────────────────────────────────────────
        const result = checkWinner(player.hand, dealerH);
        const isNaturalBJ = (
          result === 'Player Wins' &&
          player.hand.length === 2 &&
          getHandTotal(player.hand) === 21
        );
        let payout = 0;
        if (isNaturalBJ)                   payout = Math.floor(player.bet * 2.5);
        else if (result === 'Player Wins') payout = player.bet * 2;
        else if (result === 'Push')        payout = player.bet;
        player.bankroll += payout;
        player.result = isNaturalBJ ? 'Blackjack!' : result;
        player.resultAmount = isNaturalBJ ? Math.floor(player.bet * 1.5) : player.bet;
      }
    }

    // Forced reset: any player at $0 gets topped back up to $1000
    for (const player of this.players) {
      if (player.bankroll <= 0) {
        player.bankroll = 1000;
        player.forcedReset = true;
      }
    }

    this.status = 'round-end';
    this.broadcast({ type: 'game:round-end', state: this.publicState() });

    // Auto-advance to next round after 5 s
    setTimeout(() => {
      if (this.players.length === 0) return;
      this.startNewRound();
    }, 5000);
  }

  startNewRound() {
    if (this.deck.length < RESHUFFLE_THRESHOLD) this.deck = createShoe();
    for (const p of this.players) {
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
      p.forcedReset = false;
    }
    this.dealerHand = [];
    this.dealerHoleHidden = true;
    this.currentPlayerIndex = -1;
    this.status = 'betting';
    this.round += 1;
    this.broadcast({ type: 'game:new-round', state: this.publicState() });
  }

  dealCards() {
    this.status = 'dealing';
    const n = this.players.length;
    // Deal right to left (highest index first), two passes
    for (let i = n - 1; i >= 0; i--) this.players[i].hand.push(this.deck.shift());
    this.dealerHand.push(this.deck.shift());
    for (let i = n - 1; i >= 0; i--) this.players[i].hand.push(this.deck.shift());
    this.dealerHand.push(this.deck.shift());

    const dealerTotal = getHandTotal(this.dealerHand);
    for (const p of this.players) p.handStatus = 'waiting';

    if (dealerTotal === 21) {
      // Dealer blackjack — reveal hole card and end round immediately
      this.status = 'dealer';
      this.dealerHoleHidden = false;
      this.broadcast({ type: 'game:dealt', state: this.publicState() });
      setTimeout(() => this.resolveRound(), 3000);
      return;
    }

    // Auto-stand players with natural blackjack
    for (const p of this.players) {
      if (getHandTotal(p.hand) === 21) p.handStatus = 'stood';
    }

    this.status = 'playing';
    const firstActive = this.players.findIndex(p => p.handStatus === 'waiting');
    if (firstActive === -1) {
      // All players have blackjack — go straight to dealer
      this.currentPlayerIndex = -1;
      this.broadcast({ type: 'game:dealt', state: this.publicState() });
      setTimeout(() => this.startDealerPhase(), 1500);
      return;
    }
    this.currentPlayerIndex = firstActive;
    this.players[firstActive].handStatus = 'acting';
    this.broadcast({ type: 'game:dealt', state: this.publicState() });
  }

  // ── Split / bust helpers ───────────────────────────────────────────────────

  transitionToSplitHand2(player) {
    player.hand1Completed = [...player.hand];
    player.hand1Bet = player.bet;
    player.bet = player.splitBet;
    player.hand = [...player.splitHand];
    player.splitHand = null;
    player.handStatus = 'acting';
  }

  handleBustOrComplete(player, status) {
    const hasSplitWaiting = player.splitHand && player.splitHand.length > 0;
    if (hasSplitWaiting) {
      this.transitionToSplitHand2(player);
      this.broadcast({ type: 'game:state', state: this.publicState() });
    } else {
      player.handStatus = status;
      this.broadcast({ type: 'game:state', state: this.publicState() });
      setTimeout(() => {
        if (this.players.length === 0) return;
        this.advanceToNextPlayer();
      }, status === 'busted' ? 1200 : 300);
    }
  }

  // ── Disconnect cleanup ─────────────────────────────────────────────────────

  cleanupPlayer(connId) {
    const idx = this.players.findIndex(p => p.id === connId);
    if (idx === -1) return;

    this.players.splice(idx, 1);
    if (this.players.length === 0) return;

    // Reassign host if host left
    if (this.hostId === connId) this.hostId = this.players[0].id;

    // Adjust turn index if a player left during the action phase
    if (this.status === 'playing') {
      if (idx < this.currentPlayerIndex) {
        this.currentPlayerIndex--;
      } else if (idx === this.currentPlayerIndex) {
        this.currentPlayerIndex = idx - 1;
        this.broadcast({ type: 'lobby:player-left', state: this.publicState() });
        this.advanceToNextPlayer();
        return;
      }
    }

    // If we were waiting for this player's bet, check if everyone else has bet
    if (this.status === 'betting') {
      const allBet = this.players.every(p => p.handStatus !== 'betting');
      if (allBet) setTimeout(() => this.dealCards(), 500);
    }

    this.broadcast({ type: 'lobby:player-left', state: this.publicState() });
  }
}
