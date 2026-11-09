// Conventional Commits for everyday commits, plus the brief's 15 milestone tags
// (e.g. "day-01: ...", "week-01 complete: ..."), which config-conventional would reject.
// See docs/arch-docs/flowboard/adr/ADR-009-commit-convention.md.
const MILESTONE_COMMIT = /^(day-\d{2}|week-0[1-3] complete):/;

export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => MILESTONE_COMMIT.test(message)],
};
