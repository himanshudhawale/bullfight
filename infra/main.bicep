// Azure Infrastructure — Bicep template for Bull Fight game
// Deploy: az deployment group create -g games-rg -f main.bicep

@description('Location for all resources')
param location string = 'westus'

@description('Cosmos DB account name')
param cosmosAccountName string = 'bullfight-db'

@description('Container Registry name')
param acrName string = 'bullfightacr'

@description('Container Apps Environment name')
param containerAppEnvName string = 'bullfight-env'

@description('Container App name')
param containerAppName string = 'bullfight-api'

@description('Log Analytics workspace name')
param logAnalyticsName string = 'bullfight-logs'

@description('Application Insights name')
param appInsightsName string = 'bullfight-insights'

@description('Storage account name')
param storageAccountName string = 'bullfightstorage'

// ---- Log Analytics Workspace ----
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ---- Application Insights ----
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ---- Cosmos DB (Serverless) ----
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: 'bullfight'
  properties: {
    resource: {
      id: 'bullfight'
    }
  }
}

// Cosmos containers
var cosmosContainers = [
  { name: 'users', partitionKey: '/id' }
  { name: 'data', partitionKey: '/id' }
  { name: 'gameHistory', partitionKey: '/sessionId' }
  { name: 'friends', partitionKey: '/fromUserId' }
  { name: 'messages', partitionKey: '/roomId' }
  { name: 'refreshTokens', partitionKey: '/userId' }
]

resource cosmosContainerResources 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [
  for c in cosmosContainers: {
    parent: cosmosDatabase
    name: c.name
    properties: {
      resource: {
        id: c.name
        partitionKey: {
          paths: [c.partitionKey]
          kind: 'Hash'
        }
        indexingPolicy: {
          automatic: true
          indexingMode: 'consistent'
        }
      }
    }
  }
]

// ---- Azure Container Registry ----
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ---- Storage Account (profile pics) ----
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource profilePicsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'profile-pics'
  properties: {
    publicAccess: 'None'
  }
}

// ---- Container Apps Environment ----
resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ---- Container App ----
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      registries: [
        {
          server: '${acrName}.azurecr.io'
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'cosmos-key'
          value: cosmosAccount.listKeys().primaryMasterKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'bullfight-api'
          image: '${acrName}.azurecr.io/bullfight-api:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'PORT', value: '3000' }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'COSMOS_ENDPOINT', value: cosmosAccount.properties.documentEndpoint }
            { name: 'COSMOS_KEY', secretRef: 'cosmos-key' }
            { name: 'COSMOS_DATABASE', value: 'bullfight' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 10
        rules: [
          {
            name: 'http-scale'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// ---- Outputs ----
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output acrLoginServer string = acr.properties.loginServer
output containerAppUrl string = containerApp.properties.configuration.ingress.fqdn
output appInsightsKey string = appInsights.properties.InstrumentationKey
output storageAccountName string = storageAccount.name
