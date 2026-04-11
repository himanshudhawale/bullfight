import crypto from 'crypto';
import { Card, Suit, Rank } from '../../../shared/types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Cryptographically secure Fisher-Yates shuffle */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomBytes = crypto.randomBytes(4);
    const j = randomBytes.readUInt32BE(0) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Deal n hands of 5 cards from a shuffled deck */
export function dealHands(numPlayers: number): Card[][] {
  const deck = shuffleDeck(createDeck());
  const hands: Card[][] = [];
  for (let i = 0; i < numPlayers; i++) {
    hands.push(deck.slice(i * 5, (i + 1) * 5));
  }
  return hands;
}

/** Get numeric value of a card for Bull Fight scoring */
export function cardValue(card: Card): number {
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  if (card.rank === 'A') return 1;
  return parseInt(card.rank, 10);
}

/** Check if a card is a face card (J, Q, K) */
export function isFaceCard(card: Card): boolean {
  return ['J', 'Q', 'K'].includes(card.rank);
}
