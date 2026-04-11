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

// GET /api/game/leaderboard — top 10 players by chips (cached, refreshes every 60s)
let _leaderboardCache: any[] | null = null;
let _leaderboardCacheTime = 0;
const LEADERBOARD_TTL_MS = 60_000;

async function fetchLeaderboard() {
  const { getContainer } = await import('../config/cosmos');
  const container = getContainer('users');
  const { resources } = await container.items.query({
    query: 'SELECT c.id, c.displayName, c.chips, c.vipLevel FROM c ORDER BY c.chips DESC OFFSET 0 LIMIT 10',
  }).fetchAll();

  _leaderboardCache = resources.map((u: any) => ({
    userId: u.id,
    displayName: u.displayName || 'Anonymous',
    chips: u.chips || 0,
    vipLevel: u.vipLevel || 1,
  }));
  _leaderboardCacheTime = Date.now();
  return _leaderboardCache;
}

// Called by bullfightManager after each round to bust the cache
export function invalidateLeaderboardCache() {
  _leaderboardCache = null;
}

router.get('/leaderboard', async (_req, res: Response) => {
  try {
    if (_leaderboardCache && Date.now() - _leaderboardCacheTime < LEADERBOARD_TTL_MS) {
      return res.json(_leaderboardCache);
    }
    const entries = await fetchLeaderboard();
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
