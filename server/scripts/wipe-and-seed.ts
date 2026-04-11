/**
 * Wipe all Cosmos DB data and re-seed admin account.
 * Usage: npx ts-node scripts/wipe-and-seed.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { CosmosClient } from '@azure/cosmos';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const endpoint = process.env.COSMOS_ENDPOINT!;
  const key = process.env.COSMOS_KEY!;
  const dbName = process.env.COSMOS_DATABASE || 'bullfight';

  if (!endpoint || !key) {
    console.error('❌ Missing COSMOS_ENDPOINT or COSMOS_KEY');
    process.exit(1);
  }

  const client = new CosmosClient({ endpoint, key });
  const db = client.database(dbName);

  console.log('🗑️  Wiping all Cosmos DB data...\n');

  // List all containers and wipe each
  const { resources: containers } = await db.containers.readAll().fetchAll();

  for (const cDef of containers) {
    const container = db.container(cDef.id);
    const pkPath = cDef.partitionKey?.paths?.[0]?.replace(/^\//, '') || 'id';

    const { resources: docs } = await container.items
      .query(`SELECT c.id, c["${pkPath}"] as pk FROM c`)
      .fetchAll();

    if (docs.length === 0) {
      console.log(`  ${cDef.id}: empty`);
      continue;
    }

    console.log(`  ${cDef.id}: deleting ${docs.length} docs...`);
    for (const doc of docs) {
      try {
        await container.item(doc.id, doc.pk ?? doc.id).delete();
      } catch {
        // Try with id as partition
        try { await container.item(doc.id, doc.id).delete(); } catch { /* skip */ }
      }
    }
    console.log(`  ${cDef.id}: ✅ wiped`);
  }

  // Re-seed admin
  console.log('\n🌱 Seeding admin account...');
  const usersContainer = db.container('users');
  const adminId = uuidv4();
  const passwordHash = await bcrypt.hash('REMOVED', 10);

  await usersContainer.items.create({
    id: adminId,
    email: 'admin@bf.com',
    passwordHash,
    displayName: 'Admin',
    avatarUrl: '',
    chips: 10_000_000,
    vipXp: 0,
    vipLevel: 'newcomer',
    loginStreak: 0,
    lastLoginDate: null,
    lastHourlyBonus: null,
    lastBrokeBonus: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log(`  ✅ admin@bf.com created (${adminId}) — 10M chips, password: REMOVED`);
  console.log('\n✅ Database is fresh and ready!');
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
