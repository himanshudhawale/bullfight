import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../auth/middleware';
import { startPokerGame, pokerAction, getClientState, getGame, TIER_CONFIG } from '../game/poker/gameSession';

const router = Router();

const startSchema = z.object({
  tier: z.enum(['monte_carlo', 'macau', 'las_vegas', 'monaco']),
});

const actionSchema = z.object({
  gameId: z.string(),
  action: z.enum(['fold', 'check', 'call', 'raise']),
  amount: z.number().positive().optional(),
});

// POST /api/poker/start
router.post('/start', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { tier } = startSchema.parse(req.body);
    const config = TIER_CONFIG[tier];

    // Deduct buy-in from user chips in Cosmos
    const { getContainer } = await import('../config/cosmos');
    const container = getContainer('users');
    const { resource: user } = await container.item(req.userId!, req.userId!).read();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.chips < config.minBuyIn) {
      res.status(400).json({ error: 'Insufficient chips', required: config.minBuyIn, current: user.chips });
      return;
    }

    // Deduct buy-in
    user.chips -= config.minBuyIn;
    await container.item(req.userId!, req.userId!).replace(user);

    const state = await startPokerGame(req.userId!, tier);
    res.json(getClientState(state));
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/poker/action
router.post('/action', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { gameId, action, amount } = actionSchema.parse(req.body);
    const state = await pokerAction(gameId, req.userId!, action, amount);

    // If game complete, settle chips back to Cosmos
    if (state.phase === 'complete') {
      try {
        const { getContainer } = await import('../config/cosmos');
        const container = getContainer('users');
        const { resource: user } = await container.item(req.userId!, req.userId!).read();
        if (user) {
          // playerChips reflects what's left after the game; add it back
          user.chips += state.playerChips;
          user.gamesPlayed = (user.gamesPlayed || 0) + 1;
          if (state.result?.winner === 'player') {
            user.gamesWon = (user.gamesWon || 0) + 1;
            const winnings = state.playerChips - TIER_CONFIG[state.tier].minBuyIn;
            if (winnings > (user.biggestWin || 0)) {
              user.biggestWin = winnings;
            }
          }
          await container.item(req.userId!, req.userId!).replace(user);
        }
      } catch (cosmosErr: any) {
        console.error('Failed to update user chips after poker game:', cosmosErr.message);
      }
    }

    res.json(getClientState(state));
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    const msg = err.message || 'Internal server error';
    const status = ['Game not found', 'Not your game', 'Game is over', 'Not your turn', 'Cannot check'].some(e => msg.includes(e)) ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

// GET /api/poker/state/:gameId
router.get('/state/:gameId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const gameId = req.params.gameId as string;
    const state = getGame(gameId);
    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    if (state.userId !== req.userId) {
      res.status(403).json({ error: 'Not your game' });
      return;
    }
    res.json(getClientState(state));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
