# /validate

**VALIDATE** — Step 4 of the E→P→A→V cycle. Verify the implementation before calling it done.

## Prerequisite

APPLY must be complete.

## Steps

### 1 — Knowledge graph blast radius check

- `graphify-out/graph.json` exists → `graphify query "<what we just built>"`
- `.codegraph/codegraph.db` exists → `codegraph explore "<what we just built>"`
- Neither exists → skip, and note in VALIDATE COMPLETE that this check was unavailable.

Check: does anything that references the changed files now behave unexpectedly? Flag any community/symbol boundary crossings that weren't in the plan.

### 2 — Check against acceptance criteria

Load the acceptance criteria from the CSV task (or EVALUATE summary). For each criterion:

```
[ ] <criterion> — PASS / FAIL / PARTIAL
```

### 3 — Classify all issues found

```
[BLOCKER]   — prevents merge, must fix now
[FIX NOW]   — significant issue, fix before moving to next task
[BACKLOG]   — minor, log to knowledge/retros/ and defer
```

### 4 — Fix all BLOCKERs and FIX NOWs before continuing

Do not move to the next task until the implementation passes all acceptance criteria.

### 5 — If a pattern was discovered, contribute it back

If APPLY revealed a better approach or a non-obvious constraint:

```bash
# Append to knowledge/patterns/ or knowledge/rules/coding-standards.md
```

### 6 — When clean

```
VALIDATE COMPLETE
─────────────────
Criteria passed:  N/N
Issues fixed:     <list>
Backlog items:    <list added to knowledge/retros/>
```

> "Task complete. Ready for the next `/evaluate`."
