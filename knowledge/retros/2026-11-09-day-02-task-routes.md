# Retro: day-02 typed task routes (2026-11-09)

## Non-obvious constraints found during APPLY and VALIDATE

1. **Jest 29 needs `ts-node` to read `jest.config.ts`.** ADR-008 names a TypeScript config, so `ts-node` 10.9.2 is a pinned dev dependency. (Jest 30 would remove the need, but the brief pins 29.)
2. **ESLint's `no-misused-promises` rejects async Express 4 handlers.** Its `checksVoidReturn.arguments` check is turned off only for `api/src/routes/**` and `api/src/middleware/**`. That is safe because every handler wraps its body in try/catch and calls `next(err)`, so the promise never rejects. The rule stays on everywhere else.
3. **Tests need their own `tsconfig.json`.** `api/tsconfig.json` has `rootDir: src`, so files in `tests/` are outside it, and ESLint's `projectService` then fails on them. `api/tests/tsconfig.json` extends it with `rootDir: ..`; `npm run typecheck` runs both. `jest.config.ts` is linted through `allowDefaultProject`.
4. **ts-jest with `module: Node16` warns (TS151002) unless `isolatedModules: true`.** It is set only in the tests tsconfig. ts-jest then transpiles without type-checking, so `npm run typecheck` is what type-checks the tests.
5. **body-parser accepts any `utf-*` charset.** `charset=utf-7` is not rejected; use `charset=latin1` to test the 415 path.
6. **Testing `res.headersSent` over HTTP aborts the socket.** Express's fallback handler destroys the connection, so call `globalErrorHandler` directly with a stub `res`.
7. **`User → Board` has no cascade.** Deleting a user who still owns boards fails with a foreign-key error. Delete the boards first; their tasks cascade. Test cleanup uses `TRUNCATE … CASCADE`.

## Backlog

| Item                                                        | Why deferred                                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Race between `findTaskOrThrow` and `update`/`delete`        | If a task is deleted in between, Prisma's P2025 maps to `404 NOT_FOUND` instead of `TASK_NOT_FOUND`. The status is still right. Revisit when `getOwnedTask` replaces the helper (day-04/day-11). |
| 413 test relies on express.json's 100kb default             | day-11 sets the 10kb limit; the test body (200kb) still exceeds it, but AC-4.3 needs its own 15kb test in `security.test.ts`.                                                                    |
| `env.ts` failure branch (`process.exit(1)`) untested        | Overall branches are at 93.9%. Add a `jest.isolateModules` test if coverage gets tight.                                                                                                          |
| `jest.config.ts` is linted but not type-checked by `tsc`    | It is small and is type-checked by ts-node when Jest loads it.                                                                                                                                   |
| `deepmerge` high-severity advisory (via Jest tooling)       | Dev dependency only; no runtime exposure. The runtime audit shows only the Zod advisory (OQ-8).                                                                                                  |
| Task routes are unauthenticated and have no ownership check | By milestone order: `authenticate` arrives in week-01, ownership in day-04/day-11 (AC-2.6, AC-2.7).                                                                                              |
| Graph doesn't contain day-02 code                           | The `PostToolUse` hook is still a no-op (day-01 retro). Run `/graphify . --update` after the commit.                                                                                             |
