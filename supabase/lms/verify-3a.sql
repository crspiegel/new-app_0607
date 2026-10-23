-- ============================================================================
-- LMS Phase 3A — verify-3a.sql  (leaves NO trace: everything is rolled back)
-- ----------------------------------------------------------------------------
-- Run AFTER the "LMS (Phase 3A)" block of supabase/migration.sql.
-- Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--
-- What it does: creates test branches/accounts/classes (all named zz-v… /
-- 검증지사…), calls the LMS RPCs AS THE anon ROLE with an x-lms-token header
-- (exactly what the browser will do through PostgREST), checks RLS per role,
-- the login throttle and the old member RPCs — then undoes ALL of it.
--
-- Two rollbacks, belt and braces:
--   1) the tests run inside a sub-transaction that ends with a deliberate
--      exception (LMS_VERIFY_ROLLBACK), so every row change is undone even
--      before the function returns; the last row ("trace") proves it;
--   2) the whole file is wrapped in begin … rollback.
-- It never prints a password, a hash or a token (only "token=43ch").
-- Expected result: one table, every row pass = true (SUMMARY row first).
-- ============================================================================
begin;

-- Append one result row (no = running number).
create or replace function pg_temp.lms_v(
  res jsonb, p_area text, p_case text, p_expected text, p_actual text, p_pass boolean
)
returns jsonb
language sql
immutable
as $$
  select res || jsonb_build_array(jsonb_build_object(
    'no', jsonb_array_length(res) + 1, 'area', p_area, 'case', p_case,
    'expected', p_expected, 'actual', coalesce(p_actual, 'NULL'),
    'pass', p_pass));
$$;

-- One-line summary of an lms_login() response — never the token itself.
create or replace function pg_temp.lms_v_sum(j jsonb)
returns text
language sql
immutable
as $$
  select case
    when j is null then 'NULL'
    when j ->> 'status' = 'ok' then format('ok role=%s branch=%s token=%s',
      j ->> 'role', j ->> 'branch_name',
      coalesce(length(j ->> 'token')::text || 'ch', 'none'))
    when j ->> 'status' = 'choose' then 'choose '
      || coalesce((select string_agg(b ->> 'branch_name', ',' order by o)
                     from jsonb_array_elements(j -> 'branches') with ordinality x (b, o)), '')
      || case when j ? 'token' then ' +TOKEN!' else '' end
    when j ->> 'status' = 'locked' then 'locked '
      || case when (j ->> 'retry_after_sec')::int between 1 and 600 then '1..600s'
              else coalesce(j ->> 'retry_after_sec', '?') || 's' end
    else coalesce(j ->> 'status', '?')
      || case when (j - 'status') <> '{}'::jsonb then ' +extra!' else '' end
  end;
$$;

grant execute on function pg_temp.lms_v(jsonb, text, text, text, text, boolean) to public;
grant execute on function pg_temp.lms_v_sum(jsonb) to public;

create or replace function pg_temp.lms_verify_3a()
returns table (no int, area text, check_case text, expected text, actual text, pass boolean)
language plpgsql
as $fn$
declare
  res        jsonb := '[]'::jsonb;
  hq         uuid;
  hq_name    text;
  ba         uuid;
  bb         uuid;
  boff       uuid;
  ca1        uuid;
  ca2        uuid;
  cb1        uuid;
  m_teacher  uuid;
  m_teacherb uuid;
  m_student  uuid;
  m_pair_a   uuid;
  m_pair_b   uuid;
  admin_uid  uuid;
  j          jsonb;
  j_prev     jsonb;
  e          text;
  s          text;
  a          text;
  k          int;
  i          int;
  q          text;
  tok_t      text;  -- teacher (branch A)
  tok_s      text;  -- student (branch A)
  tok_b      text;  -- branch account (branch A)
  tok_tb     text;  -- teacher (branch B)
  tbl        text;
  who        text;
begin
  begin -- ===== everything in this block is undone at the end =====

  -- ---------------------------------------------------------------- setup
  select b.id, b.name into hq, hq_name from public.branches b where b.code = 'hq';
  res := pg_temp.lms_v(res, 'migration', 'hq branch row exists', 'yes',
                       case when hq is null then 'no' else 'yes' end, hq is not null);

  select count(*) into k from public.members m
   where m.member_id is null or m.branch_id is null or m.role is null;
  res := pg_temp.lms_v(res, 'migration', 'existing members: member_id/branch_id/role filled',
                       'missing=0', 'missing=' || k, k = 0);

  select count(*) into k from public.members m
   where m.role <> case when m.grade = 3 then 3 else 2 end or m.branch_id <> hq;
  res := pg_temp.lms_v(res, 'migration', 'existing members: hq + D13 role (grade1/2→2, 3→3)',
                       'mismatch=0', 'mismatch=' || k, k = 0);

  select format('total=%s role2=%s role3=%s', count(*),
                count(*) filter (where m.role = 2), count(*) filter (where m.role = 3))
    into a from public.members m;
  res := pg_temp.lms_v(res, 'migration', 'existing members (info only)', 'any', a, true);

  insert into public.branches (code, name) values ('zz-verify-a', '검증지사A') returning id into ba;
  insert into public.branches (code, name) values ('zz-verify-b', '검증지사B') returning id into bb;
  insert into public.branches (code, name, active)
  values ('zz-verify-off', '검증지사OFF', false) returning id into boff;

  insert into public.members (id, password_hash, grade, role, branch_id, display_name, active) values
    ('zz-v-branch',    extensions.crypt('br4321', extensions.gen_salt('bf')), 1, 1, ba, 'V Branch', true),
    ('zz-v-teacher',   extensions.crypt('t1234', extensions.gen_salt('bf')), 2, 2, ba, 'V Teacher', true),
    ('zz-v학생',        extensions.crypt('0000', extensions.gen_salt('bf')), 3, 3, ba, 'V 학생', true),
    ('zz-v-twin',      extensions.crypt('tw1n', extensions.gen_salt('bf')), 2, 2, ba, null, true),
    ('ZZ-V-TWIN',      extensions.crypt('tw1n', extensions.gen_salt('bf')), 2, 2, bb, null, true),
    ('zz-v-pair',      extensions.crypt('aaaa', extensions.gen_salt('bf')), 3, 3, ba, null, true),
    ('ZZ-V-PAIR',      extensions.crypt('bbbb', extensions.gen_salt('bf')), 3, 3, bb, null, true),
    ('zz-v-off',       extensions.crypt('off1', extensions.gen_salt('bf')), 3, 3, ba, null, false),
    ('zz-v-offbr',     extensions.crypt('off2', extensions.gen_salt('bf')), 3, 3, boff, null, true),
    ('Zz-V.Legacy!',   extensions.crypt('longpassword', extensions.gen_salt('bf')), 3, 3, ba, null, true),
    ('zz-v-teacher-b', extensions.crypt('t5678', extensions.gen_salt('bf')), 2, 2, bb, null, true),
    ('zz-v-lock',      extensions.crypt('lock', extensions.gen_salt('bf')), 3, 3, ba, null, true),
    ('zz-v-badhash',   '$2a$06$short', 3, 3, ba, null, true);

  select m.member_id into m_teacher  from public.members m where m.id = 'zz-v-teacher';
  select m.member_id into m_teacherb from public.members m where m.id = 'zz-v-teacher-b';
  select m.member_id into m_student  from public.members m where m.id = 'zz-v학생';
  select m.member_id into m_pair_a   from public.members m where m.id = 'zz-v-pair';
  select m.member_id into m_pair_b   from public.members m where m.id = 'ZZ-V-PAIR';

  insert into public.classes (branch_id, name, teacher_id) values (ba, 'V반1', m_teacher) returning id into ca1;
  insert into public.classes (branch_id, name) values (ba, 'V반2') returning id into ca2;
  insert into public.classes (branch_id, name, teacher_id) values (bb, 'V반B', m_teacherb) returning id into cb1;
  insert into public.class_members (class_id, member_id) values
    (ca1, m_student), (ca2, m_pair_a), (cb1, m_pair_b);

  -- Stale rows the next lms_login() must sweep away.
  insert into public.lms_sessions (token_hash, member_id, expires_at)
  values (public.lms_token_hash('zz-v-expired-token'), m_teacher, now() - interval '1 minute');
  insert into public.login_attempts (key, fails, window_start, updated_at)
  values ('id:zz-v-stale', 3, now() - interval '2 days', now() - interval '2 days');

  -- ------------------------------------------------- login (as anon, D7a)
  set local role anon;
  perform set_config('request.headers', '{}', true);

  j := public.lms_login('zz-v-teacher', 't1234'); s := pg_temp.lms_v_sum(j); tok_t := j ->> 'token';
  e := 'ok role=2 branch=검증지사A token=43ch';
  res := pg_temp.lms_v(res, 'login', 'teacher, right password', e, s, s = e);

  j := public.lms_login('zz-v학생', '0000'); s := pg_temp.lms_v_sum(j); tok_s := j ->> 'token';
  e := 'ok role=3 branch=검증지사A token=43ch';
  res := pg_temp.lms_v(res, 'login', 'student, Korean ID, 4-digit password', e, s, s = e);

  j := public.lms_login('zz-v-branch', 'br4321'); s := pg_temp.lms_v_sum(j); tok_b := j ->> 'token';
  e := 'ok role=1 branch=검증지사A token=43ch';
  res := pg_temp.lms_v(res, 'login', 'branch account', e, s, s = e);

  j := public.lms_login('zz-v-teacher-b', 't5678'); s := pg_temp.lms_v_sum(j); tok_tb := j ->> 'token';
  e := 'ok role=2 branch=검증지사B token=43ch';
  res := pg_temp.lms_v(res, 'login', 'teacher in branch B', e, s, s = e);

  j := public.lms_login('  ZZ-V-Teacher ', 't1234'); s := pg_temp.lms_v_sum(j);
  e := 'ok role=2 branch=검증지사A token=43ch';
  res := pg_temp.lms_v(res, 'login', 'ID typed with spaces + capitals (D5a normalize)', e, s, s = e);

  j := public.lms_login(normalize('zz-v학생', NFD), '0000'); s := pg_temp.lms_v_sum(j);
  e := 'ok role=3 branch=검증지사A token=43ch';
  res := pg_temp.lms_v(res, 'login', 'Korean ID typed as NFD (→ NFC)', e, s, s = e);

  j := public.lms_login('zz-v.legacy!', 'longpassword'); s := pg_temp.lms_v_sum(j);
  e := 'ok role=3 branch=검증지사A token=43ch';
  res := pg_temp.lms_v(res, 'login', 'old-style ID (!) + 12-char password still log in (D5a/D6a)', e, s, s = e);

  j_prev := public.lms_login('zz-v-teacher', 'wrong'); s := pg_temp.lms_v_sum(j_prev);
  res := pg_temp.lms_v(res, 'login', 'wrong password', 'invalid', s, s = 'invalid');

  j := public.lms_login('zz-v-nobody', 'wrong'); s := pg_temp.lms_v_sum(j);
  res := pg_temp.lms_v(res, 'login', 'unknown ID', 'invalid', s, s = 'invalid');
  res := pg_temp.lms_v(res, 'login', 'unknown ID response = wrong-password response (no ID oracle)',
                       'true', (j = j_prev)::text, j = j_prev);

  j := public.lms_login('zz-v-twin', 'tw1n'); s := pg_temp.lms_v_sum(j);
  e := 'choose 검증지사A,검증지사B';
  res := pg_temp.lms_v(res, 'login', 'same ID in 2 branches, right password → choose (no token)', e, s, s = e);

  j := public.lms_login('zz-v-twin', 'tw1n', bb); s := pg_temp.lms_v_sum(j);
  e := 'ok role=2 branch=검증지사B token=43ch';
  res := pg_temp.lms_v(res, 'login', 'choose → call again with branch B', e, s, s = e);

  j := public.lms_login('zz-v-twin', 'nope'); s := pg_temp.lms_v_sum(j);
  res := pg_temp.lms_v(res, 'login', 'same ID in 2 branches, wrong password → invalid (no branch list)',
                       'invalid', s, s = 'invalid');

  j := public.lms_login('zz-v-twin', 'tw1n', boff); s := pg_temp.lms_v_sum(j);
  res := pg_temp.lms_v(res, 'login', 'right password + a branch that is not one of the matches',
                       'invalid', s, s = 'invalid');

  j := public.lms_login('zz-v-pair', 'bbbb'); s := pg_temp.lms_v_sum(j);
  e := 'ok role=3 branch=검증지사B token=43ch';
  res := pg_temp.lms_v(res, 'login', 'same ID, different passwords → the one that matches (B)', e, s, s = e);

  j := public.lms_login('zz-v-pair', 'aaaa'); s := pg_temp.lms_v_sum(j);
  e := 'ok role=3 branch=검증지사A token=43ch';
  res := pg_temp.lms_v(res, 'login', 'same ID, different passwords → the one that matches (A)', e, s, s = e);

  j := public.lms_login('zz-v-off', 'off1'); s := pg_temp.lms_v_sum(j);
  res := pg_temp.lms_v(res, 'login', 'inactive member', 'invalid', s, s = 'invalid');

  j := public.lms_login('zz-v-offbr', 'off2'); s := pg_temp.lms_v_sum(j);
  res := pg_temp.lms_v(res, 'login', 'member of an inactive branch', 'invalid', s, s = 'invalid');

  j := public.lms_login(null, null); s := pg_temp.lms_v_sum(j);
  res := pg_temp.lms_v(res, 'login', 'NULL ID/password → jsonb, not an exception', 'invalid', s, s = 'invalid');

  s := pg_temp.lms_v_sum(public.lms_login('zz-v-badhash', 'plaintext-not-bcrypt'));
  reset role;
  select s || ' fails=' || coalesce(max(x.fails), 0) into a
    from public.login_attempts x where x.key = 'id:zz-v-badhash';
  set local role anon;
  res := pg_temp.lms_v(res, 'login', 'non-bcrypt hash in the row → invalid (no exception), failure counted',
                       'invalid fails=1', a, a = 'invalid fails=1');

  -- ------------------------------------------------- sessions (D10a-c)
  reset role;
  select format('raw=%s hash=%s',
                (exists (select 1 from public.lms_sessions x where x.token_hash = tok_t))::text,
                (exists (select 1 from public.lms_sessions x
                          where x.token_hash = encode(sha256(convert_to(tok_t, 'UTF8')), 'hex')))::text)
    into a;
  res := pg_temp.lms_v(res, 'session', 'DB stores sha256(token), never the token', 'raw=false hash=true',
                       a, a = 'raw=false hash=true');

  select format('expired=%s stale=%s',
                (select count(*) from public.lms_sessions x
                  where x.token_hash = public.lms_token_hash('zz-v-expired-token')),
                (select count(*) from public.login_attempts x where x.key = 'id:zz-v-stale'))
    into a;
  res := pg_temp.lms_v(res, 'session', 'lms_login sweeps expired sessions + 1-day-old attempts',
                       'expired=0 stale=0', a, a = 'expired=0 stale=0');

  select case when m.last_login_at is not null then 'set' else 'null' end into a
    from public.members m where m.member_id = m_teacher;
  res := pg_temp.lms_v(res, 'session', 'members.last_login_at updated', 'set', a, a = 'set');

  -- the stored expired session is gone now; recreate one for the expiry checks
  insert into public.lms_sessions (token_hash, member_id, expires_at)
  values (public.lms_token_hash('zz-v-expired-token'), m_teacher, now() - interval '1 minute');
  update public.lms_sessions x set expires_at = now() + interval '1 day'
   where x.token_hash = public.lms_token_hash(tok_t);

  set local role anon;
  perform set_config('request.headers', json_build_object('x-lms-token', tok_s)::text, true);
  select format('rows=%s role=%s', count(*), max(m.role)) into a from public.lms_member() m;
  res := pg_temp.lms_v(res, 'session', 'lms_member() with the student token', 'rows=1 role=3', a, a = 'rows=1 role=3');

  perform set_config('request.headers', '{"x-lms-token":"zz-v-bogus"}', true);
  select 'rows=' || count(*) into a from public.lms_member() m;
  res := pg_temp.lms_v(res, 'session', 'lms_member() with a bogus token', 'rows=0', a, a = 'rows=0');
  j := public.lms_session();
  res := pg_temp.lms_v(res, 'session', 'lms_session() with a bogus token', 'NULL',
                       coalesce(j::text, 'NULL'), j is null);

  perform set_config('request.headers', '{}', true);
  select 'rows=' || count(*) into a from public.lms_member() m;
  res := pg_temp.lms_v(res, 'session', 'lms_member() with no header', 'rows=0', a, a = 'rows=0');

  perform set_config('request.headers', '{"x-lms-token":"zz-v-expired-token"}', true);
  select 'rows=' || count(*) into a from public.lms_member() m;
  j := public.lms_session();
  a := a || ' session=' || coalesce(j::text, 'NULL');
  res := pg_temp.lms_v(res, 'session', 'expired token → no identity, lms_session NULL',
                       'rows=0 session=NULL', a, a = 'rows=0 session=NULL');

  perform set_config('request.headers', json_build_object('x-lms-token', tok_t)::text, true);
  j := public.lms_session();
  a := format('role=%s branch=%s', j ->> 'role', j ->> 'branch_name');
  res := pg_temp.lms_v(res, 'session', 'lms_session() with the teacher token', 'role=2 branch=검증지사A',
                       a, a = 'role=2 branch=검증지사A');
  reset role;
  select case when x.expires_at = now() + interval '30 days' and x.last_seen_at = now()
              then 'extended' else 'not extended' end
    into a from public.lms_sessions x where x.token_hash = public.lms_token_hash(tok_t);
  res := pg_temp.lms_v(res, 'session', 'lms_session() slides expiry to +30 days', 'extended', a, a = 'extended');

  set local role anon;
  perform set_config('request.headers',
    json_build_object('x-lms-token', 'probe-zz', 'cf-connecting-ip', '203.0.113.9')::text, true);
  j := public.lms_probe_headers();
  a := format('cf=%s token=%s', j ->> 'cf_connecting_ip', j ->> 'has_lms_token');
  res := pg_temp.lms_v(res, 'session', 'lms_probe_headers() echoes IP headers, not the token',
                       'cf=203.0.113.9 token=true', a, a = 'cf=203.0.113.9 token=true');

  reset role;
  a := '';
  foreach q in array array['2001:db8:1:2::5', '2001:db8:1:2:aaaa::6', '203.0.113.7', 'not-an-ip'] loop
    perform set_config('request.headers', json_build_object('cf-connecting-ip', q)::text, true);
    a := a || coalesce(public.lms_client_ip(), 'NULL') || ' ';
  end loop;
  a := rtrim(a);
  e := '2001:db8:1:2::/64 2001:db8:1:2::/64 203.0.113.7 NULL';
  res := pg_temp.lms_v(res, 'throttle', 'IP key: IPv6 grouped by /64, unparsable header ignored', e, a, a = e);
  set local role anon;

  -- ------------------------------------------------- RLS reads (anon)
  foreach who in array array['none', 'student', 'teacher', 'branch', 'teacherB'] loop
    perform set_config('request.headers', case who
      when 'none'     then '{}'
      when 'student'  then json_build_object('x-lms-token', tok_s)::text
      when 'teacher'  then json_build_object('x-lms-token', tok_t)::text
      when 'branch'   then json_build_object('x-lms-token', tok_b)::text
      when 'teacherB' then json_build_object('x-lms-token', tok_tb)::text end, true);

    foreach tbl in array array['members', 'lms_sessions', 'login_attempts'] loop
      begin
        execute format('select count(*) from public.%I', tbl) into k;
        a := 'rows=' || k;
      exception when others then
        a := 'denied ' || sqlstate;
      end;
      res := pg_temp.lms_v(res, 'rls:' || who, 'select ' || tbl || ' (hidden for every LMS role)',
                           'rows=0 | denied 42501', a, a in ('rows=0', 'denied 42501'));
    end loop;

    select coalesce(string_agg(c.name, ',' order by c.name), '-') into a from public.classes c;
    e := case who when 'none' then '-' when 'student' then 'V반1' when 'teacher' then 'V반1,V반2'
                  when 'branch' then 'V반1,V반2' else 'V반B' end;
    res := pg_temp.lms_v(res, 'rls:' || who, 'select classes', e, a, a = e);

    select 'rows=' || count(*) into a from public.class_members cm;
    e := case who when 'none' then 'rows=0' when 'student' then 'rows=1' when 'teacher' then 'rows=1'
                  when 'branch' then 'rows=2' else 'rows=1' end;
    res := pg_temp.lms_v(res, 'rls:' || who, 'select class_members', e, a, a = e);

    select coalesce(string_agg(b.name, ',' order by b.name), '-') into a from public.branches b;
    e := case who when 'none' then '-' when 'teacherB' then '검증지사B' else '검증지사A' end;
    res := pg_temp.lms_v(res, 'rls:' || who, 'select branches (own branch only)', e, a, a = e);
  end loop;

  -- ------------------------------------------------- RLS writes (teacher token)
  perform set_config('request.headers', json_build_object('x-lms-token', tok_t)::text, true);
  foreach q in array array[
    format('insert into public.classes (branch_id, name) values (%L, %L)', ba, 'V반X'),
    format('update public.classes set name = %L where id = %L', 'V반Y', ca1),
    format('delete from public.class_members where class_id = %L', ca1),
    format('insert into public.class_members (class_id, member_id) values (%L, %L)', ca2, m_student),
    format('insert into public.branches (code, name) values (%L, %L)', 'zz-verify-x', '검증지사X'),
    format('update public.members set grade = 1 where member_id = %L', m_student),
    format('insert into public.members (id, password_hash, grade) values (%L, %L, 3)', 'zz-v-new', 'x'),
    format('delete from public.lms_sessions where member_id = %L', m_teacher),
    format('update public.login_attempts set fails = 0')
  ] loop
    begin
      execute q;
      get diagnostics k = row_count;
      a := 'rows=' || k;
    exception when others then
      a := 'denied ' || sqlstate;
    end;
    res := pg_temp.lms_v(res, 'rls:write', left(q, 60), 'denied 42501 | rows=0', a,
                         a in ('rows=0', 'denied 42501'));
  end loop;

  -- ------------------------------------------------- internal functions (anon)
  foreach q in array array[
    'select public.lms_norm_id(''x'')',
    'select public.lms_token_hash(''x'')',
    'select public.lms_header_token()',
    'select public.lms_client_ip()',
    'select public.lms_note_failure(''zz'', 1, interval ''1 day'')'
  ] loop
    begin
      execute q;
      a := 'allowed';
    exception when others then
      a := 'denied ' || sqlstate;
    end;
    res := pg_temp.lms_v(res, 'grants', 'anon cannot call: ' || q, 'denied 42501', a, a = 'denied 42501');
  end loop;

  -- ------------------------------------------------- signed-in Auth user who is NOT an admin
  set local role authenticated;
  perform set_config('request.headers', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-00000000beef","role":"authenticated"}', true);
  foreach tbl in array array['members', 'lms_sessions', 'login_attempts', 'branches', 'classes', 'class_members'] loop
    begin
      execute format('select count(*) from public.%I', tbl) into k;
      a := 'rows=' || k;
    exception when others then
      a := 'denied ' || sqlstate;
    end;
    res := pg_temp.lms_v(res, 'rls:non-admin', 'select ' || tbl, 'rows=0', a, a = 'rows=0');
  end loop;
  foreach q in array array[
    format('insert into public.classes (branch_id, name) values (%L, %L)', ba, 'V반X'),
    format('update public.classes set name = %L where id = %L', 'V반Y', ca1),
    format('delete from public.class_members where class_id = %L', ca1),
    format('insert into public.branches (code, name) values (%L, %L)', 'zz-verify-x', '검증지사X'),
    format('insert into public.members (id, password_hash, grade) values (%L, %L, 3)', 'zz-v-new', 'x'),
    format('update public.members set grade = 1 where member_id = %L', m_student),
    format('delete from public.lms_sessions where member_id = %L', m_teacher),
    format('update public.login_attempts set fails = 0')
  ] loop
    begin
      execute q;
      get diagnostics k = row_count;
      a := 'rows=' || k;
    exception when others then
      a := 'denied ' || sqlstate;
    end;
    res := pg_temp.lms_v(res, 'rls:non-admin', left(q, 60), 'denied 42501 | rows=0', a,
                         a in ('rows=0', 'denied 42501'));
  end loop;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;

  -- ------------------------------------------------- throttle (D7d)
  perform set_config('request.headers', '{}', true);
  -- a success first: clears the failure left by the 'wrong password' case
  perform public.lms_login('zz-v-teacher', 't1234');
  a := '';
  for i in 1..5 loop
    a := a || pg_temp.lms_v_sum(public.lms_login('zz-v-teacher', 'bad' || i)) || ',';
  end loop;
  s := pg_temp.lms_v_sum(public.lms_login('zz-v-teacher', 't1234'));
  a := a || ' then right password: ' || s;
  e := 'invalid,invalid,invalid,invalid,invalid, then right password: locked 1..600s';
  res := pg_temp.lms_v(res, 'throttle', '5 failures lock the ID; password not checked while locked', e, a, a = e);

  reset role;
  select 'retry=' || ceil(extract(epoch from x.locked_until - now())) into a
    from public.login_attempts x where x.key = 'id:zz-v-teacher';
  res := pg_temp.lms_v(res, 'throttle', 'lock length is 10 minutes', 'retry=600', a, a = 'retry=600');
  update public.login_attempts x set locked_until = now() - interval '1 second'
   where x.key = 'id:zz-v-teacher';
  set local role anon;
  s := pg_temp.lms_v_sum(public.lms_login('zz-v-teacher', 't1234'));
  reset role;
  select s || ' counter=' || count(*) into a from public.login_attempts x where x.key = 'id:zz-v-teacher';
  e := 'ok role=2 branch=검증지사A token=43ch counter=0';
  res := pg_temp.lms_v(res, 'throttle', 'after the lock ends: success clears the ID counter', e, a, a = e);

  set local role anon;
  for i in 1..5 loop
    perform public.lms_login('zz-v-lock', 'bad' || i);
  end loop;
  reset role;
  update public.login_attempts x set locked_until = now() - interval '1 second' where x.key = 'id:zz-v-lock';
  set local role anon;
  a := pg_temp.lms_v_sum(public.lms_login('zz-v-lock', 'bad6'))
       || ',' || pg_temp.lms_v_sum(public.lms_login('zz-v-lock', 'lock'));
  e := 'invalid,locked 1..600s';
  res := pg_temp.lms_v(res, 'throttle', 'after a lock, one more failure re-locks at once', e, a, a = e);

  a := '';
  for i in 1..5 loop
    a := a || pg_temp.lms_v_sum(public.lms_login('zz-v-ghost', 'bad' || i)) || ',';
  end loop;
  a := a || pg_temp.lms_v_sum(public.lms_login('zz-v-ghost', 'bad6'));
  e := 'invalid,invalid,invalid,invalid,invalid,locked 1..600s';
  res := pg_temp.lms_v(res, 'throttle', 'unknown IDs lock the same way (no ID oracle)', e, a, a = e);

  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.50"}', true);
  for i in 1..30 loop
    perform public.lms_login('zz-v-nobody-' || i, 'bad');
  end loop;
  a := pg_temp.lms_v_sum(public.lms_login('zz-v-teacher', 't1234'));
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.51"}', true);
  a := a || ' | other IP: ' || pg_temp.lms_v_sum(public.lms_login('zz-v-teacher', 't1234'));
  perform set_config('request.headers', '{}', true);
  a := a || ' | no IP: ' || pg_temp.lms_v_sum(public.lms_login('zz-v-teacher', 't1234'));
  e := 'locked 1..600s | other IP: ok role=2 branch=검증지사A token=43ch | no IP: ok role=2 branch=검증지사A token=43ch';
  res := pg_temp.lms_v(res, 'throttle', '30 failures from one IP lock that IP only', e, a, a = e);

  -- now() is fixed inside one transaction, so age the windows by hand
  reset role;
  update public.login_attempts x
     set window_start = now() - interval '11 minutes', locked_until = now() - interval '1 second'
   where x.key = 'ip:203.0.113.50';
  update public.login_attempts x
     set window_start = now() - interval '25 hours', locked_until = now() - interval '1 second'
   where x.key = 'id:zz-v-lock';
  set local role anon;
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.50"}', true);
  s := pg_temp.lms_v_sum(public.lms_login('zz-v-nobody-x', 'bad'));
  perform set_config('request.headers', '{}', true);
  s := s || ',' || pg_temp.lms_v_sum(public.lms_login('zz-v-lock', 'bad7'));
  reset role;
  select s || ' ' || string_agg(format('%s:fails=%s locked=%s', x.key, x.fails,
                                        (x.locked_until > now())::text), ' ' order by x.key)
    into a from public.login_attempts x where x.key in ('ip:203.0.113.50', 'id:zz-v-lock');
  e := 'invalid,invalid id:zz-v-lock:fails=1 locked=false ip:203.0.113.50:fails=1 locked=false';
  res := pg_temp.lms_v(res, 'throttle', 'an expired window starts counting from 1 again (IP 10 min, ID 1 day)',
                       e, a, a = e);
  set local role anon;

  -- same normalized ID in two branches: my own login must not clear the counter of the other account
  for i in 1..4 loop
    perform public.lms_login('zz-v-pair', 'guess' || i);
  end loop;
  s := pg_temp.lms_v_sum(public.lms_login('ZZ-V-PAIR', 'bbbb'));
  reset role;
  select s || ' counter=' || coalesce(max(x.fails), 0) into a
    from public.login_attempts x where x.key = 'id:zz-v-pair';
  set local role anon;
  a := a || ' | ' || pg_temp.lms_v_sum(public.lms_login('zz-v-pair', 'guess5'))
         || ',' || pg_temp.lms_v_sum(public.lms_login('zz-v-pair', 'aaaa'));
  e := 'ok role=3 branch=검증지사B token=43ch counter=4 | invalid,locked 1..600s';
  res := pg_temp.lms_v(res, 'throttle', 'shared ID: a login to the other account does not reset the counter',
                       e, a, a = e);

  s := pg_temp.lms_v_sum(public.lms_login('zz-v-twin', 'tw1n'));
  reset role;
  select s || ' counter=' || count(*) into a from public.login_attempts x where x.key = 'id:zz-v-twin';
  set local role anon;
  e := 'choose 검증지사A,검증지사B counter=0';
  res := pg_temp.lms_v(res, 'throttle', 'shared ID: a password that opens every account does reset it',
                       e, a, a = e);

  -- ------------------------------------------------- password change ends sessions
  reset role;
  update public.members set password_hash = extensions.crypt('t5679', extensions.gen_salt('bf'))
   where id = 'zz-v-teacher-b';
  select 'sessions=' || count(*) into a from public.lms_sessions x where x.member_id = m_teacherb;
  set local role anon;
  perform set_config('request.headers', json_build_object('x-lms-token', tok_tb)::text, true);
  select a || ' identity=' || count(*) into a from public.lms_member() m;
  res := pg_temp.lms_v(res, 'session', 'password change deletes that member''s sessions',
                       'sessions=0 identity=0', a, a = 'sessions=0 identity=0');

  -- ------------------------------------------------- logout
  perform set_config('request.headers', json_build_object('x-lms-token', tok_s)::text, true);
  perform public.lms_logout();
  select 'rows=' || count(*) into a from public.lms_member() m;
  j := public.lms_session();
  a := a || ' session=' || coalesce(j::text, 'NULL');
  res := pg_temp.lms_v(res, 'logout', 'lms_logout() kills the token', 'rows=0 session=NULL',
                       a, a = 'rows=0 session=NULL');
  reset role;
  select 'rows=' || count(*) into a from public.lms_sessions x where x.token_hash = public.lms_token_hash(tok_s);
  res := pg_temp.lms_v(res, 'logout', 'session row deleted', 'rows=0', a, a = 'rows=0');

  -- ------------------------------------------------- old member RPCs (compat)
  insert into public.members (id, password_hash, grade)
  values ('zz-v-old1', extensions.crypt('old1pw', extensions.gen_salt('bf')), 1),
         ('zz-v-old3', extensions.crypt('old3pw', extensions.gen_salt('bf')), 3);
  select string_agg(format('%s:role=%s hq=%s id=%s', m.id, m.role, (m.branch_id = hq)::text,
                           (m.member_id is not null)::text), ' ' order by m.id)
    into a from public.members m where m.id in ('zz-v-old1', 'zz-v-old3');
  e := 'zz-v-old1:role=2 hq=true id=true zz-v-old3:role=3 hq=true id=true';
  res := pg_temp.lms_v(res, 'compat', 'old-style insert (no branch/role) → hq + D13 role', e, a, a = e);

  update public.members set grade = 2 where id = 'zz-v-old3';
  select 'role=' || m.role into a from public.members m where m.id = 'zz-v-old3';
  update public.members set grade = 3 where id = 'zz-v-old3';
  select a || ',' || m.role into a from public.members m where m.id = 'zz-v-old3';
  res := pg_temp.lms_v(res, 'compat', 'old grade change is mirrored into role', 'role=2,3', a, a = 'role=2,3');

  set local role anon;
  perform set_config('request.headers', '{}', true);
  a := 'verify_member_login=' || coalesce(public.verify_member_login('zz-v-old3', 'old3pw')::text, 'NULL')
       || ' lms_login=' || pg_temp.lms_v_sum(public.lms_login('zz-v-old3', 'old3pw'));
  e := 'verify_member_login=3 lms_login=ok role=3 branch=' || hq_name || ' token=43ch';
  res := pg_temp.lms_v(res, 'compat', 'old RPC and new RPC both log the old member in', e, a, a = e);

  a := coalesce(public.verify_member_login('zz-v-teacher', 't1234')::text, 'NULL');
  res := pg_temp.lms_v(res, 'compat', 'old RPC ignores accounts outside hq (no oracle for new branches)',
                       'NULL', a, a = 'NULL');

  for i in 1..5 loop
    perform public.verify_member_login('zz-v-old3', 'bad' || i);
  end loop;
  a := 'old=' || coalesce(public.verify_member_login('zz-v-old3', 'old3pw')::text, 'NULL')
       || ' lms=' || pg_temp.lms_v_sum(public.lms_login('zz-v-old3', 'old3pw'));
  e := 'old=NULL lms=locked 1..600s';
  res := pg_temp.lms_v(res, 'compat', 'old RPC counts failures in the same throttle (no free guessing)',
                       e, a, a = e);
  reset role;

  begin
    insert into public.members (id, password_hash, grade, role, branch_id)
    values ('ZZ-V-TEACHER', 'x', 2, 2, ba);
    a := 'allowed';
  exception when unique_violation then
    a := 'denied 23505';
  end;
  res := pg_temp.lms_v(res, 'compat', 'same normalized ID twice in one branch', 'denied 23505', a, a = 'denied 23505');

  begin
    insert into public.members (id, password_hash, grade, role, branch_id)
    values ('ZZ-V-BRANCH', 'x', 1, 1, bb);
    a := 'allowed';
  exception when unique_violation then
    a := 'denied 23505';
  end;
  res := pg_temp.lms_v(res, 'compat', 'branch-account ID reused in another branch (D7b)', 'denied 23505',
                       a, a = 'denied 23505');

  select x.user_id into admin_uid from public.admins x limit 1;
  if admin_uid is null then
    res := pg_temp.lms_v(res, 'compat', 'old admin tab: create_member / update_member', 'run',
                         'skipped: no admins row', null);
  else
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', admin_uid, 'role', 'authenticated')::text, true);
    perform public.create_member('zz-v-old4', 'old4pw', 3::smallint, null);
    reset role;
    select format('role=%s hq=%s', m.role, (m.branch_id = hq)::text) into a
      from public.members m where m.id = 'zz-v-old4';
    set local role authenticated;
    perform public.update_member('zz-v-old4', 1::smallint, 'old4pw2');
    reset role;
    select a || format(' → grade1: role=%s pwchanged=%s', m.role, (m.password_changed_at is not null)::text)
      into a from public.members m where m.id = 'zz-v-old4';
    e := 'role=3 hq=true → grade1: role=2 pwchanged=true';
    res := pg_temp.lms_v(res, 'compat', 'old admin tab: create_member / update_member (as an admin)',
                         e, a, a = e);
    perform set_config('request.jwt.claims', '', true);
  end if;

  raise exception 'LMS_VERIFY_ROLLBACK';
  exception when others then
    if sqlerrm <> 'LMS_VERIFY_ROLLBACK' then
      res := pg_temp.lms_v(res, 'ERROR', 'unexpected error — the cases after it did not run', 'none',
                           sqlstate || ' ' || sqlerrm, false);
    end if;
  end; -- ===== all changes above are rolled back here =====

  -- --------------------------------------------- trace check (after undo)
  select format('branches=%s members=%s classes=%s attempts=%s',
    (select count(*) from public.branches b where b.code like 'zz-verify-%'),
    (select count(*) from public.members m where m.id ilike 'zz-v%'),
    (select count(*) from public.classes c where c.name like 'V반%'),
    (select count(*) from public.login_attempts x
      where x.key like 'id:zz-v%' or x.key like 'ip:203.0.113.%'))
    into a;
  e := 'branches=0 members=0 classes=0 attempts=0';
  res := pg_temp.lms_v(res, 'trace', 'test data rolled back', e, a, a = e);

  return query
    select 0, 'SUMMARY'::text, 'cases passed'::text, 'all'::text,
           format('%s / %s', count(*) filter (where (r ->> 'pass')::boolean), count(*))
             || coalesce(' (skipped ' || nullif(count(*) filter (where r ->> 'pass' is null), 0) || ')', ''),
           bool_and(coalesce((r ->> 'pass')::boolean, true))
      from jsonb_array_elements(res) r
    union all
    select (r ->> 'no')::int, r ->> 'area', r ->> 'case', r ->> 'expected', r ->> 'actual',
           (r ->> 'pass')::boolean
      from jsonb_array_elements(res) r
    order by 1;
end;
$fn$;

select * from pg_temp.lms_verify_3a();

rollback;
