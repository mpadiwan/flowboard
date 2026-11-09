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
docker compose down                   # stop (keeps the database volume)
docker compose down -v                # stop and delete the database volume
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

Tests arrive with plan Day 2 and run exactly as the brief specifies:

```bash
docker compose -f docker-compose.test.yml up -d --build
docker compose -f docker-compose.test.yml exec api npx jest
```

## Commits

Husky runs ESLint and Prettier on staged files, and commitlint checks each commit message.

- **Milestone commits** use the brief's exact tags, for example `day-01: environment setup, AppError, global error handler`. [ADR-009](docs/arch-docs/flowboard/adr/ADR-009-commit-convention.md) lists all 15.
- **Every other commit** uses Conventional Commits (`feat:`, `fix:`, `docs:` and so on).
