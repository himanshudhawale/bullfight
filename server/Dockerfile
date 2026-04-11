FROM node:22-alpine AS builder
WORKDIR /app

# Copy shared types
COPY shared/ ./shared/

# Copy server
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci

COPY server/ .
RUN npm run build

# Production image
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/package.json ./
COPY --from=builder /app/shared ../shared

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
