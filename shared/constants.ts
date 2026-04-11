import {
  TableTier,
  TableTierConfig,
  VipLevel,
  VipLevelConfig,
} from './types';

// ---- Predefined Poker Chat Messages ----
export const POKER_QUICK_MESSAGES = [
  { id: 'gg', text: 'GG' },
  { id: 'nice_hand', text: 'Nice hand!' },
  { id: 'good_luck', text: 'Good luck!' },
  { id: 'thanks', text: 'Thanks!' },
  { id: 'nice_bluff', text: 'Nice bluff!' },
  { id: 'unlucky', text: 'Unlucky!' },
  { id: 'wow', text: 'Wow!' },
  { id: 'oops', text: 'Oops!' },
] as const;

// ---- Signup ----
export const SIGNUP_BONUS_CHIPS = 500_000;

// ---- Table Tiers ----
export const TABLE_TIERS: Record<TableTier, TableTierConfig> = {
  [TableTier.MONTE_CARLO]: {
    tier: TableTier.MONTE_CARLO,
    name: 'Monte Carlo',
    emoji: '🎰',
    minBet: 100,
    chipPresets: [100, 500, 1_000, 5_000],
  },
  [TableTier.MACAU]: {
    tier: TableTier.MACAU,
    name: 'Macau',
    emoji: '🎲',
    minBet: 1_000,
    chipPresets: [1_000, 5_000, 10_000, 50_000],
  },
  [TableTier.LAS_VEGAS]: {
    tier: TableTier.LAS_VEGAS,
    name: 'Las Vegas',
    emoji: '🃏',
    minBet: 10_000,
    chipPresets: [10_000, 50_000, 100_000, 500_000],
  },
  [TableTier.MONACO]: {
    tier: TableTier.MONACO,
    name: 'Monaco',
    emoji: '👑',
    minBet: 100_000,
    chipPresets: [100_000, 500_000, 1_000_000, 5_000_000],
  },
};

// ---- VIP Levels ----
// Canonical VIP_LEVELS config is now in shared/types.ts (12 levels)
// Re-export for backwards compat
export { VIP_LEVELS, VIP_XP_REWARDS } from './types';

// ---- Chip Packs (removed — no IAP in v1.0) ----

// ---- Game Config ----
export const DAILY_BONUS_BASE = 10_000;

// ---- JWT Config ----
export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';
