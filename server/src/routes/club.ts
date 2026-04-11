import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../auth/middleware';
import { ClubService } from '../services/clubService';

const router = Router();
const clubService = new ClubService();

router.use(authMiddleware);

// ---- Create Club ----
const createClubSchema = z.object({
  name: z.string().min(2).max(30),
  description: z.string().max(500).default(''),
  avatarUrl: z.string().url().optional(),
  settings: z
    .object({
      minVipLevel: z.number().int().min(0).max(10).optional(),
      isPublic: z.boolean().optional(),
      maxMembers: z.number().int().min(2).max(200).optional(),
    })
    .optional(),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const body = createClubSchema.parse(req.body);
    const club = await clubService.createClub(
      req.userId!,
      body.name,
      body.description,
      body.avatarUrl,
      body.settings,
    );
    res.status(201).json(club);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[club] create error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- List / Search Clubs ----
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const name = req.query.name as string | undefined;
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const clubs = await clubService.searchClubs(name, offset, limit);
    res.json(clubs);
  } catch (err: any) {
    console.error('[club] search error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Get Club Details ----
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const club = await clubService.getClub(req.params.id);
    res.json(club);
  } catch (err: any) {
    console.error('[club] get error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Join Club ----
router.post('/:id/join', async (req: AuthRequest, res: Response) => {
  try {
    const result = await clubService.joinClub(req.params.id, req.userId!);
    res.json(result);
  } catch (err: any) {
    console.error('[club] join error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Leave Club ----
router.post('/:id/leave', async (req: AuthRequest, res: Response) => {
  try {
    const result = await clubService.leaveClub(req.params.id, req.userId!);
    res.json(result);
  } catch (err: any) {
    console.error('[club] leave error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Invite Friend ----
const inviteSchema = z.object({ friendId: z.string().min(1) });

router.post('/:id/invite', async (req: AuthRequest, res: Response) => {
  try {
    const { friendId } = inviteSchema.parse(req.body);
    const result = await clubService.inviteFriend(req.params.id, req.userId!, friendId);
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[club] invite error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Approve Join Request ----
const approveSchema = z.object({ userId: z.string().min(1) });

router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = approveSchema.parse(req.body);
    const result = await clubService.approveJoin(req.params.id, userId, req.userId!);
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[club] approve error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Kick Member ----
const kickSchema = z.object({ userId: z.string().min(1) });

router.post('/:id/kick', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = kickSchema.parse(req.body);
    const result = await clubService.kickMember(req.params.id, req.userId!, userId);
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[club] kick error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Promote to Admin ----
const promoteSchema = z.object({ userId: z.string().min(1) });

router.post('/:id/promote', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = promoteSchema.parse(req.body);
    const result = await clubService.promoteMember(req.params.id, req.userId!, userId);
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[club] promote error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Donate Chips ----
const donateSchema = z.object({ amount: z.number().int().positive() });

router.post('/:id/donate', async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = donateSchema.parse(req.body);
    const result = await clubService.donateChips(req.params.id, req.userId!, amount);
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[club] donate error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Donation Rankings ----
router.get('/:id/rankings', async (req: AuthRequest, res: Response) => {
  try {
    const rankings = await clubService.getRankings(req.params.id);
    res.json(rankings);
  } catch (err: any) {
    console.error('[club] rankings error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Chat History ----
router.get('/:id/chat', async (req: AuthRequest, res: Response) => {
  try {
    const messages = await clubService.getChatMessages(req.params.id);
    res.json(messages);
  } catch (err: any) {
    console.error('[club] chat history error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Send Chat Message ----
const chatSchema = z.object({ message: z.string().min(1).max(500) });

router.post('/:id/chat', async (req: AuthRequest, res: Response) => {
  try {
    const { message } = chatSchema.parse(req.body);
    const chatDoc = await clubService.sendChatMessage(req.params.id, req.userId!, message);
    res.status(201).json(chatDoc);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[club] chat send error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Update Club Settings ----
const updateSettingsSchema = z.object({
  name: z.string().min(2).max(30).optional(),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  minVipLevel: z.number().int().min(0).max(10).optional(),
  isPublic: z.boolean().optional(),
  maxMembers: z.number().int().min(2).max(200).optional(),
});

router.put('/:id/settings', async (req: AuthRequest, res: Response) => {
  try {
    const updates = updateSettingsSchema.parse(req.body);
    const club = await clubService.updateSettings(req.params.id, req.userId!, updates);
    res.json(club);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('[club] settings error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// ---- Delete Club ----
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await clubService.deleteClub(req.params.id, req.userId!);
    res.json(result);
  } catch (err: any) {
    console.error('[club] delete error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
export { clubService, ClubService };
