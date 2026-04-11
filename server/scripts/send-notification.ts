/**
 * Admin script to broadcast a notification to all players.
 *
 * Usage:
 *   npx ts-node scripts/send-notification.ts --title "Maintenance" --body "Server down at 3AM UTC" --type maintenance
 *
 * Types: system | maintenance | update | promo
 */

import dotenv from 'dotenv';
dotenv.config();

import { CosmosClient } from '@azure/cosmos';
import { v4 as uuid } from 'uuid';

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const database = process.env.COSMOS_DATABASE || 'bullfight';

async function main() {
  const args = process.argv.slice(2);

  let title = '';
  let body = '';
  let type = 'system';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) title = args[++i];
    else if (args[i] === '--body' && args[i + 1]) body = args[++i];
    else if (args[i] === '--type' && args[i + 1]) type = args[++i];
  }

  if (!title || !body) {
    console.error('Usage: npx ts-node scripts/send-notification.ts --title "Title" --body "Message" [--type system|maintenance|update|promo]');
    process.exit(1);
  }

  if (!['system', 'maintenance', 'update', 'promo'].includes(type)) {
    console.error('Invalid type. Must be: system, maintenance, update, or promo');
    process.exit(1);
  }

  const client = new CosmosClient({ endpoint, key });
  const container = client.database(database).container('data');

  const notification = {
    id: uuid(),
    userId: 'all',
    docType: 'notification',
    type,
    title,
    body,
    read: false,
    createdAt: new Date().toISOString(),
  };

  await container.items.create(notification);

  console.log(`✅ Notification sent to all players!`);
  console.log(`   ID:    ${notification.id}`);
  console.log(`   Type:  ${type}`);
  console.log(`   Title: ${title}`);
  console.log(`   Body:  ${body}`);
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
