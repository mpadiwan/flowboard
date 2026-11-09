# FlowBoard api (ADR-001): Debian slim, not Alpine, because Prisma's engine and
# bcrypt's native build both break on musl. OpenSSL is installed for Prisma.
FROM node:22-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Development target used by docker-compose.yml: source is bind-mounted and
# tsx reloads on change. A production stage (tsc build) is backlog.
FROM base AS dev
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "watch", "src/server.ts"]
