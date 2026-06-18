import { expect, test, type Page } from "@playwright/test";

// Real-browser scenarios across the adapter's tags. Dev-only suite (not CI). Each test loads a
// dedicated SSR route, confirms the page resumed (resumed=yes), then drives the tag and asserts
// it behaves live in real Chromium. The "/" query-liveness scenario is in resume-liveness.spec.ts.

async function waitResumed(page: Page) {
  await expect(page.getByTestId("resumed")).toHaveText("yes", { timeout: 10_000 });
}

test("prefetch: no loading flash, and no client refetch when data is fresh", async ({ page }) => {
  // Raw SSR HTML (no JS): the data must be server-rendered, with no pending flash.
  const res = await page.request.get("/query-prefetch");
  const html = await res.text();
  expect(html, "data should be server-rendered").toContain("server-data");
  expect(html, "no pending flash in the SSR HTML").not.toContain("pending");

  // With JS: resume keeps the hydrated data and never refetches it on the client.
  await page.goto("/query-prefetch");
  await waitResumed(page);
  await expect(page.getByTestId("status")).toHaveText("success");
  await expect(page.getByTestId("data")).toHaveText("server-data");
  const clientFetches = await page.evaluate(() => (globalThis as any).__noflash_client_fetches || 0);
  expect(clientFetches, "fresh hydrated data must not refetch on the client").toBe(0);
});

test("mutation: mutate fires and resolves after resume", async ({ page }) => {
  await page.goto("/mutation");
  await waitResumed(page);
  await expect(page.getByTestId("status")).toHaveText("idle");
  await page.getByTestId("go").click();
  await expect(page.getByTestId("status")).toHaveText("success");
  await expect(page.getByTestId("data")).toHaveText("did:x");
});

test("infinite-query: first page live, fetchNextPage appends", async ({ page }) => {
  await page.goto("/infinite");
  await waitResumed(page);
  await expect(page.getByTestId("status")).toHaveText("success");
  await expect(page.getByTestId("pages")).toHaveText(JSON.stringify(["item-1"]));
  await page.getByTestId("next").click();
  await expect(page.getByTestId("pages")).toHaveText(JSON.stringify(["item-1", "item-2"]));
});

test("aggregate observers: counts reflect a live fetch and mutation", async ({ page }) => {
  await page.goto("/aggregates");
  await waitResumed(page);
  await expect(page.getByTestId("fetching")).toHaveText("0");
  await expect(page.getByTestId("mutating")).toHaveText("0");
  await page.getByTestId("go").click();
  await expect(page.getByTestId("fetching")).toHaveText("1");
  await expect(page.getByTestId("mutating")).toHaveText("1");
  await expect(page.getByTestId("mstate")).toHaveText("1");
});

test("query-client: imperative setQueryData round-trips after resume", async ({ page }) => {
  await page.goto("/query-client");
  await waitResumed(page);
  await expect(page.getByTestId("has")).toHaveText("true");
  await page.getByTestId("go").click();
  await expect(page.getByTestId("result")).toHaveText("7");
});

test("invalidate: invalidateQueries triggers a refetch", async ({ page }) => {
  await page.goto("/invalidate");
  await waitResumed(page);
  await expect(page.getByTestId("status")).toHaveText("success");
  await expect(page.getByTestId("data")).toHaveText("v1");
  await page.getByTestId("go").click();
  await expect(page.getByTestId("data")).toHaveText("v2");
});

test("error: a rejecting query reaches the error state after resume", async ({ page }) => {
  await page.goto("/error");
  await waitResumed(page);
  await expect(page.getByTestId("status")).toHaveText("error");
  await expect(page.getByTestId("error")).toHaveText("boom");
});
