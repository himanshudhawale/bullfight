import { Server as SocketIOServer, Socket } from 'socket.io';
import { Tournament, TournamentConfig, DEFAULT_SNG_BLINDS, SNG_6_PAYOUT, SNG_9_PAYOUT, BlindLevel } from './tournament';
import { getContainer } from '../../config/cosmos';
import { PokerTable } from './pokerTable';

interface AuthSocket extends Socket {
  userId?: string;
}

// Pre-defined SNG configs
const SNG_CONFIGS: Record<string, Omit<TournamentConfig, 'id' | 'type' | 'blindSchedule' | 'rebuyAllowed' | 'rebuyLevels'>> = {
  sng_6_low: {
    name: 'SNG 6-Max (Low)',
    buyIn: 1_000,
    entryFee: 100,
    startingChips: 1_500,
    maxPlayers: 6,
    minPlayers: 6,
    seatsPerTable: 6,
    payoutStructure: SNG_6_PAYOUT,
  },
  sng_6_mid: {
    name: 'SNG 6-Max (Mid)',
    buyIn: 10_000,
    entryFee: 1_000,
    startingChips: 1_500,
    maxPlayers: 6,
    minPlayers: 6,
    seatsPerTable: 6,
    payoutStructure: SNG_6_PAYOUT,
  },
  sng_6_high: {
    name: 'SNG 6-Max (High)',
    buyIn: 100_000,
    entryFee: 10_000,
    startingChips: 1_500,
    maxPlayers: 6,
    minPlayers: 6,
    seatsPerTable: 6,
    payoutStructure: SNG_6_PAYOUT,
  },
  sng_9_low: {
    name: 'SNG 9-Max (Low)',
    buyIn: 1_000,
    entryFee: 100,
    startingChips: 1_500,
    maxPlayers: 9,
    minPlayers: 9,
    seatsPerTable: 9,
    payoutStructure: SNG_9_PAYOUT,
  },
  sng_9_mid: {
    name: 'SNG 9-Max (Mid)',
    buyIn: 10_000,
    entryFee: 1_000,
    startingChips: 1_500,
    maxPlayers: 9,
    minPlayers: 9,
    seatsPerTable: 9,
    payoutStructure: SNG_9_PAYOUT,
  },
};

export class TournamentManager {
  private tournaments = new Map<string, Tournament>();
  private io: SocketIOServer | null = null;

  // Map userId → tournamentId for quick lookup
  private playerTournaments = new Map<string, string>();

  init(io: SocketIOServer): void {
    this.io = io;

    // Create one SNG lobby per config — they auto-recreate when one fills up
    for (const [key, partial] of Object.entries(SNG_CONFIGS)) {
      this._createSNG(key, partial);
    }

    console.log('🏆 Tournament Manager initialized');
  }

  private _createSNG(
    key: string,
    partial: Omit<TournamentConfig, 'id' | 'type' | 'blindSchedule' | 'rebuyAllowed' | 'rebuyLevels'>,
  ): Tournament {
    const id = `${key}_${Date.now()}`;
    const config: TournamentConfig = {
      id,
      type: 'sng',
      blindSchedule: DEFAULT_SNG_BLINDS,
      rebuyAllowed: false,
      rebuyLevels: 0,
      ...partial,
    };

    const tournament = new Tournament(config);
    this._wireCallbacks(tournament, key);
    this.tournaments.set(id, tournament);
    return tournament;
  }

  private _wireCallbacks(tournament: Tournament, sngKey?: string): void {
    tournament.onStateChange = (_t) => {
      this._broadcastTournamentState(tournament);
    };

    tournament.onBlindUp = (level: BlindLevel) => {
      if (!this.io) return;
      // Notify all players in the tournament
      for (const [userId] of tournament.players) {
        this._emitToUser(userId, 'tournament:blind_up', {
          tournamentId: tournament.id,
          level: level.level,
          smallBlind: level.smallBlind,
          bigBlind: level.bigBlind,
          ante: level.ante,
        });
      }
    };

    tournament.onPlayerEliminated = (userId: string, place: number) => {
      this._emitToUser(userId, 'tournament:eliminated', {
        tournamentId: tournament.id,
        place,
        totalPlayers: tournament.players.size,
      });
      this.playerTournaments.delete(userId);
    };

    tournament.onTournamentEnd = async (results) => {
      // Persist results and pay out prizes
      await this._handleTournamentEnd(tournament, results);

      // If this was an SNG, create a new one in its place
      if (sngKey) {
        const partial = SNG_CONFIGS[sngKey];
        if (partial) {
          setTimeout(() => this._createSNG(sngKey, partial), 3000);
        }
      }
    };

    tournament.onTableStateChange = (table: PokerTable) => {
      this._broadcastTableState(tournament, table);
    };
  }

  handleConnection(socket: AuthSocket, _io: SocketIOServer): void {
    const userId = socket.userId!;

    // ---- List Tournaments ----
    socket.on('tournament:list', (_: unknown, ack?: (res: unknown) => void) => {
      const list = [...this.tournaments.values()]
        .filter(t => t.status === 'registration' || t.status === 'running' || t.status === 'final_table')
        .map(t => t.getState());
      ack?.({ ok: true, tournaments: list });
    });

    // ---- Register for Tournament ----
    socket.on('tournament:register', async ({ tournamentId }: { tournamentId: string }, ack?: (res: unknown) => void) => {
      const tournament = this.tournaments.get(tournamentId);
      if (!tournament) {
        ack?.({ ok: false, error: 'Tournament not found' });
        return;
      }

      // Check if already in another tournament
      if (this.playerTournaments.has(userId)) {
        ack?.({ ok: false, error: 'Already in a tournament' });
        return;
      }

      // Deduct buy-in + entry fee from account
      const totalCost = tournament.config.buyIn + tournament.config.entryFee;
      try {
        const container = getContainer('users');
        const { resource: user } = await container.item(userId, userId).read();
        if (!user || user.chips < totalCost) {
          ack?.({ ok: false, error: `Need ${totalCost.toLocaleString()} chips (${tournament.config.buyIn.toLocaleString()} buy-in + ${tournament.config.entryFee.toLocaleString()} fee)` });
          return;
        }

        const displayName = user.displayName || 'Player';
        const result = tournament.register(userId, displayName);
        if (!result.ok) {
          ack?.({ ok: false, error: result.error });
          return;
        }

        // Deduct chips
        user.chips -= totalCost;
        await container.item(userId, userId).replace(user);

        this.playerTournaments.set(userId, tournamentId);

        // Join Socket.IO room
        const sockets = await this.io!.fetchSockets();
        for (const s of sockets) {
          if ((s as any).userId === userId) {
            s.join(`tournament:${tournamentId}`);
          }
        }

        ack?.({ ok: true, state: tournament.getState(userId) });
      } catch (err) {
        console.error('[tournament] registration error:', err);
        ack?.({ ok: false, error: 'Registration failed' });
      }
    });

    // ---- Unregister ----
    socket.on('tournament:unregister', async ({ tournamentId }: { tournamentId: string }, ack?: (res: unknown) => void) => {
      const tournament = this.tournaments.get(tournamentId);
      if (!tournament) {
        ack?.({ ok: false, error: 'Tournament not found' });
        return;
      }

      const result = tournament.unregister(userId);
      if (!result.ok) {
        ack?.({ ok: false, error: result.error });
        return;
      }

      // Refund buy-in + fee
      const totalCost = tournament.config.buyIn + tournament.config.entryFee;
      try {
        const container = getContainer('users');
        const { resource: user } = await container.item(userId, userId).read();
        if (user) {
          user.chips += totalCost;
          await container.item(userId, userId).replace(user);
        }
      } catch { /* non-critical */ }

      this.playerTournaments.delete(userId);
      ack?.({ ok: true });
    });

    // ---- Get Tournament State ----
    socket.on('tournament:state', ({ tournamentId }: { tournamentId: string }, ack?: (res: unknown) => void) => {
      const tournament = this.tournaments.get(tournamentId);
      if (!tournament) {
        ack?.({ ok: false, error: 'Tournament not found' });
        return;
      }
      ack?.({ ok: true, state: tournament.getState(userId) });
    });

    // ---- Player Action (in tournament table) ----
    socket.on('tournament:action', ({ tournamentId, action, amount }: { tournamentId: string; action: string; amount?: number }) => {
      const tournament = this.tournaments.get(tournamentId);
      if (!tournament) {
        socket.emit('error', { message: 'Tournament not found' });
        return;
      }

      const player = tournament.players.get(userId);
      if (!player || !player.tableId) {
        socket.emit('error', { message: 'Not seated at a table' });
        return;
      }

      const table = tournament.tables.get(player.tableId);
      if (!table) {
        socket.emit('error', { message: 'Table not found' });
        return;
      }

      const result = table.doAction(userId, action as any, amount);
      if (!result.ok) {
        socket.emit('error', { message: result.error });
        return;
      }
      socket.emit('poker:action_ok', { action, amount });
    });

    // ---- Rebuy ----
    socket.on('tournament:rebuy', async ({ tournamentId }: { tournamentId: string }, ack?: (res: unknown) => void) => {
      const tournament = this.tournaments.get(tournamentId);
      if (!tournament) {
        ack?.({ ok: false, error: 'Tournament not found' });
        return;
      }

      // Deduct rebuy cost
      try {
        const container = getContainer('users');
        const { resource: user } = await container.item(userId, userId).read();
        if (!user || user.chips < tournament.config.buyIn) {
          ack?.({ ok: false, error: 'Insufficient chips for rebuy' });
          return;
        }

        const result = tournament.rebuy(userId);
        if (!result.ok) {
          ack?.({ ok: false, error: result.error });
          return;
        }

        user.chips -= tournament.config.buyIn;
        await container.item(userId, userId).replace(user);

        ack?.({ ok: true, state: tournament.getState(userId) });
      } catch {
        ack?.({ ok: false, error: 'Rebuy failed' });
      }
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      // Tournament players don't leave on disconnect — they're blinded out
    });
  }

  // ---- Broadcasting ----

  private _broadcastTournamentState(tournament: Tournament): void {
    if (!this.io) return;
    this.io.in(`tournament:${tournament.id}`).fetchSockets().then(sockets => {
      for (const s of sockets) {
        const uid = (s as any).userId as string | undefined;
        s.emit('tournament:state', tournament.getState(uid));
      }
    });
  }

  private _broadcastTableState(tournament: Tournament, table: PokerTable): void {
    if (!this.io) return;
    this.io.in(`tournament:${tournament.id}`).fetchSockets().then(sockets => {
      for (const s of sockets) {
        const uid = (s as any).userId as string | undefined;
        if (!uid) continue;
        const player = tournament.players.get(uid);
        if (player?.tableId === table.tableId) {
          s.emit('poker:table_state', table.getState(uid));
        }
      }
    });
  }

  private async _emitToUser(userId: string, event: string, data: unknown): Promise<void> {
    if (!this.io) return;
    const sockets = await this.io.fetchSockets();
    for (const s of sockets) {
      if ((s as any).userId === userId) {
        s.emit(event, data);
        break;
      }
    }
  }

  // ---- Tournament End: Persist & Pay Out ----

  private async _handleTournamentEnd(tournament: Tournament, results: Tournament['results']): Promise<void> {
    const container = getContainer('users');
    const dataContainer = getContainer('data');
    const now = new Date().toISOString();

    for (const result of results) {
      if (result.userId.startsWith('bot:')) continue;

      // Credit prize chips
      if (result.prize > 0) {
        try {
          const { resource: user } = await container.item(result.userId, result.userId).read();
          if (user) {
            user.chips += result.prize;
            user.gamesPlayed = (user.gamesPlayed || 0) + 1;
            if (result.place === 1) {
              user.gamesWon = (user.gamesWon || 0) + 1;
            }
            await container.item(result.userId, result.userId).replace(user);
          }
        } catch (err) {
          console.error(`[tournament] chip credit error for ${result.userId}:`, err);
        }
      }

      // Persist result
      try {
        await dataContainer.items.create({
          id: `tresult_${tournament.id}_${result.userId}`,
          docType: 'tournament_result',
          userId: result.userId,
          tournamentId: tournament.id,
          tournamentName: tournament.config.name,
          place: result.place,
          prize: result.prize,
          totalPlayers: tournament.players.size,
          buyIn: tournament.config.buyIn,
          createdAt: now,
          ttl: 90 * 24 * 60 * 60, // 90 day retention
        });
      } catch { /* non-critical */ }

      // Send final result
      this._emitToUser(result.userId, 'tournament:result', {
        tournamentId: tournament.id,
        place: result.place,
        prize: result.prize,
        totalPlayers: tournament.players.size,
      });
    }

    // Cleanup after delay
    setTimeout(() => {
      this.tournaments.delete(tournament.id);
      tournament.destroy();
    }, 60_000);
  }

  // ---- Public ----

  getTournament(id: string): Tournament | undefined {
    return this.tournaments.get(id);
  }

  shutdownAll(): void {
    for (const [, t] of this.tournaments) {
      t.destroy();
    }
    this.tournaments.clear();
  }
}
