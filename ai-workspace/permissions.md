# Permissions

The agent starts inside `ai-workspace/`.

The agent is allowed to inspect files outside `ai-workspace/` when needed to understand the repo.

The agent may change directory into the real codebase only during approved stages like `01_learn`, `04_build`, and `05_review`.

The agent may edit real code only during `04_build` or when the user explicitly asks for code changes.

## Safe read-only commands

The agent may run safe read-only commands such as:

- `ls`
- `find`
- `tree`
- `cat`
- `grep`
- `rg`
- `pwd`
- `git status`

When the active AI environment provides specialized file, search, or read tools, prefer those tools over shell commands.

## Project commands

The agent may run project commands only when relevant, such as:

- `npm run dev`
- `npm run build`
- `npm run test`
- `npm run lint`
- `pnpm dev`
- `pnpm build`
- `pnpm test`
- `pnpm lint`

Prefer commands declared in the nearest `package.json` or equivalent project config.

## Destructive commands require explicit permission

The agent must not run destructive commands without explicit permission, including:

- `rm -rf`
- database reset or drop commands
- force pushes
- deleting migrations
- deleting source folders
- overwriting environment files
- rotating secrets
- changing production config

## Codebase Location

Likely code and configuration folders in this repo:

- `admin-dashboard/src/` - Node/Hono admin dashboard API and services.
- `admin-dashboard/frontend/src/` - React/Vite admin dashboard frontend.
- `admin-dashboard/db/` - database schema.
- Root files - WordPress, Nginx, PHP-FPM, Redis, and Railway deployment configuration.
- `.planning/` - existing project planning and research notes.
- `../railway-wordpress-cache/` - adjacent cache-focused WordPress deployment variant; inspect during learn/intake/review work when comparing or integrating the cache system.

Common code folders to look for in future changes:

- `app/`
- `src/`
- `server/`
- `backend/`
- `frontend/`
- `db/`
- `components/`
- `lib/`
- `pages/`
- `routes/`

This repo does not appear to use a root `app/` folder as the main code folder. The main application code appears to live under `admin-dashboard/`, with deployment/runtime configuration at the repository root.
