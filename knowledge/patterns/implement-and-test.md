# Implement-and-Test Chain

How every FlowBoard feature goes from idea to milestone commit. It is the handbook's Explore → Plan → Act → Verify loop, mapped onto this repo's commands.

| Step       | Command                                                | Output                                                                    | Done when                                                                  |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Explore | `/evaluate <feature>`                                  | EVALUATE SUMMARY                                                          | You can say which ARCH section, ADR and acceptance criteria (AC-x.y) apply |
| 2. Plan    | `/plan`                                                | Numbered blueprint, files, tests to add                                   | You approved it                                                            |
| 3. Act     | `/apply`                                               | Code **and** its tests in the same change                                 | `APPLY COMPLETE` lists both                                                |
| 4. Verify  | `/validate`                                            | Issues tagged `[BLOCKER]` / `[FIX NOW]` / `[BACKLOG]`                     | No blockers or fix-nows remain                                             |
| 5. Gate    | `npm run typecheck && npm run lint` + the Jest command | All green, coverage ≥ 80%                                                 | Zero errors                                                                |
| 6. Commit  | `/commit`                                              | Milestone tag if this closes one (ADR-009), Conventional Commit otherwise | Hooks pass without `--no-verify`                                           |

## Rules of the chain

- **Tests ride with the feature.** A route without its happy-path and error-path tests is not done. Do not save tests for later.
- **Verify asks the hostile question.** For every change, ask what happens when Redis is down, when the caller doesn't own the resource, when the body has extra fields, and when the token is replayed.
- **Write down the why.** If a decision isn't already in an ADR, add one, or add a line to an existing ADR, before committing. The Security Gate asks "why", not "what".
- **Keep the context current.** When a milestone lands, tick it under "Implemented So Far" in AGENTS.md.

## Example: `day-02` task routes

1. `/evaluate typed task routes (FR-T2…T5)` → ARCH §3 C3.1–C3.2, ADR-007, AC-3.1–3.5.
2. `/plan` → `schemas/task.ts`, `routes/tasks.ts`, mount in `app.ts`, `tests/tasks.test.ts`.
3. `/apply` → handlers, schemas and tests.
4. `/validate` → strip check (`isAdmin` ignored), UUID 422, empty PATCH 422.
5. Gate → `tsc`, lint and Jest are green.
6. `/commit` → `day-02: typed task routes with Zod validation`.
