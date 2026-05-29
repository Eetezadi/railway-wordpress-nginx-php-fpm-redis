# AI workspace router

This is the main router for AI work in this repository.

The real application code stays outside `ai-workspace/`. Use this workspace for instructions, stage contracts, durable context, plans, reviews, and delivery notes.

## Stage order

1. `00_leadership` = define or update project leadership roles and decision style.
2. `01_learn` = inspect the repo and document what the agent learns.
3. `02_intake` = clarify the task and gather relevant context.
4. `03_plan` = create a plan before editing code.
5. `04_build` = implement changes in the actual codebase when approved or clearly requested.
6. `05_review` = test, check, lint, review, and compare against the plan.
7. `06_deliver` = summarize the work, save final notes, and suggest next steps.

## Routing rules

- For new projects or unclear repos, start at `01_learn`.
- For vague tasks, use `02_intake`.
- For feature work, use `03_plan` before `04_build`.
- For bugs, use `02_intake`, then `03_plan`, then `04_build`, then `05_review`.
- For cleanup or refactoring, use `03_plan` first unless the change is tiny.
- For project direction, brand, strategy, or priorities, use `00_leadership`.
- For final summaries, use `06_deliver`.

## Shared conventions

- Keep work focused on the user's request.
- Do not read the whole repo unless the task requires it.
- Prefer updating existing instructions over creating repeated one-off notes.
- Save outputs where the current stage says to save them.
- Keep markdown plain and practical.
- Do not move application code into `ai-workspace/`.

## Expansion rules

- If the agent learns something durable about the repo, write it to `_config/learned-context.md`.
- If the agent maps folders or files, update `_config/repo-map.md`.
- If the agent discovers a repeatable workflow, create or update a skill in `skills/`.
- If the agent discovers a new major work type, suggest a new stage or workspace folder, but do not add major complexity unless useful.
- Prefer improving source instructions over repeatedly fixing outputs.

## Skill usage rules

- Skills are reusable workflows in `skills/`.
- Do not load every skill by default.
- Use the skills named in the current stage contract.
- If a task clearly needs a different skill, use it and note why in the stage output.

## Permission summary

See `permissions.md` for the full policy.

Short version:

- Inspect outside `ai-workspace/` only when needed.
- Edit real code only in `04_build` or when the user explicitly asks for code changes.
- Run safe checks in `05_review`.
- Never run destructive commands without explicit permission.

## Where the real codebase appears to live

This repo appears to contain:

- Root WordPress/Railway deployment files: `Dockerfile`, `docker-entrypoint.sh`, `nginx.conf`, `default.conf.template`, `wp-config-custom.php`.
- Admin dashboard backend code: `admin-dashboard/src/`.
- Admin dashboard frontend code: `admin-dashboard/frontend/src/`.
- Database schema: `admin-dashboard/db/schema.sql`.
- Existing planning notes: `.planning/`.
- Adjacent cache-focused variant: sibling `../railway-wordpress-cache/` contains Docker/Nginx/PHP/WordPress cache-system files without the admin dashboard.
