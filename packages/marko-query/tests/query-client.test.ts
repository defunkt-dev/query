// query-client: the public accessor that hands the QueryClient to user code for imperative calls.
// CSR behaviour test; SSR (no client in scope) and resume (bus wake) live in ssr.test.ts and
// ssr-resume.test.ts.
import { afterEach, expect, it } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@marko/testing-library";
import { QueryClient } from "@tanstack/query-core";

import Probe from "./fixtures/query-client-probe.marko";

afterEach(cleanup);

it("hands the live client to user code (setQueryData round-trips through it)", async () => {
  const client = new QueryClient();
  client.mount();
  const { getByTestId } = await render(Probe, { $global: { __tanstack_queryClient: client } });

  await waitFor(() => expect(getByTestId("has").textContent).toBe("true"));

  fireEvent.click(getByTestId("go"));
  // Proves qc IS the real client: the write landed on the test's client, and the read came back.
  await waitFor(() => expect(client.getQueryData(["x"])).toBe(7));
  await waitFor(() => expect(getByTestId("result").textContent).toBe("7"));

  client.clear();
  client.unmount();
});
