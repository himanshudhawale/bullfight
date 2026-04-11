import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  BullfightGame,
  RoundResults,
  PlaceBetResult,
  GameState,
  RoundStartInfo,
} from './bullfight';
import { startBots } from './bots';
import { getContainer } from '../config/cosmos';
import { invalidateLeaderboardCache } from '../routes/game';
import { TableTier, calculateVipLevel, VIP_XP_REWARDS } from '../../../shared/types';
import { setUserOnline } from '../services/presence';

/* ------------------------------------------------------------------ */
/*  Internal types                                                     */
/* ------------------------------------------------------------------ */

interface AuthSocket extends Socket {
  userId?: string;
}

const TIER_IDS: string[] = ['bullfight'];

/* ------------------------------------------------------------------ */
/*  BullfightManager                                                   */
/* ------------------------------------------------------------------ */

export class BullfightManager {
  private games: Map<string, BullfightGame> = new Map();
  private io: SocketIOServer | null = null;

  constructor() {
    // Games are created in init()
  }

  /**
   * Create one BullfightGame per tier, wire up callbacks, and start the
   * game loop for each.  Call once at server startup after Socket.IO is
   * initialised.
   */
  init(io: SocketIOServer): void {
    this.io = io;

    for (const tier of TIER_IDS) {
      const game = new BullfightGame(tier);

      // Broadcast personalised state to every socket in the tier room
      game._broadcastFn = () => {
        void this._broadcastGameState(tier, game);
      };

      // Persist chip balances and notify bettors when a round finishes
      game.onRoundEnd = (results: RoundResults) => {
        void this._handleRoundEnd(tier, game, results);
      };

      // Real-time balance push when chips change mid-round
      game.onChipsChanged = (userId: string, chips: number) => {
        void this._notifyChipsChanged(tier, userId, chips);
      };

      // Persist round deal to Cosmos before animation begins
      game.onRoundStart = (info: RoundStartInfo) => {
        console.log(`[bullfight:${tier}] round ${info.roundNumber} started`);
        void this._persistRoundDeal(tier, info);
      };

      // Register auto-betting bots
      startBots(game);

      game.start();
      this.games.set(tier, game);
      console.log(`🐂 Bullfight game started for tier: ${tier}`);
    }
  }

  /* ================================================================ */
  /*  Socket connection handler                                       */
  /* ================================================================ */

  handleConnection(socket: AuthSocket, io: SocketIOServer): void {
    const userId = socket.userId!;
    console.log(`🔌 Bullfight player connected: ${userId}`);

    /* ---- join_tier ---- */
    socket.on(
      'join_tier',
      async ({ tier }: { tier: string }) => {
        if (!this._isValidTier(tier)) {
          socket.emit('error', { message: 'Invalid tier' });
          return;
        }

        const roomName = this._roomName(tier);
        socket.join(roomName);
        (socket as any)._currentTier = tier;

        // Update presence to in_game
        void setUserOnline(userId, 'in_game', 3600, tier);

        const game = this.games.get(tier)!;

        // Restore persisted chips if this is the player's first join
        const savedChips = await this._loadChips(tier, userId);
        if (savedChips > 0 && !game.chipBalances.has(userId)) {
          game.buyChips(userId, savedChips);
        }

        socket.emit('game_state', game.getState(userId));
      },
    );

    /* ---- leave_tier ---- */
    socket.on('leave_tier', async ({ tier }: { tier: string }, ack?: (res: any) => void) => {
      if (!this._isValidTier(tier)) {
        ack?.({ ok: true, chips: 0 });
        return;
      }

      // Persist in-game chip balance back to Cosmos before leaving
      const game = this.games.get(tier);
      let savedBalance = 0;
      if (game) {
        const balance = game.chipBalances.get(userId);
        if (balance !== undefined) {
          savedBalance = balance;
          await this._saveChips(tier, userId, balance);
        }
      }

      socket.leave(this._roomName(tier));
      (socket as any)._currentTier = null;
      void setUserOnline(userId, 'online', 3600, null);

      // Acknowledge with saved balance so client can update immediately
      ack?.({ ok: true, chips: savedBalance });
    });

    /* ---- bet ---- */
    socket.on(
      'bet',
      ({ tier, betType, amount }: { tier: string; betType: string; amount: number }) => {
        if (!this._isValidTier(tier)) {
          socket.emit('error', { message: 'Invalid tier' });
          return;
        }

        const game = this.games.get(tier)!;
        const result = game.placeBet(userId, betType, amount);

        if (result.ok) {
          socket.emit('bet_ok', {
            tier,
            betType,
            amount,
            multiplier: result.multiplier,
            chipsLeft: result.chipsLeft,
          });
          void this._broadcastGameState(tier, game);
          // Persist updated balance immediately so lobby shows correct chips
          void this._saveChips(tier, userId, result.chipsLeft!);
        } else {
          socket.emit('error', { message: result.error ?? 'Bet failed' });
        }
      },
    );

    /* ---- buy_chips (transfer from account → in-game) ---- */
    socket.on(
      'buy_chips',
      async ({ tier, amount }: { tier: string; amount: number }) => {
        if (!this._isValidTier(tier)) {
          socket.emit('error', { message: 'Invalid tier' });
          return;
        }
        if (amount <= 0) {
          socket.emit('error', { message: 'Invalid amount' });
          return;
        }

        try {
          const usersContainer = getContainer('users');
          const { resource: user } = await usersContainer
            .item(userId, userId)
            .read();

          if (!user) {
            socket.emit('error', { message: 'User not found' });
            return;
          }
          if (user.chips < amount) {
            socket.emit('error', { message: 'Insufficient chips' });
            return;
          }

          // Deduct from global account balance
          user.chips -= amount;
          await usersContainer.item(userId, userId).replace(user);

          // Credit to in-game balance
          const game = this.games.get(tier)!;
          const newGameBalance = game.buyChips(userId, amount);

          // Persist in-game chip balance
          await this._saveChips(tier, userId, newGameBalance);

          socket.emit('chips_update', {
            tier,
            gameChips: newGameBalance,
            accountChips: user.chips,
          });

          void this._broadcastGameState(tier, game);
        } catch (err) {
          console.error(
            `[bullfight:${tier}] buy_chips error for ${userId}:`,
            err,
          );
          socket.emit('error', { message: 'Failed to buy chips' });
        }
      },
    );

    /* ---- get_leaderboard ---- */
    socket.on(
      'get_leaderboard',
      async ({ tier, period }: { tier: string; period?: '24h' | '7d' }) => {
        if (!this._isValidTier(tier)) {
          socket.emit('error', { message: 'Invalid tier' });
          return;
        }

        try {
          const entries = await this._getLeaderboard(tier, period || '24h');
          socket.emit('leaderboard', { tier, entries });
        } catch (err) {
          console.error(`[bullfight:${tier}] leaderboard error:`, err);
          socket.emit('error', { message: 'Failed to load leaderboard' });
        }
      },
    );

    /* ---- send_emote ---- */
    socket.on(
      'send_emote',
      async ({ tier, emoteId, target }: { tier: string; emoteId: string; target: 'a' | 'b' }) => {
        if (!this._isValidTier(tier)) {
          socket.emit('error', { message: 'Invalid tier' });
          return;
        }

        // Find emote config and deduct cost
        const { EMOTE_LIST } = await import('../../../shared/types');
        const emote = EMOTE_LIST.find((e) => e.id === emoteId);
        if (!emote) {
          socket.emit('error', { message: 'Unknown emote' });
          return;
        }

        const game = this.games.get(tier)!;
        const balance = game.chipBalances.get(userId) ?? 0;

        if (emote.cost > 0) {
          if (balance < emote.cost) {
            socket.emit('error', { message: 'Not enough chips for this emote' });
            return;
          }
          game.chipBalances.set(userId, balance - emote.cost);
          socket.emit('chips_update', { tier, gameChips: balance - emote.cost });
        }

        // Broadcast emote to everyone in the tier room
        if (this.io) {
          this.io.in(this._roomName(tier)).emit('emote_received', {
            fromUserId: userId,
            emoteId,
            target,
          });
        }
      },
    );

    /* ---- get_history ---- */
    socket.on(
      'get_history',
      ({ tier }: { tier: string }) => {
        if (!this._isValidTier(tier)) {
          socket.emit('error', { message: 'Invalid tier' });
          return;
        }

        const game = this.games.get(tier)!;
        const history = (game as any)._betHistory?.get(userId) ?? [];
        socket.emit('history', { tier, entries: history.slice(-15) });
      },
    );

    /* ---- disconnect ---- */
    socket.on('disconnect', async () => {
      console.log(`🔌 Bullfight player disconnected: ${userId}`);

      // Persist in-game chip balance for whichever tier they were in
      const currentTier = (socket as any)._currentTier;
      if (currentTier) {
        const game = this.games.get(currentTier);
        if (game) {
          const balance = game.chipBalances.get(userId);
          if (balance !== undefined) {
            await this._saveChips(currentTier, userId, balance);
          }
        }
      }

      void setUserOnline(userId, 'offline', 60, null);
    });

    /* ---- send_message (chat DM) ---- */
    socket.on(
      'send_message',
      async ({ toUserId, text }: { toUserId: string; text: string }) => {
        if (!text || !toUserId || text.length > 500) return;

        const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const trimmedText = text.trim();
        const createdAt = new Date().toISOString();

        const message = {
          id: msgId,
          docType: 'chat_message',
          userId: toUserId, // partition key — stored under recipient
          fromUserId: userId,
          toUserId,
          text: trimmedText,
          createdAt,
        };

        try {
          const dataContainer = getContainer('data');

          // Save under recipient's partition + sender's partition
          await dataContainer.items.create(message);
          await dataContainer.items.create({
            ...message,
            id: `${msgId}_sent`,
            userId,
          });

          // Get sender display name
          const usersContainer = getContainer('users');
          const { resource: sender } = await usersContainer
            .item(userId, userId)
            .read();

          const payload = {
            id: msgId,
            fromUserId: userId,
            toUserId,
            text: trimmedText,
            createdAt,
            fromDisplayName: sender?.displayName || 'Unknown',
          };

          // Emit to recipient if online
          const allSockets = await io.fetchSockets();
          for (const s of allSockets) {
            if ((s as any).userId === toUserId) {
              s.emit('message_received', payload);
            }
          }

          // Confirm to sender
          socket.emit('message_received', payload);
        } catch (err) {
          console.error(`[chat] send_message error for ${userId}:`, err);
        }
      },
    );

    /* ---- get_chat_history ---- */
    socket.on(
      'get_chat_history',
      async ({ withUserId, limit = 50 }: { withUserId: string; limit?: number }) => {
        try {
          const dataContainer = getContainer('data');
          const { resources } = await dataContainer.items
            .query({
              query: `SELECT * FROM c WHERE c.docType = 'chat_message' AND c.userId = @myId AND
                ((c.fromUserId = @myId AND c.toUserId = @friendId) OR (c.fromUserId = @friendId AND c.toUserId = @myId))
                ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit`,
              parameters: [
                { name: '@myId', value: userId },
                { name: '@friendId', value: withUserId },
                { name: '@limit', value: limit },
              ],
            })
            .fetchAll();

          socket.emit('chat_history', {
            withUserId,
            messages: resources.reverse().map((m: any) => ({
              id: m.id,
              fromUserId: m.fromUserId,
              toUserId: m.toUserId,
              text: m.text,
              createdAt: m.createdAt,
            })),
          });
        } catch (err) {
          console.error(`[chat] get_chat_history error for ${userId}:`, err);
        }
      },
    );
  }

  /* ================================================================ */
  /*  Cosmos DB chip persistence                                      */
  /* ================================================================ */

  /**
   * Save chip balance back to the main user.chips field.
   */
  async _saveChips(
    tier: string,
    userId: string,
    chips: number,
  ): Promise<void> {
    try {
      const container = getContainer('users');
      const { resource } = await container.item(userId, userId).read();
      if (resource) {
        resource.chips = chips;
        await container.item(userId, userId).replace(resource);
      }
    } catch {
      // Non-critical — in-memory balance is still correct
    }
  }

  async _loadChips(tier: string, userId: string): Promise<number> {
    try {
      const container = getContainer('users');
      const { resource } = await container.item(userId, userId).read();
      // Always use the main chip balance — store purchases update user.chips
      return resource?.chips ?? 0;
    } catch {
      return 0;
    }
  }

  /* ================================================================ */
  /*  Public accessors                                                 */
  /* ================================================================ */

  getGame(tier: string): BullfightGame | undefined {
    return this.games.get(tier);
  }

  shutdownAll(): void {
    for (const [tier, game] of this.games) {
      console.log(`🛑 Stopping bullfight game for tier: ${tier}`);
      game.stop();
      game.destroy();
    }
    this.games.clear();
  }

  /* ================================================================ */
  /*  Private helpers                                                  */
  /* ================================================================ */

  private _isValidTier(tier: string): boolean {
    return TIER_IDS.includes(tier);
  }

  private _roomName(tier: string): string {
    return `bullfight:${tier}`;
  }

  private async _broadcastGameState(
    tier: string,
    game: BullfightGame,
  ): Promise<void> {
    if (!this.io) return;

    try {
      const sockets = await this.io
        .in(this._roomName(tier))
        .fetchSockets();

      for (const s of sockets) {
        const uid = (s as any).userId as string | undefined;
        if (uid) {
          s.emit('game_state', game.getState(uid));
        }
      }
    } catch (err) {
      console.error(`[bullfight:${tier}] broadcast error:`, err);
    }
  }

  private async _handleRoundEnd(
    tier: string,
    game: BullfightGame,
    results: RoundResults,
  ): Promise<void> {
    if (!this.io) return;

    try {
      // Build a lookup of payouts per userId for quick access
      const payoutsByUser = new Map<string, typeof results.payouts[number][]>();
      for (const p of results.payouts) {
        let arr = payoutsByUser.get(p.userId);
        if (!arr) {
          arr = [];
          payoutsByUser.set(p.userId, arr);
        }
        arr.push(p);
      }

      const sockets = await this.io
        .in(this._roomName(tier))
        .fetchSockets();

      for (const s of sockets) {
        const uid = (s as any).userId as string | undefined;
        if (!uid) continue;

        // Send payout details to users who placed bets
        const userPayouts = payoutsByUser.get(uid);
        if (userPayouts && userPayouts.length > 0) {
          s.emit('payout', {
            tier,
            roundNumber: results.roundNumber,
            winner: results.winner,
            payouts: userPayouts,
            newBalance: game.chipBalances.get(uid) ?? 0,
          });
        }
      }

      // Only persist chip balances for users who actually bet this round
      const bettors = new Set(results.payouts.map(p => p.userId));
      for (const uid of bettors) {
        if (uid.startsWith('bot:')) continue;
        const balance = game.chipBalances.get(uid);
        if (balance !== undefined) {
          await this._saveChips(tier, uid, balance);
        }
      }

      // Broadcast updated game state immediately so clients see new balances
      await this._broadcastGameState(tier, game);

      // Bust the leaderboard cache so the next lobby fetch gets fresh data
      invalidateLeaderboardCache();

      // Write per-user net winnings to Cosmos for time-based leaderboard
      const netByUser = new Map<string, number>();
      for (const p of results.payouts) {
        if (p.userId.startsWith('bot:')) continue;
        const prev = netByUser.get(p.userId) ?? 0;
        // net = payout received minus amount wagered
        netByUser.set(p.userId, prev + (p.won ? p.payout : -p.amount));
      }
      const dataContainer = getContainer('data');
      const now = new Date().toISOString();
      for (const [uid, net] of netByUser) {
        try {
          await dataContainer.items.create({
            id: `lb_${uid}_${tier}_${results.roundNumber}_${Date.now()}`,
            userId: uid,
            docType: 'leaderboard_entry',
            tier,
            netWinnings: net,
            roundNumber: results.roundNumber,
            createdAt: now,
            ttl: 8 * 24 * 3600, // auto-expire after 8 days
          });
        } catch (lbErr) {
          console.error(`[bullfight:${tier}] leaderboard write error for ${uid}:`, lbErr);
        }
      }

      // Update gamesPlayed / gamesWon only for real users who placed bets
      const bettingUserWon = new Map<string, boolean>();
      for (const p of results.payouts) {
        if (p.userId.startsWith('bot:')) continue;
        const prev = bettingUserWon.get(p.userId);
        bettingUserWon.set(p.userId, prev || p.won);
      }

      for (const [uid, won] of bettingUserWon) {
        try {
          const usersContainer = getContainer('users');
          const { resource: user } = await usersContainer.item(uid, uid).read();
          if (user) {
            user.gamesPlayed = (user.gamesPlayed || 0) + 1;
            user.vipXp = (user.vipXp || 0) + VIP_XP_REWARDS.GAME_PLAYED;
            if (won) {
              user.gamesWon = (user.gamesWon || 0) + 1;
              user.vipXp += VIP_XP_REWARDS.GAME_WON;
            }
            user.vipLevel = calculateVipLevel(user.vipXp);
            await usersContainer.item(uid, uid).replace(user);
          }
        } catch (statsErr) {
          console.error(`[bullfight:${tier}] stats update error for ${uid}:`, statsErr);
        }
      }
    } catch (err) {
      console.error(
        `[bullfight:${tier}] round end persistence error:`,
        err,
      );
    }
  }

  private async _notifyChipsChanged(
    tier: string,
    userId: string,
    chips: number,
  ): Promise<void> {
    if (!this.io) return;

    try {
      const sockets = await this.io
        .in(this._roomName(tier))
        .fetchSockets();

      for (const s of sockets) {
        if ((s as any).userId === userId) {
          s.emit('chips_update', { tier, gameChips: chips });
          break;
        }
      }
    } catch (err) {
      console.error(`[bullfight:${tier}] chips_changed error:`, err);
    }
  }

  /** Persist the full round deal — delete previous, keep only current active round */
  private async _persistRoundDeal(_tier: string, info: RoundStartInfo): Promise<void> {
    try {
      const container = getContainer('bullfight');

      // Single document — upsert with fixed id so there's always exactly one
      await container.items.upsert({
        id: 'active',
        roundNumber: info.roundNumber,
        playerACards: info.playerACards,
        playerBCards: info.playerBCards,
        community: info.community,
        burns: info.burns,
        preComputedWinner: info.winner,
        resultA: info.resultA,
        resultB: info.resultB,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[bullfight] round deal persistence error:`, err);
    }
  }

  private async _getLeaderboard(
    tier: string,
    period: '24h' | '7d',
  ): Promise<Array<{ rank: number; name: string; chips: number }>> {
    const dataContainer = getContainer('data');
    const usersContainer = getContainer('users');
    const hoursAgo = period === '24h' ? 24 : 7 * 24;
    const since = new Date(Date.now() - hoursAgo * 3600_000).toISOString();

    try {
      const { resources } = await dataContainer.items.query({
        query: `
          SELECT c.userId, SUM(c.netWinnings) AS totalNet
          FROM c
          WHERE c.docType = 'leaderboard_entry'
            AND c.tier = @tier
            AND c.createdAt >= @since
          GROUP BY c.userId
        `,
        parameters: [
          { name: '@tier', value: tier },
          { name: '@since', value: since },
        ],
      }).fetchAll();

      // Sort by net winnings descending, take top 50
      const sorted = resources
        .filter((r: any) => r.totalNet > 0)
        .sort((a: any, b: any) => b.totalNet - a.totalNet)
        .slice(0, 50);

      // Resolve display names
      const entries: Array<{ rank: number; name: string; chips: number }> = [];
      for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i];
        let name = 'Anonymous';
        try {
          const { resource: user } = await usersContainer.item(r.userId, r.userId).read();
          if (user?.displayName) name = user.displayName;
        } catch { /* skip */ }
        entries.push({ rank: i + 1, name, chips: r.totalNet });
      }
      return entries;
    } catch (err) {
      console.error(`[bullfight:${tier}] leaderboard query error:`, err);
      // Fallback to in-memory balances
      const game = this.games.get(tier);
      if (!game) return [];
      const entries: Array<{ rank: number; name: string; chips: number }> = [];
      let i = 0;
      for (const [userId, chips] of [...game.chipBalances].sort((a, b) => b[1] - a[1]).slice(0, 50)) {
        if (chips <= 0) continue;
        let name = 'Anonymous';
        try {
          const { resource: user } = await usersContainer.item(userId, userId).read();
          if (user?.displayName) name = user.displayName;
        } catch { /* skip */ }
        entries.push({ rank: ++i, name, chips });
      }
      return entries;
    }
  }
}
