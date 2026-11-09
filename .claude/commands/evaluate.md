# /evaluate

**EVALUATE** — Step 1 of the E→P→A→V cycle. Orient fully before writing any plan or code.

## Arguments

`/evaluate <task description, CSV path, or feature name>`

## Steps

### 1 — Orient with your knowledge graph (if one exists)

Check which backend this project has built, and use the matching query:

- `graphify-out/graph.json` exists → `graphify query "<task context from args>"`
- `.codegraph/codegraph.db` exists → `codegraph explore "<task context from args>"`
- If both exist, graphify is used by default — set `NEXUS_GRAPH_BACKEND=codegraph` to prefer codegraph instead (`nexus doctor` shows which is active).
- Neither exists → suggest `/graphify .` (or `codegraph init`) then continue without it.

Note which communities/symbols and high-degree nodes are in the blast radius.

### 2 — Load context in priority order

1. **CSV task** — if `docs/dev-tasks/` exists, load the matching row. Fields `user_story`, `description`, `acceptance_criteria`, `dependencies` are the context.
2. **AGENTS.md** — load coding standards from project root if present.
3. **Architecture doc** — scan `docs/arch-docs/` for the relevant section.
4. **knowledge/** — check `knowledge/rules/`, `knowledge/patterns/`, `knowledge/prompts/dev/` for prior patterns.

### 3 — Output this summary, nothing else

```
EVALUATE SUMMARY
────────────────
Task:        <what we are building>
Touches:     <files / modules / graph communities or symbols>
Depends on:  <what must already exist>
Constraints: <from AGENTS.md, arch doc, acceptance criteria>
Risk:        <god nodes or high-degree nodes in blast radius>
```

### 4 — Stop

Do NOT plan. Do NOT write code. End with:

> "Ready to /plan. Type `/plan` when you want the implementation blueprint."
