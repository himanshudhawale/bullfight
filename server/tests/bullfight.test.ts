import {
  BullfightGame,
  MIN_BET,
  HAND_RANK,
  HAND_NAMES,
  BETTING_STAGES,
  STAGES,
} from '../src/game/bullfight';

describe('BullfightGame', () => {
  let game: BullfightGame;

  beforeEach(() => {
    game = new BullfightGame('test_tier');
  });

  afterEach(() => {
    game.destroy();
  });

  describe('initialization', () => {
    it('starts in idle stage', () => {
      expect(game.stage).toBe('idle');
      expect(game.running).toBe(false);
      expect(game.roundNumber).toBe(0);
    });

    it('exports correct hand rank constants', () => {
      expect(HAND_RANK.HIGH_CARD).toBe(0);
      expect(HAND_RANK.ONE_PAIR).toBe(1);
      expect(HAND_RANK.ROYAL_FLUSH).toBe(9);
      expect(Object.keys(HAND_RANK)).toHaveLength(10);
    });

    it('exports hand names for all ranks', () => {
      for (let i = 0; i <= 9; i++) {
        expect(HAND_NAMES[i]).toBeDefined();
        expect(typeof HAND_NAMES[i]).toBe('string');
      }
    });

    it('exports correct stage arrays', () => {
      expect(STAGES).toEqual(['preflop', 'flop', 'turn', 'river']);
      expect(BETTING_STAGES).toEqual(['preflop', 'flop', 'turn']);
    });
  });

  describe('round lifecycle', () => {
    it('starts a round and enters preflop', () => {
      game.start();
      expect(game.running).toBe(true);
      expect(game.stage).toBe('preflop');
      expect(game.roundNumber).toBe(1);
    });

    it('deals 2 hole cards to each player', () => {
      game.start();
      expect(game.playerA.cards).toHaveLength(2);
      expect(game.playerB.cards).toHaveLength(2);
    });

    it('starts with empty community cards at preflop', () => {
      game.start();
      expect(game.community).toHaveLength(0);
    });

    it('increments round number on each new round', () => {
      game.running = true;
      game.startRound();
      expect(game.roundNumber).toBe(1);
      game.startRound();
      expect(game.roundNumber).toBe(2);
    });

    it('calls onRoundStart callback with pre-dealt info', () => {
      const startInfo: any[] = [];
      game.onRoundStart = (info) => startInfo.push(info);
      game.start();
      expect(startInfo).toHaveLength(1);
      expect(startInfo[0].tierId).toBe('test_tier');
      expect(startInfo[0].playerACards).toHaveLength(2);
      expect(startInfo[0].playerBCards).toHaveLength(2);
      expect(startInfo[0].community).toHaveLength(5);
      expect(startInfo[0].burns).toHaveLength(3);
      expect(['a', 'b', 'tie']).toContain(startInfo[0].winner);
    });

    it('broadcasts state on stage change', () => {
      let broadcastCount = 0;
      game._broadcastFn = () => broadcastCount++;
      game.start();
      expect(broadcastCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('odds and multipliers', () => {
    it('calculates multipliers for all bet types at preflop', () => {
      game.start();
      const state = game.getState();
      // Winner multipliers
      expect(state.multipliers['winner_a']).toBeDefined();
      expect(state.multipliers['winner_b']).toBeDefined();
      expect(state.multipliers['winner_a']).toBeGreaterThan(0);
      expect(state.multipliers['winner_b']).toBeGreaterThan(0);
    });

    it('has winner probabilities that sum to ~1', () => {
      game.start();
      const state = game.getState();
      const sum = state.winnerProbs.a + state.winnerProbs.b;
      expect(sum).toBeGreaterThan(0.95);
      expect(sum).toBeLessThanOrEqual(1.01);
    });

    it('multipliers respect house edge (≥ 1.1)', () => {
      game.start();
      const state = game.getState();
      for (const [key, mult] of Object.entries(state.multipliers)) {
        if (mult > 0) {
          expect(mult).toBeGreaterThanOrEqual(1.1);
        }
      }
    });

    it('multipliers are capped at 200', () => {
      game.start();
      const state = game.getState();
      for (const [key, mult] of Object.entries(state.multipliers)) {
        expect(mult).toBeLessThanOrEqual(200);
      }
    });
  });

  describe('betting', () => {
    beforeEach(() => {
      game.start();
      game.buyChips('user1', 100_000);
    });

    it('allows placing a bet during betting stage', () => {
      const result = game.placeBet('user1', 'winner_a', 1000);
      expect(result.ok).toBe(true);
      expect(result.betType).toBe('winner_a');
      expect(result.amount).toBe(1000);
      expect(result.multiplier).toBeGreaterThan(0);
      expect(result.chipsLeft).toBe(99_000);
    });

    it('rejects bet below minimum', () => {
      const result = game.placeBet('user1', 'winner_a', MIN_BET - 1);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Minimum bet');
    });

    it('rejects bet with insufficient chips', () => {
      const result = game.placeBet('user1', 'winner_a', 200_000);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Not enough chips');
    });

    it('rejects bet on disabled multiplier (0)', () => {
      // Force a multiplier to 0
      game.currentMultipliers['hand_99'] = 0;
      const result = game.placeBet('user1', 'hand_99', 1000);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('no longer possible');
    });

    it('deducts chips on bet placement', () => {
      game.placeBet('user1', 'winner_a', 5000);
      expect(game.chipBalances.get('user1')).toBe(95_000);
    });

    it('accumulates multiple bets with weighted average multiplier', () => {
      game.placeBet('user1', 'winner_a', 1000);
      game.placeBet('user1', 'winner_a', 2000);
      const bets = game.bets.get('winner_a')!;
      const userBet = bets.get('user1')!;
      expect(userBet.amount).toBe(3000);
    });

    it('tracks round total bets', () => {
      game.placeBet('user1', 'winner_a', 1000);
      game.placeBet('user1', 'winner_b', 2000);
      expect(game.roundTotalBets).toBe(3000);
    });

    it('calls onChipsChanged callback', () => {
      const changes: any[] = [];
      game.onChipsChanged = (uid, chips) => changes.push({ uid, chips });
      game.placeBet('user1', 'winner_a', 1000);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ uid: 'user1', chips: 99_000 });
    });
  });

  describe('chip management', () => {
    it('buyChips adds to balance', () => {
      const balance = game.buyChips('user1', 50_000);
      expect(balance).toBe(50_000);
      expect(game.chipBalances.get('user1')).toBe(50_000);
    });

    it('buyChips stacks on existing balance', () => {
      game.buyChips('user1', 50_000);
      const balance = game.buyChips('user1', 30_000);
      expect(balance).toBe(80_000);
    });
  });

  describe('state serialization', () => {
    it('getState returns complete state object', () => {
      game.start();
      game.buyChips('user1', 10_000);
      const state = game.getState('user1');

      expect(state.tierId).toBe('test_tier');
      expect(state.roundNumber).toBe(1);
      expect(state.stage).toBe('preflop');
      expect(state.countdown).toBeGreaterThan(0);
      expect(state.playerA.cards).toHaveLength(2);
      expect(state.playerB.cards).toHaveLength(2);
      expect(state.community).toHaveLength(0);
      expect(state.multipliers).toBeDefined();
      expect(state.winnerProbs).toBeDefined();
      expect(state.handNames).toBeDefined();
      expect(state.minBet).toBe(MIN_BET);
      expect(state.chips).toBe(10_000);
    });

    it('getState without userId returns 0 chips', () => {
      game.start();
      const state = game.getState();
      expect(state.chips).toBe(0);
    });

    it('serializes bets as aggregates (not per-user)', () => {
      game.start();
      game.buyChips('user1', 100_000);
      game.buyChips('user2', 100_000);
      game.placeBet('user1', 'winner_a', 1000);
      game.placeBet('user2', 'winner_a', 2000);
      const state = game.getState();
      expect(state.bets['winner_a']).toEqual({ total: 3000, count: 2 });
    });
  });

  describe('resolution', () => {
    it('resolves a round with correct winner and payouts', (done) => {
      game.onRoundEnd = (results) => {
        expect(results.roundNumber).toBe(1);
        expect(['a', 'b', 'tie']).toContain(results.winner);
        expect(results.resultA).toBeDefined();
        expect(results.resultA.name).toBeDefined();
        expect(results.resultA.rank).toBeGreaterThanOrEqual(0);
        expect(results.resultB).toBeDefined();
        done();
      };

      // Fast-forward: directly trigger resolution by setting to river
      game.running = true;
      game.startRound();
      game.buyChips('user1', 100_000);
      game.placeBet('user1', 'winner_a', 1000);

      // Clear timers and manually resolve
      if (game.timer) { clearTimeout(game.timer); game.timer = null; }
      if (game.countdownTimer) { clearInterval(game.countdownTimer); game.countdownTimer = null; }

      // Simulate advancing to river stage
      game.community = (game as any)._preDealtCommunity.slice(0, 5);
      game.stage = 'river';
      (game as any)._resolve();
    });

    it('pays out winning bets correctly', () => {
      game.running = false; // prevent auto-restart
      game.startRound();
      game.buyChips('user1', 100_000);

      // Determine winner after resolution
      const preA = require('../src/game/poker/handRanker').evaluatePokerHand(
        [...game.playerA.cards, ...(game as any)._preDealtCommunity]
      );
      const preB = require('../src/game/poker/handRanker').evaluatePokerHand(
        [...game.playerB.cards, ...(game as any)._preDealtCommunity]
      );
      const cmp = require('../src/game/poker/handRanker').comparePokerHands(preA, preB);
      const expectedWinner = cmp > 0 ? 'a' : cmp < 0 ? 'b' : 'tie';

      // Bet on the winner
      const betType = `winner_${expectedWinner === 'tie' ? 'a' : expectedWinner}`;
      const mult = game.currentMultipliers[betType];
      game.placeBet('user1', betType, 10_000);
      const chipsAfterBet = game.chipBalances.get('user1')!;

      // Resolve
      if (game.timer) { clearTimeout(game.timer); game.timer = null; }
      if (game.countdownTimer) { clearInterval(game.countdownTimer); game.countdownTimer = null; }
      game.community = (game as any)._preDealtCommunity.slice(0, 5);
      game.stage = 'river';
      (game as any)._resolve();

      const chipsAfterResolve = game.chipBalances.get('user1')!;

      if (expectedWinner === 'tie') {
        // Push — get bet back
        expect(chipsAfterResolve).toBe(chipsAfterBet + 10_000);
      } else {
        // Win — get bet × multiplier
        expect(chipsAfterResolve).toBe(chipsAfterBet + Math.floor(10_000 * mult));
      }
    });

    it('losing bets get 0 payout', () => {
      game.running = false;
      game.startRound();
      game.buyChips('user1', 100_000);

      // Bet on a fixed loser
      const preA = require('../src/game/poker/handRanker').evaluatePokerHand(
        [...game.playerA.cards, ...(game as any)._preDealtCommunity]
      );
      const preB = require('../src/game/poker/handRanker').evaluatePokerHand(
        [...game.playerB.cards, ...(game as any)._preDealtCommunity]
      );
      const cmp = require('../src/game/poker/handRanker').comparePokerHands(preA, preB);

      // If A wins, bet on B (loser). If B wins, bet on A. If tie, skip test.
      if (cmp === 0) return; // tie, can't test loser
      const loserBet = cmp > 0 ? 'winner_b' : 'winner_a';
      game.placeBet('user1', loserBet, 5_000);
      const chipsAfterBet = game.chipBalances.get('user1')!;

      if (game.timer) { clearTimeout(game.timer); game.timer = null; }
      if (game.countdownTimer) { clearInterval(game.countdownTimer); game.countdownTimer = null; }
      game.community = (game as any)._preDealtCommunity.slice(0, 5);
      game.stage = 'river';
      (game as any)._resolve();

      // Loser gets nothing back
      expect(game.chipBalances.get('user1')).toBe(chipsAfterBet);
    });
  });

  describe('control', () => {
    it('stop pauses the game', () => {
      game.start();
      game.stop();
      expect(game.stage).toBe('paused');
      expect(game.running).toBe(false);
    });

    it('destroy stops and goes to idle', () => {
      game.start();
      game.destroy();
      expect(game.stage).toBe('idle');
      expect(game.running).toBe(false);
    });

    it('start is idempotent', () => {
      game.start();
      const round = game.roundNumber;
      game.start(); // second call should be no-op
      expect(game.roundNumber).toBe(round);
    });
  });
});
