import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../auth/middleware';
import { LuckySpinService } from '../services/luckySpinService';

const router = Router();
const luckySpinService = new LuckySpinService();

/* ------------------------------------------------------------------ */
/*  GET /lucky-spin/status — free-spin info, jackpot, segments        */
/* ------------------------------------------------------------------ */
router.get('/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const status = await luckySpinService.getStatus(req.userId!);
    res.json(status);
  } catch (err: any) {
    console.error('lucky-spin status error:', err);
    res.status(500).json({ error: 'Failed to fetch spin status' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /lucky-spin — perform a spin                                 */
/* ------------------------------------------------------------------ */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { useFree } = req.body as { useFree?: boolean };
    const outcome = await luckySpinService.spin(req.userId!, !!useFree);
    res.json(outcome);
  } catch (err: any) {
    const msg = err.message ?? 'Spin failed';
    const status =
      msg.includes('No free spins') || msg.includes('Not enough chips') ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /lucky-spin/history — last 20 spins                           */
/* ------------------------------------------------------------------ */
router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const history = await luckySpinService.getSpinHistory(req.userId!);
    res.json(history);
  } catch (err: any) {
    console.error('lucky-spin history error:', err);
    res.status(500).json({ error: 'Failed to fetch spin history' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /lucky-spin/jackpot — public, no auth                         */
/* ------------------------------------------------------------------ */
router.get('/jackpot', async (_req, res: Response) => {
  try {
    const amount = await luckySpinService.getJackpotAmount();
    res.json({ jackpotAmount: amount });
  } catch (err: any) {
    console.error('lucky-spin jackpot error:', err);
    res.status(500).json({ error: 'Failed to fetch jackpot' });
  }
});

export default router;
