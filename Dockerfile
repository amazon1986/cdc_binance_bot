# Multi-stage Dockerfile for CDC Action Zone Binance Trading Bot
# Stage 1: Build Frontend and Server Bundle
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build Vite frontend and Node server bundle
RUN npm run build

# Stage 2: Production Runner
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled assets from builder
COPY --from=builder /app/dist ./dist

# Create persistent storage folder for bot state and logs
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Volume for data persistence
VOLUME ["/app/data"]

# Start server
CMD ["node", "dist/server.cjs"]
