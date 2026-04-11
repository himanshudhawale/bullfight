import { PokerTable } from './pokerTable';
import { PokerTierConfig, TableTier } from '../../../../shared/types';

// ---- Blind Schedule ----
export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  durationMs: number;
}

export const DEFAULT_SNG_BLINDS: BlindLevel[] = [
  { level: 1, smallBlind: 10,   bigBlind: 20,    ante: 0,  durationMs: 5 * 60_000 },
  { level: 2, smallBlind: 15,   bigBlind: 30,    ante: 0,  durationMs: 5 * 60_000 },
  { level: 3, smallBlind: 25,   bigBlind: 50,    ante: 5,  durationMs: 5 * 60_000 },
  { level: 4, smallBlind: 50,   bigBlind: 100,   ante: 10, durationMs: 5 * 60_000 },
  { level: 5, smallBlind: 75,   bigBlind: 150,   ante: 15, durationMs: 5 * 60_000 },
  { level: 6, smallBlind: 100,  bigBlind: 200,   ante: 25, durationMs: 5 * 60_000 },
  { level: 7, smallBlind: 150,  bigBlind: 300,   ante: 30, durationMs: 4 * 60_000 },
  { level: 8, smallBlind: 200,  bigBlind: 400,   ante: 50, durationMs: 4 * 60_000 },
  { level: 9, smallBlind: 300,  bigBlind: 600,   ante: 75, durationMs: 4 * 60_000 },
  { level: 10, smallBlind: 500, bigBlind: 1000,  ante: 100, durationMs: 3 * 60_000 },
  { level: 11, smallBlind: 750, bigBlind: 1500,  ante: 150, durationMs: 3 * 60_000 },
  { level: 12, smallBlind: 1000, bigBlind: 2000, ante: 200, durationMs: 3 * 60_000 },
];

export const DEFAULT_TOURNAMENT_BLINDS: BlindLevel[] = [
  { level: 1, smallBlind: 25,    bigBlind: 50,     ante: 0,   durationMs: 10 * 60_000 },
  { level: 2, smallBlind: 50,    bigBlind: 100,    ante: 0,   durationMs: 10 * 60_000 },
  { level: 3, smallBlind: 75,    bigBlind: 150,    ante: 15,  durationMs: 10 * 60_000 },
  { level: 4, smallBlind: 100,   bigBlind: 200,    ante: 25,  durationMs: 10 * 60_000 },
  { level: 5, smallBlind: 150,   bigBlind: 300,    ante: 30,  durationMs: 8 * 60_000 },
  { level: 6, smallBlind: 200,   bigBlind: 400,    ante: 50,  durationMs: 8 * 60_000 },
  { level: 7, smallBlind: 300,   bigBlind: 600,    ante: 75,  durationMs: 8 * 60_000 },
  { level: 8, smallBlind: 400,   bigBlind: 800,    ante: 100, durationMs: 6 * 60_000 },
  { level: 9, smallBlind: 600,   bigBlind: 1200,   ante: 150, durationMs: 6 * 60_000 },
  { level: 10, smallBlind: 1000, bigBlind: 2000,   ante: 200, durationMs: 5 * 60_000 },
  { level: 11, smallBlind: 1500, bigBlind: 3000,   ante: 300, durationMs: 5 * 60_000 },
  { level: 12, smallBlind: 2000, bigBlind: 4000,   ante: 400, durationMs: 5 * 60_000 },
];

export const SNG_6_PAYOUT = [
  { place: 1, percentage: 65 },
  { place: 2, percentage: 25 },
  { place: 3, percentage: 10 },
];

export const SNG_9_PAYOUT = [
  { place: 1, percentage: 50 },
  { place: 2, percentage: 30 },
  { place: 3, percentage: 20 },
];

// ---- Config ----
export interface TournamentConfig {
  id: string;
  name: string;
  type: 'scheduled' | 'sng';
  buyIn: number;
  entryFee: number;          // rake (goes to house)
  startingChips: number;
  maxPlayers: number;
  minPlayers: number;        // minimum to start (SNG: same as maxPlayers)
  seatsPerTable: number;     // 6 or 9
  blindSchedule: BlindLevel[];
  payoutStructure: { place: number; percentage: number }[];
  rebuyAllowed: boolean;
  rebuyLevels: number;
  startsAt?: string;         // ISO for scheduled tournaments
}

export type TournamentStatus = 'registration' | 'running' | 'final_table' | 'finished' | 'cancelled';

// ---- Player Tracking ----
export interface TournamentPlayer {
  userId: string;
  displayName: string;
  tableId: string | null;    // which table they're seated at
  chips: number;
  eliminated: boolean;
  finishPlace: number | null;
  eliminatedAt: string | null;
  rebuys: number;
}

// ---- Tournament Class ----
export class Tournament {
  id: string;
  config: TournamentConfig;
  status: TournamentStatus;
  players: Map<string, TournamentPlayer>;
  tables: Map<string, PokerTable>;
  currentBlindLevel: number;
  prizePool: number;
  blindTimer: ReturnType<typeof setTimeout> | null;
  results: { userId: string; displayName: string; place: number; prize: number }[];

  // Callbacks
  onStateChange: ((tournament: Tournament) => void) | null;
  onBlindUp: ((level: BlindLevel) => void) | null;
  onPlayerEliminated: ((userId: string, place: number) => void) | null;
  onTournamentEnd: ((results: Tournament['results']) => void) | null;
  onTableStateChange: ((table: PokerTable) => void) | null;

  constructor(config: TournamentConfig) {
    this.id = config.id;
    this.config = config;
    this.status = 'registration';
    this.players = new Map();
    this.tables = new Map();
    this.currentBlindLevel = 0;
    this.prizePool = 0;
    this.blindTimer = null;
    this.results = [];
    this.onStateChange = null;
    this.onBlindUp = null;
    this.onPlayerEliminated = null;
    this.onTournamentEnd = null;
    this.onTableStateChange = null;
  }

  // ---- Registration ----
  register(userId: string, displayName: string): { ok: boolean; error?: string } {
    if (this.status !== 'registration') {
      return { ok: false, error: 'Registration is closed' };
    }
    if (this.players.has(userId)) {
      return { ok: false, error: 'Already registered' };
    }
    if (this.players.size >= this.config.maxPlayers) {
      return { ok: false, error: 'Tournament is full' };
    }

    this.players.set(userId, {
      userId,
      displayName,
      tableId: null,
      chips: this.config.startingChips,
      eliminated: false,
      finishPlace: null,
      eliminatedAt: null,
      rebuys: 0,
    });

    this.prizePool += this.config.buyIn;
    if (this.onStateChange) this.onStateChange(this);

    // Auto-start SNG when full
    if (this.config.type === 'sng' && this.players.size >= this.config.maxPlayers) {
      this.start();
    }

    return { ok: true };
  }

  unregister(userId: string): { ok: boolean; error?: string } {
    if (this.status !== 'registration') {
      return { ok: false, error: 'Cannot unregister after start' };
    }
    if (!this.players.has(userId)) {
      return { ok: false, error: 'Not registered' };
    }

    this.players.delete(userId);
    this.prizePool -= this.config.buyIn;
    if (this.onStateChange) this.onStateChange(this);
    return { ok: true };
  }

  // ---- Start Tournament ----
  start(): void {
    if (this.status !== 'registration') return;
    if (this.players.size < this.config.minPlayers) return;

    this.status = 'running';
    this.currentBlindLevel = 0;

    // Create tables and seat players
    this._seatPlayers();

    // Start blind timer
    this._startBlindTimer();

    if (this.onStateChange) this.onStateChange(this);
  }

  private _seatPlayers(): void {
    const playerList = [...this.players.values()];
    const seatsPerTable = this.config.seatsPerTable;
    const numTables = Math.ceil(playerList.length / seatsPerTable);

    for (let i = 0; i < numTables; i++) {
      const tableId = `${this.id}_table_${i + 1}`;
      const blind = this.config.blindSchedule[0];

      const tierConfig: PokerTierConfig = {
        tier: TableTier.MONTE_CARLO,
        name: `${this.config.name} - Table ${i + 1}`,
        smallBlind: blind.smallBlind,
        bigBlind: blind.bigBlind,
        minBuyIn: 0,    // tournament — no buy-in at table level
        maxBuyIn: 0,
        maxSeats: seatsPerTable,
      };

      const table = new PokerTable(tableId, tierConfig);

      table.onStateChange = (t) => {
        if (this.onTableStateChange) this.onTableStateChange(t);
      };

      table.onHandComplete = (_t, _winners) => {
        this._handleHandComplete(table);
      };

      this.tables.set(tableId, table);
    }

    // Distribute players across tables evenly
    let tableIndex = 0;
    const tableIds = [...this.tables.keys()];

    for (const player of playerList) {
      const tableId = tableIds[tableIndex % tableIds.length];
      const table = this.tables.get(tableId)!;

      table.sitDown(player.userId, player.displayName, this.config.startingChips);
      player.tableId = tableId;

      tableIndex++;
    }
  }

  // ---- Blind Escalation ----
  private _startBlindTimer(): void {
    const schedule = this.config.blindSchedule;
    if (this.currentBlindLevel >= schedule.length - 1) return;

    const currentLevel = schedule[this.currentBlindLevel];

    this.blindTimer = setTimeout(() => {
      this._advanceBlinds();
    }, currentLevel.durationMs);
  }

  private _advanceBlinds(): void {
    this.currentBlindLevel++;
    const schedule = this.config.blindSchedule;

    if (this.currentBlindLevel >= schedule.length) {
      // Reached max level — just stay at the last level
      this.currentBlindLevel = schedule.length - 1;
      return;
    }

    const newLevel = schedule[this.currentBlindLevel];

    // Update all active tables with new blinds
    for (const [, table] of this.tables) {
      table.config.smallBlind = newLevel.smallBlind;
      table.config.bigBlind = newLevel.bigBlind;
    }

    if (this.onBlindUp) this.onBlindUp(newLevel);
    if (this.onStateChange) this.onStateChange(this);

    // Schedule next blind level
    this._startBlindTimer();
  }

  // ---- Hand Completion / Elimination ----
  private _handleHandComplete(table: PokerTable): void {
    // Check for eliminated players (0 chips)
    for (const seat of table.seats) {
      if (!seat || seat.chips > 0) continue;

      const player = this.players.get(seat.userId!);
      if (!player || player.eliminated) continue;

      // Check rebuy eligibility
      if (this.config.rebuyAllowed &&
          player.rebuys < 1 &&
          this.currentBlindLevel < this.config.rebuyLevels) {
        // Player can rebuy — don't eliminate yet
        continue;
      }

      // Eliminate player
      this._eliminatePlayer(seat.userId!);
    }

    // Check if tournament should end
    const activePlayers = [...this.players.values()].filter(p => !p.eliminated);

    if (activePlayers.length <= 1) {
      // Tournament over — last player wins
      if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        winner.finishPlace = 1;
        winner.eliminated = true; // mark as done
      }
      this._finishTournament();
      return;
    }

    // Check for table balancing (multi-table)
    if (this.tables.size > 1) {
      this._balanceTables();
    }

    // Check if we should collapse to final table
    if (activePlayers.length <= this.config.seatsPerTable && this.tables.size > 1) {
      this._collapseToFinalTable();
    }
  }

  private _eliminatePlayer(userId: string): void {
    const player = this.players.get(userId);
    if (!player || player.eliminated) return;

    const activeBefore = [...this.players.values()].filter(p => !p.eliminated).length;

    player.eliminated = true;
    player.eliminatedAt = new Date().toISOString();
    player.finishPlace = activeBefore; // e.g., if 6 active, eliminated = 6th place

    // Stand up from table
    if (player.tableId) {
      const table = this.tables.get(player.tableId);
      if (table) {
        table.standUp(userId);
      }
      player.tableId = null;
    }

    if (this.onPlayerEliminated) {
      this.onPlayerEliminated(userId, player.finishPlace);
    }
    if (this.onStateChange) this.onStateChange(this);
  }

  // ---- Table Balancing ----
  private _balanceTables(): void {
    // Simple balancing: if any table has 2+ fewer players than another, move one
    const tableCounts = new Map<string, number>();
    for (const [id, table] of this.tables) {
      tableCounts.set(id, table.getPlayerCount());
    }

    const entries = [...tableCounts.entries()];
    entries.sort((a, b) => b[1] - a[1]); // sort by player count desc

    const maxCount = entries[0]?.[1] ?? 0;
    const minEntry = entries[entries.length - 1];
    const minCount = minEntry?.[1] ?? 0;

    if (maxCount - minCount >= 2) {
      // Move a player from the biggest table to the smallest
      const fromTable = this.tables.get(entries[0][0])!;
      const toTable = this.tables.get(minEntry[0])!;

      // Find a non-active player to move (ideally one not in a hand)
      const moveable = fromTable.seats.find(s => s && !s.isBot && s.folded);
      if (moveable) {
        const player = this.players.get(moveable.userId!);
        if (player) {
          fromTable.standUp(moveable.userId!);
          toTable.sitDown(moveable.userId!, moveable.displayName, moveable.chips);
          player.tableId = toTable.tableId;
        }
      }
    }

    // Remove empty tables
    for (const [id, table] of this.tables) {
      if (table.getPlayerCount() === 0) {
        this.tables.delete(id);
      }
    }
  }

  private _collapseToFinalTable(): void {
    const activePlayers = [...this.players.values()].filter(p => !p.eliminated);

    // Keep one table, move all players to it
    const finalTableId = `${this.id}_final`;
    const blind = this.config.blindSchedule[Math.min(this.currentBlindLevel, this.config.blindSchedule.length - 1)];

    const tierConfig: PokerTierConfig = {
      tier: TableTier.MONTE_CARLO,
      name: `${this.config.name} - Final Table`,
      smallBlind: blind.smallBlind,
      bigBlind: blind.bigBlind,
      minBuyIn: 0,
      maxBuyIn: 0,
      maxSeats: Math.max(this.config.seatsPerTable, activePlayers.length),
    };

    const finalTable = new PokerTable(finalTableId, tierConfig);
    finalTable.onStateChange = (t) => {
      if (this.onTableStateChange) this.onTableStateChange(t);
    };
    finalTable.onHandComplete = (_t, _winners) => {
      this._handleHandComplete(finalTable);
    };

    // Stand up all players from old tables and sit at final table
    for (const player of activePlayers) {
      if (player.tableId) {
        const oldTable = this.tables.get(player.tableId);
        if (oldTable) {
          const seat = oldTable.seats.find(s => s?.userId === player.userId);
          if (seat) player.chips = seat.chips;
          oldTable.standUp(player.userId);
        }
      }
      finalTable.sitDown(player.userId, player.displayName, player.chips);
      player.tableId = finalTableId;
    }

    // Remove old tables
    this.tables.clear();
    this.tables.set(finalTableId, finalTable);
    this.status = 'final_table';

    if (this.onStateChange) this.onStateChange(this);
  }

  // ---- Finish Tournament ----
  private _finishTournament(): void {
    this.status = 'finished';

    if (this.blindTimer) {
      clearTimeout(this.blindTimer);
      this.blindTimer = null;
    }

    // Calculate prizes
    const sortedPlayers = [...this.players.values()]
      .sort((a, b) => (a.finishPlace ?? 999) - (b.finishPlace ?? 999));

    this.results = [];
    for (const player of sortedPlayers) {
      const payoutEntry = this.config.payoutStructure.find(p => p.place === player.finishPlace);
      const prize = payoutEntry ? Math.floor(this.prizePool * payoutEntry.percentage / 100) : 0;

      this.results.push({
        userId: player.userId,
        displayName: player.displayName,
        place: player.finishPlace ?? sortedPlayers.length,
        prize,
      });
    }

    // Clean up tables
    for (const [, table] of this.tables) {
      for (const seat of table.seats) {
        if (seat) table.standUp(seat.userId!);
      }
    }
    this.tables.clear();

    if (this.onTournamentEnd) this.onTournamentEnd(this.results);
    if (this.onStateChange) this.onStateChange(this);
  }

  // ---- Rebuy ----
  rebuy(userId: string): { ok: boolean; error?: string } {
    if (!this.config.rebuyAllowed) {
      return { ok: false, error: 'Rebuys not allowed' };
    }

    const player = this.players.get(userId);
    if (!player) return { ok: false, error: 'Not in tournament' };
    if (!player.eliminated && player.chips > 0) return { ok: false, error: 'You still have chips' };
    if (player.rebuys >= 1) return { ok: false, error: 'Max rebuys reached' };
    if (this.currentBlindLevel >= this.config.rebuyLevels) {
      return { ok: false, error: 'Rebuy window has closed' };
    }

    player.rebuys++;
    player.chips = this.config.startingChips;
    player.eliminated = false;
    player.finishPlace = null;
    player.eliminatedAt = null;
    this.prizePool += this.config.buyIn;

    // Re-seat at their old table or find one
    if (player.tableId) {
      const table = this.tables.get(player.tableId);
      if (table) {
        table.sitDown(player.userId, player.displayName, player.chips);
      }
    }

    if (this.onStateChange) this.onStateChange(this);
    return { ok: true };
  }

  // ---- State for clients ----
  getState(userId?: string): {
    id: string;
    name: string;
    type: string;
    status: TournamentStatus;
    registeredPlayers: number;
    playersRemaining: number;
    currentBlindLevel: number;
    currentBlinds: BlindLevel | null;
    nextBlinds: BlindLevel | null;
    prizePool: number;
    payoutStructure: { place: number; percentage: number }[];
    buyIn: number;
    entryFee: number;
    startingChips: number;
    maxPlayers: number;
    myInfo: TournamentPlayer | null;
    topPlayers: { userId: string; displayName: string; chips: number; eliminated: boolean }[];
    results: Tournament['results'];
    tables: number;
  } {
    const activePlayers = [...this.players.values()].filter(p => !p.eliminated);
    const schedule = this.config.blindSchedule;

    return {
      id: this.id,
      name: this.config.name,
      type: this.config.type,
      status: this.status,
      registeredPlayers: this.players.size,
      playersRemaining: activePlayers.length,
      currentBlindLevel: this.currentBlindLevel,
      currentBlinds: schedule[this.currentBlindLevel] ?? null,
      nextBlinds: schedule[this.currentBlindLevel + 1] ?? null,
      prizePool: this.prizePool,
      payoutStructure: this.config.payoutStructure,
      buyIn: this.config.buyIn,
      entryFee: this.config.entryFee,
      startingChips: this.config.startingChips,
      maxPlayers: this.config.maxPlayers,
      myInfo: userId ? (this.players.get(userId) ?? null) : null,
      topPlayers: [...this.players.values()]
        .sort((a, b) => b.chips - a.chips)
        .slice(0, 20)
        .map(p => ({ userId: p.userId, displayName: p.displayName, chips: p.chips, eliminated: p.eliminated })),
      results: this.results,
      tables: this.tables.size,
    };
  }

  // ---- Cleanup ----
  destroy(): void {
    if (this.blindTimer) {
      clearTimeout(this.blindTimer);
      this.blindTimer = null;
    }
    this.tables.clear();
    this.players.clear();
  }
}
