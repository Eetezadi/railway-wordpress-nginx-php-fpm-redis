# Coding standards

## General standards

- Keep changes small and focused.
- Prefer readable code over clever code.
- Do not create unnecessary abstractions.
- Follow the repo's existing patterns.
- Do not change unrelated files.
- Document important decisions.
- Fix problems at their source instead of hiding symptoms.
- Keep configuration changes explicit and easy to review.

## JavaScript and TypeScript

- Preserve existing module style.
- Keep functions focused.
- Avoid broad rewrites unless requested.
- Preserve types in TypeScript projects and avoid `any` unless justified.

## React

- Keep components focused.
- Split large logic into hooks or helpers when useful.
- Follow existing routing, state, and styling patterns.
- Avoid changing UI behavior outside the requested scope.

## Deployment and infrastructure

- Treat Docker, Nginx, WordPress, Railway, database, and environment configuration as high-risk.
- Do not change production-facing configuration without a clear reason.
- Never overwrite environment files or secrets.
