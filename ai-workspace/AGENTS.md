# Agent operating guide

This repository has a project-local AI workspace at `ai-workspace/`.

Use this folder as the control center for Codex, Cursor, Windsurf, Claude, and other coding agents.

## How to work

1. Start with `ai-workspace/CONTEXT.md`.
2. Pick the correct numbered stage under `ai-workspace/stages/`.
3. Read that stage's `CONTEXT.md`.
4. Use only the skills listed for that stage unless the task clearly needs another one.
5. Save outputs in the current stage's `output/` folder.
6. Save durable cross-task facts in `_config/learned-context.md`.
7. Update `_config/repo-map.md` when repo structure knowledge changes.

## Stage contracts

Each stage defines:

- Purpose
- Inputs
- Process
- Outputs
- Allowed tools
- Skills to use
- Done criteria

Do not skip planning for feature work, bugs, or refactors unless the change is tiny and safe.

## Real codebase access

The real application code remains outside `ai-workspace/`.

Agents may leave `ai-workspace/` only when a stage requires inspection, editing, testing, or review of the real codebase. Follow `permissions.md`.

## Outputs

Use stage-local output files for work in progress, such as:

- `stages/02_intake/output/intake.md`
- `stages/03_plan/output/plan.md`
- `stages/04_build/output/build-summary.md`
- `stages/05_review/output/review.md`
- `stages/06_deliver/output/final-summary.md`

Use `outputs/` for cross-stage or latest summaries.

## Learning

When the agent learns something reusable, update the source instruction or memory file instead of repeating the same note in every output.
