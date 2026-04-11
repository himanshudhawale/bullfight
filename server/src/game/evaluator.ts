import { Card, Rank } from '../../../shared/types';

// ---- Hand Ranks (standard 5-card poker) ----
export const HAND_RANKS = {
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

const RANK_NAMES: Record<number, string> = {
  0: 'High Card',
  1: 'One Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
  9: 'Royal Flush',
};

const MULTIPLIERS: Record<number, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 6,
  6: 8,
  7: 25,
  8: 50,
  9: 100,
};

export interface HandResult {
  rank: number;
  rankName: string;
  values: number[];
  multiplier: number;
}

/** Convert card rank to numeric value (A=14) */
export function pokerValue(rank: Rank): number {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return parseInt(rank, 10);
}

/** Evaluate a 5-card poker hand */
export function evaluateHand(cards: Card[]): HandResult {
  if (cards.length !== 5) {
    throw new Error('Hand must contain exactly 5 cards');
  }

  const values = cards.map((c) => pokerValue(c.rank)).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  // Check straight (including ace-low)
  let isStraight = false;
  let straightHighCard = values[0];

  if (
    values[0] - values[1] === 1 &&
    values[1] - values[2] === 1 &&
    values[2] - values[3] === 1 &&
    values[3] - values[4] === 1
  ) {
    isStraight = true;
    straightHighCard = values[0];
  } else if (
    values[0] === 14 &&
    values[1] === 5 &&
    values[2] === 4 &&
    values[3] === 3 &&
    values[4] === 2
  ) {
    // Ace-low straight: A-2-3-4-5
    isStraight = true;
    straightHighCard = 5;
  }

  // Count occurrences of each value
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  const countEntries = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // by count desc
    return b[0] - a[0]; // by value desc
  });

  const countValues = countEntries.map(([_, c]) => c);

  // Determine hand rank
  if (isFlush && isStraight) {
    if (straightHighCard === 14) {
      // Royal Flush (A-K-Q-J-10 suited)
      return { rank: 9, rankName: RANK_NAMES[9], values: [straightHighCard], multiplier: MULTIPLIERS[9] };
    }
    return { rank: 8, rankName: RANK_NAMES[8], values: [straightHighCard], multiplier: MULTIPLIERS[8] };
  }

  if (countValues[0] === 4) {
    // Four of a Kind
    const quadVal = countEntries[0][0];
    const kicker = countEntries[1][0];
    return { rank: 7, rankName: RANK_NAMES[7], values: [quadVal, kicker], multiplier: MULTIPLIERS[7] };
  }

  if (countValues[0] === 3 && countValues[1] === 2) {
    // Full House
    const tripsVal = countEntries[0][0];
    const pairVal = countEntries[1][0];
    return { rank: 6, rankName: RANK_NAMES[6], values: [tripsVal, pairVal], multiplier: MULTIPLIERS[6] };
  }

  if (isFlush) {
    return { rank: 5, rankName: RANK_NAMES[5], values, multiplier: MULTIPLIERS[5] };
  }

  if (isStraight) {
    return { rank: 4, rankName: RANK_NAMES[4], values: [straightHighCard], multiplier: MULTIPLIERS[4] };
  }

  if (countValues[0] === 3) {
    // Three of a Kind
    const tripsVal = countEntries[0][0];
    const kickers = countEntries.slice(1).map(([v]) => v).sort((a, b) => b - a);
    return { rank: 3, rankName: RANK_NAMES[3], values: [tripsVal, ...kickers], multiplier: MULTIPLIERS[3] };
  }

  if (countValues[0] === 2 && countValues[1] === 2) {
    // Two Pair
    const highPair = Math.max(countEntries[0][0], countEntries[1][0]);
    const lowPair = Math.min(countEntries[0][0], countEntries[1][0]);
    const kicker = countEntries[2][0];
    return { rank: 2, rankName: RANK_NAMES[2], values: [highPair, lowPair, kicker], multiplier: MULTIPLIERS[2] };
  }

  if (countValues[0] === 2) {
    // One Pair
    const pairVal = countEntries[0][0];
    const kickers = countEntries.slice(1).map(([v]) => v).sort((a, b) => b - a);
    return { rank: 1, rankName: RANK_NAMES[1], values: [pairVal, ...kickers], multiplier: MULTIPLIERS[1] };
  }

  // High Card
  return { rank: 0, rankName: RANK_NAMES[0], values, multiplier: MULTIPLIERS[0] };
}

/**
 * Compare two hands. Returns:
 *  > 0 if a wins, < 0 if b wins, 0 if tie
 */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  // Same rank — compare tiebreaker values lexicographically
  const len = Math.min(a.values.length, b.values.length);
  for (let i = 0; i < len; i++) {
    if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
  }
  return 0;
}
