FROM node:22-slim

WORKDIR /app

# Install build dependencies for native modules (bcrypt, sharp) and curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

# Ensure data directory exists
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

ENV PORT=3000 \
    NODE_ENV=production \
    TITAN_DATA_DIR=/app/data \
    JARVIS_DB_PATH=/app/data/jarvis.db

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
