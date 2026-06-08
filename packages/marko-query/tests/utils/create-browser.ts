// Ported (trimmed) from Marko's own runtime-tags test harness:
//   runtime-tags/src/__tests__/utils/create-browser.ts
//
// Wraps jsdom-context-require's createBrowser with the exact scheduler
// polyfills Marko needs (the same rAF + MessageChannel polyfills as
// tests/setup.ts) and a stream() helper that writes server-rendered HTML
// chunks into the jsdom document (handling the %%FLUSH%% streaming markers).
//
// The async-ordering machinery (__RESOLVE_STATE__) from the original is
// dropped — the Tier 2a counter fixture is synchronous and does not need it.

import { type DOMWindow, VirtualConsole } from "jsdom";
import { createBrowser } from "jsdom-context-require";

export default function (options: Parameters<typeof createBrowser>[0]) {
  // Forward the jsdom context's console output AND uncaught errors to the real
  // console. A bare VirtualConsole swallows them, which hides errors thrown
  // during resume or inside event handlers. jsdom 27 removed VirtualConsole's
  // sendTo(), so we attach event listeners instead. ("jsdomError" is where
  // uncaught in-page errors land.)
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