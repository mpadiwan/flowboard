# ADR-002: Nginx strips `/api`; the API is reachable only through Nginx

- **Status:** Accepted
- **Date:** 2026-11-09
- **Epic:** EPIC-FOUNDATION, EPIC-SECURITY

## Context

The brief says Nginx "forwards /api/\* traffic to the api service". The handbook and its tests call routes without a prefix, as in `request(app).post('/auth/register')`.

The rate limiter keys on `req.ip`. Behind a proxy, `req.ip` is only correct when `trust proxy` is set. If the api were also reachable directly, a client could forge `X-Forwarded-For` and get a fresh rate-limit bucket on every request.

## Decision

1. **Nginx strips the prefix:**
   ```nginx
   location /api/ {
     proxy_pass http://api:3000/;          # trailing slash strips /api
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $scheme;
     proxy_set_header X-Request-Id $request_id;
   }
   ```
   - Express mounts its routes at the root: `/auth`, `/boards`, `/tasks`, `/audit-logs`, `/health` and `/ready`.
   - Clients call `http://localhost/api/tasks`.
   - Supertest calls `/tasks`.
2. **`app.set('trust proxy', 1)`:** Express trusts exactly one hop, Nginx. `req.ip` becomes the address Nginx saw, and any client-supplied entries further left in `X-Forwarded-For` are ignored.
3. **The `api` port is not published to the host.** Compose uses no `ports: 3000:3000`, so all traffic goes through Nginx. `db` and `redis` aren't published either; use `docker compose exec` to reach them. The only extra port is 5555 on the api, for Prisma Studio.
4. **`client_max_body_size 16k`** in Nginx sits above the api's 10kb limit. Express then returns the JSON 413 itself, rather than Nginx returning an HTML 413.

## Consequences

- **Postman setup:** the Postman or Bruno base URL is `http://localhost/api`.
- **Tests skip Nginx:** Supertest bypasses Nginx, so tests run without `X-Forwarded-For` and `req.ip` is the loopback address. Each test file resets Redis, so they don't share a rate-limit bucket.
- **Spoofing defence:** rate-limit keys can't be spoofed, because the only path to the api runs through the one trusted hop.

## Security Gate one-liner

> "Nginx is the only way in. It strips `/api` and appends the real client IP. Express trusts exactly one proxy, so `req.ip` is the real client and nobody can dodge the rate limiter by forging `X-Forwarded-For`."
