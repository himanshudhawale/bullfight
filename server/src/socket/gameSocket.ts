import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { BullfightManager } from '../game/bullfightManager';
import { PokerManager } from '../game/poker/pokerManager';
import { PrivateRoomManager } from '../game/poker/privateRoomManager';
import { TournamentManager } from '../game/poker/tournamentManager';

interface AuthSocket extends Socket {
  userId?: string;
}

export function setupGameSocket(
  io: SocketIOServer,
  bullfightManager: BullfightManager,
  pokerManager?: PokerManager,
  privateRoomManager?: PrivateRoomManager,
  tournamentManager?: TournamentManager,
): void {
  // JWT auth middleware
  io.use((socket: AuthSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, config.jwt.secret) as { sub: string };
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    bullfightManager.handleConnection(socket, io);
    if (pokerManager) {
      pokerManager.handleConnection(socket, io);
    }
    if (privateRoomManager) {
      privateRoomManager.handleConnection(socket, io);
    }
    if (tournamentManager) {
      tournamentManager.handleConnection(socket, io);
    }
  });
}
