import { evaluateHand, compareHands, HAND_RANKS, HandResult } from '../src/game/evaluator';
import { Card } from '../../shared/types';

function card(rank: string, suit = 'hearts'): Card {
  return { rank: rank as any, suit: suit as any };
}

describe('evaluateHand — detection', () => {
  test('detects High Card', () => {
    const cards = [card('2'), card('5', 'diamonds'), card('9', 'clubs'), card('J'), card('A', 'spades')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.HIGH_CARD);
    expect(result.rankName).toBe('High Card');
    expect(result.multiplier).toBe(0);
  });

  test('detects One Pair', () => {
    const cards = [card('7'), card('7', 'diamonds'), card('3'), card('9', 'clubs'), card('K', 'spades')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.PAIR);
    expect(result.rankName).toBe('One Pair');
    expect(result.multiplier).toBe(1);
    expect(result.values[0]).toBe(7); // pair value first
  });

  test('detects Two Pair', () => {
    const cards = [card('10'), card('10', 'diamonds'), card('4'), card('4', 'clubs'), card('A', 'spades')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.TWO_PAIR);
    expect(result.rankName).toBe('Two Pair');
    expect(result.multiplier).toBe(2);
    expect(result.values[0]).toBe(10); // higher pair
    expect(result.values[1]).toBe(4);  // lower pair
    expect(result.values[2]).toBe(14); // kicker (Ace)
  });

  test('detects Three of a Kind', () => {
    const cards = [card('Q'), card('Q', 'diamonds'), card('Q', 'clubs'), card('5'), card('8', 'spades')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.THREE_OF_A_KIND);
    expect(result.multiplier).toBe(3);
  });

  test('detects Straight (normal)', () => {
    const cards = [card('5'), card('6', 'diamonds'), card('7', 'clubs'), card('8'), card('9', 'spades')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT);
    expect(result.multiplier).toBe(5);
    expect(result.values[0]).toBe(9); // high card of straight
  });

  test('detects Ace-low Straight (A-2-3-4-5)', () => {
    const cards = [card('A'), card('2', 'diamonds'), card('3', 'clubs'), card('4'), card('5', 'spades')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT);
    expect(result.values[0]).toBe(5); // high card is 5, not Ace
  });

  test('detects Ace-high Straight (10-J-Q-K-A)', () => {
    const cards = [card('10'), card('J', 'diamonds'), card('Q', 'clubs'), card('K'), card('A', 'spades')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT);
    expect(result.values[0]).toBe(14);
  });

  test('detects Flush', () => {
    const cards = [card('2', 'clubs'), card('5', 'clubs'), card('8', 'clubs'), card('J', 'clubs'), card('A', 'clubs')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.FLUSH);
    expect(result.multiplier).toBe(6);
  });

  test('detects Full House', () => {
    const cards = [card('9'), card('9', 'diamonds'), card('9', 'clubs'), card('K'), card('K', 'spades')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.FULL_HOUSE);
    expect(result.multiplier).toBe(8);
    expect(result.values[0]).toBe(9);  // trips
    expect(result.values[1]).toBe(13); // pair
  });

  test('detects Four of a Kind', () => {
    const cards = [card('6'), card('6', 'diamonds'), card('6', 'clubs'), card('6', 'spades'), card('A')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.FOUR_OF_A_KIND);
    expect(result.multiplier).toBe(25);
  });

  test('detects Straight Flush', () => {
    const cards = [card('4', 'spades'), card('5', 'spades'), card('6', 'spades'), card('7', 'spades'), card('8', 'spades')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT_FLUSH);
    expect(result.multiplier).toBe(50);
  });

  test('detects Royal Flush', () => {
    const cards = [card('10', 'hearts'), card('J', 'hearts'), card('Q', 'hearts'), card('K', 'hearts'), card('A', 'hearts')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
    expect(result.multiplier).toBe(100);
  });
});

describe('compareHands — ranking order', () => {
  test('flush beats straight', () => {
    const flush = evaluateHand([card('2', 'clubs'), card('5', 'clubs'), card('8', 'clubs'), card('J', 'clubs'), card('A', 'clubs')]);
    const straight = evaluateHand([card('5'), card('6', 'diamonds'), card('7', 'clubs'), card('8'), card('9', 'spades')]);
    expect(compareHands(flush, straight)).toBeGreaterThan(0);
  });

  test('full house beats flush', () => {
    const fullHouse = evaluateHand([card('3'), card('3', 'diamonds'), card('3', 'clubs'), card('8'), card('8', 'spades')]);
    const flush = evaluateHand([card('2', 'clubs'), card('5', 'clubs'), card('8', 'clubs'), card('J', 'clubs'), card('A', 'clubs')]);
    expect(compareHands(fullHouse, flush)).toBeGreaterThan(0);
  });

  test('four of a kind beats full house', () => {
    const quads = evaluateHand([card('4'), card('4', 'diamonds'), card('4', 'clubs'), card('4', 'spades'), card('K')]);
    const fullHouse = evaluateHand([card('A'), card('A', 'diamonds'), card('A', 'clubs'), card('K'), card('K', 'spades')]);
    expect(compareHands(quads, fullHouse)).toBeGreaterThan(0);
  });
});

describe('compareHands — tiebreaking', () => {
  test('higher pair wins', () => {
    const pairK = evaluateHand([card('K'), card('K', 'diamonds'), card('3'), card('5', 'clubs'), card('7', 'spades')]);
    const pair9 = evaluateHand([card('9'), card('9', 'diamonds'), card('3'), card('5', 'clubs'), card('7', 'spades')]);
    expect(compareHands(pairK, pair9)).toBeGreaterThan(0);
  });

  test('same pair, higher kicker wins', () => {
    const pairA_highKicker = evaluateHand([card('A'), card('A', 'diamonds'), card('K'), card('5', 'clubs'), card('3', 'spades')]);
    const pairA_lowKicker = evaluateHand([card('A', 'clubs'), card('A', 'spades'), card('Q'), card('5', 'diamonds'), card('3')]);
    expect(compareHands(pairA_highKicker, pairA_lowKicker)).toBeGreaterThan(0);
  });

  test('identical hands tie', () => {
    const h1 = evaluateHand([card('9'), card('9', 'diamonds'), card('K'), card('5', 'clubs'), card('3', 'spades')]);
    const h2 = evaluateHand([card('9', 'clubs'), card('9', 'spades'), card('K', 'diamonds'), card('5'), card('3')]);
    expect(compareHands(h1, h2)).toBe(0);
  });
});

describe('payout multipliers', () => {
  test('all multipliers are correct', () => {
    // High Card → 0x
    const highCard = evaluateHand([card('2'), card('5', 'diamonds'), card('9', 'clubs'), card('J'), card('A', 'spades')]);
    expect(highCard.multiplier).toBe(0);

    // Pair → 1x
    const pair = evaluateHand([card('7'), card('7', 'diamonds'), card('3'), card('9', 'clubs'), card('K', 'spades')]);
    expect(pair.multiplier).toBe(1);

    // Two Pair → 2x
    const twoPair = evaluateHand([card('10'), card('10', 'diamonds'), card('4'), card('4', 'clubs'), card('A', 'spades')]);
    expect(twoPair.multiplier).toBe(2);

    // Three of a Kind → 3x
    const trips = evaluateHand([card('Q'), card('Q', 'diamonds'), card('Q', 'clubs'), card('5'), card('8', 'spades')]);
    expect(trips.multiplier).toBe(3);

    // Straight → 5x
    const straight = evaluateHand([card('5'), card('6', 'diamonds'), card('7', 'clubs'), card('8'), card('9', 'spades')]);
    expect(straight.multiplier).toBe(5);

    // Flush → 6x
    const flush = evaluateHand([card('2', 'clubs'), card('5', 'clubs'), card('8', 'clubs'), card('J', 'clubs'), card('A', 'clubs')]);
    expect(flush.multiplier).toBe(6);

    // Full House → 8x
    const fullHouse = evaluateHand([card('9'), card('9', 'diamonds'), card('9', 'clubs'), card('K'), card('K', 'spades')]);
    expect(fullHouse.multiplier).toBe(8);

    // Four of a Kind → 25x
    const quads = evaluateHand([card('6'), card('6', 'diamonds'), card('6', 'clubs'), card('6', 'spades'), card('A')]);
    expect(quads.multiplier).toBe(25);

    // Straight Flush → 50x
    const sf = evaluateHand([card('4', 'spades'), card('5', 'spades'), card('6', 'spades'), card('7', 'spades'), card('8', 'spades')]);
    expect(sf.multiplier).toBe(50);

    // Royal Flush → 100x
    const rf = evaluateHand([card('10', 'hearts'), card('J', 'hearts'), card('Q', 'hearts'), card('K', 'hearts'), card('A', 'hearts')]);
    expect(rf.multiplier).toBe(100);
  });
});

describe('edge cases', () => {
  test('throws for wrong number of cards', () => {
    expect(() => evaluateHand([card('A'), card('K')])).toThrow('exactly 5 cards');
  });

  test('K-A is NOT a straight (no wrap-around)', () => {
    // Q-K-A-2-3 should be High Card, not a straight
    const cards = [card('Q'), card('K', 'diamonds'), card('A', 'clubs'), card('2'), card('3', 'spades')];
    const result = evaluateHand(cards);
    expect(result.rank).toBe(HAND_RANKS.HIGH_CARD);
  });
});
