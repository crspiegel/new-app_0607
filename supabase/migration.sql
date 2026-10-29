-- ============================================================================
-- Cambridge Reading Adventures — Supabase schema (Phase 2 + Phase 3)
-- ----------------------------------------------------------------------------
-- Run this ENTIRE file in the Supabase SQL Editor:
--   Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
--
-- Security model:
--   • Reads of content are PUBLIC (anon key + RLS allow select).
--   • WRITES (content, covers, members, settings) require an authenticated
--     ADMIN (a Supabase Auth user listed in public.admins).
--   • Member (grade 1-3) login is verified server-side by a SECURITY DEFINER
--     RPC, so password hashes never leave the database.
--   • LMS (block "LMS (Phase 3A)" near the end): branches, roles 1-3, classes,
--     token sessions (lms_login / lms_session / lms_logout) and RLS through
--     lms_member(). Added beside the old member RPCs, which still work.
-- ============================================================================

-- pgcrypto → crypt() + gen_salt('bf') for bcrypt password hashing.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per (level, month) page.
--   level:  beginner | level-1 | level-2 | level-3 (video-source.js LEVELS). Rows
--           written before 2026-10-29 carry the old keys "Level 1".."Level 4"
--           until supabase/levels/01-rename.sql (run AFTER the new code is live).
--           The same applies to page_backgrounds.level below.
--   videos: { "<slotKey>": "<vimeo url or id>" }   slotKey = opening | ending | w1-Mon .. w4-Fri
--   covers: { "book-1": "<public url>", "book-2": "<public url>" }
--   labels: { "<toolbarSlot>": "custom button name" }  toolbar slots only
--           (missing/empty key = the hardcoded default in TOOLBAR_BUTTONS)
create table if not exists public.content_pages (
  level      text not null,
  month      text not null,
  videos     jsonb not null default '{}'::jsonb,
  covers     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (level, month)
);

-- Admin-editable toolbar button names (added 2026-07-31).
alter table public.content_pages
  add column if not exists labels jsonb not null default '{}'::jsonb;

-- Lightweight member accounts (grades 1-3). NOT Supabase Auth users.
-- Password is bcrypt-hashed; the hash is only ever read inside the login RPC.
create table if not exists public.members (
  id            text primary key,            -- the login ID
  password_hash text not null,
  grade         smallint not null check (grade in (1, 2, 3)),
  display_name  text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Admins = real Supabase Auth users granted admin rights.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Global key/value settings (e.g. signup_visible toggle).
create table if not exists public.site_settings (
  key   text primary key,
  value jsonb not null
);

insert into public.site_settings (key, value)
values ('signup_visible', 'false'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Helper: is the current caller an admin?  (SECURITY DEFINER → can read admins)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.content_pages enable row level security;
alter table public.members       enable row level security;
alter table public.admins        enable row level security;
alter table public.site_settings enable row level security;

-- content_pages: anyone reads; only admins write.
drop policy if exists content_pages_read on public.content_pages;
create policy content_pages_read on public.content_pages
  for select using (true);

drop policy if exists content_pages_write on public.content_pages;
create policy content_pages_write on public.content_pages
  for all using (public.is_admin()) with check (public.is_admin());

-- members: only admins read/write directly (login uses the RPC below).
drop policy if exists members_admin_all on public.members;
create policy members_admin_all on public.members
  for all using (public.is_admin()) with check (public.is_admin());

-- admins: a signed-in user may read their OWN row (client "am I admin?" check);
-- only admins may modify.
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists admins_write on public.admins;
create policy admins_write on public.admins
  for all using (public.is_admin()) with check (public.is_admin());

-- site_settings: anyone reads; only admins write.
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings
  for select using (true);

drop policy if exists site_settings_write on public.site_settings;
create policy site_settings_write on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- RPCs (members)
-- ---------------------------------------------------------------------------

-- Verify a member login. Returns the grade (1-3) on success, NULL otherwise.
-- Phase 3A: REDEFINED in the "LMS (Phase 3A)" block below (hq accounts only,
-- shares the lms_login throttle). This first definition is replaced there.
-- SECURITY DEFINER → the hash is compared server-side and never returned.
create or replace function public.verify_member_login(p_id text, p_password text)
returns smallint
language plpgsql
stable
security definer
-- pgcrypto (crypt) lives in the `extensions` schema on Supabase, so include it
-- in the search_path or crypt()/gen_salt() resolve to "does not exist".
set search_path = public, extensions
as $$
declare
  v_grade smallint;
begin
  select grade into v_grade
  from public.members
  where id = p_id
    and active
    and password_hash = crypt(p_password, password_hash);
  return v_grade;  -- NULL when no match
end;
$$;

-- Create or update a member. Admin-only. Enforces the account-format rule:
-- >= 4 chars, printable ASCII only (no Korean / no spaces), case-sensitive.
create or replace function public.create_member(
  p_id text, p_password text, p_grade smallint, p_display_name text default null
)
returns void
language plpgsql
security definer
-- crypt()/gen_salt() are in the `extensions` schema on Supabase (see above).
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_grade not in (1, 2, 3) then
    raise exception 'grade must be 1, 2 or 3';
  end if;
  if p_id !~ '^[!-~]{4,}$' or p_password !~ '^[!-~]{4,}$' then
    raise exception 'id/password must be >= 4 printable-ASCII chars (no spaces, no Korean)';
  end if;
  insert into public.members (id, password_hash, grade, display_name)
  values (p_id, crypt(p_password, gen_salt('bf')), p_grade, p_display_name)
  on conflict (id) do update
    set password_hash = excluded.password_hash,
        grade         = excluded.grade,
        display_name  = excluded.display_name,
        active        = true;
end;
$$;

-- Activate / deactivate a member. Admin-only.
create or replace function public.set_member_active(p_id text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.members set active = p_active where id = p_id;
end;
$$;

-- Edit an existing member's grade (permission) and/or password. Admin-only.
-- p_password is OPTIONAL: pass NULL (or blank) to keep the current password and
-- change only the grade; pass a new value to also reset the password (re-hashed
-- the same bcrypt way as create_member). Does NOT change the id or active flag.
create or replace function public.update_member(
  p_id text, p_grade smallint, p_password text default null
)
returns void
language plpgsql
security definer
-- crypt()/gen_salt() live in the `extensions` schema on Supabase.
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_grade not in (1, 2, 3) then
    raise exception 'grade must be 1, 2 or 3';
  end if;
  if p_password is not null and p_password <> '' then
    if p_password !~ '^[!-~]{4,}$' then
      raise exception 'password must be >= 4 printable-ASCII chars (no spaces, no Korean)';
    end if;
    update public.members
      set grade = p_grade,
          password_hash = crypt(p_password, gen_salt('bf'))
      where id = p_id;
  else
    update public.members
      set grade = p_grade
      where id = p_id;
  end if;
  if not found then
    raise exception 'member % not found', p_id;
  end if;
end;
$$;

-- anon needs ONLY the login verifier — revoke the admin RPCs from anon.
revoke all on function public.create_member(text, text, smallint, text) from anon;
revoke all on function public.set_member_active(text, boolean) from anon;
revoke all on function public.update_member(text, smallint, text) from anon;

-- ---------------------------------------------------------------------------
-- Storage policies for the "covers" bucket
-- (Create the bucket first in the Dashboard: Storage → New bucket → name
--  "covers" → PUBLIC. Then these policies allow public read + admin writes.)
-- ---------------------------------------------------------------------------
drop policy if exists covers_public_read on storage.objects;
create policy covers_public_read on storage.objects
  for select using (bucket_id = 'covers');

drop policy if exists covers_admin_write on storage.objects;
create policy covers_admin_write on storage.objects
  for all
  using (bucket_id = 'covers' and public.is_admin())
  with check (bucket_id = 'covers' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Page backgrounds (페이지1/페이지2 body+footer 배경, 관리자 편집)
--   One row per (level, page, month). page = 'page1' | 'page2'.
--   month = '' means "level default" (page1 rows always use '').
--   A month row REPLACES the level default entirely (no merging).
--   data: { "full": "<public url>" | null,
--           "elements": [ { "src", "x", "y", "w", "r", "fx", "z" } ] }
--   x/y = element center as % of the layer, w = width % of the layer,
--   r = rotation deg, fx = horizontal flip, z = stacking order.
-- ---------------------------------------------------------------------------
create table if not exists public.page_backgrounds (
  level      text not null,
  page       text not null check (page in ('page1', 'page2')),
  month      text not null default '',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (level, page, month)
);

alter table public.page_backgrounds enable row level security;

drop policy if exists page_backgrounds_read on public.page_backgrounds;
create policy page_backgrounds_read on public.page_backgrounds
  for select using (true);

drop policy if exists page_backgrounds_write on public.page_backgrounds;
create policy page_backgrounds_write on public.page_backgrounds
  for all using (public.is_admin()) with check (public.is_admin());

-- Storage policies for the "backgrounds" bucket
-- (Create the bucket first in the Dashboard: Storage → New bucket → name
--  "backgrounds" → PUBLIC. Then these policies allow public read + admin writes.)
drop policy if exists backgrounds_public_read on storage.objects;
create policy backgrounds_public_read on storage.objects
  for select using (bucket_id = 'backgrounds');

drop policy if exists backgrounds_admin_write on storage.objects;
create policy backgrounds_admin_write on storage.objects
  for all
  using (bucket_id = 'backgrounds' and public.is_admin())
  with check (bucket_id = 'backgrounds' and public.is_admin());

-- ============================================================================
-- LMS (Phase 3A, 2026-10-23) — branches · members(role) · classes · sessions
-- ----------------------------------------------------------------------------
-- ADD-ONLY and safe to re-run. Nothing above this line changes: the old member
-- RPCs (verify_member_login / create_member / update_member /
-- set_member_active), members.id (pk) and members.grade keep working until
-- SQL 2 (Phase 3.5) removes them.
--
-- Auth model (spec §4.2 (다')): members are NOT Supabase Auth users. lms_login()
-- checks the bcrypt hash and returns a random session token ONCE; the browser
-- sends it back as the `x-lms-token` request header; PostgREST exposes headers
-- as request.headers, and lms_member() turns the header into
-- (member_id, role, branch_id) for RLS. The DB stores only sha256(token).
--
-- Roles: 1 branch · 2 teacher · 3 student (view only). Existing members move
-- to the 'hq' branch with LEAST privilege: grade 1/2 → role 2, grade 3 → 3.
-- ============================================================================

-- Branches. Code is a short internal handle; members never type it (the login
-- finds the branch by itself, decision §6-6).
create table if not exists public.branches (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.branches (code, name)
values ('hq', 'TPS 본사')
on conflict (code) do nothing;

-- Login-ID normalization (D5a): NFC → trim → lower-case. Used for storage
-- comparisons, the unique indexes and the login lookup. Login input is only
-- normalized, never rule-checked, so existing IDs keep working. The new-ID
-- rule ^[0-9a-z가-힣._-]{2,20}$ is checked when an ID is created/changed
-- (Phase 3.3 RPCs). Postgres regex has no \p{L} — don't use it.
create or replace function public.lms_norm_id(p text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select lower(btrim(normalize(p, NFC), E' \t\r\n 　'));
$$;

-- members: new columns next to the old ones (id / grade / pk stay as-is).
alter table public.members
  add column if not exists member_id uuid not null default gen_random_uuid();
alter table public.members
  add column if not exists branch_id uuid references public.branches (id);
alter table public.members
  add column if not exists role smallint check (role in (1, 2, 3));
alter table public.members
  add column if not exists password_changed_at timestamptz;
alter table public.members
  add column if not exists last_login_at timestamptz;

create unique index if not exists members_member_id_key
  on public.members (member_id);

-- Old-RPC compatibility: rows written by the old admin member tab
-- (create_member / update_member) get hq + a role (D13 mapping) + a password
-- timestamp. A grade change from the old tab is mirrored into role. A new
-- password also ends every session of that member (a stolen token dies).
create or replace function public.lms_members_compat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_id is null then
    select b.id into new.branch_id from public.branches b where b.code = 'hq';
  end if;
  if new.role is null then
    new.role := case when new.grade = 3 then 3 else 2 end;
  end if;
  if tg_op = 'UPDATE' then
    if new.grade is distinct from old.grade
       and new.role is not distinct from old.role then
      new.role := case when new.grade = 3 then 3 else 2 end;
    end if;
    if new.password_hash is distinct from old.password_hash then
      new.password_changed_at := now();
      delete from public.lms_sessions s where s.member_id = old.member_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists members_lms_compat on public.members;
create trigger members_lms_compat
  before insert or update on public.members
  for each row execute function public.lms_members_compat();

-- Backfill existing members (D13): all → hq; grade 1/2 → teacher, 3 → student.
update public.members
   set branch_id = (select b.id from public.branches b where b.code = 'hq')
 where branch_id is null;
update public.members
   set role = case when grade = 3 then 3 else 2 end
 where role is null;
alter table public.members alter column branch_id set not null;
alter table public.members alter column role set not null;

-- D7b: a login ID is unique per branch (normalized); branch accounts (role 1)
-- are unique across all branches. Leading norm-id column also serves the
-- login lookup.
create unique index if not exists members_login_per_branch_key
  on public.members (public.lms_norm_id(id), branch_id);
create unique index if not exists members_branch_account_key
  on public.members (public.lms_norm_id(id)) where role = 1;

-- Classes. Write policies arrive in Phase 3.3; for now admin all + LMS read.
create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references public.branches (id),
  name       text not null,
  teacher_id uuid references public.members (member_id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, name)
);

create table if not exists public.class_members (
  class_id  uuid not null references public.classes (id) on delete cascade,
  member_id uuid not null references public.members (member_id) on delete cascade,
  primary key (class_id, member_id)
);
create index if not exists class_members_member_idx
  on public.class_members (member_id);

-- Sessions (D10a): only sha256(token) is stored; the raw token leaves the DB
-- once, in the lms_login() response. 30-day sliding expiry (lms_session()).
create table if not exists public.lms_sessions (
  token_hash   text primary key,
  member_id    uuid not null references public.members (member_id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz
);
create index if not exists lms_sessions_member_idx on public.lms_sessions (member_id);
create index if not exists lms_sessions_expires_idx on public.lms_sessions (expires_at);

-- Login throttling (D7d). key = 'id:<normalized id>' or 'ip:<addr>'.
create table if not exists public.login_attempts (
  key          text primary key,
  fails        int not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
create index if not exists login_attempts_updated_idx on public.login_attempts (updated_at);

-- ---------------------------------------------------------------------------
-- LMS helpers (internal — not callable by anon/authenticated, see grants)
-- ---------------------------------------------------------------------------

-- The caller's x-lms-token header, or NULL. request.headers can be '' (not
-- NULL) once set and reset in a session — guard before the json cast.
create or replace function public.lms_header_token()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(
    coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json
      ->> 'x-lms-token',
    '');
$$;

create or replace function public.lms_token_hash(p text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

-- D7e: the ONE place that decides the client IP. First cut trusts only
-- cf-connecting-ip (set by Cloudflare in front of Supabase); NULL → the IP
-- limit is skipped and only the per-ID limit applies. Patch only this
-- function after the header probe (lms_probe_headers).
-- The value must parse as an address (else NULL). IPv6 is keyed by its /64:
-- one client owns a whole /64 and could otherwise rotate past the limit.
create or replace function public.lms_client_ip()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := nullif(btrim(
    coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json
      ->> 'cf-connecting-ip'), '');
  a inet;
begin
  if v is null or length(v) > 64 then
    return null;
  end if;
  begin
    a := v::inet;
  exception when others then
    return null;
  end;
  if family(a) = 6 then
    return network(set_masklen(a, 64))::text;
  end if;
  return host(a);
end;
$$;

-- Count one failed login for a key; lock it for 10 minutes once `p_limit`
-- failures fall inside `p_window`. ID keys use a 1-day window, so after the
-- first lock every further failure re-locks (5 + ~144 tries/day per ID).
create or replace function public.lms_note_failure(
  p_key text, p_limit int, p_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null then
    return;
  end if;
  insert into public.login_attempts as a (key, fails, window_start, updated_at)
  values (p_key, 1, now(), now())
  on conflict (key) do update
    set fails        = case when a.window_start < now() - p_window then 1 else a.fails + 1 end,
        window_start = case when a.window_start < now() - p_window then now() else a.window_start end,
        updated_at   = now();
  update public.login_attempts
     set locked_until = now() + interval '10 minutes'
   where key = p_key and fails >= p_limit;
end;
$$;

-- Lock check shared by lms_login and the old verify_member_login. Takes a
-- per-ID transaction lock first, so parallel guesses at one ID run one after
-- another and each sees the failures before it (no burst past the limit).
-- Returns the seconds left on the longer lock (ID or IP), or NULL.
create or replace function public.lms_throttle_wait(p_id_key text, p_ip_key text)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_wait int;
begin
  perform pg_advisory_xact_lock(7301, hashtext(p_id_key));
  select ceil(extract(epoch from max(a.locked_until) - now()))::int
    into v_wait
    from public.login_attempts a
   where a.key in (p_id_key, p_ip_key)
     and a.locked_until > now();
  return case when v_wait is null then null else greatest(v_wait, 1) end;
end;
$$;

-- ---------------------------------------------------------------------------
-- lms_member() — the RLS identity (D10b)
--   Header token → valid session (not expired, member + branch active) →
--   (member_id, role, branch_id); no row otherwise. Policies call it as
--   `(select … from public.lms_member() m)` so it runs once per statement.
--   stable → it cannot extend the session; lms_session() does that.
-- ---------------------------------------------------------------------------
create or replace function public.lms_member()
returns table (member_id uuid, role smallint, branch_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select m.member_id, m.role, m.branch_id
    from public.lms_sessions s
    join public.members m on m.member_id = s.member_id
    join public.branches b on b.id = m.branch_id
   where s.token_hash = public.lms_token_hash(public.lms_header_token())
     and s.expires_at > now()
     and m.active
     and b.active;
$$;

-- Class ids the caller belongs to (student view). SECURITY DEFINER so the
-- classes ↔ class_members policies don't recurse into each other.
create or replace function public.lms_my_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select cm.class_id
    from public.class_members cm
   where cm.member_id = (select m.member_id from public.lms_member() m);
$$;

-- Class ids the caller manages: branch account → every class in its branch;
-- teacher → the classes it teaches.
create or replace function public.lms_managed_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.id
    from public.classes c
    join public.lms_member() m on m.branch_id = c.branch_id
   where m.role = 1 or (m.role = 2 and c.teacher_id = m.member_id);
$$;

-- ---------------------------------------------------------------------------
-- lms_login (D7a·c·d, D10a)
--   Never raises for a bad login — an exception would roll back the failure
--   counter too. Always returns jsonb:
--     {status:'ok', token, role, branch_id, branch_name, display_name}
--     {status:'choose', branches:[{branch_id, branch_name}]}  (only after a
--       correct password; call again with p_branch_id)
--     {status:'invalid'}            unknown ID and wrong password look the same
--     {status:'locked', retry_after_sec}
-- ---------------------------------------------------------------------------
create or replace function public.lms_login(
  p_login_id text, p_password text, p_branch_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_norm   text := coalesce(public.lms_norm_id(p_login_id), '');
  v_pw     text := coalesce(p_password, '');
  v_ip     text := public.lms_client_ip();
  v_id_key text;
  v_ip_key text;
  v_wait   int;
  v_seen   int := 0;
  v_all    int;
  v_ok     boolean;
  v_hits   jsonb := '[]'::jsonb;
  v_hit    jsonb;
  v_token  text;
  r        record;
begin
  -- Housekeeping (no pg_cron needed).
  delete from public.lms_sessions where expires_at < now();
  delete from public.login_attempts
   where updated_at < now() - interval '1 day'
     and (locked_until is null or locked_until < now());

  v_id_key := 'id:' || left(v_norm, 64);
  v_ip_key := case when v_ip is null then null else 'ip:' || v_ip end;

  -- Locked → answer without comparing the password.
  v_wait := public.lms_throttle_wait(v_id_key, v_ip_key);
  if v_wait is not null then
    return jsonb_build_object('status', 'locked', 'retry_after_sec', v_wait);
  end if;

  -- Every active member of an active branch with this ID, in any branch.
  for r in
    select m.member_id, m.password_hash, m.role, m.display_name,
           b.id as branch_id, b.name as branch_name
      from public.members m
      join public.branches b on b.id = m.branch_id
     where public.lms_norm_id(m.id) = v_norm
       and m.active
       and b.active
     order by b.name
  loop
    v_seen := v_seen + 1;
    begin
      v_ok := r.password_hash = crypt(v_pw, r.password_hash);
    exception when others then
      v_ok := false;  -- not a bcrypt hash (e.g. typed in by hand) = no match
    end;
    if v_ok then
      v_hits := v_hits || jsonb_build_array(jsonb_build_object(
        'member_id', r.member_id, 'role', r.role, 'display_name', r.display_name,
        'branch_id', r.branch_id, 'branch_name', r.branch_name));
    end if;
  end loop;
  if v_seen = 0 then
    perform crypt(v_pw, gen_salt('bf'));  -- same cost as a real check (no ID oracle)
  end if;
  v_all := jsonb_array_length(v_hits);  -- before narrowing to p_branch_id

  if p_branch_id is not null then
    select coalesce(jsonb_agg(h), '[]'::jsonb) into v_hits
      from jsonb_array_elements(v_hits) h
     where (h ->> 'branch_id')::uuid = p_branch_id;
  end if;

  if jsonb_array_length(v_hits) = 0 then
    perform public.lms_note_failure(v_id_key, 5, interval '1 day');
    perform public.lms_note_failure(v_ip_key, 30, interval '10 minutes');
    return jsonb_build_object('status', 'invalid');
  end if;

  -- The password was right. Clear this ID's failure count only when it opened
  -- EVERY account with this ID — else the owner of one same-ID account could
  -- wipe the failures aimed at another one and guess forever.
  if v_all = v_seen then
    delete from public.login_attempts where key = v_id_key;
  end if;

  if jsonb_array_length(v_hits) > 1 then
    return jsonb_build_object('status', 'choose', 'branches',
      (select jsonb_agg(jsonb_build_object(
                'branch_id', h -> 'branch_id', 'branch_name', h -> 'branch_name')
              order by h ->> 'branch_name')
         from jsonb_array_elements(v_hits) h));
  end if;

  v_hit := v_hits -> 0;
  v_token := rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.lms_sessions (token_hash, member_id, expires_at, last_seen_at)
  values (public.lms_token_hash(v_token), (v_hit ->> 'member_id')::uuid,
          now() + interval '30 days', now());
  update public.members
     set last_login_at = now()
   where member_id = (v_hit ->> 'member_id')::uuid;

  return jsonb_build_object(
    'status', 'ok',
    'token', v_token,
    'role', (v_hit ->> 'role')::int,
    'branch_id', v_hit -> 'branch_id',
    'branch_name', v_hit -> 'branch_name',
    'display_name', v_hit -> 'display_name');
end;
$$;

-- Page-load check (D10c): valid token → slide expiry 30 days, touch
-- last_seen_at, return {role, branch_id, branch_name, display_name}; else NULL.
create or replace function public.lms_session()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := public.lms_token_hash(public.lms_header_token());
  r      record;
begin
  if v_hash is null then
    return null;
  end if;
  update public.lms_sessions s
     set expires_at = now() + interval '30 days',
         last_seen_at = now()
    from public.members m
    join public.branches b on b.id = m.branch_id
   where s.token_hash = v_hash
     and s.expires_at > now()
     and m.member_id = s.member_id
     and m.active
     and b.active
  returning m.role, b.id as branch_id, b.name as branch_name, m.display_name
    into r;
  if not found then
    return null;
  end if;
  return jsonb_build_object('role', r.role, 'branch_id', r.branch_id,
                            'branch_name', r.branch_name, 'display_name', r.display_name);
end;
$$;

-- Log out = delete this token's session row.
create or replace function public.lms_logout()
returns void
language sql
volatile
security definer
set search_path = public, extensions
as $$
  delete from public.lms_sessions
   where token_hash = public.lms_token_hash(public.lms_header_token());
$$;

-- The OLD member login, used by the live client until the 3.2 login ships
-- (removed in SQL 2 / 3.5). Same signature and result (grade or NULL), but:
-- legacy hq accounts only, the same throttle as lms_login (a locked ID or IP
-- gets NULL), and a dummy bcrypt for unknown IDs. Before this it was an
-- unthrottled password check open to anon for every account.
create or replace function public.verify_member_login(p_id text, p_password text)
returns smallint
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_norm   text := coalesce(public.lms_norm_id(p_id), '');
  v_pw     text := coalesce(p_password, '');
  v_ip     text := public.lms_client_ip();
  v_id_key text;
  v_ip_key text;
  v_hash   text;
  v_grade  smallint;
  v_ok     boolean := false;
begin
  v_id_key := 'id:' || left(v_norm, 64);
  v_ip_key := case when v_ip is null then null else 'ip:' || v_ip end;
  if public.lms_throttle_wait(v_id_key, v_ip_key) is not null then
    return null;
  end if;

  select m.password_hash, m.grade into v_hash, v_grade
    from public.members m
    join public.branches b on b.id = m.branch_id
   where m.id = p_id and m.active and b.active and b.code = 'hq';
  if v_hash is null then
    perform crypt(v_pw, gen_salt('bf'));
  else
    begin
      v_ok := v_hash = crypt(v_pw, v_hash);
    exception when others then
      v_ok := false;
    end;
  end if;

  if not v_ok then
    perform public.lms_note_failure(v_id_key, 5, interval '1 day');
    perform public.lms_note_failure(v_ip_key, 30, interval '10 minutes');
    return null;
  end if;
  -- same rule as lms_login: clear only when this is the one account with the ID
  if (select count(*) from public.members m
       where public.lms_norm_id(m.id) = v_norm and m.active) = 1 then
    delete from public.login_attempts where key = v_id_key;
  end if;
  return v_grade;
end;
$$;

-- TEMPORARY (remove in SQL 2 / Phase 3.5): header probe for lms_client_ip().
-- Returns only the caller's own IP-ish headers and whether x-lms-token arrived.
create or replace function public.lms_probe_headers()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'x_forwarded_for',  h ->> 'x-forwarded-for',
    'cf_connecting_ip', h ->> 'cf-connecting-ip',
    'x_real_ip',        h ->> 'x-real-ip',
    'has_lms_token',    (h ->> 'x-lms-token') is not null)
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) s;
$$;

-- ---------------------------------------------------------------------------
-- LMS row level security (spec §4.4; write policies for LMS roles = 3.3)
-- ---------------------------------------------------------------------------
alter table public.branches       enable row level security;
alter table public.classes        enable row level security;
alter table public.class_members  enable row level security;
alter table public.lms_sessions   enable row level security;
alter table public.login_attempts enable row level security;

drop policy if exists branches_admin_all on public.branches;
create policy branches_admin_all on public.branches
  for all using (public.is_admin()) with check (public.is_admin());
-- An LMS user sees only its own branch row. No anonymous read (D14: the login
-- form has no branch list).
drop policy if exists branches_lms_read on public.branches;
create policy branches_lms_read on public.branches
  for select using (id = (select m.branch_id from public.lms_member() m));

drop policy if exists classes_admin_all on public.classes;
create policy classes_admin_all on public.classes
  for all using (public.is_admin()) with check (public.is_admin());
-- Branch account / teacher: every class of its branch. Student: its classes.
drop policy if exists classes_lms_read on public.classes;
create policy classes_lms_read on public.classes
  for select using (
    branch_id = (select m.branch_id from public.lms_member() m where m.role in (1, 2))
    or id in (select public.lms_my_class_ids())
  );

drop policy if exists class_members_admin_all on public.class_members;
create policy class_members_admin_all on public.class_members
  for all using (public.is_admin()) with check (public.is_admin());
-- Own membership rows, plus the rows of classes the caller manages.
drop policy if exists class_members_lms_read on public.class_members;
create policy class_members_lms_read on public.class_members
  for select using (
    member_id = (select m.member_id from public.lms_member() m)
    or class_id in (select public.lms_managed_class_ids())
  );

-- Sessions / attempts: no LMS access at all (RPCs only); admins may audit.
drop policy if exists lms_sessions_admin_read on public.lms_sessions;
create policy lms_sessions_admin_read on public.lms_sessions
  for select using (public.is_admin());
drop policy if exists login_attempts_admin_read on public.login_attempts;
create policy login_attempts_admin_read on public.login_attempts
  for select using (public.is_admin());

-- members: still admin-only (members_admin_all above). D14 — no LMS select
-- policy, so password_hash can't leak; own info comes from lms_session().

-- ---------------------------------------------------------------------------
-- LMS grants — explicit, so they don't depend on Supabase default privileges.
-- ---------------------------------------------------------------------------
revoke all on public.branches, public.classes, public.class_members,
              public.lms_sessions, public.login_attempts
  from anon, authenticated;
grant select on public.branches, public.classes, public.class_members
  to anon, authenticated;
grant insert, update, delete on public.branches, public.classes, public.class_members
  to authenticated;  -- admins only, via the *_admin_all policies
grant select on public.lms_sessions, public.login_attempts to authenticated;

-- Internal helpers: nobody but the definer functions calls these.
-- Exception: lms_norm_id is inside the members unique indexes, and Postgres
-- checks EXECUTE on an index expression for the role that writes the row —
-- so an admin's direct members write (RLS members_admin_all) needs it. It is
-- a pure text function; anon still can't call it.
revoke execute on function public.lms_norm_id(text) from public, anon;
grant execute on function public.lms_norm_id(text) to authenticated;
revoke execute on function public.lms_header_token() from public, anon, authenticated;
revoke execute on function public.lms_token_hash(text) from public, anon, authenticated;
revoke execute on function public.lms_client_ip() from public, anon, authenticated;
revoke execute on function public.lms_note_failure(text, int, interval) from public, anon, authenticated;
revoke execute on function public.lms_throttle_wait(text, text) from public, anon, authenticated;
revoke execute on function public.lms_members_compat() from public, anon, authenticated;

-- Public RPCs (D7a/D10c) + the temporary probe.
grant execute on function public.lms_login(text, text, uuid) to anon, authenticated;
grant execute on function public.lms_session() to anon, authenticated;
grant execute on function public.lms_logout() to anon, authenticated;
grant execute on function public.lms_probe_headers() to anon, authenticated;
grant execute on function public.verify_member_login(text, text) to anon, authenticated;  -- old client
-- Called from RLS policies, so the querying role needs EXECUTE. They only ever
-- describe the caller's own session.
grant execute on function public.lms_member() to anon, authenticated;
grant execute on function public.lms_my_class_ids() to anon, authenticated;
grant execute on function public.lms_managed_class_ids() to anon, authenticated;

-- Make PostgREST (the REST API) see the new RPCs right away.
notify pgrst, 'reload schema';
-- ==== end LMS (Phase 3A) ====

-- ============================================================================
-- Teacher resources (교사 자료실, 2026-10-29) — 1 private bucket + 1 table
-- ----------------------------------------------------------------------------
-- ADD-ONLY and safe to re-run. Needs the "LMS (Phase 3A)" block above
-- (lms_member). Level keys are the NEW keys: beginner · level-1..3.
-- Slots: plan (월간.연간교육안) · award (상장) · test (테스트, level-2/3 only).
-- Admins upload / replace / delete. Admins and LMS role 1 (branch) / 2
-- (teacher) list the slots and download through the Edge Function
-- supabase/functions/teacher-resource-download (PM decision 2026-10-29, (나)):
-- it calls teacher_resource_issue() with the service role (the caller's
-- x-lms-token forwarded, or an admin uid it verified), then signs a URL that
-- expires after 15 seconds — fixed on the server, so no long-lived link can be
-- made from the browser. LMS members are limited to 30 issues per KST day.
-- Browsers never read Storage objects of this bucket, nor the tables
-- directly — RPCs only.
-- ============================================================================

-- Private bucket: 10 MB, PDF / xlsx / xls only (the admin screen checks the
-- same before uploading).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teacher-resources', 'teacher-resources', false, 10485760,
        array['application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- One row per filled slot. storage_path is ASCII only:
-- <level>/<slot>/<upload epoch ms>.<ext>; the original (Korean) name lives in
-- file_name and becomes the download name.
create table if not exists public.teacher_resources (
  level        text not null,
  slot         text not null,
  storage_path text not null unique,
  file_name    text not null check (length(file_name) between 1 and 200),
  file_size    bigint not null check (file_size between 1 and 10485760),
  updated_at   timestamptz not null default now(),
  primary key (level, slot),
  constraint teacher_resources_slot_ok check (
    (level in ('beginner', 'level-1') and slot in ('plan', 'award'))
    or (level in ('level-2', 'level-3') and slot in ('plan', 'award', 'test'))),
  constraint teacher_resources_path_ok check (
    storage_path ~ ('^' || level || '/' || slot || '/[0-9]{13}\.(pdf|xlsx|xls)$'))
);

-- RLS on with NO policies: anon / authenticated get nothing directly.
alter table public.teacher_resources enable row level security;
revoke all on public.teacher_resources from anon, authenticated;

-- Who may list and download: an admin, or an LMS branch (1) / teacher (2).
create or replace function public.teacher_resources_allowed()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.is_admin()
      or exists (select 1 from public.lms_member() m where m.role in (1, 2));
$$;

-- The level's slots in button order with the current file (NULL file = an
-- empty slot, shown as "준비 중"). No rows for anyone else or a bad level.
create or replace function public.teacher_resources_list(p_level text)
returns table (slot text, file_name text, file_size bigint, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.slot, r.file_name, r.file_size, r.updated_at
    from (values ('plan', 1), ('award', 2), ('test', 3)) as s (slot, ord)
    left join public.teacher_resources r
      on r.level = p_level and r.slot = s.slot
   where public.teacher_resources_allowed()
     and p_level in ('beginner', 'level-1', 'level-2', 'level-3')
     and (s.slot <> 'test' or p_level in ('level-2', 'level-3'))
   order by s.ord;
$$;

-- Issue log for the daily download limit: one row per URL issued to an LMS
-- member (admins are not limited and not logged). RLS on, no policies, no
-- grants — only teacher_resource_issue() (service role) reads and writes it.
-- Rows older than 30 days are deleted by the same function.
create table if not exists public.teacher_resource_downloads (
  id        bigint generated always as identity primary key,
  member_id uuid not null references public.members (member_id) on delete cascade,
  level     text not null,
  slot      text not null,
  issued_at timestamptz not null default now()
);
create index if not exists teacher_resource_downloads_member_idx
  on public.teacher_resource_downloads (member_id, issued_at);
create index if not exists teacher_resource_downloads_issued_idx
  on public.teacher_resource_downloads (issued_at);
alter table public.teacher_resource_downloads enable row level security;
revoke all on public.teacher_resource_downloads from anon, authenticated;

-- The Edge Function's one DB call (service role only). Who: the caller's
-- x-lms-token (forwarded by the function; lms_member() checks session,
-- member and branch are active) with role 1 / 2, or p_admin_uid — an admin
-- the function verified with Auth. What: the slot's CURRENT file only.
-- Answers {"status":"ok","path","name"} | {"status":"denied"} |
-- {"status":"empty"} | {"status":"limit"} (30 per member per KST day).
create or replace function public.teacher_resource_issue(
  p_level text, p_slot text, p_admin_uid uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_admin  boolean := p_admin_uid is not null
                      and exists (select 1 from public.admins a where a.user_id = p_admin_uid);
  v_member uuid;
  v_role   smallint;
  v_path   text;
  v_name   text;
  v_today  timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul')
                          at time zone 'Asia/Seoul';
begin
  if not v_admin then
    select m.member_id, m.role into v_member, v_role
      from public.lms_member() m
     limit 1;
    -- coalesce: a NULL role must deny, never slip through as NULL.
    if v_member is null or not coalesce(v_role in (1, 2), false) then
      return jsonb_build_object('status', 'denied');
    end if;
  end if;

  select r.storage_path, r.file_name into v_path, v_name
    from public.teacher_resources r
   where r.level = p_level and r.slot = p_slot;
  if v_path is null then
    return jsonb_build_object('status', 'empty');
  end if;

  if not v_admin then
    delete from public.teacher_resource_downloads
     where issued_at < now() - interval '30 days';
    -- One member at a time, so parallel requests cannot pass the limit.
    perform pg_advisory_xact_lock(7302, hashtext(v_member::text));
    if (select count(*) from public.teacher_resource_downloads d
         where d.member_id = v_member and d.issued_at >= v_today) >= 30 then
      return jsonb_build_object('status', 'limit');
    end if;
    insert into public.teacher_resource_downloads (member_id, level, slot)
    values (v_member, p_level, p_slot);
  end if;

  return jsonb_build_object('status', 'ok', 'path', v_path, 'name', v_name);
end;
$$;

-- (가) leftovers, never run live but dropped on purpose: browsers no longer
-- get a file path or read the bucket.
drop function if exists public.teacher_resource_file(text, text);

-- Admin: point a slot at an object that was just uploaded. Returns the
-- REPLACED object's path (the client deletes it from Storage), or NULL.
create or replace function public.teacher_resource_set(
  p_level text, p_slot text, p_path text, p_name text, p_size bigint
)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'teacher-resources' and o.name = p_path) then
    raise exception 'teacher resource: % is not in storage', p_path;
  end if;
  select r.storage_path into v_old
    from public.teacher_resources r
   where r.level = p_level and r.slot = p_slot
   for update;
  insert into public.teacher_resources as r
    (level, slot, storage_path, file_name, file_size, updated_at)
  values (p_level, p_slot, p_path, btrim(p_name), p_size, now())
  on conflict (level, slot) do update
    set storage_path = excluded.storage_path,
        file_name    = excluded.file_name,
        file_size    = excluded.file_size,
        updated_at   = now();
  return nullif(v_old, p_path);
end;
$$;

-- Admin: empty a slot. Returns the object path to delete from Storage, or NULL.
create or replace function public.teacher_resource_clear(p_level text, p_slot text)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from public.teacher_resources r
   where r.level = p_level and r.slot = p_slot
  returning r.storage_path into v_old;
  return v_old;
end;
$$;

-- Storage: admins write (only well-formed ASCII paths) and read.
drop policy if exists teacher_resources_admin_all on storage.objects;
create policy teacher_resources_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'teacher-resources' and public.is_admin())
  with check (
    bucket_id = 'teacher-resources'
    and public.is_admin()
    and name ~ '^(beginner|level-1|level-2|level-3)/(plan|award|test)/[0-9]{13}\.(pdf|xlsx|xls)$'
    and (name !~ '/test/' or name ~ '^level-[23]/'));

-- No Storage read policy for LMS sessions (anon): the Edge Function signs
-- with the service role. Dropped by name so a database that ran the (가)
-- draft loses it too.
drop policy if exists teacher_resources_lms_read on storage.objects;
drop function if exists public.teacher_resource_is_current(text);

-- Grants: the helper is internal; list is a public RPC (it answers nothing
-- to the wrong caller); set/clear are for signed-in admins; issue is for the
-- Edge Function (service role) only.
revoke execute on function public.teacher_resources_allowed() from public, anon, authenticated;
grant execute on function public.teacher_resources_list(text) to anon, authenticated;
revoke execute on function public.teacher_resource_issue(text, text, uuid) from public, anon, authenticated;
grant execute on function public.teacher_resource_issue(text, text, uuid) to service_role;
revoke execute on function public.teacher_resource_set(text, text, text, text, bigint) from public, anon;
revoke execute on function public.teacher_resource_clear(text, text) from public, anon;
grant execute on function public.teacher_resource_set(text, text, text, text, bigint) to authenticated;
grant execute on function public.teacher_resource_clear(text, text) to authenticated;

notify pgrst, 'reload schema';
-- ==== end Teacher resources ====

-- ============================================================================
-- AFTER running the above: register your first admin.
-- 1) Dashboard → Authentication → Users → Add user (email + password).
-- 2) Run, replacing the email with the one you just created:
--
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'YOUR_ADMIN_EMAIL@example.com'
--    on conflict do nothing;
-- ============================================================================
