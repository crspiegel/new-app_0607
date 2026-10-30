-- ============================================================================
-- LMS Phase 3A — fix-create-member-overload.sql  (drops ONE live-only function)
-- ----------------------------------------------------------------------------
-- The live project has a second public.create_member that is in no file or
-- commit of this repo: create_member(text, text, smallint, text, jsonb) — the
-- repo's four arguments plus p_profile jsonb DEFAULT '{}'. With that default a
-- four-argument call has two candidates, so verify-3a.sql row 114 fails with
-- 42725 "function public.create_member(unknown, unknown, smallint, unknown) is
-- not unique" (and the admin tab's "회원 저장" rpc gets PGRST203).
--
-- This drops that overload only. Untouched: the repo's
-- create_member(text, text, smallint, text), the members.profile column and
-- every other function. No CASCADE: if anything depended on it, the DROP
-- fails and nothing changes. Safe to re-run (IF EXISTS).
-- Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
-- Expected result: one table, one row
--   1 | create_member(text, text, smallint, text) | true
-- Then run verify-3a.sql again (116 rows, SUMMARY 115 / 115, trace 0).
-- Locally: tests/lms-sql.spec.js rebuilds the live state and runs this.
-- ============================================================================
drop function if exists public.create_member(text, text, smallint, text, jsonb);

-- Make PostgREST (the REST API) drop the old overload right away.
notify pgrst, 'reload schema';

-- What is left: every public.create_member, one row each (none → one row).
with left_over as (
  select p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as fn
    from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'create_member'
)
select row_number() over (order by l.fn)::int as no,
       coalesce(l.fn, '(none)') as create_member,
       coalesce(l.fn = 'create_member(text, text, smallint, text)', false)
         and (select count(*) from left_over) = 1 as pass
  from (select 1) one
  left join left_over l on true
 order by 1;
