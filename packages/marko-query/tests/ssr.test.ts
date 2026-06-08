// @vitest-environment node
//
// Tier 1 SSR tests for @tanstack/marko-query.
//
// These run in the NODE environment on purpose. The package's default vitest
// environment is jsdom (for the 38 client-mount tests). In node, vitest uses
// its SSR transform, so @marko/vite compiles the .marko templates to HTML
// output and template.render() runs Marko's serializer -- the exact path the
// jsdom client-mount tests never touch.
//
// No vitest "projects" split is needed: tests/setup.ts is already guarded with
// "if (typeof window !== undefined)", so it no-ops here. This single per-file
// directive is enough, and the existing 38 tests are untouched.

import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, dehydrate, hydrate } from "@tanstack/query-core";

import QueryWithProvider from "./fixtures/query-with-provider.marko";

// Render a v6 template to an HTML string (mirrors @marko/testing-library's
// server entry: String(await template.render(input))). If serialization fails
// during render, the returned promise rejects.
async function renderToString(
  template: any,
  input: Record<string, unknown>,
): Promise<string> {
  return String(await template.render(input));
}

describe("SSR -- current behavior (RED, pre-refactor)", () => {
  // The provider creates the QueryClient during render (plain import, so it
  // runs on the server) and the <query> consumer reads it through <let-global>,
  // which holds it in a <let>. Marko sees the browser code reading that <let>
  // and tries to serialize the QueryClient on the server, which it cannot. In
  // dev/test mode @marko/vite sets MARKO_DEBUG=true, so the serializer throws
  // "Unable to serialize ...".
  //
  // This is the in-repo reproduction of the crash the standalone sandbox could
  // only approximate. After the Step 3 refactor (consumers read $global
  // directly; provider creates the client in onMount), this expectation flips
  // to a successful render -- see the GREEN todos at the bottom.
  it("crashes serializing the QueryClient on server render", async () => {
    await expect(
      renderToString(QueryWithProvider, {
        // queryFn is required by the fixture but is never called on the server
        // (the consumer's subscribe is browser-only); the crash happens at
        // serialization regardless of its value.
        queryFn: async () => ["a", "b"],
      }),
    ).rejects.toThrow(/Unable to serialize/i);
  });
});

describe("dehydrate / hydrate round-trip (query-core baseline)", () => {
  // Pure query-core: no Marko render involved. This is the data channel the
  // SSR flow relies on, and it also exercises the 5.101 hydration behavior
  // (pending-with-data promoted to success). It should pass independently of
  // the adapter refactor.
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

    // dehydrate -> plain JSON over the wire -> hydrate, exactly what a server
    // entry will do (dehydrated state onto a whitelisted $global key, then the
    // provider calls hydrate on the client).
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

// Filled in once the Step 3 refactor lands (provider creates the client in
// onMount; consumers read $global directly; <query> gains the read-only server
// cache-read). Kept as todos so this file documents the GREEN target:
//
//   it.todo: server render of provider+query with a prefetched client on
//     $global shows the data, not "pending".
//   it.todo: a prefetched client on $global is NOT clobbered by the provider
//     (server render still shows the data).
//   it.todo: SSR render completes WITHOUT a serialization error -- the inverse
//     of the RED test above, guarding against the let-global-holds-client bug
//     returning.
describe.todo("SSR -- after refactor (GREEN)");