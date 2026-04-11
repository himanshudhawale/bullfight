import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../auth/middleware';
import { getContainer } from '../config/cosmos';
import { getUserOnlineStatus } from '../services/presence';
import { calculateVipLevel, getVipConfig, VIP_XP_REWARDS } from '../../../shared/types';
import { DAILY_BONUS_BASE, SIGNUP_BONUS_CHIPS } from '../../../shared/constants';

const router = Router();

// ---- Bonus Config ----
const LOGIN_STREAK_REWARDS = [5_000, 8_000, 12_000, 18_000, 25_000, 35_000, 50_000]; // Day 1–7
const HOURLY_BONUS_CHIPS = 2_000;
const HOURLY_BONUS_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
const BROKE_BONUS_CHIPS = 50_000;
const BROKE_BONUS_THRESHOLD = 1_000;
const BROKE_BONUS_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

// ---- Chip Package Config ----
const CHIP_PACKAGES: Record<string, { chips: number; statKey: string; target: number }> = {
  starter:    { chips: 10_000,  statKey: 'gamesPlayed', target: 5 },
  winner:     { chips: 25_000,  statKey: 'gamesWon',    target: 3 },
  streak:     { chips: 50_000,  statKey: 'loginStreak', target: 7 },
  highroller: { chips: 100_000, statKey: 'biggestWin',  target: 50_000 },
};

// ---- Update Profile ----
const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(30).optional(),
  statusText: z.string().max(100).optional(),
  equippedCardSkin: z.string().optional(),
  equippedTableTheme: z.string().optional(),
  equippedAvatarFrame: z.string().optional(),
});

router.patch('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const updates = updateProfileSchema.parse(req.body);
    const container = getContainer('users');
    const { resource: user } = await container.item(req.userId!, req.userId!).read();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    Object.assign(user, updates);
    await container.item(user.id, user.id).replace(user);

    const { passwordHash: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// ---- Search Users ----
router.get('/search', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) {
      res.json([]);
      return;
    }

    const usersContainer = getContainer('users');
    const { resources } = await usersContainer.items.query({
      query: `SELECT c.id, c.displayName, c.vipLevel, c.profilePicUrl FROM c WHERE CONTAINS(LOWER(c.displayName), @q) AND c.id != @userId OFFSET 0 LIMIT 20`,
      parameters: [
        { name: '@q', value: q.toLowerCase() },
        { name: '@userId', value: req.userId! },
      ],
    }).fetchAll();

    res.json(resources);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Get User Profile (public) ----
router.get('/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.userId as string;
    const container = getContainer('users');
    const { resource: user } = await container.item(targetUserId, targetUserId).read();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Return public profile only
    const presence = await getUserOnlineStatus(user.id);

    res.json({
      id: user.id,
      displayName: user.displayName,
      profilePicUrl: user.profilePicUrl,
      statusText: user.statusText,
      vipLevel: user.vipLevel,
      vipXp: user.vipXp,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      biggestWin: user.biggestWin,
      equippedCardSkin: user.equippedCardSkin,
      equippedTableTheme: user.equippedTableTheme,
      equippedAvatarFrame: user.equippedAvatarFrame,
      onlineStatus: presence.status,
      currentTier: presence.currentTier,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Get Chip Balance ----
router.get('/chips/balance', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const container = getContainer('users');
    const { resource: user } = await container.item(req.userId!, req.userId!).read();
    res.json({ chips: user?.chips || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Helper: recalculate and persist VIP level ----
async function recalcVip(user: any, container: any) {
  const newLevel = calculateVipLevel(user.vipXp || 0);
  const oldLevel = user.vipLevel || 1;
  user.vipLevel = newLevel;
  const leveledUp = newLevel > oldLevel;
  await container.item(user.id, user.id).replace(user);
  return { leveledUp, newLevel, oldLevel };
}

// ---- VIP Subscribe (disabled — no IAP) ----
router.post('/vip/subscribe', authMiddleware, async (_req: AuthRequest, res: Response) => {
  res.status(403).json({ error: 'VIP subscriptions coming soon!' });
});

// ---- VIP Daily Bonus (scales with level) ----
router.post('/vip/daily', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const container = getContainer('users');
    const { resource: user } = await container.item(req.userId!, req.userId!).read();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if already claimed today
    if (user.lastVipDailyAt) {
      const lastClaim = new Date(user.lastVipDailyAt);
      const now = new Date();
      if (
        lastClaim.getUTCFullYear() === now.getUTCFullYear() &&
        lastClaim.getUTCMonth() === now.getUTCMonth() &&
        lastClaim.getUTCDate() === now.getUTCDate()
      ) {
        res.status(400).json({ error: 'Daily VIP bonus already claimed today' });
        return;
      }
    }

    // Grant scaled daily bonus + daily login XP
    const cfg = getVipConfig(user.vipLevel || 1);
    const dailyChips = Math.floor(DAILY_BONUS_BASE * cfg.dailyBonusMultiplier);
    user.chips = (user.chips || 0) + dailyChips;
    user.vipXp = (user.vipXp || 0) + VIP_XP_REWARDS.DAILY_LOGIN;
    user.lastVipDailyAt = new Date().toISOString();

    await recalcVip(user, container);

    const { passwordHash: _, ...safeUser } = user;
    res.json({ ...safeUser, dailyChips });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Login Streak Bonus ----
router.post('/bonus/streak', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const container = getContainer('users');
    const { resource: user } = await container.item(req.userId!, req.userId!).read();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const now = new Date();
    const today = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;

    // Prevent double-claim same day
    if (user.lastStreakClaimDate === today) {
      res.status(400).json({ error: 'Streak bonus already claimed today' });
      return;
    }

    // Calculate streak: check if last claim was yesterday
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = `${yesterday.getUTCFullYear()}-${yesterday.getUTCMonth()}-${yesterday.getUTCDate()}`;

    let streak = (user.loginStreak || 0);
    if (user.lastStreakClaimDate === yesterdayStr) {
      streak = Math.min(streak + 1, 7); // cap at 7
    } else {
      streak = 1; // reset
    }

    const reward = LOGIN_STREAK_REWARDS[streak - 1] || LOGIN_STREAK_REWARDS[0];
    user.chips = (user.chips || 0) + reward;
    user.loginStreak = streak;
    user.lastStreakClaimDate = today;
    user.vipXp = (user.vipXp || 0) + VIP_XP_REWARDS.DAILY_LOGIN;

    await recalcVip(user, container);

    const { passwordHash: _, ...safeUser } = user;
    res.json({ ...safeUser, streakDay: streak, reward });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Hourly Bonus (every 4 hours) ----
router.post('/bonus/hourly', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const container = getContainer('users');
    const { resource: user } = await container.item(req.userId!, req.userId!).read();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const now = Date.now();
    const lastClaim = user.lastHourlyBonusAt ? new Date(user.lastHourlyBonusAt).getTime() : 0;
    const elapsed = now - lastClaim;

    if (elapsed < HOURLY_BONUS_COOLDOWN_MS) {
      const nextClaimIn = Math.ceil((HOURLY_BONUS_COOLDOWN_MS - elapsed) / 1000);
      res.status(400).json({ error: 'Hourly bonus not ready yet', nextClaimInSeconds: nextClaimIn });
      return;
    }

    user.chips = (user.chips || 0) + HOURLY_BONUS_CHIPS;
    user.lastHourlyBonusAt = new Date().toISOString();

    await container.item(user.id, user.id).replace(user);

    const { passwordHash: _, ...safeUser } = user;
    res.json({ ...safeUser, reward: HOURLY_BONUS_CHIPS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Broke Bonus (safety net when chips < threshold, 4hr cooldown) ----
router.post('/bonus/broke', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const container = getContainer('users');
    const { resource: user } = await container.item(req.userId!, req.userId!).read();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if ((user.chips || 0) >= BROKE_BONUS_THRESHOLD) {
      res.status(400).json({ error: `You still have ${user.chips} chips. Broke bonus is available when you have less than ${BROKE_BONUS_THRESHOLD}.` });
      return;
    }

    const now = Date.now();
    const lastClaim = user.lastBrokeBonusAt ? new Date(user.lastBrokeBonusAt).getTime() : 0;
    const elapsed = now - lastClaim;

    if (elapsed < BROKE_BONUS_COOLDOWN_MS) {
      const nextClaimIn = Math.ceil((BROKE_BONUS_COOLDOWN_MS - elapsed) / 1000);
      res.status(400).json({ error: 'Broke bonus not ready yet', nextClaimInSeconds: nextClaimIn });
      return;
    }

    user.chips = (user.chips || 0) + BROKE_BONUS_CHIPS;
    user.lastBrokeBonusAt = new Date().toISOString();

    await container.item(user.id, user.id).replace(user);

    const { passwordHash: _, ...safeUser } = user;
    res.json({ ...safeUser, reward: BROKE_BONUS_CHIPS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Claim Chip Package ----
router.post('/bonus/package', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { packageId } = req.body;
    const pack = CHIP_PACKAGES[packageId];
    if (!pack) {
      res.status(400).json({ error: 'Invalid package' });
      return;
    }

    const container = getContainer('users');
    const { resource: user } = await container.item(req.userId!, req.userId!).read();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if already claimed
    const claimed: string[] = user.claimedPackages || [];
    if (claimed.includes(packageId)) {
      res.status(400).json({ error: 'Package already claimed' });
      return;
    }

    // Check if requirement is met
    let current = 0;
    if (pack.statKey === 'gamesPlayed') current = user.gamesPlayed ?? 0;
    else if (pack.statKey === 'gamesWon') current = user.gamesWon ?? 0;
    else if (pack.statKey === 'loginStreak') current = user.loginStreak ?? 0;
    else if (pack.statKey === 'biggestWin') current = user.biggestWin ?? 0;

    if (current < pack.target) {
      res.status(400).json({ error: 'Requirement not met', current, target: pack.target });
      return;
    }

    user.chips = (user.chips || 0) + pack.chips;
    user.claimedPackages = [...claimed, packageId];

    await container.item(user.id, user.id).replace(user);

    const { passwordHash: _, ...safeUser } = user;
    res.json({ ...safeUser, reward: pack.chips });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Buy Chips (disabled for free launch v1.0) ----
router.post('/chips/buy', authMiddleware, async (_req: AuthRequest, res: Response) => {
  res.status(403).json({ error: 'Chip purchases coming soon! Enjoy your free chips for now.' });
});

export default router;
