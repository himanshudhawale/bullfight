import { createDeck, shuffleDeck, dealHands, cardValue, isFaceCard } from '../src/game/deck';

describe('deck', () => {
  test('creates a standard 52-card deck', () => {
    const deck = createDeck();
    expect(deck.length).toBe(52);

    const suits = new Set(deck.map((c) => c.suit));
    expect(suits.size).toBe(4);

    const ranks = new Set(deck.map((c) => c.rank));
    expect(ranks.size).toBe(13);
  });

  test('shuffle returns all 52 cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled.length).toBe(52);

    // Same cards, possibly different order
    const original = deck.map((c) => `${c.rank}-${c.suit}`).sort();
    const result = shuffled.map((c) => `${c.rank}-${c.suit}`).sort();
    expect(result).toEqual(original);
  });

  test('shuffle produces different orders (statistical)', () => {
    const deck = createDeck();
    const s1 = shuffleDeck(deck).map((c) => `${c.rank}-${c.suit}`).join(',');
    const s2 = shuffleDeck(deck).map((c) => `${c.rank}-${c.suit}`).join(',');
    // Extremely unlikely to be the same
    expect(s1).not.toBe(s2);
  });

  test('dealHands deals correct number of 5-card hands', () => {
    const hands = dealHands(4);
    expect(hands.length).toBe(4);
    for (const hand of hands) {
      expect(hand.length).toBe(5);
    }

    // No duplicate cards across hands
    const allCards = hands.flat().map((c) => `${c.rank}-${c.suit}`);
    expect(new Set(allCards).size).toBe(20);
  });

  test('cardValue returns correct values', () => {
    expect(cardValue({ rank: 'A', suit: 'hearts' })).toBe(1);
    expect(cardValue({ rank: '5', suit: 'hearts' })).toBe(5);
    expect(cardValue({ rank: '10', suit: 'hearts' })).toBe(10);
    expect(cardValue({ rank: 'J', suit: 'hearts' })).toBe(10);
    expect(cardValue({ rank: 'Q', suit: 'hearts' })).toBe(10);
    expect(cardValue({ rank: 'K', suit: 'hearts' })).toBe(10);
  });

  test('isFaceCard identifies J, Q, K', () => {
    expect(isFaceCard({ rank: 'J', suit: 'hearts' })).toBe(true);
    expect(isFaceCard({ rank: 'Q', suit: 'hearts' })).toBe(true);
    expect(isFaceCard({ rank: 'K', suit: 'hearts' })).toBe(true);
    expect(isFaceCard({ rank: '10', suit: 'hearts' })).toBe(false);
    expect(isFaceCard({ rank: 'A', suit: 'hearts' })).toBe(false);
  });
});
