import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

// Rasterize the SVG favicon into the PNG sizes browsers/iOS want, and a large
// preview to eyeball the letterform. No image libraries — just the browser.
const svg = readFileSync("favicon.svg", "utf8");
// Apple touch icon wants a full-bleed opaque square (iOS rounds it itself), so
// use a non-rounded variant for that size.
const squareSvg = svg.replace('rx="7.5"', 'rx="0"');

const b64 = (s) => Buffer.from(s).toString("base64");
const dataUrl = (s) => `data:image/svg+xml;base64,${b64(s)}`;

const jobs = [
  { src: svg, size: 128, out: "scripts/_favicon_preview.png", bg: true },
  { src: svg, size: 32, out: "favicon-32.png", bg: true },
  { src: squareSvg, size: 180, out: "apple-touch-icon.png", bg: false },
];

const browser = await chromium.launch();
for (const j of jobs) {
  const ctx = await browser.newContext({
    viewport: { width: j.size, height: j.size },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>html,body{margin:0}img{display:block;width:${j.size}px;height:${j.size}px}</style>
     <img src="${dataUrl(j.src)}">`,
    { waitUntil: "networkidle" },
  );
  await page.locator("img").screenshot({ path: j.out, omitBackground: j.bg });
  console.log(`wrote ${j.out} (${j.size}x${j.size})`);
  await ctx.close();
}
await browser.close();
