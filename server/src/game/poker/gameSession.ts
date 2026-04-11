import { v4 as uuidv4 } from 'uuid';
import { Card } from '../../../../shared/types';
import { createDeck, shuffleDeck } from '../deck';
import { evaluatePokerHand, comparePokerHands, PokerHandResult } from './handRanker';
import { botDecision } from './botAI';

// ---- Types ----

export interface PokerGameState {
  id: string;
  userId: string;
  tier: string;
  phase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
  deck: Card[];
  playerHole: Card[];
  botHole: Card[];
  community: Card[];
  pot: number;
  playerChips: number;
  botChips: number;
  playerBet: number;
  botBet: number;
  currentBet: number;
  smallBlind: number;
  bigBlind: number;
  isPlayerTurn: boolean;
  result?: {
    winner: 'player' | 'bot' | 'tie';
    playerHand?: PokerHandResult;
    botHand?: PokerHandResult;
    payout: number;
  };
}

// ---- Tier Config ----

export const TIER_CONFIG: Record<string, { smallBlind: number; bigBlind: number; minBuyIn: number }> = {
  monte_carlo: { smallBlind: 50, bigBlind: 100, minBuyIn: 1000 },
  macau:       { smallBlind: 500, bigBlind: 1000, minBuyIn: 10000 },
  las_vegas:   { smallBlind: 5000, bigBlind: 10000, minBuyIn: 100000 },
  monaco:      { smallBlind: 50000, bigBlind: 100000, minBuyIn: 1000000 },
};

// ---- In-Memory Store ----

const activeGames = new Map<string, PokerGameState>();

// ---- Helpers ----

function dealCard(state: PokerGameState): Card {
  return state.deck.pop()!;
}

function advancePhase(state: PokerGameState): void {
  // Reset bets for new phase
  state.playerBet = 0;
  state.botBet = 0;
  state.currentBet = 0;

  switch (state.phase) {
    case 'preflop':
      state.phase = 'flop';
      state.community.push(dealCard(state), dealCard(state), dealCard(state));
      state.isPlayerTurn = true;
      break;
    case 'flop':
      state.phase = 'turn';
      state.community.push(dealCard(state));
      state.isPlayerTurn = true;
      break;
    case 'turn':
      state.phase = 'river';
      state.community.push(dealCard(state));
      state.isPlayerTurn = true;
      break;
    case 'river':
      resolveShowdown(state);
      break;
  }
}

function resolveShowdown(state: PokerGameState): void {
  state.phase = 'showdown';

  // Deal remaining community cards if needed (e.g. after all-in)
  while (state.community.length < 5) {
    state.community.push(dealCard(state));
  }

  const playerCards = [...state.playerHole, ...state.community];
  const botCards = [...state.botHole, ...state.community];

  const playerHand = evaluatePokerHand(playerCards);
  const botHand = evaluatePokerHand(botCards);
  const cmp = comparePokerHands(playerHand, botHand);

  let winner: 'player' | 'bot' | 'tie';
  let payout: number;

  if (cmp > 0) {
    winner = 'player';
    payout = state.pot;
    state.playerChips += state.pot;
  } else if (cmp < 0) {
    winner = 'bot';
    payout = 0;
    state.botChips += state.pot;
  } else {
    winner = 'tie';
    payout = Math.floor(state.pot / 2);
    state.playerChips += payout;
    state.botChips += state.pot - payout;
  }

  state.pot = 0;
  state.result = { winner, playerHand, botHand, payout };
  state.phase = 'complete';
}

function processBotAction(state: PokerGameState): void {
  if (state.phase === 'showdown' || state.phase === 'complete') return;

  const decision = botDecision(state);

  switch (decision.action) {
    case 'fold':
      // Bot folds – player wins pot
      state.playerChips += state.pot;
      state.result = { winner: 'player', payout: state.pot };
      state.pot = 0;
      state.phase = 'complete';
      return;

    case 'check':
      // Both checked – advance phase
      state.isPlayerTurn = true;
      advancePhase(state);
      return;

    case 'call': {
      const callAmount = Math.min(state.currentBet - state.botBet, state.botChips);
      state.botChips -= callAmount;
      state.botBet += callAmount;
      state.pot += callAmount;
      // Both matched – advance phase
      state.isPlayerTurn = true;
      advancePhase(state);
      return;
    }

    case 'raise': {
      const raiseAmount = Math.min(decision.amount || state.bigBlind, state.botChips);
      const totalBet = state.currentBet + raiseAmount;
      const chipsToPut = totalBet - state.botBet;
      const actualChips = Math.min(chipsToPut, state.botChips);
      state.botChips -= actualChips;
      state.botBet += actualChips;
      state.pot += actualChips;
      state.currentBet = state.botBet;
      // Player needs to respond
      state.isPlayerTurn = true;
      return;
    }
  }
}

// ---- Public API ----

/** Start a new heads-up poker game */
export async function startPokerGame(userId: string, tier: string): Promise<PokerGameState> {
  const config = TIER_CONFIG[tier];
  if (!config) throw new Error(`Invalid tier: ${tier}`);

  const deck = shuffleDeck(createDeck());
  const buyIn = config.minBuyIn;

  const state: PokerGameState = {
    id: uuidv4(),
    userId,
    tier,
    phase: 'preflop',
    deck,
    playerHole: [],
    botHole: [],
    community: [],
    pot: 0,
    playerChips: buyIn,
    botChips: buyIn,
    playerBet: 0,
    botBet: 0,
    currentBet: config.bigBlind,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    isPlayerTurn: true,
  };

  // Deal hole cards
  state.playerHole = [dealCard(state), dealCard(state)];
  state.botHole = [dealCard(state), dealCard(state)];

  // Post blinds: Player = small blind, Bot = big blind
  const playerBlind = Math.min(config.smallBlind, state.playerChips);
  state.playerChips -= playerBlind;
  state.playerBet = playerBlind;
  state.pot += playerBlind;

  const botBlind = Math.min(config.bigBlind, state.botChips);
  state.botChips -= botBlind;
  state.botBet = botBlind;
  state.pot += botBlind;

  state.currentBet = config.bigBlind;
  state.isPlayerTurn = true; // Player acts first pre-flop (SB acts first heads-up pre-flop)

  activeGames.set(state.id, state);
  return state;
}

/** Process a player action */
export async function pokerAction(
  gameId: string,
  userId: string,
  action: 'fold' | 'check' | 'call' | 'raise',
  raiseAmount?: number
): Promise<PokerGameState> {
  const state = activeGames.get(gameId);
  if (!state) throw new Error('Game not found');
  if (state.userId !== userId) throw new Error('Not your game');
  if (state.phase === 'complete' || state.phase === 'showdown') throw new Error('Game is over');
  if (!state.isPlayerTurn) throw new Error('Not your turn');

  switch (action) {
    case 'fold':
      // Player folds – bot wins pot
      state.botChips += state.pot;
      state.result = { winner: 'bot', payout: 0 };
      state.pot = 0;
      state.phase = 'complete';
      break;

    case 'check':
      if (state.currentBet > state.playerBet) {
        throw new Error('Cannot check – must call or raise');
      }
      state.isPlayerTurn = false;
      processBotAction(state);
      break;

    case 'call': {
      const callAmount = Math.min(state.currentBet - state.playerBet, state.playerChips);
      state.playerChips -= callAmount;
      state.playerBet += callAmount;
      state.pot += callAmount;
      state.isPlayerTurn = false;

      // If bot hasn't acted yet this phase (player called bot's raise), advance
      if (state.playerBet === state.botBet) {
        advancePhase(state);
      } else {
        processBotAction(state);
      }
      break;
    }

    case 'raise': {
      const raise = raiseAmount ?? state.bigBlind;
      if (raise < state.bigBlind && state.playerChips >= state.bigBlind) {
        throw new Error(`Minimum raise is ${state.bigBlind}`);
      }
      const totalBet = state.currentBet + raise;
      const chipsToPut = totalBet - state.playerBet;
      const actualChips = Math.min(chipsToPut, state.playerChips);
      state.playerChips -= actualChips;
      state.playerBet += actualChips;
      state.pot += actualChips;
      state.currentBet = state.playerBet;
      state.isPlayerTurn = false;
      processBotAction(state);
      break;
    }
  }

  activeGames.set(state.id, state);
  return state;
}

/** Get client-safe game state (hides bot hole cards unless showdown) */
export function getClientState(state: PokerGameState): any {
  const clientState: any = {
    id: state.id,
    userId: state.userId,
    tier: state.tier,
    phase: state.phase,
    playerHole: state.playerHole,
    community: state.community,
    pot: state.pot,
    playerChips: state.playerChips,
    botChips: state.botChips,
    playerBet: state.playerBet,
    botBet: state.botBet,
    currentBet: state.currentBet,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    isPlayerTurn: state.isPlayerTurn,
  };

  // Only reveal bot cards at showdown/complete
  if (state.phase === 'showdown' || state.phase === 'complete') {
    clientState.botHole = state.botHole;
    clientState.result = state.result;
  }

  return clientState;
}

/** Get a game by ID (for route handler) */
export function getGame(gameId: string): PokerGameState | undefined {
  return activeGames.get(gameId);
}
