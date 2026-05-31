# Bull Fight 🐂🃏

A full-stack mobile card game for Android & iOS — featuring Bull Fight (Niu Niu), Texas Hold'em Poker, Tournaments, Clubs, and more. Built with React Native and Node.js, deployed on Azure.

## Features

### 🎮 Games
- **Bull Fight (Niu Niu)** — 5-card game with Bull Point scoring across multiple tiers
- **Texas Hold'em Poker** — full poker engine with bots, blinds, side pots
- **Private Rooms** — password-protected & VIP-gated custom poker tables
- **Tournaments / SNG** — Sit-and-Go with blind escalation, multi-table, rebuy, prize payouts

### 🎰 Rewards
- **Lucky Spin** — weighted spin wheel with progressive jackpot (1% of all bets)
- **Daily & Weekly Missions** — trackable objectives with chip rewards
- **Achievements** — 12 permanent milestones (first win, chip millionaire, tournament champion, etc.)
- **Daily / Hourly / Streak Bonuses** — free chips on login

### 👥 Social
- **Friends** — add, remove, block, online status, DM chat
- **Gift Chips** — transfer chips to friends (daily limit: 10M, min: 1K, audit trail)
- **Clubs** — create/join clubs, donate chips, real-time chat, donation rankings, club levels (1-5)
- **Emotes** — in-game reactions during Bull Fight

### 💎 Economy
- **VIP System** — tiered VIP levels with daily rewards
- **Leaderboard** — global chip-based rankings
- **Store** — chip packages

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Mobile (Expo)                     │
│  GameScreen · PokerScreen · PrivateRoomScreen       │
│  TournamentScreen · ClubScreen · MissionsScreen     │
│  LuckySpinScreen · FriendsScreen · LobbyScreen      │
└──────────────┬──────────────────┬───────────────────┘
          REST │              WS  │
┌──────────────▼──────────────────▼───────────────────┐
│               Server (Node.js)                       │
│  Express Routes        Socket.IO Handlers            │
│  ├── /api/auth         ├── BullfightManager          │
│  ├── /api/users        ├── PokerManager              │
│  ├── /api/friends      ├── PrivateRoomManager        │
│  ├── /api/clubs        ├── TournamentManager         │
│  ├── /api/missions     └── ClubService (chat)        │
│  ├── /api/lucky-spin                                 │
│  └── /api/game                                       │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
    ┌──────▼──────┐       ┌───────▼──────┐
    │  Cosmos DB  │       │ Redis Cache  │
    │  (users,    │       │ (presence,   │
    │   data,     │       │  sessions)   │
    │   friends)  │       └──────────────┘
    └─────────────┘
```

## Distributed Systems Design

Real-money-style card games are unforgiving: every client sees the same table,
chips must never be double-spent, and a dropped phone mid-hand can't corrupt the
round. The backend is built around a few deliberate distributed-systems
decisions.

### Server-authoritative game loop (single source of truth)
Clients are **thin renderers** — they never compute outcomes. The server owns the
full game state machine (`bullfight.ts`, `pokerTable.ts`): shuffling, betting
legality, hand evaluation, side-pots and payouts all run server-side. Clients
only send *intents* (`place_bet`, `join_tier`) and receive authoritative results.
This eliminates an entire class of client-trust / cheating bugs and makes the
server the single linearization point for every mutation on a table.

### Snapshot + event-delta state sync
Instead of broadcasting full state on every change (expensive) or trusting
clients to track it (unsafe), the protocol mixes both:
- **Snapshot on join** — a late joiner / reconnecting client gets one full
  `game_state` snapshot tailored to them (`game.getState(userId)` hides other
  players' hole cards).
- **Discrete deltas during play** — `round_start`, `stage_change`, `countdown`,
  `round_result`, `bet_update`, `payout` carry only what changed.

This is an eventual-consistency reconciliation model: a client can drop, miss a
burst of deltas, reconnect, and re-sync from a fresh snapshot without the server
replaying history. It keeps per-event payloads tiny while staying correct under
packet loss and reconnection.

### Room-based fan-out
Each tier / table / tournament / club is a **Socket.IO room**. Broadcasts use
`io.in(room).emit(...)` so a state change fans out to exactly the players at that
table — O(table) work, not O(server). Independent rooms are isolated failure and
concurrency domains: a stuck hand at one table can't stall another, and the
managers (`BullfightManager`, `PokerManager`, `TournamentManager`) run each
room's clock as its own concurrent state machine.

### Authenticated, heartbeat-monitored connections
The WebSocket handshake runs a JWT auth middleware (`io.use`) before any game
event is accepted, so the socket's `userId` is trusted for the life of the
connection. Socket.IO heartbeats (`pingInterval: 25s`, `pingTimeout: 10s`) detect
half-open / dead connections and drive presence + clean seat release on
`disconnect`.

### Partition-aware data modeling (Cosmos DB)
Data is modeled for **single-partition reads** on a horizontally-partitioned
store. Hot read paths (a user's profile, a player's inbox) are keyed by `userId`
as the partition key so they never trigger a cross-partition scan. Where two
actors need the same record from their own partition — e.g. a direct message — it
is **dual-written under both the sender's and the recipient's partition**, trading
a little write amplification and denormalization for cheap, scalable reads. This
is the classic distributed-database tradeoff made explicit in the schema.

### Read-through caching with explicit invalidation
The leaderboard is an expensive aggregate, so reads go through a TTL cache
(`LEADERBOARD_TTL_MS = 60s`) and the game loop **busts the cache**
(`invalidateLeaderboardCache()`) after each round that can change rankings —
read-through + write-invalidate, so players see fresh standings without hammering
the database on every request. *(Currently an in-process cache; see Scaling out.)*

### Backpressure at the edge
Express rate limiters (500 req / 15 min globally, 100 / 15 min on auth) and a
1 MB body cap protect the shared backend from a single noisy or abusive client.

### Scaling out (current state & roadmap)
The design is intentionally ready for multi-node scale-out, with two honest
caveats about the present implementation:
- **Game rooms hold authoritative state in memory** on the node that owns them,
  so today the server runs as a single authoritative node (vertically scaled).
  Sharding rooms across nodes (consistent-hash a `tableId` → node) or moving room
  state into a shared store is the natural next step.
- **Fan-out and the leaderboard cache are in-process.** Running multiple
  Socket.IO instances behind Azure Container Apps requires a shared pub/sub
  backplane (e.g. the Socket.IO Redis adapter) so `io.in(room).emit` reaches
  sockets on other nodes, and a shared cache (Azure Cache for Redis) for
  cross-node invalidation. The architecture diagram above shows this target
  topology.

## Tech Stack

- **Mobile**: React Native (Expo) with TypeScript
- **Backend**: Node.js + Express + Socket.IO
- **Database**: Azure Cosmos DB (Serverless)
- **Cache**: Azure Cache for Redis
- **Hosting**: Azure Container Apps
- **Auth**: JWT + Google Sign-In + Apple Sign-In
- **Infra**: Azure Bicep templates

## Project Structure

```
bullfight/
├── mobile/                          # React Native (Expo) app
│   └── src/
│       ├── screens/
│       │   ├── game/GameScreen.tsx        # Bull Fight game UI
│       │   ├── poker/PokerScreen.tsx      # Poker table UI
│       │   ├── poker/PrivateRoomScreen.tsx
│       │   ├── poker/TournamentScreen.tsx
│       │   ├── lobby/LobbyScreen.tsx
│       │   ├── lobby/MissionsScreen.tsx
│       │   ├── lobby/LuckySpinScreen.tsx
│       │   ├── social/FriendsScreen.tsx
│       │   └── social/ClubScreen.tsx
│       ├── components/GiftChipsModal.tsx
│       ├── services/api.ts           # REST client
│       └── services/socket.ts        # Socket.IO client
├── server/                          # Node.js backend
│   └── src/
│       ├── game/
│       │   ├── bullfight.ts          # Bull Fight engine
│       │   ├── bullfightManager.ts   # Socket.IO handler
│       │   └── poker/
│       │       ├── pokerTable.ts     # Core poker engine
│       │       ├── pokerManager.ts   # Fixed-tier tables
│       │       ├── privateRoomManager.ts
│       │       ├── tournament.ts
│       │       └── tournamentManager.ts
│       ├── services/
│       │   ├── clubService.ts
│       │   ├── missionService.ts
│       │   └── luckySpinService.ts
│       ├── routes/                   # REST endpoints
│       └── socket/gameSocket.ts      # Socket.IO wiring
├── shared/                          # Shared types & constants
│   └── types.ts
├── infra/                           # Azure Bicep templates
└── www/                             # Landing page
```

## Getting Started

### Prerequisites
- Node.js 22+
- Azure CLI
- Expo CLI (`npm install -g expo-cli`)

### Backend Setup
```bash
cd server
cp .env.example .env    # Fill in your Azure credentials
npm install
npm run dev
```

### Mobile Setup
```bash
cd mobile
npm install
npx expo start
```

### Deploy Azure Infrastructure
```bash
az login
az deployment group create \
  --resource-group games-rg \
  --template-file infra/main.bicep \
  --parameters location=westus
```

## Game Rules

**Bull Fight (Niu Niu)**: Each player receives 5 cards and splits them into a 3-card group and 2-card group. The 3-card group must sum to a multiple of 10. The 2-card group determines your Bull Point (1-9). Highest hand wins!

**Texas Hold'em Poker**: Standard rules — 2 hole cards + 5 community cards, best 5-card hand wins.

## License

Private — All rights reserved.
