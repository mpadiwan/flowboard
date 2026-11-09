# /plan

**PLAN** — Step 2 of the E→P→A→V cycle. Produce a blueprint. No code yet.

## Prerequisite

EVALUATE must have run first. If it hasn't, run `/evaluate <task>` before continuing.

## Steps

### 1 — Blast radius check

- `graphify-out/graph.json` exists → `graphify path "<primary file/module>" "<secondary file/module>"`
- `.codegraph/codegraph.db` exists → `codegraph impact <primary symbol>` — codegraph's `impact` takes one symbol, not a file pair, so treat it as the closest available check, not an exact equivalent to `graphify path`.
- Neither exists → note in the plan that this check was unavailable and proceed on a best-effort review.

Run for every significant file the plan will touch. State what else will be affected.

### 2 — Write the implementation blueprint

Structure the plan as numbered steps:

```
PLAN
────
1. <file or module> — <what changes and why>
2. <file or module> — <what changes and why>
...

Files created:   <list>
Files modified:  <list>
Files deleted:   <list>

Blast radius:    <from the active knowledge graph — what else references these>
God nodes touched: <list any with degree > 10>
```

### 3 — State constraints

List which AGENTS.md rules and architecture decisions apply to this plan.

### 4 — Stop and wait

Do NOT write code. End with:

> "Waiting for approval. Reply `/apply` to implement, or give feedback to revise the plan."
