import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getSocketUrl(): string {
  if (!__DEV__) return 'https://bullfight-api.azurecontainerapps.io';

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:3000`;

  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

const API_URL = getSocketUrl();

class SocketService {
  private socket: Socket | null = null;

  async connect(): Promise<Socket> {
    if (this.socket?.connected) return this.socket;

    const token = await AsyncStorage.getItem('accessToken');
    if (!token) throw new Error('Not authenticated');

    this.socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    return new Promise((resolve, reject) => {
      this.socket!.on('connect', () => {
        console.log('🔌 Socket connected');
        resolve(this.socket!);
      });
      this.socket!.on('connect_error', (err) => {
        console.error('🔌 Socket error:', err.message);
        reject(err);
      });
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  // ---- Bull Fight Actions ----
  joinTier(tier: string): void {
    this.socket?.emit('join_tier', { tier });
  }

  leaveTier(tier: string): void {
    this.socket?.emit('leave_tier', { tier });
  }

  placeBet(tier: string, betType: string, amount: number): void {
    this.socket?.emit('bet', { tier, betType, amount });
  }

  getLeaderboard(tier: string): void {
    this.socket?.emit('get_leaderboard', { tier });
  }

  sendEmote(tier: string, emoteId: string, target: 'a' | 'b'): void {
    this.socket?.emit('send_emote', { tier, emoteId, target });
  }

  sendPokerChat(tableId: string, messageId: string): void {
    this.socket?.emit('poker:send_chat', { tableId, messageId });
  }

  getHistory(tier: string): void {
    this.socket?.emit('get_history', { tier });
  }

  // ---- Chat / DM ----
  sendMessage(toUserId: string, text: string): void {
    this.socket?.emit('send_message', { toUserId, text });
  }

  getChatHistory(withUserId: string, limit = 50): void {
    this.socket?.emit('get_chat_history', { withUserId, limit });
  }

  // ---- Private Rooms ----
  createPrivateRoom(config: Record<string, any>, cb?: (res: any) => void): void {
    this.socket?.emit('private_room:create', config, cb);
  }

  listPrivateRooms(cb?: (res: any) => void): void {
    this.socket?.emit('private_room:list', {}, cb);
  }

  joinPrivateRoom(roomId: string, password?: string, cb?: (res: any) => void): void {
    this.socket?.emit('private_room:join', { roomId, password }, cb);
  }

  leavePrivateRoom(roomId: string): void {
    this.socket?.emit('private_room:leave', { roomId });
  }

  privateRoomAction(roomId: string, action: string, amount?: number): void {
    this.socket?.emit('private_room:action', { roomId, action, amount });
  }

  privateRoomBuyChips(roomId: string, amount: number): void {
    this.socket?.emit('private_room:buy_chips', { roomId, amount });
  }

  inviteToPrivateRoom(roomId: string, friendId: string): void {
    this.socket?.emit('private_room:invite', { roomId, friendId });
  }

  closePrivateRoom(roomId: string): void {
    this.socket?.emit('private_room:close', { roomId });
  }

  // ---- Tournaments ----
  listTournaments(cb?: (res: any) => void): void {
    this.socket?.emit('tournament:list', {}, cb);
  }

  registerTournament(tournamentId: string, cb?: (res: any) => void): void {
    this.socket?.emit('tournament:register', { tournamentId }, cb);
  }

  unregisterTournament(tournamentId: string, cb?: (res: any) => void): void {
    this.socket?.emit('tournament:unregister', { tournamentId }, cb);
  }

  getTournamentState(tournamentId: string, cb?: (res: any) => void): void {
    this.socket?.emit('tournament:state', { tournamentId }, cb);
  }

  tournamentAction(tournamentId: string, action: string, amount?: number): void {
    this.socket?.emit('tournament:action', { tournamentId, action, amount });
  }

  tournamentRebuy(tournamentId: string, cb?: (res: any) => void): void {
    this.socket?.emit('tournament:rebuy', { tournamentId }, cb);
  }

  // ---- Club Chat ----
  joinClubChat(clubId: string): void {
    this.socket?.emit('club:join_chat', { clubId });
  }

  leaveClubChat(clubId: string): void {
    this.socket?.emit('club:leave_chat', { clubId });
  }

  sendClubChat(clubId: string, message: string): void {
    this.socket?.emit('club:chat', { clubId, message });
  }

  // ---- Listeners ----
  on(event: string, callback: (...args: any[]) => void): void {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    this.socket?.off(event, callback);
  }
}

export const socketService = new SocketService();
