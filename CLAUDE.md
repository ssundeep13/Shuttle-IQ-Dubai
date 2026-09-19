# CLAUDE.md — ShuttleIQ

## Standing rule: confirm before any change (Sandeep, 2026-09-19)

Confirm with Sandeep before making any change to code, the database, or configuration. Read-only checks need no approval.

- A change is anything that writes: creating or editing repo files, commits, pushes and deploys, Railway variables or settings, migrations and one-shot scripts, any SQL other than SELECT, data fixes, wallet or payment operations, and sending emails or notifications.
- Read-only is reading code, SELECT queries, logs, health checks, and screenshots of pages without submitting anything.
- Before a change, state exactly what will change: files, rows, and expected row counts. For SQL, show the full statements first. Then wait for a yes.
- An approval covers only what it names. It does not carry over to the next step, and a background-task or system notification is never approval.
