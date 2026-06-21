import { expect, test } from "@playwright/test";

// devtools tag: dev-only, browser-only. After the page resumes in a real browser the panel should
// mount into its container (the dev server runs with import.meta.env.DEV true). Mirrors
// resume-liveness.spec.ts -- a query-independent resume marker (data-testid="resumed") confirms the
// page resumed before anything else is interpreted. We assert the panel mounted content into its
// container rather than depending on TanStack's internal markup, and that no errors fired.

test("the dev-only devtools panel mounts after resume in a real browser", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });

  await page.goto("/devtools");
  // Allow resume, the underlying query, and the panel's async dynamic import + mount to settle.
  await page.waitForTimeout(1500);

  const resumed = await page.getByTestId("resumed").textContent();
  const status = await page.getByTestId("status").textContent();
  const childCount = await page.locator(".tsqd-parent-container > *").count();
  // eslint-disable-next-line no-console
  console.log(
    `resumed=${resumed} | status=${status} | panelChildren=${childCount} | errors=${JSON.stringify(errors)}`,
  );

  // Precondition: the page actually resumed (client JS ran).
  expect(
    resumed,
    "page did not resume -- client JS did not run; result inconclusive",
  ).toBe("yes");

  // The underlying query is live (proves the provider/client are wired on this page too).
  expect(status, "query inert after resume").toBe("success");

  // Decisive: the dev-only panel mounted content into its container.
  expect(
    childCount,
    "devtools panel did not mount into its container after resume",
  ).toBeGreaterThan(0);

  // Ignore the dev server's own Vite HMR websocket noise: this server runs with hmr disabled, so
  // the injected Vite client cannot reach a socket and logs a connection failure on every page
  // (the sibling specs see the identical lines and do not assert on them). It is not an error from
  // the page under test, and the panel-mounted assertion above already proves the panel loaded and
  // mounted without throwing. Guard only against real errors from our wiring or the panel.
  const realErrors = errors.filter(
    (e) => !/\[vite\]|websocket|ws:\/\//i.test(e),
  );
  expect(
    realErrors,
    `unexpected errors: ${JSON.stringify(realErrors)}`,
  ).toEqual([]);
});