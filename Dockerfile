# syntax=docker/dockerfile:1.4

# Multi-stage build for pageflow backend
FROM node:20-alpine AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies (skip prepare script to avoid build)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# Rebuild native modules
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm rebuild better-sqlite3

# Copy source code after dependencies are installed
COPY src ./src
COPY examples ./examples
COPY types ./types
COPY tsconfig.json ./

# Production stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy dependencies and source from builder (no reinstall needed)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/src ./src
COPY --from=builder /app/examples ./examples
COPY --from=builder /app/types ./types
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create data directory
RUN mkdir -p /data

# Environment variables (can be overridden)
ENV PORT=3100
ENV SCREENSHOT=true
ENV DB_PATH=/data

# Expose the server port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3100/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start the server
CMD ["pnpm", "run", "server"]
