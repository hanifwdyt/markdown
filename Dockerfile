# node:20-slim (debian glibc). better-sqlite3 di-compile native -> butuh build tools.
FROM node:20-slim

WORKDIR /app

# Build deps buat better-sqlite3 (node-gyp). Dibersihin lagi biar image kecil.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install deps deterministik dari lockfile dulu (layer caching).
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Folder data buat SQLite (di-mount persistent volume di Coolify).
RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
