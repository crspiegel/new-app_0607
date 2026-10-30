-- ============================================================================
-- Teacher resources — verify-teacher-resources.sql  (READ-ONLY)
-- ----------------------------------------------------------------------------
-- Run AFTER the "Teacher resources" block of supabase/migration.sql, next to
-- verify-3a.sql (which checks only the LMS block).
-- Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
-- One SELECT on the catalog: no table, row, setting or session change.
--
-- Checks: the bucket (private, 10 MB, PDF / xlsx / xls), both tables (RLS on,
-- no policies, no direct table or column grants, no views over them), who may
-- EXECUTE each RPC and no other function touching them, SECURITY DEFINER +
-- search_path, the Storage policies (the admin policy's conditions, every
-- policy tied to exactly one bucket, RLS on storage.objects / buckets, no
-- browser policy that can change a bucket), and that the (가) objects are gone.
-- Expected result: one table, every row pass = true (SUMMARY row first); the
-- "info" row only lists the Storage policies (pass is empty).
-- Locally: tests/teacher-resources-sql.spec.js runs it on a fresh migration
-- and on drifted copies (each drift turns its own row false).
-- ============================================================================
with
b as (
  select public, file_size_limit,
         (select string_agg(t, ', ' order by t collate "C")
            from unnest(allowed_mime_types) t) as types
    from storage.buckets
   where id = 'teacher-resources'
),
tbl (no, name) as (
  values (4, 'public.teacher_resources'), (6, 'public.teacher_resource_downloads')
),
tbl_state as (
  select t.no,
         coalesce((select 'rls=' || case when c.relrowsecurity then 'on' else 'off' end
                          || ' policies=' || (select count(*) from pg_policies p
                                                where p.schemaname = 'public'
                                                  and p.tablename = c.relname)
                     from pg_class c where c.oid = to_regclass(t.name)), 'MISSING') as rls,
         case when to_regclass(t.name) is null then 'MISSING' else
           (select string_agg(r || '=' || case
                     when has_table_privilege(r, to_regclass(t.name),
                            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                       or has_any_column_privilege(r, to_regclass(t.name),
                            'SELECT, INSERT, UPDATE, REFERENCES')
                     then 'some' else 'none' end, ' ' order by o)
              from unnest(array['anon', 'authenticated']) with ordinality u (r, o))
         end as grants
    from tbl t
),
fn (no, sig, roles) as (
  values
  (8,  'public.teacher_resources_list(text)',                        array['anon', 'authenticated']),
  (9,  'public.teacher_resources_allowed()',                         array['anon', 'authenticated']),
  (10, 'public.teacher_resource_issue(text, text, uuid)',            array['anon', 'authenticated', 'service_role']),
  (11, 'public.teacher_resource_set(text, text, text, text, bigint)', array['anon', 'authenticated']),
  (12, 'public.teacher_resource_clear(text, text)',                  array['anon', 'authenticated'])
),
fn_state as (
  select f.no, f.sig,
         case when to_regprocedure(f.sig) is null then 'MISSING' else
           (select string_agg(r || '=' || case when has_function_privilege(r, to_regprocedure(f.sig),
                     'EXECUTE') then 'yes' else 'no' end, ' ' order by o)
              from unnest(f.roles) with ordinality u (r, o))
         end as exec,
         (select p.prosecdef and 'search_path=public, extensions' = any (p.proconfig)
            from pg_proc p where p.oid = to_regprocedure(f.sig)) as definer_ok
    from fn f
),
pol as (
  select policyname, cmd, roles::text as roles, qual, with_check,
         coalesce(qual, '') || ' ' || coalesce(with_check, '') as body
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
),
-- A policy is tied to ONE bucket when its condition starts with
-- bucket_id = '<name>' and the rest is AND-ed on (no OR, NOT, <>, LIKE, IN).
one_bucket (re) as (
  values ('^\((\(bucket_id = ''[^'']+''::text\) AND |bucket_id = ''[^'']+''::text\)$)')
),
rows_ (no, area, check_name, expected, actual) as (
  values
  (1,  'bucket', 'teacher-resources bucket is private', 'false',
       coalesce((select public::text from b), 'MISSING')),
  (2,  'bucket', 'file size limit = 10 MB', '10485760',
       coalesce((select file_size_limit::text from b), 'MISSING')),
  (3,  'bucket', 'allowed types = PDF, xls, xlsx',
       'application/pdf, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       coalesce((select types from b), 'MISSING')),
  (4,  'table', 'teacher_resources: RLS on, no policies', 'rls=on policies=0',
       (select rls from tbl_state where no = 4)),
  (5,  'table', 'teacher_resources: no direct access for anon / authenticated',
       'anon=none authenticated=none', (select grants from tbl_state where no = 4)),
  (6,  'table', 'teacher_resource_downloads: RLS on, no policies', 'rls=on policies=0',
       (select rls from tbl_state where no = 6)),
  (7,  'table', 'teacher_resource_downloads: no direct access for anon / authenticated',
       'anon=none authenticated=none', (select grants from tbl_state where no = 6)),
  (8,  'rpc', 'teacher_resources_list: anyone may call (answers only role 1/2 + admins)',
       'anon=yes authenticated=yes', (select exec from fn_state where no = 8)),
  (9,  'rpc', 'teacher_resources_allowed: internal helper', 'anon=no authenticated=no',
       (select exec from fn_state where no = 9)),
  (10, 'rpc', 'teacher_resource_issue: Edge Function (service role) only',
       'anon=no authenticated=no service_role=yes', (select exec from fn_state where no = 10)),
  (11, 'rpc', 'teacher_resource_set: signed-in only (checks is_admin inside)',
       'anon=no authenticated=yes', (select exec from fn_state where no = 11)),
  (12, 'rpc', 'teacher_resource_clear: signed-in only (checks is_admin inside)',
       'anon=no authenticated=yes', (select exec from fn_state where no = 12)),
  (13, 'rpc', 'all 5 SECURITY DEFINER with search_path = public, extensions', '5 / 5',
       (select count(*) filter (where definer_ok) || ' / ' || count(*) from fn_state)),
  (14, 'storage', 'teacher_resources_admin_all: for all, to authenticated, admins only',
       'cmd=ALL roles={authenticated} using=ok check=ok',
       coalesce((select 'cmd=' || cmd || ' roles=' || roles
                        || ' using=' || case when qual ~
                             '^\(\(bucket_id = ''teacher-resources''::text\) AND (public\.)?is_admin\(\)\)$'
                             then 'ok' else 'CHANGED' end
                        || ' check=' || case when with_check ~
                             '^\(\(bucket_id = ''teacher-resources''::text\) AND (public\.)?is_admin\(\) AND \(name ~ '
                             then 'ok' else 'CHANGED' end
                   from pol where policyname = 'teacher_resources_admin_all'), 'MISSING')),
  (15, 'storage', 'policies that name the teacher-resources bucket',
       'teacher_resources_admin_all',
       coalesce((select string_agg(policyname, ', ' order by policyname) from pol
                  where body ~ 'teacher-resources'), 'none')),
  (16, 'storage', 'storage.objects policies not tied to one bucket', 'none',
       coalesce((select string_agg(policyname, ', ' order by policyname)
                   from pol, one_bucket o
                  where coalesce(qual, with_check) !~ o.re
                     or with_check !~ o.re), 'none')),
  (17, 'cleanup', '(가) leftovers are gone', 'none',
       coalesce(nullif(concat_ws(', ',
         case when to_regprocedure('public.teacher_resource_file(text, text)') is not null
              then 'teacher_resource_file' end,
         case when to_regprocedure('public.teacher_resource_is_current(text)') is not null
              then 'teacher_resource_is_current' end,
         case when exists (select 1 from pol where policyname = 'teacher_resources_lms_read')
              then 'teacher_resources_lms_read' end), ''), 'none')),
  (18, 'table', 'teacher_resources checks: slot rule, path rule, size <= 10 MB',
       'slot_ok path_ok size_10mb',
       concat_ws(' ',
         case when exists (select 1 from pg_constraint
                            where conrelid = to_regclass('public.teacher_resources')
                              and conname = 'teacher_resources_slot_ok') then 'slot_ok' end,
         case when exists (select 1 from pg_constraint
                            where conrelid = to_regclass('public.teacher_resources')
                              and conname = 'teacher_resources_path_ok') then 'path_ok' end,
         case when exists (select 1 from pg_constraint
                            where conrelid = to_regclass('public.teacher_resources')
                              and contype = 'c'
                              and pg_get_constraintdef(oid) ~ 'file_size.*10485760')
              then 'size_10mb' end)),
  (19, 'storage', 'RLS is on for storage.objects and storage.buckets (tables with it off)',
       'none',
       coalesce((select string_agg(c.relname, ', ' order by c.relname) from pg_class c
                  where c.oid in (to_regclass('storage.objects'), to_regclass('storage.buckets'))
                    and not c.relrowsecurity), 'none')),
  (20, 'storage', 'no browser policy can change a bucket (storage.buckets)', 'none',
       coalesce((select string_agg(policyname, ', ' order by policyname) from pg_policies
                  where schemaname = 'storage' and tablename = 'buckets' and cmd <> 'SELECT'
                    and roles && array['public', 'anon', 'authenticated']::name[]), 'none')),
  (21, 'rpc', 'no other public function touches teacher resources', 'none',
       coalesce((select string_agg(p.oid::regprocedure::text, ', '
                                   order by p.oid::regprocedure::text)
                   from pg_proc p
                  where p.pronamespace = 'public'::regnamespace
                    and (p.proname ~ '^teacher_resource' or p.prosrc ~ 'teacher_resource')
                    and p.oid not in (select to_regprocedure(f.sig)::oid from fn f
                                       where to_regprocedure(f.sig) is not null)), 'none')),
  (22, 'table', 'no view reads the two tables', 'none',
       coalesce((select string_agg(distinct rw.ev_class::regclass::text, ', ')
                   from pg_depend d
                   join pg_rewrite rw on rw.oid = d.objid
                  where d.classid = 'pg_rewrite'::regclass
                    and d.refobjid in (to_regclass('public.teacher_resources'),
                                       to_regclass('public.teacher_resource_downloads'))
                    and rw.ev_class <> d.refobjid), 'none')),
  (23, 'info', 'all storage.objects policies (for the eye, no pass/fail)', null,
       coalesce((select string_agg(policyname, ', ' order by policyname) from pol), 'none'))
),
checked as (
  select no, area, check_name, expected, actual,
         case when expected is null then null
              else coalesce(actual = expected, false) end as pass
    from rows_
)
select 0 as no, 'SUMMARY' as area, 'cases passed' as "check", 'all' as expected,
       format('%s / %s', count(*) filter (where pass), count(pass)) as actual,
       bool_and(pass) as pass
  from checked
union all
select no, area, check_name, expected, actual, pass from checked
order by no;
