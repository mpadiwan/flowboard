# /apply

**APPLY** — Step 3 of the E→P→A→V cycle. Implement the approved plan.

## Prerequisite

A plan must be approved. If `/plan` has not run and been approved, stop and ask.

## Steps

### 1 — Implement exactly what the plan says

- Follow the numbered steps from PLAN in order.
- Reference AGENTS.md coding standards for every file written.
- Do not add features, refactor unrelated code, or expand scope beyond the plan.

### 2 — The knowledge graph stays current automatically

- graphify: the `PostToolUse` hook runs `graphify update .` after every file edit — no manual step needed.
- codegraph: its own background sync daemon watches the project and updates on every file change — also no manual step needed, and nexus does not scaffold a hook for it.

Either way, the graph stays current as you write.

### 3 — Stay in scope

If you discover something unexpected that requires scope change:
- Stop implementing.
- Flag it: "Discovered: <X>. This is outside the plan scope. Revise plan before continuing?"
- Wait for direction.

### 4 — When done

State:
```
APPLY COMPLETE
──────────────
Created:   <files>
Modified:  <files>
Skipped:   <anything intentionally deferred>
```

Then prompt:

> "Ready to /validate. Type `/validate` to check against acceptance criteria."
