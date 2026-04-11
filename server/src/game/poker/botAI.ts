import { PokerGameState } from './gameSession';
import { evaluatePokerHand, cardNumericValue } from './handRanker';

export interface BotDecisionResult {
  action: 'fold' | 'check' | 'call' | 'raise';
  amount?: number;
}

/** Rate hole cards pre-flop (Chen-inspired simplified score 0-20) */
function holeCardStrength(state: PokerGameState): number {
  const [c1, c2] = state.botHole;
  const v1 = cardNumericValue(c1);
  const v2 = cardNumericValue(c2);
  const high = Math.max(v1, v2);
  const low = Math.min(v1, v2);
  const paired = v1 === v2;
  const suited = c1.suit === c2.suit;
  const gap = high - low;

  let score = high; // base = high card value (2-14)
  if (paired) score += 10;
  if (suited) score += 2;
  if (gap <= 1) score += 1;
  if (gap >= 4) score -= (gap - 3);

  return Math.max(0, Math.min(20, score));
}

/** Decide the bot's action */
export function botDecision(state: PokerGameState): BotDecisionResult {
  const { phase, community, botHole, currentBet, botBet, botChips, pot, bigBlind } = state;
  const toCall = currentBet - botBet;
  const canCheck = toCall === 0;
  const rand = Math.random();

  // Pre-flop strategy based on hole card strength
  if (phase === 'preflop') {
    const strength = holeCardStrength(state);

    if (strength >= 16) {
      // Premium hand – raise
      const raiseAmt = Math.min(bigBlind * 3, botChips);
      return { action: 'raise', amount: raiseAmt };
    }
    if (strength >= 12) {
      // Good hand – call or occasionally raise
      if (rand < 0.3) {
        const raiseAmt = Math.min(bigBlind * 2, botChips);
        return { action: 'raise', amount: raiseAmt };
      }
      return canCheck ? { action: 'check' } : { action: 'call' };
    }
    if (strength >= 8) {
      // Marginal – call if cheap, else fold
      if (toCall <= bigBlind * 2) {
        return canCheck ? { action: 'check' } : { action: 'call' };
      }
      return { action: 'fold' };
    }
    // Weak hand
    if (canCheck) return { action: 'check' };
    if (toCall <= bigBlind && rand < 0.3) return { action: 'call' };
    return { action: 'fold' };
  }

  // Post-flop strategy: evaluate actual hand strength
  const allCards = [...botHole, ...community];
  const handResult = evaluatePokerHand(allCards);
  const handRank = handResult.rank;

  // Strong hand (two pair+): raise or call
  if (handRank >= 2) {
    if (handRank >= 4 && rand < 0.6) {
      // Very strong – raise
      const raiseAmt = Math.min(Math.floor(pot * 0.5) + bigBlind, botChips);
      return { action: 'raise', amount: Math.max(raiseAmt, bigBlind) };
    }
    if (handRank >= 6 && rand < 0.8) {
      // Monster – big raise
      const raiseAmt = Math.min(Math.floor(pot * 0.75) + bigBlind, botChips);
      return { action: 'raise', amount: Math.max(raiseAmt, bigBlind) };
    }
    return canCheck ? { action: 'check' } : { action: 'call' };
  }

  // One pair
  if (handRank === 1) {
    if (canCheck) {
      return rand < 0.25 ? { action: 'raise', amount: Math.min(bigBlind, botChips) } : { action: 'check' };
    }
    if (toCall <= bigBlind * 3) return { action: 'call' };
    return rand < 0.2 ? { action: 'call' } : { action: 'fold' };
  }

  // High card only
  if (canCheck) {
    // Occasional bluff
    return rand < 0.15 ? { action: 'raise', amount: Math.min(bigBlind, botChips) } : { action: 'check' };
  }
  if (toCall <= bigBlind) return rand < 0.4 ? { action: 'call' } : { action: 'fold' };
  return { action: 'fold' };
}
