# Bug debugging skill

Use this for reported defects or failing behavior.

## Process

1. Reproduce or understand the bug.
2. Identify the likely files and data flow.
3. Trace the cause before editing.
4. Make the smallest fix that addresses the root cause.
5. Check the result with the most relevant safe command or scenario.
6. Document the cause and fix.

## Rules

- Do not hide errors.
- Do not add broad retries or fallbacks unless they address the cause.
- Do not mix unrelated cleanup with the bug fix.
