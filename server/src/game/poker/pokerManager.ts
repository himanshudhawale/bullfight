import { Server as SocketIOServer, Socket } from 'socket.io';
import { PokerTable } from './pokerTable';
import { POKER_TIERS, TableTier, type PokerTierConfig, type PokerTableSummary, type PokerSeat } from '../../../../shared/types';
import { getContainer } from '../../config/cosmos';
import { botDecision } from './botAI';
import { POKER_QUICK_MESSAGES } from '../../../../shared/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AuthSocket extends Socket {
  userId?: string;
}

const BOT_NAMES = ['RoboShark', 'CardBot', 'BetMachine', 'PokerPanda', 'ChipMaster'];
let botCounter = 0;

// ---------------------------------------------------------------------------
// PokerManager — manages all poker tables + Socket.IO events
// ---------------------------------------------------------------------------
export class PokerManager {
  private tables = new Map<string, PokerTable>();
  private io: SocketIOServer | null = null;
  private botTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // =========================================================================
  // Initialization
  // =========================================================================

  init(io: SocketIOServer): void {
    this.io = io;

    // Create one table per tier
    for (const tierConfig of POKER_TIERS) {
      const tableId = `poker_${tierConfig.tier}`;
      const table = new PokerTable(tableId, tierConfig);

      table.onStateChange = (t) => this._broadcastTableState(t);
      table.onHandComplete = (t, winners) => this._handleHandComplete(t, winners);

      this.tables.set(tableId, table);

      // Seed 2 bots per table
      this._addBot(table);
      this._addBot(table);

      console.log(`♠ Poker table created: ${tableId} (${tierConfig.name}, ${tierConfig.smallBlind}/${tierConfig.bigBlind})`);
    }
  }

  // =========================================================================
  // Socket.IO connection handler
  // =========================================================================

  handleConnection(socket: AuthSocket, io: SocketIOServer): void {
    const userId = socket.userId!;

    // ---- List tables ----
    socket.on('poker:list_tables', () => {
      const summaries: PokerTableSummary[] = [];
      for (const [id, table] of this.tables) {
        summaries.push({
          tableId: id,
          tier: table.config.tier,
          name: table.config.name,
          playerCount: table.getPlayerCount(),
          maxSeats: table.config.maxSeats,
          smallBlind: table.config.smallBlind,
          bigBlind: table.config.bigBlind,
        });
      }
      socket.emit('poker:tables', summaries);
    });

    // ---- Join table ----
    socket.on('poker:join_table', async ({ tableId }: { tableId: string }) => {
      const table = this.tables.get(tableId);
      if (!table) {
        socket.emit('error', { message: 'Table not found' });
        return;
      }

      const roomName = `poker:${tableId}`;
      socket.join(roomName);
      (socket as any)._pokerTableId = tableId;

      // Load user chips from Cosmos
      const chips = await this._loadUserChips(userId);
      if (chips < table.config.minBuyIn) {
        // Let them spectate but don't sit down
        socket.emit('poker:table_state', table.getState(userId));
        return;
      }

      // Auto-sit at an open seat
      const seatIdx = table.sitDown(userId, await this._getDisplayName(userId), chips);
      if (seatIdx < 0) {
        // Table full — spectate
        socket.emit('poker:table_state', table.getState(userId));
        return;
      }

      this._broadcastTableState(table);
    });

    // ---- Leave table ----
    socket.on('poker:leave_table', ({ tableId }: { tableId: string }) => {
      const table = this.tables.get(tableId);
      if (!table) return;

      const seat = table.seats.find(s => s?.userId === userId);
      if (seat) {
        // Save remaining chips back to user account
        this._saveUserChips(userId, seat.chips).catch(() => {});
      }

      table.standUp(userId);
      socket.leave(`poker:${tableId}`);
      (socket as any)._pokerTableId = null;

      this._broadcastTableState(table);
    });

    // ---- Player action ----
    socket.on('poker:action', ({ tableId, action, amount }: { tableId: string; action: string; amount?: number }) => {
      const table = this.tables.get(tableId);
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
      // State is broadcast via onStateChange callback
    });

    // ---- Buy in (add chips to seat) ----
    socket.on('poker:buy_in', async ({ tableId, amount }: { tableId: string; amount: number }) => {
      const table = this.tables.get(tableId);
      if (!table) {
        socket.emit('error', { message: 'Table not found' });
        return;
      }

      // Check user has enough account chips
      try {
        const container = getContainer('users');
        const { resource } = await container.item(userId, userId).read();
        if (!resource || resource.chips < amount) {
          socket.emit('error', { message: 'Insufficient chips' });
          return;
        }

        // Deduct from account
        resource.chips -= amount;
        await container.item(userId, userId).replace(resource);

        // Add to table seat (or sit down)
        const existingSeat = table.seats.find(s => s?.userId === userId);
        if (existingSeat) {
          existingSeat.chips += amount;
        } else {
          table.sitDown(userId, resource.displayName || 'Player', amount);
        }

        this._broadcastTableState(table);
      } catch {
        socket.emit('error', { message: 'Buy-in failed' });
      }
    });

    // ---- Quick chat ----
    socket.on('poker:send_chat', ({ tableId, messageId }: { tableId: string; messageId: string }) => {
      const table = this.tables.get(tableId);
      if (!table) return;

      const seat = table.seats.find(s => s?.userId === userId);
      if (!seat) return;

      const msg = POKER_QUICK_MESSAGES.find(m => m.id === messageId);
      if (!msg) return;

      // Broadcast to everyone at the table
      if (this.io) {
        this.io.in(`poker:${tableId}`).emit('poker:chat', {
          seatIndex: seat.seatIndex,
          displayName: seat.displayName,
          text: msg.text,
          timestamp: Date.now(),
        });
      }
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      const tableId = (socket as any)._pokerTableId;
      if (tableId) {
        const table = this.tables.get(tableId);
        if (table) {
          const seat = table.seats.find(s => s?.userId === userId);
          if (seat) {
            this._saveUserChips(userId, seat.chips).catch(() => {});
            table.standUp(userId);
            this._broadcastTableState(table);
          }
        }
      }
    });
  }

  // =========================================================================
  // Broadcasting
  // =========================================================================

  private _broadcastTableState(table: PokerTable): void {
    if (!this.io) return;
    const room = this.io.in(`poker:${table.tableId}`);

    room.fetchSockets().then(sockets => {
      for (const s of sockets) {
        const uid = (s as any).userId as string | undefined;
        s.emit('poker:table_state', table.getState(uid));
      }
    });

    // Trigger bot actions after state broadcast
    this._scheduleBotActions(table);
  }

  // =========================================================================
  // Hand completion
  // =========================================================================

  private async _handleHandComplete(table: PokerTable, winners: { seatIndex: number; amount: number; hand?: string }[]): Promise<void> {
    // Persist chip balances for human players
    for (const seat of table.seats) {
      if (!seat || seat.isBot) continue;
      await this._saveUserChips(seat.userId!, seat.chips).catch(() => {});
    }

    // Broadcast hand result
    if (this.io) {
      this.io.in(`poker:${table.tableId}`).emit('poker:hand_result', {
        handNumber: table.handNumber,
        winners,
        communityCards: table.communityCards,
        seats: table.seats.map(s => s ? {
          seatIndex: s.seatIndex,
          displayName: s.displayName,
          holeCards: s.folded ? [] : s.holeCards,
          chips: s.chips,
        } : null),
      });
    }
  }

  // =========================================================================
  // Bot management
  // =========================================================================

  private _addBot(table: PokerTable): void {
    const botId = `bot:poker_${++botCounter}`;
    const botName = BOT_NAMES[botCounter % BOT_NAMES.length];
    const chips = table.config.maxBuyIn;
    table.sitDown(botId, botName, chips, undefined, true);
  }

  private _scheduleBotActions(table: PokerTable): void {
    // Clear existing timer for this table
    const existingTimer = this.botTimers.get(table.tableId);
    if (existingTimer) clearTimeout(existingTimer);

    if (table.phase === 'waiting' || table.phase === 'showdown') return;

    const activeSeat = table.seats[table.activeSeat];
    if (!activeSeat || !activeSeat.isBot) return;

    // Bot acts after a delay (1-3 seconds for realism)
    const delay = 1000 + Math.random() * 2000;
    const timer = setTimeout(() => {
      if (table.activeSeat < 0) return;
      const seat = table.seats[table.activeSeat];
      if (!seat || !seat.isBot || seat.folded || seat.allIn) return;

      const decision = this._getBotDecision(table, seat);
      table.doAction(seat.userId!, decision.action as any, decision.amount);
    }, delay);

    this.botTimers.set(table.tableId, timer);
  }

  private _getBotDecision(table: PokerTable, seat: PokerSeat): { action: string; amount?: number } {
    // Use existing botAI module
    try {
      const fakeState = {
        phase: table.phase,
        botHole: seat.holeCards,
        community: table.communityCards,
        currentBet: table._getCurrentBet(),
        botBet: seat.currentBet,
        botChips: seat.chips,
        pot: table.pots.reduce((sum, p) => sum + p.amount, 0),
        bigBlind: table.config.bigBlind,
      };
      const result = botDecision(fakeState as any);

      if (result.action === 'raise') {
        const raiseAmt = result.amount ?? table.config.bigBlind * (2 + Math.floor(Math.random() * 3));
        return { action: 'raise', amount: raiseAmt };
      }
      return { action: result.action };
    } catch {
      // Fallback: check or fold
      if (seat.currentBet >= table._getCurrentBet()) {
        return { action: 'check' };
      }
      return { action: 'fold' };
    }
  }

  // =========================================================================
  // Chip persistence
  // =========================================================================

  private async _loadUserChips(userId: string): Promise<number> {
    try {
      const container = getContainer('users');
      const { resource } = await container.item(userId, userId).read();
      return resource?.chips ?? 0;
    } catch {
      return 0;
    }
  }

  private async _saveUserChips(userId: string, tableChips: number): Promise<void> {
    if (userId.startsWith('bot:')) return;
    try {
      const container = getContainer('users');
      const { resource } = await container.item(userId, userId).read();
      if (resource) {
        resource.chips = tableChips;
        await container.item(userId, userId).replace(resource);
      }
    } catch {
      // Non-critical
    }
  }

  private async _getDisplayName(userId: string): Promise<string> {
    try {
      const container = getContainer('users');
      const { resource } = await container.item(userId, userId).read();
      return resource?.displayName ?? 'Player';
    } catch {
      return 'Player';
    }
  }

  // =========================================================================
  // Public accessors
  // =========================================================================

  getTable(tableId: string): PokerTable | undefined {
    return this.tables.get(tableId);
  }

  getAllTables(): PokerTableSummary[] {
    const summaries: PokerTableSummary[] = [];
    for (const [, table] of this.tables) {
      summaries.push({
        tableId: table.tableId,
        tier: table.config.tier,
        name: table.config.name,
        playerCount: table.getPlayerCount(),
        maxSeats: table.config.maxSeats,
        smallBlind: table.config.smallBlind,
        bigBlind: table.config.bigBlind,
      });
    }
    return summaries;
  }
}
