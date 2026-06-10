# Supabase Setup — one-time provisioning for Phase 2 & 3

This is the **only manual part**. Do these steps once; then hand me the project
URL + anon key and I'll wire the code (admin page, login, permissions).

Everything here uses the **free tier**. The accounts to use are your own — this
is separate from the GitHub/Vercel `crspiegel` accounts.

> **Why this is needed:** admin edits must reach _all_ users on _all_ devices,
> logins must be real, and uploaded covers must persist — none of which a
> browser-only static site can do. Supabase adds Auth + database + file storage
> while we keep the current static SPA (no Next.js, no build step).

---

## Step 1 — Create the project

1. Go to <https://supabase.com> → sign in → **New project**.
2. Name it (e.g. `reading-adventures`), pick a region near your users
   (e.g. Northeast Asia / Seoul), set a **database password** (save it
   somewhere — you won't need it for the app, but Supabase requires one).
3. Wait ~2 minutes for it to provision.

## Step 2 — Copy the two public keys

1. **Project Settings** (gear icon) → **API**.
2. Copy these two values — you'll paste them in Step 6:
   - **Project URL** — looks like `https://abcdxyz.supabase.co`
   - **anon public** key — a long `eyJ...` string.

> ⚠️ **Only ever use the `anon` key in the website.** There is also a
> `service_role` key on that page — **never** put it in the frontend or commit
> it; it bypasses all security. The `anon` key is safe to ship (the database
> rules protect everything).

## Step 3 — Create the database schema

1. Left sidebar → **SQL Editor** → **New query**.
2. Open the file **`supabase/migration.sql`** in this repo, copy its **entire**
   contents, paste into the editor, and click **Run**.
3. You should see "Success. No rows returned." This creates the tables, the
   security rules, and the login/member functions.

## Step 4 — Create the `covers` storage bucket

1. Left sidebar → **Storage** → **New bucket**.
2. Name it exactly **`covers`** and turn **Public bucket ON** → **Save**.
   (The SQL in Step 3 already added the read/write rules for this bucket.)

## Step 5 — Create your first admin account

1. Left sidebar → **Authentication** → **Users** → **Add user** →
   **Create new user**. Enter an **email** and **password** for yourself (the
   admin). Tip: turn on "Auto Confirm User" so you can log in immediately.
2. Go back to **SQL Editor** → **New query**, paste the following (replace the
   email with the one you just used), and **Run**:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'YOUR_ADMIN_EMAIL@example.com'
   on conflict do nothing;
   ```

That email + password is your **admin login** for the admin page (Phase 3).
Member accounts (grades 1–3) are created later from the admin page itself —
not here.

## Step 6 — Create `supabase-config.js`

In the project root, create a file named **`supabase-config.js`** with your two
values from Step 2:

```js
// Public Supabase config. The anon key is safe to expose — the database's
// row-level security is what protects writes. NEVER put the service_role key here.
window.SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOi...YOUR-ANON-KEY";
```

(If you'd rather not handle the file, just paste the two values to me in chat
and I'll create it.)

---

## Then hand back to me

Once Steps 1–6 are done (or you've given me the URL + anon key), tell me and
I'll build **Phase 2**: load the Supabase client, hydrate the content from the
database, and build the gray-mirror admin page (URL editing + cover drag-drop),
followed by **Phase 3** (login, the 3 grades, member management, hidden signup).

### What I will handle in code (you don't need to)

- Add the Supabase client `<script>` (CDN) before `app.js`.
- Point `getVideoUrl` / `getCover` at the database.
- Build `#adminScreen`, the admin button, save/upload logic.
- Keep `supabase-config.js` out of the public-ignore list so it ships, and add
  this guide + `supabase/migration.sql` to `.vercelignore` (already done).

## Quick reference — what the schema contains

| Object                                         | Purpose                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `content_pages(level, month, videos, covers)`  | Per-page video URLs + cover image URLs (40 rows max).      |
| `members(id, password_hash, grade, active, …)` | Grade 1–3 accounts; bcrypt-hashed; login via RPC only.     |
| `admins(user_id → auth.users)`                 | Which Auth users are admins (full write access).           |
| `site_settings(key, value)`                    | Global flags, e.g. `signup_visible`.                       |
| `verify_member_login(id, pw)` → grade          | Server-side login check; hash never leaves the DB.         |
| `create_member` / `set_member_active`          | Admin-only member management (enforces the ≥4 ASCII rule). |
| `covers` storage bucket                        | Uploaded book-cover images (public read, admin write).     |

**Account rule enforced both client- and server-side:** ID & password each
**≥4 characters, printable ASCII only** (letters/digits/symbols, case-sensitive,
**no Korean, no spaces**).
