# ADR-007: Zod validation contract

- **Status:** Accepted
- **Date:** 2026-11-09
- **Epic:** EPIC-API, EPIC-SECURITY

## Context

The brief requires:

- every body to have a Zod schema;
- ID path params to be validated as UUIDs;
- invalid input to return 422 with a descriptive message;
- unknown fields to be **stripped**, not passed through or rejected;
- no mass assignment.

## Decision

1. **Plain `z.object()`:** Zod strips unknown keys by default.
   - Never `.passthrough()`, which lets fields like `isAdmin` through.
   - Never `.strict()`, which would turn an extra field into a 422 instead of stripping it.
2. **Parse everything:** handlers parse `req.params`, `req.query` and `req.body`, then use **only** the parsed result. Prisma `data` is built from that parsed object, and `req.body` is never spread into it.
3. **Schemas:**
   - **`IdParamSchema`:** `{ id: z.string().uuid() }`.
   - **`CreateTaskSchema`:**
     - `title`: string, 1–255 characters, trimmed;
     - `description`: string, at most 5000 characters, optional;
     - `priority`: `LOW` | `MEDIUM` | `HIGH`, default `MEDIUM`;
     - `status`: `TaskStatus`, optional;
     - `boardId`: UUID.
   - **`UpdateTaskSchema`:**
     - `title`, `description` (nullable), `priority` and `status` are all optional;
     - a refinement requires at least one field;
     - `boardId` can't be changed;
     - allowing `status` is an assumption tracked as OQ-1.
   - **`CreateBoardSchema`:** `name`, string, 1–100 characters, trimmed.
   - **`RegisterSchema` / `LoginSchema`:**
     - `email`: email address, lower-cased;
     - `password`: 8–72 characters (bcrypt ignores bytes after the 72nd).
   - **`RefreshSchema` / `LogoutSchema`:** `refreshToken`, a non-empty string.
   - **`TaskListQuery`:** `boardId`, UUID, optional.
   - **`AuditLogQuery`:** `limit`, coerced integer, 1–100, default 50.
4. **Error body:** a `ZodError` becomes a 422 response:
   ```json
   {
     "success": false,
     "message": "Validation failed: title: Required",
     "code": "VALIDATION_ERROR",
     "details": [{ "path": "title", "message": "Required" }]
   }
   ```
   - **`message`** names the first issue, which keeps it descriptive.
   - **`details`** is an addition to the handbook's error shape, and it appears only on 422 responses.
5. **Schema location:** schemas live in `src/schemas/`, and handlers type their input with `z.infer`, so there are no duplicate interfaces.

## Consequences

- **Silent stripping:** clients get no error for a misspelled optional field, because it is simply ignored. This is exactly what the brief asks for.
- **Mass assignment test:** `POST /tasks` with `{ …, isAdmin: true, id: "x" }` returns 201, and the stored task has neither field.

## Security Gate one-liner

> "Zod is the whitelist: whatever isn't in the schema is stripped before it gets near Prisma, so mass assignment is impossible by construction. Bad input gets a 422 naming the field."
