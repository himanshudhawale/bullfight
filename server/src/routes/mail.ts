import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../auth/middleware';
import { getContainer } from '../config/cosmos';
import { getVipConfig, VIP_XP_REWARDS, calculateVipLevel, VipLevel } from '../../../shared/types';
import { DAILY_BONUS_BASE } from '../../../shared/constants';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ---- Constants ----
const MAIL_LIMIT = 50;
const DAILY_BONUS_TTL = 259200; // 3 days in seconds
const DEFAULT_TTL = 2592000;    // 30 days in seconds

// ---- Helpers ----

function utcToday(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

/**
 * Create a welcome mail for a newly registered user.
 */
export async function createWelcomeMail(userId: string): Promise<void> {
  const container = getContainer('data');
  const mail = {
    id: uuidv4(),
    userId,
    docType: 'mail',
    mailType: 'welcome',
    title: '🎉 Welcome to Bull Fight!',
    body: 'Welcome aboard! Your signup bonus chips have been added to your account. Good luck at the tables!',
    chips: 0,
    claimed: false,
    read: false,
    createdAt: new Date().toISOString(),
  };
  await container.items.create(mail);
}

/**
 * Send a system mail to a user from any route/service.
 */
export async function sendSystemMail(
  userId: string,
  title: string,
  body: string,
  chips?: number,
): Promise<void> {
  const container = getContainer('data');
  const mail = {
    id: uuidv4(),
    userId,
    docType: 'mail',
    mailType: 'system',
    title,
    body,
    chips: chips ?? 0,
    claimed: chips ? false : true, // nothing to claim when no chips
    read: false,
    createdAt: new Date().toISOString(),
    ttl: DEFAULT_TTL,
  };
  await container.items.create(mail);
}

// ---- Auto-generate daily bonus mail if missing for today ----

async function ensureDailyBonus(userId: string): Promise<void> {
  const container = getContainer('data');
  const today = utcToday();

  // Check if today's daily bonus already exists
  const { resources } = await container.items
    .query({
      query: `
        SELECT c.id FROM c
        WHERE c.docType = 'mail'
          AND c.mailType = 'daily_bonus'
          AND c.userId = @userId
          AND SUBSTRING(c.createdAt, 0, 10) = @today
      `,
      parameters: [
        { name: '@userId', value: userId },
        { name: '@today', value: today },
      ],
    })
    .fetchAll();

  if (resources.length > 0) return;

  // Look up user to determine VIP level
  const usersContainer = getContainer('users');
  const { resource: user } = await usersContainer.item(userId, userId).read();
  const vipLevel: VipLevel = user?.vipLevel ?? 0;
  const vipConfig = getVipConfig(vipLevel);
  const bonusChips = vipConfig.dailyBonus;

  const mail = {
    id: uuidv4(),
    userId,
    docType: 'mail',
    mailType: 'daily_bonus',
    title: '🎁 Daily Bonus',
    body: 'Your daily reward is ready! Claim your free chips.',
    chips: bonusChips,
    claimed: false,
    read: false,
    createdAt: new Date().toISOString(),
    ttl: DAILY_BONUS_TTL,
  };
  await container.items.create(mail);
}

// ---- Routes ----

/**
 * GET /api/mail
 * Returns the user's mail (newest first, limit 50).
 * Auto-generates today's daily bonus if not yet created.
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Ensure daily bonus exists for today
    await ensureDailyBonus(userId);

    const container = getContainer('data');
    const { resources: mail } = await container.items
      .query({
        query: `
          SELECT * FROM c
          WHERE c.docType = 'mail'
            AND c.userId = @userId
          ORDER BY c.createdAt DESC
          OFFSET 0 LIMIT @limit
        `,
        parameters: [
          { name: '@userId', value: userId },
          { name: '@limit', value: MAIL_LIMIT },
        ],
      })
      .fetchAll();

    const unreadCount = mail.filter((m: any) => !m.read).length;

    res.json({ mail, unreadCount });
  } catch (err) {
    console.error('Failed to fetch mail:', err);
    res.status(500).json({ error: 'Failed to fetch mail' });
  }
});

/**
 * POST /api/mail/:id/claim
 * Claim chips from a mail item.
 */
router.post('/:id/claim', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const mailId = req.params.id as string;
    const container = getContainer('data');

    const { resource: mailItem } = await container.item(mailId, userId).read();
    if (!mailItem) {
      res.status(404).json({ error: 'Mail not found' });
      return;
    }
    if (mailItem.userId !== userId) {
      res.status(403).json({ error: 'Not your mail' });
      return;
    }
    if (mailItem.claimed) {
      res.status(400).json({ error: 'Already claimed' });
      return;
    }
    if (!mailItem.chips || mailItem.chips <= 0) {
      res.status(400).json({ error: 'No chips to claim' });
      return;
    }

    // Award chips to user
    const usersContainer = getContainer('users');
    const { resource: user } = await usersContainer.item(userId, userId).read();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    user.chips += mailItem.chips;
    await usersContainer.item(userId, userId).replace(user);

    // Mark mail as claimed and read
    mailItem.claimed = true;
    mailItem.read = true;
    await container.item(mailId, userId).replace(mailItem);

    res.json({ ok: true, chipsAwarded: mailItem.chips, newBalance: user.chips });
  } catch (err) {
    console.error('Failed to claim mail:', err);
    res.status(500).json({ error: 'Failed to claim mail' });
  }
});

/**
 * POST /api/mail/:id/read
 * Mark a mail item as read.
 */
router.post('/:id/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const mailId = req.params.id as string;
    const container = getContainer('data');

    const { resource: mailItem } = await container.item(mailId, userId).read();
    if (!mailItem) {
      res.status(404).json({ error: 'Mail not found' });
      return;
    }
    if (mailItem.userId !== userId) {
      res.status(403).json({ error: 'Not your mail' });
      return;
    }

    mailItem.read = true;
    await container.item(mailId, userId).replace(mailItem);

    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to mark mail as read:', err);
    res.status(500).json({ error: 'Failed to mark mail as read' });
  }
});

/**
 * DELETE /api/mail/:id
 * Delete a mail item (only if claimed or has no chips).
 */
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const mailId = req.params.id as string;
    const container = getContainer('data');

    const { resource: mailItem } = await container.item(mailId, userId).read();
    if (!mailItem) {
      res.status(404).json({ error: 'Mail not found' });
      return;
    }
    if (mailItem.userId !== userId) {
      res.status(403).json({ error: 'Not your mail' });
      return;
    }
    if (!mailItem.claimed && mailItem.chips && mailItem.chips > 0) {
      res.status(400).json({ error: 'Claim chips before deleting' });
      return;
    }

    await container.item(mailId, userId).delete();

    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete mail:', err);
    res.status(500).json({ error: 'Failed to delete mail' });
  }
});

/**
 * POST /api/mail/claim-all
 * Claim all unclaimed mail items that have chips.
 */
router.post('/claim-all', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const container = getContainer('data');

    // Fetch all unclaimed mail with chips
    const { resources: unclaimed } = await container.items
      .query({
        query: `
          SELECT * FROM c
          WHERE c.docType = 'mail'
            AND c.userId = @userId
            AND c.claimed = false
            AND c.chips > 0
        `,
        parameters: [{ name: '@userId', value: userId }],
      })
      .fetchAll();

    if (unclaimed.length === 0) {
      // Still return current balance
      const usersContainer = getContainer('users');
      const { resource: user } = await usersContainer.item(userId, userId).read();
      res.json({ ok: true, totalClaimed: 0, newBalance: user?.chips ?? 0 });
      return;
    }

    let totalClaimed = 0;
    for (const mailItem of unclaimed) {
      totalClaimed += mailItem.chips;
      mailItem.claimed = true;
      mailItem.read = true;
      await container.item(mailItem.id, userId).replace(mailItem);
    }

    // Award total chips to user
    const usersContainer = getContainer('users');
    const { resource: user } = await usersContainer.item(userId, userId).read();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    user.chips += totalClaimed;
    await usersContainer.item(userId, userId).replace(user);

    res.json({ ok: true, totalClaimed, newBalance: user.chips });
  } catch (err) {
    console.error('Failed to claim all mail:', err);
    res.status(500).json({ error: 'Failed to claim all mail' });
  }
});

export default router;
