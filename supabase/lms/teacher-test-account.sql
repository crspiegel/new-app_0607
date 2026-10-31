-- ============================================================================
-- Live teacher test account (role 2, branch hq) — teacher-resources check
-- ----------------------------------------------------------------------------
-- For the download check: a teacher logs in and downloads one file.
-- Run AFTER the 3A SQL (migration.sql with the "LMS (Phase 3A)" block).
-- Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--
-- ONE statement on purpose (no temp table, no DO block): the first live run
-- (2026-10-30), a temp-table version, failed at its last select (42P01
-- relation "teacher_test_pw" does not exist). Cause not confirmed (editor
-- behaviour, or only part of the text selected); one statement is safe either
-- way.
--
-- Nobody types a password: the server makes a random 12-character one and
-- shows it ONCE in the result row. It is never part of the statement text,
-- so it cannot end up in the SQL Editor history, an error log or the query
-- statistics. Use it right away for the check; do not copy it into a file,
-- a document, a chat or a commit.
--
-- Login ID: tps-teacher-test (no "@", so the site logs it in as an LMS member).
-- Re-running makes a NEW password (the old one stops working) and
-- re-activates the account. The new password also ends all of the account's
-- sessions: trigger members_lms_compat (migration.sql) deletes a member's
-- sessions whenever its password hash changes.
-- Result: one row — id, role 2, branch hq, active, sessions_ended, password.
-- sessions_ended = the sessions the account had when the run began, all ended
-- by the new password (0 on the first run). One statement sees the tables as
-- they were when it began, so it cannot show what is left afterwards (0).
-- No branch hq (3A SQL not run yet) → 0 rows, nothing written.
-- ⚠ The ID is public (this repo is public): remove the account as soon as the
-- check is done — see the bottom of this file.
-- ============================================================================
with pw as (
  select rtrim(translate(encode(extensions.gen_random_bytes(9), 'base64'),
                         '+/', '-_'), '=') as v
),
up as (
  insert into public.members (id, password_hash, grade, role, branch_id, display_name, active)
  select 'tps-teacher-test', extensions.crypt(pw.v, extensions.gen_salt('bf')),
         2, 2, b.id, '테스트 선생님', true
    from pw cross join public.branches b
   where b.code = 'hq'
  on conflict (id) do update
    set password_hash = excluded.password_hash,
        grade = 2, role = 2,
        branch_id = excluded.branch_id,
        active = true
  returning member_id, id, role, branch_id, active
)
select up.id, up.role, b.code as branch, up.active,
       (select count(*) from public.lms_sessions s
         where s.member_id = up.member_id)::int as sessions_ended,
       pw.v as password
  from up cross join pw
  join public.branches b on b.id = up.branch_id;

-- ----------------------------------------------------------------------------
-- After the check — remove the account (its sessions go with it). Run this
-- line on its own:
--   delete from public.members where id = 'tps-teacher-test';
-- ----------------------------------------------------------------------------
