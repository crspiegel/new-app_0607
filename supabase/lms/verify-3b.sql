-- ============================================================================
-- LMS Phase 3B — verify-3b.sql  (leaves NO trace: everything is rolled back)
-- ----------------------------------------------------------------------------
-- Run AFTER the "LMS (Phase 3B)" block of supabase/migration.sql (D49).
-- Supabase Dashboard → SQL Editor → New query → paste this whole file →
-- click once inside the editor (so no text is selected) → Run.
--
-- What it does: makes two test branches (검증3지사A / 검증3지사B), each with a
-- branch account, teachers and students — the SAME login ID 'zz-v3-kim' in
-- both (possible since the primary key moved to member_id, D41) — and signs
-- them in as the anon role with an x-lms-token header (what the browser does
-- through PostgREST); the top admin acts through its JWT (the first row of
-- public.admins). Then it tries every cell of the permission table D45,
-- allowed and denied, plus D44 (ID clashes, suffix suggestions), D46
-- (unlocking), D47 (delete, sessions ended), the bulk RPCs (all or nothing),
-- the primary key swap and the removal of the old member RPCs. A denial
-- passes only as error 42501 or a defined status value.
--
-- Two rollbacks, belt and braces:
--   1) the cases run inside a sub-transaction that ends with a deliberate
--      exception (LMS_VERIFY_ROLLBACK), so every change is undone before the
--      function returns; the last row ("trace") proves it;
--   2) the whole file is wrapped in begin … rollback.
-- It never prints a password, a hash or a token (logins show "token=43ch").
-- Expected result: one table, SUMMARY first, every row pass = true.
-- ============================================================================
begin;

-- Callers: 'jwt' = an Auth user id (request.jwt.claims), 'token' = an LMS
-- session token (x-lms-token). Kept in a temp table: the helper functions
-- below cannot see the main function's variables.
create temp table v3_who (who text primary key, kind text not null, val text not null);

-- Append one result row (no = running number).
create or replace function pg_temp.v3(
  res jsonb, p_area text, p_case text, p_expected text, p_actual text, p_pass boolean
)
returns jsonb
language sql
immutable
as $$
  select res || jsonb_build_array(jsonb_build_object(
    'no', jsonb_array_length(res) + 1, 'area', p_area, 'case', p_case,
    'expected', p_expected, 'actual', coalesce(p_actual, 'NULL'), 'pass', p_pass));
$$;

-- An lms_login() answer in one line — never the token itself.
create or replace function pg_temp.v3_login(j jsonb)
returns text
language sql
immutable
as $$
  select case
    when j is null then 'NULL'
    when j ->> 'status' = 'ok' then format('ok role=%s branch=%s token=%s',
      j ->> 'role', j ->> 'branch_name', coalesce(length(j ->> 'token')::text || 'ch', 'none'))
    when j ->> 'status' = 'choose' then 'choose '
      || coalesce((select string_agg(b ->> 'branch_name', ',' order by o)
                     from jsonb_array_elements(j -> 'branches') with ordinality x (b, o)), '')
    else coalesce(j ->> 'status', '?')
  end;
$$;

-- A 3B RPC answer in one line: status + the fields the cases look at.
-- Bulk rows: <row>:ok:<final login id> or <row>:error:<reason>[><suggestion]
create or replace function pg_temp.v3_sum(j jsonb)
returns text
language sql
immutable
as $$
  select case
    when j is null or j = 'null'::jsonb then 'NULL'
    when jsonb_typeof(j) <> 'object' then j::text
    when j ? 'token' or j ? 'branches' then pg_temp.v3_login(j)
    when j ? 'branch_name' and not j ? 'status' then 'session role=' || (j ->> 'role')
    else coalesce(j ->> 'status', '?')
      || coalesce(' field=' || (j ->> 'field'), '')
      || coalesce(' suggestion=' || (j ->> 'suggestion'), '')
      || coalesce(' added=' || (j ->> 'added'), '')
      || coalesce(' removed=' || (j ->> 'removed'), '')
      || coalesce(' cleared=' || (j ->> 'cleared'), '')
      || coalesce(' created=' || (j ->> 'created'), '')
      || coalesce(' assigned=' || (j ->> 'assigned'), '')
      || coalesce(' errors=' || (j ->> 'errors'), '')
      || coalesce(' rows=' || (
           select string_agg(case when r ->> 'result' = 'ok'
                                  then (r ->> 'row') || ':ok:' || coalesce(r ->> 'login_id', '?')
                                  else (r ->> 'row') || ':error:' || coalesce(r ->> 'reason', '?')
                                       || coalesce('>' || (r ->> 'suggestion'), '') end,
                             ',' order by (r ->> 'row')::int)
             from jsonb_array_elements(j -> 'rows') r), '')
  end;
$$;

-- Become a caller: 'owner' (the SQL Editor user), 'none' (anon, no token),
-- or a name from v3_who.
create or replace function pg_temp.v3_as(p_who text)
returns void
language plpgsql
as $$
declare
  w record;
begin
  reset role;
  perform set_config('request.headers', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if p_who = 'owner' then
    return;
  end if;
  if p_who = 'none' then
    set local role anon;
    return;
  end if;
  select * into w from pg_temp.v3_who x where x.who = p_who;
  if not found then
    raise exception 'v3: unknown caller %', p_who;
  end if;
  if w.kind = 'jwt' then
    perform set_config('request.jwt.claims',
      json_build_object('sub', w.val, 'role', 'authenticated')::text, true);
    set local role authenticated;
  else
    perform set_config('request.headers', json_build_object('x-lms-token', w.val)::text, true);
    set local role anon;
  end if;
end;
$$;

-- Run one case as a caller. kind 'j' = an RPC expression (jsonb answer),
-- 'q' = a query giving one text value, 'x' = a statement (row count),
-- 's' = a statement ('ok' or 'error <sqlstate>').
-- Any error: 'denied 42501' or 'error <sqlstate> <message>'.
create or replace function pg_temp.v3_run1(p_who text, p_kind text, p_sql text)
returns text
language plpgsql
as $$
declare
  j jsonb;
  a text;
  n bigint;
begin
  perform pg_temp.v3_as(p_who);
  begin
    if p_kind = 'j' then
      execute 'select to_jsonb((' || p_sql || '))' into j;
      a := pg_temp.v3_sum(j);
    elsif p_kind = 'q' then
      execute p_sql into a;
      a := coalesce(a, 'NULL');
    elsif p_kind = 's' then
      execute p_sql;
      a := 'ok';
    else
      execute p_sql;
      get diagnostics n = row_count;
      a := 'rows=' || n;
    end if;
  exception when others then
    a := case when sqlstate = '42501' then 'denied 42501'
              when p_kind = 's' then 'error ' || sqlstate  -- sqlstate only: messages vary by version
              else 'error ' || sqlstate || ' ' || sqlerrm end;
  end;
  reset role;
  return a;
end;
$$;

-- Run a list of cases: {area, who, case, kind, sql, expected} per row;
-- expected 'a | b' accepts either.
create or replace function pg_temp.v3_run(res jsonb, cases text[])
returns jsonb
language plpgsql
as $$
declare
  r text[];
  a text;
begin
  foreach r slice 1 in array cases loop
    a := pg_temp.v3_run1(r[2], r[4], r[5]);
    res := pg_temp.v3(res, r[1], r[2] || ': ' || r[3], r[6], a,
                      a = any (string_to_array(r[6], ' | ')));
  end loop;
  return res;
end;
$$;

-- Sign in as anon through lms_login(); keep the token under p_who (never
-- printed). Returns the one-line answer.
create or replace function pg_temp.v3_signin(
  p_who text, p_id text, p_pw text, p_branch uuid default null
)
returns text
language plpgsql
as $$
declare
  j jsonb;
begin
  perform pg_temp.v3_as('none');
  j := public.lms_login(p_id, p_pw, p_branch);
  reset role;
  if p_who is not null and j ->> 'status' = 'ok' then
    insert into pg_temp.v3_who (who, kind, val) values (p_who, 'token', j ->> 'token')
    on conflict (who) do update set val = excluded.val;
  end if;
  return pg_temp.v3_login(j);
end;
$$;

-- The attack of the security review (H1): teacher A1 owns a student whose ID
-- equals the ID of a teacher in branch B, sets that student's password to a
-- guess and signs in with it. 'ok' = only its own student matched; 'choose'
-- would mean the guess is branch B's password.
create or replace function pg_temp.v3_guess(p_own uuid, p_pw text)
returns text
language plpgsql
as $$
declare
  j jsonb;
begin
  perform pg_temp.v3_as('ta1');
  j := public.lms_member_update(p_own, p_password => p_pw);
  reset role;
  if j ->> 'status' <> 'ok' then
    return 'update ' || coalesce(j ->> 'status', '?');
  end if;
  return pg_temp.v3_signin(null, 'zz-v3-tb', p_pw);
end;
$$;

grant execute on function pg_temp.v3(jsonb, text, text, text, text, boolean) to public;
grant execute on function pg_temp.v3_guess(uuid, text) to public;
grant execute on function pg_temp.v3_login(jsonb) to public;
grant execute on function pg_temp.v3_sum(jsonb) to public;
grant execute on function pg_temp.v3_as(text) to public;
grant execute on function pg_temp.v3_run1(text, text, text) to public;
grant execute on function pg_temp.v3_signin(text, text, text, uuid) to public;

create or replace function pg_temp.lms_verify_3b()
returns table (no int, area text, check_case text, expected text, actual text, pass boolean)
language plpgsql
as $fn$
declare
  res       jsonb := '[]'::jsonb;
  admin_uid uuid;
  ghost    uuid := '00000000-0000-4000-8000-00000000dead';
  br_a      uuid;
  br_b      uuid;
  br_c      uuid;
  m_ba      uuid;
  m_bb      uuid;
  m_ta1     uuid;
  m_ta2     uuid;
  m_tb      uuid;
  m_sa1     uuid;
  m_sa2     uuid;
  m_sb      uuid;
  m_kima    uuid;
  m_kimb    uuid;
  m_lk      uuid;
  m_lk2     uuid;
  m_ns      uuid;
  m_atk     uuid;
  zz_ids    uuid[];
  k_a1      uuid;
  k_a2      uuid;
  k_b       uuid;
  k_a5      uuid;
  k_a6      uuid;
  k_a7      uuid;
  k_a8      uuid;
  k_bx      uuid;
  -- the classes a member is in, as the owner sees them (D53 rows)
  q_classes text := $q$select coalesce(string_agg(k.name, ',' order by k.name), '-')
                        from public.class_members cm join public.classes k on k.id = cm.class_id
                       where cm.member_id = %L$q$;
  a         text;
  e         text;
  rpcs      text[] := array[
    'lms_member_list', 'lms_member_create', 'lms_member_update', 'lms_member_delete',
    'lms_check_login_ids', 'lms_branch_create', 'lms_branch_update', 'lms_class_create',
    'lms_class_update', 'lms_class_delete', 'lms_class_add_member', 'lms_class_remove_member',
    'lms_unlock_member', 'lms_unlock_key', 'lms_bulk_create_members', 'lms_bulk_assign'];
  helpers   text[] := array[
    'lms_caller', 'lms_id_rule_ok', 'lms_pw_rule_ok', 'lms_id_taken', 'lms_id_suggest',
    'lms_can_manage_member', 'lms_can_manage_class', 'lms_can_create_role',
    'lms_member_insert', 'lms_members_end_sessions'];
begin
  select x.user_id into admin_uid from public.admins x limit 1;
  res := pg_temp.v3(res, 'setup', 'a public.admins row to act as the top admin', 'yes',
                    case when admin_uid is null then 'no' else 'yes' end, admin_uid is not null);

  begin -- ===== everything in this block is undone at the end =====
  if admin_uid is not null then

  -- ---------------------------------------------------------------- setup
  insert into pg_temp.v3_who (who, kind, val) values
    ('admin', 'jwt', admin_uid::text),
    ('authuser', 'jwt', '00000000-0000-4000-8000-00000000beef');  -- signed in, not an admin

  insert into public.branches (code, name) values ('zz-v3-a', '검증3지사A') returning id into br_a;
  insert into public.branches (code, name) values ('zz-v3-b', '검증3지사B') returning id into br_b;

  insert into public.members (id, password_hash, grade, role, branch_id, display_name) values
    ('zz-v3-ba',  extensions.crypt('ba11', extensions.gen_salt('bf')), 1, 1, br_a, 'V3 지사A'),
    ('zz-v3-bb',  extensions.crypt('bb11', extensions.gen_salt('bf')), 1, 1, br_b, 'V3 지사B'),
    ('zz-v3-ta1', extensions.crypt('ta11', extensions.gen_salt('bf')), 2, 2, br_a, null),
    ('zz-v3-ta2', extensions.crypt('ta22', extensions.gen_salt('bf')), 2, 2, br_a, null),
    ('zz-v3-tb',  extensions.crypt('tb11', extensions.gen_salt('bf')), 2, 2, br_b, null),
    ('zz-v3-sa1', extensions.crypt('sa11', extensions.gen_salt('bf')), 3, 3, br_a, null),
    ('zz-v3-sa2', extensions.crypt('sa22', extensions.gen_salt('bf')), 3, 3, br_a, null),
    ('zz-v3-sb',  extensions.crypt('sb11', extensions.gen_salt('bf')), 3, 3, br_b, null),
    ('zz-v3-kim', extensions.crypt('kim1', extensions.gen_salt('bf')), 3, 3, br_a, '김 A'),
    ('zz-v3-kim', extensions.crypt('kim1', extensions.gen_salt('bf')), 3, 3, br_b, '김 B'),
    ('zz-v3-lk',  extensions.crypt('lk11', extensions.gen_salt('bf')), 3, 3, br_a, null),
    ('zz-v3-lk2', extensions.crypt('lk22', extensions.gen_salt('bf')), 3, 3, br_a, null);

  select m.member_id into m_ba  from public.members m where m.id = 'zz-v3-ba';
  select m.member_id into m_bb  from public.members m where m.id = 'zz-v3-bb';
  select m.member_id into m_ta1 from public.members m where m.id = 'zz-v3-ta1';
  select m.member_id into m_ta2 from public.members m where m.id = 'zz-v3-ta2';
  select m.member_id into m_tb  from public.members m where m.id = 'zz-v3-tb';
  select m.member_id into m_sa1 from public.members m where m.id = 'zz-v3-sa1';
  select m.member_id into m_sa2 from public.members m where m.id = 'zz-v3-sa2';
  select m.member_id into m_sb  from public.members m where m.id = 'zz-v3-sb';
  select m.member_id into m_kima from public.members m where m.id = 'zz-v3-kim' and m.branch_id = br_a;
  select m.member_id into m_kimb from public.members m where m.id = 'zz-v3-kim' and m.branch_id = br_b;
  select m.member_id into m_lk  from public.members m where m.id = 'zz-v3-lk';
  select m.member_id into m_lk2 from public.members m where m.id = 'zz-v3-lk2';

  insert into public.classes (branch_id, name, teacher_id) values (br_a, 'V3반A1', m_ta1) returning id into k_a1;
  insert into public.classes (branch_id, name, teacher_id) values (br_a, 'V3반A2', m_ta2) returning id into k_a2;
  insert into public.classes (branch_id, name, teacher_id) values (br_b, 'V3반B', m_tb) returning id into k_b;
  insert into public.class_members (class_id, member_id) values
    (k_a1, m_sa1), (k_a1, m_kima), (k_a1, m_lk), (k_b, m_sb), (k_b, m_kimb);

  -- --------------------------------------------- schema (D41, D42) — owner
  res := pg_temp.v3_run(res, array[
    ['schema', 'owner', 'members primary key = member_id (D41)', 'q',
     $q$select pg_get_constraintdef(c.oid) from pg_constraint c
         where c.conrelid = 'public.members'::regclass and c.contype = 'p'$q$,
     'PRIMARY KEY (member_id)'],
    ['schema', 'owner', 'the same login ID in two branches (made above)', 'q',
     $q$select count(*)::text from public.members where id = 'zz-v3-kim'$q$, '2'],
    ['schema', 'owner', 'foreign keys into members use member_id only', 'q',
     $q$select count(*)::text from pg_constraint c
         where c.contype = 'f' and c.confrelid = 'public.members'::regclass
           and c.confkey <> array[(select a.attnum from pg_attribute a
                                    where a.attrelid = 'public.members'::regclass
                                      and a.attname = 'member_id')]::int2[]$q$, '0'],
    ['schema', 'owner', 'members.id stays NOT NULL', 'q',
     $q$select attnotnull::text from pg_attribute
         where attrelid = 'public.members'::regclass and attname = 'id'$q$, 'true'],
    ['schema', 'owner', 'members.grade may be NULL (D42: new accounts leave it empty)', 'q',
     $q$select (not attnotnull)::text from pg_attribute
         where attrelid = 'public.members'::regclass and attname = 'grade'$q$, 'true'],
    ['schema', 'owner', 'old RPCs create_member / update_member / set_member_active gone (D42)', 'q',
     $q$select coalesce(string_agg(p.oid::regprocedure::text, ', '), '(none)') from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and p.proname in ('create_member', 'update_member', 'set_member_active')$q$, '(none)'],
    ['schema', 'owner', 'verify_member_login kept (removed in 3.5)', 'q',
     $q$select count(*)::text from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.proname = 'verify_member_login'$q$, '1'],
    ['schema', 'owner', 'triggers on members', 'q',
     $q$select string_agg(t.tgname, ', ' order by t.tgname collate "C") from pg_trigger t
         where t.tgrelid = 'public.members'::regclass and not t.tgisinternal$q$,
     'members_lms_compat, members_lms_end_sessions'],
    ['schema', 'owner', 'a row with neither role nor grade is refused (no silent role 2)', 's',
     format('insert into public.members (id, password_hash, branch_id) values (%L, %L, %L)',
            'zz-v3-norole', 'x', br_a), 'error 23502'],
    ['schema', 'owner', 'grade written on a branch account', 's',
     format('update public.members set grade = 2 where member_id = %L', m_ba), 'ok'],
    ['schema', 'owner', '… its role stays 1 (grade no longer moves role)', 'q',
     format('select role::text from public.members where member_id = %L', m_ba), '1']
  ]);

  -- --------------------------------------------- login (as anon) — regression
  res := pg_temp.v3_run(res, array[
    ['login', 'owner', 'anon login: branch account A', 'q',
     format('select pg_temp.v3_signin(%L, %L, %L)', 'ba', 'zz-v3-ba', 'ba11'),
     'ok role=1 branch=검증3지사A token=43ch'],
    ['login', 'owner', 'anon login: branch account B', 'q',
     format('select pg_temp.v3_signin(%L, %L, %L)', 'bb', 'zz-v3-bb', 'bb11'),
     'ok role=1 branch=검증3지사B token=43ch'],
    ['login', 'owner', 'anon login: teacher A1', 'q',
     format('select pg_temp.v3_signin(%L, %L, %L)', 'ta1', 'zz-v3-ta1', 'ta11'),
     'ok role=2 branch=검증3지사A token=43ch'],
    ['login', 'owner', 'anon login: teacher A2', 'q',
     format('select pg_temp.v3_signin(%L, %L, %L)', 'ta2', 'zz-v3-ta2', 'ta22'),
     'ok role=2 branch=검증3지사A token=43ch'],
    ['login', 'owner', 'anon login: teacher B', 'q',
     format('select pg_temp.v3_signin(%L, %L, %L)', 'tb', 'zz-v3-tb', 'tb11'),
     'ok role=2 branch=검증3지사B token=43ch'],
    ['login', 'owner', 'anon login: student A1', 'q',
     format('select pg_temp.v3_signin(%L, %L, %L)', 'sa1', 'zz-v3-sa1', 'sa11'),
     'ok role=3 branch=검증3지사A token=43ch'],
    ['login', 'owner', 'anon login: student B', 'q',
     format('select pg_temp.v3_signin(%L, %L, %L)', 'sb', 'zz-v3-sb', 'sb11'),
     'ok role=3 branch=검증3지사B token=43ch'],
    ['login', 'owner', 'identical ID in 2 branches, right password → choose', 'q',
     format('select pg_temp.v3_signin(null, %L, %L)', 'zz-v3-kim', 'kim1'),
     'choose 검증3지사A,검증3지사B'],
    ['login', 'owner', 'identical ID → call again with branch A', 'q',
     format('select pg_temp.v3_signin(%L, %L, %L, %L)', 'kima', 'zz-v3-kim', 'kim1', br_a),
     'ok role=3 branch=검증3지사A token=43ch'],
    ['login', 'ta1', 'lms_session() with the token', 'j', 'public.lms_session()', 'session role=2'],
    ['login', 'owner', 'student zz-v3-lk: 5 wrong passwords', 'q',
     $q$select string_agg(pg_temp.v3_signin(null, 'zz-v3-lk', 'bad' || g), ',' order by g)
          from generate_series(1, 5) g$q$,
     'invalid,invalid,invalid,invalid,invalid'],
    ['login', 'owner', 'student zz-v3-lk: now locked (right password)', 'q',
     format('select pg_temp.v3_signin(null, %L, %L)', 'zz-v3-lk', 'lk11'), 'locked']
  ]);

  -- --------------------------------------------- list (D45 row 2, D46 lock info)
  res := pg_temp.v3_run(res, array[
    ['list', 'admin', 'branch A members (all roles)', 'q',
     format($q$select string_agg(l.login_id, ',' order by l.login_id collate "C")
                 from public.lms_member_list(%L) l$q$, br_a),
     'zz-v3-ba,zz-v3-kim,zz-v3-lk,zz-v3-lk2,zz-v3-sa1,zz-v3-sa2,zz-v3-ta1,zz-v3-ta2'],
    ['list', 'admin', 'no branch filter → every branch', 'q',
     $q$select count(*)::text from public.lms_member_list() l where l.login_id like 'zz-v3-%'$q$, '12'],
    ['list', 'ba', 'own branch teachers + students', 'q',
     $q$select string_agg(l.login_id, ',' order by l.login_id collate "C") from public.lms_member_list() l$q$,
     'zz-v3-kim,zz-v3-lk,zz-v3-lk2,zz-v3-sa1,zz-v3-sa2,zz-v3-ta1,zz-v3-ta2'],
    ['list', 'ba', 'asks for branch B → still its own branch', 'q',
     format($q$select string_agg(l.login_id, ',' order by l.login_id collate "C")
                 from public.lms_member_list(%L) l$q$, br_b),
     'zz-v3-kim,zz-v3-lk,zz-v3-lk2,zz-v3-sa1,zz-v3-sa2,zz-v3-ta1,zz-v3-ta2'],
    ['list', 'ta1', 'own branch students', 'q',
     $q$select string_agg(l.login_id, ',' order by l.login_id collate "C") from public.lms_member_list() l$q$,
     'zz-v3-kim,zz-v3-lk,zz-v3-lk2,zz-v3-sa1,zz-v3-sa2'],
    ['list', 'bb', 'branch B teachers + students', 'q',
     $q$select string_agg(l.login_id, ',' order by l.login_id collate "C") from public.lms_member_list() l$q$,
     'zz-v3-kim,zz-v3-sb,zz-v3-tb'],
    ['list', 'tb', 'branch B students', 'q',
     $q$select string_agg(l.login_id, ',' order by l.login_id collate "C") from public.lms_member_list() l$q$,
     'zz-v3-kim,zz-v3-sb'],
    ['list', 'sa1', 'student', 'q', 'select count(*)::text from public.lms_member_list()', 'denied 42501'],
    ['list', 'none', 'no session', 'q', 'select count(*)::text from public.lms_member_list()', 'denied 42501'],
    ['list', 'authuser', 'Auth user who is not an admin', 'q',
     'select count(*)::text from public.lms_member_list()', 'denied 42501'],
    ['list', 'ta1', 'lock state + seconds left (D46)', 'q',
     $q$select string_agg(l.login_id || ' locked=' || l.locked || ' '
                          || case when l.lock_retry_sec between 1 and 600 then '1..600s'
                                  else coalesce(l.lock_retry_sec::text, '-') end,
                          ',' order by l.login_id collate "C")
          from public.lms_member_list() l where l.login_id in ('zz-v3-lk', 'zz-v3-sa1')$q$,
     'zz-v3-lk locked=true 1..600s,zz-v3-sa1 locked=false -'],
    ['list', 'ta1', 'class ids of a student', 'q',
     $q$select array_length(l.class_ids, 1)::text from public.lms_member_list() l
         where l.login_id = 'zz-v3-kim'$q$, '1'],
    ['list', 'owner', 'no password / hash column in the result (D14)', 'q',
     $q$select (pg_get_function_result('public.lms_member_list(uuid)'::regprocedure)
                ~* 'password|hash')::text$q$, 'false']
  ]);

  -- --------------------------------------------- lms_check_login_ids (D44, §4.5)
  res := pg_temp.v3_run(res, array[
    ['check-ids', 'ta1', 'students: taken here / only in B / a branch account / rule / new', 'q',
     $q$select string_agg(c.input || '=' || c.status || coalesce('>' || c.suggestion, ''), ',' order by c.n)
          from public.lms_check_login_ids(array['zz-v3-sa1', 'zz-v3-sb', 'zz-v3-bb', 'Bad ID', 'ZZ-V3-New1'], 3)
               with ordinality c (input, login_id, status, suggestion, n)$q$,
     'zz-v3-sa1=duplicate>zz-v3-sa12,zz-v3-sb=ok,zz-v3-bb=duplicate>zz-v3-bb2,Bad ID=invalid,ZZ-V3-New1=ok'],
    ['check-ids', 'bb', 'same list from branch B: answers only for its own branch', 'q',
     $q$select string_agg(c.input || '=' || c.status || coalesce('>' || c.suggestion, ''), ',' order by c.n)
          from public.lms_check_login_ids(array['zz-v3-sa1', 'zz-v3-sb', 'zz-v3-bb', 'Bad ID', 'ZZ-V3-New1'], 3)
               with ordinality c (input, login_id, status, suggestion, n)$q$,
     'zz-v3-sa1=ok,zz-v3-sb=duplicate>zz-v3-sb2,zz-v3-bb=duplicate>zz-v3-bb2,Bad ID=invalid,ZZ-V3-New1=ok'],
    ['check-ids', 'bb', 'asks about branch A → still answers for branch B (no enumeration)', 'q',
     format($q$select string_agg(c.input || '=' || c.status || coalesce('>' || c.suggestion, ''), ',')
                 from public.lms_check_login_ids(array['zz-v3-sa1'], 3, %L) c$q$, br_a),
     'zz-v3-sa1=ok'],
    ['check-ids', 'ba', 'teacher IDs', 'q',
     $q$select string_agg(c.input || '=' || c.status || coalesce('>' || c.suggestion, ''), ',')
          from public.lms_check_login_ids(array['zz-v3-ta1'], 2) c$q$,
     'zz-v3-ta1=duplicate>zz-v3-ta12'],
    ['check-ids', 'admin', 'a branch-account ID must be free in every branch', 'q',
     format($q$select string_agg(c.input || '=' || c.status || coalesce('>' || c.suggestion, ''), ',')
                 from public.lms_check_login_ids(array['zz-v3-sb'], 1, %L) c$q$, br_a),
     'zz-v3-sb=duplicate>zz-v3-sb2'],
    ['check-ids', 'ta1', 'a teacher asks about teacher IDs', 'q',
     $q$select count(*)::text from public.lms_check_login_ids(array['x1'], 2)$q$, 'denied 42501'],
    ['check-ids', 'sa1', 'student', 'q',
     $q$select count(*)::text from public.lms_check_login_ids(array['x1'], 3)$q$, 'denied 42501'],
    ['check-ids', 'none', 'no session', 'q',
     $q$select count(*)::text from public.lms_check_login_ids(array['x1'], 3)$q$, 'denied 42501'],
    ['check-ids', 'ta1', '501 IDs', 'q',
     $q$select count(*)::text from public.lms_check_login_ids(
          (select array_agg('zz' || g) from generate_series(1, 501) g), 3)$q$,
     'error 22023 at most 500 IDs per call'],
    ['check-ids', 'admin', 'admin without a branch', 'q',
     $q$select count(*)::text from public.lms_check_login_ids(array['x1'], 3)$q$,
     'error 22023 p_branch_id is required']
  ]);

  -- --------------------------------------------- branches (D45 row 1)
  res := pg_temp.v3_run(res, array[
    ['branch', 'admin', 'create', 'j', format('public.lms_branch_create(%L)', '검증3지사C'), 'ok'],
    ['branch', 'admin', 'create with a name in use', 'j',
     format('public.lms_branch_create(%L)', '검증3지사A'), 'duplicate field=name'],
    ['branch', 'admin', 'create with a blank name', 'j',
     format('public.lms_branch_create(%L)', '  '), 'invalid field=name'],
    ['branch', 'admin', 'create with a code (stored lower-case)', 'j',
     format('public.lms_branch_create(%L, %L)', '검증3지사D', 'ZZ-V3-D'), 'ok'],
    ['branch', 'owner', '… its code', 'q',
     $q$select code from public.branches where name = '검증3지사D'$q$, 'zz-v3-d'],
    ['branch', 'admin', 'create with a code in use', 'j',
     format('public.lms_branch_create(%L, %L)', '검증3지사E', 'zz-v3-a'), 'duplicate field=code'],
    ['branch', 'admin', 'create with a code outside the rule', 'j',
     format('public.lms_branch_create(%L, %L)', '검증3지사E', 'bad code'), 'invalid field=code'],
    ['branch', 'admin', 'no code given', 'j', format('public.lms_branch_create(%L)', '검증3지사F'), 'ok'],
    ['branch', 'owner', '… one is made', 'q',
     $q$select (code ~ '^b-[0-9a-f]{12}$')::text from public.branches where name = '검증3지사F'$q$, 'true'],
    ['branch', 'ba', 'create', 'j', format('public.lms_branch_create(%L)', '검증3지사X'), 'denied 42501'],
    ['branch', 'ta1', 'create', 'j', format('public.lms_branch_create(%L)', '검증3지사X'), 'denied 42501'],
    ['branch', 'sa1', 'create', 'j', format('public.lms_branch_create(%L)', '검증3지사X'), 'denied 42501'],
    ['branch', 'none', 'create', 'j', format('public.lms_branch_create(%L)', '검증3지사X'), 'denied 42501'],
    ['branch', 'authuser', 'create', 'j', format('public.lms_branch_create(%L)', '검증3지사X'), 'denied 42501']
  ]);
  select b.id into br_c from public.branches b where b.name = '검증3지사C';
  res := pg_temp.v3_run(res, array[
    ['branch', 'admin', 'rename', 'j',
     format('public.lms_branch_update(%L, p_name => %L)', br_c, '검증3지사C2'), 'ok'],
    ['branch', 'admin', 'rename to a name in use', 'j',
     format('public.lms_branch_update(%L, p_name => %L)', br_c, '검증3지사B'), 'duplicate field=name'],
    ['branch', 'ba', 'rename its own branch', 'j',
     format('public.lms_branch_update(%L, p_name => %L)', br_a, '검증3지사A2'), 'denied 42501'],
    ['branch', 'ta1', 'deactivate', 'j',
     format('public.lms_branch_update(%L, p_active => false)', br_a), 'denied 42501'],
    ['branch', 'admin', 'deactivate', 'j',
     format('public.lms_branch_update(%L, p_active => false)', br_c), 'ok'],
    ['branch', 'owner', '… is inactive', 'q',
     format('select active::text from public.branches where id = %L', br_c), 'false'],
    ['branch', 'admin', 'a branch that does not exist', 'j',
     format('public.lms_branch_update(%L, p_name => %L)', ghost, 'x'), 'not_found']
  ]);

  -- --------------------------------------------- create (D45 row 3, D44 rules)
  res := pg_temp.v3_run(res, array[
    ['create', 'admin', 'branch account in branch C', 'j',
     format('public.lms_member_create(%L, %L, 1, null, %L)', 'zz-v3-bc', 'bc11', br_c), 'ok'],
    ['create', 'admin', 'teacher in branch B', 'j',
     format('public.lms_member_create(%L, %L, 2, null, %L)', 'zz-v3-tb2', 'tb22', br_b), 'ok'],
    ['create', 'admin', 'no branch given', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-x', 'xx11'), 'invalid field=branch'],
    ['create', 'admin', 'a branch that does not exist', 'j',
     format('public.lms_member_create(%L, %L, 3, null, %L)', 'zz-v3-x', 'xx11', ghost), 'invalid field=branch'],
    ['create', 'ba', 'teacher', 'j',
     format('public.lms_member_create(%L, %L, 2)', 'zz-v3-nt', 'nt11'), 'ok'],
    ['create', 'ba', 'student, asking for branch B', 'j',
     format('public.lms_member_create(%L, %L, 3, null, %L)', 'zz-v3-ns', 'ns11', br_b), 'ok'],
    ['create', 'owner', '… made in its own branch A (input ignored)', 'q',
     $q$select b.name from public.members m join public.branches b on b.id = m.branch_id
         where m.id = 'zz-v3-ns'$q$, '검증3지사A'],
    ['create', 'ba', 'branch account', 'j',
     format('public.lms_member_create(%L, %L, 1)', 'zz-v3-b1x', 'b1x1'), 'denied 42501'],
    ['create', 'ta1', 'student', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-ns2', 'ns22'), 'ok'],
    ['create', 'ta1', 'teacher', 'j',
     format('public.lms_member_create(%L, %L, 2)', 'zz-v3-nt2', 'nt22'), 'denied 42501'],
    ['create', 'sa1', 'student', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-ns3', 'ns33'), 'denied 42501'],
    ['create', 'none', 'student', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-ns3', 'ns33'), 'denied 42501'],
    ['create', 'authuser', 'student', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-ns3', 'ns33'), 'denied 42501'],
    ['create', 'ba', 'ID taken in its branch → next free suffix', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-kim', 'kim9'), 'duplicate suggestion=zz-v3-kim2'],
    ['create', 'ba', 'ID of a branch account elsewhere (D44)', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-bb', 'bb99'), 'duplicate suggestion=zz-v3-bb2'],
    ['create', 'ta1', 'ID of a student in branch B only → allowed', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-sb', 'sb99'), 'ok'],
    ['create', 'admin', 'branch account with an ID a member uses anywhere (D44)', 'j',
     format('public.lms_member_create(%L, %L, 1, null, %L)', 'zz-v3-sa2', 'sa99', br_b),
     'duplicate suggestion=zz-v3-sa22'],
    ['create', 'ta1', 'ID outside the rule', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'Bad ID!', 'pw11'), 'invalid field=login_id'],
    ['create', 'ta1', 'ID of 21 characters', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-abcdefghijklmno', 'ln11'), 'invalid field=login_id'],
    ['create', 'ta1', 'capitals are stored normalized', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'ZZ-V3-Upper', 'up11'), 'ok'],
    ['create', 'owner', '… stored as zz-v3-upper', 'q',
     $q$select count(*)::text from public.members where id = 'zz-v3-upper'$q$, '1'],
    ['create', 'ta1', 'Korean ID', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-김민준', 'kmj1'), 'ok'],
    ['create', 'ta1', 'Korean ID again → Korean suffix', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-김민준', 'kmj2'), 'duplicate suggestion=zz-v3-김민준2'],
    ['create', 'ta1', 'password of 3', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-p3', 'abc'), 'invalid field=password'],
    ['create', 'ta1', 'password of 11', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-p11', 'abcdefghijk'), 'invalid field=password'],
    ['create', 'ta1', 'password with a space', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-psp', 'ab cd'), 'invalid field=password'],
    ['create', 'ta1', 'password of 4 digits', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-pin', '1234'), 'ok'],
    ['create', 'owner', '… and it logs in', 'q',
     format('select pg_temp.v3_signin(null, %L, %L)', 'zz-v3-pin', '1234'),
     'ok role=3 branch=검증3지사A token=43ch'],
    ['create', 'ta1', 'display name of 41', 'j',
     format('public.lms_member_create(%L, %L, 3, %L)', 'zz-v3-dn', 'dn11', repeat('가', 41)),
     'invalid field=display_name'],
    ['create', 'admin', 'zz-v3-kim2 in branch A', 'j',
     format('public.lms_member_create(%L, %L, 3, null, %L)', 'zz-v3-kim2', 'k2k2', br_a), 'ok'],
    ['create', 'ba', 'zz-v3-kim again → skips the used kim2', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-kim', 'kim9'), 'duplicate suggestion=zz-v3-kim3']
  ]);
  select m.member_id into m_ns from public.members m where m.id = 'zz-v3-ns';

  -- --------------------------------------------- update (D45 row 4, D47 sessions)
  res := pg_temp.v3_run(res, array[
    ['update', 'admin', 'student in branch B: name', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_sb, 'V3 B학생'), 'ok'],
    ['update', 'ba', 'own-branch teacher: name', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_ta1, 'V3 선생A1'), 'ok'],
    ['update', 'ba', 'student in branch B', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_sb, 'x'), 'denied 42501'],
    ['update', 'ba', 'itself (a branch account)', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_ba, 'x'), 'denied 42501'],
    ['update', 'ba', 'branch account B', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_bb, 'x'), 'denied 42501'],
    ['update', 'ta1', 'student of its class: name', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_sa1, 'V3 학생A1'), 'ok'],
    ['update', 'ta1', 'own-branch student not in its classes', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_sa2, 'x'), 'denied 42501'],
    ['update', 'ta1', 'another teacher', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_ta2, 'x'), 'denied 42501'],
    ['update', 'ta1', 'student in branch B', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_sb, 'x'), 'denied 42501'],
    ['update', 'ta2', 'student of another teacher''s class', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_sa1, 'x'), 'denied 42501'],
    ['update', 'sa1', 'itself', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_sa1, 'x'), 'denied 42501'],
    ['update', 'none', 'a student', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_sa1, 'x'), 'denied 42501'],
    ['update', 'authuser', 'a student', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_sa1, 'x'), 'denied 42501'],
    ['update', 'ta1', 'a member that does not exist', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', ghost, 'x'), 'denied 42501'],
    ['update', 'ba', 'login ID → a branch account''s ID (D44)', 'j',
     format('public.lms_member_update(%L, p_login_id => %L)', m_sa2, 'zz-v3-bb'), 'duplicate suggestion=zz-v3-bb2'],
    ['update', 'ba', 'login ID outside the rule', 'j',
     format('public.lms_member_update(%L, p_login_id => %L)', m_sa2, 'bad id'), 'invalid field=login_id'],
    ['update', 'ba', 'login ID change', 'j',
     format('public.lms_member_update(%L, p_login_id => %L)', m_sa2, 'ZZ-V3-SA2B'), 'ok'],
    ['update', 'owner', '… stored normalized', 'q',
     format('select id from public.members where member_id = %L', m_sa2), 'zz-v3-sa2b'],
    ['update', 'ta1', 'login ID change of its student (D52: admin and branch account only)', 'j',
     format('public.lms_member_update(%L, p_login_id => %L)', m_sa1, 'zz-v3-sa1x'), 'denied 42501'],
    ['update', 'ta1', '… also when it would be taken', 'j',
     format('public.lms_member_update(%L, p_login_id => %L)', m_sa1, 'zz-v3-kim'), 'denied 42501'],
    ['update', 'owner', '… nothing changed', 'q',
     format('select id from public.members where member_id = %L', m_sa1), 'zz-v3-sa1'],
    ['update', 'admin', 'login ID → taken in the branch', 'j',
     format('public.lms_member_update(%L, p_login_id => %L)', m_sa1, 'zz-v3-kim'), 'duplicate suggestion=zz-v3-kim3'],
    ['update', 'ta1', 'password of 2', 'j',
     format('public.lms_member_update(%L, p_password => %L)', m_sa1, 'ab'), 'invalid field=password'],
    ['update', 'ta1', 'password reset', 'j',
     format('public.lms_member_update(%L, p_password => %L)', m_sa1, 'new1'), 'ok'],
    ['update', 'owner', '… the student''s sessions are gone (D47)', 'q',
     format('select count(*)::text from public.lms_sessions where member_id = %L', m_sa1), '0'],
    ['update', 'sa1', '… its old token is dead', 'j', 'public.lms_session()', 'NULL'],
    ['update', 'owner', '… the new password logs in', 'q',
     format('select pg_temp.v3_signin(%L, %L, %L)', 'sa1', 'zz-v3-sa1', 'new1'),
     'ok role=3 branch=검증3지사A token=43ch'],
    ['update', 'ba', 'deactivate a student', 'j',
     format('public.lms_member_update(%L, p_active => false)', m_kima), 'ok'],
    ['update', 'owner', '… its sessions are gone (D47)', 'q',
     format('select count(*)::text from public.lms_sessions where member_id = %L', m_kima), '0'],
    ['update', 'owner', '… the shared ID now opens only branch B', 'q',
     format('select pg_temp.v3_signin(null, %L, %L)', 'zz-v3-kim', 'kim1'),
     'ok role=3 branch=검증3지사B token=43ch'],
    ['update', 'ba', 'activate again', 'j',
     format('public.lms_member_update(%L, p_active => true)', m_kima), 'ok'],
    ['update', 'ta1', 'deactivate a student of its class', 'j',
     format('public.lms_member_update(%L, p_active => false)', m_kima), 'ok'],
    ['update', 'ta1', 'activate it again', 'j',
     format('public.lms_member_update(%L, p_active => true)', m_kima), 'ok'],
    ['update', 'ta1', 'blank name clears it', 'j',
     format('public.lms_member_update(%L, p_display_name => %L)', m_sa1, ''), 'ok'],
    ['update', 'owner', '… display_name is NULL', 'q',
     format('select coalesce(display_name, %L) from public.members where member_id = %L', 'NULL', m_sa1), 'NULL']
  ]);

  -- --------------------------------------------- classes (D45 row 5)
  res := pg_temp.v3_run(res, array[
    ['class', 'admin', 'create in B with a B teacher', 'j',
     format('public.lms_class_create(%L, %L, %L)', 'V3반B2', m_tb, br_b), 'ok'],
    ['class', 'admin', 'create in A with a B teacher', 'j',
     format('public.lms_class_create(%L, %L, %L)', 'V3반AX', m_tb, br_a), 'invalid field=teacher'],
    ['class', 'admin', 'create with no branch', 'j',
     format('public.lms_class_create(%L)', 'V3반AY'), 'invalid field=branch'],
    ['class', 'ba', 'create with teacher A2', 'j',
     format('public.lms_class_create(%L, %L)', 'V3반A3', m_ta2), 'ok'],
    ['class', 'owner', '… branch A, teacher A2', 'q',
     $q$select b.name || ' ' || coalesce(t.id, '-') from public.classes k
          join public.branches b on b.id = k.branch_id
          left join public.members t on t.member_id = k.teacher_id where k.name = 'V3반A3'$q$,
     '검증3지사A zz-v3-ta2'],
    ['class', 'ba', 'create with a teacher of branch B', 'j',
     format('public.lms_class_create(%L, %L)', 'V3반A4', m_tb), 'invalid field=teacher'],
    ['class', 'ba', 'create, asking for branch B', 'j',
     format('public.lms_class_create(%L, null, %L)', 'V3반A5', br_b), 'ok'],
    ['class', 'owner', '… made in branch A, no teacher', 'q',
     $q$select b.name || ' ' || coalesce(t.id, '-') from public.classes k
          join public.branches b on b.id = k.branch_id
          left join public.members t on t.member_id = k.teacher_id where k.name = 'V3반A5'$q$,
     '검증3지사A -'],
    ['class', 'ta1', 'create, naming teacher A2', 'j',
     format('public.lms_class_create(%L, %L)', 'V3반A6', m_ta2), 'ok'],
    ['class', 'owner', '… the teacher is itself (input ignored)', 'q',
     $q$select b.name || ' ' || coalesce(t.id, '-') from public.classes k
          join public.branches b on b.id = k.branch_id
          left join public.members t on t.member_id = k.teacher_id where k.name = 'V3반A6'$q$,
     '검증3지사A zz-v3-ta1'],
    ['class', 'sa1', 'create', 'j', format('public.lms_class_create(%L)', 'V3반S'), 'denied 42501'],
    ['class', 'none', 'create', 'j', format('public.lms_class_create(%L)', 'V3반S'), 'denied 42501'],
    ['class', 'authuser', 'create', 'j', format('public.lms_class_create(%L)', 'V3반S'), 'denied 42501'],
    ['class', 'ba', 'create with a name in use', 'j',
     format('public.lms_class_create(%L)', 'V3반A1'), 'duplicate field=name'],
    ['class', 'ba', 'create with a blank name', 'j',
     format('public.lms_class_create(%L)', ' '), 'invalid field=name']
  ]);
  select k.id into k_a5 from public.classes k where k.name = 'V3반A5';
  select k.id into k_a6 from public.classes k where k.name = 'V3반A6';
  res := pg_temp.v3_run(res, array[
    ['class', 'ta1', 'rename its class', 'j',
     format('public.lms_class_update(%L, p_name => %L)', k_a1, 'V3반A1x'), 'ok'],
    ['class', 'ta1', 'rename it back', 'j',
     format('public.lms_class_update(%L, p_name => %L)', k_a1, 'V3반A1'), 'ok'],
    ['class', 'ta1', 'rename another teacher''s class', 'j',
     format('public.lms_class_update(%L, p_name => %L)', k_a2, 'x'), 'denied 42501'],
    ['class', 'ta1', 'change the teacher of its class', 'j',
     format('public.lms_class_update(%L, p_set_teacher => true, p_teacher_id => %L)', k_a1, m_ta2),
     'denied 42501'],
    ['class', 'ba', 'assign teacher A2', 'j',
     format('public.lms_class_update(%L, p_set_teacher => true, p_teacher_id => %L)', k_a1, m_ta2), 'ok'],
    ['class', 'ba', 'assign teacher A1 back', 'j',
     format('public.lms_class_update(%L, p_set_teacher => true, p_teacher_id => %L)', k_a1, m_ta1), 'ok'],
    ['class', 'ba', 'assign a teacher of branch B', 'j',
     format('public.lms_class_update(%L, p_set_teacher => true, p_teacher_id => %L)', k_a1, m_tb),
     'invalid field=teacher'],
    ['class', 'ba', 'rename a class of branch B', 'j',
     format('public.lms_class_update(%L, p_name => %L)', k_b, 'x'), 'denied 42501'],
    ['class', 'ba', 'blank name', 'j',
     format('public.lms_class_update(%L, p_name => %L)', k_a1, ''), 'invalid field=name'],
    ['class', 'ba', 'a name in use', 'j',
     format('public.lms_class_update(%L, p_name => %L)', k_a2, 'V3반A1'), 'duplicate field=name'],
    ['class', 'admin', 'deactivate class B', 'j',
     format('public.lms_class_update(%L, p_active => false)', k_b), 'ok'],
    ['class', 'ta1', 'a class that does not exist', 'j',
     format('public.lms_class_update(%L, p_name => %L)', ghost, 'x'), 'denied 42501'],
    ['class', 'ba', 'delete (D47: admin only)', 'j', format('public.lms_class_delete(%L)', k_a5), 'denied 42501'],
    ['class', 'ta1', 'delete its own class', 'j', format('public.lms_class_delete(%L)', k_a6), 'denied 42501'],
    ['class', 'admin', 'delete', 'j', format('public.lms_class_delete(%L)', k_a6), 'ok'],
    ['class', 'admin', 'delete one that does not exist', 'j',
     format('public.lms_class_delete(%L)', ghost), 'not_found']
  ]);

  -- --------------------------------------------- class members (D45 row 6)
  res := pg_temp.v3_run(res, array[
    ['assign', 'ta1', 'own-branch student into its class', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_sa2), 'ok added=true'],
    ['assign', 'ta1', 'the same again', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_sa2), 'ok added=false'],
    ['assign', 'ta1', 'a student of branch B', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_sb), 'denied 42501'],
    ['assign', 'ta1', 'into another teacher''s class', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a2, m_ns), 'denied 42501'],
    ['assign', 'ta1', 'a teacher as a class member', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_ta2), 'invalid field=member'],
    ['assign', 'ba', 'a student of branch B', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a2, m_sb), 'denied 42501'],
    ['assign', 'ba', 'own-branch student into any class of its branch', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a2, m_ns), 'ok added=true'],
    ['assign', 'ta1', 'list: class ids only of its own classes', 'q',
     $q$select coalesce(array_length(l.class_ids, 1), 0)::text from public.lms_member_list() l
         where l.login_id = 'zz-v3-ns'$q$, '0'],
    ['assign', 'ba', 'list: the branch account sees that class', 'q',
     $q$select coalesce(array_length(l.class_ids, 1), 0)::text from public.lms_member_list() l
         where l.login_id = 'zz-v3-ns'$q$, '1'],
    ['assign', 'ta1', 'list: it still sees that the student has a class (in_class)', 'q',
     $q$select l.in_class::text from public.lms_member_list() l where l.login_id = 'zz-v3-ns'$q$, 'true'],
    ['assign', 'ta1', 'a student already in another class (D51: only branch/admin move)', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_ns), 'denied 42501'],
    ['assign', 'ba', 'the branch account may put it in a second class', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_ns), 'ok added=true'],
    ['assign', 'ba', '… and take it out again', 'j',
     format('public.lms_class_remove_member(%L, %L)', k_a1, m_ns), 'ok removed=true'],
    ['assign', 'ba', 'into a class of branch B', 'j',
     format('public.lms_class_add_member(%L, %L)', k_b, m_ns), 'denied 42501'],
    ['assign', 'admin', 'a student into a class of another branch', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_sb), 'invalid field=member'],
    ['assign', 'sa1', 'add', 'j', format('public.lms_class_add_member(%L, %L)', k_a1, m_sa2), 'denied 42501'],
    ['assign', 'none', 'add', 'j', format('public.lms_class_add_member(%L, %L)', k_a1, m_sa2), 'denied 42501'],
    ['assign', 'ta1', 'take a student out of its class', 'j',
     format('public.lms_class_remove_member(%L, %L)', k_a1, m_sa2), 'ok removed=true'],
    ['assign', 'ta1', 'the same again', 'j',
     format('public.lms_class_remove_member(%L, %L)', k_a1, m_sa2), 'ok removed=false'],
    ['assign', 'ta1', '… the student has no class now: it may add it back (D51)', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_sa2), 'ok added=true'],
    ['assign', 'ta1', '… and out again', 'j',
     format('public.lms_class_remove_member(%L, %L)', k_a1, m_sa2), 'ok removed=true'],
    ['assign', 'ta2', 'take out of another teacher''s class', 'j',
     format('public.lms_class_remove_member(%L, %L)', k_a1, m_kima), 'denied 42501'],
    ['assign', 'sa1', 'take out', 'j',
     format('public.lms_class_remove_member(%L, %L)', k_a1, m_kima), 'denied 42501'],
    ['assign', 'tb', 'its own (inactive) class', 'j',
     format('public.lms_class_add_member(%L, %L)', k_b, m_sb), 'ok added=false']
  ]);

  -- --------------------------------------------- D53: a teacher moves a student
  -- between two of its own classes in one call (add = move). Any other class
  -- (another teacher's) still blocks it (D51); the branch account is unchanged.
  insert into public.classes (branch_id, name, teacher_id) values (br_a, 'V3반A7', m_ta1) returning id into k_a7;
  res := pg_temp.v3_run(res, array[
    ['assign', 'ta1', 'D53: its student of A1 into its class A7 = a move in one call', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a7, m_sa1), 'ok added=true'],
    ['assign', 'owner', '… out of A1, only in A7', 'q', format(q_classes, m_sa1), 'V3반A7'],
    ['assign', 'ta1', 'D53: and back to A1', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_sa1), 'ok added=true'],
    ['assign', 'owner', '… only in A1', 'q', format(q_classes, m_sa1), 'V3반A1'],
    ['assign', 'ta2', 'D53: a student of another teacher''s class into its class (D51 stays)', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a2, m_sa1), 'denied 42501'],
    ['assign', 'owner', '… not moved', 'q', format(q_classes, m_sa1), 'V3반A1'],
    ['assign', 'ba', 'D53 leaves the branch account alone: a second class, not a move', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a2, m_kima), 'ok added=true'],
    ['assign', 'owner', '… in A1 and A2', 'q', format(q_classes, m_kima), 'V3반A1,V3반A2'],
    ['assign', 'ta1', 'D53: that student into A7 — it is also in another teacher''s class', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a7, m_kima), 'denied 42501'],
    ['assign', 'owner', '… nothing moved', 'q', format(q_classes, m_kima), 'V3반A1,V3반A2'],
    ['assign', 'ba', '… out of A2 again', 'j',
     format('public.lms_class_remove_member(%L, %L)', k_a2, m_kima), 'ok removed=true'],
    ['assign', 'ba', 'a student of A1 also put in A7 (both are teacher A1''s)', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a7, m_lk), 'ok added=true'],
    ['assign', 'ta1', 'D53: that student into A7 again — already there, out of A1', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a7, m_lk), 'ok added=false'],
    ['assign', 'owner', '… only in A7', 'q', format(q_classes, m_lk), 'V3반A7'],
    ['assign', 'ta1', 'D53: back to A1', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_lk), 'ok added=true'],
    ['assign', 'owner', '… only in A1', 'q', format(q_classes, m_lk), 'V3반A1'],
    ['assign', 'ta1', 'D53: bulk assign is unchanged (3.4) — a student of A1 into A7', 'j',
     format('public.lms_bulk_assign(%L::jsonb)', '[{"class":"V3반A7","login_id":"zz-v3-sa1"}]'),
     'error assigned=0 errors=1 rows=1:error:in_other_class']
  ]);
  -- D53 edges (security review of D53): a class with no teacher is not the
  -- teacher's own; the admin only adds; three own classes; an "own" class in
  -- another branch (bad data) still blocks; the caller is read first.
  insert into public.classes (branch_id, name, teacher_id) values (br_a, 'V3반A8', m_ta1) returning id into k_a8;
  res := pg_temp.v3_run(res, array[
    ['assign', 'ba', 'a student of A1 also put in A5 (no teacher)', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a5, m_sa1), 'ok added=true'],
    ['assign', 'ta1', 'D53: that student into A7 — A5 is nobody''s, not its own', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a7, m_sa1), 'denied 42501'],
    ['assign', 'owner', '… still in A1 and A5', 'q', format(q_classes, m_sa1), 'V3반A1,V3반A5'],
    ['assign', 'ba', '… out of A5 again', 'j',
     format('public.lms_class_remove_member(%L, %L)', k_a5, m_sa1), 'ok removed=true'],
    ['assign', 'admin', 'D53 leaves the admin alone too: A7 as a second class', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a7, m_sa1), 'ok added=true'],
    ['assign', 'owner', '… in A1 and A7', 'q', format(q_classes, m_sa1), 'V3반A1,V3반A7'],
    ['assign', 'ta1', 'D53: from two of its classes (A1, A7) into a third (A8)', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a8, m_sa1), 'ok added=true'],
    ['assign', 'owner', '… only in A8', 'q', format(q_classes, m_sa1), 'V3반A8'],
    ['assign', 'ta1', 'D53: back to A1', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_sa1), 'ok added=true'],
    ['assign', 'owner', '… only in A1', 'q', format(q_classes, m_sa1), 'V3반A1'],
    ['assign', 'owner', 'D53: the caller is read (and checked) before anything else', 'q',
     $q$select (pg_get_functiondef('public.lms_class_add_member(uuid,uuid)'::regprocedure)
                ~ 'from public\.lms_caller\(\);\s+if not found or not public\.lms_can_manage_class')::text$q$,
     'true']
  ]);
  -- bad data on purpose: a class of branch B whose teacher is A1's ta1, with sa1 in it
  insert into public.classes (branch_id, name, teacher_id) values (br_b, 'V3반BX', m_ta1) returning id into k_bx;
  insert into public.class_members (class_id, member_id) values (k_bx, m_sa1);
  res := pg_temp.v3_run(res, array[
    ['assign', 'ta1', 'D53: a class of another branch never counts as its own', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a7, m_sa1), 'denied 42501'],
    ['assign', 'owner', '… nothing moved', 'q', format(q_classes, m_sa1), 'V3반A1,V3반BX']
  ]);
  delete from public.classes k where k.id in (k_a7, k_a8, k_bx);  -- later cases see the classes as before

  -- --------------------------------------------- unlock (D46)
  insert into public.login_attempts (key, fails, window_start, locked_until, updated_at) values
    ('id:zz-v3-lk2', 5, now(), now() + interval '10 minutes', now()),
    ('id:zz-v3-kim', 5, now(), now() + interval '10 minutes', now()),
    ('id:zz-v3-sb',  5, now(), now() + interval '10 minutes', now()),
    ('ip:203.0.113.77', 30, now(), now() + interval '10 minutes', now());
  res := pg_temp.v3_run(res, array[
    ['unlock', 'ta2', 'a student of another teacher''s class', 'j',
     format('public.lms_unlock_member(%L)', m_lk), 'denied 42501'],
    ['unlock', 'sa1', 'a student', 'j', format('public.lms_unlock_member(%L)', m_lk), 'denied 42501'],
    ['unlock', 'bb', 'a student of branch A', 'j', format('public.lms_unlock_member(%L)', m_lk), 'denied 42501'],
    ['unlock', 'none', 'a student', 'j', format('public.lms_unlock_member(%L)', m_lk), 'denied 42501'],
    ['unlock', 'ta1', 'a student of its class', 'j',
     format('public.lms_unlock_member(%L)', m_lk), 'ok cleared=true'],
    ['unlock', 'owner', '… it logs in again', 'q',
     format('select pg_temp.v3_signin(null, %L, %L)', 'zz-v3-lk', 'lk11'),
     'ok role=3 branch=검증3지사A token=43ch'],
    ['unlock', 'ta1', 'own-branch student not in its classes', 'j',
     format('public.lms_unlock_member(%L)', m_lk2), 'denied 42501'],
    ['unlock', 'ba', 'any member of its branch', 'j',
     format('public.lms_unlock_member(%L)', m_lk2), 'ok cleared=true'],
    ['unlock', 'ba', 'zz-v3-kim of branch A', 'j',
     format('public.lms_unlock_member(%L)', m_kima), 'ok cleared=true'],
    ['unlock', 'owner', '… one ID key for both branches: B is unlocked too (D46, accepted)', 'q',
     $q$select count(*)::text from public.login_attempts where key = 'id:zz-v3-kim'$q$, '0'],
    ['unlock', 'ba', 'an IP key', 'j',
     format('public.lms_unlock_key(%L)', 'ip:203.0.113.77'), 'denied 42501'],
    ['unlock', 'ta1', 'an IP key', 'j',
     format('public.lms_unlock_key(%L)', 'ip:203.0.113.77'), 'denied 42501'],
    ['unlock', 'admin', 'an IP key', 'j',
     format('public.lms_unlock_key(%L)', 'ip:203.0.113.77'), 'ok cleared=true'],
    ['unlock', 'admin', 'an ID key with no member behind it', 'j',
     format('public.lms_unlock_key(%L)', 'id:zz-v3-ghost'), 'ok cleared=false'],
    ['unlock', 'admin', 'not a key', 'j', format('public.lms_unlock_key(%L)', 'bogus'), 'invalid field=key'],
    ['unlock', 'admin', 'a member of branch B', 'j',
     format('public.lms_unlock_member(%L)', m_sb), 'ok cleared=true'],
    ['unlock', 'bb', 'itself (nothing locked)', 'j',
     format('public.lms_unlock_member(%L)', m_bb), 'ok cleared=false'],
    ['unlock', 'ta1', 'a member that does not exist', 'j',
     format('public.lms_unlock_member(%L)', ghost), 'denied 42501']
  ]);

  -- --------------------------------------------- bulk (3.4, §4.5)
  res := pg_temp.v3_run(res, array[
    ['bulk', 'ta1', 'two students, one into its class', 'j',
     format('public.lms_bulk_create_members(%L::jsonb, false)',
       '[{"login_id":"zz-v3-bk1","password":"bk11","role":3,"class":"V3반A1"},'
       '{"login_id":"zz-v3-bk2","password":"bk22","role":3}]'),
     'ok created=2 rows=1:ok:zz-v3-bk1,2:ok:zz-v3-bk2'],
    ['bulk', 'owner', '… made in branch A, bk1 in V3반A1', 'q',
     $q$select string_agg(m.id || '@' || b.name || coalesce('/' || k.name, ''), ',' order by m.id collate "C")
          from public.members m join public.branches b on b.id = m.branch_id
          left join public.class_members cm on cm.member_id = m.member_id
          left join public.classes k on k.id = cm.class_id
         where m.id in ('zz-v3-bk1', 'zz-v3-bk2')$q$,
     'zz-v3-bk1@검증3지사A/V3반A1,zz-v3-bk2@검증3지사A'],
    ['bulk', 'ta1', 'a teacher row among students → nothing made', 'j',
     format('public.lms_bulk_create_members(%L::jsonb, false)',
       '[{"login_id":"zz-v3-bk3","password":"bk33","role":3},'
       '{"login_id":"zz-v3-bk4","password":"bk44","role":2}]'),
     'error created=0 errors=1 rows=1:ok:zz-v3-bk3,2:error:role'],
    ['bulk', 'owner', '… row 1 was rolled back too', 'q',
     $q$select count(*)::text from public.members where id = 'zz-v3-bk3'$q$, '0'],
    ['bulk', 'ba', 'a taken ID, no auto suffix → nothing made', 'j',
     format('public.lms_bulk_create_members(%L::jsonb, false)',
       '[{"login_id":"zz-v3-sa1","password":"sa99","role":3},'
       '{"login_id":"zz-v3-bk5","password":"bk55","role":3}]'),
     'error created=0 errors=1 rows=1:error:duplicate>zz-v3-sa12,2:ok:zz-v3-bk5'],
    ['bulk', 'ba', 'the same with auto suffix', 'j',
     format('public.lms_bulk_create_members(%L::jsonb, true)',
       '[{"login_id":"zz-v3-sa1","password":"sa99","role":3},'
       '{"login_id":"zz-v3-bk5","password":"bk55","role":3}]'),
     'ok created=2 rows=1:ok:zz-v3-sa12,2:ok:zz-v3-bk5'],
    ['bulk', 'ba', 'a class that does not exist', 'j',
     format('public.lms_bulk_create_members(%L::jsonb)',
       '[{"login_id":"zz-v3-bk6","password":"bk66","role":3,"class":"없는반"}]'),
     'error created=0 errors=1 rows=1:error:class'],
    ['bulk', 'ta1', 'another teacher''s class', 'j',
     format('public.lms_bulk_create_members(%L::jsonb)',
       '[{"login_id":"zz-v3-bk7","password":"bk77","role":3,"class":"V3반A2"}]'),
     'error created=0 errors=1 rows=1:error:class_not_allowed'],
    ['bulk', 'ba', 'the same ID twice in the file, auto suffix', 'j',
     format('public.lms_bulk_create_members(%L::jsonb, true)',
       '[{"login_id":"zz-v3-dup","password":"du11","role":3},'
       '{"login_id":"zz-v3-dup","password":"du22","role":3}]'),
     'ok created=2 rows=1:ok:zz-v3-dup,2:ok:zz-v3-dup2'],
    ['bulk', 'ba', 'the same ID twice in the file, no auto suffix', 'j',
     format('public.lms_bulk_create_members(%L::jsonb, false)',
       '[{"login_id":"zz-v3-dupx","password":"du11","role":3},'
       '{"login_id":"zz-v3-dupx","password":"du22","role":3}]'),
     'error created=0 errors=1 rows=1:ok:zz-v3-dupx,2:error:duplicate>zz-v3-dupx2'],
    ['bulk', 'admin', 'a row for branch B', 'j',
     format('public.lms_bulk_create_members(%L::jsonb)',
       format('[{"login_id":"zz-v3-bk8","password":"bk88","role":3,"branch_id":"%s"}]', br_b)),
     'ok created=1 rows=1:ok:zz-v3-bk8'],
    ['bulk', 'owner', '… made in branch B', 'q',
     $q$select b.name from public.members m join public.branches b on b.id = m.branch_id
         where m.id = 'zz-v3-bk8'$q$, '검증3지사B'],
    ['bulk', 'admin', 'a row without a branch', 'j',
     format('public.lms_bulk_create_members(%L::jsonb)',
       '[{"login_id":"zz-v3-bk9","password":"bk99","role":3}]'),
     'error created=0 errors=1 rows=1:error:branch'],
    ['bulk', 'admin', 'a branch account row', 'j',
     format('public.lms_bulk_create_members(%L::jsonb)',
       format('[{"login_id":"zz-v3-bka","password":"bkaa","role":1,"branch_id":"%s"}]', br_a)),
     'error created=0 errors=1 rows=1:error:role'],
    ['bulk', 'ba', 'a teacher row with a class (class members are students)', 'j',
     format('public.lms_bulk_create_members(%L::jsonb)',
       '[{"login_id":"zz-v3-bkt","password":"bkt1","role":2,"class":"V3반A1"}]'),
     'error created=0 errors=1 rows=1:error:not_student'],
    ['bulk', 'ba', 'a bad password', 'j',
     format('public.lms_bulk_create_members(%L::jsonb)',
       '[{"login_id":"zz-v3-bkb","password":"ab","role":3}]'),
     'error created=0 errors=1 rows=1:error:password'],
    ['bulk', 'ta1', '501 rows', 'j',
     $q$public.lms_bulk_create_members((select jsonb_agg(jsonb_build_object(
          'login_id', 'zz-v3-m' || g, 'password', 'pw11', 'role', 3)) from generate_series(1, 501) g))$q$,
     'too_many'],
    ['bulk', 'ba', 'an empty list', 'j', $q$public.lms_bulk_create_members('[]'::jsonb)$q$, 'invalid field=rows'],
    ['bulk', 'ba', 'not a list', 'j', $q$public.lms_bulk_create_members('{}'::jsonb)$q$, 'invalid field=rows'],
    ['bulk', 'sa1', 'create', 'j',
     $q$public.lms_bulk_create_members('[{"login_id":"zz-v3-bkc","password":"bkcc","role":3}]'::jsonb)$q$,
     'denied 42501'],
    ['bulk', 'none', 'create', 'j',
     $q$public.lms_bulk_create_members('[{"login_id":"zz-v3-bkc","password":"bkcc","role":3}]'::jsonb)$q$,
     'denied 42501'],
    ['bulk', 'authuser', 'create', 'j',
     $q$public.lms_bulk_create_members('[{"login_id":"zz-v3-bkc","password":"bkcc","role":3}]'::jsonb)$q$,
     'denied 42501'],
    ['bulk', 'ba', 'the answer never contains a password', 'q',
     $q$select (public.lms_bulk_create_members(
          '[{"login_id":"zz-v3-bkd","password":"zz9pw","role":3}]'::jsonb)::text ~ 'zz9pw')::text$q$,
     'false'],
    ['bulk', 'ba', 'assign: own-branch student into a class', 'j',
     format('public.lms_bulk_assign(%L::jsonb)', '[{"class":"V3반A2","login_id":"zz-v3-sa2b"}]'),
     'ok assigned=1 rows=1:ok:zz-v3-sa2b'],
    ['bulk', 'ta1', 'assign: into another teacher''s class', 'j',
     format('public.lms_bulk_assign(%L::jsonb)', '[{"class":"V3반A2","login_id":"zz-v3-sa1"}]'),
     'error assigned=0 errors=1 rows=1:error:class_not_allowed'],
    ['bulk', 'ta1', 'assign: a student already in another class (D51)', 'j',
     format('public.lms_bulk_assign(%L::jsonb)', '[{"class":"V3반A1","login_id":"zz-v3-ns"}]'),
     'error assigned=0 errors=1 rows=1:error:in_other_class'],
    ['bulk', 'ta1', 'assign: a member not in its branch', 'j',
     format('public.lms_bulk_assign(%L::jsonb)', '[{"class":"V3반A1","login_id":"zz-v3-tb"}]'),
     'error assigned=0 errors=1 rows=1:error:member'],
    ['bulk', 'ta1', 'assign: a teacher', 'j',
     format('public.lms_bulk_assign(%L::jsonb)', '[{"class":"V3반A1","login_id":"zz-v3-ta2"}]'),
     'error assigned=0 errors=1 rows=1:error:not_student'],
    ['bulk', 'ta1', 'assign: one good row + one bad → nothing assigned', 'j',
     format('public.lms_bulk_assign(%L::jsonb)',
       '[{"class":"V3반A1","login_id":"zz-v3-bk2"},{"class":"V3반A1","login_id":"zz-v3-nobody"}]'),
     'error assigned=0 errors=1 rows=1:ok:zz-v3-bk2,2:error:member'],
    ['bulk', 'owner', '… bk2 is not in V3반A1', 'q',
     format($q$select count(*)::text from public.class_members cm join public.members m on m.member_id = cm.member_id
                where m.id = 'zz-v3-bk2' and cm.class_id = %L$q$, k_a1), '0'],
    ['bulk', 'ba', 'assign: a class that does not exist', 'j',
     format('public.lms_bulk_assign(%L::jsonb)', '[{"class":"없는반","login_id":"zz-v3-sa1"}]'),
     'error assigned=0 errors=1 rows=1:error:class'],
    ['bulk', 'admin', 'assign in branch B', 'j',
     format('public.lms_bulk_assign(%L::jsonb, %L)', '[{"class":"V3반B","login_id":"zz-v3-sb"}]', br_b),
     'ok assigned=1 rows=1:ok:zz-v3-sb'],
    ['bulk', 'admin', 'assign without a branch', 'j',
     format('public.lms_bulk_assign(%L::jsonb)', '[{"class":"V3반B","login_id":"zz-v3-sb"}]'),
     'invalid field=branch'],
    ['bulk', 'ba', 'assign: 501 rows', 'j',
     $q$public.lms_bulk_assign((select jsonb_agg(jsonb_build_object('class', 'V3반A1', 'login_id', 'x' || g))
          from generate_series(1, 501) g))$q$,
     'too_many'],
    ['bulk', 'sa1', 'assign', 'j',
     format('public.lms_bulk_assign(%L::jsonb)', '[{"class":"V3반A1","login_id":"zz-v3-sa1"}]'), 'denied 42501'],
    ['bulk', 'none', 'assign', 'j',
     format('public.lms_bulk_assign(%L::jsonb)', '[{"class":"V3반A1","login_id":"zz-v3-sa1"}]'), 'denied 42501']
  ]);

  -- --------------------------------------------- grants and direct writes
  res := pg_temp.v3_run(res, array[
    ['grants', 'owner', '3B RPCs: security definer + search_path public, extensions', 'q',
     format($q$select coalesce(string_agg(p.proname, ',' order by p.proname collate "C"), '(none)')
                 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (%L::text[])
                  and not (p.prosecdef and p.proconfig @> array['search_path=public, extensions'])$q$, rpcs),
     '(none)'],
    ['grants', 'owner', '3B RPCs: anon and authenticated may call them', 'q',
     format($q$select coalesce(string_agg(p.proname, ',' order by p.proname collate "C"), '(none)')
                 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (%L::text[])
                  and not (has_function_privilege('anon', p.oid, 'execute')
                           and has_function_privilege('authenticated', p.oid, 'execute'))$q$, rpcs),
     '(none)'],
    ['grants', 'owner', '3B RPCs: all 16 exist', 'q',
     format($q$select count(*)::text from pg_proc p
                where p.pronamespace = 'public'::regnamespace and p.proname = any (%L::text[])$q$, rpcs),
     '16'],
    ['grants', 'owner', '3B helpers: no PUBLIC / anon / authenticated execute', 'q',
     format($q$select coalesce(string_agg(p.proname, ',' order by p.proname collate "C"), '(none)')
                 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (%L::text[])
                  and (has_function_privilege('anon', p.oid, 'execute')
                       or has_function_privilege('authenticated', p.oid, 'execute')
                       or coalesce(array_to_string(p.proacl, ','), '') ~ '(^|,)=X')$q$, helpers),
     '(none)'],
    ['grants', 'owner', '3B helpers: all 10 exist', 'q',
     format($q$select count(*)::text from pg_proc p
                where p.pronamespace = 'public'::regnamespace and p.proname = any (%L::text[])$q$, helpers),
     '10'],
    ['grants', 'none', 'anon calls lms_caller()', 'q',
     'select count(*)::text from public.lms_caller()', 'denied 42501'],
    ['grants', 'ta1', 'LMS teacher calls lms_member_insert()', 'q',
     $q$select public.lms_member_insert('zz-v3-hx', 'hx11', 3, null, null)::text$q$, 'denied 42501'],
    ['grants', 'admin', 'admin calls lms_member_insert()', 'q',
     $q$select public.lms_member_insert('zz-v3-hx', 'hx11', 3, null, null)::text$q$, 'denied 42501'],
    ['grants', 'ta1', 'LMS teacher: insert into classes directly', 'x',
     format('insert into public.classes (branch_id, name) values (%L, %L)', br_a, 'V3반D'), 'denied 42501'],
    ['grants', 'ba', 'LMS branch account: update classes directly', 'x',
     'update public.classes set name = name', 'denied 42501 | rows=0'],
    ['grants', 'ba', 'LMS branch account: delete class_members directly', 'x',
     'delete from public.class_members', 'denied 42501 | rows=0'],
    ['grants', 'ta1', 'LMS teacher: read members directly (D14)', 'q',
     'select count(*)::text from public.members', '0 | denied 42501'],
    ['grants', 'ba', 'LMS branch account: write members directly', 'x',
     format('update public.members set display_name = %L', 'x'), 'denied 42501 | rows=0']
  ]);

  -- --------------------------------------------- same-ID attack (security review H1 / H2)
  -- Teacher A1 makes a student with the ID of teacher B (allowed: D41/D44),
  -- sets its password to each guess and signs in. Every account that was
  -- compared and did not match counts a failure on its OWN key 'm:<id>', so
  -- teacher B locks after 5 wrong guesses and is then skipped — the right
  -- guess no longer shows up as 'choose'. Unlocking its own student does not
  -- clear teacher B's key.
  res := pg_temp.v3_run(res, array[
    ['homonym', 'ta1', 'a student with the ID of teacher B (allowed)', 'j',
     format('public.lms_member_create(%L, %L, 3)', 'zz-v3-tb', 'aa11'), 'ok']
  ]);
  select m.member_id into m_atk from public.members m where m.id = 'zz-v3-tb' and m.branch_id = br_a;
  res := pg_temp.v3_run(res, array[
    ['homonym', 'ta1', '… into its class', 'j',
     format('public.lms_class_add_member(%L, %L)', k_a1, m_atk), 'ok added=true'],
    ['homonym', 'owner', '5 wrong guesses, each through its own student', 'q',
     format($q$select string_agg(split_part(pg_temp.v3_guess(%L, 'g' || g || 'xx'), ' ', 1), ',' order by g)
                 from generate_series(1, 5) g$q$, m_atk),
     'ok,ok,ok,ok,ok'],
    ['homonym', 'owner', '… each one counted on teacher B''s own key', 'q',
     format($q$select coalesce(max(a.fails), 0) || ' locked=' || coalesce(bool_or(a.locked_until > now()), false)
                 from public.login_attempts a where a.key = 'm:' || %L$q$, m_tb),
     '5 locked=true'],
    ['homonym', 'bb', '… and branch B''s list shows it locked', 'q',
     $q$select l.locked::text from public.lms_member_list() l where l.login_id = 'zz-v3-tb'$q$, 'true'],
    ['homonym', 'ta1', '… its own same-ID student does not show B''s lock', 'q',
     $q$select l.locked::text from public.lms_member_list() l where l.login_id = 'zz-v3-tb'$q$, 'false'],
    ['homonym', 'owner', 'the right guess: no choose (teacher B is skipped while locked)', 'q',
     format('select pg_temp.v3_guess(%L, %L)', m_atk, 'tb11'), 'ok role=3 branch=검증3지사A token=43ch'],
    ['homonym', 'owner', 'teacher B signing in with its branch: locked', 'q',
     format('select pg_temp.v3_signin(null, %L, %L, %L)', 'zz-v3-tb', 'tb11', br_b), 'locked'],
    ['homonym', 'ta1', 'unlock its own same-ID student', 'j',
     format('public.lms_unlock_member(%L)', m_atk), 'ok cleared=false'],
    ['homonym', 'owner', '… teacher B stays locked', 'q',
     format($q$select coalesce(bool_or(a.locked_until > now()), false)::text
                 from public.login_attempts a where a.key = 'm:' || %L$q$, m_tb), 'true'],
    ['homonym', 'ta1', 'unlock teacher B', 'j', format('public.lms_unlock_member(%L)', m_tb), 'denied 42501'],
    ['homonym', 'bb', 'unlock its teacher', 'j', format('public.lms_unlock_member(%L)', m_tb), 'ok cleared=true'],
    ['homonym', 'owner', '… teacher B signs in (with its branch)', 'q',
     format('select pg_temp.v3_signin(null, %L, %L, %L)', 'zz-v3-tb', 'tb11', br_b),
     'ok role=2 branch=검증3지사B token=43ch'],
    ['homonym', 'owner', 'a guess that matches neither account', 'q',
     format('select pg_temp.v3_signin(null, %L, %L)', 'zz-v3-tb', 'zzzz'), 'invalid'],
    ['homonym', 'owner', '… counted on teacher B''s key too', 'q',
     format($q$select coalesce(max(a.fails), 0)::text from public.login_attempts a
                where a.key = 'm:' || %L$q$, m_tb), '1'],
    ['homonym', 'owner', 'the A student signs in right, without a branch', 'q',
     format($q$select split_part(pg_temp.v3_guess(%L, %L), ' ', 1)$q$, m_atk, 'aa22'), 'ok'],
    ['homonym', 'owner', '… one more on teacher B''s key (known trade-off: the client should send p_branch_id)', 'q',
     format($q$select coalesce(max(a.fails), 0)::text from public.login_attempts a
                where a.key = 'm:' || %L$q$, m_tb), '2'],
    ['homonym', 'owner', 'the A student signs in with its branch', 'q',
     format('select pg_temp.v3_signin(null, %L, %L, %L)', 'zz-v3-tb', 'aa22', br_a),
     'ok role=3 branch=검증3지사A token=43ch'],
    ['homonym', 'owner', '… nothing more on teacher B''s key', 'q',
     format($q$select coalesce(max(a.fails), 0)::text from public.login_attempts a
                where a.key = 'm:' || %L$q$, m_tb), '2'],
    ['homonym', 'admin', 'unlock teacher B''s own key directly', 'j',
     format('public.lms_unlock_key(%L)', 'm:' || m_tb), 'ok cleared=true']
  ]);

  -- --------------------------------------------- delete (D47) — last: it removes callers
  res := pg_temp.v3_run(res, array[
    ['delete', 'ba', 'a student of its branch', 'j', format('public.lms_member_delete(%L)', m_sa1), 'denied 42501'],
    ['delete', 'ta1', 'a student of its class', 'j', format('public.lms_member_delete(%L)', m_sa1), 'denied 42501'],
    ['delete', 'sa1', 'itself', 'j', format('public.lms_member_delete(%L)', m_sa1), 'denied 42501'],
    ['delete', 'none', 'a student', 'j', format('public.lms_member_delete(%L)', m_sa1), 'denied 42501'],
    ['delete', 'authuser', 'a student', 'j', format('public.lms_member_delete(%L)', m_sa1), 'denied 42501'],
    ['delete', 'admin', 'a student', 'j', format('public.lms_member_delete(%L)', m_sa1), 'ok'],
    ['delete', 'owner', '… its class rows and sessions went with it', 'q',
     format($q$select format('member=%%s class_rows=%%s sessions=%%s',
                (select count(*) from public.members where member_id = %1$L),
                (select count(*) from public.class_members where member_id = %1$L),
                (select count(*) from public.lms_sessions where member_id = %1$L))$q$, m_sa1),
     'member=0 class_rows=0 sessions=0'],
    ['delete', 'admin', 'the same again', 'j', format('public.lms_member_delete(%L)', m_sa1), 'not_found'],
    ['delete', 'admin', 'teacher A1', 'j', format('public.lms_member_delete(%L)', m_ta1), 'ok'],
    ['delete', 'owner', '… its class has no teacher now', 'q',
     format('select coalesce(teacher_id::text, %L) from public.classes where id = %L', 'NULL', k_a1), 'NULL'],
    ['delete', 'admin', 'deactivate branch B', 'j',
     format('public.lms_branch_update(%L, p_active => false)', br_b), 'ok'],
    ['delete', 'owner', '… the sessions of branch B are gone', 'q',
     format($q$select count(*)::text from public.lms_sessions s
                 join public.members m on m.member_id = s.member_id where m.branch_id = %L$q$, br_b), '0'],
    ['delete', 'bb', '… branch account B is signed out', 'j', 'public.lms_session()', 'NULL']
  ]);

  zz_ids := array[m_ba, m_bb, m_ta1, m_ta2, m_tb, m_sa1, m_sa2, m_sb, m_kima, m_kimb,
                  m_lk, m_lk2, m_ns, m_atk];
  end if;
  raise exception 'LMS_VERIFY_ROLLBACK';
  exception when others then
    if sqlerrm <> 'LMS_VERIFY_ROLLBACK' then
      res := pg_temp.v3(res, 'ERROR', 'unexpected error — the cases after it did not run', 'none',
                        sqlstate || ' ' || sqlerrm, false);
    end if;
  end; -- ===== all changes above are rolled back here =====
  reset role;

  -- --------------------------------------------- trace check (after undo)
  -- (No session count: a test session cannot outlive its test member, and a
  -- count over the whole table would move with real traffic.)
  select format('branches=%s members=%s classes=%s attempts=%s',
    (select count(*) from public.branches b where b.code like 'zz-v3-%' or b.name like '검증3지사%'),
    (select count(*) from public.members m where m.id like 'zz-v3-%'),
    (select count(*) from public.classes c where c.name like 'V3반%'),
    (select count(*) from public.login_attempts x
      where x.key like 'id:zz-v3-%' or x.key = 'ip:203.0.113.77'
         or x.key = any (select 'm:' || u from unnest(coalesce(zz_ids, '{}'::uuid[])) u)))
    into a;
  e := 'branches=0 members=0 classes=0 attempts=0';
  res := pg_temp.v3(res, 'trace', 'test data rolled back', e, a, a = e);

  return query
    select 0, 'SUMMARY'::text, 'cases passed'::text, 'all'::text,
           format('%s / %s', count(*) filter (where (r ->> 'pass')::boolean), count(*)),
           bool_and(coalesce((r ->> 'pass')::boolean, false))
      from jsonb_array_elements(res) r
    union all
    select (r ->> 'no')::int, r ->> 'area', r ->> 'case', r ->> 'expected', r ->> 'actual',
           (r ->> 'pass')::boolean
      from jsonb_array_elements(res) r
    order by 1;
end;
$fn$;

select * from pg_temp.lms_verify_3b();

rollback;
