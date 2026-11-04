-- ============================================================================
-- Resource board (자료실) — verify-resource-board.sql  (READ-ONLY)
-- ----------------------------------------------------------------------------
-- Run AFTER the "Resource board" block of supabase/migration.sql, next to
-- verify-teacher-resources.sql (which checks only the board's download call).
-- Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
-- One SELECT on the catalog: no table, row, setting or session change.
--
-- Checks: the bucket (private, 10 MB, the 9 file types), the four tables (RLS
-- on, no policies, no direct table / column grants, no views over them) and
-- the category id sequence, who may EXECUTE each of the 15 functions, all of
-- them SECURITY DEFINER + search_path, the Storage policy (its conditions,
-- the only one naming the bucket, every storage.objects policy tied to one
-- bucket), no other function reading the board tables, the table checks and
-- the two switches in site_settings.
-- Expected result: one table, every row pass = true (SUMMARY row first); the
-- "info" row shows the two switches (pass is empty).
-- Locally: tests/resource-board-sql.spec.js runs it on a fresh migration and
-- on drifted copies (each drift turns its own row false).
-- ============================================================================
with
b as (
  select public, file_size_limit,
         (select string_agg(t, ', ' order by t collate "C")
            from unnest(allowed_mime_types) t) as types
    from storage.buckets
   where id = 'resource-board'
),
tbl (no, name) as (
  values (4, 'public.board_categories'), (5, 'public.board_posts'),
         (6, 'public.board_attachments'), (7, 'public.board_post_views')
),
tbl_state as (
  select t.no,
         coalesce((select 'rls=' || case when c.relrowsecurity then 'on' else 'off' end
                          || ' policies=' || (select count(*) from pg_policies p
                                                where p.schemaname = 'public'
                                                  and p.tablename = c.relname)
                     from pg_class c where c.oid = to_regclass(t.name)), 'MISSING')
         || ' ' ||
         case when to_regclass(t.name) is null then 'MISSING' else
           (select string_agg(r || '=' || case
                     when has_table_privilege(r, to_regclass(t.name),
                            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                       or has_any_column_privilege(r, to_regclass(t.name),
                            'SELECT, INSERT, UPDATE, REFERENCES')
                     then 'some' else 'none' end, ' ' order by o)
              from unnest(array['anon', 'authenticated']) with ordinality u (r, o))
         end as state
    from tbl t
),
fn (no, sig, roles, expected) as (
  values
  (10, 'public.board_list(text, bigint, text, text, integer)', array['anon', 'authenticated'], 'anon=yes authenticated=yes'),
  (11, 'public.board_post_get(uuid, text, bigint, text, text)', array['anon', 'authenticated'], 'anon=yes authenticated=yes'),
  (12, 'public.board_admin_list(text, bigint, text, text, integer)', array['anon', 'authenticated'], 'anon=no authenticated=yes'),
  (13, 'public.board_admin_get(uuid)', array['anon', 'authenticated'], 'anon=no authenticated=yes'),
  (14, 'public.board_post_save(uuid, text, text, text, bigint, boolean, boolean, jsonb)', array['anon', 'authenticated'], 'anon=no authenticated=yes'),
  (15, 'public.board_post_delete(uuid)', array['anon', 'authenticated'], 'anon=no authenticated=yes'),
  (16, 'public.board_category_save(bigint, text)', array['anon', 'authenticated'], 'anon=no authenticated=yes'),
  (17, 'public.board_category_order(bigint[])', array['anon', 'authenticated'], 'anon=no authenticated=yes'),
  (18, 'public.board_category_delete(bigint)', array['anon', 'authenticated'], 'anon=no authenticated=yes'),
  (19, 'public.board_attachment_issue(uuid, uuid)', array['anon', 'authenticated', 'service_role'], 'anon=no authenticated=no service_role=yes'),
  (20, 'public.board_access()', array['anon', 'authenticated'], 'anon=no authenticated=no'),
  (21, 'public.board_is_new(timestamp with time zone)', array['anon', 'authenticated'], 'anon=no authenticated=no'),
  (22, 'public.board_ranked(text, bigint, text, text)', array['anon', 'authenticated'], 'anon=no authenticated=no'),
  (23, 'public.board_category_json(boolean)', array['anon', 'authenticated'], 'anon=no authenticated=no'),
  (24, 'public.site_flag(text, boolean)', array['anon', 'authenticated'], 'anon=no authenticated=no')
),
fn_state as (
  select f.no, f.sig, f.expected,
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
-- the policy's whole path rule, as Postgres prints it (it ends the check)
rule (rule) as (
  values ('''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{13}-[a-z0-9]{6}\.(pdf|xlsx|xls|hwp|hwpx|pptx|ppt|jpg|jpeg|png)$''::text))')
),
-- A policy is tied to ONE bucket when its condition starts with
-- bucket_id = '<name>' and the rest is AND-ed on (no OR, NOT, <>, LIKE, IN).
one_bucket (re) as (
  values ('^\((\(bucket_id = ''[^'']+''::text\) AND |bucket_id = ''[^'']+''::text\)$)')
),
cons as (
  select string_agg(conname, ' ' order by conname) as names
    from pg_constraint
   where conrelid in (to_regclass('public.board_categories'), to_regclass('public.board_posts'),
                      to_regclass('public.board_attachments'))
     and contype = 'c'
),
rows_ (no, area, check_name, expected, actual) as (
  values
  (1,  'bucket', 'resource-board bucket is private', 'false',
       coalesce((select public::text from b), 'MISSING')),
  (2,  'bucket', 'file size limit = 10 MB', '10485760',
       coalesce((select file_size_limit::text from b), 'MISSING')),
  (3,  'bucket', 'allowed types = PDF, Excel, 한글, PowerPoint, JPG, PNG',
       'application/pdf, application/vnd.hancom.hwpx, application/vnd.ms-excel, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/x-hwp, image/jpeg, image/png',
       coalesce((select types from b), 'MISSING')),
  (4,  'table', 'board_categories: RLS on, no policies, no direct access',
       'rls=on policies=0 anon=none authenticated=none', (select state from tbl_state where no = 4)),
  (5,  'table', 'board_posts: RLS on, no policies, no direct access',
       'rls=on policies=0 anon=none authenticated=none', (select state from tbl_state where no = 5)),
  (6,  'table', 'board_attachments: RLS on, no policies, no direct access',
       'rls=on policies=0 anon=none authenticated=none', (select state from tbl_state where no = 6)),
  (7,  'table', 'board_post_views: RLS on, no policies, no direct access',
       'rls=on policies=0 anon=none authenticated=none', (select state from tbl_state where no = 7)),
  (8,  'table', 'board_categories_id_seq: no grants for anon / authenticated', 'anon=none authenticated=none',
       case when to_regclass('public.board_categories_id_seq') is null then 'MISSING' else
         (select string_agg(r || '=' || case when has_sequence_privilege(r, 'public.board_categories_id_seq',
                   'USAGE, SELECT, UPDATE') then 'some' else 'none' end, ' ' order by o)
            from unnest(array['anon', 'authenticated']) with ordinality u (r, o)) end),
  (9,  'table', 'no view reads the board tables', 'none',
       coalesce((select string_agg(distinct rw.ev_class::regclass::text, ', ')
                   from pg_depend d
                   join pg_rewrite rw on rw.oid = d.objid
                  where d.classid = 'pg_rewrite'::regclass
                    and d.refobjid in (to_regclass('public.board_categories'), to_regclass('public.board_posts'),
                                       to_regclass('public.board_attachments'), to_regclass('public.board_post_views'))
                    and rw.ev_class <> d.refobjid), 'none')),
  (10, 'rpc', 'board_list: anyone may call (answers only role 1/2 + admins)',
       (select expected from fn_state where no = 10), (select exec from fn_state where no = 10)),
  (11, 'rpc', 'board_post_get: anyone may call (answers only role 1/2 + admins)',
       (select expected from fn_state where no = 11), (select exec from fn_state where no = 11)),
  (12, 'rpc', 'board_admin_list: signed-in only (is_admin inside)',
       (select expected from fn_state where no = 12), (select exec from fn_state where no = 12)),
  (13, 'rpc', 'board_admin_get: signed-in only (is_admin inside)',
       (select expected from fn_state where no = 13), (select exec from fn_state where no = 13)),
  (14, 'rpc', 'board_post_save: signed-in only (is_admin inside)',
       (select expected from fn_state where no = 14), (select exec from fn_state where no = 14)),
  (15, 'rpc', 'board_post_delete: signed-in only (is_admin inside)',
       (select expected from fn_state where no = 15), (select exec from fn_state where no = 15)),
  (16, 'rpc', 'board_category_save: signed-in only (is_admin inside)',
       (select expected from fn_state where no = 16), (select exec from fn_state where no = 16)),
  (17, 'rpc', 'board_category_order: signed-in only (is_admin inside)',
       (select expected from fn_state where no = 17), (select exec from fn_state where no = 17)),
  (18, 'rpc', 'board_category_delete: signed-in only (is_admin inside)',
       (select expected from fn_state where no = 18), (select exec from fn_state where no = 18)),
  (19, 'rpc', 'board_attachment_issue: Edge Function (service role) only',
       (select expected from fn_state where no = 19), (select exec from fn_state where no = 19)),
  (20, 'rpc', 'board_access: internal helper',
       (select expected from fn_state where no = 20), (select exec from fn_state where no = 20)),
  (21, 'rpc', 'board_is_new: internal helper',
       (select expected from fn_state where no = 21), (select exec from fn_state where no = 21)),
  (22, 'rpc', 'board_ranked: internal helper',
       (select expected from fn_state where no = 22), (select exec from fn_state where no = 22)),
  (23, 'rpc', 'board_category_json: internal helper',
       (select expected from fn_state where no = 23), (select exec from fn_state where no = 23)),
  (24, 'rpc', 'site_flag: internal helper',
       (select expected from fn_state where no = 24), (select exec from fn_state where no = 24)),
  (25, 'rpc', 'all 15 SECURITY DEFINER with search_path = public, extensions', '15 / 15',
       (select count(*) filter (where definer_ok) || ' / ' || count(*) from fn_state)),
  (26, 'rpc', 'no other public function reads the board tables', 'none',
       coalesce((select string_agg(p.oid::regprocedure::text, ', '
                                   order by p.oid::regprocedure::text)
                   from pg_proc p
                  where p.pronamespace = 'public'::regnamespace
                    and (p.proname ~ '^board_'
                         or p.prosrc ~ 'board_(posts|attachments|categories|post_views)')
                    and p.oid not in (select to_regprocedure(f.sig)::oid from fn f
                                       where to_regprocedure(f.sig) is not null)), 'none')),
  (27, 'storage', 'resource_board_admin_all: for all, to authenticated, admins only, path rule',
       'cmd=ALL roles={authenticated} using=ok check=ok',
       coalesce((select 'cmd=' || cmd || ' roles=' || roles
                        || ' using=' || case when qual ~
                             '^\(\(bucket_id = ''resource-board''::text\) AND (public\.)?is_admin\(\)\)$'
                             then 'ok' else 'CHANGED' end
                        || ' check=' || case when with_check ~
                             '^\(\(bucket_id = ''resource-board''::text\) AND (public\.)?is_admin\(\) AND \(name ~ '
                             and right(with_check, length(r.rule)) = r.rule then 'ok' else 'CHANGED' end
                   from pol, rule r where policyname = 'resource_board_admin_all'), 'MISSING')),
  (28, 'storage', 'policies that name the resource-board bucket', 'resource_board_admin_all',
       coalesce((select string_agg(policyname, ', ' order by policyname) from pol
                  where body ~ 'resource-board'), 'none')),
  (29, 'table', 'board checks: title, body, level, path, type, size, one kind, Drive ID, category name',
       'board_attachments_drive_ok board_attachments_kind_ok board_attachments_label_ok board_attachments_name_ok board_attachments_path_ok board_attachments_size_ok board_attachments_source_ok board_attachments_type_ok board_categories_color_ok board_categories_name_ok board_posts_body_ok board_posts_level_ok board_posts_title_ok board_posts_views_ok',
       coalesce((select names from cons), 'MISSING')),
  (30, 'setting', 'the two switches exist (resource_board_enabled, teacher_resources_enabled)', '2',
       (select count(*)::text from public.site_settings
         where key in ('resource_board_enabled', 'teacher_resources_enabled'))),
  (31, 'info', 'switch values (for the eye, no pass/fail)', null,
       coalesce((select string_agg(key || '=' || value::text, ', ' order by key)
                   from public.site_settings
                  where key in ('resource_board_enabled', 'teacher_resources_enabled')), 'none')),
  (32, 'storage', 'storage.objects policies not tied to one bucket', 'none',
       coalesce((select string_agg(policyname, ', ' order by policyname)
                   from pol, one_bucket o
                  where coalesce(qual, with_check) !~ o.re
                     or with_check !~ o.re), 'none'))
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
