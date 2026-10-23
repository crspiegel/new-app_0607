-- ============================================================================
-- LMS Phase 3A — 00-precheck.sql  (READ-ONLY)
-- ----------------------------------------------------------------------------
-- Run BEFORE the "LMS (Phase 3A)" block of supabase/migration.sql.
-- Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
-- It only SELECTs: no table, row or setting changes. It never prints a
-- password or a hash. Paste the result table back to the worker.
--
-- One statement on purpose: the SQL Editor shows only the last result.
-- Columns: no · check · value · note
-- ============================================================================
with
m as (
  select id, grade, active,
         -- same as public.lms_norm_id() (not created yet at precheck time)
         lower(btrim(normalize(id, NFC), E' \t\r\n 　')) as norm
    from public.members
),
bad_rule as (
  select string_agg(id, ', ' order by id) as ids, count(*) as n
    from m
   where norm !~ '^[0-9a-z가-힣._-]{2,20}$'
),
collide as (
  select string_agg(ids, ' | ' order by ids) as pairs, count(*) as n
    from (select norm, string_agg(id, ' = ' order by id) as ids
            from m group by norm having count(*) > 1) d
),
rows_ (no, check_name, value, note) as (
  values
  (1,  'postgres version', current_setting('server_version'), ''),
  (2,  'server encoding (normalize needs UTF8)', current_setting('server_encoding'), ''),
  (3,  'pgcrypto schema',
       coalesce((select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
                  where e.extname = 'pgcrypto'), 'NOT INSTALLED'),
       'expect: extensions'),
  (4,  'normalize(NFD 한, NFC) = NFC 한',
       (normalize(U&'\1112\1161\11AB', NFC) = U&'\D55C')::text, 'expect: true'),
  (5,  'members: total', (select count(*) from m)::text, 'user said 1 (a grade-3 test account)'),
  (6,  'members: grade 1', (select count(*) from m where grade = 1)::text, 'expect: 0 → role 2 if any'),
  (7,  'members: grade 2', (select count(*) from m where grade = 2)::text, 'expect: 0 → role 2 if any'),
  (8,  'members: grade 3', (select count(*) from m where grade = 3)::text, 'expect: 1 → role 3 (student)'),
  (9,  'members: inactive', (select count(*) from m where not active)::text, ''),
  (10, 'IDs outside the new rule ^[0-9a-z가-힣._-]{2,20}$ (after normalize)',
       coalesce((select n || ': ' || ids from bad_rule where n > 0), '0'),
       'login still works (rule is for new/changed IDs only)'),
  (11, 'IDs that collide after normalize',
       coalesce((select n || ': ' || pairs from collide where n > 0), '0'),
       'must be 0 — else the unique index fails; STOP and report'),
  (12, 'passwords >10 or <4 chars', 'n/a', 'bcrypt hashes hide the length; login accepts any length (D6a)'),
  (13, 'admins (count)', (select count(*) from public.admins)::text,
       'verify-3a uses one admin id to test the old create_member path'),
  (14, 'LMS objects already present',
       concat_ws(', ',
         case when to_regclass('public.branches') is not null then 'branches' end,
         case when to_regclass('public.classes') is not null then 'classes' end,
         case when to_regclass('public.lms_sessions') is not null then 'lms_sessions' end,
         case when to_regclass('public.login_attempts') is not null then 'login_attempts' end,
         case when exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = 'members'
                              and column_name = 'member_id') then 'members.member_id' end),
       'empty before the first run')
)
select no, check_name as "check", value, note from rows_ order by no;
