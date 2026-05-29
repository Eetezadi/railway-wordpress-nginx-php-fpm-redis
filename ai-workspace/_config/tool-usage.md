# Tool usage

Use the tools already available to the current AI environment.

Do not assume external tools exist.

Prefer repo-native commands from `package.json` or equivalent config files when available.

Use skills from `ai-workspace/skills/` when relevant.

Stage `CONTEXT.md` files should explicitly mention which skills and tools apply.

Tool usage should be scoped to the current stage.

## Practical rules

- Use read/search tools before broad shell commands when available.
- Use package scripts instead of guessing command names.
- Use safe read-only inspection during learning and intake.
- Use build, lint, and test commands during review when they are relevant and available.
- Do not run destructive commands without explicit permission.
