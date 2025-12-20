# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# Runtime stage
FROM node:22-slim

WORKDIR /app

# Install runtime dependencies: whois, curl, chromium for puppeteer
RUN apt-get update && apt-get install -y \
    whois \
    curl \
    chromium \
    fonts-noto-cjk \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set puppeteer to use system chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy built node_modules and source code
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "index.js"]
