import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { SUPABASE_SHIM } from "./sql-shim.mjs";

// Two connections at the same moment — what PGlite (one connection) cannot do.
// A throwaway local PostgreSQL (embedded-postgres) in a temp folder on a free
// 127.0.0.1 port; never the live project. The package is NOT in package.json
// (D61: Vercel installs that list on every deploy — a beta package with an
// install script must not be able to break a deploy), so without it these
// tests are skipped with the line below; install it for one run (NOTES).
// Fresh install of
// supabase/migration.sql, then:
//   N4 — two bulk assigns naming the same students in opposite orders: both
//        finish (no deadlock, error 40P01, for either of them);
//   N5 — two branches made at the same moment with the same code / name: the
//        second gets status duplicate (no error 23505).
// Passwords here are fake; tokens are kept in memory and never printed.

const read = (file) => readFileSync(path.resolve(file), "utf8");
const ADMIN_UID = "00000000-0000-4000-8000-0000000000ad";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const INSTALL_HINT =
  "embedded-postgres 없음 — 한 번만 설치: npm i --no-save embedded-postgres@18.6.0-beta.19";

// The package, when it is installed (D61: never a dependency of the site).
async function loadEmbeddedPostgres() {
  try {
    return (await import("embedded-postgres")).default;
  } catch {
    return null;
  }
}

let EmbeddedPostgres = null;
let pg = null;
let dir = null;
const clients = [];

async function connect() {
  const client = pg.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  clients.push(client);
  return client;
}

// Become a caller for the rest of this connection's session (as PostgREST
// does per request): the admin through its JWT, an LMS member through its token.
async function become(client, who) {
  await client.query("reset role");
  if (who.jwt) {
    await client.query(
      `select set_config('request.jwt.claims', $1, false),
              set_config('request.headers', '{}', false)`,
      [JSON.stringify({ sub: who.jwt, role: "authenticated" })],
    );
    await client.query("set role authenticated");
  } else {
    await client.query(
      `select set_config('request.headers', $1, false),
              set_config('request.jwt.claims', '', false)`,
      [JSON.stringify({ "x-lms-token": who.token })],
    );
    await client.query("set role anon");
  }
}

async function signIn(client, id, password) {
  await client.query("reset role");
  await client.query(
    `select set_config('request.headers', '{}', false),
            set_config('request.jwt.claims', '', false)`,
  );
  await client.query("set role anon");
  const { rows } = await client.query("select public.lms_login($1, $2) as j", [
    id,
    password,
  ]);
  await client.query("reset role");
  expect(rows[0].j.status, `sign-in ${id}`).toBe("ok");
  return { token: rows[0].j.token };
}

async function classesOf(owner, id) {
  const { rows } = await owner.query(
    `select coalesce(string_agg(k.name, ',' order by k.name), '-') as names
       from public.class_members cm
       join public.classes k on k.id = cm.class_id
       join public.members m on m.member_id = cm.member_id
      where m.id = $1`,
    [id],
  );
  return rows[0].names;
}

test.describe("lms 3b sql: two connections at once (local PostgreSQL)", () => {
  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "desktop") return;
    EmbeddedPostgres = await loadEmbeddedPostgres();
    if (!EmbeddedPostgres) return; // the tests skip themselves (INSTALL_HINT)
    test.setTimeout(180000);
    dir = mkdtempSync(path.join(os.tmpdir(), "lms-pg-"));
    pg = new EmbeddedPostgres({
      databaseDir: path.join(dir, "data"),
      user: "postgres",
      password: "local-test-only",
      port: await freePort(),
      persistent: false,
      // no separate I/O helper processes (PostgreSQL 18's io_method=worker):
      // on Windows they outlived stop() and locked node_modules (npm ci EPERM)
      postgresFlags: ["-c", "io_method=sync"],
      onLog: () => {},
    });
    await pg.initialise();
    await pg.start();
    const owner = await connect();
    await owner.query(SUPABASE_SHIM);
    await owner.query(read("supabase/migration.sql"));
    await owner.query(`
      insert into auth.users (id, email) values ('${ADMIN_UID}', 'admin@example.test');
      insert into public.admins (user_id) values ('${ADMIN_UID}');
      insert into public.branches (code, name) values ('zz-c-a', '동시검증지사');
      insert into public.members (id, password_hash, role, branch_id)
        select v.id, extensions.crypt(v.pw, extensions.gen_salt('bf')), v.role, b.id
          from (values ('zz-c-ba', 'cb11', 1), ('zz-c-s1', 'cs11', 3),
                       ('zz-c-s2', 'cs22', 3)) v (id, pw, role)
          cross join public.branches b where b.code = 'zz-c-a';
      insert into public.classes (branch_id, name)
        select b.id, v.name from (values ('동시반1'), ('동시반2')) v (name)
          cross join public.branches b where b.code = 'zz-c-a';`);
  });

  test.afterAll(async () => {
    for (const client of clients) await client.end().catch(() => {});
    if (pg) await pg.stop().catch(() => {});
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("N4: two bulk assigns, same students in opposite orders → both finish", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
    test.skip(!pg, INSTALL_HINT);
    test.setTimeout(120000);
    const owner = clients[0];
    // Test-only: every class_members insert takes 0.3 s, so the two calls
    // surely overlap — the old code then held s1 while waiting for s2 and the
    // other call the reverse (PostgreSQL ends one of them with 40P01).
    await owner.query(`
      create function public.zz_slow() returns trigger language plpgsql as
        $$ begin perform pg_sleep(0.3); return new; end $$;
      create trigger zz_slow before insert on public.class_members
        for each row execute function public.zz_slow();`);
    try {
      const signer = await connect();
      const ba = await signIn(signer, "zz-c-ba", "cb11");
      const one = await connect();
      const two = await connect();
      await become(one, ba);
      await become(two, ba);
      const call = (client, klass, ids) =>
        client.query("select public.lms_bulk_assign($1::jsonb) as r", [
          JSON.stringify(ids.map((id) => ({ class: klass, login_id: id }))),
        ]);
      const first = call(one, "동시반1", ["zz-c-s1", "zz-c-s2"]);
      await sleep(100);
      const second = call(two, "동시반2", ["zz-c-s2", "zz-c-s1"]);
      const settled = await Promise.allSettled([first, second]);
      const outcome = settled.map((s) =>
        s.status === "fulfilled"
          ? s.value.rows[0].r.status
          : `error ${s.reason.code}`,
      );
      expect(outcome).toEqual(["ok", "ok"]);
      expect(await classesOf(owner, "zz-c-s1")).toBe("동시반1,동시반2");
      expect(await classesOf(owner, "zz-c-s2")).toBe("동시반1,동시반2");
    } finally {
      await owner.query(`drop trigger zz_slow on public.class_members;
                         drop function public.zz_slow();
                         delete from public.class_members;`);
    }
  });

  test("N5: two branches made at the same moment with the same code / name → duplicate", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
    test.skip(!pg, INSTALL_HINT);
    test.setTimeout(60000);
    const admin = { jwt: ADMIN_UID };
    const one = await connect();
    const two = await connect();
    await become(one, admin);
    await become(two, admin);
    const create = (client, name, code) =>
      client.query("select public.lms_branch_create($1, $2) as r", [
        name,
        code,
      ]);
    const race = async ([nameA, codeA], [nameB, codeB]) => {
      await one.query("begin");
      const a = (await create(one, nameA, codeA)).rows[0].r;
      // the second call passes the "already there?" check (the first row is
      // not committed yet) and then waits on the unique index
      const pending = create(two, nameB, codeB).then(
        (res) => res.rows[0].r,
        (err) => ({ error: err.code }),
      );
      await sleep(300);
      await one.query("commit");
      return [a.status, await pending];
    };
    expect(
      await race(["동시지사A", "zz-race"], ["동시지사B", "zz-race"]),
    ).toEqual(["ok", { status: "duplicate", field: "code" }]);
    expect(await race(["동시지사C", null], ["동시지사C", null])).toEqual([
      "ok",
      { status: "duplicate", field: "name" },
    ]);
    const owner = clients[0];
    const { rows } = await owner.query(
      "select count(*)::int as n from public.branches where name like '동시지사%'",
    );
    expect(rows[0].n).toBe(2);
  });
});
