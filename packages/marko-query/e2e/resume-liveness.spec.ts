import { expect, test } from "@playwright/test";

// Settles the open question from the working doc (sections 9 and 10): in a REAL browser,
// does an SSR'd query go live after resume, or does it stay inert?
//
// This version also confirms the page actually resumed before interpreting the query, via a
// query-independent resume marker (data-testid="resumed"): "no" on the server, "yes" after a
// client onMount. That lets a "pending" status be attributed correctly:
//   resumed=yes + status=pending  => the page resumed but the query is inert (Problem B).
//   resumed=no                    => the page never resumed (setup issue), result inconclusive.
//
// PASS (status reaches "success") => the adapter is fine in a real browser; jsdom was
//   misleading; the three resume tests move to Tier 3. Step 4 proceeds.
// FAIL with resumed=yes => Problem B is real; fix the client handoff before the resume tests.

test("an SSR'd query becomes live after resume in a real browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });

  await page.goto("/");
  // Allow resume and a client-side fetch to settle.
  await page.waitForTimeout(1500);

  const resumed = await page.getByTestId("resumed").textContent();
  const status = await page.getByTestId("status").textContent();
  const data = await page.getByTestId("data").textContent();
  // eslint-disable-next-line no-console
  console.log(
    `resumed=${resumed} | status=${status} | data=${JSON.stringify(data)} | errors=${JSON.stringify(errors)}`,
  );

  // Precondition: the page actually resumed (client JS ran).
  expect(resumed, "page did not resume -- client JS did not run; result inconclusive").toBe(
    "yes",
  );

  // Decisive: did the query go live on resume?
  expect(status, "query inert after resume -- Problem B is real").toBe("success");
  expect(data).toBe("live-data");
});