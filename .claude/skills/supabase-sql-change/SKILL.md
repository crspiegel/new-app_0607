---
name: supabase-sql-change
description: Procedure for any change to this project's Supabase SQL (supabase/migration.sql, supabase/lms/*.sql, RPCs, RLS policies, grants). Use before writing or editing SQL for the LMS or any table/function/policy. Covers local verification with PGlite and the rule that the live DB is changed only by the user in the SQL Editor.
---

# Supabase SQL change (this repo)

The live database is **never** touched by Claude. The user runs SQL in the Supabase SQL Editor.

## Steps

1. Read `NOTES.md` "LMS SQL 1차 (Phase 3A)" and "Auth, grades & Supabase" gotchas first.
2. Write SQL **add-only and re-run safe**: `create … if not exists`, `create or replace function`,
   `drop policy if exists` + `create policy`, `add column if not exists`. Keep old columns/RPCs until the
   PM-approved removal step.
3. Every SECURITY DEFINER function gets `set search_path = public, extensions` (pgcrypto lives in
   `extensions`). Grants are explicit — `revoke … from public, anon, authenticated`, then grant only
   what is needed. Functions used inside RLS policies need EXECUTE for the querying role; functions
   inside index expressions need EXECUTE for the writing role.
4. Never raise for an expected login failure (it rolls back the failure counter). Never print a
   password, hash or token in any result.
5. Test first in `tests/lms-sql.spec.js` (PGlite + Supabase shim), then run `npm.cmd run test:sql`.
   Migration must pass twice in a row (idempotent).
6. Read-only checks and verification scripts output **one result table** (the SQL Editor shows only the
   last one). Verification undoes everything (sub-transaction + sentinel exception + outer
   `begin … rollback`) and ends with a trace row proving zero leftovers.
7. Update `supabase/lms/README.md` with the run order and expected values, then hand the user
   copy-paste instructions. Client code that calls new RPCs ships only after the user confirms the SQL ran.
