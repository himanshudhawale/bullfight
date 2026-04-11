import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { initCosmos } from './config/cosmos';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import friendsRoutes from './routes/friends';
import gameRoutes from './routes/game';
import notificationRoutes from './routes/notifications';
import clubRoutes from './routes/club';
import missionsRoutes from './routes/missions';
import luckySpinRoutes from './routes/luckySpin';
import { setupGameSocket } from './socket/gameSocket';
import { BullfightManager } from './game/bullfightManager';
import { PokerManager } from './game/poker/pokerManager';
import { PrivateRoomManager } from './game/poker/privateRoomManager';
import { TournamentManager } from './game/poker/tournamentManager';
import { ClubService } from './services/clubService';

const app = express();
const server = http.createServer(app);

// Socket.IO
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 10000,
});

// ---- Middleware ----
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Auth routes have stricter limits
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many auth attempts, try again later' },
});
app.use('/api/auth', authLimiter);

// ---- Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/missions', missionsRoutes);
app.use('/api/lucky-spin', luckySpinRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Managers + Socket.IO ----
const bullfightManager = new BullfightManager();
const pokerManager = new PokerManager();
const privateRoomManager = new PrivateRoomManager();
const tournamentManager = new TournamentManager();
const clubService = new ClubService();
setupGameSocket(io, bullfightManager, pokerManager, privateRoomManager, tournamentManager);

// ---- Start Server ----
async function start() {
  try {
    console.log('🚀 Starting Bull Fight server...');

    // Initialize database
    await initCosmos();

    // Start bullfight games (after Cosmos is ready)
    bullfightManager.init(io);

    // Start poker tables
    pokerManager.init(io);

    // Start private rooms & tournaments
    privateRoomManager.init(io);
    tournamentManager.init(io);

    // Wire club real-time chat
    io.on('connection', (socket) => {
      clubService.handleConnection(socket, io);
    });

    server.listen(config.port, () => {
      console.log(`✅ Server running on port ${config.port}`);
      console.log(`📡 Environment: ${config.nodeEnv}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();

export { app, server, io };
