/**
 * Seed script — creates an admin account in Cosmos DB.
 *
 * Usage:  npx ts-node scripts/seed-admin.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { CosmosClient } from '@azure/cosmos';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@bf.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Admin';
const CHIPS = 10_000_000; // 10 M chips

async function main() {
  const endpoint = process.env.COSMOS_ENDPOINT!;
  const key = process.env.COSMOS_KEY!;
  const dbName = process.env.COSMOS_DATABASE || 'bullfight';

  if (!endpoint || !key) {
    console.error('❌ Missing COSMOS_ENDPOINT or COSMOS_KEY in .env');
    process.exit(1);
  }

  if (!ADMIN_PASSWORD) {
    console.error('❌ Missing SEED_ADMIN_PASSWORD in .env — set a strong password before seeding.');
    process.exit(1);
  }

  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({ id: dbName });
  const container = database.container('users');

  // Check if admin already exists
  const { resources } = await container.items
    .query({
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: ADMIN_EMAIL }],
    })
    .fetchAll();

  if (resources.length > 0) {
    console.log(`⚠️  Admin account (${ADMIN_EMAIL}) already exists — id: ${resources[0].id}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const userId = uuidv4();

  await container.items.create({
    id: userId,
    email: ADMIN_EMAIL,
    displayName: ADMIN_NAME,
    passwordHash,
    authProviders: ['email'],
    chips: CHIPS,
    vipLevel: 'bronze',
    vipXp: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    biggestWin: 0,
    totalChipsEarned: CHIPS,
    isAdmin: true,
    onlineStatus: 'offline',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  });

  console.log(`✅ Admin account created`);
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log('   Password: (value of SEED_ADMIN_PASSWORD env var)');
  console.log(`   Chips:    ${CHIPS.toLocaleString()}`);
  console.log(`   ID:       ${userId}`);
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
