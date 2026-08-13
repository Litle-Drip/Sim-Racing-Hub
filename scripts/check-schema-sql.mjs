#!/usr/bin/env node
// Guards against the failure that took the app down on 2026-08-13: a column
// added to the drizzle schema and merged without the matching DDL ever
// reaching Postgres.
//
// It is not enough to fail when someone "forgot to touch a SQL file".
// drizzle-orm builds every SELECT with an explicit column list, never
// `SELECT *`, so a column that exists in the schema but not in the database
// breaks every query against that table — reads included, not just the
// writes that use the new column. The whole app stops loading. So this
// checks the thing that actually matters: every column in the schema is
// either part of the pre-existing baseline or appears in a committed SQL
// file that will add it.
//
// Usage:
//   node scripts/check-schema-sql.mjs                  # check (exit 1 on failure)
//   node scripts/check-schema-sql.mjs --write-baseline # re-record the baseline
//
// Re-record the baseline only when the production database has been brought
// in line by some route other than a file in lib/db/sql (a manual
// `drizzle-kit push`, say). Doing it to silence a failure just recreates
// the outage this exists to prevent.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = join(repoRoot, "lib/db/src/schema/index.ts");
const SQL_DIR = join(repoRoot, "lib/db/sql");
const BASELINE = join(SQL_DIR, "baseline-columns.txt");

// Drizzle column builders take the database column name as their first
// argument: integer("total_laps"), jsonb("laps"), text("id") and so on.
const COLUMN_CALL = /\b(?:text|integer|boolean|real|doublePrecision|numeric|timestamp|date|time|jsonb|json|uuid|serial|bigint|bigserial|smallint|varchar|char)\s*\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g;
const TABLE_START = /pgTable\s*\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*,\s*\{/g;

// Walks from the opening brace of a pgTable's column object to its match,
// so columns are attributed to the right table and anything after the
// object (indexes, constraints) is not mistaken for a column.
function columnBlock(source, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(openBraceIndex, i + 1);
    }
  }
  return source.slice(openBraceIndex);
}

function schemaColumns() {
  const src = readFileSync(SCHEMA, "utf8");
  const found = new Set();
  for (const match of src.matchAll(TABLE_START)) {
    const table = match[1];
    const block = columnBlock(src, match.index + match[0].length - 1);
    for (const col of block.matchAll(COLUMN_CALL)) {
      found.add(`${table}.${col[1]}`);
    }
  }
  return found;
}

function sqlText() {
  if (!existsSync(SQL_DIR)) return "";
  return readdirSync(SQL_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(SQL_DIR, f), "utf8"))
    .join("\n")
    .toLowerCase();
}

function baselineColumns() {
  if (!existsSync(BASELINE)) return new Set();
  return new Set(
    readFileSync(BASELINE, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );
}

const columns = schemaColumns();

if (process.argv.includes("--write-baseline")) {
  const header = [
    "# Columns already present in the production database before the",
    "# schema/SQL check existed — created by `drizzle-kit push` rather than",
    "# by a file in this directory. Anything NOT listed here must appear in",
    "# a committed .sql file. Regenerate with:",
    "#   node scripts/check-schema-sql.mjs --write-baseline",
    "",
  ].join("\n");
  writeFileSync(BASELINE, header + [...columns].sort().join("\n") + "\n");
  console.log(`Recorded ${columns.size} baseline columns to ${BASELINE}`);
  process.exit(0);
}

const baseline = baselineColumns();
const sql = sqlText();

const uncovered = [...columns].filter((qualified) => {
  if (baseline.has(qualified)) return false;
  const column = qualified.split(".")[1];
  // A committed SQL file mentioning the column name is taken as covering
  // it. Deliberately loose — matching exact DDL would break on every
  // reasonable way of writing the statement, and the failure this guards
  // against is a column no SQL file mentions at all.
  return !new RegExp(`\\b${column}\\b`).test(sql);
});

if (uncovered.length > 0) {
  console.error("Schema columns with no SQL to create them:\n");
  for (const c of uncovered.sort()) console.error(`  ${c}`);
  console.error(`
These exist in lib/db/src/schema/index.ts but in neither the baseline nor
any file in lib/db/sql/.

This repo has no migration runner — schema reaches production via
\`drizzle-kit push\`, run by hand. Merging a column without the matching DDL
does not degrade gracefully: drizzle names every column explicitly in its
SELECTs, so the database rejects every query against the table and the app
stops loading entirely.

Add a .sql file under lib/db/sql/ with the ALTER TABLE, and run it against
the database when this deploys. See
lib/db/sql/2026-08-13-add-lap-telemetry-columns.sql for the shape.
`);
  process.exit(1);
}

console.log(`Schema/SQL check passed — ${columns.size} columns, all accounted for.`);
