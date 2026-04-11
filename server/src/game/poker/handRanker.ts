import { Card } from '../../../../shared/types';

// ---- Types ----
export interface PokerHandResult {
  rank: number;       // 0-9
  rankName: string;
  bestFive: Card[];
  kickers: number[];  // for tiebreaking
}

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

// ---- Helpers ----

export function cardNumericValue(card: Card): number {
  const map: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  return map[card.rank] ?? 0;
}

/** Generate all C(n, 5) 5-card combos from n cards */
function combinations5(cards: Card[]): Card[][] {
  const result: Card[][] = [];
  const n = cards.length;
  for (let i = 0; i < n - 4; i++)
    for (let j = i + 1; j < n - 3; j++)
      for (let k = j + 1; k < n - 2; k++)
        for (let l = k + 1; l < n - 1; l++)
          for (let m = l + 1; m < n; m++)
            result.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
  return result;
}

/** Evaluate a single 5-card hand */
function evaluate5(cards: Card[]): PokerHandResult {
  const values = cards.map(cardNumericValue).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check for straight
  let isStraight = false;
  let straightHigh = 0;

  // Normal straight check
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0];
  }
  // Ace-low straight: A-2-3-4-5 (values sorted: [14, 5, 4, 3, 2])
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5; // 5-high straight
  }

  // Count ranks
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([val, cnt]) => ({ val: Number(val), cnt }))
    .sort((a, b) => b.cnt - a.cnt || b.val - a.val);

  // Determine hand rank
  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return { rank: 9, rankName: RANK_NAMES[9], bestFive: cards, kickers: [14] };
    }
    return { rank: 8, rankName: RANK_NAMES[8], bestFive: cards, kickers: [straightHigh] };
  }

  if (groups[0].cnt === 4) {
    const quad = groups[0].val;
    const kicker = groups[1].val;
    return { rank: 7, rankName: RANK_NAMES[7], bestFive: cards, kickers: [quad, kicker] };
  }

  if (groups[0].cnt === 3 && groups[1].cnt === 2) {
    return { rank: 6, rankName: RANK_NAMES[6], bestFive: cards, kickers: [groups[0].val, groups[1].val] };
  }

  if (isFlush) {
    return { rank: 5, rankName: RANK_NAMES[5], bestFive: cards, kickers: [...values] };
  }

  if (isStraight) {
    return { rank: 4, rankName: RANK_NAMES[4], bestFive: cards, kickers: [straightHigh] };
  }

  if (groups[0].cnt === 3) {
    const trips = groups[0].val;
    const kickers = groups.filter(g => g.cnt === 1).map(g => g.val).sort((a, b) => b - a);
    return { rank: 3, rankName: RANK_NAMES[3], bestFive: cards, kickers: [trips, ...kickers] };
  }

  if (groups[0].cnt === 2 && groups[1].cnt === 2) {
    const highPair = Math.max(groups[0].val, groups[1].val);
    const lowPair = Math.min(groups[0].val, groups[1].val);
    const kicker = groups[2].val;
    return { rank: 2, rankName: RANK_NAMES[2], bestFive: cards, kickers: [highPair, lowPair, kicker] };
  }

  if (groups[0].cnt === 2) {
    const pair = groups[0].val;
    const kickers = groups.filter(g => g.cnt === 1).map(g => g.val).sort((a, b) => b - a);
    return { rank: 1, rankName: RANK_NAMES[1], bestFive: cards, kickers: [pair, ...kickers] };
  }

  // High card
  return { rank: 0, rankName: RANK_NAMES[0], bestFive: cards, kickers: [...values] };
}

// ---- Public API ----

/** Evaluate 7 cards (2 hole + 5 community) and return the best 5-card hand */
export function evaluatePokerHand(cards: Card[]): PokerHandResult {
  if (cards.length < 5) throw new Error('Need at least 5 cards to evaluate');

  if (cards.length === 5) return evaluate5(cards);

  const combos = combinations5(cards);
  let best: PokerHandResult | null = null;

  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || comparePokerHands(result, best) > 0) {
      best = result;
    }
  }

  return best!;
}

/** Compare two hands. Returns positive if a wins, negative if b wins, 0 for tie */
export function comparePokerHands(a: PokerHandResult, b: PokerHandResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;

  // Compare kickers in order
  const len = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < len; i++) {
    const ak = a.kickers[i] ?? 0;
    const bk = b.kickers[i] ?? 0;
    if (ak !== bk) return ak - bk;
  }
  return 0;
}
