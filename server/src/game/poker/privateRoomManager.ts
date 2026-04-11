// privateRoomManager.ts

import { Server as SocketIOServer, Socket } from 'socket.io';
import { PokerTable } from './pokerTable';
import { PokerTierConfig, TableTier, PokerTableSummary } from '../../../../shared/types';
import { getContainer } from '../../config/cosmos';
import { botDecision } from './botAI';

interface AuthSocket extends Socket {
  userId?: string;
}

export interface PrivateRoomConfig {
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;       // 2-9
  password?: string;      // optional room password
  vipLevelRequired?: number; // minimum VIP level to join
}

export interface PrivateRoomInfo {
  roomId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  config: PrivateRoomConfig;
  playerCount: number;
  maxSeats: number;
  createdAt: string;
  hasPassword: boolean;
  invitedUserIds: string[];
}

export class PrivateRoomManager {
  private rooms = new Map<string, {
    table: PokerTable;
    ownerId: string;
    ownerName: string;
    config: PrivateRoomConfig;
    password?: string;
    invitedUserIds: Set<string>;
    createdAt: string;
    idleTimer: ReturnType<typeof setTimeout> | null;
  }>();

  private io: SocketIOServer | null = null;
  private botTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Max rooms per user and total
  private static MAX_ROOMS_PER_USER = 3;
  private static MAX_TOTAL_ROOMS = 100;
  private static IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min with no players → auto-close

  init(io: SocketIOServer): void {
    this.io = io;
    console.log('🏠 Private Room Manager initialized');
  }

  handleConnection(socket: AuthSocket, io: SocketIOServer): void {
    const userId = socket.userId!;

    // ---- Create Room ----
    socket.on('private_room:create', async (config: PrivateRoomConfig, ack?: (res: any) => void) => {
      // Validate config
      if (!config.name || config.name.length > 30) {
        ack?.({ ok: false, error: 'Room name required (max 30 chars)' });
        return;
      }
      if (config.maxSeats < 2 || config.maxSeats > 9) {
        ack?.({ ok: false, error: 'Max seats must be 2-9' });
        return;
      }
      if (config.smallBlind <= 0 || config.bigBlind <= 0 || config.bigBlind < config.smallBlind * 2) {
        ack?.({ ok: false, error: 'Invalid blinds (big blind must be >= 2x small blind)' });
        return;
      }
      if (config.minBuyIn < config.bigBlind * 10) {
        ack?.({ ok: false, error: 'Min buy-in must be >= 10x big blind' });
        return;
      }
      if (config.maxBuyIn < config.minBuyIn) {
        ack?.({ ok: false, error: 'Max buy-in must be >= min buy-in' });
        return;
      }

      // Check room limits
      const userRooms = [...this.rooms.values()].filter(r => r.ownerId === userId);
      if (userRooms.length >= PrivateRoomManager.MAX_ROOMS_PER_USER) {
        ack?.({ ok: false, error: `Max ${PrivateRoomManager.MAX_ROOMS_PER_USER} rooms per user` });
        return;
      }
      if (this.rooms.size >= PrivateRoomManager.MAX_TOTAL_ROOMS) {
        ack?.({ ok: false, error: 'Server room limit reached' });
        return;
      }

      // Generate room ID
      const roomId = `private_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Create PokerTable with custom config
      const tierConfig: PokerTierConfig = {
        tier: TableTier.MONTE_CARLO, // tier label doesn't matter for private
        name: config.name,
        smallBlind: config.smallBlind,
        bigBlind: config.bigBlind,
        minBuyIn: config.minBuyIn,
        maxBuyIn: config.maxBuyIn,
        maxSeats: config.maxSeats,
      };

      const table = new PokerTable(roomId, tierConfig);
      table.onStateChange = (t) => this._broadcastTableState(t);
      table.onHandComplete = (t, winners) => this._handleHandComplete(t, winners);

      const ownerName = await this._getDisplayName(userId);

      const room = {
        table,
        ownerId: userId,
        ownerName,
        config,
        password: config.password,
        invitedUserIds: new Set<string>(),
        createdAt: new Date().toISOString(),
        idleTimer: null as ReturnType<typeof setTimeout> | null,
      };

      this.rooms.set(roomId, room);
      this._resetIdleTimer(roomId);

      // Persist room to Cosmos
      await this._persistRoom(roomId, room);

      console.log(`🏠 Private room created: ${roomId} by ${userId}`);

      ack?.({
        ok: true,
        roomId,
        roomInfo: this._getRoomInfo(roomId),
      });
    });

    // ---- List My Rooms ----
    socket.on('private_room:list_mine', (_: any, ack?: (res: any) => void) => {
      const myRooms: PrivateRoomInfo[] = [];
      for (const [roomId, room] of this.rooms) {
        if (room.ownerId === userId || room.invitedUserIds.has(userId) || room.table.seats.some(s => s?.userId === userId)) {
          myRooms.push(this._getRoomInfo(roomId)!);
        }
      }
      ack?.({ ok: true, rooms: myRooms });
    });

    // ---- List All Public Rooms (no password) ----
    socket.on('private_room:list_public', (_: any, ack?: (res: any) => void) => {
      const publicRooms: PrivateRoomInfo[] = [];
      for (const [roomId, room] of this.rooms) {
        if (!room.password) {
          publicRooms.push(this._getRoomInfo(roomId)!);
        }
      }
      ack?.({ ok: true, rooms: publicRooms });
    });

    // ---- Join Room ----
    socket.on('private_room:join', async ({ roomId, password }: { roomId: string; password?: string }, ack?: (res: any) => void) => {
      const room = this.rooms.get(roomId);
      if (!room) {
        ack?.({ ok: false, error: 'Room not found' });
        return;
      }

      // Check password
      if (room.password && room.password !== password && room.ownerId !== userId && !room.invitedUserIds.has(userId)) {
        ack?.({ ok: false, error: 'Incorrect password' });
        return;
      }

      // Check VIP level
      if (room.config.vipLevelRequired) {
        try {
          const container = getContainer('users');
          const { resource: user } = await container.item(userId, userId).read();
          if (user && (user.vipLevel || 1) < room.config.vipLevelRequired) {
            ack?.({ ok: false, error: `VIP level ${room.config.vipLevelRequired} required` });
            return;
          }
        } catch { /* allow join on error */ }
      }

      const socketRoomName = `private_poker:${roomId}`;
      socket.join(socketRoomName);
      (socket as any)._privateRoomId = roomId;

      // Load chips and auto-sit
      const chips = await this._loadUserChips(userId);
      if (chips < room.config.minBuyIn) {
        // Spectate only
        ack?.({ ok: true, spectating: true });
        socket.emit('poker:table_state', room.table.getState(userId));
        return;
      }

      const displayName = await this._getDisplayName(userId);
      const seatIdx = room.table.sitDown(userId, displayName, Math.min(chips, room.config.maxBuyIn));

      if (seatIdx < 0) {
        ack?.({ ok: true, spectating: true }); // table full
        socket.emit('poker:table_state', room.table.getState(userId));
        return;
      }

      this._resetIdleTimer(roomId);
      this._broadcastTableState(room.table);
      ack?.({ ok: true, seatIndex: seatIdx });
    });

    // ---- Leave Room ----
    socket.on('private_room:leave', ({ roomId }: { roomId: string }) => {
      const room = this.rooms.get(roomId);
      if (!room) return;

      const seat = room.table.seats.find(s => s?.userId === userId);
      if (seat) {
        this._saveUserChips(userId, seat.chips).catch(() => {});
        room.table.standUp(userId);
      }

      socket.leave(`private_poker:${roomId}`);
      (socket as any)._privateRoomId = null;
      this._broadcastTableState(room.table);
      this._resetIdleTimer(roomId);
    });

    // ---- Player Action ----
    socket.on('private_room:action', ({ roomId, action, amount }: { roomId: string; action: string; amount?: number }) => {
      const room = this.rooms.get(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const result = room.table.doAction(userId, action as any, amount);
      if (!result.ok) {
        socket.emit('error', { message: result.error });
        return;
      }
      socket.emit('poker:action_ok', { action, amount });
    });

    // ---- Buy In ----
    socket.on('private_room:buy_in', async ({ roomId, amount }: { roomId: string; amount: number }) => {
      const room = this.rooms.get(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      try {
        const container = getContainer('users');
        const { resource } = await container.item(userId, userId).read();
        if (!resource || resource.chips < amount) {
          socket.emit('error', { message: 'Insufficient chips' });
          return;
        }
        if (amount < room.config.minBuyIn || amount > room.config.maxBuyIn) {
          socket.emit('error', { message: `Buy-in must be ${room.config.minBuyIn}-${room.config.maxBuyIn}` });
          return;
        }

        resource.chips -= amount;
        await container.item(userId, userId).replace(resource);

        const existingSeat = room.table.seats.find(s => s?.userId === userId);
        if (existingSeat) {
          existingSeat.chips += amount;
        } else {
          const displayName = await this._getDisplayName(userId);
          room.table.sitDown(userId, displayName, amount);
        }

        this._broadcastTableState(room.table);
      } catch {
        socket.emit('error', { message: 'Buy-in failed' });
      }
    });

    // ---- Invite Friend ----
    socket.on('private_room:invite', async ({ roomId, friendId }: { roomId: string; friendId: string }, ack?: (res: any) => void) => {
      const room = this.rooms.get(roomId);
      if (!room) {
        ack?.({ ok: false, error: 'Room not found' });
        return;
      }
      if (room.ownerId !== userId) {
        ack?.({ ok: false, error: 'Only room owner can invite' });
        return;
      }

      room.invitedUserIds.add(friendId);

      // Send real-time invite notification to friend if online
      if (this.io) {
        const allSockets = await this.io.fetchSockets();
        for (const s of allSockets) {
          if ((s as any).userId === friendId) {
            s.emit('private_room:invited', {
              roomId,
              roomName: room.config.name,
              inviterName: room.ownerName,
              smallBlind: room.config.smallBlind,
              bigBlind: room.config.bigBlind,
            });
          }
        }
      }

      ack?.({ ok: true });
    });

    // ---- Close Room (owner only) ----
    socket.on('private_room:close', async ({ roomId }: { roomId: string }, ack?: (res: any) => void) => {
      const room = this.rooms.get(roomId);
      if (!room) {
        ack?.({ ok: false, error: 'Room not found' });
        return;
      }
      if (room.ownerId !== userId) {
        ack?.({ ok: false, error: 'Only room owner can close the room' });
        return;
      }

      await this._closeRoom(roomId);
      ack?.({ ok: true });
    });

    // ---- Quick Chat ----
    socket.on('private_room:send_chat', ({ roomId, messageId }: { roomId: string; messageId: string }) => {
      const room = this.rooms.get(roomId);
      if (!room) return;

      const seat = room.table.seats.find(s => s?.userId === userId);
      if (!seat) return;

      // Re-use shared quick messages
      const { POKER_QUICK_MESSAGES } = require('../../../../shared/constants');
      const msg = POKER_QUICK_MESSAGES.find((m: any) => m.id === messageId);
      if (!msg) return;

      if (this.io) {
        this.io.in(`private_poker:${roomId}`).emit('poker:chat', {
          seatIndex: seat.seatIndex,
          displayName: seat.displayName,
          text: msg.text,
          timestamp: Date.now(),
        });
      }
    });

    // ---- Disconnect cleanup ----
    socket.on('disconnect', () => {
      const roomId = (socket as any)._privateRoomId;
      if (roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
          const seat = room.table.seats.find(s => s?.userId === userId);
          if (seat) {
            this._saveUserChips(userId, seat.chips).catch(() => {});
            room.table.standUp(userId);
            this._broadcastTableState(room.table);
          }
          this._resetIdleTimer(roomId);
        }
      }
    });
  }

  // ==== Private Helpers ====

  private _getRoomInfo(roomId: string): PrivateRoomInfo | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return {
      roomId,
      name: room.config.name,
      ownerId: room.ownerId,
      ownerName: room.ownerName,
      config: { ...room.config, password: undefined }, // don't expose password
      playerCount: room.table.getPlayerCount(),
      maxSeats: room.config.maxSeats,
      createdAt: room.createdAt,
      hasPassword: !!room.password,
      invitedUserIds: [...room.invitedUserIds],
    };
  }

  private _broadcastTableState(table: PokerTable): void {
    if (!this.io) return;
    const room = this.io.in(`private_poker:${table.tableId}`);
    room.fetchSockets().then(sockets => {
      for (const s of sockets) {
        const uid = (s as any).userId as string | undefined;
        s.emit('poker:table_state', table.getState(uid));
      }
    });
  }

  private async _handleHandComplete(table: PokerTable, winners: { seatIndex: number; amount: number; hand?: string }[]): Promise<void> {
    for (const seat of table.seats) {
      if (!seat || seat.isBot) continue;
      await this._saveUserChips(seat.userId!, seat.chips).catch(() => {});
    }
    if (this.io) {
      this.io.in(`private_poker:${table.tableId}`).emit('poker:hand_result', {
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

  private _resetIdleTimer(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.idleTimer) clearTimeout(room.idleTimer);

    // Only start idle timer if no players seated
    if (room.table.getPlayerCount() === 0) {
      room.idleTimer = setTimeout(() => {
        console.log(`🏠 Auto-closing idle room: ${roomId}`);
        this._closeRoom(roomId);
      }, PrivateRoomManager.IDLE_TIMEOUT_MS);
    } else {
      room.idleTimer = null;
    }
  }

  private async _closeRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Save chips for all seated players
    for (const seat of room.table.seats) {
      if (!seat || seat.isBot) continue;
      await this._saveUserChips(seat.userId!, seat.chips).catch(() => {});
    }

    // Notify all clients in the room
    if (this.io) {
      this.io.in(`private_poker:${roomId}`).emit('private_room:closed', { roomId });
      // Force all sockets to leave the room
      const sockets = await this.io.in(`private_poker:${roomId}`).fetchSockets();
      for (const s of sockets) {
        s.leave(`private_poker:${roomId}`);
      }
    }

    // Cleanup timers
    if (room.idleTimer) clearTimeout(room.idleTimer);
    const botTimer = this.botTimers.get(roomId);
    if (botTimer) clearTimeout(botTimer);
    this.botTimers.delete(roomId);

    // Remove from Cosmos
    await this._deletePersistedRoom(roomId);

    this.rooms.delete(roomId);
    console.log(`🏠 Room closed: ${roomId}`);
  }

  // ---- Cosmos persistence ----

  private async _persistRoom(roomId: string, room: any): Promise<void> {
    try {
      const container = getContainer('data');
      await container.items.upsert({
        id: roomId,
        docType: 'private_room',
        userId: room.ownerId, // partition key
        name: room.config.name,
        ownerId: room.ownerId,
        ownerName: room.ownerName,
        config: { ...room.config, password: room.password ? '***' : undefined },
        hasPassword: !!room.password,
        createdAt: room.createdAt,
        ttl: 24 * 60 * 60, // auto-expire after 24h
      });
    } catch (err) {
      console.error(`[private_room] persist error:`, err);
    }
  }

  private async _deletePersistedRoom(roomId: string): Promise<void> {
    try {
      const container = getContainer('data');
      // Query to find and delete — we stored under ownerId partition
      const { resources } = await container.items.query({
        query: 'SELECT * FROM c WHERE c.id = @id AND c.docType = "private_room"',
        parameters: [{ name: '@id', value: roomId }],
      }).fetchAll();
      for (const r of resources) {
        await container.item(r.id, r.userId).delete();
      }
    } catch { /* non-critical */ }
  }

  private async _loadUserChips(userId: string): Promise<number> {
    try {
      const container = getContainer('users');
      const { resource } = await container.item(userId, userId).read();
      return resource?.chips ?? 0;
    } catch { return 0; }
  }

  private async _saveUserChips(userId: string, chips: number): Promise<void> {
    if (userId.startsWith('bot:')) return;
    try {
      const container = getContainer('users');
      const { resource } = await container.item(userId, userId).read();
      if (resource) {
        resource.chips = chips;
        await container.item(userId, userId).replace(resource);
      }
    } catch { /* non-critical */ }
  }

  private async _getDisplayName(userId: string): Promise<string> {
    try {
      const container = getContainer('users');
      const { resource } = await container.item(userId, userId).read();
      return resource?.displayName ?? 'Player';
    } catch { return 'Player'; }
  }

  // ---- Public accessors ----

  getRoom(roomId: string): PrivateRoomInfo | null {
    return this._getRoomInfo(roomId);
  }

  getAllPublicRooms(): PrivateRoomInfo[] {
    const rooms: PrivateRoomInfo[] = [];
    for (const [roomId, room] of this.rooms) {
      if (!room.password) rooms.push(this._getRoomInfo(roomId)!);
    }
    return rooms;
  }

  shutdownAll(): void {
    for (const [roomId] of this.rooms) {
      this._closeRoom(roomId);
    }
  }
}
