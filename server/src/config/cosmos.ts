import { CosmosClient, Database, Container } from '@azure/cosmos';
import { config } from './index';

let client: CosmosClient;
let database: Database;

let usersContainer: Container;      // pk: /id — user accounts + chips + tokens + presence
let dataContainer: Container;       // pk: /userId — type-discriminated (notifications, etc.)
let bullfightContainer: Container;  // pk: /id — single doc: active bullfight round state
let friendsContainer: Container;    // pk: /fromUserId — friend relationships + requests

export async function initCosmos(): Promise<void> {
  client = new CosmosClient({
    endpoint: config.cosmos.endpoint,
    key: config.cosmos.key,
  });

  const { database: db } = await client.databases.createIfNotExists({
    id: config.cosmos.database,
  });
  database = db;

  await database.containers.createIfNotExists({
    id: 'users',
    partitionKey: { paths: ['/id'] },
  });
  await database.containers.createIfNotExists({
    id: 'data',
    partitionKey: { paths: ['/userId'] },
    defaultTtl: -1,
  });
  await database.containers.createIfNotExists({
    id: 'bullfight',
    partitionKey: { paths: ['/id'] },
  });
  await database.containers.createIfNotExists({
    id: 'friends',
    partitionKey: { paths: ['/fromUserId'] },
  });

  usersContainer = database.container('users');
  dataContainer = database.container('data');
  bullfightContainer = database.container('bullfight');
  friendsContainer = database.container('friends');

  console.log('✅ Cosmos DB initialized (4 containers: users, data, bullfight, friends)');
}

/**
 * Get a container reference.
 */
export function getContainer(name: string): Container {
  if (name === 'users') return usersContainer;
  if (name === 'bullfight') return bullfightContainer;
  if (name === 'friends') return friendsContainer;
  return dataContainer;
}

export { client, database };
