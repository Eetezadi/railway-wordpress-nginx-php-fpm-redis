# Claude entry point

This repository uses `ai-workspace/` as the AI control center.

When working in this repo, Claude should:

1. Read `ai-workspace/CONTEXT.md` first.
2. Use the numbered stages in `ai-workspace/stages/`.
3. Avoid reading the whole repository by default.
4. Inspect only the files needed for the current task.
5. Use `ai-workspace/permissions.md` to decide when it is allowed to inspect, edit, test, or review the real codebase.
6. Use `ai-workspace/skills/` only when a stage or task calls for them.
7. Save durable notes, plans, reviews, and summaries back into `ai-workspace/`.

The application code stays outside `ai-workspace/`. Do not move source files into this folder.

Claude may inspect or modify real code only when allowed by the current stage and by `permissions.md`.
