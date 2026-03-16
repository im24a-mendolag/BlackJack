# BlackJack

A browser-based Blackjack card game with user accounts, a leaderboard, and a basic strategy trainer.

🌐 **Live:** [blackjack.paulkuehn.ch](https://blackjack.paulkuehn.ch)

---

## Stack

| | |
|---|---|
| **Framework** | Next.js 15 (App Router) |
| **UI** | React 19 |
| **Auth** | NextAuth.js v4 |
| **ORM** | Prisma 5 |
| **Database** | PostgreSQL |
| **Password hashing** | bcryptjs |
| **Styling** | Plain CSS |
| **Hosting** | Vercel |

---

## Features

- Full Blackjack gameplay — bet, hit, stand, double down, split (incl. double after split)
- Animated card dealing with a 4-deck shoe (reshuffles at <25% remaining)
- Keyboard shortcuts — `W` Hit · `S` Stand · `D` Double · `A` Split
- User accounts — register, login, change username/password, delete account
- Persistent bankroll & stats (hands, wins, losses, pushes, blackjacks, income)
- Global leaderboard
- Basic strategy trainer with real-time feedback
- Strategy reference table modal
- Sound effects (chip, draw, win, bust, clear bet)
- Cross-monitor scaling fix via `ScaleInit.js`

---

## Rules

- Dealer stands on soft 17
- No surrender
- No re-split after split

---

## Getting Started

```bash
git clone https://github.com/endodod/BlackJack.git
cd BlackJack
npm install
```

Set up your environment variables:

```env
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

Then run:

```bash
npx prisma generate
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Planned

- Fix Ace logic edge case (2×A)
- Pro mode — card counting training
- Mobile support
- Multiplayer (?)