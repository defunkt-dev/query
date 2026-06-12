// Ported (trimmed) from Marko's own runtime-tags test harness:
//   runtime-tags/src/__tests__/utils/create-browser.ts
//
// Wraps jsdom-context-require's createBrowser with the exact scheduler polyfills Marko needs
// (the same rAF + MessageChannel polyfills as tests/setup.ts) and a stream() helper that writes
// server-rendered HTML chunks into the jsdom document (handling the %%FLUSH%% streaming markers).
//
// The async-ordering machinery (__RESOLVE_STATE__) from the original is dropped -- the fixtures
// here drive their own flushing.

import { createRequire } from "node:module";
import { join } from "node:path";

import { type DOMWindow, VirtualConsole } from "jsdom";
import { createBrowser } from "jsdom-context-require";

// --- module resolution fix -------------------------------------------------------------------
// jsdom-context-require's bundled resolver (dist/resolve) resolves bare packages with
// resolve.exports under browser conditions. In a pnpm / workspace checkout that picks an entry
// for packages like @tanstack/query-core that may not be built locally, so resolution returns
// nothing and the require throws "Cannot find module '@tanstack/query-core'". Route resolution
// through Node instead -- the algorithm the rest of the toolchain already uses (require/node
// conditions, real pnpm symlinks) -- with a .ts fallback for the tags' relative qc-bus import,
// and fall back to the bundled resolver for anything Node cannot resolve (it handles the .marko
// tag-discovery cases). createBrowser reads resolve_1.resolve at call time, so mutating the
// module export before the first createBrowser call takes effect.
const nodeRequire = createRequire(import.meta.url);
const resolveModule = nodeRequire("jsdom-context-require/dist/resolve") as {
  resolve: (id: string, from: string, extensions: string[]) => string | undefined;
};
const bundledResolve = resolveModule.resolve;
resolveModule.resolve = (id, from, extensions) => {
  const localRequire = createRequire(join(from, "__resolver__.js"));
  try {
    return localRequire.resolve(id);
  } catch {
    /* try the fallbacks below */
  }
  if (id[0] === "." && !id.endsWith(".ts")) {
    try {
      return localRequire.resolve(id + ".ts");
    } catch {
      /* not a .ts file */
    }
    try {
      return localRequire.resolve(join(id, "index.ts"));
    } catch {
      /* not a .ts dir */
    }
  }
  return bundledResolve(id, from, extensions);
};
// ---------------------------------------------------------------------------------------------

export default function (options: Parameters<typeof createBrowser>[0]) {
  // Forward the jsdom context's console output AND uncaught errors to the real console. A bare
  // VirtualConsole swallows them, which hides errors thrown during resume or inside event
  // handlers. jsdom 27 removed VirtualConsole's sendTo(), so we attach event listeners instead.
  // ("jsdomError" is where uncaught in-page errors land.)
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[jsdom error]", err);
  });
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    virtualConsole.on(method, (...args: unknown[]) => {
      (console[method] as (...a: unknown[]) => void)("[jsdom]", ...args);
    });
  }

  const browser = createBrowser({
    ...options,
    virtualConsole,
  }) as ReturnType<typeof createBrowser> & {
    stream(chunks: string[]): () => boolean;
  };

  const window = browser.window as unknown as DOMWindow & {
    MARKO_DEBUG: boolean;
    MessageChannel: any;
  };

  window.MARKO_DEBUG = true;

  window.MessageChannel = (window as any).MessageChannel = class MessageChannel {
    port1: any;
    port2: any;
    constructor() {
      this.port1 = { onmessage() {} };
      this.port2 = {
        postMessage: () => {
          setImmediate(() => {
            window.queueMicrotask(this.port1.onmessage);
          });
        },
      };
    }
  };

  window.requestAnimationFrame = (() => {
    let queue: FrameRequestCallback[] | undefined;
    return function requestAnimationFrame(fn) {
      if (queue) {
        queue.push(fn);
      } else {
        queue = [fn];
        setTimeout(() => {
          const timestamp = performance.now();
          const batch = queue!;
          queue = undefined;
          for (const fn of batch) {
            fn(timestamp);
          }
        });
      }
      return 0;
    };
  })();

  browser.stream = (chunks) => {
    const { document } = window;
    document.open();

    if (chunks.length > 1) {
      const parsed = document.implementation.createHTMLDocument();
      parsed.write(chunks.join("<!--%%FLUSH%%-->"));
      parsed.doctype?.remove();

      const walker = parsed.createTreeWalker(parsed);
      const targetNodes = new WeakMap<Node, Node>([[parsed, document]]);
      let node: Node | null;

      return () => {
        while ((node = walker.nextNode())) {
          if (
            node.nodeType === 8 /* Node.COMMENT_NODE */ &&
            (node as Comment).data === "%%FLUSH%%"
          ) {
            return true;
          }

          const isScript = (node as Element).tagName === "SCRIPT";
          const clone = document.importNode(node, isScript);
          targetNodes.set(node, clone);
          (targetNodes.get(node.parentNode!) as ParentNode).appendChild(clone);

          if (isScript) {
            walker.nextNode();
          }
        }
        document.close();
        return false;
      };
    }

    return () => {
      if (chunks.length) {
        document.write(chunks[0]);
      }
      document.close();
      return false;
    };
  };

  return browser;
}