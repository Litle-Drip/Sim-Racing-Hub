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

Any column added to the schema gets **both**:

1. A `.sql` file in this directory containing the DDL that creates it.
2. The same DDL appended to `MIGRATE_SQL` in
   `artifacts/api-server/src/index.ts`, which runs on every boot.

The second half exists because the first half alone failed twice — on
2026-08-13 and again on 2026-09-12, both times taking the whole app down. A
file in this directory is a record of intent, not a mechanism: it only reaches
Postgres if a person remembers to run it at the right moment in a deploy. The
boot block is the mechanism. It applies itself when Render starts the API, and
every statement in it is idempotent, so it costs nothing against a database
that is already correct.

The boot block had drifted 31 columns and 5 tables behind this directory by
2026-09-12, which is what made the second outage possible. Keep them in step.

It applies statements **one at a time**, deliberately: node-postgres sends a
multi-statement string as a single implicit transaction, so one failing
statement rolls back every other statement in the batch — including ones that
had already succeeded. A migration that silently undoes itself and logs a
warning is worse than no migration at all.

CI enforces the `.sql` file —
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

With the DDL in `MIGRATE_SQL`, a deploy applies it itself — the API runs the
block before it serves a request, so a normal push to `main` needs no manual
step.

Running it by hand is still the faster path when something is already broken,
or when you would rather not wait for a deploy. Either `pnpm --filter
@workspace/db push` (drizzle diffs the whole schema and applies what's
missing) or paste the `.sql` file into the database console (no full-schema
diff, so no surprises from unrelated drift).

If you skip the boot block and rely on running it by hand, do it **before or
alongside** the deploy, never after — the window in between is an outage, not
a delay.

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
