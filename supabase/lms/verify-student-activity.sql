-- ============================================================================
-- Student activity log — verify-student-activity.sql  (READ-ONLY, D90)
-- ----------------------------------------------------------------------------
-- Run AFTER the "Student activity" block of supabase/migration.sql.
-- Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
-- One SELECT on the catalog: no table, row, setting or session change.
--
-- Checks: the log table (RLS on, no policies, no direct table / column /
-- sequence grants, no views over it), its member link (on delete cascade),
-- the two indexes, the generated "completed" column (played ≥ 90 % of the
-- length) and the value rules, who may EXECUTE each function (start / save =
-- anyone — they answer only a signed-in student; note / room = internal),
-- SECURITY DEFINER + search_path, that lms_login / lms_session write their
-- row inside their own exception block (a failure never changes their
-- answer), and that no other public function touches the table.
-- Expected result: one table, every row pass = true (SUMMARY row first).
-- Locally: tests/student-activity-sql.spec.js runs it on a fresh migration
-- and on a drifted copy (each drift turns its own row false).
-- ============================================================================
with
t as (
  select to_regclass('public.student_activity') as oid
),
seq as (
  select pg_get_serial_sequence('public.student_activity', 'id') as name
   where (select oid from t) is not null
),
fn (no, sig, roles) as (
  values
  (7,  'public.student_activity_start(text, text, text, integer, text, text, text)', array['anon', 'authenticated']),
  (8,  'public.student_activity_save(bigint, numeric, numeric, numeric, numeric)',   array['anon', 'authenticated']),
  (9,  'public.student_activity_note(uuid, text)',                                   array['anon', 'authenticated']),
  (10, 'public.student_activity_room(uuid)',                                         array['anon', 'authenticated'])
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
-- lms_login / lms_session: the log line sits in its own exception block
logged (fn, re) as (
  values
  ('public.lms_login(text, text, uuid)',
   'begin\s+perform public\.student_activity_note\(\(v_hit ->> ''member_id''\)::uuid, ''login''\);\s+exception when others then\s+null;\s+end;'),
  ('public.lms_session()',
   'begin\s+perform public\.student_activity_note\(r\.member_id, ''visit''\);\s+exception when others then\s+null;\s+end;')
),
rows_ (no, area, check_name, expected, actual) as (
  values
  (1,  'table', 'student_activity: RLS on, no policies', 'rls=on policies=0',
       coalesce((select 'rls=' || case when c.relrowsecurity then 'on' else 'off' end
                        || ' policies=' || (select count(*) from pg_policies p
                                              where p.schemaname = 'public'
                                                and p.tablename = 'student_activity')
                   from pg_class c where c.oid = (select oid from t)), 'MISSING')),
  (2,  'table', 'student_activity: no direct access for anon / authenticated',
       'anon=none authenticated=none',
       case when (select oid from t) is null then 'MISSING' else
         (select string_agg(r || '=' || case
                   when has_table_privilege(r, (select oid from t),
                          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                     or has_any_column_privilege(r, (select oid from t),
                          'SELECT, INSERT, UPDATE, REFERENCES')
                   then 'some' else 'none' end, ' ' order by o)
            from unnest(array['anon', 'authenticated']) with ordinality u (r, o))
       end),
  (3,  'table', 'its id sequence: no grants for anon / authenticated',
       'anon=none authenticated=none',
       coalesce((select string_agg(r || '=' || case
                   when has_sequence_privilege(r, s.name, 'USAGE, SELECT, UPDATE')
                   then 'some' else 'none' end, ' ' order by o)
            from seq s, unnest(array['anon', 'authenticated']) with ordinality u (r, o)), 'MISSING')),
  (4,  'table', 'member_id → members(member_id) on delete cascade (the log goes with the student)',
       'FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE',
       coalesce((select string_agg(regexp_replace(pg_get_constraintdef(c.oid), 'public\.', ''), '; ')
                   from pg_constraint c
                  where c.conrelid = (select oid from t) and c.contype = 'f'), 'MISSING')),
  (5,  'table', 'indexes: (member_id, started_at) and (started_at)', 'member_started started',
       concat_ws(' ',
         case when exists (select 1 from pg_indexes i
                            where i.schemaname = 'public' and i.tablename = 'student_activity'
                              and i.indexdef ~ '\(member_id, started_at\)$') then 'member_started' end,
         case when exists (select 1 from pg_indexes i
                            where i.schemaname = 'public' and i.tablename = 'student_activity'
                              and i.indexdef ~ '\(started_at\)$') then 'started' end)),
  (6,  'table', 'completed = generated: a video with a length, played ≥ 90 % of it', 'generated 90%',
       coalesce((select case when a.attgenerated = 's'
                              and pg_get_expr(d.adbin, d.adrelid) ~ '\* 10\) >= \(duration_sec \* 9\)'
                             then 'generated 90%' else 'CHANGED' end
                   from pg_attribute a
                   join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                  where a.attrelid = (select oid from t) and a.attname = 'completed'), 'MISSING')),
  (7,  'rpc', 'student_activity_start: anyone may call (writes only for a signed-in student)',
       'anon=yes authenticated=yes', (select exec from fn_state where no = 7)),
  (8,  'rpc', 'student_activity_save: anyone may call (the student''s own rows only)',
       'anon=yes authenticated=yes', (select exec from fn_state where no = 8)),
  (9,  'rpc', 'student_activity_note: internal (lms_login / lms_session)',
       'anon=no authenticated=no', (select exec from fn_state where no = 9)),
  (10, 'rpc', 'student_activity_room: internal (200 rows a KST day)',
       'anon=no authenticated=no', (select exec from fn_state where no = 10)),
  (11, 'rpc', 'all 4 SECURITY DEFINER with search_path = public, extensions', '4 / 4',
       (select count(*) filter (where definer_ok) || ' / ' || count(*) from fn_state)),
  (12, 'rpc', 'lms_login / lms_session log inside their own exception block',
       'lms_login=yes lms_session=yes',
       (select string_agg(split_part(substr(l.fn, 8), '(', 1) || '=' ||
                case when exists (select 1 from pg_proc p
                                   where p.oid = to_regprocedure(l.fn) and p.prosrc ~ l.re)
                     then 'yes' else 'no' end, ' ' order by l.fn)
          from logged l)),
  (13, 'rpc', 'no other public function touches the log', 'none',
       coalesce((select string_agg(p.oid::regprocedure::text, ', '
                                   order by p.oid::regprocedure::text)
                   from pg_proc p
                  where p.pronamespace = 'public'::regnamespace
                    and (p.proname ~ '^student_activity' or p.prosrc ~ 'student_activity')
                    and p.oid not in (
                          select to_regprocedure(x)::oid
                            from unnest(array[
                                   'public.student_activity_start(text, text, text, integer, text, text, text)',
                                   'public.student_activity_save(bigint, numeric, numeric, numeric, numeric)',
                                   'public.student_activity_note(uuid, text)',
                                   'public.student_activity_room(uuid)',
                                   'public.lms_login(text, text, uuid)',
                                   'public.lms_session()']) x
                           where to_regprocedure(x) is not null)), 'none')),
  (14, 'table', 'no view reads the log', 'none',
       coalesce((select string_agg(distinct rw.ev_class::regclass::text, ', ')
                   from pg_depend d
                   join pg_rewrite rw on rw.oid = d.objid
                  where d.classid = 'pg_rewrite'::regclass
                    and d.refobjid = (select oid from t)
                    and rw.ev_class <> d.refobjid), 'none')),
  (15, 'table', 'value rules: kind (4), book 1/2, video kind (3), seconds 0..6 h',
       'kind book video_kind seconds',
       concat_ws(' ',
         case when exists (select 1 from pg_constraint c
                            where c.conrelid = (select oid from t) and c.contype = 'c'
                              and pg_get_constraintdef(c.oid) ~ 'kind = ANY .*login.*visit.*video.*game')
              then 'kind' end,
         case when exists (select 1 from pg_constraint c
                            where c.conrelid = (select oid from t) and c.contype = 'c'
                              and pg_get_constraintdef(c.oid) ~ 'book = ANY')
              then 'book' end,
         case when exists (select 1 from pg_constraint c
                            where c.conrelid = (select oid from t) and c.contype = 'c'
                              and pg_get_constraintdef(c.oid) ~ 'video_kind = ANY .*vimeo.*youtube.*page')
              then 'video_kind' end,
         case when (select count(*) from pg_constraint c
                     where c.conrelid = (select oid from t) and c.contype = 'c'
                       and pg_get_constraintdef(c.oid) ~ '_sec >= 0\) AND \(\w+_sec <= 21600') = 4
              then 'seconds' end)),
  -- one student at a time before the day's count (parallel calls cannot pass 200); the
  -- login / first-visit line waits at most 250 ms for that (then skips — login never fails)
  (16, 'rpc', 'start / note lock the student (7306) before counting; note waits ≤ 250 ms',
       'start=lock note=lock+250ms',
       'start=' || coalesce((select case when p.prosrc ~ 'pg_advisory_xact_lock\(7306, hashtext\(v_member::text\)\);\s+if not public\.student_activity_room\(v_member\)'
                                         then 'lock' else 'no' end
                               from pg_proc p where p.oid = to_regprocedure((select sig from fn where no = 7))), 'MISSING')
       || ' note=' || coalesce((select case when p.prosrc ~ 'pg_advisory_xact_lock\(7306, hashtext\(p_member_id::text\)\);'
                                          then 'lock' else 'no' end
                                     || case when 'lock_timeout=250ms' = any (p.proconfig) then '+250ms' else '' end
                                from pg_proc p where p.oid = to_regprocedure((select sig from fn where no = 9))), 'MISSING'))
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
