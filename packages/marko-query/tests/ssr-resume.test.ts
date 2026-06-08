// @vitest-environment node
//
// Tier 2a: the SSR -> resume HARNESS MECHANISM, proven with a trivial counter.
//
// This deliberately does NOT import the .marko fixture through Vitest. It
// compiles the fixture itself with @marko/compiler/register -- html for the
// server side, dom for the client side -- exactly like Marko's own runtime-tags
// test harness (runtime-tags/src/__tests__/main.test.ts). Compiling both sides
// with one compiler config (same auto-discovered translator, non-optimized)
// keeps the server and client registry ids aligned. The server HTML is written
// into a jsdom-context-require browser and the client is required in to resume.
//
// What it proves: the server renders count 0; after resume the onClick handler
// is attached, so clicking increments to 1. If resume does not wire up, the
// click is a no-op and the count stays 0.
//
// Two non-obvious things were required to make resume actually run; both are
// documented inline below:
//   1. the dom runtime import path must be "marko/debug/dom" (not "marko/dom"),
//      because a non-optimized compile emits the debug runtime path, and the
//      runtime instance that init() drives must be the same one the compiled
//      template registered its scripts into.
//   2. Marko 6.1.x defers a render's resume until the template(s) named in the
//      render's boundary are marked "ready"; with register (no bundler-generated
//      client entry) we mark the entry template ready ourselves via
//      initEmbedded(entryId, runtimeId).

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import register from "@marko/compiler/register";
import { beforeAll, expect, it } from "vitest";

import createBrowser from "./utils/create-browser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const counterPath = join(__dirname, "fixtures", "ssr-counter.marko");

const baseConfig = {
  babelConfig: { babelrc: false, configFile: false },
  writeVersionComment: false,
} as const;

beforeAll(() => {
  // Global require hook for the SERVER (html) compile. createRequire above is a
  // native Node require, so this hook applies to require(counterPath) below.
  register({ ...baseConfig, output: "html", modules: "cjs" });
});

async function serverRenderChunks(
  input: Record<string, unknown>,
): Promise<string[]> {
  const template = require(counterPath).default;
  const chunks: string[] = [];
  for await (const chunk of template.render(input)) {
    chunks.push(chunk as string);
  }
  return chunks;
}

const flushScheduler = async () => {
  // Marko's scheduler here is rAF (polyfilled to setTimeout) then MessageChannel
  // (setImmediate -> microtask). Drain generously before asserting.
  await new Promise((r) => setTimeout(r));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r));
};

it("resumes a server-rendered counter and attaches its click handler", async () => {
  const chunks = await serverRenderChunks({});

  const browser = createBrowser({
    dir: __dirname,
    // The client (dom) compile. extensions: {} makes register return the
    // extensions for this browser's require WITHOUT clobbering the global html
    // hook installed in beforeAll.
    extensions: register({
      ...baseConfig,
      output: "dom",
      modules: "cjs",
      extensions: {},
    }),
  });
  const { window } = browser;
  const { document } = window;

  // The dom runtime. It MUST be "marko/debug/dom": a non-optimized compile emits
  // `require("marko/debug/dom")` in the template, and the runtime instance that
  // initEmbedded()/run() drive has to be the same module instance the template
  // registered its scripts into. ("marko/dom" is a different instance whose
  // resume registry would be empty, so resume would silently do nothing.)
  const { run, initEmbedded } = browser.require<{
    run: () => void;
    initEmbedded: (readyId: string, runtimeId?: string) => void;
  }>("marko/debug/dom");

  // Register the template (dom) in the browser context. Its top-level _script()
  // calls register the event-binding scripts into the runtime's resume registry.
  browser.require(counterPath);

  // Write the server HTML into the document. The inline bootstrap script runs as
  // it is parsed, populating window.M (the resume registry) and indexing the
  // comment markers.
  const flushNext = browser.stream(chunks);
  flushNext();

  // Resume. Marko 6.1.x will NOT run a render's resume effects until every
  // template named in that render's boundary (window.M[renderId].b) has been
  // marked "ready". In a real build the bundler-generated client entry does this
  // as each template chunk loads; under @marko/compiler/register there is no such
  // entry, so we do it ourselves. initEmbedded(entryId, runtimeId) marks the
  // boundary ready and then calls init(runtimeId). The boundary lists only the
  // ENTRY template (the one passed to render()); marking it ready resumes the
  // whole tree, including any imported child components. runtimeId is "M"
  // (Marko's default) since the server render did not set a custom one.
  const M = (window as unknown as { M: Record<string, { b: Record<string, 1> }> }).M;
  const renderId = Object.keys(M)[0];
  const entryId = Object.keys(M[renderId].b)[0];
  initEmbedded(entryId, "M");

  const count = () =>
    document.querySelector('[data-testid="count"]')?.textContent;

  // Resumed from the server render: count is 0, not re-rendered from scratch.
  expect(count()).toBe("0");

  // The proof: clicking works, which means resume attached the onClick handler.
  const button = document.querySelector(
    '[data-testid="increment"]',
  ) as HTMLButtonElement;
  button.click();
  run();
  await flushScheduler();

  expect(count()).toBe("1");
});