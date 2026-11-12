# FlowBoard

A containerized, typed and tested REST API for boards and tasks. It is the capstone project of the Stratpoint Node.js Engineering Program, Part 2.

| Service  | What it does                                                              |
| -------- | ------------------------------------------------------------------------- |
| `nginx`  | Reverse proxy on port 80. The only entry point.                           |
| `api`    | Express 4 + TypeScript HTTP API on port 3000. Reached only through Nginx. |
| `worker` | Background consumer that writes AuditLog rows (from day-08).              |
| `db`     | PostgreSQL 16                                                             |
| `redis`  | Redis 7: rate limiting, refresh tokens, event stream                      |

Read more:

- [Architecture](docs/arch-docs/flowboard/ARCH-flowboard.md)
- [Decisions (ADRs)](docs/arch-docs/flowboard/adr/)
- [Requirements and API contract](docs/requirements/flowboard-requirements.md)
- [AI context file and project rules](AGENTS.md)

## Prerequisites

- Docker Desktop with Compose v2 (`docker compose version`)
- Node.js 22 or 24, for the editor, lint and typecheck on your machine. The services themselves run in Docker.

## Run it

```bash
cp .env.example .env          # local placeholders; edit if you like
docker compose up -d --build  # starts all five services
docker compose ps             # all services should be "running"
```

The API is served at `http://localhost/api`. Nginx strips the `/api` prefix, so `/api/tasks` reaches the api's `/tasks` route.

```bash
curl -i http://localhost/api/does-not-exist
# HTTP/1.1 404 … {"success":false,"message":"Route GET /does-not-exist not found","code":"ROUTE_NOT_FOUND"}
```

**Useful commands**

```bash
docker compose logs -f api            # follow api logs
docker compose exec db psql -U flowboard flowboard
docker compose exec redis redis-cli
docker compose down                   # stop (keeps the database and Redis volumes)
docker compose down -v                # stop and delete the database and Redis volumes
```

**After changing dependencies**, rebuild and refresh the `node_modules` volumes. Otherwise the containers keep their old modules.

```bash
docker compose up -d --build --renew-anon-volumes
```

## Develop

Install the dependencies on your machine once. They're used by the editor, git hooks, lint and typecheck:

```bash
npm install && npm --prefix api install && npm --prefix worker install
```

| Command             | What it checks                                                      |
| ------------------- | ------------------------------------------------------------------- |
| `npm run typecheck` | `tsc --noEmit` in api and worker. Must report zero errors.          |
| `npm run lint`      | ESLint, including no `console`, no `any` and annotated return types |
| `npm run format`    | Prettier                                                            |

Tests run exactly as the brief specifies. The test stack is a separate Compose project (`flowboard-test`) with its own throwaway `*_test` database, so it never touches dev data. Jest runs serially and fails if line or branch coverage drops below 80% (ADR-008).

```bash
docker compose -f docker-compose.test.yml up -d --build   # once; applies migrations
docker compose -f docker-compose.test.yml exec api npx jest
```

The worker's unit tests mock Redis and Prisma, so they need no stack and run on the host. Their coverage is reported but has no threshold (OQ-6).

```bash
npm --prefix worker test
```

Husky also runs them before every `git push`.

**Edits not picked up:** on macOS, `tsx watch` in the api container doesn't always see edits made through the bind mount. If a change doesn't show up, run `docker compose restart api`.

**Schema changes:** the api applies pending migrations on every start. To create a new one after editing `api/prisma/schema.prisma`:

```bash
docker compose exec api npx prisma migrate dev --name <change>
```

**Seed data:** `prisma/seed.ts` creates `dev@flowboard.test` (password: `SEED_USER_PASSWORD` from `.env`), 2 boards and 3 tasks. It is idempotent, so running it again changes nothing. `migrate dev` and `migrate reset` run it automatically; `migrate deploy`, which runs on start, never does.

```bash
docker compose exec api npx prisma db seed
docker compose exec api npm run db:studio   # Prisma Studio on http://localhost:5555
```

## Commits

Husky runs ESLint and Prettier on staged files, and commitlint checks each commit message.

- **Milestone commits** use the brief's exact tags, for example `day-01: environment setup, AppError, global error handler`. [ADR-009](docs/arch-docs/flowboard/adr/ADR-009-commit-convention.md) lists all 15.
- **Every other commit** uses Conventional Commits (`feat:`, `fix:`, `docs:` and so on).
