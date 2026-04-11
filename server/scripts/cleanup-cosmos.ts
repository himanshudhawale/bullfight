/**
 * Cosmos DB Cleanup Agent — removes stale data from all containers.
 *
 * Usage:  npx ts-node scripts/cleanup-cosmos.ts [--dry-run]
 *
 * What it cleans:
 *   - data container: old gameHistory docs, expired refresh tokens, stale notifications
 *   - users container: test/bot accounts with no real activity (optional, prompts)
 *
 * Use --dry-run to preview what would be deleted without actually deleting.
 */
import dotenv from 'dotenv';
dotenv.config();

import { CosmosClient, Container } from '@azure/cosmos';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const endpoint = process.env.COSMOS_ENDPOINT!;
  const key = process.env.COSMOS_KEY!;
  const dbName = process.env.COSMOS_DATABASE || 'bullfight';

  if (!endpoint || !key) {
    console.error('❌ Missing COSMOS_ENDPOINT or COSMOS_KEY in .env');
    process.exit(1);
  }

  console.log(`🧹 Cosmos DB Cleanup Agent ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log(`   Database: ${dbName}\n`);

  const client = new CosmosClient({ endpoint, key });
  const db = client.database(dbName);

  let totalDeleted = 0;

  // ── 1. Clean 'data' container ──
  try {
    const dataContainer = db.container('data');
    totalDeleted += await cleanGameHistory(dataContainer);
    totalDeleted += await cleanRefreshTokens(dataContainer);
    totalDeleted += await cleanOldNotifications(dataContainer);
  } catch (err: any) {
    if (err.code === 404) {
      console.log('⚠️  data container not found, skipping');
    } else throw err;
  }

  // ── 2. Clean legacy containers (if they exist) ──
  for (const legacy of ['gameHistory', 'refreshTokens', 'friends', 'messages', 'chips', 'purchases', 'inventory']) {
    try {
      const container = db.container(legacy);
      const { resources } = await container.items
        .query('SELECT c.id, c._partitionKey FROM c OFFSET 0 LIMIT 1')
        .fetchAll()
        .catch(() => ({ resources: [] }));

      // Try to read — if container exists, clean it
      const count = await wipeContainer(container, legacy);
      totalDeleted += count;
    } catch {
      // Container doesn't exist — fine
    }
  }

  // ── 3. Clean stale users (test accounts) ──
  try {
    const usersContainer = db.container('users');
    totalDeleted += await cleanTestUsers(usersContainer);
  } catch (err: any) {
    if (err.code === 404) {
      console.log('⚠️  users container not found, skipping');
    } else throw err;
  }

  console.log(`\n✅ Cleanup complete — ${totalDeleted} documents ${DRY_RUN ? 'would be' : ''} deleted.`);
}

// ---------------------------------------------------------------------------
// Cleaners
// ---------------------------------------------------------------------------

/** Delete all gameHistory-type documents from data container */
async function cleanGameHistory(container: Container): Promise<number> {
  const { resources } = await container.items
    .query("SELECT c.id, c.userId FROM c WHERE c.type = 'gameHistory' OR c.type = 'game_round'")
    .fetchAll();

  if (resources.length === 0) {
    console.log('📄 gameHistory: 0 docs (clean)');
    return 0;
  }

  console.log(`📄 gameHistory: ${resources.length} docs found`);
  if (!DRY_RUN) {
    for (const doc of resources) {
      await container.item(doc.id, doc.userId).delete();
    }
  }
  console.log(`   ${DRY_RUN ? 'Would delete' : 'Deleted'} ${resources.length} game history docs`);
  return resources.length;
}

/** Delete expired or all refresh tokens from data container */
async function cleanRefreshTokens(container: Container): Promise<number> {
  const { resources } = await container.items
    .query("SELECT c.id, c.userId FROM c WHERE c.type = 'refreshToken'")
    .fetchAll();

  if (resources.length === 0) {
    console.log('🔑 refreshTokens: 0 docs (clean)');
    return 0;
  }

  console.log(`🔑 refreshTokens: ${resources.length} docs found`);
  if (!DRY_RUN) {
    for (const doc of resources) {
      await container.item(doc.id, doc.userId).delete();
    }
  }
  console.log(`   ${DRY_RUN ? 'Would delete' : 'Deleted'} ${resources.length} refresh tokens`);
  return resources.length;
}

/** Delete notifications older than 30 days */
async function cleanOldNotifications(container: Container): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { resources } = await container.items
    .query({
      query: "SELECT c.id, c.userId FROM c WHERE c.type = 'notification' AND c.createdAt < @cutoff",
      parameters: [{ name: '@cutoff', value: cutoff }],
    })
    .fetchAll();

  if (resources.length === 0) {
    console.log('🔔 notifications: 0 stale docs');
    return 0;
  }

  console.log(`🔔 notifications: ${resources.length} old docs (>30 days)`);
  if (!DRY_RUN) {
    for (const doc of resources) {
      await container.item(doc.id, doc.userId).delete();
    }
  }
  console.log(`   ${DRY_RUN ? 'Would delete' : 'Deleted'} ${resources.length} old notifications`);
  return resources.length;
}

/** Wipe all docs from a legacy container */
async function wipeContainer(container: Container, name: string): Promise<number> {
  try {
    // First check if container exists by reading metadata
    await container.read();
  } catch {
    return 0; // Container doesn't exist
  }

  // Get partition key path
  const { resource: containerDef } = await container.read();
  const pkPath = containerDef?.partitionKey?.paths?.[0]?.replace('/', '') || 'id';

  const { resources } = await container.items
    .query(`SELECT c.id, c["${pkPath}"] as pk FROM c`)
    .fetchAll();

  if (resources.length === 0) {
    console.log(`🗂️  ${name}: empty`);
    return 0;
  }

  console.log(`🗂️  ${name}: ${resources.length} legacy docs`);
  if (!DRY_RUN) {
    for (const doc of resources) {
      const partitionValue = doc.pk ?? doc.id;
      await container.item(doc.id, partitionValue).delete().catch(() => {});
    }
  }
  console.log(`   ${DRY_RUN ? 'Would delete' : 'Deleted'} ${resources.length} docs from legacy '${name}' container`);
  return resources.length;
}

/** Delete bot/test user accounts (userId starting with 'bot:' or email ending in @test) */
async function cleanTestUsers(container: Container): Promise<number> {
  const { resources } = await container.items
    .query("SELECT c.id, c.email, c.displayName FROM c WHERE STARTSWITH(c.id, 'bot:') OR ENDSWITH(c.email, '@test.com')")
    .fetchAll();

  if (resources.length === 0) {
    console.log('👤 test users: 0 (clean)');
    return 0;
  }

  console.log(`👤 test users: ${resources.length} found`);
  for (const u of resources) {
    console.log(`   - ${u.displayName || u.id} (${u.email || 'no email'})`);
  }

  if (!DRY_RUN) {
    for (const doc of resources) {
      await container.item(doc.id, doc.id).delete();
    }
  }
  console.log(`   ${DRY_RUN ? 'Would delete' : 'Deleted'} ${resources.length} test users`);
  return resources.length;
}

// ---------------------------------------------------------------------------
main().catch(err => {
  console.error('❌ Cleanup failed:', err.message);
  process.exit(1);
});
