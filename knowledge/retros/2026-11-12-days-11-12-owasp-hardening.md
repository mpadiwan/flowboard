# Retro: day-11 and day-12, OWASP hardening

## What changed

- `app.ts`: `helmet()` → `cors({ origin: env.ALLOWED_ORIGINS })` → `express.json({ limit: '10kb' })`, all before the routers, so 404s and errors carry the headers too. helmet 7.2.0, cors 2.8.6.
- `env.ts`: `ALLOWED_ORIGINS` is parsed into a `string[]` (each entry must be a URL, at least one); `LOGIN_MAX_FAILURES` (5) and `LOGIN_LOCKOUT_SECONDS` (900) added.
- `middleware/loginLockout.ts`: `TTL login:lock:{email}` check before the handler; `recordLoginFailure` (`MULTI INCR; EXPIRE NX`, then `SET lock EX; DEL fail` at the limit) on every 401; `clearLoginFailures` on success. All three fail open with a `warn`.
- Ownership (day-11) and mass assignment (day-12) needed no code: they were already in place from day-04 and week-02, and are now re-verified in `security.test.ts`.
- `security.test.ts` covers its whole row in the requirements §4 table. 192 tests; 99.8% lines, 98.6% branches.

## Verified live (dev stack through Nginx)

- `/api/boards` (401) carries CSP, HSTS, `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN`.
- `Origin: http://localhost:5173` gets the matching ACAO; `Origin: https://evil.example.com` gets no ACAO header.
- A 15kb body gets Express's JSON 413 (it carries `nosniff`, so it came from the api, not Nginx).
- 5 × 401, then the right password gets `429 ACCOUNT_LOCKED` with `Retry-After: 900`; `TTL login:lock:<email>` = 900 and `login:fail:<email>` is deleted.
- `isAdmin: true` on `POST /boards` returns 201 without the field.

## Backlog

- **Nginx-generated responses have no security headers.** Bodies over 16k (Nginx's own JSON 413), the `@api_unavailable` 503 and the 404 outside `/api/` never reach helmet. Consider `add_header X-Content-Type-Options nosniff always;` (plus `X-Frame-Options`) in the server block, or accept it, since those bodies are static JSON.
- **Parallel guesses beat the lockout.** Requests that pass the lock check before the 5th failure sets the lock all run bcrypt, so a burst can try more than 5 passwords. The per-IP rate limiter (100 / 15 min) bounds it. A stricter fix checks the counter atomically in the same `MULTI`.
- **Lockout as a DoS.** Anyone who knows an email can lock it for 15 minutes (unknown emails count too, by design, so the lockout reveals nothing). Recorded in ARCH §9.2; raise at the Security Gate.
- **HSTS over plain HTTP.** helmet's default HSTS header is ignored by browsers over `http://localhost`, which is harmless. It matters only once TLS terminates at Nginx.
