# ADR-001: Container runtime, images and startup

- **Status:** Accepted
- **Date:** 2026-11-09
- **Epic:** EPIC-FOUNDATION

## Context

Every service must start with a plain `docker compose up` on a fresh clone. Two dependencies make the image choice matter:

- **Prisma** ships a native query engine that depends on OpenSSL.
- **bcrypt** builds native code with node-gyp.

## Decision

1. **Base image:** both `api` and `worker` use `node:22-slim` (Debian 12), not Alpine.
   - Alpine uses musl. Prisma then needs a separate engine target, and bcrypt often falls back to a source build that needs python, make and g++.
   - `slim` images don't include OpenSSL, so each Dockerfile runs `apt-get install -y --no-install-recommends openssl ca-certificates`.
   - The Prisma generator lists `binaryTargets = ["native", "debian-openssl-3.0.x"]`.
2. **Node 22 LTS**, which the brief allows ("22 or 24"). Node 22 has the widest compatibility with Prisma 5 and Jest 29.
3. **Dev target:** the Compose stack uses a `dev` build stage. The source is bind-mounted, `node_modules` sits in an anonymous volume so the mount doesn't hide it, and `tsx watch` gives hot reload. A `prod` stage (`tsc`, then `node dist/server.js`) is backlog.
4. **Migrations on start:** the api command is `npx prisma migrate deploy && npx tsx watch src/server.ts`. A fresh clone gets its tables with no manual step, which the brief §5.1 requires ("without manual intervention"). During development, `prisma migrate dev` is still run by hand to create new migrations.
5. **Worker Prisma client:** the worker's build context is the repo root. Its Dockerfile copies `api/prisma/schema.prisma` and runs `prisma generate --schema`. The api owns the schema and the migrations; the worker only generates a client. Both pin the same Prisma version.
6. **Startup order:** `db` and `redis` have healthchecks, and `api` and `worker` use `depends_on: condition: service_healthy`.

## Consequences

- **Larger images:** the api image is about 200 MB larger than an Alpine image. That is acceptable for a training project.
- **Version drift:** the schema has one source, but the worker's `@prisma/client` version must be bumped together with the api's.
- **Bad migrations block startup:** a failed migration stops the api from starting, which is what we want.

## Alternatives considered

- **Alpine with `openssl` and build tools:** works, but brings more surprises and slower builds.
- **Copying the schema into the worker:** two schemas would drift apart.
- **A shared `packages/db` workspace:** cleaner, but it adds monorepo tooling the brief doesn't ask for.

## Security Gate one-liner

> "Slim, not Alpine, because Prisma's engine and bcrypt's native build break on musl. Migrations run on container start, so a fresh clone needs only `docker compose up`."
