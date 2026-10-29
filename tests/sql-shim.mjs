// What a Supabase project has before migration.sql runs — shared by the PGlite
// SQL specs (lms-sql, levels-sql). Not a spec file itself.
export const SUPABASE_SHIM = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create schema extensions;
  create extension pgcrypto with schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  create schema storage;
  create table storage.objects (bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, extensions, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  set search_path = "$user", public, extensions;
`;

// The SQL Editor shows the last result that has rows; do the same.
export function lastRows(results) {
  return [...results].reverse().find((r) => r.rows.length)?.rows ?? [];
}
