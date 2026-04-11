/**
 * Restore chips for admin user.
 * Usage: npx ts-node scripts/restore-chips.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { CosmosClient } from '@azure/cosmos';

async function main() {
  const endpoint = process.env.COSMOS_ENDPOINT!;
  const key = process.env.COSMOS_KEY!;
  const dbName = process.env.COSMOS_DATABASE || 'bullfight';

  const client = new CosmosClient({ endpoint, key });
  const db = client.database(dbName);
  const users = db.container('users');

  const { resources } = await users.items
    .query("SELECT * FROM c WHERE c.email = 'admin@bf.com'")
    .fetchAll();

  if (resources.length === 0) {
    console.log('❌ admin@bf.com not found');
    return;
  }

  const user = resources[0];
  console.log(`Current chips: ${user.chips}`);
  user.chips = 250_000_000;
  await users.item(user.id, user.id).replace(user);
  console.log(`✅ Restored chips to 250,000,000 for ${user.email}`);
}

main().catch(console.error);
