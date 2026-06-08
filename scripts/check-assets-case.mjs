import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const scannedFiles = ["index.html", "styles.css", "app.js"].filter((file) =>
  existsSync(path.join(root, file)),
);

const assetRefs = new Set();
const assetPattern = /assets\/[A-Za-z0-9._/-]+/g;

for (const file of scannedFiles) {
  const source = readFileSync(path.join(root, file), "utf8");
  for (const match of source.matchAll(assetPattern)) {
    assetRefs.add(match[0]);
  }
}

function findCaseMismatch(relativeRef) {
  const parts = relativeRef.split("/");
  let current = root;

  for (const part of parts) {
    if (!existsSync(current) || !statSync(current).isDirectory()) {
      return { exists: false, actualPath: null };
    }

    const entries = readdirSync(current);
    const exact = entries.find((entry) => entry === part);
    if (exact) {
      current = path.join(current, exact);
      continue;
    }

    const insensitive = entries.find(
      (entry) => entry.toLowerCase() === part.toLowerCase(),
    );
    if (insensitive) {
      return {
        exists: false,
        actualPath: path
          .join(path.relative(root, current), insensitive)
          .replaceAll("\\", "/"),
      };
    }

    return { exists: false, actualPath: null };
  }

  return { exists: true, actualPath: relativeRef };
}

const failures = [];

for (const assetRef of assetRefs) {
  const result = findCaseMismatch(assetRef);
  if (!result.exists) {
    failures.push({ assetRef, actualPath: result.actualPath });
  }
}

if (failures.length > 0) {
  console.error("Asset path check failed:");
  for (const failure of failures) {
    const hint = failure.actualPath ? ` actual: ${failure.actualPath}` : "";
    console.error(`- ${failure.assetRef}${hint}`);
  }
  process.exit(1);
}

console.log(`Asset path check passed (${assetRefs.size} references).`);
