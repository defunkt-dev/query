import { expect, test } from "@playwright/test";

// queries tag: an SSR'd dynamic set of queries should go live after resume in a real browser.
// Mirrors resume-liveness.spec.ts -- a query-independent resume marker (data-testid="resumed")
// confirms the page resumed before the statuses are interpreted, so a lingering "pending" can be
// attributed correctly rather than mistaken for a setup failure.

test("an SSR'd queries set becomes live after resume in a real browser", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });

  await page.goto("/queries");
  // Allow resume and the client-side fetches to settle.
  await page.waitForTimeout(1500);

  const resumed = await page.getByTestId("resumed").textContent();
  const statuses = await page.getByTestId("statuses").textContent();
  const data = await page.getByTestId("data").textContent();
  // eslint-disable-next-line no-console
  console.log(
    `resumed=${resumed} | statuses=${statuses} | data=${JSON.stringify(data)} | errors=${JSON.stringify(errors)}`,
  );

  // Precondition: the page actually resumed (client JS ran).
  expect(
    resumed,
    "page did not resume -- client JS did not run; result inconclusive",
  ).toBe("yes");

  // Decisive: did every query in the set go live on resume?
  expect(statuses, "queries inert after resume").toBe("success,success");
  expect(data).toBe("one,two");
});
