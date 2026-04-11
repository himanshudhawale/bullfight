import { Card } from '../../shared/types';
import { evaluatePokerHand, comparePokerHands, PokerHandResult } from '../src/game/poker/handRanker';
import { startPokerGame, pokerAction, getClientState } from '../src/game/poker/gameSession';

// Helper to build cards quickly
function card(rank: string, suit: string): Card {
  return { rank: rank as Card['rank'], suit: suit as Card['suit'] };
}

describe('Hand Evaluator', () => {
  test('detects Royal Flush', () => {
    const cards: Card[] = [
      card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'),
      card('J', 'spades'), card('10', 'spades'),
      card('3', 'hearts'), card('7', 'diamonds'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(9);
    expect(result.rankName).toBe('Royal Flush');
  });

  test('detects Straight Flush', () => {
    const cards: Card[] = [
      card('9', 'hearts'), card('8', 'hearts'), card('7', 'hearts'),
      card('6', 'hearts'), card('5', 'hearts'),
      card('2', 'clubs'), card('K', 'diamonds'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(8);
    expect(result.rankName).toBe('Straight Flush');
  });

  test('detects Four of a Kind', () => {
    const cards: Card[] = [
      card('J', 'hearts'), card('J', 'diamonds'), card('J', 'clubs'),
      card('J', 'spades'), card('A', 'hearts'),
      card('3', 'clubs'), card('7', 'diamonds'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(7);
    expect(result.rankName).toBe('Four of a Kind');
  });

  test('detects Full House', () => {
    const cards: Card[] = [
      card('K', 'hearts'), card('K', 'diamonds'), card('K', 'clubs'),
      card('9', 'spades'), card('9', 'hearts'),
      card('2', 'clubs'), card('5', 'diamonds'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(6);
    expect(result.rankName).toBe('Full House');
  });

  test('detects Flush', () => {
    const cards: Card[] = [
      card('A', 'diamonds'), card('J', 'diamonds'), card('9', 'diamonds'),
      card('6', 'diamonds'), card('3', 'diamonds'),
      card('K', 'clubs'), card('2', 'spades'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(5);
    expect(result.rankName).toBe('Flush');
  });

  test('detects Straight', () => {
    const cards: Card[] = [
      card('10', 'hearts'), card('9', 'clubs'), card('8', 'diamonds'),
      card('7', 'spades'), card('6', 'hearts'),
      card('2', 'clubs'), card('K', 'diamonds'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(4);
    expect(result.rankName).toBe('Straight');
  });

  test('detects Three of a Kind', () => {
    const cards: Card[] = [
      card('8', 'hearts'), card('8', 'diamonds'), card('8', 'clubs'),
      card('A', 'spades'), card('K', 'hearts'),
      card('3', 'clubs'), card('5', 'diamonds'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(3);
    expect(result.rankName).toBe('Three of a Kind');
  });

  test('detects Two Pair', () => {
    const cards: Card[] = [
      card('A', 'hearts'), card('A', 'diamonds'), card('9', 'clubs'),
      card('9', 'spades'), card('K', 'hearts'),
      card('3', 'clubs'), card('5', 'diamonds'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(2);
    expect(result.rankName).toBe('Two Pair');
  });

  test('detects One Pair', () => {
    const cards: Card[] = [
      card('Q', 'hearts'), card('Q', 'diamonds'), card('A', 'clubs'),
      card('9', 'spades'), card('7', 'hearts'),
      card('3', 'clubs'), card('2', 'diamonds'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(1);
    expect(result.rankName).toBe('One Pair');
  });

  test('detects High Card', () => {
    const cards: Card[] = [
      card('A', 'hearts'), card('K', 'diamonds'), card('9', 'clubs'),
      card('7', 'spades'), card('4', 'hearts'),
      card('3', 'clubs'), card('2', 'diamonds'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(0);
    expect(result.rankName).toBe('High Card');
  });

  test('detects Ace-low straight (A-2-3-4-5)', () => {
    const cards: Card[] = [
      card('A', 'hearts'), card('2', 'diamonds'), card('3', 'clubs'),
      card('4', 'spades'), card('5', 'hearts'),
      card('9', 'clubs'), card('K', 'diamonds'),
    ];
    const result = evaluatePokerHand(cards);
    expect(result.rank).toBe(4);
    expect(result.rankName).toBe('Straight');
    expect(result.kickers[0]).toBe(5); // 5-high straight
  });
});

describe('Hand Comparison', () => {
  test('flush beats straight', () => {
    const flush = evaluatePokerHand([
      card('A', 'diamonds'), card('J', 'diamonds'), card('9', 'diamonds'),
      card('6', 'diamonds'), card('3', 'diamonds'),
      card('K', 'clubs'), card('2', 'spades'),
    ]);
    const straight = evaluatePokerHand([
      card('10', 'hearts'), card('9', 'clubs'), card('8', 'diamonds'),
      card('7', 'spades'), card('6', 'hearts'),
      card('2', 'clubs'), card('3', 'diamonds'),
    ]);
    expect(comparePokerHands(flush, straight)).toBeGreaterThan(0);
  });

  test('higher pair beats lower pair', () => {
    const aces = evaluatePokerHand([
      card('A', 'hearts'), card('A', 'diamonds'), card('9', 'clubs'),
      card('7', 'spades'), card('4', 'hearts'),
      card('3', 'clubs'), card('2', 'diamonds'),
    ]);
    const kings = evaluatePokerHand([
      card('K', 'hearts'), card('K', 'diamonds'), card('9', 'clubs'),
      card('7', 'spades'), card('4', 'hearts'),
      card('3', 'clubs'), card('2', 'diamonds'),
    ]);
    expect(comparePokerHands(aces, kings)).toBeGreaterThan(0);
  });
});

describe('Game Session', () => {
  test('startPokerGame creates a valid game state', async () => {
    const state = await startPokerGame('test-user', 'monte_carlo');
    expect(state.id).toBeTruthy();
    expect(state.phase).toBe('preflop');
    expect(state.playerHole).toHaveLength(2);
    expect(state.botHole).toHaveLength(2);
    expect(state.community).toHaveLength(0);
    expect(state.smallBlind).toBe(50);
    expect(state.bigBlind).toBe(100);
    expect(state.pot).toBe(150); // SB + BB
    expect(state.playerChips).toBe(950);  // 1000 - 50 SB
    expect(state.botChips).toBe(900);     // 1000 - 100 BB
  });

  test('player fold gives pot to bot', async () => {
    const state = await startPokerGame('test-user', 'monte_carlo');
    const result = await pokerAction(state.id, 'test-user', 'fold');
    expect(result.phase).toBe('complete');
    expect(result.result?.winner).toBe('bot');
    expect(result.result?.payout).toBe(0);
  });

  test('getClientState hides bot cards during play', async () => {
    const state = await startPokerGame('test-user', 'monte_carlo');
    const client = getClientState(state);
    expect(client.botHole).toBeUndefined();
    expect(client.playerHole).toHaveLength(2);
  });

  test('getClientState reveals bot cards after game over', async () => {
    const state = await startPokerGame('test-user', 'monte_carlo');
    const result = await pokerAction(state.id, 'test-user', 'fold');
    const client = getClientState(result);
    expect(client.botHole).toHaveLength(2);
    expect(client.result).toBeDefined();
  });

  test('rejects invalid tier', async () => {
    await expect(startPokerGame('test-user', 'invalid_tier')).rejects.toThrow('Invalid tier');
  });
});
