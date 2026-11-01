-- ============================================================================
-- LMS Phase 3B — 00-precheck-3b.sql  (READ-ONLY, one statement)
-- ----------------------------------------------------------------------------
-- Run BEFORE the "LMS (Phase 3B)" block of supabase/migration.sql (decision
-- D49: after the teacher test account is deleted).
-- Supabase Dashboard → SQL Editor → New query → paste this whole file →
-- click once inside the editor (so no text is selected) → Run.
-- It only SELECTs: no table, row or setting changes. It never prints a
-- password, a hash or a members.profile value. Paste the table to the worker.
--
-- 3B moves the members primary key from id to member_id (D41) and drops the
-- old member RPCs (D42), so this lists everything on the live project that
-- leans on members: foreign keys, views, triggers, policies, functions. The
-- live project once had objects that are in no file of this repo (D27, D28).
-- A value starting with "멈춤" means: STOP, do not run migration.sql.
-- Columns: no · check · value · note
-- ============================================================================
with
m as (
  select x.id, x.role, x.active, b.code
    from public.members x
    left join public.branches b on b.id = x.branch_id
),
by_branch as (
  select string_agg(format('%s: role1=%s role2=%s role3=%s', code, r1, r2, r3), ' | '
                    order by code collate "C") as v
    from (select coalesce(code, '(no branch)') as code,
                 count(*) filter (where role = 1) as r1,
                 count(*) filter (where role = 2) as r2,
                 count(*) filter (where role = 3) as r3
            from m group by 1) s
),
pk as (
  select c.conname || ' ' || pg_get_constraintdef(c.oid) as v
    from pg_constraint c
   where c.conrelid = 'public.members'::regclass and c.contype = 'p'
),
cols as (
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || case when a.attnotnull then ' NOT NULL' else '' end,
                    ', ' order by a.attnum) as v
    from pg_attribute a
   where a.attrelid = 'public.members'::regclass and a.attnum > 0 and not a.attisdropped
),
fk as (
  select c.conrelid::regclass::text as tbl,
         (select string_agg(a.attname, ',' order by k.o)
            from unnest(c.conkey) with ordinality k (n, o)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) as cols,
         (select string_agg(a.attname, ',' order by k.o)
            from unnest(c.confkey) with ordinality k (n, o)
            join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n) as refcols
    from pg_constraint c
   where c.contype = 'f' and c.confrelid = 'public.members'::regclass
),
fk_id as (
  select count(*) as n,
         string_agg(format('%s(%s) → members(%s)', tbl, cols, refcols), ', '
                    order by tbl collate "C") as v
    from fk
   where refcols <> 'member_id'
),
views as (
  select string_agg(distinct v.oid::regclass::text, ', ') as v
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class v on v.oid = r.ev_class
   where d.classid = 'pg_rewrite'::regclass
     and d.refobjid = 'public.members'::regclass
     and v.oid <> 'public.members'::regclass
),
trg as (
  select string_agg(t.tgname, ', ' order by t.tgname collate "C") as v
    from pg_trigger t
   where t.tgrelid = 'public.members'::regclass and not t.tgisinternal
),
pol_on as (
  select string_agg(p.policyname, ', ' order by p.policyname collate "C") as v
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'members'
),
pol_ref as (
  select string_agg(p.schemaname || '.' || p.tablename || '.' || p.policyname, ', '
                    order by (p.schemaname || '.' || p.tablename || '.' || p.policyname) collate "C") as v
    from pg_policies p
   where not (p.schemaname = 'public' and p.tablename = 'members')
     and (coalesce(p.qual, '') ~* '\mmembers\M' or coalesce(p.with_check, '') ~* '\mmembers\M')
),
fns as (
  select p.oid::regprocedure::text as sig, p.proname, p.prosrc
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosrc ~* '\mmembers\M'
),
upsert_id as (
  select string_agg(sig, ', ' order by sig collate "C") as v,
         count(*) filter (where sig not in ('create_member(text,text,smallint,text)',
                                            'create_member(text,text,smallint,text,jsonb)')) as unknown
    from fns
   where prosrc ~* 'on\s+conflict\s*\(\s*id\s*\)'
),
old_rpc as (
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") as v,
         count(*) filter (where p.oid::regprocedure::text not in (
           'create_member(text,text,smallint,text)',
           'set_member_active(text,boolean)',
           'update_member(text,smallint,text)')) as unknown
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('create_member', 'update_member', 'set_member_active')
),
idx as (
  select string_agg(i.relname, ', ' order by i.relname collate "C") as v
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
   where x.indrelid = 'public.members'::regclass
),
new3b as (
  select string_agg(p.proname, ', ' order by p.proname collate "C") as v
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('lms_caller', 'lms_member_list', 'lms_member_create', 'lms_member_update',
                       'lms_member_delete', 'lms_check_login_ids', 'lms_branch_create',
                       'lms_branch_update', 'lms_class_create', 'lms_class_update',
                       'lms_class_delete', 'lms_class_add_member', 'lms_class_remove_member',
                       'lms_unlock_member', 'lms_unlock_key', 'lms_bulk_create_members',
                       'lms_bulk_assign')
),
rows_ (no, check_name, value, note) as (
  values
  (1,  'members by branch (role 1 branch · 2 teacher · 3 student)',
       coalesce((select v from by_branch), '(none)'), 'info'),
  (2,  'members: total / inactive',
       (select count(*) from m) || ' / ' || (select count(*) from m where not active), 'info'),
  (3,  'test account tps-teacher-test',
       case when exists (select 1 from m where id = 'tps-teacher-test')
            then '멈춤 — still there: delete it first (D49)' else 'no' end,
       'expect: no'),
  (4,  'members primary key', coalesce((select v from pk), '(none)'),
       'before 3B: members_pkey PRIMARY KEY (id) · after: members_member_id_key PRIMARY KEY (member_id)'),
  (5,  'members columns', (select v from cols), 'info'),
  (6,  'foreign keys that point at members',
       coalesce((select string_agg(format('%s(%s) → members(%s)', tbl, cols, refcols), ', '
                                   order by tbl collate "C", cols collate "C") from fk), '(none)'),
       'expect: every one → members(member_id)'),
  (7,  'foreign keys that point at a members column other than member_id',
       (select case when n = 0 then '0' else '멈춤 — ' || n || ': ' || v end from fk_id),
       'must be 0: the pk swap drops the key on members.id'),
  (8,  'views that read members', coalesce((select v from views), '(none)'), 'expect: (none)'),
  (9,  'triggers on members', coalesce((select v from trg), '(none)'),
       'before 3B: members_lms_compat · after: + members_lms_end_sessions'),
  (10, 'policies on members', coalesce((select v from pol_on), '(none)'), 'expect: members_admin_all'),
  (11, 'policies on other tables that read members', coalesce((select v from pol_ref), '(none)'),
       'expect: (none)'),
  (12, 'functions (public) whose body mentions members',
       coalesce((select string_agg(sig, ', ' order by sig collate "C") from fns), '(none)'),
       'info — the worker compares this with the repo'),
  (13, 'functions that upsert members on id ("on conflict (id)")',
       (select case when unknown > 0 then '멈춤 — ' || v else coalesce(v, '(none)') end
          from upsert_id),
       'expect: create_member(text,text,smallint,text) only (3B drops it); anything else → 멈춤'),
  (14, 'old member RPCs (create_member / update_member / set_member_active)',
       (select case when unknown > 0 then '멈춤 — ' || v else coalesce(v, '(none)') end from old_rpc),
       'expect before 3B: the 3 repo signatures; another signature → 멈춤 · after 3B: (none)'),
  (15, 'indexes on members', coalesce((select v from idx), '(none)'), 'info'),
  (16, 'members.profile column (hand-made, D28)',
       case when exists (select 1 from pg_attribute a
                          where a.attrelid = 'public.members'::regclass
                            and a.attname = 'profile' and not a.attisdropped)
            then 'yes' else 'no' end,
       'kept as it is until 3.5'),
  (17, 'members.profile rows with data',
       (select count(*) from public.members x
         where to_jsonb(x) -> 'profile' is not null
           and to_jsonb(x) -> 'profile' not in ('null'::jsonb, '{}'::jsonb))::text,
       'a count only — values are never shown (D28, decided in 3.5)'),
  (18, 'members.grade is NOT NULL',
       (select a.attnotnull::text from pg_attribute a
         where a.attrelid = 'public.members'::regclass and a.attname = 'grade' and not a.attisdropped),
       'before 3B: true · after: false (D42, filled by nobody new)'),
  (19, 'Phase 3B functions already present', coalesce((select v from new3b), '(none)'),
       'expect before the first run: (none)'),
  (20, 'login keys locked right now',
       (select count(*) from public.login_attempts a where a.locked_until > now())::text, 'info'),
  (21, 'index members_member_id_key = plain unique index on member_id',
       case when exists (
              select 1 from pg_index x
               where x.indexrelid = to_regclass('public.members_member_id_key')
                 and x.indrelid = 'public.members'::regclass
                 and x.indisunique and x.indisvalid and x.indnatts = 1
                 and x.indpred is null and x.indexprs is null
                 and x.indkey[0] = (select a.attnum from pg_attribute a
                                     where a.attrelid = 'public.members'::regclass
                                       and a.attname = 'member_id'))
            then 'yes' else '멈춤 — missing or not plain (the pk swap needs it)' end,
       'expect: yes (3B turns this index into the primary key)')
)
select no, check_name as "check", value, note from rows_ order by no;
