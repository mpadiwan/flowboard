# ADR-003: Ownership is resolved through `Board.ownerId`

- **Status:** Accepted
- **Date:** 2026-11-09
- **Epic:** EPIC-API, EPIC-DATA

## Context

- **No owner field on tasks:** the handbook's OWASP table says to check `task.userId === req.user.id`, but the schema's `Task` model has no `userId` column.
- **Board deletes fail as written:** the handbook schema has no `onDelete` on `Task.board`. Deleting a board that has tasks would hit a foreign key violation (P2003) and return a 500.
- **403, not 404:** the brief requires a 403 when a user touches another user's resource.

## Decision

1. **A task belongs to the owner of its board.** No `userId` is added to `Task`, so there is no second ownership field that could fall out of sync.
2. **Check order:** load the resource first, then check ownership.
   - **Single board:** `findUnique`; 404 `BOARD_NOT_FOUND` if missing; 403 `FORBIDDEN` if `ownerId !== req.user.id`.
   - **Single task:** `findUnique({ include: { board: { select: { ownerId: true } } } })`; 404 `TASK_NOT_FOUND`, otherwise 403 as above.
   - **`POST /tasks`:** checks the `boardId` in the body the same way. 404 if the board doesn't exist, 403 if it belongs to someone else.
   - **List routes** filter in the query (`where: { ownerId }` or `where: { board: { ownerId } }`), so they never return other users' rows and never need a 403.
3. **One shared helper:** a small set of functions (`getOwnedBoard(id, userId)` and `getOwnedTask(id, userId)`) holds the check, so every route behaves the same way.
4. **Schema additions (deviations from the handbook):**
   - `Task.board` gets `onDelete: Cascade`, so deleting a board removes its tasks.
   - Indexes go on `Board.ownerId`, `Task.boardId` and `AuditLog(userId, createdAt)`.

## Consequences

- **IDs can be probed:** a 403 tells the caller that the ID exists. Returning 404 for "not yours" would hide that, but the brief explicitly requires 403. UUIDs make guessing IDs impractical, so this leak is accepted.
- **Board delete has no per-task audit:** cascaded task deletes don't publish `TASK_DELETED` events, so they get no audit rows. This is tracked as OQ-7.

## Security Gate one-liner

> "Tasks don't store a user, they belong to a board, and the board has the owner. So every task check loads the board's `ownerId`: 404 if it doesn't exist, 403 if it isn't yours, and list queries filter by owner so they can never leak."
