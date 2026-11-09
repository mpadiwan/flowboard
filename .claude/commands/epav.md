# /epav

**E→P→A→V** — Full cycle orchestrator. Runs all four steps in sequence with a gate before APPLY.

## Usage

`/epav <task description, CSV path, or feature name>`

## Cycle

```
EVALUATE → PLAN → [approval gate] → APPLY → VALIDATE
```

## Steps

### Step 1 — EVALUATE

Follow the `/evaluate` skill exactly. Output the EVALUATE SUMMARY.

### Step 2 — PLAN

Follow the `/plan` skill exactly. Output the blueprint with blast radius.

**GATE: Stop here. Do not proceed to APPLY until the user explicitly approves.**

Say:
> "Plan ready. Reply **go** or `/apply` to implement, or give feedback to revise."

### Step 3 — APPLY (only after approval)

Follow the `/apply` skill exactly. Implement the plan step by step.

The active knowledge graph backend (graphify or codegraph) stays current automatically — via the PostToolUse hook for graphify, or codegraph's own sync daemon.

### Step 4 — VALIDATE

Follow the `/validate` skill exactly. Check all acceptance criteria, fix all BLOCKERs and FIX NOWs, contribute patterns back to knowledge/.

## Abort at any step

If the user says "stop", "abort", or "cancel" at any point — stop immediately and summarize what was completed and what was not.

## Scope discipline

The EPAV cycle covers **one task at a time**. If additional work surfaces during APPLY, log it to `knowledge/retros/` and finish the current task first.
