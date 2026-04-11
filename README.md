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

### Server-Push Pattern (DH Texas Poker style)
- Full `game_state` snapshot only on `join_tier` (for late joiners)
- Discrete events for ongoing play: `round_start`, `stage_change`, `countdown`, `round_result`, `bet_update`
- Thin client — server drives all game logic, client renders state

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
