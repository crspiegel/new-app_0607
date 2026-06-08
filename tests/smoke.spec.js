import { expect, test } from "@playwright/test";

test("main level-to-month-to-content flow renders", async ({ page }) => {
  const failedRequests = [];
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Cambridge Reading Adventures" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Level 1" }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Level 1" }).first().click();
  await expect(page).toHaveURL(/#months\/Level%201$/);
  await expect(
    page.getByRole("heading", { name: "Choose a Month" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /March/i }).click();
  await expect(page).toHaveURL(/#content\/Level%201\/March$/);
  await expect(
    page.getByRole("heading", { name: "March Reading Plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Opening Song/i }).first(),
  ).toBeVisible();

  expect(failedRequests.filter((url) => url.includes("/assets/"))).toEqual([]);
});

test("calendar version 2 remains available", async ({ page }) => {
  await page.goto("/#content-v2/Level%201/March");

  await expect(page.locator("#contentScreenV2")).toHaveClass(/screen-active/);
  await expect(
    page.getByRole("heading", { name: "March Reading Plan" }),
  ).toBeVisible();
  await expect(page.locator("#lessonGridV2")).toBeVisible();
});

test("calendar version 3 renders Mon-Fri learning calendar", async ({
  page,
}) => {
  await page.goto("/#content-v3/Level%201/March");

  await expect(page.locator("#contentScreenV3")).toHaveClass(/screen-active/);
  await expect(
    page.getByRole("heading", { name: "March Reading Plan" }),
  ).toBeVisible();
  await expect(page.locator(".content-v3-weekdays span")).toHaveText([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
  ]);
  await expect(page.locator(".content-v3-date")).toHaveCount(0);
  await expect(page.locator(".content-v3-day-name").first()).toHaveText("Mon");
  await expect(
    page.locator(".content-v3-day-cell[data-content-type]").first(),
  ).toBeVisible();
});
