# Prompt: security review (Verify step)

```
Review <files or diff> in FlowBoard as an attacker would. Check it against the security rules in
AGENTS.md and the OWASP table in the trainee handbook (A01, A02, A03, A04, A05, A07, A08).

For each finding, give the file and line, a concrete exploit or failure scenario, its severity,
and the fix. Check specifically:
- Broken access control: can user A read, change or delete user B's board or task?
  Are list queries filtered by owner?
- Mass assignment: is any req.body field reaching Prisma without passing through a Zod schema?
- Tokens: access/refresh secrets separated? Refresh replay returns 401? TTLs set on every Redis key?
- Brute force: is the login rate limit keyed on the real client IP (trust proxy)? Is the per-email lockout reset on success?
- Information leaks: stack traces in production, password hashes in responses, secrets in logs?
- Redis down: does each use follow ADR-005 (fail open vs fail closed) without hanging?
- Async middleware: can any throw escape next(err)?

Report only issues you can show with a concrete scenario. Say "none found" rather than padding the list.
```
