# FlowBoard worker (ADR-001). Build context is the repo root so this image can generate
# its Prisma client from api/prisma/schema.prisma, the only copy of the schema.
FROM node:22-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dev
COPY worker/package.json worker/package-lock.json ./
RUN npm ci
# Generated next to this package's node_modules (the compose anonymous volume keeps it).
# Prisma resolves @prisma/client from the schema's folder, hence the copy into /app.
COPY api/prisma/schema.prisma prisma/schema.prisma
RUN npx prisma generate --schema prisma/schema.prisma
COPY worker/ ./
CMD ["node_modules/.bin/tsx", "watch", "src/index.ts"]
