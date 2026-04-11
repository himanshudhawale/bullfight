// ============================================================
// Bull Fight — Shared Types
// Texas Hold'em spectator betting game
// ============================================================

// ---- Cards ----
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
}

// ---- Table Tiers ----
export enum TableTier {
  MONTE_CARLO = 'monte_carlo',
  MACAU = 'macau',
  LAS_VEGAS = 'las_vegas',
  MONACO = 'monaco',
}

export interface TableTierConfig {
  tier: TableTier;
  name: string;
  emoji: string;
  minBet: number;
  chipPresets: number[];
}

// ---- VIP System ----
export enum VipLevel {
  BRONZE = 0,
  SILVER = 1,
  GOLD = 2,
  PLATINUM = 3,
  DIAMOND = 4,
  MASTER = 5,
  GRANDMASTER = 6,
  LEGEND = 7,
  MYTHIC = 8,
  IMMORTAL = 9,
  DIVINE = 10,
  SUPREME = 11,
}

export interface VipLevelConfig {
  level: VipLevel;
  name: string;
  xpRequired: number;
  dailyBonus: number;
  rakeback: number; // percentage
}

export const VIP_LEVELS: VipLevelConfig[] = [
  { level: VipLevel.BRONZE, name: 'Bronze', xpRequired: 0, dailyBonus: 10_000, rakeback: 0 },
  { level: VipLevel.SILVER, name: 'Silver', xpRequired: 1_000, dailyBonus: 20_000, rakeback: 2 },
  { level: VipLevel.GOLD, name: 'Gold', xpRequired: 5_000, dailyBonus: 50_000, rakeback: 5 },
  { level: VipLevel.PLATINUM, name: 'Platinum', xpRequired: 15_000, dailyBonus: 100_000, rakeback: 8 },
  { level: VipLevel.DIAMOND, name: 'Diamond', xpRequired: 50_000, dailyBonus: 250_000, rakeback: 12 },
  { level: VipLevel.MASTER, name: 'Master', xpRequired: 150_000, dailyBonus: 500_000, rakeback: 15 },
  { level: VipLevel.GRANDMASTER, name: 'Grandmaster', xpRequired: 500_000, dailyBonus: 1_000_000, rakeback: 18 },
  { level: VipLevel.LEGEND, name: 'Legend', xpRequired: 1_500_000, dailyBonus: 2_500_000, rakeback: 20 },
  { level: VipLevel.MYTHIC, name: 'Mythic', xpRequired: 5_000_000, dailyBonus: 5_000_000, rakeback: 22 },
  { level: VipLevel.IMMORTAL, name: 'Immortal', xpRequired: 15_000_000, dailyBonus: 10_000_000, rakeback: 25 },
  { level: VipLevel.DIVINE, name: 'Divine', xpRequired: 50_000_000, dailyBonus: 25_000_000, rakeback: 28 },
  { level: VipLevel.SUPREME, name: 'Supreme', xpRequired: 150_000_000, dailyBonus: 50_000_000, rakeback: 30 },
];

export const VIP_XP_REWARDS = {
  GAME_PLAYED: 10,
  GAME_WON: 25,
  DAILY_LOGIN: 50,
  TOURNAMENT_PLAYED: 20,
  TOURNAMENT_WON: 100,
  CLUB_DONATION: 5,
} as const;

export function calculateVipLevel(xp: number): VipLevel {
  let level = VipLevel.BRONZE;
  for (const config of VIP_LEVELS) {
    if (xp >= config.xpRequired) level = config.level;
    else break;
  }
  return level;
}

export function getVipConfig(level: VipLevel): VipLevelConfig {
  return VIP_LEVELS[level] || VIP_LEVELS[0];
}

// ---- Poker Tiers ----
export interface PokerTierConfig {
  tier: TableTier;
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
}

export const POKER_TIERS: PokerTierConfig[] = [
  { tier: TableTier.MONTE_CARLO, name: 'Monte Carlo', smallBlind: 50, bigBlind: 100, minBuyIn: 1_000, maxBuyIn: 5_000, maxSeats: 24 },
  { tier: TableTier.MACAU, name: 'Macau', smallBlind: 500, bigBlind: 1_000, minBuyIn: 10_000, maxBuyIn: 50_000, maxSeats: 18 },
  { tier: TableTier.LAS_VEGAS, name: 'Las Vegas', smallBlind: 5_000, bigBlind: 10_000, minBuyIn: 100_000, maxBuyIn: 500_000, maxSeats: 12 },
  { tier: TableTier.MONACO, name: 'Monaco', smallBlind: 50_000, bigBlind: 100_000, minBuyIn: 1_000_000, maxBuyIn: 5_000_000, maxSeats: 6 },
];

// ---- Poker Game Types ----
export type PokerAction = 'fold' | 'check' | 'call' | 'raise' | 'all_in';
export type PokerPhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PokerPot {
  amount: number;
  eligible: string[];
}

export interface PokerSeat {
  seatIndex: number;
  userId: string;
  displayName: string;
  chips: number;
  holeCards: Card[];
  currentBet: number;
  totalBetThisRound: number;
  folded: boolean;
  allIn: boolean;
  isBot: boolean;
  sittingOut: boolean;
}

export interface PokerSeatClient {
  seatIndex: number;
  userId: string | null;
  displayName: string;
  chips: number;
  holeCards: Card[] | null;
  currentBet: number;
  folded: boolean;
  allIn: boolean;
  isBot: boolean;
  sittingOut: boolean;
}

export interface PokerTableState {
  tableId: string;
  tier: TableTier;
  phase: PokerPhase;
  seats: PokerSeatClient[];
  communityCards: Card[];
  pots: PokerPot[];
  dealerSeat: number;
  activeSeat: number;
  minRaise: number;
  countdown: number;
  handNumber: number;
  lastAction: { seat: number; action: PokerAction; amount?: number } | null;
  winners: { seatIndex: number; amount: number; hand?: string }[] | null;
}

export interface PokerTableSummary {
  tableId: string;
  tier: TableTier;
  name: string;
  playerCount: number;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
}

// ---- Chat ----
export interface ChatMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: string;
  fromDisplayName?: string;
}

// ---- Emotes ----
export interface EmoteConfig {
  id: string;
  label: string;
  cost: number;
}

export const EMOTE_LIST: EmoteConfig[] = [
  { id: 'laugh', label: '😂', cost: 0 },
  { id: 'angry', label: '😡', cost: 0 },
  { id: 'cry', label: '😢', cost: 0 },
  { id: 'cool', label: '😎', cost: 0 },
  { id: 'thumbsup', label: '👍', cost: 0 },
  { id: 'fire', label: '🔥', cost: 100 },
  { id: 'money', label: '💰', cost: 500 },
  { id: 'trophy', label: '🏆', cost: 1_000 },
  { id: 'crown', label: '👑', cost: 5_000 },
  { id: 'rocket', label: '🚀', cost: 10_000 },
];

// ---- Bull Fight Game ----

export type BullfightStage = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'paused';

export const POKER_HAND_RANK = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
} as const;

export const POKER_HAND_NAMES: Record<number, string> = {
  0: 'High Card',
  1: 'Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
  9: 'Royal Straight Flush',
};

/** Player info broadcast to all spectators */
export interface BullfightPlayerState {
  name: string;
  emoji: string;
  cards: Card[];
}

/** Serialized bet totals (not per-user, just aggregates) */
export interface BullfightBetSummary {
  total: number;
  count: number;
}

/** Hand result sent to clients after showdown */
export interface BullfightHandResult {
  name: string;   // e.g. "Two Pair"
  rank: number;    // 0-9
}

/** Per-user payout info */
export interface BullfightPayout {
  userId: string;
  betType: string;
  amount: number;
  multiplier: number;
  payout: number;
  won: boolean;
  push: boolean;
}

/** Round results broadcast at showdown */
export interface BullfightRoundResults {
  roundNumber: number;
  winner: 'a' | 'b' | 'tie';
  resultA: BullfightHandResult;
  resultB: BullfightHandResult;
  payouts: BullfightPayout[];
}

/** Payload for ROUND_START server broadcast */
export interface BullfightRoundStartPayload {
  roundNumber: number;
  playerA: BullfightPlayerState;
  playerB: BullfightPlayerState;
  multipliers: Record<string, number>;
  winnerProbs: { a: number; b: number };
  countdown: number;
  minBet: number;
  handNames: Record<number, string>;
}

/** Payload for STAGE_CHANGE server broadcast */
export interface BullfightStageChangePayload {
  stage: BullfightStage;
  community: Card[];
  multipliers: Record<string, number>;
  winnerProbs: { a: number; b: number };
  countdown: number;
}

/** Payload for COUNTDOWN server broadcast */
export interface BullfightCountdownPayload {
  countdown: number;
}

/** Payload for ROUND_RESULT server broadcast */
export interface BullfightRoundResultPayload {
  roundNumber: number;
  winner: 'a' | 'b' | 'tie';
  resultA: BullfightHandResult;
  resultB: BullfightHandResult;
  community: Card[];
  playerA: BullfightPlayerState;
  playerB: BullfightPlayerState;
  payouts: BullfightPayout[];       // personalized per-user
  newBalance: number;               // personalized per-user
  countdown: number;
}

/** Payload for BET_UPDATE server broadcast */
export interface BullfightBetUpdatePayload {
  bets: Record<string, BullfightBetSummary>;
  roundTotalBets: number;
}

/** Full game state sent to each client (personalized with their chips) */
export interface BullfightGameState {
  tierId: string;
  roundNumber: number;
  stage: BullfightStage;
  countdown: number;
  playerA: BullfightPlayerState;
  playerB: BullfightPlayerState;
  community: Card[];
  bets: Record<string, BullfightBetSummary>;
  resultA: BullfightHandResult | null;
  resultB: BullfightHandResult | null;
  winner: 'a' | 'b' | 'tie' | null;
  lastResults: BullfightRoundResults | null;
  multipliers: Record<string, number>;
  winnerProbs: { a: number; b: number };
  handNames: Record<number, string>;
  minBet: number;
  roundTotalBets: number;
  chips: number;
}

// ---- Leaderboard ----

export interface LeaderboardEntry {
  userId: string;
  username: string;
  profit: number;
  rank: number;
}

// ---- Emotes ----

export type EmoteId = 'laugh' | 'cry' | 'fire' | 'clap' | 'skull' | 'rocket';

// ---- Socket Events ----

export enum SocketEvent {
  // Auth
  AUTH = 'auth',
  AUTH_OK = 'auth_ok',
  AUTH_FAIL = 'auth_fail',

  // Chat
  CHAT_MESSAGE = 'chat_message',
  EMOTE = 'emote',

  // Friends
  FRIEND_REQUEST = 'friend_request',
  FRIEND_ACCEPT = 'friend_accept',
  FRIEND_REMOVE = 'friend_remove',
  FRIENDS_LIST = 'friends_list',

  // Notifications
  NOTIFICATION = 'notification',

  // VIP
  VIP_STATUS = 'vip_status',

  // Bull Fight
  JOIN_TIER = 'join_tier',
  LEAVE_TIER = 'leave_tier',
  GAME_STATE = 'game_state',
  PLACE_BET = 'place_bet',
  BET_OK = 'bet_ok',
  BUY_CHIPS = 'buy_chips',
  CHIPS_UPDATE = 'chips_update',
  PAYOUT = 'payout',

  // Bull Fight — Server-push broadcasts
  ROUND_START = 'round_start',
  STAGE_CHANGE = 'stage_change',
  COUNTDOWN = 'countdown',
  ROUND_RESULT = 'round_result',
  BET_UPDATE = 'bet_update',

  GET_LEADERBOARD = 'get_leaderboard',
  LEADERBOARD = 'leaderboard',

  // Generic
  ERROR = 'error',
  DISCONNECT = 'disconnect',

  // Private Rooms
  PRIVATE_ROOM_CREATE = 'private_room:create',
  PRIVATE_ROOM_JOIN = 'private_room:join',
  PRIVATE_ROOM_LEAVE = 'private_room:leave',
  PRIVATE_ROOM_ACTION = 'private_room:action',
  PRIVATE_ROOM_BUY_IN = 'private_room:buy_in',
  PRIVATE_ROOM_INVITE = 'private_room:invite',
  PRIVATE_ROOM_INVITED = 'private_room:invited',
  PRIVATE_ROOM_CLOSE = 'private_room:close',
  PRIVATE_ROOM_CLOSED = 'private_room:closed',
  PRIVATE_ROOM_LIST_MINE = 'private_room:list_mine',
  PRIVATE_ROOM_LIST_PUBLIC = 'private_room:list_public',
  PRIVATE_ROOM_SEND_CHAT = 'private_room:send_chat',

  // Gifts
  GIFT_RECEIVED = 'gift_received',

  // Tournaments (placeholder for Phase 3)
  TOURNAMENT_LIST = 'tournament:list',
  TOURNAMENT_REGISTER = 'tournament:register',
  TOURNAMENT_UNREGISTER = 'tournament:unregister',
  TOURNAMENT_STATE = 'tournament:state',
  TOURNAMENT_BLIND_UP = 'tournament:blind_up',
  TOURNAMENT_ELIMINATED = 'tournament:eliminated',
  TOURNAMENT_RESULT = 'tournament:result',

  // Clubs (placeholder for Phase 4)
  CLUB_CREATE = 'club:create',
  CLUB_JOIN = 'club:join',
  CLUB_LEAVE = 'club:leave',
  CLUB_CHAT = 'club:chat',
  CLUB_DONATE = 'club:donate',
  CLUB_INVITE = 'club:invite',

  // Missions (placeholder for Phase 5)
  MISSION_UPDATE = 'mission:update',
  MISSION_COMPLETE = 'mission:complete',
}

// ── Private Rooms ─────────────────────────────────────────────────────────
export interface PrivateRoomConfig {
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
  password?: string;
  vipLevelRequired?: number;
}

export interface PrivateRoomInfo {
  roomId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  config: Omit<PrivateRoomConfig, 'password'>;
  playerCount: number;
  maxSeats: number;
  createdAt: string;
  hasPassword: boolean;
  invitedUserIds: string[];
}

export interface PrivateRoomInvite {
  roomId: string;
  roomName: string;
  inviterName: string;
  smallBlind: number;
  bigBlind: number;
}

// ── Gift / Chip Transfer ──────────────────────────────────────────────────
export interface GiftTransaction {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  senderName: string;
  receiverName: string;
  createdAt: string;
  isSent: boolean;
}

export interface GiftLimitStatus {
  dailyLimit: number;
  used: number;
  remaining: number;
}

// ── Tournaments ───────────────────────────────────────────────────────────
export type TournamentStatus = 'registration' | 'running' | 'finished' | 'cancelled';

export interface TournamentBlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  durationMinutes: number;
}

export interface TournamentConfig {
  id: string;
  name: string;
  type: 'scheduled' | 'sng';
  buyIn: number;
  entryFee: number;
  startingChips: number;
  maxPlayers: number;
  minPlayers: number;
  blindSchedule: TournamentBlindLevel[];
  payoutStructure: { place: number; percentage: number }[];
  rebuyAllowed: boolean;
  rebuyLevels: number;       // rebuys allowed through this blind level
  startsAt?: string;         // ISO 8601 for scheduled; null for SNG
}

export interface TournamentState {
  id: string;
  config: TournamentConfig;
  status: TournamentStatus;
  registeredPlayers: number;
  playersRemaining: number;
  currentBlindLevel: number;
  prizePool: number;
  nextBlindAt?: string;
  myRank?: number;
  myChips?: number;
}

export interface TournamentResult {
  tournamentId: string;
  place: number;
  prize: number;
  totalPlayers: number;
}

// ── Clubs ─────────────────────────────────────────────────────────────────
export type ClubRole = 'owner' | 'admin' | 'member';

export interface Club {
  id: string;
  name: string;
  description: string;
  avatarUrl?: string;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  maxMembers: number;
  level: number;
  totalDonations: number;
  isPublic: boolean;
  createdAt: string;
}

export interface ClubMember {
  userId: string;
  displayName: string;
  role: ClubRole;
  totalDonated: number;
  joinedAt: string;
  onlineStatus?: string;
}

export interface ClubChatMessage {
  id: string;
  clubId: string;
  fromUserId: string;
  fromDisplayName: string;
  text: string;
  createdAt: string;
}

export interface ClubDonation {
  userId: string;
  displayName: string;
  amount: number;
  createdAt: string;
}

export interface ClubRanking {
  rank: number;
  clubId: string;
  clubName: string;
  totalDonations: number;
  memberCount: number;
}

// ── Missions & Achievements ───────────────────────────────────────────────
export type MissionFrequency = 'daily' | 'weekly' | 'permanent';
export type MissionStatus = 'active' | 'completed' | 'claimed';

export interface Mission {
  id: string;
  title: string;
  description: string;
  frequency: MissionFrequency;
  targetValue: number;
  rewardChips: number;
  rewardXp: number;
  rewardItem?: string;
  icon?: string;
}

export interface MissionProgress {
  missionId: string;
  currentValue: number;
  targetValue: number;
  status: MissionStatus;
  completedAt?: string;
  claimedAt?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  rewardChips: number;
  rewardXp: number;
  unlockedAt?: string;
}

// ── Lucky Spin / Jackpot ──────────────────────────────────────────────────
export interface SpinResult {
  prize: string;
  amount: number;
  type: 'chips' | 'xp' | 'cosmetic' | 'jackpot';
  jackpotAmount?: number;
}

export interface JackpotInfo {
  currentAmount: number;
  lastWinner?: string;
  lastWinAmount?: number;
  lastWinAt?: string;
}

export interface LuckySpinStatus {
  nextFreeSpinAt: string;
  canSpin: boolean;
  jackpot: JackpotInfo;
}
