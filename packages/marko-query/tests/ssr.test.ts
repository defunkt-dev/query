// @vitest-environment node
//
// Tier 1 SSR tests: server render to an HTML string. The node environment is
// deliberate -- vitest then uses its SSR/html transform, so @marko/vite compiles
// the templates to HTML output and Marko's serializer runs, the exact path the 38
// jsdom client-mount tests never touch. tests/setup.ts is window-guarded, so it
// no-ops here; no vitest projects split is needed.
//
// These assert the Step 3 GREEN behavior: a server render no longer crashes
// serializing the QueryClient, and a query whose data was prefetched into a client
// on $global renders that data (via the read-only cache-read) rather than pending.
//
// The fixture (ssr-query.marko) uses an INLINE queryFn on purpose. A function
// passed as a prop cannot be serialized across resume -- a general Marko constraint,
// unrelated to the client -- so SSR fixtures define queryFn inline the way real code
// does. The earlier crash-repro test (which asserted the QueryClient serialization
// crash) has been retired: the Step 3 refactor removed the code that caused it, so
// it is no longer reproducible. "renders without a serialization error" below is its
// honest inverse, run against a clean fixture.

import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, dehydrate, hydrate } from "@tanstack/query-core";

import SsrQuery from "./fixtures/ssr-query.marko";

async function renderToString(
  template: any,
  input: Record<string, unknown>,
): Promise<string> {
  let out = "";
  for await (const chunk of template.render(input)) out += String(chunk);
  return out;
}

// Extract the text of a [data-testid=ID] cell from the rendered HTML. Marko emits
// unquoted attributes for simple values and a trailing resume comment after the
// text, so this matches either quoting and stops at the first "<" (the comment).
function cell(html: string, id: string): string | null {
  const m = html.match(new RegExp(`data-testid=["']?${id}["']?>([^<]*)`));
  return m ? m[1] : null;
}

describe("SSR server render (GREEN, post Step 3)", () => {
  it("renders without a serialization error when no client is present", async () => {
    // The refactored provider/consumers put nothing non-serializable in scope and
    // the fixture's queryFn is inline, so the render resolves rather than rejecting.
    await expect(renderToString(SsrQuery, {})).resolves.toBeTypeOf("string");

    // With no client on $global the cache-read yields pending.
    const html = await renderToString(SsrQuery, {});
    expect(cell(html, "status")).toBe("pending");
    expect(cell(html, "isPending")).toBe("true");
  });

  it("renders prefetched data from a client on $global, not pending", async () => {
    const client = new QueryClient();
    client.mount();
    await client.prefetchQuery({
      queryKey: ["todos"],
      queryFn: async () => ["a", "b"],
    });

    // The route handler's job (Step 4) done inline here: a prefetched client placed
    // on the non-serialized $global key the cache-read reads.
    const html = await renderToString(SsrQuery, {
      $global: { __tanstack_queryClient: client },
    });

    expect(cell(html, "status")).toBe("success");
    expect(cell(html, "data")).toBe(JSON.stringify(["a", "b"]));
    expect(cell(html, "isPending")).toBe("false");

    client.unmount();
  });
});

describe("dehydrate / hydrate round-trip (query-core baseline)", () => {
  // Pure query-core, no Marko render. This is the data channel the SSR flow relies
  // on and it exercises the 5.101 hydration behavior; it should pass independently
  // of the adapter.
  let server: QueryClient | undefined;
  let client: QueryClient | undefined;

  afterEach(() => {
    server?.clear();
    server?.unmount();
    client?.clear();
    client?.unmount();
    server = client = undefined;
  });

  it("carries prefetched data to a fresh client as plain JSON", async () => {
    server = new QueryClient();
    server.mount();
    await server.prefetchQuery({
      queryKey: ["todos"],
      queryFn: async () => ["t1", "t2"],
    });

    const dehydrated = dehydrate(server);
    const wire = JSON.parse(JSON.stringify(dehydrated));

    client = new QueryClient();
    client.mount();
    hydrate(client, wire);

    const state = client.getQueryState(["todos"]);
    expect(state?.status).toBe("success");
    expect(state?.data).toEqual(["t1", "t2"]);
  });
});