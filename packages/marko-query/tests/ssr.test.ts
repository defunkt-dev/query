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
//
// The Step 4 block asserts the dehydrate flow on top of that: a route handler's
// prefetched client renders data via the cache-read, and serializedGlobals is what
// ships the dehydrated cache into the HTML so it crosses resume (with a control that
// omits it). It uses a second fixture (ssr-dehydrate.marko) and a small local
// makeDehydrated helper so the file stays self-contained.

import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, dehydrate, hydrate } from "@tanstack/query-core";

import SsrQuery from "./fixtures/ssr-query.marko";
import SsrDehydrate from "./fixtures/ssr-dehydrate.marko";

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

// Prefetch queryKey ["todos"] into a fresh client and dehydrate it -- the data a route
// handler would compute on the server. Local so this file needs no helpers import.
async function makeDehydrated(data: unknown) {
  const c = new QueryClient();
  c.mount();
  await c.prefetchQuery({ queryKey: ["todos"], queryFn: async () => data });
  return { client: c, dehydrated: dehydrate(c) };
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

describe("Step 4 — dehydrate flow (SSR)", () => {
  it("route handler: server renders prefetched data via the cache-read", async () => {
    const { client, dehydrated } = await makeDehydrated(["alpha-marker", "beta-marker"]);
    const html = await renderToString(SsrDehydrate, {
      $global: {
        __tanstack_queryClient: client,
        __tanstack_dehydrated: dehydrated,
        serializedGlobals: { __tanstack_dehydrated: true },
      },
    });
    expect(cell(html, "status")).toBe("success");
    expect(html).toContain("alpha-marker");
    client.unmount();
  });

  it("serializedGlobals ships the dehydrated cache so it crosses resume", async () => {
    const { dehydrated } = await makeDehydrated(["alpha-marker"]);
    // No live client on $global, so the cache-read yields pending; the only way the
    // data can appear in the HTML is via the serialized global.
    const withWhitelist = await renderToString(SsrDehydrate, {
      $global: { __tanstack_dehydrated: dehydrated, serializedGlobals: { __tanstack_dehydrated: true } },
    });
    expect(cell(withWhitelist, "status")).toBe("pending");
    expect(withWhitelist).toContain("alpha-marker");

    // Control: without serializedGlobals the dehydrated data is not serialized, so it
    // never crosses.
    const withoutWhitelist = await renderToString(SsrDehydrate, {
      $global: { __tanstack_dehydrated: dehydrated },
    });
    expect(withoutWhitelist).not.toContain("alpha-marker");
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