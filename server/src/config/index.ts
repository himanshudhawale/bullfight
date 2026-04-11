import dotenv from 'dotenv';
dotenv.config();

const DEFAULT_JWT_SECRET = 'dev-jwt-secret-change-in-production';
const DEFAULT_REFRESH_SECRET = 'dev-refresh-secret-change-in-production';

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function validateProductionConfig(): void {
  const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET || DEFAULT_REFRESH_SECRET;

  if (isProduction) {
    if (!jwtSecret || jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.startsWith('dev-')) {
      console.error('FATAL: JWT_SECRET is missing or using a dev/default value in production.');
      process.exit(1);
    }
    if (!refreshSecret || refreshSecret === DEFAULT_REFRESH_SECRET || refreshSecret.startsWith('dev-')) {
      console.error('FATAL: JWT_REFRESH_SECRET is missing or using a dev/default value in production.');
      process.exit(1);
    }
    if (!process.env.COSMOS_KEY) {
      console.error('FATAL: COSMOS_KEY is required in production.');
      process.exit(1);
    }
  } else {
    if (jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.startsWith('dev-')) {
      console.warn('WARNING: Using default/dev JWT_SECRET. Do NOT use this in production.');
    }
    if (refreshSecret === DEFAULT_REFRESH_SECRET || refreshSecret.startsWith('dev-')) {
      console.warn('WARNING: Using default/dev JWT_REFRESH_SECRET. Do NOT use this in production.');
    }
  }
}

validateProductionConfig();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv,

  cosmos: {
    endpoint: process.env.COSMOS_ENDPOINT!,
    key: process.env.COSMOS_KEY!,
    database: process.env.COSMOS_DATABASE || 'bullfight',
  },

  storage: {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
    container: process.env.AZURE_STORAGE_CONTAINER || 'profile-pics',
  },

  jwt: {
    secret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET || DEFAULT_REFRESH_SECRET,
    accessExpiry: '15m',
    refreshExpiry: '7d',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  },

  apple: {
    clientId: process.env.APPLE_CLIENT_ID || 'com.bullfight.app',
    teamId: process.env.APPLE_TEAM_ID || '',
    keyId: process.env.APPLE_KEY_ID || '',
    privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH || './keys/apple-auth-key.p8',
  },
};
