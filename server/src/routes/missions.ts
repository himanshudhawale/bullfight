import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../auth/middleware';
import { MissionService } from '../services/missionService';

const router = Router();
router.use(authMiddleware);

const missionService = new MissionService();

// GET /missions — daily + weekly missions with progress
router.get('/missions', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const [daily, weekly] = await Promise.all([
      missionService.getDailyMissions(userId),
      missionService.getWeeklyMissions(userId),
    ]);
    res.json({ daily, weekly });
  } catch (err: any) {
    console.error('GET /missions error:', err);
    res.status(500).json({ error: 'Failed to load missions' });
  }
});

// GET /achievements — all achievements with unlock status
router.get('/achievements', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const achievements = await missionService.getAchievements(userId);
    res.json({ achievements });
  } catch (err: any) {
    console.error('GET /achievements error:', err);
    res.status(500).json({ error: 'Failed to load achievements' });
  }
});

// POST /missions/:id/claim — claim completed mission reward
router.post('/missions/:id/claim', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const missionId = req.params.id;
    const { reward } = await missionService.claimReward(userId, missionId);
    res.json({ success: true, reward });
  } catch (err: any) {
    console.error('POST /missions/:id/claim error:', err);
    const status = err.message?.includes('not found') || err.message?.includes('not claimable') ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to claim reward' });
  }
});

export default router;
