---
name: code-review
description: Use proactively after code changes to review code quality, catch bugs, enforce best practices, and improve maintainability.
---

**code-review** — run a read-only review of the current code changes and report findings.

## When to use

Invoke after making code changes, or whenever the user asks for a code review (`/code-review`). Also trigger proactively right after a non-trivial edit/implementation, without waiting to be asked.

## Steps

### 1 — Scope the review

Default scope is "what changed": uncommitted/staged changes plus any commits ahead of the base branch. If the user names specific files, paths, or asks for a full-codebase review, pass that as the scope instead.

### 2 — Delegate to the code-reviewer agent

Launch the `code-reviewer` agent (Agent tool, `subagent_type: "code-reviewer"`) with a prompt stating the scope from Step 1 and any focus areas the user mentioned (e.g. "focus on the auth changes"). The agent discovers repo context itself, reviews read-only, and reports findings via `ReportFindings` — do not ask it to edit code. If the `ReportFindings` tool isn't available (non-Claude Code tools), the agent prints the findings as a numbered list instead.

### 3 — Output

Relay the agent's `## Repo Context` block and its reported findings to the user. Do not add findings of your own that the agent didn't verify, and do not silently drop findings it reported.
