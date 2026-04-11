import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../auth/middleware';

const router = Router();

// GET /api/game/history — last 20 games for the user
router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { getContainer } = await import('../config/cosmos');
    const container = getContainer('gameHistory');
    const { resources } = await container.items.query({
      query: 'SELECT * FROM c WHERE c.playerId = @userId ORDER BY c.createdAt DESC OFFSET 0 LIMIT 20',
      parameters: [{ name: '@userId', value: req.userId! }],
    }).fetchAll();

    res.json(resources);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/game/leaderboard — top players by net chips won
// Query params: ?period=24h|7d|30d|all (default: 7d)
let _leaderboardCache: Record<string, { data: any[]; time: number }> = {};
const LEADERBOARD_TTL_MS = 60_000;

function getPeriodSince(period: string): string {
  const now = Date.now();
  switch (period) {
    case '24h': return new Date(now - 24 * 3600_000).toISOString();
    case '7d': return new Date(now - 7 * 24 * 3600_000).toISOString();
    case '30d': return new Date(now - 30 * 24 * 3600_000).toISOString();
    case 'all': return new Date(0).toISOString();
    default: return new Date(now - 7 * 24 * 3600_000).toISOString();
  }
}

async function fetchLeaderboard(period: string) {
  const cached = _leaderboardCache[period];
  if (cached && Date.now() - cached.time < LEADERBOARD_TTL_MS) {
    return cached.data;
  }

  const { getContainer } = await import('../config/cosmos');
  const since = getPeriodSince(period);

  // Query net winnings from leaderboard_entry docs (written by bullfight + poker)
  const dataContainer = getContainer('data');
  const { resources: netEntries } = await dataContainer.items.query({
    query: `
      SELECT c.userId, SUM(c.netWinnings) AS totalNet
      FROM c
      WHERE c.docType = 'leaderboard_entry'
        AND c.createdAt >= @since
      GROUP BY c.userId
      ORDER BY SUM(c.netWinnings) DESC
      OFFSET 0 LIMIT 50
    `,
    parameters: [{ name: '@since', value: since }],
  }).fetchAll();

  // Enrich with user display names + vip levels
  const usersContainer = getContainer('users');
  const userIds = netEntries.map((e: any) => e.userId);
  let userMap: Record<string, any> = {};

  if (userIds.length > 0) {
    // Batch fetch users (Cosmos doesn't support IN with params well, so fetch top users)
    const { resources: users } = await usersContainer.items.query({
      query: 'SELECT c.id, c.displayName, c.chips, c.vipLevel, c.gamesWon, c.gamesPlayed FROM c ORDER BY c.chips DESC OFFSET 0 LIMIT 100',
    }).fetchAll();
    for (const u of users) {
      userMap[u.id] = u;
    }
  }

  const entries = netEntries.map((e: any, i: number) => {
    const u = userMap[e.userId];
    return {
      rank: i + 1,
      userId: e.userId,
      displayName: u?.displayName || 'Anonymous',
      netChips: Math.round(e.totalNet || 0),
      totalChips: u?.chips || 0,
      vipLevel: u?.vipLevel || 1,
      gamesWon: u?.gamesWon || 0,
      gamesPlayed: u?.gamesPlayed || 0,
    };
  });

  _leaderboardCache[period] = { data: entries, time: Date.now() };
  return entries;
}

// Called by bullfightManager after each round to bust the cache
export function invalidateLeaderboardCache() {
  _leaderboardCache = {};
}

router.get('/leaderboard', async (req, res: Response) => {
  try {
    const period = (req.query.period as string) || '7d';
    const entries = await fetchLeaderboard(period);
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
