const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow Metro to resolve modules from the shared/ folder outside the project root
const sharedDir = path.resolve(__dirname, '..', 'shared');

config.watchFolders = [sharedDir];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Ensure Metro can resolve .ts files from shared/
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
};

module.exports = config;
