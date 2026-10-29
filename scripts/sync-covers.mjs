// Copies the book covers the admin uploaded to Supabase Storage into the
// repo as static files for the student QR page (decision D4: that page never
// reads Storage). One REST read of content_pages (level, month, covers), then
// one GET per cover → assets/covers/<level-slug>/<month-slug>/book-<n>.<ext>
// (video-source.js coverAssetPath; ext = COVER_EXT). A manifest with sizes
// and the source URLs is written to qr/covers-manifest.json (git-ignored).
//
//   node scripts/sync-covers.mjs --dry-run          REST + HEAD only: list + total bytes
//   node scripts/sync-covers.mjs                    download every cover (Storage egress!)
//   node scripts/sync-covers.mjs --only level-2   one level (after an admin replaced a cover)
//   npm run covers:sync -- --only level-2         (keys: beginner, level-1, level-2, level-3)
//
// Afterwards: commit assets/covers and push (the student page reads the
// committed file). Nothing here re-encodes the image: the admin upload
// already shrank it (app.js shrinkImage, 800 px / q 0.82).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";

const root = process.cwd();

function parseArgs(argv) {
  const args = { dryRun: false, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--only") args.only = argv[(i += 1)];
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function loadVideoSource() {
  const context = vm.createContext({ URL });
  const file = path.join(root, "video-source.js");
  vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
  return vm.runInContext(
    "({ LEVELS, levelFromAny, months, bookLayout, coverAssetPath, COVER_EXT })",
    context,
  );
}

function supabaseConfig() {
  const source = readFileSync(path.join(root, "supabase-config.js"), "utf8");
  const url = source.match(/window\.SUPABASE_URL\s*=\s*"([^"]+)"/);
  const key = source.match(/window\.SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/);
  if (!url || !key) throw new Error("Could not read supabase-config.js");
  return { url: url[1], key: key[1] };
}

// Keyed "<new level key>||<month>". Rows may still carry the old level keys
// until supabase/levels/01-rename.sql has run: the new-key row wins.
async function fetchCovers(vs) {
  const { url, key } = supabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/content_pages?select=level,month,covers`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!response.ok) throw new Error(`content_pages: HTTP ${response.status}`);
  const rows = await response.json();
  const byKey = {};
  for (const legacy of [true, false]) {
    for (const row of rows) {
      const level = vs.levelFromAny(row.level);
      if (level && (level !== row.level) === legacy) {
        byKey[`${level}||${row.month}`] = row.covers || {};
      }
    }
  }
  return byKey;
}

const EXT_BY_TYPE = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const vs = loadVideoSource();
  const keys = vs.LEVELS.map((item) => item.key);
  // New keys only: "Level 3" would be ambiguous (old key = Level 2).
  if (args.only && !keys.includes(args.only)) {
    throw new Error(`--only takes one of: ${keys.join(", ")}`);
  }
  const covers = await fetchCovers(vs);
  const jobs = [];
  for (const level of keys) {
    if (args.only && level !== args.only) continue;
    for (const month of vs.months) {
      const row = covers[`${level}||${month}`] || {};
      for (const entry of vs.bookLayout(level)) {
        const source = row[entry.cover];
        jobs.push({
          level,
          month,
          book: entry.book,
          source: source || null,
          file: vs.coverAssetPath(level, month, entry.book),
        });
      }
    }
  }

  const manifest = [];
  let total = 0;
  let missing = 0;
  const types = {};
  for (const job of jobs) {
    if (!job.source) {
      missing += 1;
      manifest.push({ ...job, bytes: 0, type: null, status: "no cover" });
      console.log(`  (none)   ${job.file}`);
      continue;
    }
    const response = await fetch(job.source, {
      method: args.dryRun ? "HEAD" : "GET",
    });
    if (!response.ok) {
      manifest.push({
        ...job,
        bytes: 0,
        type: null,
        status: `HTTP ${response.status}`,
      });
      console.log(`  HTTP ${response.status}  ${job.file}`);
      continue;
    }
    const type = (response.headers.get("content-type") || "").split(";")[0];
    types[type] = (types[type] || 0) + 1;
    let bytes = Number(response.headers.get("content-length") || 0);
    if (!args.dryRun) {
      const data = Buffer.from(await response.arrayBuffer());
      bytes = data.length;
      const ext = EXT_BY_TYPE[type];
      if (!ext) throw new Error(`${job.file}: unexpected type ${type}`);
      if (ext !== vs.COVER_EXT) {
        throw new Error(
          `${job.file}: ${type} but COVER_EXT is "${vs.COVER_EXT}" — fix video-source.js first`,
        );
      }
      const target = path.join(root, job.file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, data);
    }
    total += bytes;
    manifest.push({
      ...job,
      bytes,
      type,
      status: args.dryRun ? "head" : "saved",
    });
    console.log(
      `  ${String(bytes).padStart(8)}B ${type.padEnd(11)} ${job.file}`,
    );
  }

  const summary = {
    generated: new Date().toISOString(),
    dryRun: args.dryRun,
    files: jobs.length,
    withCover: jobs.length - missing,
    totalBytes: total,
    contentTypes: types,
    covers: manifest,
  };
  if (!args.dryRun) {
    const out = path.join(root, "qr", "covers-manifest.json");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  }
  console.log(
    `${args.dryRun ? "Dry run" : "Saved"}: ${jobs.length - missing}/${jobs.length} covers, ` +
      `${(total / 1024 / 1024).toFixed(2)} MB, types ${JSON.stringify(types)}` +
      (missing ? `, ${missing} without a cover` : ""),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
