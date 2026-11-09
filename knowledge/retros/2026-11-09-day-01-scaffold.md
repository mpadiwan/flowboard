# Retro: day-01 scaffold (2026-11-09)

## Non-obvious constraints found during VALIDATE

1. **Nginx's own errors are HTML.** A body over `client_max_body_size`, or an api that is down, produced Nginx's HTML 413 or 502 page, which breaks the single JSON error shape (ARCH §7). Fixed with `error_page 413 @payload_too_large` and `error_page 502 503 504 =503 @api_unavailable`, both named locations that return JSON. Without `=503`, the original 502 status is kept.
2. **Editing a bind-mounted single file is not seen live.** `./nginx/nginx.conf` is mounted as a single file. Editors replace the file (new inode), so the running container keeps reading the old copy, and `nginx -t` inside it fails on stale content. **After editing `nginx.conf`, run `docker compose restart nginx`.** Backlog option: mount the `nginx/` directory instead.
3. **`.dockerignore` is required.** Without it, host `node_modules` (macOS binaries) would be copied into Linux images. The root file covers the worker, whose build context is the repo root; `api/.dockerignore` covers the api.
4. **`nexus generate_project_rules` output is generic.** It detected the stack as only "Prisma, PostgreSQL" and gave Conventional Commits only. Always rewrite `AGENTS.md` and `coding-standards.md` from the ARCH doc.

## Backlog

| Item                                                | Why deferred                                                                                                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zod 3 high-severity advisory (fix only in Zod 4)    | The brief pins Zod 3. Raised as OQ-8; mitigated by the 10kb limit from day-11.                                                                                                                                       |
| `typescript-eslint` → `minimatch` moderate advisory | Lint-time dev dependency only; no runtime exposure.                                                                                                                                                                  |
| `X-Powered-By: Express` header                      | Removed by helmet with day-11.                                                                                                                                                                                       |
| graphify `PostToolUse` hook is a no-op              | `~/.local/bin` (where `graphify` lives) is not on the shell PATH, so `graphify update .` fails silently (`\|\| true`). Add `~/.local/bin` to PATH, then run `/graphify . --update` to bring the code into the graph. |
| Production Docker stage, CI pipeline                | Not required by the brief for day-01.                                                                                                                                                                                |
