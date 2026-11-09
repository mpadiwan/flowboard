---
name: pr-review
description: Rigorously verify a specific commit or PR against its own claims — read every changed line, cross-reference project specs, and actually build/test the code in an isolated worktree instead of trusting the commit message or a green CI badge.
---

**pr-review** — deep-verify a specific commit/PR by SHA or GitHub URL, and report a narrative review with a clear verdict.

## When to use

Invoke when the user asks to review a specific commit, PR, or "the dev's latest work" and gives a SHA or a GitHub commit/PR URL (`/pr-review <sha-or-url>`). This is not the same as `/code-review` — that reviews the *current* branch's uncommitted/ahead-of-base changes; this reviews one specific, already-made commit, often not on the branch currently checked out, and holds it to a higher bar: every claim in the commit message gets checked against the actual diff, and the build/tests actually get run, not assumed from a green CI badge.

## Steps

### 1 — Resolve the target

Extract the SHA from the user's input (a GitHub commit/PR URL ends in the SHA — a PR URL may need `gh pr view <n> --json commits` or the PR's own "Files changed" page to find the head SHA if the user only gave a PR number/URL). Confirm it exists locally (`git cat-file -e <sha>`); if not, `git fetch origin` and retry.

### 2 — Delegate to the pr-verifier agent

Launch the `pr-verifier` agent (Agent tool, `subagent_type: "pr-verifier"`) with the resolved SHA and any context the user gave about what this commit is supposed to fix or do (a prior gap, a ticket, a specific goal they stated). Let the agent discover repo-specific context (specs, ADRs, related docs, prior related commits) itself — do not pre-summarize it, and do not do the review yourself in the main thread.

### 3 — Output

Load the `artifact-design` skill, then build the review as a Claude Artifact and publish it — this is the primary deliverable, not an optional extra. Treat it as a utilitarian report (per artifact-design's calibration guidance): real typographic hierarchy, a considered palette, generous structure — but no flashy hero or landing-page treatment.

Structure it around what the agent actually verified, not just its prose:

- A masthead naming the repo and the compare range/PR, with the verdict as a plain, unambiguous badge (approve / send back / needs a human decision) — never buried.
- If this same commit/PR/branch has been reviewed before in this session, show the commit history and a findings ledger tracking each finding's status across rounds (open → resolved, still open, or newly found in this round). This is real, meaningful structure whenever there's more than one round — not decoration.
- The full narrative from the agent's report — what's done well, gaps ranked by severity with concrete failure scenarios, minor items, verdict. Condense formatting, not substance: every concrete claim, file path, number, and quote the agent actually verified should survive into the artifact.
- A verification-method section naming what was actually run: build/test commands, the worktree, real test counts, and any adversarial check performed against real infrastructure rather than mocks.

Give the artifact a specific title naming the actual package/feature under review (never a generic "PR Review Report"), and a favicon/icon fitting the subject.

In chat: lead with the verdict plainly — if it's "send back" or flags a high-severity finding, say so before anything else — give a short summary of the highest-severity finding(s), and hand over the artifact link. Don't also re-paste the agent's full narrative verbatim in chat once it's published as an artifact; that duplicates the deliverable instead of pointing to it.
