import { getContainer } from '../config/cosmos';

/** Mark a user as online (stored directly on user doc in Cosmos) */
export async function setUserOnline(
  userId: string,
  status = 'online',
  ttlSeconds = 3600,
  currentTier: string | null = null,
): Promise<void> {
  try {
    const { resource } = await getContainer('users').item(userId, userId).read();
    if (resource) {
      resource.onlineStatus = status;
      resource.currentTier = currentTier;
      resource.onlineExpiresAt = Date.now() + ttlSeconds * 1000;
      await getContainer('users').item(userId, userId).replace(resource);
    }
  } catch {
    // Silently ignore — presence is best-effort
  }
}

/** Read a user's online status from Cosmos */
export async function getUserOnlineStatus(
  userId: string,
): Promise<{ status: string; currentTier: string | null }> {
  try {
    const { resource } = await getContainer('users').item(userId, userId).read();
    if (!resource) return { status: 'offline', currentTier: null };
    if (resource.onlineExpiresAt && Date.now() > resource.onlineExpiresAt) {
      return { status: 'offline', currentTier: null };
    }
    return {
      status: resource.onlineStatus ?? 'offline',
      currentTier: resource.currentTier ?? null,
    };
  } catch {
    return { status: 'offline', currentTier: null };
  }
}
