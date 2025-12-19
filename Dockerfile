# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Install runtime dependencies (whois + curl for healthcheck)
RUN apk add --no-cache whois curl

# Copy built node_modules and source code
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Health check - 每 30 秒检查一次
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "index.js"]
