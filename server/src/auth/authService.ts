import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';
import { getContainer } from '../config/cosmos';
import {
  User,
  AuthTokens,
  AuthProvider,
  VipLevel,
} from '../../../shared/types';
import { SIGNUP_BONUS_CHIPS } from '../../../shared/constants';

const googleClient = new OAuth2Client(config.google.clientId);

// ---- Token Generation ----

function generateTokens(userId: string): AuthTokens {
  const accessToken = jwt.sign({ sub: userId }, config.jwt.secret, {
    expiresIn: 900, // 15 minutes
  });
  const refreshToken = jwt.sign({ sub: userId, type: 'refresh' }, config.jwt.refreshSecret, {
    expiresIn: 604800, // 7 days
  });
  return {
    accessToken,
    refreshToken,
    expiresIn: 900, // 15 minutes in seconds
  };
}

async function storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
  const container = getContainer('refreshTokens');
  await container.items.create({
    id: uuidv4(),
    userId,
    token: refreshToken,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

// ---- Signup (Email/Password) ----

export async function signup(
  email: string,
  password: string,
  displayName: string
): Promise<{ user: User; tokens: AuthTokens }> {
  const container = getContainer('users');

  // Check if email already exists
  const { resources } = await container.items
    .query({ query: 'SELECT * FROM c WHERE c.email = @email', parameters: [{ name: '@email', value: email }] })
    .fetchAll();

  if (resources.length > 0) {
    throw new Error('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const userId = uuidv4();

  const user: User & { passwordHash: string } = {
    id: userId,
    email,
    displayName,
    passwordHash: hashedPassword,
    authProviders: ['email'],
    chips: SIGNUP_BONUS_CHIPS,
    vipLevel: VipLevel.BRONZE,
    vipXp: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    biggestWin: 0,
    totalChipsEarned: SIGNUP_BONUS_CHIPS,
    onlineStatus: 'online',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  await container.items.create(user);

  const tokens = generateTokens(userId);
  await storeRefreshToken(userId, tokens.refreshToken);

  const { passwordHash: _, ...safeUser } = user;
  return { user: safeUser as User, tokens };
}

// ---- Login (Email/Password) ----

export async function login(
  email: string,
  password: string
): Promise<{ user: User; tokens: AuthTokens }> {
  const container = getContainer('users');

  const { resources } = await container.items
    .query({ query: 'SELECT * FROM c WHERE c.email = @email', parameters: [{ name: '@email', value: email }] })
    .fetchAll();

  if (resources.length === 0) {
    throw new Error('Invalid email or password');
  }

  const userDoc = resources[0];
  const validPassword = await bcrypt.compare(password, userDoc.passwordHash);
  if (!validPassword) {
    throw new Error('Invalid email or password');
  }

  // Update last login
  userDoc.lastLoginAt = new Date().toISOString();
  userDoc.onlineStatus = 'online';
  await container.item(userDoc.id, userDoc.id).replace(userDoc);

  const tokens = generateTokens(userDoc.id);
  await storeRefreshToken(userDoc.id, tokens.refreshToken);

  const { passwordHash: _, ...safeUser } = userDoc;
  return { user: safeUser as User, tokens };
}

// ---- Google Sign-In ----

export async function googleSignIn(
  idToken: string
): Promise<{ user: User; tokens: AuthTokens; isNewUser: boolean }> {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.google.clientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new Error('Invalid Google token');
  }

  const container = getContainer('users');
  const { resources } = await container.items
    .query({ query: 'SELECT * FROM c WHERE c.email = @email', parameters: [{ name: '@email', value: payload.email }] })
    .fetchAll();

  let user: any;
  let isNewUser = false;

  if (resources.length > 0) {
    user = resources[0];
    // Link Google if not already linked
    if (!user.authProviders.includes('google')) {
      user.authProviders.push('google');
    }
    user.lastLoginAt = new Date().toISOString();
    user.onlineStatus = 'online';
    if (payload.picture && !user.profilePicUrl) {
      user.profilePicUrl = payload.picture;
    }
    await container.item(user.id, user.id).replace(user);
  } else {
    isNewUser = true;
    user = {
      id: uuidv4(),
      email: payload.email,
      displayName: payload.name || payload.email.split('@')[0],
      profilePicUrl: payload.picture,
      authProviders: ['google'] as AuthProvider[],
      chips: SIGNUP_BONUS_CHIPS,
      vipLevel: VipLevel.BRONZE,
      vipXp: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      biggestWin: 0,
      totalChipsEarned: SIGNUP_BONUS_CHIPS,
      onlineStatus: 'online',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    await container.items.create(user);
  }

  const tokens = generateTokens(user.id);
  await storeRefreshToken(user.id, tokens.refreshToken);

  return { user: user as User, tokens, isNewUser };
}

// ---- Apple Sign-In ----

export async function appleSignIn(
  idToken: string
): Promise<{ user: User; tokens: AuthTokens; isNewUser: boolean }> {
  // Decode Apple ID token (in production, verify with Apple's public keys)
  const decoded = jwt.decode(idToken) as any;
  if (!decoded || !decoded.sub) {
    throw new Error('Invalid Apple token');
  }

  const appleUserId = decoded.sub;
  const email = decoded.email || `${appleUserId}@privaterelay.appleid.com`;

  const container = getContainer('users');

  // Check by email or Apple user ID
  const { resources } = await container.items
    .query({
      query: 'SELECT * FROM c WHERE c.email = @email OR c.appleUserId = @appleId',
      parameters: [
        { name: '@email', value: email },
        { name: '@appleId', value: appleUserId },
      ],
    })
    .fetchAll();

  let user: any;
  let isNewUser = false;

  if (resources.length > 0) {
    user = resources[0];
    if (!user.authProviders.includes('apple')) {
      user.authProviders.push('apple');
    }
    user.appleUserId = appleUserId;
    user.lastLoginAt = new Date().toISOString();
    user.onlineStatus = 'online';
    await container.item(user.id, user.id).replace(user);
  } else {
    isNewUser = true;
    user = {
      id: uuidv4(),
      email,
      appleUserId,
      displayName: decoded.email ? decoded.email.split('@')[0] : 'Player',
      authProviders: ['apple'] as AuthProvider[],
      chips: SIGNUP_BONUS_CHIPS,
      vipLevel: VipLevel.BRONZE,
      vipXp: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      biggestWin: 0,
      totalChipsEarned: SIGNUP_BONUS_CHIPS,
      onlineStatus: 'online',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    await container.items.create(user);
  }

  const tokens = generateTokens(user.id);
  await storeRefreshToken(user.id, tokens.refreshToken);

  return { user: user as User, tokens, isNewUser };
}

// ---- Refresh Token ----

export async function refreshAccessToken(
  refreshToken: string
): Promise<AuthTokens> {
  let payload: any;
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    throw new Error('Invalid refresh token');
  }

  const userId = payload.sub;

  // Verify token exists in DB (token rotation)
  const container = getContainer('refreshTokens');
  const { resources } = await container.items
    .query({
      query: 'SELECT * FROM c WHERE c.userId = @userId AND c.token = @token',
      parameters: [
        { name: '@userId', value: userId },
        { name: '@token', value: refreshToken },
      ],
    })
    .fetchAll();

  if (resources.length === 0) {
    throw new Error('Refresh token not found or revoked');
  }

  // Delete old token (rotation)
  const oldToken = resources[0];
  await container.item(oldToken.id, userId).delete();

  // Issue new token pair
  const tokens = generateTokens(userId);
  await storeRefreshToken(userId, tokens.refreshToken);

  return tokens;
}

// ---- Verify Access Token (middleware helper) ----

export function verifyAccessToken(token: string): { sub: string } {
  return jwt.verify(token, config.jwt.secret) as { sub: string };
}

// ---- Get User by ID ----

export async function getUserById(userId: string): Promise<User | null> {
  const container = getContainer('users');
  try {
    const { resource } = await container.item(userId, userId).read();
    if (!resource) return null;
    const { passwordHash: _, ...safeUser } = resource;
    return safeUser as User;
  } catch {
    return null;
  }
}
