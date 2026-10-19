import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// vercel.json routing can't run under Vite, so this pins the rules the live
// checks rely on. Pure Node — runs on one project only.
const PLAY_HOST = [{ type: "host", value: "play.tps-education.com" }];

test("vercel.json: play host never shows the teacher site", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));

  // Every host: QR paths open the student page.
  expect(config.rewrites).toContainEqual({
    source: "/q/:path*",
    destination: "/play.html",
  });
  // A real file beats a rewrite on Vercel, so "/" and "/index.html" (the
  // teacher page) must be redirected; a rewrite alone would not hide them.
  for (const source of ["/", "/index.html"]) {
    expect(config.redirects).toContainEqual({
      source,
      has: PLAY_HOST,
      destination: "/q",
      permanent: false,
    });
  }
  // Any other non-file path on the play host is the student page too.
  expect(config.rewrites).toContainEqual({
    source: "/:path*",
    has: PLAY_HOST,
    destination: "/play.html",
  });
  // Nothing redirects or rewrites the student page's own files.
  const sources = [...config.redirects, ...config.rewrites].map(
    (r) => r.source,
  );
  for (const asset of ["/play.js", "/play.css", "/video-source.js"]) {
    expect(sources).not.toContain(asset);
  }
  expect(config.trailingSlash).toBe(false);
});
