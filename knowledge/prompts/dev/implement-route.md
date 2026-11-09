# Prompt: implement a route

Use it in the Act step for any new endpoint. Fill in the `<…>` placeholders and delete any lines that don't apply.

```
Context: FlowBoard API (Express 4, TypeScript strict, Prisma 5, Zod 3, Redis via ioredis 5).
Follow AGENTS.md and knowledge/rules/coding-standards.md.

Task: implement <METHOD> <path> in api/src/routes/<resource>.ts.
Requirement: <FR-ID from docs/requirements/flowboard-requirements.md>, including its request,
success response and every error status listed there.

Constraints:
- Bearer auth via `authenticate` (unless the route is public per ARCH §12).
- Parse req.params / req.query / req.body with the Zod schemas in api/src/schemas/<resource>.ts;
  use only the parsed values. Never spread req.body into Prisma.
- Ownership through Board.ownerId (ADR-003): 404 if missing, 403 if not the caller's.
- Expected failures: throw AppError(message, status, CODE). Everything else goes to next(err).
- Success: { success: true, data }. DELETE returns 204 with no body.
- <Task mutations only> Call publishTaskEvent after the Prisma write succeeds (ADR-006).
- Annotate every parameter and return type. No any, no console.

Also write tests in api/tests/<resource>.test.ts: one happy path and these error paths: <list from §4 test matrix>.
Show the plan (files, functions, test cases) before writing code.
```

## Verify follow-up

```
Review the <METHOD> <path> handler and its tests you just wrote. What happens when:
the token is missing or expired, the resource belongs to another user, the id isn't a UUID,
the body has extra fields like isAdmin, and the database throws? Is any branch untested?
```
