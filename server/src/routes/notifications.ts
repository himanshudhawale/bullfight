import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../auth/middleware';
import { getContainer } from '../config/cosmos';

const router = Router();

/**
 * GET /api/notifications
 * Returns the user's inbox: broadcast notifications + personal ones.
 * Sorted newest first, limited to 50.
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const container = getContainer('data');

    const { resources } = await container.items
      .query({
        query: `
          SELECT * FROM c
          WHERE c.docType = 'notification'
            AND (c.userId = @userId OR c.userId = 'all')
          ORDER BY c.createdAt DESC
          OFFSET 0 LIMIT 50
        `,
        parameters: [{ name: '@userId', value: userId }],
      })
      .fetchAll();

    res.json({ notifications: resources });
  } catch (err) {
    console.error('Failed to fetch notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read.
 */
router.patch('/:id/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;
    const container = getContainer('data');

    // For broadcast notifications, we store read status per-user in a separate doc
    // For personal notifications, just update the doc directly
    const { resource } = await container.item(id, userId).read();
    if (resource) {
      resource.read = true;
      await container.item(id, userId).replace(resource);
      res.json({ ok: true });
      return;
    }

    // Broadcast notification — create a personal "read receipt" doc
    const readReceipt = {
      id: `read_${id}_${userId}`,
      userId,
      docType: 'notification_read',
      notificationId: id,
      createdAt: new Date().toISOString(),
    };
    await container.items.create(readReceipt);
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to mark notification read:', err);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

export default router;
