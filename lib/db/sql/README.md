# Schema SQL

This project has no migration runner. The database schema is defined in
`lib/db/src/schema/index.ts` and reaches Postgres through a hand-run
`pnpm --filter @workspace/db push`.

That leaves a gap: a column can be merged, deployed, and never actually
created. It does not degrade gracefully. drizzle-orm builds every `SELECT`
with an explicit column list — never `SELECT *` — so one missing column
makes Postgres reject *every* query against that table. Reads included. The
app stops loading entirely, not just the feature that uses the new column.
That is what happened on 2026-08-13 (PR #117).

## The convention

Any column added to the schema gets a `.sql` file in this directory
containing the DDL that creates it. CI enforces it —
`.github/workflows/schema-sql-check.yml` runs `scripts/check-schema-sql.mjs`
on every PR and fails when a schema column appears in neither
`baseline-columns.txt` nor any file here.

Run it yourself any time:

```
pnpm run check:schema-sql
```

## Writing one

Name the file `YYYY-MM-DD-what-it-does.sql`. Make it idempotent
(`ADD COLUMN IF NOT EXISTS`) so re-running is harmless, and prefer nullable
columns with no default — Postgres adds those as a catalog-only change, with
no table rewrite and no meaningful lock. `2026-08-13-add-lap-telemetry-columns.sql`
is a worked example.

## Deploying

Run the SQL **before or alongside** the deploy that ships the schema change,
never after. Either `pnpm --filter @workspace/db push` (drizzle diffs the
whole schema and applies what's missing) or paste the `.sql` file into the
database console (no full-schema diff, so no surprises from unrelated
drift).

## baseline-columns.txt

Columns that predate this convention, created by `drizzle-kit push` when no
SQL file was written. They are exempt from the check.

Regenerate only when production has been brought in line by some route other
than a file here:

```
node scripts/check-schema-sql.mjs --write-baseline
```

Re-recording the baseline to silence a failing check just recreates the
outage the check exists to prevent — write the SQL instead.
