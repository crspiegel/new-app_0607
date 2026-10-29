-- ============================================================================
-- Live teacher test account (role 2, branch hq) — teacher-resources check
-- ----------------------------------------------------------------------------
-- For the (가) download check: a teacher logs in and downloads one file.
-- Run AFTER the 3A SQL (migration.sql with the "LMS (Phase 3A)" block).
-- Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--
-- Nobody types a password: the server makes a random 12-character one and
-- shows it ONCE in the result row. It is never part of the statement text,
-- so it cannot end up in the SQL Editor history, an error log or the query
-- statistics. Use it right away for the check; do not copy it into a file,
-- a document, a chat or a commit.
--
-- Login ID: tps-teacher-test (no "@", so the site logs it in as an LMS member).
-- Re-running makes a NEW password (the old one stops working), re-activates
-- the account and ends its sessions.
-- Result: one row — id, role 2, branch hq, active, sessions 0, password.
-- ⚠ The ID is public (this repo is public): remove the account as soon as the
-- check is done — see the bottom of this file.
-- ============================================================================
create temp table if not exists teacher_test_pw (pw text) on commit preserve rows;
truncate teacher_test_pw;

do $$
declare
  v_id text := 'tps-teacher-test';
  v_pw text := rtrim(translate(encode(extensions.gen_random_bytes(9), 'base64'),
                               '+/', '-_'), '=');
  v_hq uuid;
begin
  select b.id into v_hq from public.branches b where b.code = 'hq';
  if v_hq is null then
    raise exception 'Branch hq not found — run the 3A SQL (migration.sql) first.';
  end if;
  insert into public.members (id, password_hash, grade, role, branch_id, display_name, active)
  values (v_id, extensions.crypt(v_pw, extensions.gen_salt('bf')), 2, 2, v_hq, '테스트 선생님', true)
  on conflict (id) do update
    set password_hash = excluded.password_hash,
        grade         = 2,
        role          = 2,
        branch_id     = excluded.branch_id,
        active        = true;
  insert into teacher_test_pw values (v_pw);
end
$$;

select m.id, m.role, b.code as branch, m.active,
       (select count(*) from public.lms_sessions s
         where s.member_id = m.member_id)::int as sessions,
       (select pw from teacher_test_pw) as password
  from public.members m
  join public.branches b on b.id = m.branch_id
 where m.id = 'tps-teacher-test';

-- ----------------------------------------------------------------------------
-- After the check — remove the account (its sessions go with it). Run this
-- line on its own:
--   delete from public.members where id = 'tps-teacher-test';
-- ----------------------------------------------------------------------------
