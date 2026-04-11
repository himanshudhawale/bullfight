import { Card } from '../../../shared/types';
import { createDeck, shuffleDeck } from './deck';
import { evaluatePokerHand, comparePokerHands, PokerHandResult } from './poker/handRanker';

// ---- Constants ----

export const STAGES = ['preflop', 'flop', 'turn', 'river'] as const;
export const BETTING_STAGES = ['preflop', 'flop', 'turn'] as const;

const STAGE_DELAY_MS = 30_000;
const RESULT_PAUSE_MS = 30_000;
const COUNTDOWN_TICK_MS = 1_000;
const HOUSE_EDGE = 0.10;
export const MIN_BET = 100;
const MAX_MULTIPLIER = 100_000;
const PROB_THRESHOLD = 0;
const MC_ITERATIONS = 1500;

export const HAND_RANK: Record<string, number> = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
};

export const HAND_NAMES: Record<number, string> = {
  0: 'High Card',
  1: 'One Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
  9: 'Royal Straight Flush',
};

// ---- Types ----

export type BullfightStage = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'paused';

export interface PlayerInfo {
  cards: Card[];
  name: string;
  emoji: string;
}

export interface BetInfo {
  amount: number;
  multiplier: number;
}

export interface PlaceBetResult {
  ok: boolean;
  error?: string;
  betType?: string;
  amount?: number;
  multiplier?: number;
  chipsLeft?: number;
}

export interface PayoutInfo {
  userId: string;
  betType: string;
  amount: number;
  multiplier: number;
  payout: number;
  won: boolean;
  push: boolean;
}

export interface HandResultSummary {
  name: string;
  rank: number;
}

export interface RoundResults {
  roundNumber: number;
  winner: 'a' | 'b' | 'tie';
  resultA: HandResultSummary;
  resultB: HandResultSummary;
  payouts: PayoutInfo[];
}

export interface PreDealtInfo {
  playerACards: Card[];
  playerBCards: Card[];
  community: Card[];
  burns: Card[];
  roundNumber?: number;
}

export interface RoundStartInfo {
  tierId: string;
  roundNumber: number;
  playerACards: Card[];
  playerBCards: Card[];
  community: Card[];
  burns: Card[];
  winner: 'a' | 'b' | 'tie';
  resultA: HandResultSummary;
  resultB: HandResultSummary;
}

export interface OddsResult {
  handProbs: Record<number, number>;
  winnerProbs: { a: number; b: number };
}

export interface SerializedBets {
  [key: string]: { total: number; count: number };
}

export interface GameState {
  tierId: string;
  roundNumber: number;
  stage: BullfightStage;
  countdown: number;
  playerA: { name: string; emoji: string; cards: Card[] };
  playerB: { name: string; emoji: string; cards: Card[] };
  community: Card[];
  bets: SerializedBets;
  resultA: HandResultSummary | null;
  resultB: HandResultSummary | null;
  winner: 'a' | 'b' | 'tie' | null;
  lastResults: RoundResults | null;
  multipliers: Record<string, number>;
  winnerProbs: { a: number; b: number };
  handNames: Record<number, string>;
  minBet: number;
  roundTotalBets: number;
  chips: number;
}

// ---- Utility ----

/** Partial Fisher-Yates to sample n cards without replacement (Math.random for MC speed) */
function sampleCards(deck: Card[], n: number): Card[] {
  if (n <= 0) return [];
  const d = [...deck];
  const result: Card[] = [];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (d.length - i));
    [d[i], d[j]] = [d[j], d[i]];
    result.push(d[i]);
  }
  return result;
}

// ---- BullfightGame ----

export class BullfightGame {
  tierId: string;
  roundNumber: number;
  stage: BullfightStage;
  deck: Card[];
  playerA: PlayerInfo;
  playerB: PlayerInfo;
  community: Card[];
  bets: Map<string, Map<string, BetInfo>>;
  chipBalances: Map<string, number>;
  _betHistory: Map<string, Array<{
    roundNumber: number;
    betType: string;
    amount: number;
    multiplier: number;
    payout: number;
    won: boolean;
    winnerHand: string;
    stage: string;
    timestamp: string;
  }>>;
  countdown: number;
  timer: ReturnType<typeof setTimeout> | null;
  countdownTimer: ReturnType<typeof setInterval> | null;
  running: boolean;
  resultA: PokerHandResult | null;
  resultB: PokerHandResult | null;
  winner: 'a' | 'b' | 'tie' | null;
  lastResults: RoundResults | null;
  currentMultipliers: Record<string, number>;
  winnerProbs: { a: number; b: number };
  roundTotalBets: number;
  _broadcastFn: () => void;
  onRoundEnd: ((results: RoundResults) => void) | null;
  onChipsChanged: ((userId: string, chips: number) => void) | null;
  onRoundStart: ((info: RoundStartInfo) => void) | null;
  onStageChange: ((stage: BullfightStage) => void) | null;

  private _preDealtCommunity: Card[];
  private _preDealtBurns: Card[];

  constructor(tierId: string) {
    this.tierId = tierId;
    this.roundNumber = 0;
    this.stage = 'idle';
    this.deck = [];
    this.playerA = { cards: [], name: 'Player A', emoji: '🅰️' };
    this.playerB = { cards: [], name: 'Player B', emoji: '🅱️' };
    this.community = [];
    this.bets = new Map();
    this.chipBalances = new Map();
    this._betHistory = new Map();
    this.countdown = 0;
    this.timer = null;
    this.countdownTimer = null;
    this.running = false;
    this.resultA = null;
    this.resultB = null;
    this.winner = null;
    this.lastResults = null;
    this.currentMultipliers = {};
    this.winnerProbs = { a: 0.5, b: 0.5 };
    this.roundTotalBets = 0;
    this._broadcastFn = () => {};
    this.onRoundEnd = null;
    this.onChipsChanged = null;
    this.onRoundStart = null;
    this.onStageChange = null;
    this._preDealtCommunity = [];
    this._preDealtBurns = [];
  }

  startRound(preDealt?: PreDealtInfo): void {
    this.roundNumber++;
    this.bets = new Map();
    this.resultA = null;
    this.resultB = null;
    this.winner = null;
    this.roundTotalBets = 0;

    if (preDealt) {
      this.playerA.cards = preDealt.playerACards;
      this.playerB.cards = preDealt.playerBCards;
      this._preDealtCommunity = preDealt.community;
      this._preDealtBurns = preDealt.burns;
      this.community = [];
      this.roundNumber = preDealt.roundNumber || this.roundNumber;
    } else {
      this.deck = shuffleDeck(createDeck());
      this.playerA.cards = [this.deck.pop()!, this.deck.pop()!];
      this.playerB.cards = [this.deck.pop()!, this.deck.pop()!];
      const burn1 = this.deck.pop()!;
      const flop: Card[] = [this.deck.pop()!, this.deck.pop()!, this.deck.pop()!];
      const burn2 = this.deck.pop()!;
      const turnCard = this.deck.pop()!;
      const burn3 = this.deck.pop()!;
      const riverCard = this.deck.pop()!;
      this._preDealtCommunity = [...flop, turnCard, riverCard];
      this._preDealtBurns = [burn1, burn2, burn3];
      this.community = [];

      const preA = evaluatePokerHand([...this.playerA.cards, ...this._preDealtCommunity]);
      const preB = evaluatePokerHand([...this.playerB.cards, ...this._preDealtCommunity]);
      const preCmp = comparePokerHands(preA, preB);
      const preWinner: 'a' | 'b' | 'tie' = preCmp > 0 ? 'a' : preCmp < 0 ? 'b' : 'tie';

      if (this.onRoundStart) {
        this.onRoundStart({
          tierId: this.tierId,
          roundNumber: this.roundNumber,
          playerACards: this.playerA.cards,
          playerBCards: this.playerB.cards,
          community: this._preDealtCommunity,
          burns: this._preDealtBurns,
          winner: preWinner,
          resultA: { name: preA.rankName, rank: preA.rank },
          resultB: { name: preB.rankName, rank: preB.rank },
        });
      }
    }

    this._setStage('preflop');
  }

  private _setStage(stage: BullfightStage): void {
    this.stage = stage;
    if (stage === 'flop') {
      this.community = this._preDealtCommunity.slice(0, 3);
    } else if (stage === 'turn') {
      this.community = this._preDealtCommunity.slice(0, 4);
    } else if (stage === 'river') {
      this.community = this._preDealtCommunity.slice(0, 5);
    }

    const odds = this._calculateOdds();
    this.currentMultipliers = this._computeMultipliers(odds);
    this.winnerProbs = odds.winnerProbs;

    if (this.onStageChange) this.onStageChange(stage);

    if (stage === 'river') {
      this._resolve();
      return;
    }

    // When the winner is already certain (very high probability), disable
    // winner bets (set multiplier to 0) but keep hand-type bets open since
    // the final hand rank can still change with remaining community cards.
    if (stage !== 'preflop' && (odds.winnerProbs.a >= 0.999 || odds.winnerProbs.b >= 0.999 || this._isOutcomeLocked())) {
      this.currentMultipliers['winner_a'] = 0;
      this.currentMultipliers['winner_b'] = 0;
    }

    // When the winning hand type is already locked (e.g., player already has
    // a flush and remaining cards can't change the winning hand rank), disable
    // hand-type bets but keep winner bets open if the winner is still uncertain.
    if (stage !== 'preflop' && this._isHandTypeLocked()) {
      for (const rank of Object.values(HAND_RANK)) {
        this.currentMultipliers[`hand_${rank}`] = 0;
      }
    }

    this.countdown = Math.floor(STAGE_DELAY_MS / 1000);
    this._broadcastFn();

    this.countdownTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(this.countdownTimer!);
        this.countdownTimer = null;
      }
      this._broadcastFn();
    }, COUNTDOWN_TICK_MS);

    this.timer = setTimeout(() => {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      const idx = (STAGES as readonly string[]).indexOf(stage);
      if (idx >= 0 && idx < STAGES.length - 1) {
        this._setStage(STAGES[idx + 1]);
      }
    }, STAGE_DELAY_MS);
  }

  private _calculateOdds(): OddsResult {
    const knownCards = [...this.playerA.cards, ...this.playerB.cards, ...this.community];
    const knownSet = new Set(knownCards.map(c => `${c.rank}${c.suit}`));
    const remaining = createDeck().filter(c => !knownSet.has(`${c.rank}${c.suit}`));
    const needCards = 5 - this.community.length;

    if (needCards === 0) {
      const rA = evaluatePokerHand([...this.playerA.cards, ...this.community]);
      const rB = evaluatePokerHand([...this.playerB.cards, ...this.community]);
      const cmp = comparePokerHands(rA, rB);
      const winHand = cmp >= 0 ? rA : rB;
      const handProbs: Record<number, number> = {};
      for (const rank of Object.values(HAND_RANK)) {
        handProbs[rank] = rank === winHand.rank ? 1.0 : 0;
      }
      const aWin = cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
      return { handProbs, winnerProbs: { a: aWin, b: 1 - aWin } };
    }

    const handCounts: Record<number, number> = {};
    let aWins = 0;
    let bWins = 0;

    for (let i = 0; i < MC_ITERATIONS; i++) {
      const sampled = sampleCards(remaining, needCards);
      const fullComm = [...this.community, ...sampled];
      const rA = evaluatePokerHand([...this.playerA.cards, ...fullComm]);
      const rB = evaluatePokerHand([...this.playerB.cards, ...fullComm]);
      const cmp = comparePokerHands(rA, rB);
      const winHand = cmp >= 0 ? rA : rB;
      handCounts[winHand.rank] = (handCounts[winHand.rank] || 0) + 1;
      if (cmp > 0) aWins++;
      else if (cmp < 0) bWins++;
      else { aWins += 0.5; bWins += 0.5; }
    }

    const handProbs: Record<number, number> = {};
    for (const rank of Object.values(HAND_RANK)) {
      handProbs[rank] = (handCounts[rank] || 0) / MC_ITERATIONS;
    }
    return {
      handProbs,
      winnerProbs: { a: aWins / MC_ITERATIONS, b: bWins / MC_ITERATIONS },
    };
  }

  /**
   * Check if the winner is already locked regardless of remaining community cards.
   * Evaluates the final pre-dealt board and checks whether ANY possible remaining
   * cards could change the winner. If not, the outcome is locked.
   */
  private _isOutcomeLocked(): boolean {
    if (this.community.length >= 5) return true; // already all revealed

    // Evaluate with the full pre-dealt board (what the final result WILL be)
    const finalA = evaluatePokerHand([...this.playerA.cards, ...this._preDealtCommunity]);
    const finalB = evaluatePokerHand([...this.playerB.cards, ...this._preDealtCommunity]);
    const finalCmp = comparePokerHands(finalA, finalB);

    // Evaluate with just the currently visible cards
    const currentA = evaluatePokerHand([...this.playerA.cards, ...this.community]);
    const currentB = evaluatePokerHand([...this.playerB.cards, ...this.community]);
    const currentCmp = comparePokerHands(currentA, currentB);

    // If one player already has a hand that the other can't beat even with remaining
    // cards (same winner now and on final board), AND the current leading hand rank
    // is already >= the final rank (meaning remaining cards can't help the loser),
    // the outcome is locked.
    if (currentCmp === 0 || finalCmp === 0) return false; // ties are tricky, don't skip

    // Both must agree on the same winner
    if ((currentCmp > 0) !== (finalCmp > 0)) return false;

    // The current leader's hand must already be unbeatable:
    // Their current hand rank must be >= opponent's final hand rank
    const leader = currentCmp > 0 ? currentA : currentB;
    const opponentFinal = currentCmp > 0 ? finalB : finalA;

    // If the leader already has a better rank than the opponent's BEST possible
    // (which is their final board result), the outcome is locked
    return leader.rank > opponentFinal.rank;
  }

  /**
   * Check if the winning hand TYPE is already determined.
   * Only returns true when ALL 5 community cards are visible — before that,
   * remaining cards can always change hand ranks (e.g. two pair → full house).
   * Players should always be able to bet on hand types while cards are still coming.
   */
  private _isHandTypeLocked(): boolean {
    return this.community.length >= 5;
  }

  private _computeMultipliers(odds: OddsResult): Record<string, number> {
    const communityCount = this.community.length;
    const multipliers: Record<string, number> = {};
    // Fixed baseline multipliers used at preflop when Monte Carlo has no community cards
    const BASELINE_MULT: Record<number, number> = {
      9: 15000, 8: 1700, 7: 300, 6: 20, 5: 18,
      4: 12, 3: 13, 2: 3, 1: 2.6, 0: 16,
    };
    for (const rank of Object.values(HAND_RANK)) {
      const prob = odds.handProbs[rank] || 0;
      if (prob <= PROB_THRESHOLD) {
        if (communityCount === 0) {
          // Preflop: no community cards yet, use baseline multipliers
          multipliers[`hand_${rank}`] = BASELINE_MULT[rank] ?? 0;
        } else {
          // Flop/Turn/River: Monte Carlo has real data, 0 prob = impossible
          multipliers[`hand_${rank}`] = 0;
        }
      } else {
        const raw = (1 - HOUSE_EDGE) / prob;
        multipliers[`hand_${rank}`] = Math.min(MAX_MULTIPLIER, Math.max(1.1, Math.round(raw * 10) / 10));
      }
    }
    for (const side of ['a', 'b'] as const) {
      const prob = odds.winnerProbs[side] || 0;
      if (prob <= PROB_THRESHOLD) {
        multipliers[`winner_${side}`] = 0;
      } else {
        const raw = (1 - HOUSE_EDGE) / prob;
        multipliers[`winner_${side}`] = Math.min(MAX_MULTIPLIER, Math.max(1.1, Math.round(raw * 10) / 10));
      }
    }
    return multipliers;
  }

  private _resolve(): void {
    const allA = [...this.playerA.cards, ...this.community];
    const allB = [...this.playerB.cards, ...this.community];
    this.resultA = evaluatePokerHand(allA);
    this.resultB = evaluatePokerHand(allB);

    const cmp = comparePokerHands(this.resultA, this.resultB);
    this.winner = cmp > 0 ? 'a' : cmp < 0 ? 'b' : 'tie';
    const winningHand = this.winner === 'b' ? this.resultB : this.resultA;

    const payouts: PayoutInfo[] = [];
    for (const [betKey, userBets] of this.bets) {
      for (const [userId, betInfo] of userBets) {
        let won = false;
        let push = false;

        if (betKey === 'winner_a') {
          if (this.winner === 'a') won = true;
          else if (this.winner === 'tie') push = true;
        } else if (betKey === 'winner_b') {
          if (this.winner === 'b') won = true;
          else if (this.winner === 'tie') push = true;
        } else if (betKey.startsWith('hand_')) {
          const handRank = parseInt(betKey.split('_')[1], 10);
          if (winningHand.rank === handRank) won = true;
        }

        let payout = 0;
        if (push) {
          payout = betInfo.amount;
        } else if (won) {
          payout = Math.floor(betInfo.amount * betInfo.multiplier);
        }

        if (payout > 0) {
          const current = this.chipBalances.get(userId) || 0;
          this.chipBalances.set(userId, current + payout);
          if (this.onChipsChanged) this.onChipsChanged(userId, this.chipBalances.get(userId)!);
        }

        payouts.push({
          userId,
          betType: betKey,
          amount: betInfo.amount,
          multiplier: won ? betInfo.multiplier : 0,
          payout,
          won,
          push,
        });

        // Track bet history for "last 15 plays"
        if (!this._betHistory.has(userId)) this._betHistory.set(userId, []);
        const hist = this._betHistory.get(userId)!;
        hist.push({
          roundNumber: this.roundNumber,
          betType: betKey,
          amount: betInfo.amount,
          multiplier: betInfo.multiplier,
          payout,
          won,
          winnerHand: winningHand.rankName,
          stage: this.stage,
          timestamp: new Date().toISOString(),
        });
        if (hist.length > 15) hist.splice(0, hist.length - 15);
      }
    }

    this.lastResults = {
      roundNumber: this.roundNumber,
      winner: this.winner,
      resultA: { name: this.resultA.rankName, rank: this.resultA.rank },
      resultB: { name: this.resultB.rankName, rank: this.resultB.rank },
      payouts,
    };

    this.stage = 'showdown';
    this._broadcastFn();
    if (this.onRoundEnd) this.onRoundEnd(this.lastResults);

    if (this.running) {
      this.countdown = Math.floor(RESULT_PAUSE_MS / 1000);
      this.countdownTimer = setInterval(() => {
        this.countdown--;
        if (this.countdown <= 0) {
          clearInterval(this.countdownTimer!);
          this.countdownTimer = null;
        }
        this._broadcastFn();
      }, COUNTDOWN_TICK_MS);

      this.timer = setTimeout(() => {
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
        if (this.running) this.startRound();
      }, RESULT_PAUSE_MS);
    }
  }

  placeBet(userId: string, betType: string, amount: number): PlaceBetResult {
    if (!(BETTING_STAGES as readonly string[]).includes(this.stage)) {
      return { ok: false, error: 'Betting is closed.' };
    }

    // Hand-type bets locked after turn (community fully dealt)
    if (betType.startsWith('hand_') && this.community.length >= 5) {
      return { ok: false, error: 'Hand bets are closed.' };
    }

    if (amount < MIN_BET) {
      return { ok: false, error: `Minimum bet: ${MIN_BET.toLocaleString()} chips.` };
    }

    const chips = this.chipBalances.get(userId) || 0;
    if (chips < amount) {
      return { ok: false, error: `Not enough chips. You have ${chips.toLocaleString()}.` };
    }

    const multiplier = this.currentMultipliers[betType];
    if (!multiplier || multiplier <= 0) {
      return { ok: false, error: 'This outcome is no longer possible.' };
    }

    this.chipBalances.set(userId, chips - amount);
    if (this.onChipsChanged) this.onChipsChanged(userId, this.chipBalances.get(userId)!);

    if (!this.bets.has(betType)) this.bets.set(betType, new Map());
    const userBets = this.bets.get(betType)!;
    const existing = userBets.get(userId);
    if (existing) {
      const totalAmount = existing.amount + amount;
      const avgMultiplier =
        (existing.amount * existing.multiplier + amount * multiplier) / totalAmount;
      userBets.set(userId, {
        amount: totalAmount,
        multiplier: Math.round(avgMultiplier * 10) / 10,
      });
    } else {
      userBets.set(userId, { amount, multiplier });
    }

    this.roundTotalBets += amount;
    return { ok: true, betType, amount, multiplier, chipsLeft: this.chipBalances.get(userId) };
  }

  buyChips(userId: string, amount: number): number {
    const current = this.chipBalances.get(userId) || 0;
    this.chipBalances.set(userId, current + amount);
    return this.chipBalances.get(userId)!;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startRound();
  }

  stop(): void {
    this.running = false;
    this.stage = 'paused';
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
    this._broadcastFn();
  }

  destroy(): void {
    this.stop();
    this.stage = 'idle';
  }

  getState(userId?: string): GameState {
    return {
      tierId: this.tierId,
      roundNumber: this.roundNumber,
      stage: this.stage,
      countdown: this.countdown,
      playerA: { name: this.playerA.name, emoji: this.playerA.emoji, cards: this.playerA.cards },
      playerB: { name: this.playerB.name, emoji: this.playerB.emoji, cards: this.playerB.cards },
      community: this.community,
      bets: this._serializeBets(),
      resultA: this.resultA ? { name: this.resultA.rankName, rank: this.resultA.rank } : null,
      resultB: this.resultB ? { name: this.resultB.rankName, rank: this.resultB.rank } : null,
      winner: this.winner,
      lastResults: this.lastResults,
      multipliers: this.currentMultipliers,
      winnerProbs: this.winnerProbs,
      handNames: HAND_NAMES,
      minBet: MIN_BET,
      roundTotalBets: this.roundTotalBets,
      chips: userId ? (this.chipBalances.get(userId) || 0) : 0,
    };
  }

  private _serializeBets(): SerializedBets {
    const obj: SerializedBets = {};
    for (const [key, userBets] of this.bets) {
      let total = 0;
      let count = 0;
      for (const [, info] of userBets) {
        total += info.amount;
        count++;
      }
      obj[key] = { total, count };
    }
    return obj;
  }
}
