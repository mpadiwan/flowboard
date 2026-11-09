# /dev-tasks-planner

Generates (or updates) `docs/dev-tasks/*.csv` files for a module/epic from its architecture doc + ADRs, holding every task to the accuracy bar described below. Use this instead of hand-writing dev-tasks CSVs from scratch — the format, the accuracy rules, and the required per-row content below are each easy to silently skip if you're not deliberately checking for them.

Follows the same EVALUATE → PLAN → APPLY → VALIDATE cycle as `/evaluate` `/plan` `/apply` `/validate`, self-contained in this one command (the same shape `/scaffold` uses) since CSV generation is one continuous task, not four separately-invoked ones. **Stop at the end of EVALUATE and PLAN and wait for explicit approval before continuing** — do not run straight through to APPLY.

## Arguments

`/dev-tasks-planner <module> based on <arch-doc-path>`

Example: `/dev-tasks-planner billing based on docs/arch-docs/billing/`

It can also be pointed at existing CSVs to re-evaluate/correct them (as opposed to generating new ones from a blank slate) — e.g. `/dev-tasks-planner re-evaluate docs/dev-tasks/billing/*.csv against docs/arch-docs/billing/`. The EVALUATE/PLAN/APPLY/VALIDATE shape is the same either way; APPLY edits existing rows instead of writing a new file.

## Prerequisites — MANDATORY, check before doing anything else

Both of the following must be true before this command does any real work. Verify each with an actual check (`ls`/`find`, not an assumption) — do not skip straight to EVALUATE on the assumption they're probably fine.

1. **The module's ARCH doc (+ per-epic ADR files, if any) exist under `docs/arch-docs/<module>/`.** Without a real spec to generate tasks from, there is nothing to reconcile against — a CSV built from no source is fabrication, not planning, no matter how well-formatted it looks.
2. **The module's boilerplate/scaffold already exists in the repo** (e.g. `<module>/web/`, `<module>/api/` with real files, not empty directories) **— produced by `/scaffold`, not by this command.** `/dev-tasks-planner` reconciles CSV rows against real code (Step 3 of PLAN, "STATUS must reflect actual repo state"); if no code exists at all yet, every row would trivially be `To Do` with nothing to verify, which defeats the entire STATUS-accuracy discipline this command exists to enforce. This command **generates task lists, it does not bootstrap a module** — `/scaffold` is Day 0, this is what comes after.

**If either is missing, STOP immediately and warn — do not proceed to EVALUATE, do not generate a CSV against a doc-only or code-only module, and do not silently substitute one for the other.** State plainly which one is missing and what to do about it:

```
⚠ /dev-tasks-planner cannot run for <module> yet.

Missing: <"ARCH doc / ADRs under docs/arch-docs/<module>/" and/or "scaffolded code under <module>/web, <module>/api">

<module> needs <the missing piece(s)> before dev-tasks-planner has anything to plan against or
reconcile STATUS with. Run <the specific missing step — e.g. "the architecture-authoring process
for this module" and/or "/scaffold <module> based on docs/arch-docs/<module>/ and docs/designs/<module>/">
first, then re-run /dev-tasks-planner.
```

Only once both checks pass — confirmed by actually looking, not inferred from the module being named in conversation — continue to EVALUATE below.

---

## EVALUATE — Read the source material and the real repo state

Read the ARCH doc's own Component Breakdown section (usually §3) end to end, and every per-epic ADR file completely — not a grep for keywords. Each epic maps to one output CSV; each component in the breakdown maps to roughly one task row. Also check:

- `knowledge/prompts/dev/` for existing "wire real X" templates (e.g. `wire-real-auth.md`) — match their acceptance-criteria style for any "Day 1: wire real X" task you write, don't invent a different shape.
- Every sibling module's own `docs/dev-tasks/<module>/*.csv` for the closest precedent to copy conventions from — check header rows directly with `head -1` across a few files rather than assuming they all match. Column count and casing can drift between an older module's CSVs and a newer one in the same repo; prefer whichever convention is more recently updated over the oldest file you find.
- If CSVs already exist for this module, read them in full (`csv.DictReader`, not `head`/`cat` guessing at columns) — this is the "before" state PLAN will diff against.

**Then verify the real repo state component-by-component** — this is the input PLAN's STATUS decisions depend on, so do it here, not later:

- `grep`/`find`/`Read` the actual files each component would live in. A filename-only search (`find -iname "*device*"`) is not sufficient proof of absence — a feature's code can live inside a differently-named sibling file. Also `grep -rn -i "<feature-keyword>"` across the app's component directory for the literal domain terms before concluding something isn't built.
- Where a component appears built, check whether it's *fully* wired, not just visually present — a button can exist with a no-op `onClick={() => {}}`, or a filter control that renders but doesn't actually filter. Read the actual handler, don't infer completeness from the UI alone.
- If a component needs a live DB, live Redis, or another app's not-yet-built API, confirm the blocker is real by checking the other app's own code/README, not by assuming from the ARCH doc alone.
- Boot the app if you're not sure — a live `curl` against a running dev server is more trustworthy than reading source and guessing whether it's wired end-to-end.
- Note any ADR that looks stale against a platform-wide correction elsewhere (e.g. a design a sibling module's own ADR "Corrections" section has already superseded) — flag it as a doc-staleness gap for PLAN to caveat, not something to silently "fix" by ignoring the ADR's literal text.

### Output — EVALUATE SUMMARY

```
EVALUATE SUMMARY
────────────────
Module:       <module>
Epics/CSVs:   <one line per epic → output filename>
Repo state:   <per-component: file(s) found, built/partial/absent, wired/stub/no-op — the evidence, not conclusions>
Doc gaps:     <stale ADRs, unresolved Open Questions, contradictions found>
Constraints:  <schema/format precedents found in sibling CSVs>
```

Do NOT plan row content or write any CSV yet. End with:

> "Ready to plan. Reply to proceed with PLAN, or give feedback to redo EVALUATE."

---

## PLAN — Decide every row's content against these rules

Using the repo-state evidence from EVALUATE, plan the exact row-by-row content. Every rule below is mandatory — each addresses a real way dev-tasks CSVs go stale or misleading, and is easy to silently skip if you're not deliberately checking for it.

### File structure and exact schema

One CSV per epic, one folder per module: `docs/dev-tasks/<module>/<epic-slug>-tasks.csv` (e.g. `docs/dev-tasks/billing/invoice-export-tasks.csv`). The module is the folder, not a filename prefix — don't repeat it in the filename (`docs/dev-tasks/billing/invoice-export-tasks.csv`, never `docs/dev-tasks/billing/billing-invoice-export-tasks.csv`). The header below is a common baseline — verify it against this repo's own existing CSVs with `head -1` on a few files rather than assuming it applies universally, and adopt the repo's real convention if it differs:

```
TASK_ID,ISSUE_TYPE,SUMMARY,USER_STORY,DESCRIPTION,ACCEPTANCE_CRITERIA,PRIORITY,ESTIMATE,STORY_POINTS,ROLE,ASSIGNEE,STATUS,LABELS,EPIC_LINK,DEPENDENCIES,BE ESTIMATE,BE - ACTUAL EFFORT,FE ESTIMATE,FE - ACTUAL EFFORT,QA ESTIMATE
```

- First row: `EPIC-<NAME>`, `ISSUE_TYPE=Epic`, empty `EPIC_LINK`, summarizing the whole epic and its overall completion state (`In Progress` if any sub-task is `Done` while others aren't — don't leave the epic row `To Do` once real work exists under it).
- One row per component/story after that, `ISSUE_TYPE=Task`, `EPIC_LINK=EPIC-<NAME>`.
- `ROLE`: `Backend` / `Frontend` / `Fullstack`.
- `STATUS`: exactly one of `Done` / `To Do` / `Blocked` / `In Progress` — verified as the actual allowed set by reading existing files, not assumed.
- `LABELS`: comma-tag convention, no spaces — `backend,<epic-slug>,<module>-app[,blocked][,export][,rbac]`, `frontend,ui,<epic-slug>,<module>-app`, `testing,...`. Check an existing file's actual `LABELS` values before inventing a new tag shape.
- `DEPENDENCIES`: `TASK-XXX` (comma-separated for multiple), referencing task IDs within the same file, or `EPIC-<NAME>` from another file for cross-epic deps.

### STATUS must reflect actual repo state, not the ARCH doc in the abstract

**This is the single most important rule and the easiest one to get wrong.** A CSV generated once and never reconciled against the code that moved past it will list already-built work as "Not started." A future `/evaluate` trusts the CSV's STATUS column at face value — a wrong status there doesn't just look bad, it causes real work to be replanned or real gaps to be missed.

Use the EVALUATE-stage evidence directly:
- Found and complete → `Done`. Don't default to `To Do` just because that's the ARCH doc's implied starting point.
- Found but only partially wired (e.g. a no-op button, filters that render but don't filter) → `In Progress`, with the exact code evidence cited — never round this up to `Done`.
- Needs a live DB, live Redis, or another app's not-yet-built API → `Blocked`, only once the blocker was verified real in EVALUATE.
- Genuinely nothing started and nothing blocks it → `To Do`.

### Every `Blocked` row cites the exact reason and states the fallback

Two things every `Blocked` row's `DESCRIPTION` must contain, not just one:

1. **The exact ADR/ARCH-doc Open Question number** it's blocked on (e.g. "BLOCKED — Open Question #22"), never a vague "pending" or "TBD." Check whether existing CSVs in this repo already have a convention for citing this, and match it if so.
2. **An explicit `**Fallback:**` sentence** stating what actually happens in the meantime — not what it's waiting on (that's #1), but the interim behavior. Most of the time this is already true in the code and just needs stating: "the mock data continues to serve the UI," "the stub service returns non-persisted success," "no enforcement exists yet, a known accepted Day-0 gap." Occasionally there's genuinely no fallback (e.g. a Submit button that currently no-ops, or a blocker so early nothing is exposed yet) — say that plainly rather than implying one exists. Never leave a `Blocked` row silent on this.

### Every `Done` row states its own Day-1 forward path

A `Done` row describes Day-0 mock/UI work. Its `DESCRIPTION` must also say, explicitly, one of:
- **What swaps in on Day 1** and where — name the mock generator function and the task that replaces it (e.g. "swap `genInvoiceId()` for a real server-side query response in the identical row shape — see TASK-003"), so the swap-in point doesn't need rediscovering later.
- **That nothing swaps** — some Day-0 work (a shared UI shell, a client-side-only interaction, an already-real integration like real SSO wiring) is permanent, not a placeholder. Say so directly ("no swap needed — this is permanent UI, not a mock") rather than leaving it ambiguous whether it's temporary.

`Blocked` and `To Do` rows don't need a separate Day-1 note — they already describe Day-1 work directly by definition; adding a redundant pointer to them is noise, not signal. `In Progress` rows don't get a Day-1 note either — state what's missing to reach Done instead.

### Every task cites the project's own established patterns by name, not generic prose

Many projects have a dominant cross-cutting pattern for splitting Day-0 mock work from Day-1 real integration — commonly an **interface-abstraction-for-a-blocked-dependency** shape, where an ADR calls for building a named internal service/interface now (stubbed today, swapped to the real integration later — e.g. a `PermissionService`, `OrderService`, or similar named shape). Discover whatever this project's actual pattern is (grep ADRs and existing code for named services/interfaces) before writing tasks, and when a task touches it, the row must:
- Name the exact interface/file the ADR calls for.
- **Check whether it was actually built** — don't assume the abstraction exists just because the ADR says to build it. A Day-0 build can bypass a called-for abstraction entirely and call mock data directly instead; if that happened, the missing abstraction is its own `To Do` task, not folded silently into the "wire the real API" task.
- If the module has no backend feature modules at all yet (a Day-0/FE-only build), this pattern may genuinely not apply — say so rather than forcing a citation onto a gap that isn't actually a bypassed abstraction.

Same rule for shared UI components — name the actual component this project already has (its own shared table/list-screen component, whatever it's called) and say "extend/reuse X," never "build a new one" — and for any mock-data-mirrors-real-shape convention already in place (generator functions named so they can be swapped in place, preserving the row shape, not rewritten).

### Output — PLAN blueprint

```
PLAN
────
Files:  <filename> — <row count, new vs. corrected, epic status>
        ...

Per-file row plan (for each changed/new row):
  <TASK_ID> — STATUS: <value> — <one-line reason citing the EVALUATE evidence>

Constraints applied: <schema precedent, pattern citations, ADR-staleness caveats from EVALUATE>
```

Output as a blueprint. No CSV writes yet. End with:

> "Waiting for approval. Reply to apply, or give feedback to revise the plan."

---

## APPLY — Generate the CSV(s) programmatically

**Never hand-type the CSV.** `DESCRIPTION`/`ACCEPTANCE_CRITERIA` cells routinely contain commas, quotes, and multi-line bulleted lists — hand-writing CSV text with that much embedded punctuation reliably produces silent quoting bugs.

- Write a small Python script using `csv.DictWriter` (new file) or `csv.DictReader`+`csv.DictWriter` (correcting an existing file) with the rows/overrides as data (dicts).
- Write with plain `encoding='utf-8'` (no BOM) even if the source file being corrected has one (`encoding='utf-8-sig'` on read handles that transparently) — a UTF-8 BOM can silently break a plain `open(..., encoding='utf-8')` parse.
- Run the script, then delete it — keep only the CSV output.
- Follow exactly what PLAN decided. If verification during APPLY turns up something PLAN didn't anticipate (e.g. a row's real code state differs from what EVALUATE found), stop, flag it, and confirm before deviating — the same "stay in scope" discipline `/apply` uses generally. A deeper verification that corrects PLAN's own STATUS call for a row (not a scope change, just PLAN being wrong) can proceed as part of finishing the row-accuracy work PLAN already authorized — but say so explicitly in the report rather than silently overriding what was planned.

### Output — APPLY COMPLETE

```
APPLY COMPLETE
──────────────
Created:   <new files>
Modified:  <corrected files, rows touched per file>
Skipped:   <anything intentionally deferred>
```

Then prompt to continue to VALIDATE.

---

## VALIDATE — Structurally re-validate before calling it done

Don't rely on eyeballing the rendered output. Write (and run, then delete) a short validation script that checks, as data, across every file touched:

- Header matches the exact expected schema.
- Every row has the exact expected column count.
- Every `STATUS` value is one of the four allowed values.
- Every `Blocked` row contains `**Fallback:**`.
- Every `Done` row (`ISSUE_TYPE=Task`) contains `Day 1` or `Day-1`.
- No BOM at the start of the file.

Run it against **every row in the file**, not just the rows this pass touched — a prior pass may have left pre-existing rows non-compliant that this pass alone wouldn't otherwise catch. Fix anything the check finds, then re-run until clean.

If a genuinely new pattern or non-obvious constraint was discovered during this run (e.g. a search-methodology gap, a new ADR-staleness case), append it to `knowledge/retros/` the same way `/validate` does generally.

### Output — VALIDATE COMPLETE

```
VALIDATE COMPLETE
─────────────────
Files validated:  <list>
Rows checked:     <total>
Checks passed:    header / column-count / STATUS-enum / Fallback / Day-1 / no-BOM
Issues fixed:     <list, if any>
Backlog items:    <retro file added, if any>
```

> "Task complete."
