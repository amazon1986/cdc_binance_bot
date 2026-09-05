# Production Runner for CDC Action Zone Binance Trading Bot
# Uses pre-built assets to eliminate slow compiles on small 1GB cloud servers
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled assets directly
COPY dist ./dist

# Create persistent storage folder for bot state and logs
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Volume for data persistence
VOLUME ["/app/data"]

# Start server
CMD ["node", "dist/server.cjs"]
