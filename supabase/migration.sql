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
--     lms_member().
--   • LMS (block "LMS (Phase 3B)" after it): primary key members.member_id,
--     role-based management RPCs (branches, members, classes, unlock, bulk)
--     for the top admin and LMS roles 1-2; the old admin member RPCs are gone.
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

-- The old admin member RPCs create_member / update_member / set_member_active
-- were defined here until Phase 3B (2026-11-01, decision D42). They are gone
-- (not just unused): keeping them here would bring them back on every re-run
-- of this file. The "LMS (Phase 3B)" block below drops them on databases that
-- still have them; its lms_member_* RPCs replace them.

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
-- ADD-ONLY and safe to re-run. Written when the old member RPCs
-- (verify_member_login / create_member / update_member / set_member_active),
-- members.id (pk) and members.grade still worked. Since Phase 3B the old admin
-- RPCs are gone and the pk is member_id (block "LMS (Phase 3B)" below);
-- verify_member_login and grade stay until SQL 2 (Phase 3.5).
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
  -- Only an old-style row (grade, no role) gets the D13 mapping. Since 3B
  -- grade may be NULL: a row with neither stays NULL and the NOT NULL on role
  -- refuses it (it used to become a teacher silently), and a later grade
  -- change no longer moves role (the old admin tab that wrote grade is gone).
  if new.role is null and new.grade is not null then
    new.role := case when new.grade = 3 then 3 else 2 end;
  end if;
  if tg_op = 'UPDATE' then
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

-- Classes. Admin all + LMS read; LMS roles write only through the Phase 3B RPCs.
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
--   Since 3B (2026-11-01, security review H1/H2) the same ID can exist in
--   several branches and LMS staff set passwords, so failures also count per
--   ACCOUNT: every account that was compared and did not match gets a failure
--   on its own key 'm:<member_id>' (5 a day → 10-minute lock, like the ID
--   key), and a locked account is not compared at all. Else the owner of a
--   same-ID account could test guesses at another branch's account without
--   ever failing ('ok' for its own account vs 'choose' when the guess also
--   opens the other one). With p_branch_id only that branch is compared.
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
  v_lock   int;
  v_wait_m int;
  v_locked int := 0;
  v_miss   uuid[] := '{}';
  v_mid    uuid;
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

  -- Every active member of an active branch with this ID (in p_branch_id only,
  -- when given).
  for r in
    select m.member_id, m.password_hash, m.role, m.display_name,
           b.id as branch_id, b.name as branch_name
      from public.members m
      join public.branches b on b.id = m.branch_id
     where public.lms_norm_id(m.id) = v_norm
       and m.active
       and b.active
       and (p_branch_id is null or b.id = p_branch_id)
     order by b.name
  loop
    v_seen := v_seen + 1;
    -- Locked by its own failures → not compared (same bcrypt cost, so the
    -- answer time does not tell).
    select ceil(extract(epoch from a.locked_until - now()))::int into v_lock
      from public.login_attempts a
     where a.key = 'm:' || r.member_id and a.locked_until > now();
    if v_lock is not null then
      perform extensions.crypt(v_pw, extensions.gen_salt('bf'));
      v_locked := v_locked + 1;
      v_wait_m := greatest(coalesce(v_wait_m, 1), v_lock);
      continue;
    end if;
    begin
      v_ok := r.password_hash = extensions.crypt(v_pw, r.password_hash);
    exception when others then
      v_ok := false;  -- not a bcrypt hash (e.g. typed in by hand) = no match
    end;
    if v_ok then
      v_hits := v_hits || jsonb_build_array(jsonb_build_object(
        'member_id', r.member_id, 'role', r.role, 'display_name', r.display_name,
        'branch_id', r.branch_id, 'branch_name', r.branch_name));
    else
      v_miss := v_miss || r.member_id;
    end if;
  end loop;
  if v_seen = 0 then
    perform extensions.crypt(v_pw, extensions.gen_salt('bf'));  -- same cost as a real check (no ID oracle)
  end if;
  v_all := jsonb_array_length(v_hits);

  -- Each compared account that did not match counts on its own key — also
  -- when another account with this ID matched (H1).
  foreach v_mid in array v_miss loop
    perform public.lms_note_failure('m:' || v_mid, 5, interval '1 day');
  end loop;

  if v_all = 0 then
    if v_seen > 0 and v_locked = v_seen then
      return jsonb_build_object('status', 'locked', 'retry_after_sec', v_wait_m);
    end if;
    perform public.lms_note_failure(v_id_key, 5, interval '1 day');
    perform public.lms_note_failure(v_ip_key, 30, interval '10 minutes');
    return jsonb_build_object('status', 'invalid');
  end if;

  -- The password was right: clear the matching accounts' own keys. Clear this
  -- ID's shared key only when it opened every account compared — else the
  -- owner of one same-ID account could wipe failures aimed at another.
  delete from public.login_attempts
   where key in (select 'm:' || (h ->> 'member_id') from jsonb_array_elements(v_hits) h);
  if v_all = v_seen then
    delete from public.login_attempts where key = v_id_key;
  end if;

  if v_all > 1 then
    return jsonb_build_object('status', 'choose', 'branches',
      (select jsonb_agg(jsonb_build_object(
                'branch_id', h -> 'branch_id', 'branch_name', h -> 'branch_name')
              order by h ->> 'branch_name')
         from jsonb_array_elements(v_hits) h));
  end if;

  v_hit := v_hits -> 0;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
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
-- Since 3B it also honours the account's own key 'm:<member_id>' (see
-- lms_login): locked → NULL without comparing; a failure counts there too.
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
  v_mid    uuid;
  v_hash   text;
  v_grade  smallint;
  v_ok     boolean := false;
begin
  v_id_key := 'id:' || left(v_norm, 64);
  v_ip_key := case when v_ip is null then null else 'ip:' || v_ip end;
  if public.lms_throttle_wait(v_id_key, v_ip_key) is not null then
    return null;
  end if;

  select m.member_id, m.password_hash, m.grade into v_mid, v_hash, v_grade
    from public.members m
    join public.branches b on b.id = m.branch_id
   where m.id = p_id and m.active and b.active and b.code = 'hq';
  if v_mid is not null and exists (
       select 1 from public.login_attempts a
        where a.key = 'm:' || v_mid and a.locked_until > now()) then
    perform extensions.crypt(v_pw, extensions.gen_salt('bf'));
    return null;
  end if;
  if v_hash is null then
    perform extensions.crypt(v_pw, extensions.gen_salt('bf'));
  else
    begin
      v_ok := v_hash = extensions.crypt(v_pw, v_hash);
    exception when others then
      v_ok := false;
    end;
  end if;

  if not v_ok then
    perform public.lms_note_failure(v_id_key, 5, interval '1 day');
    perform public.lms_note_failure(v_ip_key, 30, interval '10 minutes');
    if v_mid is not null then
      perform public.lms_note_failure('m:' || v_mid, 5, interval '1 day');
    end if;
    return null;
  end if;
  delete from public.login_attempts where key = 'm:' || v_mid;
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
-- LMS row level security (spec §4.4; LMS roles write through the 3B RPCs)
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
-- LMS (Phase 3B, 2026-11-01) — role-based management (3.3) + bulk (3.4)
-- ----------------------------------------------------------------------------
-- Safe to re-run. Needs the "LMS (Phase 3A)" block above. Decisions D41–D47
-- (spec §4.9); checked by supabase/lms/verify-3b.sql, live state first by
-- supabase/lms/00-precheck-3b.sql.
--
-- • D41 primary key members.id → members.member_id. A login ID stays unique
--   per branch (members_login_per_branch_key) and a branch account's ID
--   across all branches (members_branch_account_key), so the same ID may now
--   exist in two branches.
-- • D42 the old admin RPCs create_member / update_member / set_member_active
--   are dropped; members.grade may be NULL (new accounts set role only).
--   verify_member_login and grade go in SQL 2 (3.5).
-- • D45 every management RPC is SECURITY DEFINER and takes its caller from the
--   request: the top admin (Auth JWT → is_admin()) or an LMS member
--   (x-lms-token → lms_member()). The caller's role and branch override the
--   input. Nobody, a caller out of scope, or a target it may not see → error
--   42501. Every other outcome is jsonb {status: ok | invalid (field) |
--   duplicate (suggestion) | not_found | error | too_many}.
-- • LMS roles get no direct write on members / classes / class_members: all
--   of it goes through these RPCs, the one place that checks D45.
-- ============================================================================

-- D41: swap the primary key once (later runs see member_id and skip). The
-- unique index on member_id that the foreign keys already use becomes the key
-- itself, so no foreign key is touched. No CASCADE: if anything still pointed
-- at members(id), the drop fails and nothing changes (precheck row 7).
do $$
declare
  v_name text;
  v_def  text;
begin
  select c.conname, pg_get_constraintdef(c.oid) into v_name, v_def
    from pg_constraint c
   where c.conrelid = 'public.members'::regclass and c.contype = 'p';
  if v_def is distinct from 'PRIMARY KEY (member_id)' then
    if v_name is not null then
      execute format('alter table public.members drop constraint %I', v_name);
    end if;
    alter table public.members
      add constraint members_member_id_key primary key using index members_member_id_key;
  end if;
end;
$$;
-- The old key also kept id NOT NULL — keep it so on every Postgres version.
alter table public.members alter column id set not null;

-- D42: new accounts carry role only.
alter table public.members alter column grade drop not null;
drop function if exists public.create_member(text, text, smallint, text);
drop function if exists public.create_member(text, text, smallint, text, jsonb);  -- live-only (D27)
drop function if exists public.update_member(text, smallint, text);
drop function if exists public.set_member_active(text, boolean);

-- D47: deactivating a member ends its sessions at once, whoever does it. (A
-- new password already does — members_lms_compat.)
create or replace function public.lms_members_end_sessions()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if old.active and not new.active then
    delete from public.lms_sessions s where s.member_id = old.member_id;
  end if;
  return new;
end;
$$;

drop trigger if exists members_lms_end_sessions on public.members;
create trigger members_lms_end_sessions
  before update of active on public.members
  for each row execute function public.lms_members_end_sessions();

-- ---------------------------------------------------------------------------
-- 3B helpers (internal — not callable by anon/authenticated, see grants)
-- ---------------------------------------------------------------------------

-- Who is calling: the top admin (Auth JWT) or a signed-in LMS member
-- (x-lms-token). No row = nobody (anon without a valid session, or an Auth
-- user who is not an admin).
create or replace function public.lms_caller()
returns table (is_admin boolean, member_id uuid, role smallint, branch_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select true, null::uuid, null::smallint, null::uuid
   where public.is_admin()
  union all
  select false, m.member_id, m.role, m.branch_id
    from public.lms_member() m
   where not public.is_admin();
$$;

-- D44 rules, checked only when an ID or password is set (logins still accept
-- older ones): ID ^[0-9a-z가-힣._-]{2,20}$ on the normalized ID; password
-- ^[\x21-\x7E]{4,10}$ written as [!-~] (printable ASCII, no space).
create or replace function public.lms_id_rule_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p ~ '^[0-9a-z가-힣._-]{2,20}$', false);
$$;

create or replace function public.lms_pw_rule_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p ~ '^[!-~]{4,10}$', false);
$$;

-- D44: may an account of p_role in branch p_branch NOT use this normalized ID?
-- Taken = any member of that branch, or a branch account (role 1) anywhere;
-- for a branch account also any member anywhere. p_except = the member being
-- renamed.
create or replace function public.lms_id_taken(
  p_norm text, p_role int, p_branch uuid, p_except uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.members m
     where public.lms_norm_id(m.id) = p_norm
       and m.member_id is distinct from p_except
       and (m.branch_id = p_branch or m.role = 1 or p_role = 1));
$$;

-- The next free suffix for a taken ID: 김민준 → 김민준2, 김민준3 … (≤ 20 chars).
create or replace function public.lms_id_suggest(
  p_norm text, p_role int, p_branch uuid, p_except uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  n    int;
  cand text;
begin
  for n in 2 .. 999 loop
    cand := left(p_norm, 20 - length(n::text)) || n;
    if public.lms_id_rule_ok(cand)
       and not public.lms_id_taken(cand, p_role, p_branch, p_except) then
      return cand;
    end if;
  end loop;
  return null;
end;
$$;

-- D45/D46: may the caller manage this member?
--   'edit'   (name, login ID, password, active): admin → anyone; branch account
--            → teachers and students of its branch; teacher → students of the
--            classes it teaches.
--   'unlock' the same, but a branch account may unlock anyone of its branch.
create or replace function public.lms_can_manage_member(p_member_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((
    select case
      when c.is_admin then true
      when c.role = 1 then t.branch_id = c.branch_id
                       and (t.role in (2, 3) or p_kind = 'unlock')
      when c.role = 2 then t.role = 3 and t.branch_id = c.branch_id
                       and exists (select 1 from public.class_members cm
                                     join public.classes k on k.id = cm.class_id
                                    where cm.member_id = t.member_id
                                      and k.teacher_id = c.member_id)
      else false
    end
      from public.lms_caller() c
      cross join public.members t
     where t.member_id = p_member_id), false);
$$;

-- D45: may the caller manage this class? admin → any; branch account → the
-- classes of its branch; teacher → the classes it teaches.
create or replace function public.lms_can_manage_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((
    select case
      when c.is_admin then true
      when c.role = 1 then k.branch_id = c.branch_id
      when c.role = 2 then k.branch_id = c.branch_id and k.teacher_id = c.member_id
      else false
    end
      from public.lms_caller() c
      cross join public.classes k
     where k.id = p_class_id), false);
$$;

-- D45: the roles the caller may create — admin 1-3, branch account 2-3,
-- teacher 3 (students only).
create or replace function public.lms_can_create_role(p_role int)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((
    select case
      when c.is_admin then p_role in (1, 2, 3)
      when c.role = 1 then p_role in (2, 3)
      when c.role = 2 then p_role = 3
      else false
    end
      from public.lms_caller() c), false);
$$;

-- Make one account once the caller's rights are checked (lms_member_create,
-- lms_bulk_create_members): ID / password / name rules and D44; with
-- p_auto_suffix a taken ID becomes the suggested one. The ID is stored
-- normalized. Internal — never callable from the API.
create or replace function public.lms_member_insert(
  p_login_id text, p_password text, p_role int, p_display_name text,
  p_branch uuid, p_auto_suffix boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_id   text := public.lms_norm_id(p_login_id);
  v_name text := nullif(btrim(p_display_name), '');
  v_sug  text;
  v_mid  uuid;
begin
  if not public.lms_id_rule_ok(v_id) then
    return jsonb_build_object('status', 'invalid', 'field', 'login_id');
  end if;
  if not public.lms_pw_rule_ok(p_password) then
    return jsonb_build_object('status', 'invalid', 'field', 'password');
  end if;
  if length(v_name) > 40 then
    return jsonb_build_object('status', 'invalid', 'field', 'display_name');
  end if;
  -- One account-ID write at a time: the branch-account rule is no index, so
  -- two calls could otherwise both take the same free ID.
  perform pg_advisory_xact_lock(7303, 0);
  if public.lms_id_taken(v_id, p_role, p_branch) then
    v_sug := public.lms_id_suggest(v_id, p_role, p_branch);
    if not coalesce(p_auto_suffix, false) or v_sug is null then
      return jsonb_build_object('status', 'duplicate', 'suggestion', v_sug);
    end if;
    v_id := v_sug;
  end if;
  insert into public.members
    (id, password_hash, role, branch_id, display_name, active, password_changed_at)
  values (v_id, extensions.crypt(p_password, extensions.gen_salt('bf')), p_role, p_branch, v_name, true, now())
  returning member_id into v_mid;
  return jsonb_build_object('status', 'ok', 'member_id', v_mid, 'login_id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Branches (D45: top admin only — create, rename, deactivate; no delete)
-- ---------------------------------------------------------------------------
-- p_code: the branch's short internal handle (members never type it),
-- ^[a-z0-9-]{2,20}$ after lower-casing; none given → 'b-' + 12 hex digits.
-- (The first draft took p_name only; that signature is dropped so PostgREST
-- never sees two lms_branch_create — the 42725 trap, NOTES.)
drop function if exists public.lms_branch_create(text);
create or replace function public.lms_branch_create(p_name text, p_code text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_name text := nullif(btrim(p_name), '');
  v_code text := nullif(lower(btrim(p_code)), '');
  v_id   uuid;
  v_con  text;
begin
  if not exists (select 1 from public.lms_caller() c where c.is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) > 40 then
    return jsonb_build_object('status', 'invalid', 'field', 'name');
  end if;
  if v_code is not null and v_code !~ '^[a-z0-9-]{2,20}$' then
    return jsonb_build_object('status', 'invalid', 'field', 'code');
  end if;
  if exists (select 1 from public.branches b where lower(b.name) = lower(v_name)) then
    return jsonb_build_object('status', 'duplicate', 'field', 'name');
  end if;
  if exists (select 1 from public.branches b where b.code = v_code) then
    return jsonb_build_object('status', 'duplicate', 'field', 'code');
  end if;
  -- N5: two calls at the same moment can both pass the checks above (neither
  -- sees the other's row yet); the unique index then stops the second one —
  -- answer as the checks do, not with error 23505.
  begin
    insert into public.branches (code, name)
    values (coalesce(v_code, 'b-' || encode(extensions.gen_random_bytes(6), 'hex')), v_name)
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_con = constraint_name;
    return jsonb_build_object('status', 'duplicate', 'field',
                              case when v_con = 'branches_name_key' then 'name' else 'code' end);
  end;
  return jsonb_build_object('status', 'ok', 'branch_id', v_id);
end;
$$;

-- Rename and/or (de)activate. Switching a branch off signs its members out
-- now (D47); lms_member() already refuses members of an inactive branch.
create or replace function public.lms_branch_update(
  p_branch_id uuid, p_name text default null, p_active boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  b      record;
  v_name text;
begin
  if not exists (select 1 from public.lms_caller() c where c.is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into b from public.branches x where x.id = p_branch_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_name is not null then
    v_name := nullif(btrim(p_name), '');
    if v_name is null or length(v_name) > 40 then
      return jsonb_build_object('status', 'invalid', 'field', 'name');
    end if;
    if exists (select 1 from public.branches x
                where lower(x.name) = lower(v_name) and x.id <> p_branch_id) then
      return jsonb_build_object('status', 'duplicate', 'field', 'name');
    end if;
  end if;
  update public.branches x
     set name = coalesce(v_name, x.name), active = coalesce(p_active, x.active)
   where x.id = p_branch_id;
  if b.active and p_active is false then
    delete from public.lms_sessions s
     using public.members m
     where m.member_id = s.member_id and m.branch_id = p_branch_id;
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- Members (D45 rows 2-4, D47)
-- ---------------------------------------------------------------------------

-- The members the caller may see, without password_hash (D14 — still no
-- direct select on members for LMS roles): admin → everyone (or one branch);
-- branch account → teachers and students of its branch; teacher → students of
-- its branch (class_ids: only the classes it teaches; in_class: in any class
-- at all — a teacher may add only students with none, D51). locked /
-- lock_retry_sec = the login lock on the ID or on the account itself (D46).
-- (An earlier draft had no in_class column; a changed column list needs a
-- drop first — only when the old shape is there, so re-runs change nothing.)
do $$
begin
  -- to_regprocedure (NULL when missing): a '…'::regprocedure literal would be
  -- resolved at plan time and fail on a database without the function.
  if pg_get_function_result(to_regprocedure('public.lms_member_list(uuid)')) !~ 'in_class' then
    drop function public.lms_member_list(uuid);
  end if;
end;
$$;

create or replace function public.lms_member_list(p_branch_id uuid default null)
returns table (
  member_id uuid, login_id text, display_name text, role smallint, branch_id uuid,
  branch_name text, active boolean, class_ids uuid[], in_class boolean, locked boolean,
  lock_retry_sec int, last_login_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  c record;
begin
  select * into c from public.lms_caller();
  if not found or not (c.is_admin or c.role in (1, 2)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select m.member_id, m.id, m.display_name, m.role, m.branch_id, b.name, m.active,
           array(select cm.class_id from public.class_members cm
                   join public.classes k on k.id = cm.class_id
                  where cm.member_id = m.member_id
                    and (c.role is distinct from 2 or k.teacher_id = c.member_id)
                  order by cm.class_id),
           exists (select 1 from public.class_members cm where cm.member_id = m.member_id),
           coalesce(l.until > now(), false),
           case when l.until > now()
                then greatest(ceil(extract(epoch from l.until - now()))::int, 1) end,
           m.last_login_at, m.created_at
      from public.members m
      join public.branches b on b.id = m.branch_id
      cross join lateral (
        select max(a.locked_until) as until
          from public.login_attempts a
         where a.key in ('id:' || left(public.lms_norm_id(m.id), 64), 'm:' || m.member_id)) l
     where case when c.is_admin then p_branch_id is null or m.branch_id = p_branch_id
                when c.role = 1 then m.branch_id = c.branch_id and m.role in (2, 3)
                else m.branch_id = c.branch_id and m.role = 3 end
     order by b.name, m.role, m.id;
end;
$$;

-- Before a bulk upload (§4.5): would these IDs be free for p_role? Answers
-- only for the caller's own branch (an LMS caller's p_branch_id is ignored —
-- no ID enumeration in other branches, §4.8); branch-account IDs count
-- everywhere (D44). Rows in input order: ok | duplicate (+ suggestion) | invalid.
create or replace function public.lms_check_login_ids(
  p_ids text[], p_role int default 3, p_branch_id uuid default null
)
returns table (input text, login_id text, status text, suggestion text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c        record;
  v_branch uuid;
  v        text;
begin
  select * into c from public.lms_caller();
  if not found or not public.lms_can_create_role(p_role) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 500 then
    raise exception 'at most 500 IDs per call' using errcode = '22023';
  end if;
  if c.is_admin then
    v_branch := p_branch_id;
    if v_branch is null then
      raise exception 'p_branch_id is required' using errcode = '22023';
    end if;
  else
    v_branch := c.branch_id;
  end if;
  foreach v in array coalesce(p_ids, '{}'::text[]) loop
    input := v;
    login_id := public.lms_norm_id(v);
    suggestion := null;
    if not public.lms_id_rule_ok(login_id) then
      status := 'invalid';
    elsif public.lms_id_taken(login_id, p_role, v_branch) then
      status := 'duplicate';
      suggestion := public.lms_id_suggest(login_id, p_role, v_branch);
    else
      status := 'ok';
    end if;
    return next;
  end loop;
end;
$$;

-- Create one account (D45 row 3). An LMS caller's own branch always wins over
-- p_branch_id; the top admin must name an existing branch.
create or replace function public.lms_member_create(
  p_login_id text, p_password text, p_role int,
  p_display_name text default null, p_branch_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  c        record;
  v_branch uuid;
begin
  select * into c from public.lms_caller();
  if not found or not public.lms_can_create_role(p_role) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if c.is_admin then
    select b.id into v_branch from public.branches b where b.id = p_branch_id;
    if v_branch is null then
      return jsonb_build_object('status', 'invalid', 'field', 'branch');
    end if;
  else
    v_branch := c.branch_id;
  end if;
  return public.lms_member_insert(p_login_id, p_password, p_role, p_display_name, v_branch);
end;
$$;

-- Change login ID, name, password and/or active (D45 row 4). NULL = keep;
-- a blank name clears it. A new password or deactivation ends the member's
-- sessions (triggers). All rules are checked before anything is written.
create or replace function public.lms_member_update(
  p_member_id uuid, p_login_id text default null, p_display_name text default null,
  p_password text default null, p_active boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  t      record;
  v_id   text;
  v_name text;
begin
  if not public.lms_can_manage_member(p_member_id, 'edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- D52: only the top admin and the branch account change login IDs; a
  -- teacher changes a student's name, password and active only.
  if p_login_id is not null
     and not exists (select 1 from public.lms_caller() c where c.is_admin or c.role = 1) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into t from public.members m where m.member_id = p_member_id;
  if p_login_id is not null then
    v_id := public.lms_norm_id(p_login_id);
    if not public.lms_id_rule_ok(v_id) then
      return jsonb_build_object('status', 'invalid', 'field', 'login_id');
    end if;
  end if;
  if p_password is not null and not public.lms_pw_rule_ok(p_password) then
    return jsonb_build_object('status', 'invalid', 'field', 'password');
  end if;
  if p_display_name is not null then
    v_name := nullif(btrim(p_display_name), '');
    if length(v_name) > 40 then
      return jsonb_build_object('status', 'invalid', 'field', 'display_name');
    end if;
  end if;
  if v_id is not null and v_id is distinct from public.lms_norm_id(t.id) then
    perform pg_advisory_xact_lock(7303, 0);
    if public.lms_id_taken(v_id, t.role, t.branch_id, t.member_id) then
      return jsonb_build_object('status', 'duplicate',
        'suggestion', public.lms_id_suggest(v_id, t.role, t.branch_id, t.member_id));
    end if;
  end if;
  update public.members m
     set id            = coalesce(v_id, m.id),
         display_name  = case when p_display_name is not null then v_name else m.display_name end,
         password_hash = case when p_password is not null
                              then extensions.crypt(p_password, extensions.gen_salt('bf')) else m.password_hash end,
         active        = coalesce(p_active, m.active)
   where m.member_id = p_member_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- D47: only the top admin deletes (sessions, class rows and download log go
-- with the member; a class it taught keeps no teacher).
create or replace function public.lms_member_delete(p_member_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.lms_caller() c where c.is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.members m where m.member_id = p_member_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- Classes (D45 rows 5-6). A class's teacher and students belong to its branch.
-- ---------------------------------------------------------------------------

-- Admin: any branch (named), any teacher of it. Branch account: its branch,
-- any of its teachers. Teacher: its branch, itself as the teacher.
create or replace function public.lms_class_create(
  p_name text, p_teacher_id uuid default null, p_branch_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  c         record;
  v_name    text := nullif(btrim(p_name), '');
  v_branch  uuid;
  v_teacher uuid;
  v_id      uuid;
begin
  select * into c from public.lms_caller();
  if not found or not (c.is_admin or c.role in (1, 2)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if c.is_admin then
    select b.id into v_branch from public.branches b where b.id = p_branch_id;
    if v_branch is null then
      return jsonb_build_object('status', 'invalid', 'field', 'branch');
    end if;
    v_teacher := p_teacher_id;
  elsif c.role = 1 then
    v_branch := c.branch_id;
    v_teacher := p_teacher_id;
  else
    v_branch := c.branch_id;
    v_teacher := c.member_id;
  end if;
  if v_name is null or length(v_name) > 40 then
    return jsonb_build_object('status', 'invalid', 'field', 'name');
  end if;
  if v_teacher is not null and not exists (
       select 1 from public.members t
        where t.member_id = v_teacher and t.role = 2 and t.branch_id = v_branch) then
    return jsonb_build_object('status', 'invalid', 'field', 'teacher');
  end if;
  if exists (select 1 from public.classes k where k.branch_id = v_branch and k.name = v_name) then
    return jsonb_build_object('status', 'duplicate', 'field', 'name');
  end if;
  insert into public.classes (branch_id, name, teacher_id)
  values (v_branch, v_name, v_teacher)
  returning id into v_id;
  return jsonb_build_object('status', 'ok', 'class_id', v_id);
end;
$$;

-- Rename / (de)activate a class the caller manages. Changing the teacher
-- (p_set_teacher; p_teacher_id NULL = none) is for the admin and the branch
-- account only — a teacher's classes stay its own.
create or replace function public.lms_class_update(
  p_class_id uuid, p_name text default null, p_active boolean default null,
  p_set_teacher boolean default false, p_teacher_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  c      record;
  k      record;
  v_name text;
  v_set  boolean := coalesce(p_set_teacher, false);
begin
  -- The caller first, and no caller = no entry (security review of D53, same
  -- as lms_class_add_member): a session ended between two statements would
  -- leave c empty and skip the teacher-change check below.
  select * into c from public.lms_caller();
  if not found or not public.lms_can_manage_class(p_class_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_set and not (c.is_admin or c.role = 1) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into k from public.classes x where x.id = p_class_id;
  if p_name is not null then
    v_name := nullif(btrim(p_name), '');
    if v_name is null or length(v_name) > 40 then
      return jsonb_build_object('status', 'invalid', 'field', 'name');
    end if;
    if exists (select 1 from public.classes x
                where x.branch_id = k.branch_id and x.name = v_name and x.id <> p_class_id) then
      return jsonb_build_object('status', 'duplicate', 'field', 'name');
    end if;
  end if;
  if v_set and p_teacher_id is not null and not exists (
       select 1 from public.members t
        where t.member_id = p_teacher_id and t.role = 2 and t.branch_id = k.branch_id) then
    return jsonb_build_object('status', 'invalid', 'field', 'teacher');
  end if;
  update public.classes x
     set name       = coalesce(v_name, x.name),
         active     = coalesce(p_active, x.active),
         teacher_id = case when v_set then p_teacher_id else x.teacher_id end
   where x.id = p_class_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- D47: only the top admin deletes a class (its member rows go with it).
create or replace function public.lms_class_delete(p_class_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.lms_caller() c where c.is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.classes k where k.id = p_class_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Put a student into a class the caller manages. A member the caller cannot
-- see (another branch, or none) → 42501; a teacher, or a student of another
-- branch than the class → invalid. Already in = ok, added false.
-- For a teacher this is a move (D53): a student in other classes that are all
-- the teacher's own leaves them in the same call; one in anyone else's class
-- → 42501 (D51). The branch account and the admin only add (a second class).
create or replace function public.lms_class_add_member(p_class_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  c record;
  k record;
  t record;
  n int;
begin
  -- The caller first, and no caller = no entry (security review of D53): a
  -- session ended between two statements would leave c empty and skip the
  -- D51 check below.
  select * into c from public.lms_caller();
  if not found or not public.lms_can_manage_class(p_class_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into k from public.classes x where x.id = p_class_id;
  select m.member_id, m.role, m.branch_id into t
    from public.members m where m.member_id = p_member_id;
  if t.member_id is null or (not c.is_admin and t.branch_id <> c.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- One class change per student at a time (security review N1): else two
  -- adds at the same instant could both pass the D51 check below.
  perform pg_advisory_xact_lock(7304, hashtext(p_member_id::text));
  -- D51: a teacher adds only students that have no class yet, or (D53) whose
  -- other classes are all its own; moving a student out of anyone else's
  -- class is for the branch account and the admin.
  if c.role = 2 and exists (select 1 from public.class_members cm
                              join public.classes x on x.id = cm.class_id
                             where cm.member_id = p_member_id and cm.class_id <> p_class_id
                               and (x.teacher_id is distinct from c.member_id
                                    or x.branch_id <> c.branch_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if t.role <> 3 or t.branch_id <> k.branch_id then
    return jsonb_build_object('status', 'invalid', 'field', 'member');
  end if;
  insert into public.class_members (class_id, member_id)
  values (p_class_id, p_member_id)
  on conflict do nothing;
  get diagnostics n = row_count;
  if c.role = 2 then
    -- D53: out of its other classes — again only the teacher's own, so a
    -- class handed to another teacher meanwhile keeps the student.
    delete from public.class_members cm
     using public.classes x
     where x.id = cm.class_id
       and cm.member_id = p_member_id and cm.class_id <> p_class_id
       and x.teacher_id = c.member_id and x.branch_id = c.branch_id;
  end if;
  return jsonb_build_object('status', 'ok', 'added', n > 0);
end;
$$;

create or replace function public.lms_class_remove_member(p_class_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  n int;
begin
  if not public.lms_can_manage_class(p_class_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.class_members cm
   where cm.class_id = p_class_id and cm.member_id = p_member_id;
  get diagnostics n = row_count;
  return jsonb_build_object('status', 'ok', 'removed', n > 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Unlock (D46). Clears the member's own key 'm:<member_id>' and the ID key
-- 'id:<normalized ID>'. The ID key is shared by every branch, so the same ID
-- elsewhere is unlocked too (accepted) — but each account's own key is not:
-- clearing the ID key no longer helps anyone guess at another branch's
-- account (security review H2), its failures sit on its own key.
-- ---------------------------------------------------------------------------
create or replace function public.lms_unlock_member(p_member_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  n int;
begin
  if not public.lms_can_manage_member(p_member_id, 'unlock') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.login_attempts a
   using public.members m
   where m.member_id = p_member_id
     and a.key in ('id:' || left(public.lms_norm_id(m.id), 64), 'm:' || m.member_id);
  get diagnostics n = row_count;
  return jsonb_build_object('status', 'ok', 'cleared', n > 0);
end;
$$;

-- Top admin only: any key — 'id:…', 'm:…' or 'ip:…' (IP locks are the
-- admin's alone).
create or replace function public.lms_unlock_key(p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  n int;
begin
  if not exists (select 1 from public.lms_caller() c where c.is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_key is null or p_key !~ '^(id|ip|m):.' then
    return jsonb_build_object('status', 'invalid', 'field', 'key');
  end if;
  delete from public.login_attempts a where a.key = p_key;
  get diagnostics n = row_count;
  return jsonb_build_object('status', 'ok', 'cleared', n > 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Bulk (3.4, §4.5): one call = one transaction, at most 500 rows. Any bad row
-- → nothing is kept, and every row says why. Never returns a password.
-- ---------------------------------------------------------------------------

-- p_rows: [{login_id, password, role (2|3), display_name?, class?, branch_id
-- (top admin only)}]. class = a class name of the row's branch the caller
-- manages. With p_auto_suffix a taken ID takes the suggested one.
create or replace function public.lms_bulk_create_members(
  p_rows jsonb, p_auto_suffix boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  c        record;
  n_rows   int;
  i        int;
  r        jsonb;
  v_role   int;
  v_branch uuid;
  v_class  uuid;
  v_cname  text;
  v_reason text;
  res      jsonb;
  v_out    jsonb := '[]'::jsonb;
  n_ok     int := 0;
  n_bad    int := 0;
begin
  select * into c from public.lms_caller();
  if not found or not (c.is_admin or c.role in (1, 2)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    return jsonb_build_object('status', 'invalid', 'field', 'rows');
  end if;
  n_rows := jsonb_array_length(p_rows);
  if n_rows = 0 then
    return jsonb_build_object('status', 'invalid', 'field', 'rows');
  end if;
  if n_rows > 500 then
    return jsonb_build_object('status', 'too_many', 'limit', 500);
  end if;

  begin
    for i in 0 .. n_rows - 1 loop
      r := p_rows -> i;
      v_reason := null;
      res := null;
      v_class := null;
      v_branch := null;
      v_cname := nullif(btrim(r ->> 'class'), '');
      v_role := case when (r ->> 'role') ~ '^[23]$' then (r ->> 'role')::int end;
      if v_role is null or not public.lms_can_create_role(v_role) then
        v_reason := 'role';
      elsif c.is_admin then
        select b.id into v_branch from public.branches b where b.id::text = (r ->> 'branch_id');
        if v_branch is null then
          v_reason := 'branch';
        end if;
      else
        v_branch := c.branch_id;
      end if;
      if v_reason is null and v_cname is not null then
        select k.id into v_class from public.classes k
         where k.branch_id = v_branch and k.name = v_cname;
        if v_role <> 3 then
          v_reason := 'not_student';  -- class members are students (teachers: classes.teacher_id)
        elsif v_class is null then
          v_reason := 'class';
        elsif not public.lms_can_manage_class(v_class) then
          v_reason := 'class_not_allowed';
        end if;
      end if;
      if v_reason is null then
        res := public.lms_member_insert(r ->> 'login_id', r ->> 'password', v_role,
                                        r ->> 'display_name', v_branch, p_auto_suffix);
        if res ->> 'status' <> 'ok' then
          v_reason := coalesce(res ->> 'field', res ->> 'status');
        elsif v_class is not null then
          insert into public.class_members (class_id, member_id)
          values (v_class, (res ->> 'member_id')::uuid)
          on conflict do nothing;
        end if;
      end if;
      if v_reason is null then
        n_ok := n_ok + 1;
      else
        n_bad := n_bad + 1;
      end if;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'row', i + 1,
        'login_id', coalesce(res ->> 'login_id', public.lms_norm_id(r ->> 'login_id')),
        'role', v_role,
        'class', v_cname,
        'result', case when v_reason is null then 'ok' else 'error' end,
        'reason', v_reason,
        'suggestion', res ->> 'suggestion')));
    end loop;
    if n_bad > 0 then
      raise exception 'LMS_BULK_ROLLBACK';  -- undo every row made above
    end if;
  exception when others then
    if sqlerrm <> 'LMS_BULK_ROLLBACK' then
      raise;
    end if;
  end;

  if n_bad > 0 then
    return jsonb_build_object('status', 'error', 'created', 0, 'errors', n_bad, 'rows', v_out);
  end if;
  return jsonb_build_object('status', 'ok', 'created', n_ok, 'rows', v_out);
end;
$$;

-- p_rows: [{class, login_id}] — students into classes of one branch (the
-- caller's; the top admin names it in p_branch_id). Same all-or-nothing rule.
-- A teacher's row is a move, as lms_class_add_member (D53 → D56): fine when
-- the student's other classes are all its own (it leaves them), in_other_class
-- when any is someone else's; the same student again for another class is
-- duplicate_row. The branch account and the admin only add.
-- Every student of the file is locked first, in one fixed order (N4).
create or replace function public.lms_bulk_assign(p_rows jsonb, p_branch_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  c        record;
  t        record;
  v_branch uuid;
  n_rows   int;
  i        int;
  r        jsonb;
  v_cname  text;
  v_lid    text;
  v_class  uuid;
  v_reason text;
  v_key    int;
  v_placed jsonb := '{}'::jsonb;  -- teacher: student → the class this call put it in
  v_out    jsonb := '[]'::jsonb;
  n_ok     int := 0;
  n_bad    int := 0;
begin
  select * into c from public.lms_caller();
  if not found or not (c.is_admin or c.role in (1, 2)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if c.is_admin then
    select b.id into v_branch from public.branches b where b.id = p_branch_id;
    if v_branch is null then
      return jsonb_build_object('status', 'invalid', 'field', 'branch');
    end if;
  else
    v_branch := c.branch_id;
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    return jsonb_build_object('status', 'invalid', 'field', 'rows');
  end if;
  n_rows := jsonb_array_length(p_rows);
  if n_rows = 0 then
    return jsonb_build_object('status', 'invalid', 'field', 'rows');
  end if;
  if n_rows > 500 then
    return jsonb_build_object('status', 'too_many', 'limit', 500);
  end if;

  -- N4: lock every student this file names before any write, in one fixed
  -- order (the lock number) — two bulk calls naming the same students in
  -- opposite orders then queue instead of each holding what the other waits for.
  for v_key in
    select distinct hashtext(m.member_id::text)
      from public.members m
     where m.branch_id = v_branch
       and public.lms_norm_id(m.id) in (
             select public.lms_norm_id(e ->> 'login_id') from jsonb_array_elements(p_rows) e)
     order by 1
  loop
    perform pg_advisory_xact_lock(7304, v_key);
  end loop;

  begin
    for i in 0 .. n_rows - 1 loop
      r := p_rows -> i;
      v_reason := null;
      v_class := null;
      v_cname := nullif(btrim(r ->> 'class'), '');
      v_lid := public.lms_norm_id(r ->> 'login_id');
      select k.id into v_class from public.classes k
       where k.branch_id = v_branch and k.name = v_cname;
      if v_class is null then
        v_reason := 'class';
      elsif not public.lms_can_manage_class(v_class) then
        v_reason := 'class_not_allowed';
      else
        select m.member_id, m.role into t
          from public.members m
         where m.branch_id = v_branch and public.lms_norm_id(m.id) = v_lid;
        if t.member_id is not null then
          -- as add_member (N1); already held from the N4 loop unless the ID
          -- changed in between
          perform pg_advisory_xact_lock(7304, hashtext(t.member_id::text));
        end if;
        if t.member_id is null then
          v_reason := 'member';
        elsif t.role <> 3 then
          v_reason := 'not_student';
        elsif c.role = 2 and v_placed ? t.member_id::text
              and v_placed ->> t.member_id::text <> v_class::text then
          -- the same student again, for another class: that move would
          -- silently undo the earlier row (security review of D56, L1)
          v_reason := 'duplicate_row';
        elsif c.role = 2 and exists (select 1 from public.class_members cm
                                       join public.classes x on x.id = cm.class_id
                                      where cm.member_id = t.member_id and cm.class_id <> v_class
                                        and (x.teacher_id is distinct from c.member_id
                                             or x.branch_id <> c.branch_id)) then
          v_reason := 'in_other_class';  -- D51 / D56: in someone else's class
        else
          insert into public.class_members (class_id, member_id)
          values (v_class, t.member_id)
          on conflict do nothing;
          if c.role = 2 then
            -- D56 (as D53): out of the teacher's other classes — again only
            -- its own, so a class handed to another teacher keeps the student
            delete from public.class_members cm
             using public.classes x
             where x.id = cm.class_id
               and cm.member_id = t.member_id and cm.class_id <> v_class
               and x.teacher_id = c.member_id and x.branch_id = c.branch_id;
            v_placed := v_placed || jsonb_build_object(t.member_id::text, v_class);
          end if;
        end if;
      end if;
      if v_reason is null then
        n_ok := n_ok + 1;
      else
        n_bad := n_bad + 1;
      end if;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'row', i + 1, 'class', v_cname, 'login_id', v_lid,
        'result', case when v_reason is null then 'ok' else 'error' end,
        'reason', v_reason)));
    end loop;
    if n_bad > 0 then
      raise exception 'LMS_BULK_ROLLBACK';
    end if;
  exception when others then
    if sqlerrm <> 'LMS_BULK_ROLLBACK' then
      raise;
    end if;
  end;

  if n_bad > 0 then
    return jsonb_build_object('status', 'error', 'assigned', 0, 'errors', n_bad, 'rows', v_out);
  end if;
  return jsonb_build_object('status', 'ok', 'assigned', n_ok, 'rows', v_out);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3B grants — explicit (Supabase also grants new functions to anon /
-- authenticated by default; PUBLIC gets EXECUTE on every new function).
-- ---------------------------------------------------------------------------
revoke execute on function public.lms_caller() from public, anon, authenticated;
revoke execute on function public.lms_id_rule_ok(text) from public, anon, authenticated;
revoke execute on function public.lms_pw_rule_ok(text) from public, anon, authenticated;
revoke execute on function public.lms_id_taken(text, int, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.lms_id_suggest(text, int, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.lms_can_manage_member(uuid, text) from public, anon, authenticated;
revoke execute on function public.lms_can_manage_class(uuid) from public, anon, authenticated;
revoke execute on function public.lms_can_create_role(int) from public, anon, authenticated;
revoke execute on function public.lms_member_insert(text, text, int, text, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.lms_members_end_sessions() from public, anon, authenticated;

-- The RPCs: the browser calls them as anon (LMS token) or authenticated
-- (admin JWT); each checks its caller itself.
revoke execute on function public.lms_branch_create(text, text) from public;
revoke execute on function public.lms_branch_update(uuid, text, boolean) from public;
revoke execute on function public.lms_member_list(uuid) from public;
revoke execute on function public.lms_check_login_ids(text[], int, uuid) from public;
revoke execute on function public.lms_member_create(text, text, int, text, uuid) from public;
revoke execute on function public.lms_member_update(uuid, text, text, text, boolean) from public;
revoke execute on function public.lms_member_delete(uuid) from public;
revoke execute on function public.lms_class_create(text, uuid, uuid) from public;
revoke execute on function public.lms_class_update(uuid, text, boolean, boolean, uuid) from public;
revoke execute on function public.lms_class_delete(uuid) from public;
revoke execute on function public.lms_class_add_member(uuid, uuid) from public;
revoke execute on function public.lms_class_remove_member(uuid, uuid) from public;
revoke execute on function public.lms_unlock_member(uuid) from public;
revoke execute on function public.lms_unlock_key(text) from public;
revoke execute on function public.lms_bulk_create_members(jsonb, boolean) from public;
revoke execute on function public.lms_bulk_assign(jsonb, uuid) from public;
grant execute on function public.lms_branch_create(text, text) to anon, authenticated;
grant execute on function public.lms_branch_update(uuid, text, boolean) to anon, authenticated;
grant execute on function public.lms_member_list(uuid) to anon, authenticated;
grant execute on function public.lms_check_login_ids(text[], int, uuid) to anon, authenticated;
grant execute on function public.lms_member_create(text, text, int, text, uuid) to anon, authenticated;
grant execute on function public.lms_member_update(uuid, text, text, text, boolean) to anon, authenticated;
grant execute on function public.lms_member_delete(uuid) to anon, authenticated;
grant execute on function public.lms_class_create(text, uuid, uuid) to anon, authenticated;
grant execute on function public.lms_class_update(uuid, text, boolean, boolean, uuid) to anon, authenticated;
grant execute on function public.lms_class_delete(uuid) to anon, authenticated;
grant execute on function public.lms_class_add_member(uuid, uuid) to anon, authenticated;
grant execute on function public.lms_class_remove_member(uuid, uuid) to anon, authenticated;
grant execute on function public.lms_unlock_member(uuid) to anon, authenticated;
grant execute on function public.lms_unlock_key(text) to anon, authenticated;
grant execute on function public.lms_bulk_create_members(jsonb, boolean) to anon, authenticated;
grant execute on function public.lms_bulk_assign(jsonb, uuid) to anon, authenticated;

-- Make PostgREST (the REST API) see the new RPCs right away.
notify pgrst, 'reload schema';
-- ==== end LMS (Phase 3B) ====

-- ============================================================================
-- Teacher resources (교사 자료실, 2026-10-29) — 1 private bucket + 1 table
-- ----------------------------------------------------------------------------
-- ADD-ONLY and safe to re-run. Needs the "LMS (Phase 3A)" block above
-- (lms_member). Level keys are the NEW keys: beginner · level-1..3.
-- D64 (2026-11-02): a slot holds an uploaded file OR a Google Drive file
-- ("anyone with the link"; only its ID is stored). Teachers download a Drive
-- file from Google directly — no Storage egress, no Edge Function, no daily
-- limit; files keep every rule below (the day's limit, 15 s URL, 10 MB, PDF/xlsx/xls).
-- Slots, in card order (D65, 2026-11-02): monthly-03 … monthly-12 (월간교육안
-- 3월~12월, one per month) · plan (연간교육안 — the old '월간.연간교육안'
-- slot key, kept so live files and Storage paths <level>/plan/… stay where
-- they are) · award (상장) · test (테스트, level-2/3 only) · script (핵심문장
-- 스크립트) · pictures (그림 자료실) · flashcards (플래쉬카드). 15 + 15 + 16
-- + 16 = 62 slots. D63's single 'monthly' slot is gone: its rows must be
-- deleted in the admin screen first (the file stops below while one is left).
-- Admins upload / replace / delete. Admins and LMS role 1 (branch) / 2
-- (teacher) list the slots and download through the Edge Function
-- supabase/functions/teacher-resource-download (PM decision 2026-10-29, (나)):
-- it calls teacher_resource_issue() with the service role (the caller's
-- x-lms-token forwarded, or an admin uid it verified), then signs a URL that
-- expires after 15 seconds — fixed on the server, so no long-lived link can be
-- made from the browser. LMS members are limited to 1,000 issues per KST day
-- (D82, 2026-11-08 — was 30: a safety stop only, for a leaked account or a
-- loop; one ZIP of N files = N issues).
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

-- One row per filled slot. A file row: storage_path is ASCII only,
-- <level>/<slot>/<upload epoch ms>.<ext>; the original (Korean) name lives in
-- file_name and becomes the download name. A Drive row (D64): drive_id only —
-- the three file columns are NULL (the path / size checks pass on NULL).
create table if not exists public.teacher_resources (
  level        text not null,
  slot         text not null,
  storage_path text unique,
  file_name    text check (length(file_name) between 1 and 200),
  file_size    bigint check (file_size between 1 and 10485760),
  updated_at   timestamptz not null default now(),
  drive_id     text,
  primary key (level, slot),
  constraint teacher_resources_slot_ok check (
    level in ('beginner', 'level-1', 'level-2', 'level-3')
    and (slot in ('monthly-03', 'monthly-04', 'monthly-05', 'monthly-06', 'monthly-07',
                  'monthly-08', 'monthly-09', 'monthly-10', 'monthly-11', 'monthly-12',
                  'plan', 'award', 'script', 'pictures', 'flashcards')
         or (slot = 'test' and level in ('level-2', 'level-3')))),
  constraint teacher_resources_path_ok check (
    storage_path ~ ('^' || level || '/' || slot || '/[0-9]{13}\.(pdf|xlsx|xls)$')),
  constraint teacher_resources_source_ok check (
    (drive_id is null and storage_path is not null and file_name is not null and file_size is not null)
    or (drive_id is not null and storage_path is null and file_name is null and file_size is null)),
  constraint teacher_resources_drive_ok check (drive_id ~ '^[A-Za-z0-9_-]{25,64}$')
);

-- D64 on a table made before Drive links (`create table if not exists`
-- leaves it as it is): the column, the three file columns nullable, and the
-- two rules — each ALTER is one statement, the same result on every run.
-- Live rows are all file rows, so the rules pass.
alter table public.teacher_resources add column if not exists drive_id text;
alter table public.teacher_resources
  alter column storage_path drop not null,
  alter column file_name drop not null,
  alter column file_size drop not null;
alter table public.teacher_resources
  drop constraint if exists teacher_resources_source_ok,
  add constraint teacher_resources_source_ok check (
    (drive_id is null and storage_path is not null and file_name is not null and file_size is not null)
    or (drive_id is not null and storage_path is null and file_name is null and file_size is null)),
  drop constraint if exists teacher_resources_drive_ok,
  add constraint teacher_resources_drive_ok check (drive_id ~ '^[A-Za-z0-9_-]{25,64}$');

-- D65: a row still in D63's single 'monthly' slot stops this file here, before
-- the slot rule below would refuse it — with a message instead of a bare
-- check violation. Delete those in the admin screen first (its Storage object
-- goes with the delete). A stopped run changes nothing when the file runs as
-- ONE transaction (the SQL Editor, or psql -1 -v ON_ERROR_STOP=1); live, the
-- one-DO-block apply puts this check first.
do $$
declare
  v_left int;
begin
  select count(*) into v_left from public.teacher_resources where slot = 'monthly';
  if v_left > 0 then
    raise exception '교사 자료실: 월간교육안(monthly) %개가 남아 있어요 — 관리자 화면(배너 → 교사 자료실)에서 먼저 지우세요 (D65).', v_left;
  end if;
end;
$$;

-- D63/D65: the same slot rule on a table made before (`create table if not
-- exists` leaves an existing table as it is). Drop + add in ONE statement
-- (atomic with any tool — security review L1) = the same definition on every
-- run; existing rows (plan / award / test) pass.
alter table public.teacher_resources
  drop constraint if exists teacher_resources_slot_ok,
  add constraint teacher_resources_slot_ok check (
    level in ('beginner', 'level-1', 'level-2', 'level-3')
    and (slot in ('monthly-03', 'monthly-04', 'monthly-05', 'monthly-06', 'monthly-07',
                  'monthly-08', 'monthly-09', 'monthly-10', 'monthly-11', 'monthly-12',
                  'plan', 'award', 'script', 'pictures', 'flashcards')
         or (slot = 'test' and level in ('level-2', 'level-3'))));

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

-- The level's slots in card order with the current file or Drive file ID
-- (both NULL = an empty slot, shown as "준비 중"). No rows for anyone else or
-- a bad level. monthly-03 … monthly-12 = 월간교육안 3~12월 (D65), plan =
-- 연간교육안 (the old 월간.연간교육안 key), then award, test (level-2/3),
-- script, pictures, flashcards. A page that does not know a slot ignores
-- that row (pages before D65 look up their own slots: their 'monthly' card
-- is "준비 중"); a page from before D64 shows a Drive slot as empty (its
-- file_name is NULL). D64 added drive_id to the result — a changed result
-- needs a drop first, done only while the old shape is there.
do $$
begin
  if pg_get_function_result(to_regprocedure('public.teacher_resources_list(text)')) !~ 'drive_id' then
    drop function public.teacher_resources_list(text);
  end if;
end;
$$;

-- An on/off switch in site_settings (2026-11-03): 'true' / 'false' (jsonb)
-- → that; missing or anything else → p_default. Internal (no grants): the
-- page reads site_settings itself (public read); RPCs ask this.
create or replace function public.site_flag(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (select case s.value when 'true'::jsonb then true when 'false'::jsonb then false end
       from public.site_settings s
      where s.key = p_key),
    p_default);
$$;

-- T3 (2026-11-03): the admin's switch 'teacher_resources_enabled' (배너 →
-- 교사 자료실 파일, default on). Off → no rows for branch / teacher
-- accounts (the page hides the button anyway); the admin keeps every row to
-- manage files. Files, links and the download function stay as they are.
create or replace function public.teacher_resources_list(p_level text)
returns table (slot text, file_name text, file_size bigint, updated_at timestamptz, drive_id text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.slot, r.file_name, r.file_size, r.updated_at, r.drive_id
    from (values ('monthly-03', 1), ('monthly-04', 2), ('monthly-05', 3), ('monthly-06', 4),
                 ('monthly-07', 5), ('monthly-08', 6), ('monthly-09', 7), ('monthly-10', 8),
                 ('monthly-11', 9), ('monthly-12', 10), ('plan', 11), ('award', 12),
                 ('test', 13), ('script', 14), ('pictures', 15), ('flashcards', 16))
         as s (slot, ord)
    left join public.teacher_resources r
      on r.level = p_level and r.slot = s.slot
   where public.teacher_resources_allowed()
     and (public.is_admin() or public.site_flag('teacher_resources_enabled', true))
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
-- {"status":"empty"} | {"status":"limit"} (1,000 per member per KST day, D82).
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
         where d.member_id = v_member and d.issued_at >= v_today) >= 1000 then
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

-- Admin: point a slot at an object that was just uploaded (a Drive link in
-- that slot goes — D64). Returns the REPLACED object's path (the client
-- deletes it from Storage), or NULL.
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
        drive_id     = null,
        updated_at   = now();
  return nullif(v_old, p_path);
end;
$$;

-- Admin (D64): point a slot at a Google Drive file — its ID only (the page
-- takes it out of the link; checked here again). An uploaded file in that
-- slot goes: returns its Storage path (the client deletes it), or NULL.
-- Clearing a link = teacher_resource_clear (returns NULL for a link).
create or replace function public.teacher_resource_set_drive(
  p_level text, p_slot text, p_drive_id text
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
  if p_drive_id is null or p_drive_id !~ '^[A-Za-z0-9_-]{25,64}$' then
    raise exception 'teacher resource: not a Google Drive file id' using errcode = '22023';
  end if;
  select r.storage_path into v_old
    from public.teacher_resources r
   where r.level = p_level and r.slot = p_slot
   for update;
  insert into public.teacher_resources as r (level, slot, drive_id, updated_at)
  values (p_level, p_slot, p_drive_id, now())
  on conflict (level, slot) do update
    set storage_path = null,
        file_name    = null,
        file_size    = null,
        drive_id     = excluded.drive_id,
        updated_at   = now();
  return v_old;
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

-- Storage: admins write (only well-formed ASCII paths) and read. Slots as
-- above (D65: monthly-03 … monthly-12, script, pictures, flashcards; the
-- single monthly is gone).
drop policy if exists teacher_resources_admin_all on storage.objects;
create policy teacher_resources_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'teacher-resources' and public.is_admin())
  with check (
    bucket_id = 'teacher-resources'
    and public.is_admin()
    and name ~ '^(beginner|level-1|level-2|level-3)/(monthly-(0[3-9]|1[0-2])|plan|award|test|script|pictures|flashcards)/[0-9]{13}\.(pdf|xlsx|xls)$'
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
revoke execute on function public.site_flag(text, boolean) from public, anon, authenticated;
grant execute on function public.teacher_resources_list(text) to anon, authenticated;
revoke execute on function public.teacher_resource_issue(text, text, uuid) from public, anon, authenticated;
grant execute on function public.teacher_resource_issue(text, text, uuid) to service_role;
revoke execute on function public.teacher_resource_set(text, text, text, text, bigint) from public, anon;
revoke execute on function public.teacher_resource_clear(text, text) from public, anon;
revoke execute on function public.teacher_resource_set_drive(text, text, text) from public, anon;
grant execute on function public.teacher_resource_set(text, text, text, text, bigint) to authenticated;
grant execute on function public.teacher_resource_clear(text, text) to authenticated;
grant execute on function public.teacher_resource_set_drive(text, text, text) to authenticated;

notify pgrst, 'reload schema';
-- ==== end Teacher resources ====

-- ============================================================================
-- Resource board (자료실, 2026-11-03) — a board of posts with attachments
-- ----------------------------------------------------------------------------
-- ADD-ONLY and safe to re-run. Needs the "LMS (Phase 3A)" block (lms_member)
-- and the "Teacher resources" block above (site_flag, and its download log
-- teacher_resource_downloads — one daily counter for both, PM B6; 1,000 a
-- day since D82).
-- The header's "Teacher / 교사자료실" button opens it (the page). Who reads:
-- the top admin and LMS branch (1) / teacher (2) accounts — students (3),
-- visitors and other signed-in users get nothing (B2). Who writes: the top
-- admin only, through the RPCs below (B3). The admin's switch
-- site_settings.resource_board_enabled (default off, B12): off → branch /
-- teacher accounts get {"status":"off"}; the admin keeps managing.
-- A post: title (1-100), body (plain text up to 5,000, line breaks kept, never
-- HTML on the page), ONE level (common = every level, beginner, level-1..3),
-- ONE category, public / hidden, pinned ("📌 공지" on the page) (B4); up to 50
-- attachments (D79, 2026-11-07 — was 20) in a set order, each an uploaded file
-- OR a Google Drive file ID (D64 rule: the ID only, 25-64 characters; teachers
-- open it from Google — no Storage traffic, no daily limit) (B6) OR — D80,
-- this board only — a Google Sheets / Docs / Slides file ID (the same shape;
-- teachers get .xlsx / .docx / .pptx from Google's export address, always the
-- latest version). Files live in the PRIVATE bucket
-- "resource-board" (10 MB; PDF, Excel, 한글, PowerPoint, JPG, PNG) at the ASCII
-- path <post id>/<epoch ms>-<6 random>.<ext>; the original (Korean) name is in
-- the table and becomes the download name. Downloads go through the Edge
-- Function teacher-resource-download ({attachment: <id>}): it calls
-- board_attachment_issue() with the service role and signs a 15-second URL.
-- The tables have RLS on and no policies or grants — RPCs only; no answer
-- carries a Storage path except to the admin (save / delete return the paths
-- the page then deletes from Storage).
-- ============================================================================

insert into public.site_settings (key, value)
values ('resource_board_enabled', 'false'::jsonb),
       ('teacher_resources_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- Private bucket: 10 MB; the page sets the type from the extension (한글
-- files often come with an empty or octet-stream type).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resource-board', 'resource-board', false, 10485760,
        array['application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel',
              'application/x-hwp',
              'application/vnd.hancom.hwpx',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'application/vnd.ms-powerpoint',
              'image/jpeg',
              'image/png'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Categories (B5): the admin renames, reorders, adds; one with posts cannot
-- be deleted. Each has a badge color (the site's light tints, the page maps
-- the key). Seeded once — only when the table is made, so a re-run never
-- brings back a category the admin renamed or deleted.
do $$
begin
  if to_regclass('public.board_categories') is null then
    create table public.board_categories (
      id       bigint generated always as identity primary key,
      name     text not null,
      position integer not null,
      color    text not null,
      constraint board_categories_name_ok check (name = btrim(name) and length(name) between 1 and 20),
      constraint board_categories_color_ok check (
        color in ('sky', 'indigo', 'yellow', 'red', 'green', 'purple', 'orange', 'teal', 'pink', 'gray'))
    );
    insert into public.board_categories (name, position, color) values
      ('월간교육안', 1, 'sky'), ('연간교육안', 2, 'indigo'), ('상장', 3, 'yellow'),
      ('테스트', 4, 'red'), ('핵심문장 스크립트', 5, 'green'), ('그림 자료실', 6, 'purple'),
      ('플래쉬카드', 7, 'orange');
  end if;
end;
$$;
create unique index if not exists board_categories_name_key
  on public.board_categories (lower(name));

-- Posts. The id is made by the admin page (crypto.randomUUID) before the
-- first upload, so files go straight to their post's folder.
create table if not exists public.board_posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null default '',
  level       text not null,
  category_id bigint not null references public.board_categories (id),
  published   boolean not null default true,
  pinned      boolean not null default false,
  view_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint board_posts_title_ok check (title = btrim(title) and length(title) between 1 and 100),
  constraint board_posts_body_ok check (length(body) <= 5000),
  constraint board_posts_level_ok check (level in ('common', 'beginner', 'level-1', 'level-2', 'level-3')),
  constraint board_posts_views_ok check (view_count >= 0)
);
create index if not exists board_posts_order_idx
  on public.board_posts (pinned desc, created_at desc);
create index if not exists board_posts_category_idx
  on public.board_posts (category_id);

-- Attachments, in `position` order. A file row: storage_path (ASCII, in its
-- post's folder), file_name (the original name), file_type, file_size. A
-- link row: drive_id + label (the name the admin typed) — kind 'drive' (a
-- Google Drive file) or, D80 (2026-11-07), 'gsheet' / 'gdoc' / 'gslides' (a
-- Google Sheets / Docs / Slides file the teachers get as .xlsx / .docx /
-- .pptx through Google's export address; the ID has the Drive shape). Never
-- both.
create table if not exists public.board_attachments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.board_posts (id) on delete cascade,
  position     integer not null,
  kind         text not null,
  storage_path text unique,
  file_name    text,
  file_type    text,
  file_size    bigint,
  drive_id     text,
  label        text,
  created_at   timestamptz not null default now(),
  constraint board_attachments_kind_ok check (kind in ('file', 'drive', 'gsheet', 'gdoc', 'gslides')),
  constraint board_attachments_source_ok check (
    (kind = 'file' and storage_path is not null and file_name is not null and file_type is not null
       and file_size is not null and drive_id is null and label is null)
    or (kind in ('drive', 'gsheet', 'gdoc', 'gslides') and drive_id is not null and label is not null
       and storage_path is null and file_name is null and file_type is null and file_size is null)),
  constraint board_attachments_path_ok check (
    storage_path ~ ('^' || post_id::text
                    || '/[0-9]{13}-[a-z0-9]{6}\.(pdf|xlsx|xls|hwp|hwpx|pptx|ppt|jpg|jpeg|png)$')),
  constraint board_attachments_type_ok check (
    file_type in ('application/pdf',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'application/vnd.ms-excel',
                  'application/x-hwp',
                  'application/vnd.hancom.hwpx',
                  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                  'application/vnd.ms-powerpoint',
                  'image/jpeg',
                  'image/png')),
  constraint board_attachments_size_ok check (file_size between 1 and 10485760),
  constraint board_attachments_name_ok check (length(file_name) between 1 and 200),
  constraint board_attachments_label_ok check (label = btrim(label) and length(label) between 1 and 100),
  constraint board_attachments_drive_ok check (drive_id ~ '^[A-Za-z0-9_-]{25,64}$')
);
create index if not exists board_attachments_post_idx
  on public.board_attachments (post_id, position);
-- D80 on a table made before (`create table if not exists` leaves it as it
-- is): the two kind rules again. Drop + add in ONE statement (atomic with any
-- tool) = the same definition on every run; existing rows (file / drive)
-- pass.
alter table public.board_attachments
  drop constraint if exists board_attachments_kind_ok,
  add constraint board_attachments_kind_ok check (kind in ('file', 'drive', 'gsheet', 'gdoc', 'gslides')),
  drop constraint if exists board_attachments_source_ok,
  add constraint board_attachments_source_ok check (
    (kind = 'file' and storage_path is not null and file_name is not null and file_type is not null
       and file_size is not null and drive_id is null and label is null)
    or (kind in ('drive', 'gsheet', 'gdoc', 'gslides') and drive_id is not null and label is not null
       and storage_path is null and file_name is null and file_type is null and file_size is null));

-- Views (B11): one row per member, post and KST day — a post's view_count
-- goes up once a day per branch / teacher account; the admin never counts.
-- Rows older than 30 days go when a new one is written.
create table if not exists public.board_post_views (
  post_id   uuid not null references public.board_posts (id) on delete cascade,
  member_id uuid not null references public.members (member_id) on delete cascade,
  view_day  date not null,
  primary key (post_id, member_id, view_day)
);
create index if not exists board_post_views_day_idx
  on public.board_post_views (view_day);

-- RLS on with NO policies, no grants: RPCs only.
alter table public.board_categories  enable row level security;
alter table public.board_posts       enable row level security;
alter table public.board_attachments enable row level security;
alter table public.board_post_views  enable row level security;
revoke all on public.board_categories, public.board_posts, public.board_attachments,
              public.board_post_views from anon, authenticated;
revoke all on sequence public.board_categories_id_seq from anon, authenticated;

-- Internal: who is asking — 'admin' | 'member' (role 1 / 2, board on) |
-- 'off' (role 1 / 2, board off) | 'denied' (anyone else).
create or replace function public.board_access()
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case
           when public.is_admin() then 'admin'
           when not exists (select 1 from public.lms_member() m where m.role in (1, 2)) then 'denied'
           when not public.site_flag('resource_board_enabled', false) then 'off'
           else 'member'
         end;
$$;

-- Internal: NEW = posted within the last 7 KST calendar days (today = 0).
create or replace function public.board_is_new(p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select (now() at time zone 'Asia/Seoul')::date - (p_at at time zone 'Asia/Seoul')::date < 7;
$$;

-- Internal: the teachers' list order (B9) — public posts; a level chip =
-- that level + common (an unknown level = no filter); a category; words in
-- the title or body (any case; % and _ are plain letters); pinned first,
-- then newest (or most viewed, p_sort 'views'). rn = the row's place, so a
-- post's neighbours are rn - 1 / rn + 1 (B10).
create or replace function public.board_ranked(
  p_level text, p_category bigint, p_q text, p_sort text
)
returns table (id uuid, rn bigint)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with f as (
    select case when p_level in ('beginner', 'level-1', 'level-2', 'level-3') then p_level end as lv,
           replace(replace(replace(nullif(btrim(left(coalesce(p_q, ''), 100)), ''),
                                   '\', '\\'), '%', '\%'), '_', '\_') as q
  )
  select p.id,
         row_number() over (
           order by p.pinned desc,
                    case when p_sort = 'views' then p.view_count end desc nulls last,
                    p.created_at desc, p.id desc)
    from public.board_posts p, f
   where p.published
     and (f.lv is null or p.level in (f.lv, 'common'))
     and (p_category is null or p.category_id = p_category)
     and (f.q is null or p.title ilike '%' || f.q || '%' or p.body ilike '%' || f.q || '%');
$$;

-- Internal: the categories in order, for the chips / the settings box.
create or replace function public.board_category_json(p_counts boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color)
           || case when p_counts
                   then jsonb_build_object('posts', (select count(*) from public.board_posts p
                                                      where p.category_id = c.id))
                   else '{}'::jsonb end
           order by c.position, c.id), '[]'::jsonb)
    from public.board_categories c;
$$;

-- The teachers' list (B9): 10 a page. {"status":"ok", total, page, pages,
-- page_size, items: [{id, title, level, category, pinned, files, views,
-- created_at, is_new}], categories} — or {"status":"off"} / {"status":"denied"}
-- with no posts at all. A page past the end = the last page.
create or replace function public.board_list(
  p_level text default null, p_category bigint default null, p_q text default null,
  p_sort text default 'new', p_page integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_access text := public.board_access();
  v_size   constant integer := 10;
  v_total  integer;
  v_pages  integer;
  v_page   integer;
  v_items  jsonb;
begin
  if v_access in ('denied', 'off') then
    return jsonb_build_object('status', v_access);
  end if;
  select count(*) into v_total from public.board_ranked(p_level, p_category, p_q, p_sort);
  v_pages := greatest(1, ceil(v_total / v_size::numeric)::integer);
  v_page := least(greatest(coalesce(p_page, 1), 1), v_pages);
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'title', p.title, 'level', p.level, 'category', p.category_id,
           'pinned', p.pinned,
           'files', (select count(*) from public.board_attachments a where a.post_id = p.id),
           'views', p.view_count, 'created_at', p.created_at,
           'is_new', public.board_is_new(p.created_at))
           order by r.rn), '[]'::jsonb)
    into v_items
    from public.board_ranked(p_level, p_category, p_q, p_sort) r
    join public.board_posts p on p.id = r.id
   where r.rn > (v_page - 1) * v_size and r.rn <= v_page * v_size;
  return jsonb_build_object('status', 'ok', 'total', v_total, 'page', v_page,
                            'pages', v_pages, 'page_size', v_size, 'items', v_items,
                            'categories', public.board_category_json(false));
end;
$$;

-- A post for a teacher (B10): the post, its category, its attachments in
-- order ({id, kind, name, ext, size, drive_id} — never a path) and its
-- neighbours in the list it was opened from (the same filters and sort).
-- Counts the view (B11). Hidden / unknown → {"status":"missing"}; the admin
-- may open a hidden post (보기) and is never counted.
create or replace function public.board_post_get(
  p_id uuid, p_level text default null, p_category bigint default null,
  p_q text default null, p_sort text default 'new'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_access text := public.board_access();
  v_post   public.board_posts;
  v_member uuid;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_prev   jsonb;
  v_next   jsonb;
begin
  if v_access in ('denied', 'off') then
    return jsonb_build_object('status', v_access);
  end if;
  select * into v_post from public.board_posts p
   where p.id = p_id and (p.published or v_access = 'admin');
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if v_access = 'member' then
    select m.member_id into v_member from public.lms_member() m limit 1;
    insert into public.board_post_views (post_id, member_id, view_day)
    values (p_id, v_member, v_today)
    on conflict do nothing;
    if found then
      update public.board_posts p set view_count = p.view_count + 1
       where p.id = p_id
      returning * into v_post;
      delete from public.board_post_views v where v.view_day < v_today - 30;
    end if;
  end if;
  -- One pass over the list it was opened from (security review L4).
  select (select jsonb_build_object('id', p.id, 'title', p.title, 'created_at', p.created_at)
            from public.board_posts p where p.id = x.prev_id),
         (select jsonb_build_object('id', p.id, 'title', p.title, 'created_at', p.created_at)
            from public.board_posts p where p.id = x.next_id)
    into v_prev, v_next
    from (select r.id,
                 lag(r.id) over (order by r.rn) as prev_id,
                 lead(r.id) over (order by r.rn) as next_id
            from public.board_ranked(p_level, p_category, p_q, p_sort) r) x
   where x.id = p_id;
  return jsonb_build_object(
    'status', 'ok',
    'post', jsonb_build_object(
      'id', v_post.id, 'title', v_post.title, 'body', v_post.body, 'level', v_post.level,
      'category', v_post.category_id, 'pinned', v_post.pinned, 'published', v_post.published,
      'files', (select count(*) from public.board_attachments a where a.post_id = p_id),
      'views', v_post.view_count, 'created_at', v_post.created_at,
      'is_new', public.board_is_new(v_post.created_at)),
    'category', (select jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color)
                   from public.board_categories c where c.id = v_post.category_id),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'kind', a.kind, 'name', coalesce(a.label, a.file_name),
               'ext', substring(a.storage_path from '\.([a-z0-9]+)$'),
               'size', a.file_size, 'drive_id', a.drive_id)
               order by a.position, a.id)
        from public.board_attachments a where a.post_id = p_id), '[]'::jsonb),
    'prev', v_prev,
    'next', v_next);
end;
$$;

-- Admin list (그림 05): every post (hidden too), 20 a page, pinned first then
-- newest. Exact level (common is its own choice), category, status
-- ('public' | 'hidden'), words in the title. Categories with post counts.
create or replace function public.board_admin_list(
  p_level text default null, p_category bigint default null, p_status text default null,
  p_q text default null, p_page integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_size  constant integer := 20;
  v_q     text := replace(replace(replace(nullif(btrim(left(coalesce(p_q, ''), 100)), ''),
                                          '\', '\\'), '%', '\%'), '_', '\_');
  v_total integer;
  v_pages integer;
  v_page  integer;
  v_items jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select count(*) into v_total
    from public.board_posts p
   where (nullif(p_level, '') is null or p.level = p_level)
     and (p_category is null or p.category_id = p_category)
     and (coalesce(p_status, '') not in ('public', 'hidden') or p.published = (p_status = 'public'))
     and (v_q is null or p.title ilike '%' || v_q || '%');
  v_pages := greatest(1, ceil(v_total / v_size::numeric)::integer);
  v_page := least(greatest(coalesce(p_page, 1), 1), v_pages);
  with r as (
    select p.*, row_number() over (order by p.pinned desc, p.created_at desc, p.id desc) as rn
      from public.board_posts p
     where (nullif(p_level, '') is null or p.level = p_level)
       and (p_category is null or p.category_id = p_category)
       and (coalesce(p_status, '') not in ('public', 'hidden') or p.published = (p_status = 'public'))
       and (v_q is null or p.title ilike '%' || v_q || '%')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'title', r.title, 'level', r.level, 'category', r.category_id,
           'pinned', r.pinned, 'published', r.published,
           'files', (select count(*) from public.board_attachments a where a.post_id = r.id),
           'views', r.view_count, 'created_at', r.created_at)
           order by r.rn), '[]'::jsonb)
    into v_items
    from r
   where r.rn > (v_page - 1) * v_size and r.rn <= v_page * v_size;
  return jsonb_build_object('status', 'ok', 'total', v_total, 'page', v_page,
                            'pages', v_pages, 'page_size', v_size, 'items', v_items,
                            'categories', public.board_category_json(true));
end;
$$;

-- Admin: one post to edit — attachments with their ids (no path; the page
-- deletes only what it uploaded itself or what a save / delete returns).
create or replace function public.board_admin_get(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_post public.board_posts;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_post from public.board_posts p where p.id = p_id;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'post', jsonb_build_object(
      'id', v_post.id, 'title', v_post.title, 'body', v_post.body, 'level', v_post.level,
      'category', v_post.category_id, 'pinned', v_post.pinned, 'published', v_post.published,
      'views', v_post.view_count, 'created_at', v_post.created_at,
      'updated_at', v_post.updated_at),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'kind', a.kind, 'name', coalesce(a.label, a.file_name),
               'ext', substring(a.storage_path from '\.([a-z0-9]+)$'),
               'size', a.file_size, 'type', a.file_type, 'drive_id', a.drive_id)
               order by a.position, a.id)
        from public.board_attachments a where a.post_id = p_id), '[]'::jsonb));
end;
$$;

-- Admin: create or update a post with its whole attachment list, in order
-- (B4, B6, B7). p_attachments = up to 50 (D79, 2026-11-07 — was 20) of
--   {"id": <an attachment of this post>}               keep (a link: may add "label")
--   {"kind":"file","path","name","size","type"}        a file just uploaded
--   {"kind":"drive","drive_id","label"}                a Google Drive file
--   {"kind":"gsheet"|"gdoc"|"gslides","drive_id","label"}  a Google Sheets /
--                                                      Docs / Slides file (D80)
-- An attachment of the post that is not in the list is deleted (B8). Answers
-- {"status":"ok","id","removed":[Storage paths the page deletes next]}.
-- Bad input raises 22023 ("board: …") and changes nothing. A file already
-- attached comes back as {"id"} only — sent again as a new file it is
-- refused (its object would be deleted under the new row; review L1).
-- public / pinned left out (NULL) = hidden / not pinned (review L3).
create or replace function public.board_post_save(
  p_id uuid, p_title text, p_body text, p_level text, p_category bigint,
  p_published boolean, p_pinned boolean, p_attachments jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_title   text := btrim(coalesce(p_title, ''));
  v_body    text := coalesce(p_body, '');
  v_list    jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_item    jsonb;
  v_pos     integer := 0;
  v_keep    uuid[] := '{}';
  v_new     text[] := '{}';
  v_id      uuid;
  v_removed jsonb;
  v_path    text;
  v_name    text;
  v_type    text;
  v_size    bigint;
  v_label   text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'board: post id' using errcode = '22023';
  end if;
  if length(v_title) not between 1 and 100 then
    raise exception 'board: title (1-100 characters)' using errcode = '22023';
  end if;
  if length(v_body) > 5000 then
    raise exception 'board: body (5000 characters at most)' using errcode = '22023';
  end if;
  if p_level is null or p_level not in ('common', 'beginner', 'level-1', 'level-2', 'level-3') then
    raise exception 'board: level' using errcode = '22023';
  end if;
  -- A category delete waits for this save (and the other way round), taken
  -- BEFORE the category is checked: no foreign-key error between two admin
  -- tabs (security review L8 / N1).
  perform pg_advisory_xact_lock_shared(7305);
  if p_category is null or not exists (select 1 from public.board_categories c where c.id = p_category) then
    raise exception 'board: category' using errcode = '22023';
  end if;
  if jsonb_typeof(v_list) <> 'array' then
    raise exception 'board: attachments must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(v_list) > 50 then
    raise exception 'board: too many attachments (50 at most)' using errcode = '22023';
  end if;

  perform 1 from public.board_posts p where p.id = p_id for update;
  if found then
    update public.board_posts p
       set title = v_title, body = v_body, level = p_level, category_id = p_category,
           published = coalesce(p_published, false), pinned = coalesce(p_pinned, false),
           updated_at = now()
     where p.id = p_id;
  else
    insert into public.board_posts (id, title, body, level, category_id, published, pinned)
    values (p_id, v_title, v_body, p_level, p_category,
            coalesce(p_published, false), coalesce(p_pinned, false));
  end if;

  -- The attachments kept: each one of this post, once.
  for v_item in select e.value from jsonb_array_elements(v_list) e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'board: attachment (not an object)' using errcode = '22023';
    end if;
    if v_item ? 'id' then
      begin
        v_id := (v_item ->> 'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'board: attachment id' using errcode = '22023';
      end;
      if v_id is null or v_id = any (v_keep)
         or not exists (select 1 from public.board_attachments a
                         where a.id = v_id and a.post_id = p_id) then
        raise exception 'board: attachment % (not this post''s, or twice)', v_id using errcode = '22023';
      end if;
      v_keep := v_keep || v_id;
    elsif v_item ->> 'kind' = 'file' then
      if v_item ->> 'path' = any (v_new)
         or exists (select 1 from public.board_attachments a
                     where a.post_id = p_id and a.storage_path = v_item ->> 'path') then
        raise exception 'board: attachment % is already attached (send its id)', v_item ->> 'path'
          using errcode = '22023';
      end if;
      v_new := v_new || (v_item ->> 'path');
    end if;
  end loop;

  with gone as (
    delete from public.board_attachments a
     where a.post_id = p_id and a.id <> all (v_keep)
    returning a.storage_path
  )
  select coalesce(jsonb_agg(g.storage_path order by g.storage_path)
                    filter (where g.storage_path is not null), '[]'::jsonb)
    into v_removed
    from gone g;

  for v_item in select e.value from jsonb_array_elements(v_list) e loop
    v_pos := v_pos + 1;
    if v_item ? 'id' then
      v_label := null;
      if v_item ? 'label' then
        v_label := btrim(coalesce(v_item ->> 'label', ''));
        if length(v_label) not between 1 and 100 then
          raise exception 'board: attachment name (1-100 characters)' using errcode = '22023';
        end if;
      end if;
      update public.board_attachments a
         set position = v_pos,
             label = case when a.kind in ('drive', 'gsheet', 'gdoc', 'gslides') and v_label is not null
                          then v_label else a.label end
       where a.id = (v_item ->> 'id')::uuid;
    elsif v_item ->> 'kind' = 'file' then
      if v_item ?| array['drive_id', 'label'] then
        raise exception 'board: attachment (a file has no Drive link)' using errcode = '22023';
      end if;
      v_path := v_item ->> 'path';
      v_name := btrim(coalesce(v_item ->> 'name', ''));
      v_type := v_item ->> 'type';
      begin
        v_size := (v_item ->> 'size')::bigint;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'board: attachment size' using errcode = '22023';
      end;
      if v_path is null or v_path !~ ('^' || p_id::text
           || '/[0-9]{13}-[a-z0-9]{6}\.(pdf|xlsx|xls|hwp|hwpx|pptx|ppt|jpg|jpeg|png)$') then
        raise exception 'board: attachment path' using errcode = '22023';
      end if;
      if v_type is distinct from (
           case substring(v_path from '\.([a-z0-9]+)$')
             when 'pdf' then 'application/pdf'
             when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
             when 'xls' then 'application/vnd.ms-excel'
             when 'hwp' then 'application/x-hwp'
             when 'hwpx' then 'application/vnd.hancom.hwpx'
             when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
             when 'ppt' then 'application/vnd.ms-powerpoint'
             when 'jpg' then 'image/jpeg'
             when 'jpeg' then 'image/jpeg'
             when 'png' then 'image/png'
           end) then
        raise exception 'board: attachment type' using errcode = '22023';
      end if;
      if v_size is null or v_size not between 1 and 10485760 then
        raise exception 'board: attachment size (10 MB at most)' using errcode = '22023';
      end if;
      if length(v_name) not between 1 and 200 then
        raise exception 'board: attachment name (1-200 characters)' using errcode = '22023';
      end if;
      if not exists (select 1 from storage.objects o
                      where o.bucket_id = 'resource-board' and o.name = v_path) then
        raise exception 'board: % is not in storage', v_path using errcode = '22023';
      end if;
      insert into public.board_attachments
        (post_id, position, kind, storage_path, file_name, file_type, file_size)
      values (p_id, v_pos, 'file', v_path, v_name, v_type, v_size);
    elsif v_item ->> 'kind' in ('drive', 'gsheet', 'gdoc', 'gslides') then
      if v_item ?| array['path', 'name', 'size', 'type'] then
        raise exception 'board: attachment (a Drive link has no file)' using errcode = '22023';
      end if;
      if coalesce(v_item ->> 'drive_id', '') !~ '^[A-Za-z0-9_-]{25,64}$' then
        raise exception 'board: not a Google Drive file id' using errcode = '22023';
      end if;
      v_label := btrim(coalesce(v_item ->> 'label', ''));
      if length(v_label) not between 1 and 100 then
        raise exception 'board: attachment name (1-100 characters)' using errcode = '22023';
      end if;
      insert into public.board_attachments (post_id, position, kind, drive_id, label)
      values (p_id, v_pos, v_item ->> 'kind', v_item ->> 'drive_id', v_label);
    else
      raise exception 'board: attachment kind' using errcode = '22023';
    end if;
  end loop;

  return jsonb_build_object('status', 'ok', 'id', p_id, 'removed', v_removed);
end;
$$;

-- Admin: delete a post (B8) — its attachments and view rows go with it; the
-- answer lists its files' Storage paths for the page to delete.
create or replace function public.board_post_delete(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_removed jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform 1 from public.board_posts p where p.id = p_id for update;
  if not found then
    return jsonb_build_object('status', 'missing', 'removed', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(a.storage_path order by a.position)
                    filter (where a.storage_path is not null), '[]'::jsonb)
    into v_removed
    from public.board_attachments a where a.post_id = p_id;
  delete from public.board_posts p where p.id = p_id;
  return jsonb_build_object('status', 'ok', 'removed', v_removed);
end;
$$;

-- Admin categories (B5). Category writes take advisory lock 7305 (positions,
-- colors and names stay consistent between two admin tabs).
-- Add (p_id null: at the end, the first color not in use) or rename.
-- {"status":"ok","id"} | {"status":"duplicate"} (same name, any case) |
-- {"status":"missing"}; a bad name raises 22023.
create or replace function public.board_category_save(p_id bigint, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_name    text := btrim(coalesce(p_name, ''));
  v_palette constant text[] := array['sky', 'indigo', 'yellow', 'red', 'green', 'purple',
                                     'orange', 'teal', 'pink', 'gray'];
  v_id      bigint;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 20 then
    raise exception 'board: category name (1-20 characters)' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(7305);
  if exists (select 1 from public.board_categories c
              where lower(c.name) = lower(v_name) and c.id is distinct from p_id) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  if p_id is null then
    insert into public.board_categories (name, position, color)
    values (v_name,
            coalesce((select max(c.position) from public.board_categories c), 0) + 1,
            coalesce((select x.color from unnest(v_palette) with ordinality x (color, o)
                       where x.color not in (select c.color from public.board_categories c)
                       order by x.o limit 1),
                     v_palette[(select count(*) from public.board_categories c) % 10 + 1]))
    returning board_categories.id into v_id;
    return jsonb_build_object('status', 'ok', 'id', v_id);
  end if;
  update public.board_categories c set name = v_name where c.id = p_id;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  return jsonb_build_object('status', 'ok', 'id', p_id);
end;
$$;

-- Admin: the new order — every category id exactly once.
create or replace function public.board_category_order(p_ids bigint[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(7305);
  if p_ids is null
     or cardinality(p_ids) <> (select count(*) from public.board_categories)
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids)
     or exists (select 1 from unnest(p_ids) x
                 where not exists (select 1 from public.board_categories c where c.id = x)) then
    raise exception 'board: category order (every category once)' using errcode = '22023';
  end if;
  update public.board_categories c set position = o.ord
    from unnest(p_ids) with ordinality o (id, ord)
   where c.id = o.id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Admin: delete an empty category. {"status":"ok"|"in_use"|"missing","posts"}.
create or replace function public.board_category_delete(p_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_posts integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(7305);
  if not exists (select 1 from public.board_categories c where c.id = p_id) then
    return jsonb_build_object('status', 'missing', 'posts', 0);
  end if;
  select count(*) into v_posts from public.board_posts p where p.category_id = p_id;
  if v_posts > 0 then
    return jsonb_build_object('status', 'in_use', 'posts', v_posts);
  end if;
  delete from public.board_categories c where c.id = p_id;
  return jsonb_build_object('status', 'ok', 'posts', 0);
end;
$$;

-- The Edge Function's board call (service role only), next to
-- teacher_resource_issue. Who: the forwarded x-lms-token (role 1 / 2, board
-- on) or p_admin_uid (an admin the function checked with Auth). What: a FILE
-- attachment of a public post (the admin: any post). The daily limit is the
-- teacher-resources one — the same log, the same lock, 1,000 in all per KST day (D82)
-- (rows: level 'board', slot = the attachment id). Answers like
-- teacher_resource_issue: ok {path, name} | denied | off | empty | limit.
create or replace function public.board_attachment_issue(
  p_attachment_id uuid, p_admin_uid uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_admin     boolean := p_admin_uid is not null
                         and exists (select 1 from public.admins a where a.user_id = p_admin_uid);
  v_member    uuid;
  v_role      smallint;
  v_path      text;
  v_name      text;
  v_published boolean;
  v_today     timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul')
                             at time zone 'Asia/Seoul';
begin
  if not v_admin then
    select m.member_id, m.role into v_member, v_role
      from public.lms_member() m
     limit 1;
    if v_member is null or not coalesce(v_role in (1, 2), false) then
      return jsonb_build_object('status', 'denied');
    end if;
    if not public.site_flag('resource_board_enabled', false) then
      return jsonb_build_object('status', 'off');
    end if;
  end if;

  select a.storage_path, a.file_name, p.published into v_path, v_name, v_published
    from public.board_attachments a
    join public.board_posts p on p.id = a.post_id
   where a.id = p_attachment_id;
  if v_path is null or not (v_admin or v_published) then
    return jsonb_build_object('status', 'empty');
  end if;
  -- An object that is gone from Storage cannot be signed: "empty", and it
  -- costs no download (review L2).
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'resource-board' and o.name = v_path) then
    return jsonb_build_object('status', 'empty');
  end if;

  if not v_admin then
    delete from public.teacher_resource_downloads
     where issued_at < now() - interval '30 days';
    perform pg_advisory_xact_lock(7302, hashtext(v_member::text));
    if (select count(*) from public.teacher_resource_downloads d
         where d.member_id = v_member and d.issued_at >= v_today) >= 1000 then
      return jsonb_build_object('status', 'limit');
    end if;
    insert into public.teacher_resource_downloads (member_id, level, slot)
    values (v_member, 'board', p_attachment_id::text);
  end if;

  return jsonb_build_object('status', 'ok', 'path', v_path, 'name', v_name);
end;
$$;

-- Storage: the admin writes (only well-formed ASCII paths) and reads; no
-- read policy for anyone else (the Edge Function signs with the service role).
drop policy if exists resource_board_admin_all on storage.objects;
create policy resource_board_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'resource-board' and public.is_admin())
  with check (
    bucket_id = 'resource-board'
    and public.is_admin()
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{13}-[a-z0-9]{6}\.(pdf|xlsx|xls|hwp|hwpx|pptx|ppt|jpg|jpeg|png)$');

-- Grants: helpers internal; the two reading RPCs public (they answer nothing
-- to the wrong caller); admin RPCs for signed-in users (is_admin inside);
-- the download call for the Edge Function (service role) only.
revoke execute on function public.board_access() from public, anon, authenticated;
revoke execute on function public.board_is_new(timestamptz) from public, anon, authenticated;
revoke execute on function public.board_ranked(text, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.board_category_json(boolean) from public, anon, authenticated;
revoke execute on function public.board_list(text, bigint, text, text, integer) from public;
revoke execute on function public.board_post_get(uuid, text, bigint, text, text) from public;
grant execute on function public.board_list(text, bigint, text, text, integer) to anon, authenticated;
grant execute on function public.board_post_get(uuid, text, bigint, text, text) to anon, authenticated;
revoke execute on function public.board_admin_list(text, bigint, text, text, integer) from public, anon;
revoke execute on function public.board_admin_get(uuid) from public, anon;
revoke execute on function public.board_post_save(uuid, text, text, text, bigint, boolean, boolean, jsonb) from public, anon;
revoke execute on function public.board_post_delete(uuid) from public, anon;
revoke execute on function public.board_category_save(bigint, text) from public, anon;
revoke execute on function public.board_category_order(bigint[]) from public, anon;
revoke execute on function public.board_category_delete(bigint) from public, anon;
grant execute on function public.board_admin_list(text, bigint, text, text, integer) to authenticated;
grant execute on function public.board_admin_get(uuid) to authenticated;
grant execute on function public.board_post_save(uuid, text, text, text, bigint, boolean, boolean, jsonb) to authenticated;
grant execute on function public.board_post_delete(uuid) to authenticated;
grant execute on function public.board_category_save(bigint, text) to authenticated;
grant execute on function public.board_category_order(bigint[]) to authenticated;
grant execute on function public.board_category_delete(bigint) to authenticated;
revoke execute on function public.board_attachment_issue(uuid, uuid) from public, anon, authenticated;
grant execute on function public.board_attachment_issue(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
-- ==== end Resource board ====

-- ============================================================================
-- AFTER running the above: register your first admin.
-- 1) Dashboard → Authentication → Users → Add user (email + password).
-- 2) Run, replacing the email with the one you just created:
--
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'YOUR_ADMIN_EMAIL@example.com'
--    on conflict do nothing;
-- ============================================================================
