import { Card, PokerPhase, PokerAction, PokerSeat, PokerPot, PokerTierConfig, PokerTableState, PokerSeatClient, TableTier } from '../../../../shared/types';
import { createDeck, shuffleDeck } from '../deck';
import { evaluatePokerHand, comparePokerHands, type PokerHandResult } from './handRanker';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ACTION_TIMEOUT_SEC = 30;
const SHOWDOWN_DELAY_MS = 5000;
const MIN_PLAYERS_TO_START = 2;

// ---------------------------------------------------------------------------
// PokerTable — multiplayer Texas Hold'em table
// ---------------------------------------------------------------------------
export class PokerTable {
  readonly tableId: string;
  readonly config: PokerTierConfig;

  seats: (PokerSeat | null)[];
  communityCards: Card[] = [];
  pots: PokerPot[] = [];
  phase: PokerPhase = 'waiting';
  dealerSeat = -1;
  activeSeat = -1;
  handNumber = 0;
  countdown = 0;
  lastAction: { seat: number; action: PokerAction; amount?: number } | null = null;
  winners: { seatIndex: number; amount: number; hand?: string }[] | null = null;

  // Internal
  private deck: Card[] = [];
  private deckIdx = 0;
  private currentBet = 0;    // largest bet on the current street
  private minRaise = 0;      // minimum raise increment
  private actionTimer: ReturnType<typeof setInterval> | null = null;
  private showdownTimer: ReturnType<typeof setTimeout> | null = null;
  private handInProgress = false;

  // Callbacks
  onStateChange: ((table: PokerTable) => void) | null = null;
  onHandComplete: ((table: PokerTable, winners: { seatIndex: number; amount: number; hand?: string }[]) => void) | null = null;

  constructor(tableId: string, config: PokerTierConfig) {
    this.tableId = tableId;
    this.config = config;
    this.seats = new Array(config.maxSeats).fill(null);
  }

  // =========================================================================
  // Seat management
  // =========================================================================

  sitDown(userId: string, displayName: string, chips: number, preferredSeat?: number, isBot = false): number {
    // Already seated?
    const existing = this.seats.findIndex(s => s?.userId === userId);
    if (existing >= 0) return existing;

    // Validate buy-in
    if (chips < this.config.minBuyIn) return -1;
    const buyIn = Math.min(chips, this.config.maxBuyIn);

    // Find seat
    let seatIdx = -1;
    if (preferredSeat !== undefined && preferredSeat >= 0 && preferredSeat < this.seats.length && !this.seats[preferredSeat]) {
      seatIdx = preferredSeat;
    } else {
      seatIdx = this.seats.findIndex(s => s === null);
    }
    if (seatIdx < 0) return -1;

    this.seats[seatIdx] = {
      seatIndex: seatIdx,
      userId,
      displayName,
      chips: buyIn,
      holeCards: [],
      currentBet: 0,
      totalBetThisRound: 0,
      folded: false,
      allIn: false,
      isBot,
      sittingOut: false,
    };

    // Auto-start if enough players and not in a hand
    if (!this.handInProgress && this._activePlayers().length >= MIN_PLAYERS_TO_START) {
      setTimeout(() => this.startHand(), 1000);
    }

    return seatIdx;
  }

  standUp(userId: string): boolean {
    const idx = this.seats.findIndex(s => s?.userId === userId);
    if (idx < 0) return false;

    if (this.handInProgress && !this.seats[idx]!.folded) {
      // Mark sitting out — will be folded on their turn
      this.seats[idx]!.sittingOut = true;
      return true;
    }

    this.seats[idx] = null;
    return true;
  }

  getPlayerCount(): number {
    return this.seats.filter(s => s !== null).length;
  }

  // =========================================================================
  // Hand lifecycle
  // =========================================================================

  startHand(): void {
    const activePlayers = this._activePlayers();
    if (activePlayers.length < MIN_PLAYERS_TO_START || this.handInProgress) return;

    this.handInProgress = true;
    this.handNumber++;
    this.phase = 'preflop';
    this.communityCards = [];
    this.pots = [];
    this.winners = null;
    this.lastAction = null;
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;

    // Reset seats
    for (const seat of this.seats) {
      if (!seat) continue;
      seat.holeCards = [];
      seat.currentBet = 0;
      seat.totalBetThisRound = 0;
      seat.folded = false;
      seat.allIn = false;
      // Remove sitting-out players with 0 chips
      if (seat.sittingOut || seat.chips <= 0) {
        seat.folded = true;
      }
    }

    // Advance dealer button
    this.dealerSeat = this._nextOccupiedSeat(this.dealerSeat);

    // Shuffle and deal
    this.deck = shuffleDeck(createDeck());
    this.deckIdx = 0;
    this._dealHoleCards();

    // Post blinds
    this._postBlinds();

    // Set active player (first to act preflop = after big blind)
    const bbSeat = activePlayers.length === 2
      ? this.dealerSeat  // heads-up: dealer is SB and acts first preflop... wait no
      : this._nextActiveSeat(this._nextActiveSeat(this.dealerSeat)); // skip SB and BB

    // Heads-up special: dealer = SB, other = BB. Preflop: SB (dealer) acts first
    if (activePlayers.length === 2) {
      this.activeSeat = this.dealerSeat; // SB/dealer acts first preflop in heads-up
    } else {
      // UTG = seat after BB
      const sbSeat = this._nextActiveSeat(this.dealerSeat);
      const bbSeatIdx = this._nextActiveSeat(sbSeat);
      this.activeSeat = this._nextActiveSeat(bbSeatIdx);
    }

    this._startActionTimer();
    this.onStateChange?.(this);
  }

  // =========================================================================
  // Player actions
  // =========================================================================

  doAction(userId: string, action: PokerAction, raiseAmount?: number): { ok: boolean; error?: string } {
    const seatIdx = this.seats.findIndex(s => s?.userId === userId);
    if (seatIdx < 0) return { ok: false, error: 'Not seated' };
    if (seatIdx !== this.activeSeat) return { ok: false, error: 'Not your turn' };
    if (this.phase === 'waiting' || this.phase === 'showdown') return { ok: false, error: 'No active hand' };

    const seat = this.seats[seatIdx]!;
    if (seat.folded || seat.allIn) return { ok: false, error: 'Cannot act' };

    switch (action) {
      case 'fold':
        return this._doFold(seatIdx);
      case 'check':
        return this._doCheck(seatIdx);
      case 'call':
        return this._doCall(seatIdx);
      case 'raise':
        return this._doRaise(seatIdx, raiseAmount ?? 0);
      case 'all_in':
        return this._doAllIn(seatIdx);
      default:
        return { ok: false, error: 'Invalid action' };
    }
  }

  private _doFold(seatIdx: number): { ok: boolean } {
    this.seats[seatIdx]!.folded = true;
    this.lastAction = { seat: seatIdx, action: 'fold' };

    // Check if only one player remains
    const remaining = this._activePlayers().filter(s => !s.folded);
    if (remaining.length === 1) {
      this._awardPotToLastPlayer(remaining[0]);
      return { ok: true };
    }

    this._advanceTurn();
    return { ok: true };
  }

  private _doCheck(seatIdx: number): { ok: boolean; error?: string } {
    const seat = this.seats[seatIdx]!;
    if (seat.currentBet < this.currentBet) {
      return { ok: false, error: 'Cannot check — must call or raise' };
    }
    this.lastAction = { seat: seatIdx, action: 'check' };
    this._advanceTurn();
    return { ok: true };
  }

  private _doCall(seatIdx: number): { ok: boolean } {
    const seat = this.seats[seatIdx]!;
    const toCall = Math.min(this.currentBet - seat.currentBet, seat.chips);

    seat.chips -= toCall;
    seat.currentBet += toCall;
    seat.totalBetThisRound += toCall;
    if (seat.chips <= 0) seat.allIn = true;

    this.lastAction = { seat: seatIdx, action: seat.allIn ? 'all_in' : 'call', amount: toCall };
    this._advanceTurn();
    return { ok: true };
  }

  private _doRaise(seatIdx: number, amount: number): { ok: boolean; error?: string } {
    const seat = this.seats[seatIdx]!;
    const toCall = this.currentBet - seat.currentBet;
    const totalNeeded = toCall + amount;

    // Minimum raise = previous raise size (or big blind)
    if (amount < this.minRaise && totalNeeded < seat.chips) {
      return { ok: false, error: `Minimum raise is ${this.minRaise}` };
    }

    // If they can't afford full raise, it's an all-in
    if (totalNeeded >= seat.chips) {
      return this._doAllIn(seatIdx);
    }

    seat.chips -= totalNeeded;
    seat.currentBet += totalNeeded;
    seat.totalBetThisRound += totalNeeded;
    this.minRaise = amount; // new minimum raise = this raise size
    this.currentBet = seat.currentBet;

    this.lastAction = { seat: seatIdx, action: 'raise', amount: totalNeeded };
    this._advanceTurn();
    return { ok: true };
  }

  private _doAllIn(seatIdx: number): { ok: boolean } {
    const seat = this.seats[seatIdx]!;
    const amount = seat.chips;

    seat.currentBet += amount;
    seat.totalBetThisRound += amount;
    seat.chips = 0;
    seat.allIn = true;

    // Update raise tracking
    const raiseBy = seat.currentBet - this.currentBet;
    if (raiseBy > 0) {
      if (raiseBy >= this.minRaise) this.minRaise = raiseBy;
      this.currentBet = seat.currentBet;
    }

    this.lastAction = { seat: seatIdx, action: 'all_in', amount };
    this._advanceTurn();
    return { ok: true };
  }

  // =========================================================================
  // Turn management
  // =========================================================================

  private _advanceTurn(): void {
    this._clearActionTimer();

    // Check if betting round is complete
    if (this._isBettingRoundComplete()) {
      this._collectBets();
      this._advancePhase();
      return;
    }

    // Next active player
    this.activeSeat = this._nextActingSeat(this.activeSeat);
    this._startActionTimer();
    this.onStateChange?.(this);
  }

  private _isBettingRoundComplete(): boolean {
    const active = this._activePlayers().filter(s => !s.folded && !s.allIn);
    if (active.length === 0) return true;
    // All active (non-folded, non-all-in) players have matched the current bet
    // and each has had a chance to act
    return active.every(s => s.currentBet === this.currentBet) && this._allHaveActed();
  }

  private _allHaveActed(): boolean {
    // After any raise, we need everyone else to act again
    // The simplest check: we've gone around and everyone matches currentBet
    const active = this._activePlayers().filter(s => !s.folded && !s.allIn);
    if (active.length === 0) return true;

    // Find next seat that would act — if it loops back to where action started after last raise, round is done
    const nextSeat = this._nextActingSeat(this.activeSeat);
    if (nextSeat < 0) return true;

    const nextPlayer = this.seats[nextSeat];
    if (!nextPlayer || nextPlayer.folded || nextPlayer.allIn) return true;

    // If the next player already matches and it's not the first action
    if (nextPlayer.currentBet === this.currentBet && this.lastAction !== null) {
      // Check if everyone matches
      return active.every(s => s.currentBet === this.currentBet);
    }

    return false;
  }

  private _advancePhase(): void {
    const remaining = this._activePlayers().filter(s => !s.folded);
    const canAct = remaining.filter(s => !s.allIn);

    // If only one player not folded, award pot
    if (remaining.length === 1) {
      this._awardPotToLastPlayer(remaining[0]);
      return;
    }

    // If everyone is all-in (or only one can act), deal remaining cards
    if (canAct.length <= 1) {
      // Run out the board
      this._dealRemainingBoard();
      this._resolveShowdown();
      return;
    }

    switch (this.phase) {
      case 'preflop':
        this.phase = 'flop';
        this._dealCommunity(3);
        break;
      case 'flop':
        this.phase = 'turn';
        this._dealCommunity(1);
        break;
      case 'turn':
        this.phase = 'river';
        this._dealCommunity(1);
        break;
      case 'river':
        this._resolveShowdown();
        return;
    }

    // Reset for new street
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;
    for (const seat of this.seats) {
      if (seat) seat.currentBet = 0;
    }

    // First to act post-flop: first active seat after dealer
    this.activeSeat = this._nextActingSeat(this.dealerSeat);
    this._startActionTimer();
    this.onStateChange?.(this);
  }

  // =========================================================================
  // Dealing
  // =========================================================================

  private _drawCard(): Card {
    return this.deck[this.deckIdx++];
  }

  private _dealHoleCards(): void {
    // Deal 2 cards to each active player (2 rounds)
    const active = this._activePlayers();
    for (let round = 0; round < 2; round++) {
      for (const seat of active) {
        if (!seat.folded) {
          seat.holeCards.push(this._drawCard());
        }
      }
    }
  }

  private _dealCommunity(count: number): void {
    // Burn one card
    this.deckIdx++;
    for (let i = 0; i < count; i++) {
      this.communityCards.push(this._drawCard());
    }
  }

  private _dealRemainingBoard(): void {
    while (this.communityCards.length < 5) {
      this.deckIdx++; // burn
      this.communityCards.push(this._drawCard());
    }
  }

  // =========================================================================
  // Blinds
  // =========================================================================

  private _postBlinds(): void {
    const active = this._activePlayers().filter(s => !s.folded);
    if (active.length < 2) return;

    let sbSeat: PokerSeat;
    let bbSeat: PokerSeat;

    if (active.length === 2) {
      // Heads-up: dealer posts SB, other posts BB
      sbSeat = this.seats[this.dealerSeat]!;
      bbSeat = this.seats[this._nextActiveSeat(this.dealerSeat)]!;
    } else {
      sbSeat = this.seats[this._nextActiveSeat(this.dealerSeat)]!;
      bbSeat = this.seats[this._nextActiveSeat(sbSeat.seatIndex)]!;
    }

    // Post small blind
    const sbAmount = Math.min(this.config.smallBlind, sbSeat.chips);
    sbSeat.chips -= sbAmount;
    sbSeat.currentBet = sbAmount;
    sbSeat.totalBetThisRound = sbAmount;
    if (sbSeat.chips <= 0) sbSeat.allIn = true;

    // Post big blind
    const bbAmount = Math.min(this.config.bigBlind, bbSeat.chips);
    bbSeat.chips -= bbAmount;
    bbSeat.currentBet = bbAmount;
    bbSeat.totalBetThisRound = bbAmount;
    if (bbSeat.chips <= 0) bbSeat.allIn = true;

    this.currentBet = bbAmount;
  }

  // =========================================================================
  // Pot management & side pots
  // =========================================================================

  private _collectBets(): void {
    const bettors = this._activePlayers().filter(s => s.totalBetThisRound > 0);
    if (bettors.length === 0) return;

    // Sort by total bet ascending to create side pots
    const sorted = [...bettors].sort((a, b) => a.totalBetThisRound - b.totalBetThisRound);

    let prevLevel = 0;
    for (const seat of sorted) {
      const level = seat.totalBetThisRound;
      if (level <= prevLevel) continue;

      const potAmount = (level - prevLevel) * bettors.filter(s => s.totalBetThisRound >= level).length;
      // But we also collect from those between prevLevel and level
      let amount = 0;
      const eligible: string[] = [];
      for (const s of bettors) {
        const contribution = Math.min(s.totalBetThisRound, level) - Math.min(s.totalBetThisRound, prevLevel);
        amount += contribution;
        if (!s.folded) eligible.push(s.userId!);
      }

      if (amount > 0) {
        // Merge with existing pot if same eligibility
        const existingPot = this.pots.find(p =>
          p.eligible.length === eligible.length && p.eligible.every(e => eligible.includes(e))
        );
        if (existingPot) {
          existingPot.amount += amount;
        } else {
          this.pots.push({ amount, eligible });
        }
      }

      prevLevel = level;
    }

    // Reset bets
    for (const seat of this.seats) {
      if (seat) seat.totalBetThisRound = 0;
    }
  }

  // =========================================================================
  // Showdown
  // =========================================================================

  private _resolveShowdown(): void {
    this._clearActionTimer();
    this.phase = 'showdown';

    // Collect any remaining bets
    this._collectBets();

    const remaining = this._activePlayers().filter(s => !s.folded);
    const results = new Map<string, PokerHandResult>();

    for (const seat of remaining) {
      const allCards = [...seat.holeCards, ...this.communityCards];
      if (allCards.length >= 5) {
        results.set(seat.userId!, evaluatePokerHand(allCards));
      }
    }

    // Award each pot
    this.winners = [];
    for (const pot of this.pots) {
      const eligible = pot.eligible
        .filter(uid => results.has(uid))
        .map(uid => ({ uid, hand: results.get(uid)! }));

      if (eligible.length === 0) continue;

      // Find best hand(s)
      eligible.sort((a, b) => comparePokerHands(b.hand, a.hand));
      const bestHand = eligible[0].hand;
      const potWinners = eligible.filter(e => comparePokerHands(e.hand, bestHand) === 0);

      const share = Math.floor(pot.amount / potWinners.length);
      let remainder = pot.amount - share * potWinners.length;

      for (const w of potWinners) {
        const seat = this.seats.find(s => s?.userId === w.uid)!;
        const award = share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;

        seat.chips += award;
        this.winners.push({
          seatIndex: seat.seatIndex,
          amount: award,
          hand: w.hand.rankName,
        });
      }
    }

    this.onStateChange?.(this);
    this.onHandComplete?.(this, this.winners);

    // Schedule next hand
    this.showdownTimer = setTimeout(() => {
      this._cleanupHand();
      if (this._activePlayers().length >= MIN_PLAYERS_TO_START) {
        this.startHand();
      } else {
        this.phase = 'waiting';
        this.handInProgress = false;
        this.onStateChange?.(this);
      }
    }, SHOWDOWN_DELAY_MS);
  }

  private _awardPotToLastPlayer(winner: PokerSeat): void {
    this._clearActionTimer();
    this.phase = 'showdown';
    this._collectBets();

    let totalWon = 0;
    for (const pot of this.pots) {
      winner.chips += pot.amount;
      totalWon += pot.amount;
    }

    this.winners = [{ seatIndex: winner.seatIndex, amount: totalWon }];
    this.onStateChange?.(this);
    this.onHandComplete?.(this, this.winners);

    this.showdownTimer = setTimeout(() => {
      this._cleanupHand();
      if (this._activePlayers().length >= MIN_PLAYERS_TO_START) {
        this.startHand();
      } else {
        this.phase = 'waiting';
        this.handInProgress = false;
        this.onStateChange?.(this);
      }
    }, SHOWDOWN_DELAY_MS);
  }

  // =========================================================================
  // State serialization
  // =========================================================================

  getState(viewerUserId?: string): PokerTableState {
    const isShowdown = this.phase === 'showdown';

    const seats: PokerSeatClient[] = this.seats.map((seat, idx) => {
      if (!seat) {
        return {
          seatIndex: idx,
          userId: null,
          displayName: '',
          chips: 0,
          holeCards: null,
          currentBet: 0,
          folded: false,
          allIn: false,
          isBot: false,
          sittingOut: false,
        };
      }

      // Show hole cards only to the owner or at showdown (if not folded)
      const showCards = seat.userId === viewerUserId || (isShowdown && !seat.folded);

      return {
        seatIndex: idx,
        userId: seat.userId,
        displayName: seat.displayName,
        chips: seat.chips,
        holeCards: showCards ? seat.holeCards : (seat.holeCards.length > 0 ? [] : null),
        currentBet: seat.currentBet,
        folded: seat.folded,
        allIn: seat.allIn,
        isBot: seat.isBot,
        sittingOut: seat.sittingOut,
      };
    });

    return {
      tableId: this.tableId,
      tier: this.config.tier,
      phase: this.phase,
      seats,
      communityCards: this.communityCards,
      pots: this.pots,
      dealerSeat: this.dealerSeat,
      activeSeat: this.activeSeat,
      minRaise: this.minRaise,
      countdown: this.countdown,
      handNumber: this.handNumber,
      lastAction: this.lastAction,
      winners: this.winners,
    };
  }

  // =========================================================================
  // Timer
  // =========================================================================

  private _startActionTimer(): void {
    this.countdown = ACTION_TIMEOUT_SEC;
    this._clearActionTimer();

    this.actionTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        // Auto-fold on timeout
        const seat = this.seats[this.activeSeat];
        if (seat && !seat.folded && !seat.allIn) {
          // Check if they can check (free option)
          if (seat.currentBet >= this.currentBet) {
            this._doCheck(this.activeSeat);
          } else {
            this._doFold(this.activeSeat);
          }
        }
      }
      this.onStateChange?.(this);
    }, 1000);
  }

  private _clearActionTimer(): void {
    if (this.actionTimer) {
      clearInterval(this.actionTimer);
      this.actionTimer = null;
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private _activePlayers(): PokerSeat[] {
    return this.seats.filter((s): s is PokerSeat => s !== null && s.chips > 0 || (s !== null && !s.folded));
  }

  private _nextOccupiedSeat(fromSeat: number): number {
    const len = this.seats.length;
    for (let i = 1; i <= len; i++) {
      const idx = (fromSeat + i) % len;
      if (this.seats[idx]) return idx;
    }
    return fromSeat;
  }

  private _nextActiveSeat(fromSeat: number): number {
    const len = this.seats.length;
    for (let i = 1; i <= len; i++) {
      const idx = (fromSeat + i) % len;
      const seat = this.seats[idx];
      if (seat && !seat.folded && !seat.allIn) return idx;
    }
    return -1;
  }

  /** Next seat that can still act (not folded, not all-in) */
  private _nextActingSeat(fromSeat: number): number {
    return this._nextActiveSeat(fromSeat);
  }

  private _cleanupHand(): void {
    this.handInProgress = false;
    this._clearActionTimer();
    if (this.showdownTimer) {
      clearTimeout(this.showdownTimer);
      this.showdownTimer = null;
    }

    // Remove busted players
    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i];
      if (seat && (seat.chips <= 0 || seat.sittingOut)) {
        this.seats[i] = null;
      }
    }

    // Reset hand state
    this.communityCards = [];
    this.pots = [];
    this.winners = null;
    this.lastAction = null;
    this.activeSeat = -1;
    this.currentBet = 0;
    this.phase = 'waiting';
  }

  destroy(): void {
    this._clearActionTimer();
    if (this.showdownTimer) {
      clearTimeout(this.showdownTimer);
      this.showdownTimer = null;
    }
    this.handInProgress = false;
  }

  /** Expose current bet for external use (bot AI) */
  _getCurrentBet(): number {
    return this.currentBet;
  }
}
