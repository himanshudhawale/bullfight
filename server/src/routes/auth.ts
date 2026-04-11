import { Router, Response } from 'express';
import { z } from 'zod';
import {
  signup,
  login,
  googleSignIn,
  appleSignIn,
  refreshAccessToken,
  getUserById,
} from '../auth/authService';
import { authMiddleware, AuthRequest } from '../auth/middleware';

const router = Router();

// ---- Validation Schemas ----
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(30),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const socialLoginSchema = z.object({
  idToken: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ---- Routes ----

// POST /api/auth/signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = signupSchema.parse(req.body);
    const result = await signup(email, password, displayName);
    res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    const status = err.message === 'Email already registered' ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    console.log('[LOGIN] attempt:', req.body.email);
    const { email, password } = loginSchema.parse(req.body);
    const result = await login(email, password);
    console.log('[LOGIN] success:', email);
    res.json(result);
  } catch (err: any) {
    console.log('[LOGIN] failed:', req.body.email, err.message);
    if (err instanceof z.ZodError) {
      console.log('[LOGIN] validation errors:', JSON.stringify(err.errors));
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    const status = err.message === 'Invalid email or password' ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/auth/google
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { idToken } = socialLoginSchema.parse(req.body);
    const result = await googleSignIn(idToken);
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(401).json({ error: err.message });
  }
});

// POST /api/auth/apple
router.post('/apple', async (req: Request, res: Response) => {
  try {
    const { idToken } = socialLoginSchema.parse(req.body);
    const result = await appleSignIn(idToken);
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(401).json({ error: err.message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await refreshAccessToken(refreshToken);
    res.json(tokens);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(401).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
