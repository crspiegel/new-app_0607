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
-- ============================================================================

-- pgcrypto → crypt() + gen_salt('bf') for bcrypt password hashing.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per (level, month) page.
--   videos: { "<slotKey>": "<vimeo url or id>" }   slotKey = opening | ending | w1-Mon .. w4-Fri
--   covers: { "book-1": "<public url>", "book-2": "<public url>" }
create table if not exists public.content_pages (
  level      text not null,
  month      text not null,
  videos     jsonb not null default '{}'::jsonb,
  covers     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (level, month)
);

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

-- ============================================================================
-- AFTER running the above: register your first admin.
-- 1) Dashboard → Authentication → Users → Add user (email + password).
-- 2) Run, replacing the email with the one you just created:
--
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'YOUR_ADMIN_EMAIL@example.com'
--    on conflict do nothing;
-- ============================================================================
