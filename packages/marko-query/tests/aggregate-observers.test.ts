// The aggregate-cache observer tags: is-fetching, is-mutating, mutation-state. Each subscribes
// to the relevant cache and keeps its own local reactive value (no shared writable global, no
// let-global). These are CSR behaviour tests; the client is passed on $global and activity is
// driven directly on it, so the tags observe the same client the provider uses (no-clobber).
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, waitFor } from "@marko/testing-library";
import { QueryClient, MutationObserver } from "@tanstack/query-core";

import IsFetchingProbe from "./fixtures/is-fetching-probe.marko";
import IsMutatingProbe from "./fixtures/is-mutating-probe.marko";
import MutationStateProbe from "./fixtures/mutation-state-probe.marko";

afterEach(cleanup);

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

describe("is-fetching", () => {
  it("counts in-flight queries and returns to zero when settled", async () => {
    const client = new QueryClient();
    client.mount();
    const { getByTestId } = await render(IsFetchingProbe, {
      $global: { __tanstack_queryClient: client },
    });
    expect(getByTestId("fetching").textContent).toBe("0");

    const d = deferred<string>();
    client.prefetchQuery({ queryKey: ["thing"], queryFn: () => d.promise });
    await waitFor(() => expect(getByTestId("fetching").textContent).toBe("1"));

    d.resolve("done");
    await waitFor(() => expect(getByTestId("fetching").textContent).toBe("0"));

    client.clear();
    client.unmount();
  });
});

describe("is-mutating", () => {
  it("counts pending mutations and returns to zero when settled", async () => {
    const client = new QueryClient();
    client.mount();
    const { getByTestId } = await render(IsMutatingProbe, {
      $global: { __tanstack_queryClient: client },
    });
    expect(getByTestId("mutating").textContent).toBe("0");

    const d = deferred<unknown>();
    const obs = new MutationObserver(client, { mutationFn: () => d.promise });
    obs.mutate();
    await waitFor(() => expect(getByTestId("mutating").textContent).toBe("1"));

    d.resolve("ok");
    await waitFor(() => expect(getByTestId("mutating").textContent).toBe("0"));

    client.clear();
    client.unmount();
  });
});

describe("mutation-state", () => {
  it("reflects the cache, supports select, and returns a frozen array", async () => {
    const client = new QueryClient();
    client.mount();
    const { getByTestId } = await render(MutationStateProbe, {
      $global: { __tanstack_queryClient: client },
    });
    expect(getByTestId("count").textContent).toBe("0");
    expect(getByTestId("frozen").textContent).toBe("true");

    const d = deferred<unknown>();
    const obs = new MutationObserver(client, { mutationFn: () => d.promise });
    obs.mutate();
    await waitFor(() => expect(getByTestId("count").textContent).toBe("1"));
    await waitFor(() => expect(getByTestId("selected").textContent).toBe("pending"));

    d.resolve("ok");
    await waitFor(() => expect(getByTestId("selected").textContent).toBe("success"));
    expect(getByTestId("frozen").textContent).toBe("true");

    client.clear();
    client.unmount();
  });
});
