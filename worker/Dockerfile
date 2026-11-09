# FlowBoard worker (ADR-001). Build context is the repo root so that, from day-08,
# this image can generate its Prisma client from api/prisma/schema.prisma.
FROM node:22-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dev
COPY worker/package.json worker/package-lock.json ./
RUN npm ci
COPY worker/ ./
CMD ["node_modules/.bin/tsx", "watch", "src/index.ts"]
