// @vitest-environment node
//
// Tier 2 resume tests: server-render-then-resume via @marko/compiler/register.
//
// 2a (counter) proves the harness MECHANISM -- compile the fixture html (server) and dom
// (client) under one register config so the registry ids align, write the server HTML into a
// jsdom document, mark the entry boundary ready with initEmbedded, and confirm the resumed
// onClick handler fires.
//
// 2b (adapter) runs the same harness against the real provider/query/infinite-query tags with
// Step 4 dehydrated data on $global. It proves the resume guarantee: a server-rendered query
// resumes LIVE with no loading flash and no refetch while the hydrated data is fresh, and the
// same for infinite-query. "Live" is asserted non-vacuously: the cache-read seeds the resumed
// snapshot, so a success status by itself could be inert -- the tests instead require that the
// observer actually attached (result.refetch / result.fetchNextPage become functions, so their
// buttons render) and that clicking those drives a real update through the live subscription.
//
// Harness notes: (1) the dom runtime import must be "marko/debug/dom" -- a non-optimized
// compile emits that path and init()/run() must drive the same runtime instance the templates
// registered into. (2) Marko 6.1.x defers a render's resume until the templates in its boundary
// (window.M[renderId].b) are marked ready; under register there is no bundler client entry, so
// we do it ourselves via initEmbedded(entryId, "M"). (3) the dom tags require ../qc-bus (a .ts
// module) which the register browser-require cannot load, so a typescript -> cjs loader is added
// for it; a normal @marko/vite build handles this transparently.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import register from "@marko/compiler/register";
import { beforeAll, expect, it } from "vitest";
import { QueryClient, dehydrate } from "@tanstack/query-core";

import createBrowser from "./utils/create-browser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");

const fixtures = join(__dirname, "fixtures");
const counterPath = join(fixtures, "ssr-counter.marko");
const queryPath = join(fixtures, "ssr-resume-query.marko");
const infinitePath = join(fixtures, "ssr-resume-infinite.marko");
const mutationPath = join(fixtures, "ssr-resume-mutation.marko");
const aggregatePath = join(fixtures, "ssr-resume-aggregate.marko");

const baseConfig = { babelConfig: { babelrc: false, configFile: false }, writeVersionComment: false } as const;

beforeAll(() => {
  // Global require hook for the SERVER (html) compile.
  register({ ...baseConfig, output: "html", modules: "cjs" });
});

// The client (dom) compile, plus a .ts loader so the dom tags' require("../qc-bus") resolves.
function domExtensions(): Record<string, (m: any, f: string) => void> {
  const ext: Record<string, (m: any, f: string) => void> = {
    ...register({ ...baseConfig, output: "dom", modules: "cjs", extensions: {} }),
  };
  ext[".ts"] = (module, filename) => {
    const out = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    }).outputText;
    module._compile(out, filename);
  };
  return ext;
}

async function renderChunks(path: string, input: Record<string, unknown>): Promise<string[]> {
  const template = require(path).default;
  const chunks: string[] = [];
  for await (const chunk of template.render(input)) chunks.push(chunk as string);
  return chunks;
}

// Write a server-rendered chunk stream into a fresh jsdom browser and drive Marko's resume.
function resumeInBrowser(path: string, chunks: string[]) {
  const browser = createBrowser({ dir: __dirname, extensions: domExtensions() });
  const { window } = browser;
  const { document } = window;
  const rt = browser.require<{ run: () => void; initEmbedded: (r: string, id?: string) => void }>("marko/debug/dom");
  browser.require(path); // register the dom template's resume scripts into the runtime
  browser.stream(chunks)(); // write the server HTML; the inline bootstrap populates window.M
  const M = (window as unknown as { M: Record<string, { b: Record<string, 1> }> }).M;
  const renderId = Object.keys(M)[0];
  rt.initEmbedded(Object.keys(M[renderId].b)[0], "M"); // mark entry boundary ready -> resume
  return { window, document, run: rt.run };
}

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r));
    await new Promise((r) => setImmediate(r));
  }
};

it("2a: resumes a server-rendered counter and attaches its click handler", async () => {
  const chunks = await renderChunks(counterPath, {});
  const { document, run } = resumeInBrowser(counterPath, chunks);

  const count = () => document.querySelector('[data-testid="count"]')?.textContent;
  expect(count()).toBe("0"); // resumed from the server render, not re-rendered from scratch

  (document.querySelector('[data-testid="increment"]') as HTMLButtonElement).click();
  run();
  await flush();
  expect(count()).toBe("1"); // the proof: resume attached the onClick handler
});

it("2b: a query resumes live with hydrated data -- no flash, no refetch when fresh", async () => {
  const server = new QueryClient();
  server.mount();
  await server.prefetchQuery({ queryKey: ["todos"], queryFn: async () => ["alpha-marker", "beta-marker"] });
  const dehydrated = dehydrate(server);
  const chunks = await renderChunks(queryPath, {
    $global: { __tanstack_queryClient: server, __tanstack_dehydrated: dehydrated, serializedGlobals: { __tanstack_dehydrated: true } },
  });
  server.unmount();

  const { document, run } = resumeInBrowser(queryPath, chunks);
  await flush();
  run();
  await flush();

  const status = () => document.querySelector('[data-testid="status"]')?.textContent;
  const data = () => document.querySelector('[data-testid="data"]')?.textContent;
  const refetchBtn = () => document.querySelector('[data-testid="refetch"]') as HTMLButtonElement | null;

  expect(status()).toBe("success"); // seeded by the cache-read and kept by the live observer: no flash
  expect(data()).toContain("alpha-marker"); // the hydrated cache
  expect(data()).not.toContain("REFETCH-SENTINEL"); // fresh under staleTime: no refetch
  expect(refetchBtn(), "refetch button proves a live observer, not the inert snapshot").not.toBeNull();

  refetchBtn()!.click();
  run();
  await flush();
  expect(data()).toContain("REFETCH-SENTINEL"); // an explicit refetch flows through the live subscription
});

it("2b: an infinite-query resumes live with the hydrated page -- no flash, no refetch when fresh", async () => {
  const server = new QueryClient();
  server.mount();
  await server.prefetchInfiniteQuery({
    queryKey: ["pages"],
    queryFn: async ({ pageParam }: { pageParam: number }) => ["page-" + pageParam],
    initialPageParam: 0,
    getNextPageParam: (_last: unknown, all: unknown[]) => all.length,
  });
  const dehydrated = dehydrate(server);
  const chunks = await renderChunks(infinitePath, {
    $global: { __tanstack_queryClient: server, __tanstack_dehydrated: dehydrated, serializedGlobals: { __tanstack_dehydrated: true } },
  });
  server.unmount();

  const { document, run } = resumeInBrowser(infinitePath, chunks);
  await flush();
  run();
  await flush();

  const status = () => document.querySelector('[data-testid="status"]')?.textContent;
  const pages = () => document.querySelector('[data-testid="pages"]')?.textContent;
  const hasNext = () => document.querySelector('[data-testid="hasNext"]')?.textContent;
  const nextBtn = () => document.querySelector('[data-testid="next"]') as HTMLButtonElement | null;

  expect(status()).toBe("success"); // the infinite cache-read seeds success: no flash
  expect(pages()).toContain("page-0"); // the hydrated first page
  expect(hasNext()).toBe("true");
  expect(pages()).not.toContain("SENTINEL"); // fresh under staleTime: no refetch
  expect(nextBtn(), "fetchNextPage button proves a live observer").not.toBeNull();

  nextBtn()!.click();
  run();
  await flush();
  expect(pages()).toContain("page-0"); // first page still hydrated
  expect(pages()).toContain("SENTINEL-1"); // the live observer fetched the next page
});

it("2b: a mutation resumes with a working mutate handler", async () => {
  // Regression guard for the resume fix. The mutation tag's action handlers live on _ref and are
  // attached in the client effect (not the _makeRef initializer), so they survive resume; they
  // used to come back undefined because the initializer is restored, not re-run, on the client.
  // After resume mut.mutate must be a real function, and calling it must drive the mutation to
  // pending (the mutationFn never resolves, so it stays there).
  const chunks = await renderChunks(mutationPath, {});
  const { document, run } = resumeInBrowser(mutationPath, chunks);
  await flush();
  run();
  await flush();

  const status = () => document.querySelector('[data-testid="status"]')?.textContent;
  const hasMutate = () => document.querySelector('[data-testid="hasmutate"]')?.textContent;

  expect(hasMutate(), "mut.mutate is a real function after resume").toBe("function");
  expect(status()).toBe("idle");

  (document.querySelector('[data-testid="go"]') as HTMLButtonElement).click();
  run();
  await flush();
  run();
  await flush();
  expect(status(), "the resumed handler drives the mutation to pending").toBe("pending");
});

it("2b: the aggregate observers (is-fetching, is-mutating, mutation-state) resume live via the bus", async () => {
  // No dehydrated data: on resume the provider creates the client in onMount and the bus wakes
  // the consumers (their effects run first, before any client exists, so a one-time read would
  // miss it). Their server value is 0/empty. After resume we enable a never-resolving query and
  // fire a never-resolving mutation; each observer can only reflect that new activity if the bus
  // wake re-ran its effect and it subscribed. If a tag stayed inert, its value would remain 0 --
  // so "1" is the proof. (The mutation half also depends on the resume fix above.)
  const chunks = await renderChunks(aggregatePath, {});
  const { document, run } = resumeInBrowser(aggregatePath, chunks);
  await flush();
  run();
  await flush();

  const fetching = () => document.querySelector('[data-testid="fetching"]')?.textContent;
  const mutating = () => document.querySelector('[data-testid="mutating"]')?.textContent;
  const mstate = () => document.querySelector('[data-testid="mstate"]')?.textContent;

  expect(fetching()).toBe("0"); // resumed; nothing fetching yet
  expect(mutating()).toBe("0");
  expect(mstate()).toBe("0");

  (document.querySelector('[data-testid="go"]') as HTMLButtonElement).click();
  run();
  await flush();
  run();
  await flush();

  expect(fetching(), "is-fetching is live: it saw the new fetch").toBe("1");
  expect(mutating(), "is-mutating is live: it saw the pending mutation").toBe("1");
  expect(mstate(), "mutation-state is live: it lists the pending mutation").toBe("1");
});