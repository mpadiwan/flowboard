# ADR-004: Access and refresh tokens, with refresh rotation in Redis

- **Status:** Accepted
- **Date:** 2026-11-09
- **Epic:** EPIC-AUTH

## Context

The brief requires:

- a 15-minute access token and a 7-day refresh token;
- refresh tokens rotated on each use;
- a replayed refresh token rejected with 401;
- logout that revokes the refresh token.

Checking an access token must not need a database or Redis call (brief §2.2, step 3).

## Decision

1. **Access token:** a JWT `{ sub }` signed with `JWT_ACCESS_SECRET`, valid for 15 minutes. It is stateless and can't be revoked before it expires.
2. **Refresh token:** a JWT `{ sub, jti }` signed with a **different** secret, `JWT_REFRESH_SECRET`, valid for 7 days. The server stores it as `SET refresh:{sub}:{jti} 1 EX 604800`.
3. **`POST /auth/refresh`**, with `{ refreshToken }` in the body:
   1. `jwt.verify` with the refresh secret. A bad signature or an expired token returns 401.
   2. `DEL refresh:{sub}:{jti}`. If the result is `0`, the token was already used or revoked, so return 401 `INVALID_REFRESH_TOKEN`.
   3. Issue a new pair with a new `jti`, `SET` it with the TTL, and return `{ accessToken, refreshToken }`.

   Step 2 uses the return value of `DEL` rather than a separate `EXISTS` then `DEL`. That makes the check-and-consume atomic, so two concurrent refreshes with the same token can't both succeed.

4. **`POST /auth/logout`**, with `{ refreshToken }` in the body:
   - verify the token (401 if it's invalid);
   - `DEL` its key;
   - return 204, even if the key was already gone, so logout can safely be called twice.
5. **Redis fails closed for refresh:** if Redis is down, refresh returns 503. A refresh must never succeed without the revocation check. Rate limiting fails open instead ([ADR-005](ADR-005-redis-failure-policy.md)).
6. **Token issuing:** `src/lib/tokens.ts` holds `issueTokenPair`, `verifyAccess` and `verifyRefresh`, so the sign and verify options live in one place.

## Consequences

- **Short window after logout:** an access token that was already issued stays valid for up to 15 minutes after logout. That is the standard trade-off for stateless access tokens, and the brief accepts it.
- **Separate secrets:** a refresh token presented as a Bearer token fails verification.
- **Out of scope:** reuse detection, meaning "a replayed token revokes the whole token family", is a real-world improvement that the brief doesn't require.

## Security Gate one-liner

> "Access tokens are stateless and short-lived. Refresh tokens are long-lived, so each one has an ID in Redis. Refreshing atomically deletes the old ID, and if the delete removes nothing, it's a replay, so you get 401."
