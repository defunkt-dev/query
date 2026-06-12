// Step 2c: the subscription-cleanup probe. A live query consumer must keep exactly one
// observer subscription as its key changes (each change tears down the previous subscription
// before creating the next, via $signal.onabort, rather than stacking a second one), and must
// drop to zero on unmount. A leak shows up as an observer that never goes away.
import { afterEach, expect, it } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@marko/testing-library";
import { QueryClient } from "@tanstack/query-core";

import Probe from "./fixtures/subscription-cleanup.marko";

afterEach(cleanup);

// Total live query observers across the whole cache.
const liveObservers = (client: QueryClient) =>
  client
    .getQueryCache()
    .getAll()
    .reduce((n, q: any) => n + (typeof q.getObserversCount === "function" ? q.getObserversCount() : 0), 0);

it("keeps one live observer across key changes and tears it down on unmount", async () => {
  const client = new QueryClient();
  client.mount();

  const { getByTestId } = await render(Probe, { $global: { __tanstack_queryClient: client } });
  await waitFor(() => expect(getByTestId("status").textContent).toBe("success"));
  expect(liveObservers(client)).toBe(1);

  // Several key changes: the count must stay at one (no leaked subscription per change).
  for (const next of ["2", "3", "4"]) {
    fireEvent.click(getByTestId("bump"));
    await waitFor(() => expect(getByTestId("key").textContent).toBe(next));
    await waitFor(() => expect(getByTestId("status").textContent).toBe("success"));
    expect(liveObservers(client)).toBe(1);
  }

  // Unmount: Marko's $signal.onabort cleanup is async, so wait for the unsubscribe to land.
  cleanup();
  await waitFor(() => expect(liveObservers(client)).toBe(0));

  client.clear();
  client.unmount();
});