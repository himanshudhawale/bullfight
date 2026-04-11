import { Router, Response } from 'express';
import { z } from 'zod';
import { getContainer } from '../config/cosmos';
import { authMiddleware, AuthRequest } from '../auth/middleware';

const router = Router();

// ---- Send Friend Request ----
router.post('/request', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { toUserId } = z.object({ toUserId: z.string() }).parse(req.body);

    if (toUserId === req.userId) {
      res.status(400).json({ error: 'Cannot send friend request to yourself' });
      return;
    }

    const usersContainer = getContainer('users');
    const { resource: toUser } = await usersContainer.item(toUserId, toUserId).read();
    if (!toUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const friendsContainer = getContainer('friends');

    // Check if a relationship already exists
    const { resources: existing } = await friendsContainer.items.query({
      query: `SELECT * FROM c WHERE
        ((c.fromUserId = @me AND c.toUserId = @them) OR
         (c.fromUserId = @them AND c.toUserId = @me))`,
      parameters: [
        { name: '@me', value: req.userId! },
        { name: '@them', value: toUserId },
      ],
    }).fetchAll();

    if (existing.length > 0) {
      const rel = existing[0];
      if (rel.status === 'accepted') {
        res.status(400).json({ error: 'Already friends' });
        return;
      }
      if (rel.status === 'pending') {
        res.status(400).json({ error: 'Friend request already pending' });
        return;
      }
      if (rel.status === 'blocked') {
        res.status(400).json({ error: 'Cannot send request' });
        return;
      }
    }

    const { resource: fromUser } = await usersContainer.item(req.userId!, req.userId!).read();

    const docId = `fr_${req.userId}_${toUserId}`;
    await friendsContainer.items.create({
      id: docId,
      fromUserId: req.userId!,
      toUserId,
      status: 'pending',
      fromDisplayName: fromUser?.displayName ?? 'Unknown',
      toDisplayName: toUser.displayName ?? 'Unknown',
      createdAt: new Date().toISOString(),
    });

    res.json({ ok: true, message: 'Friend request sent' });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[friends] request error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Accept Friend Request ----
router.post('/accept', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = z.object({ requestId: z.string() }).parse(req.body);

    const friendsContainer = getContainer('friends');
    const { resources } = await friendsContainer.items.query({
      query: `SELECT * FROM c WHERE c.id = @id AND c.toUserId = @me AND c.status = "pending"`,
      parameters: [
        { name: '@id', value: requestId },
        { name: '@me', value: req.userId! },
      ],
    }).fetchAll();

    if (resources.length === 0) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    const doc = resources[0];
    doc.status = 'accepted';
    doc.acceptedAt = new Date().toISOString();
    await friendsContainer.item(doc.id, doc.fromUserId).replace(doc);

    res.json({ ok: true, message: 'Friend request accepted' });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[friends] accept error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Remove / Block Friend ----
router.post('/remove', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { friendUserId, block } = z.object({
      friendUserId: z.string(),
      block: z.boolean().optional().default(false),
    }).parse(req.body);

    const friendsContainer = getContainer('friends');
    const { resources } = await friendsContainer.items.query({
      query: `SELECT * FROM c WHERE
        ((c.fromUserId = @me AND c.toUserId = @them) OR
         (c.fromUserId = @them AND c.toUserId = @me))
        AND c.status = "accepted"`,
      parameters: [
        { name: '@me', value: req.userId! },
        { name: '@them', value: friendUserId },
      ],
    }).fetchAll();

    if (resources.length === 0) {
      res.status(404).json({ error: 'Friendship not found' });
      return;
    }

    const doc = resources[0];
    if (block) {
      doc.status = 'blocked';
      doc.blockedBy = req.userId;
      doc.blockedAt = new Date().toISOString();
      await friendsContainer.item(doc.id, doc.fromUserId).replace(doc);
    } else {
      await friendsContainer.item(doc.id, doc.fromUserId).delete();
    }

    res.json({ ok: true, message: block ? 'User blocked' : 'Friend removed' });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[friends] remove error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Get Friends List ----
router.get('/list', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const friendsContainer = getContainer('friends');
    const { resources } = await friendsContainer.items.query({
      query: `SELECT * FROM c WHERE
        (c.fromUserId = @me OR c.toUserId = @me)
        AND c.status = "accepted"`,
      parameters: [{ name: '@me', value: req.userId! }],
    }).fetchAll();

    const usersContainer = getContainer('users');
    const friends = await Promise.all(
      resources.map(async (rel: any) => {
        const friendId = rel.fromUserId === req.userId ? rel.toUserId : rel.fromUserId;
        const { resource: user } = await usersContainer.item(friendId, friendId).read();
        return {
          userId: friendId,
          displayName: user?.displayName ?? 'Unknown',
          avatar: user?.avatar ?? null,
          chips: user?.chips ?? 0,
          online: user?.online ?? false,
          lastSeen: user?.lastSeen ?? null,
          friendSince: rel.acceptedAt,
        };
      }),
    );

    res.json(friends);
  } catch (err: any) {
    console.error('[friends] list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Get Pending Requests ----
router.get('/pending', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const friendsContainer = getContainer('friends');
    const { resources } = await friendsContainer.items.query({
      query: `SELECT * FROM c WHERE c.toUserId = @me AND c.status = "pending"`,
      parameters: [{ name: '@me', value: req.userId! }],
    }).fetchAll();

    res.json(
      resources.map((r: any) => ({
        requestId: r.id,
        fromUserId: r.fromUserId,
        fromDisplayName: r.fromDisplayName,
        createdAt: r.createdAt,
      })),
    );
  } catch (err: any) {
    console.error('[friends] pending error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Gift Chips to Friend ----
router.post('/gift', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { friendUserId, amount } = z.object({
      friendUserId: z.string(),
      amount: z.number().int().positive().min(1000, 'Minimum gift: 1,000 chips'),
    }).parse(req.body);

    const MAX_DAILY_GIFT = 10_000_000; // 10M daily limit
    const MIN_GIFT = 1_000;

    if (amount < MIN_GIFT) {
      res.status(400).json({ error: `Minimum gift: ${MIN_GIFT.toLocaleString()} chips` });
      return;
    }

    if (friendUserId === req.userId) {
      res.status(400).json({ error: 'Cannot gift yourself' });
      return;
    }

    // Verify friendship exists and is accepted
    const friendsContainer = getContainer('friends');
    const { resources: friendships } = await friendsContainer.items.query({
      query: `SELECT * FROM c WHERE
        ((c.fromUserId = @me AND c.toUserId = @friend) OR
         (c.fromUserId = @friend AND c.toUserId = @me))
        AND c.status = "accepted"`,
      parameters: [
        { name: '@me', value: req.userId! },
        { name: '@friend', value: friendUserId },
      ],
    }).fetchAll();

    if (friendships.length === 0) {
      res.status(403).json({ error: 'Must be friends to send chips' });
      return;
    }

    // Check daily gift limit
    const dataContainer = getContainer('data');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { resources: todayGifts } = await dataContainer.items.query({
      query: `SELECT VALUE SUM(c.amount) FROM c 
        WHERE c.docType = "gift_transaction" 
        AND c.fromUserId = @userId 
        AND c.date = @today`,
      parameters: [
        { name: '@userId', value: req.userId! },
        { name: '@today', value: today },
      ],
    }).fetchAll();

    const dailyTotal = todayGifts[0] ?? 0;
    if (dailyTotal + amount > MAX_DAILY_GIFT) {
      const remaining = MAX_DAILY_GIFT - dailyTotal;
      res.status(400).json({ 
        error: `Daily gift limit: ${MAX_DAILY_GIFT.toLocaleString()} chips. Remaining: ${remaining.toLocaleString()}`,
        dailyRemaining: remaining,
      });
      return;
    }

    // Load both users
    const usersContainer = getContainer('users');
    const { resource: sender } = await usersContainer.item(req.userId!, req.userId!).read();
    const { resource: receiver } = await usersContainer.item(friendUserId, friendUserId).read();

    if (!sender) {
      res.status(404).json({ error: 'Sender not found' });
      return;
    }
    if (!receiver) {
      res.status(404).json({ error: 'Recipient not found' });
      return;
    }
    if (sender.chips < amount) {
      res.status(400).json({ error: `Insufficient chips. You have ${sender.chips.toLocaleString()}` });
      return;
    }

    // Transfer chips (deduct from sender, credit to receiver)
    sender.chips -= amount;
    receiver.chips += amount;

    await usersContainer.item(req.userId!, req.userId!).replace(sender);
    await usersContainer.item(friendUserId, friendUserId).replace(receiver);

    // Log transaction for audit
    const txId = `gift_${req.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await dataContainer.items.create({
      id: txId,
      docType: 'gift_transaction',
      userId: req.userId,  // partition key
      fromUserId: req.userId,
      toUserId: friendUserId,
      amount,
      date: today,
      createdAt: new Date().toISOString(),
      senderName: sender.displayName,
      receiverName: receiver.displayName,
      ttl: 30 * 24 * 60 * 60, // 30 day retention
    });

    res.json({
      ok: true,
      amount,
      senderBalance: sender.chips,
      receiverName: receiver.displayName,
      dailyRemaining: MAX_DAILY_GIFT - (dailyTotal + amount),
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[friends] gift error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Get Gift History ----
router.get('/gifts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const dataContainer = getContainer('data');
    const { resources } = await dataContainer.items.query({
      query: `SELECT * FROM c 
        WHERE c.docType = "gift_transaction" 
        AND (c.fromUserId = @userId OR c.toUserId = @userId)
        ORDER BY c.createdAt DESC
        OFFSET 0 LIMIT 50`,
      parameters: [{ name: '@userId', value: req.userId! }],
    }).fetchAll();

    res.json(resources.map((g: any) => ({
      id: g.id,
      fromUserId: g.fromUserId,
      toUserId: g.toUserId,
      amount: g.amount,
      senderName: g.senderName,
      receiverName: g.receiverName,
      createdAt: g.createdAt,
      isSent: g.fromUserId === req.userId,
    })));
  } catch (err: any) {
    console.error('[friends] gift history error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Get Daily Gift Limit Status ----
router.get('/gift-limit', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const MAX_DAILY_GIFT = 10_000_000;
    const dataContainer = getContainer('data');
    const today = new Date().toISOString().split('T')[0];
    const { resources } = await dataContainer.items.query({
      query: `SELECT VALUE SUM(c.amount) FROM c 
        WHERE c.docType = "gift_transaction" 
        AND c.fromUserId = @userId 
        AND c.date = @today`,
      parameters: [
        { name: '@userId', value: req.userId! },
        { name: '@today', value: today },
      ],
    }).fetchAll();

    const dailyTotal = resources[0] ?? 0;
    res.json({
      dailyLimit: MAX_DAILY_GIFT,
      used: dailyTotal,
      remaining: MAX_DAILY_GIFT - dailyTotal,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
