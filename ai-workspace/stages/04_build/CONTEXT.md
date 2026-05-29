# 04_build stage

## Purpose

Implement the planned work in the real codebase.

## Inputs

- `output/plan.md`
- `_config/coding-standards.md`
- `permissions.md`
- relevant source files

## Process

- Leave `ai-workspace/` only as needed to edit the real codebase.
- Make focused changes.
- Follow existing project patterns.
- Do not touch unrelated files.
- Update learned context if a durable pattern is discovered.

## Outputs

- Real code changes in the repo
- `output/build-summary.md`
- Updated `_config/learned-context.md` if needed

## Allowed tools

- File read/search tools for the listed inputs.
- Markdown editing tools for stage outputs and workspace docs.
- Safe project commands only when the stage process calls for them.
- No destructive commands without explicit permission.


## Skills to use

- `feature-build.md`
- `code-refactor.md`
- `bug-debugging.md`

## Done criteria

- The requested change is implemented with minimal unrelated changes.
