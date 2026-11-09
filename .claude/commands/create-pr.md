# /create-pr

**create-pr** — generate a pull request with a well-structured, industry-standard description, then open it via `gh pr create`.

## When to use

Invoke when the user wants to open a PR for the current branch's changes (e.g. "create a PR", "open a pull request", "/create-pr"). Assumes changes are already committed on a feature branch ahead of the base branch.

## Steps

### 0 — Run code review first

Before drafting the PR, run `/code-review` (delegates to the `code-reviewer` agent) against the branch's changes.

- If the review reports `blocked: true` (a `critical` finding) or any `high` severity findings, stop and show them to the user — ask whether to fix them now, before opening the PR, or proceed anyway.
- If the review comes back clean (no critical/high findings), continue to Step 1 and mention in your summary that the review passed.
- Do not silently skip this step, and do not open the PR while unresolved critical findings stand unless the user explicitly says to proceed anyway.

### 1 — Gather context

Run in parallel:
- `git status` — check for uncommitted changes (warn the user; PR should reflect committed work only).
- `git branch --show-current` and confirm the base branch (usually `main` or `master`; check if the current branch tracks a remote and whether it's up to date).
- `git log <base>..HEAD` — full commit history for this branch, not just the latest commit.
- `git diff <base>...HEAD` — full diff of everything the PR will include.

Read every commit and the full diff before drafting anything — don't summarize from the latest commit alone.

### 2 — Draft the PR

Use this structure, adapted to the change (omit sections that don't apply — e.g. no "Breaking Changes" section if there are none):

```markdown
## Summary
1-3 bullet points on *why* this change exists and what it does, not a line-by-line diff recap.

## Changes
- Bulleted list of notable changes, grouped logically if the diff spans multiple concerns.

## Test plan
- [ ] Checklist of how this was/should be verified (tests run, manual QA steps, screenshots for UI).

## Breaking changes
Only include if applicable — what breaks and the migration path.

## Related issues
Link tickets/issues if referenced in commits or branch name (e.g. `Closes #123`).
```

Rules:
- Title: imperative mood, under 70 characters (e.g. "Add retry logic to webhook delivery", not "Added" or "Adds").
- Body focuses on *why*, not a restatement of the diff.
- Do not fabricate a test plan — only list verification that was actually described or run in this conversation; otherwise leave the checklist unchecked with concrete steps the reviewer should take.
- Never commit files that look like secrets (`.env`, credentials, keys).

### 3 — Push and open the PR

- If the branch has unpushed commits or isn't tracking a remote, push it (`git push -u origin <branch>`) — confirm with the user first if this is the first push of the branch.
- Create the PR with `gh pr create --title "..." --body "$(cat <<'EOF' ... EOF)"` using a heredoc for the body.
- Do not use `--no-verify` or bypass any configured PR checks.

### 4 — Output

Report the PR URL returned by `gh pr create`. Do not take further action (merging, requesting reviewers) unless explicitly asked.
